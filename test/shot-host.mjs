import { writeFileSync } from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find((t) => t.type === 'page' && t.url.includes('3210'));
if (!target) throw new Error('no page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
const send = (method, params = {}) => { const i = id++; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((resolve, reject) => pending.set(i, { resolve, reject })); };
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 40; i++) {
  if (await ev("!!document.querySelector('button[data-act=\"start\"]') || !!document.querySelector('button[data-act=\"roll\"]')")) break;
  await sleep(250);
}
if (await ev("!!document.querySelector('button[data-act=\"start\"]')")) {
  await ev("document.querySelectorAll('.piece-opt')[1]?.click()");
  await sleep(300);
  await ev("document.querySelector('button[data-act=\"start\"]').click()");
}
for (let i = 0; i < 40; i++) {
  if (await ev("!!document.querySelector('button[data-act=\"roll\"]')")) break;
  await sleep(250);
}
await ev("(() => { for (const ch of 'laoban') document.dispatchEvent(new KeyboardEvent('keydown', { key: ch })); })()");
await sleep(500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('screenshots/host-panel.png', Buffer.from(shot.data, 'base64'));
console.log('saved');
process.exit(0);
