// 双浏览器（真实界面）联机交易测试：建房、加入、开局、发起交易、对方接受、双方现金同步
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Page {
  constructor(target) { this.t = target; this.id = 1; this.pending = new Map(); this.errors = []; }
  async connect() {
    this.ws = new WebSocket(this.t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails.text);
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }
  send(method, params = {}) {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async ev(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async until(expr, label, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await this.ev(expr)) return true; } catch { /* 页面跳转中 */ }
      await sleep(200);
    }
    throw new Error(`等待超时：${label}`);
  }
}

const list = await (await fetch(`${CDP}/json/list`)).json();
let pages = list.filter((t) => t.type === 'page' && t.url.includes('3210'));
if (pages.length < 2) {
  await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' });
  await sleep(800);
  const l2 = await (await fetch(`${CDP}/json/list`)).json();
  pages = l2.filter((t) => t.type === 'page' && t.url.includes('3210'));
}
const host = new Page(pages[0]);
const guest = new Page(pages[1]);
await host.connect();
await guest.connect();

// 房主建房
await host.ev("document.querySelector('#nameInput').value='房主甲'");
await host.ev("document.querySelector('#btnCreate').click()");
await host.until("/^[A-Z0-9]{4}$/.test(document.querySelector('#roomCode').textContent.trim())", '房主进入房间');
const code = await host.ev("document.querySelector('#roomCode').textContent.trim()");
console.log(`✅ 房主建房：${code}`);

// 访客加入
await guest.send('Page.navigate', { url: `${BASE}/?room=${code}` });
await guest.until("document.readyState==='complete' && !!document.querySelector('#btnJoin')", '访客页面加载');
await guest.ev("document.querySelector('#nameInput').value='访客乙'");
await guest.ev("document.querySelector('#btnJoin').click()");
await guest.until("document.querySelectorAll('.prow').length>=2", '访客看到两名玩家');
await host.until("document.querySelectorAll('.prow').length>=2", '房主看到两名玩家');
console.log('✅ 访客加入，双方都看到 2 名玩家');

// 开局
await host.ev("document.querySelector('button[data-act=\"start\"]').click()");
await host.until("!!document.querySelector('button[data-ui=\"trade\"]')", '房主进入对局');
await guest.until("!!document.querySelector('button[data-ui=\"trade\"]')", '访客进入对局');
console.log('✅ 开局，双方进入对局');

const cashOf = (p) => p.ev(`(() => {
  const row = [...document.querySelectorAll('.prow')].find(r => r.textContent.includes('(我)'));
  if (!row) return null;
  const m = row.textContent.match(/¥([\\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
})()`);

const hostBefore = await cashOf(host);
const guestBefore = await cashOf(guest);
console.log(`   交易前现金：房主 ¥${hostBefore} / 访客 ¥${guestBefore}`);

// 房主发起交易：给 100 现金
await host.ev("document.querySelector('button[data-ui=\"trade\"]').click()");
await host.until("!!document.querySelector('#tradeSubmit')", '交易窗口');
await host.ev(`(() => {
  const inp = document.querySelector('input[data-cash="give"]');
  inp.value = 100;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(200);
await host.ev("document.querySelector('#tradeSubmit').click()");
console.log('✅ 房主发起 ¥100 交易');

// 访客收到并接受
await guest.until("!!document.querySelector('.trade-ask')", '访客看到交易请求');
await guest.ev("document.querySelector('button[data-act=\"tradeAccept\"]').click()");
console.log('✅ 访客点了接受');

// 双方现金同步
await host.until(`(() => {
  const row = [...document.querySelectorAll('.prow')].find(r => r.textContent.includes('(我)'));
  return row && row.textContent.includes('¥${(hostBefore - 100).toLocaleString('zh-CN')}');
})()`, '房主现金减少');
await guest.until(`(() => {
  const row = [...document.querySelectorAll('.prow')].find(r => r.textContent.includes('(我)'));
  return row && row.textContent.includes('¥${(guestBefore + 100).toLocaleString('zh-CN')}');
})()`, '访客现金增加');
const hostAfter = await cashOf(host);
const guestAfter = await cashOf(guest);
if (hostAfter !== hostBefore - 100 || guestAfter !== guestBefore + 100) {
  throw new Error(`现金不对：房主 ${hostBefore}->${hostAfter}，访客 ${guestBefore}->${guestAfter}`);
}
console.log(`✅ 交易后现金：房主 ¥${hostAfter} / 访客 ¥${guestAfter}`);

// 双方日志都有交易记录
await host.until("document.querySelector('#logBody').textContent.includes('交易达成')", '房主日志');
await guest.until("document.querySelector('#logBody').textContent.includes('交易达成')", '访客日志');
console.log('✅ 双方日志都记录了交易');

if (host.errors.length || guest.errors.length) {
  console.error('运行时错误：', host.errors, guest.errors);
  process.exit(1);
}
console.log('\n🎉 双浏览器联机交易测试通过');
process.exit(0);

