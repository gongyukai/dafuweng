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
await sleep(800);
await ev("document.querySelector('.tab[data-tab=\"log\"]').click()");
await sleep(200);
await ev(`(() => {
  const S = window.__dmj;
  const room = S.net.host.room;
  const other = room.players.find((p) => p.id !== S.me);
  for (let i = 0; i < 3; i++) {
    room.chatSeq = (room.chatSeq || 0) + 1;
    room.chat.push({ id: room.chatSeq, from: other.id, name: other.name, text: '测试未读消息 ' + (i + 1), t: Date.now() });
  }
  S.net.host.publish();
})()`);
await sleep(500);
const rect = JSON.parse(await ev("(() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height }); })()"));
const clip = { x: rect.x - 12, y: rect.y - 12, width: rect.w + 24, height: rect.h + 24, scale: 3 };
const shot = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync('screenshots/chat-badge.png', Buffer.from(shot.data, 'base64'));
console.log('saved');
process.exit(0);
