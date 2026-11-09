// 自动打若干回合，拍一张有地产、有房子的成品截图
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

for (let round = 0; round < 400; round++) {
  let acted = false;
  if (await click('button[data-act="roll"]')) acted = true;
  else if (await ev("!!document.querySelector('button[data-act=\"buy\"]')")) {
    // 只买六成，留些地给电脑凑同色，棋盘才好看
    const buy = Math.random() < 0.6;
    acted = await click(`button[data-act="${buy ? 'buy' : 'pass'}"]`);
  } else if (await ev(`(() => {
      const b = [...document.querySelectorAll('button[data-act="build"]')].find(x => !x.disabled);
      if (!b) return false; b.click(); return true;
    })()`)) acted = true;
  else if (await click('button[data-act="end"]')) acted = true;

  await sleep(acted ? 150 : 420);
  if (await ev("document.querySelector('.over-card') !== null")) break;
}

await sleep(900);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync('screenshots', { recursive: true });
fs.writeFileSync('screenshots/board.png', Buffer.from(shot.data, 'base64'));

const stats = await ev(`({
  props: document.querySelectorAll('.tile.owned').length,
  houses: document.querySelectorAll('.houses').length,
  round: document.querySelector('.round-line')?.textContent,
  phase: document.querySelector('.act-head h3')?.textContent
})`);
console.log('截图完成:', JSON.stringify(stats));
process.exit(0);
