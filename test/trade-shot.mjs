// 打开交易窗口并截图（用于文档与视觉检查）
import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && t.url.includes('3210'));
if (!target) throw new Error('找不到页面');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
};
function send(method, params = {}) {
  const i = id++;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((resolve, reject) => pending.set(i, { resolve, reject }));
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const click = (sel) => ev(`(() => { const b = document.querySelector('${sel}'); if (!b || b.disabled) return false; b.click(); return true; })()`);

// 开局
for (let i = 0; i < 15; i++) { if (await click('button[data-act="start"]')) break; await sleep(250); }
await sleep(500);

// 打一会儿，让双方都有地产
for (let i = 0; i < 90; i++) {
  if (await click('button[data-act="roll"]')) { await sleep(300); continue; }
  if (await ev("!!document.querySelector('button[data-act=\"buy\"]')")) { await click('button[data-act="buy"]'); await sleep(200); continue; }
  if (await ev(`(() => { const b=[...document.querySelectorAll('button[data-act="build"]')].find(x=>!x.disabled); if(!b) return false; b.click(); return true; })()`)) { await sleep(200); continue; }
  if (await click('button[data-act="end"]')) { await sleep(300); continue; }
  await sleep(400);
  if (await ev("!!document.querySelector('.over-card')")) break;
}

// 打开交易
await ev("document.querySelector('button[data-ui=\"trade\"]')?.click()");
await sleep(400);
const open = await ev("!!document.querySelector('.trade-cols')");
if (!open) throw new Error('交易窗口没打开');

// 选两块自己的地、一块对方的地，填现金
const picked = await ev(`(() => {
  const give = [...document.querySelectorAll('.ttile[data-side="give"]:not(:disabled)')];
  give.slice(0, 2).forEach(b => b.click());
  const get = [...document.querySelectorAll('.ttile[data-side="get"]:not(:disabled)')];
  get.slice(0, 1).forEach(b => b.click());
  const inp = document.querySelector('input[data-cash="give"]');
  if (inp) { inp.value = 200; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  return { give: give.length, get: get.length };
})()`);
await sleep(300);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync('screenshots', { recursive: true });
fs.writeFileSync('screenshots/trade.png', Buffer.from(shot.data, 'base64'));
console.log('交易截图已保存，可选地产:', JSON.stringify(picked));
process.exit(0);
