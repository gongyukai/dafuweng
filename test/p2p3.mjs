// 公网 P2P 三人联机：房主 + 两个访客，含访客刷新重连
const CDP = process.env.CDP || 'http://127.0.0.1:9223';
const BASE = process.env.BASE || 'https://gongyukai.github.io/dafuweng';
const MATCH = process.env.MATCH || 'github.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Page {
  constructor(t) { this.t = t; this.id = 1; this.pending = new Map(); this.errors = []; }
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
  async until(expr, label, timeout = 25000) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeout) {
      try { if (await this.ev(expr)) return true; } catch (e) { last = e; }
      await sleep(250);
    }
    throw new Error(`等待超时：${label}${last ? ' / ' + last.message : ''}`);
  }
}

const list = await (await fetch(`${CDP}/json/list`)).json();
let pages = list.filter((t) => t.type === 'page' && t.url.includes(MATCH));
while (pages.length < 3) {
  await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' });
  await sleep(900);
  const l2 = await (await fetch(`${CDP}/json/list`)).json();
  pages = l2.filter((t) => t.type === 'page' && t.url.includes(MATCH));
}
const [p1, p2, p3] = pages.slice(0, 3);
const host = new Page(p1);
const g1 = new Page(p2);
const g2 = new Page(p3);
await host.connect();
await g1.connect();
await g2.connect();

await host.until("document.querySelector('#startHint')?.textContent.includes('WebRTC')", '识别 WebRTC 模式');
console.log('✅ 静态托管，WebRTC 模式');

await host.ev("document.querySelector('#nameInput').value='房主'");
await host.ev("document.querySelector('#btnCreate').click()");
await host.until("/^[A-Z0-9]{4}$/.test(document.querySelector('#roomCode').textContent.trim())", '房主建房');
const code = await host.ev("document.querySelector('#roomCode').textContent.trim()");
console.log(`✅ 房主建房：${code}`);

async function joinGuest(page, name) {
  await page.send('Page.navigate', { url: `${BASE}/?room=${code}` });
  await page.until("document.readyState==='complete' && !!document.querySelector('#btnJoin')", '访客页面加载');
  await page.ev(`document.querySelector('#nameInput').value='${name}'`);
  await page.ev("document.querySelector('#btnJoin').click()");
}

await joinGuest(g1, '访客一');
await g1.until("document.querySelectorAll('.prow').length>=2", '访客一进入');
await joinGuest(g2, '访客二');
await g2.until("document.querySelectorAll('.prow').length>=3", '访客二进入');
await host.until("document.querySelectorAll('.prow').length>=3", '房主看到三人');
console.log('✅ 三人已同步（房主 + 两个访客）');

// 开局
await host.ev("document.querySelector('button[data-act=\"start\"]').click()");
await g1.until("!!document.querySelector('button[data-ui=\"trade\"]')", '访客一进入对局');
await g2.until("!!document.querySelector('button[data-ui=\"trade\"]')", '访客二进入对局');
console.log('✅ 开局同步到两名访客');

// 房主掷骰，两个访客都要看到
await sleep(600);
await host.ev("document.querySelector('button[data-act=\"roll\"]').click()");
await g1.until("document.querySelector('#logBody').textContent.includes('掷出')", '访客一收到掷骰');
await g2.until("document.querySelector('#logBody').textContent.includes('掷出')", '访客二收到掷骰');
const d1 = await g1.ev("document.querySelector('.die') ? [...document.querySelectorAll('.die')].map(d => d.querySelectorAll('.pip.on').length).join(',') : ''");
const d2 = await g2.ev("document.querySelector('.die') ? [...document.querySelectorAll('.die')].map(d => d.querySelectorAll('.pip.on').length).join(',') : ''");
if (d1 !== d2) throw new Error(`两名访客骰子不一致：${d1} vs ${d2}`);
console.log(`✅ 两名访客骰子一致：${d1}`);

// 访客一聊天
await g1.ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
await g1.ev("document.querySelector('#chatInput').value='三人联机测试'");
await g1.ev("document.querySelector('#chatForm').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}))");
await host.ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
await host.until("document.querySelector('#logBody').textContent.includes('三人联机测试')", '房主收到聊天');
await g2.ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
await g2.until("document.querySelector('#logBody').textContent.includes('三人联机测试')", '访客二收到聊天');
console.log('✅ 聊天在三人间同步');

// 访客二刷新重连
await g2.send('Page.navigate', { url: `${BASE}/?room=${code}` });
await g2.until("document.querySelectorAll('.prow').length>=3", '访客二刷新后回到房间');
await host.until("document.querySelectorAll('.prow').length>=3", '房主仍是三人');
const names = await host.ev("[...document.querySelectorAll('.prow .pinfo b')].map(b => b.textContent.replace('(我)','').trim())");
if (names.length !== 3) throw new Error(`重连后人数异常：${names.join('/')}`);
console.log(`✅ 访客刷新后成功重连，房间仍是 3 人：${names.join(' / ')}`);

if (host.errors.length || g1.errors.length || g2.errors.length) {
  console.error('运行时错误：', host.errors, g1.errors, g2.errors);
  process.exit(1);
}
console.log('\n🎉 公网三人 P2P 联机测试通过');
process.exit(0);
