// 双浏览器 P2P 测试：验证「房主浏览器当主机」这条链路（GitHub Pages 模式）
const CDP = process.env.CDP || 'http://127.0.0.1:9223';
const BASE = process.env.BASE || 'http://127.0.0.1:3211';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

class Page {
  constructor(target) {
    this.target = target;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      }
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

  async until(expr, label, timeout = 20000) {
    const t0 = Date.now();
    let lastErr = null;
    while (Date.now() - t0 < timeout) {
      try {
        if (await this.ev(expr)) return true;
      } catch (e) { lastErr = e; }
      await sleep(200);
    }
    throw new Error(`等待超时：${label}${lastErr ? ' / ' + lastErr.message : ''}`);
  }
}

function assert(c, m) { if (!c) throw new Error('断言失败：' + m); }

const list = await (await fetch(`${CDP}/json/list`)).json();
const MATCH = process.env.MATCH || '3211';
let pages = list.filter((t) => t.type === 'page' && t.url.includes(MATCH));
if (pages.length < 2) {
  // headless 启动时只接受一个页面，这里再开一个标签页
  await fetch(`${CDP}/json/new?${encodeURIComponent(`${BASE}/`)}`, { method: 'PUT' });
  await sleep(800);
  const list2 = await (await fetch(`${CDP}/json/list`)).json();
  pages = list2.filter((t) => t.type === 'page' && t.url.includes(MATCH));
}
if (pages.length < 2) throw new Error(`需要 2 个页面，实际 ${pages.length}`);

const host = new Page(pages[0]);
const guest = new Page(pages[1]);
await host.connect();
await guest.connect();
console.log('✅ 两个浏览器页面已连接');

// 确认走的是 P2P 模式（没有 /api）
await host.until("document.querySelector('#startHint')?.textContent.includes('WebRTC')", '识别 WebRTC 模式');
const hint = await host.ev("document.querySelector('#startHint').textContent");
assert(hint.includes('WebRTC'), `应提示 WebRTC 模式，实际：${hint}`);
console.log('✅ 识别为纯静态托管，使用 WebRTC 模式');

// 房主建房
await host.ev("document.querySelector('#nameInput').value = '房主甲'");
await host.ev("document.querySelector('#btnCreate').click()");
await host.until("document.querySelector('#start').classList.contains('hidden')", '房主进入房间');
await host.until("document.querySelector('#roomCode').textContent.trim().length === 4", '拿到房间码');
const code = await host.ev("document.querySelector('#roomCode').textContent.trim()");
console.log(`✅ 房主建房成功，房间码 ${code}（PeerJS 信令已连通）`);

// 访客进入
await guest.send('Page.navigate', { url: `${BASE}/?room=${code}` });
await guest.until("document.readyState === 'complete' && !!document.querySelector('#btnJoin')", '访客页面加载');
await guest.ev("document.querySelector('#nameInput').value = '访客乙'");
await guest.ev("document.querySelector('#btnJoin').click()");
await guest.until("document.querySelectorAll('.prow').length >= 2", '访客看到两名玩家');
console.log('✅ 访客已加入，双方数据同步');

await host.until("document.querySelectorAll('.prow').length >= 2", '房主看到两名玩家');
console.log('✅ 房主也收到访客加入');

// 开局
await host.until("!!document.querySelector('button[data-act=\"start\"]') && !document.querySelector('button[data-act=\"start\"]').disabled", '开局按钮可用');
await host.ev("document.querySelector('button[data-act=\"start\"]').click()");
await guest.until("document.querySelector('#logBody').textContent.includes('游戏开始')", '访客收到开局');
console.log('✅ 开局同步到访客');

// 房主掷骰，访客应看到同样的点数
await sleep(600); // 避开点击节流
await host.ev("document.querySelector('button[data-act=\"roll\"]').click()");
await guest.until("document.querySelector('#logBody').textContent.includes('掷出')", '访客收到掷骰结果');
const hostDice = await host.ev("Array.from(document.querySelectorAll('.die')).map(d => d.querySelectorAll('.pip.on').length).join(',')");
const guestDice = await guest.ev("Array.from(document.querySelectorAll('.die')).map(d => d.querySelectorAll('.pip.on').length).join(',')");
assert(hostDice === guestDice, `骰子不同步：房主 ${hostDice} / 访客 ${guestDice}`);
console.log(`✅ 掷骰结果实时同步：${hostDice}`);

// 访客聊天，房主应收到
await guest.ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
await guest.ev("document.querySelector('#chatInput').value = 'P2P 聊天测试'");
await guest.ev("document.querySelector('#chatForm').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}))");
await host.ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
await host.until("document.querySelector('#logBody').textContent.includes('P2P 聊天测试')", '房主收到聊天');
console.log('✅ 双向消息通道正常');

if (errors.length) {
  console.error('运行时错误：');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('\n🎉 P2P（房主模式）联机测试全部通过');
process.exit(0);

