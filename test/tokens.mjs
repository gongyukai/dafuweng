// 棋子定位回归测试：进监狱（传送）和普通移动后，棋子必须落在正确的格子上
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
const assert = (c, m) => { if (!c) throw new Error('断言失败：' + m); };

// 开始一局
await ev("document.querySelector('button[data-act=\"start\"]')?.click()");
await sleep(600);
assert(await ev("!!window.__dmj"), '需要带 ?dev=1 打开页面');
// 冻结电脑玩家，避免测试期间它自己走动，干扰定位判断
await ev(`(() => { const S = window.__dmj; S.net.host.room.players.forEach((p) => { p.isBot = false; }); })()`);

async function tokenToTileDistance(pid, tileIdx) {
  return ev(`(() => {
    const S = window.__dmj;
    const tk = document.querySelector('.tk[data-pid="${pid}"]');
    const tile = document.querySelector('.tile[data-i="${tileIdx}"]');
    if (!tk || !tile) return -1;
    const a = tk.getBoundingClientRect();
    const b = tile.getBoundingClientRect();
    const dx = (a.left + a.width / 2) - (b.left + b.width / 2);
    const dy = (a.top + a.height / 2) - (b.top + b.height / 2);
    return Math.round(Math.hypot(dx, dy));
  })()`);
}

const pid = await ev("window.__dmj.net.host.room.players[1].id");
const tileSize = await ev("document.querySelector('.tile[data-i=\"0\"]').getBoundingClientRect().width");

// 1. 普通移动：从 0 走到 7
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.pos = 7; S.net.host.publish(); })()`);
await sleep(1300);
let d = await tokenToTileDistance(pid, 7);
assert(d >= 0 && d < tileSize * 0.5, `普通移动后棋子应在 7 号格，偏差 ${d}px`);
console.log(`✅ 普通移动定位正确（偏差 ${d}px）`);

// 2. 传送进监狱：从 7 直接到 10
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.pos = 10; p.inJail = true; S.net.host.publish(); })()`);
await sleep(900);
d = await tokenToTileDistance(pid, 10);
assert(d >= 0 && d < tileSize * 0.5, `入狱后棋子应在监狱格，偏差 ${d}px`);
console.log(`✅ 入狱传送定位正确（偏差 ${d}px）`);

// 2b. 从远处入狱必须直接传送，不能绕棋盘走（旧 bug：38 → 10 被算成走 12 格）
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.inJail = false; p.pos = 38; S.net.host.publish(); })()`);
await sleep(1200);
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.pos = 10; p.inJail = true; S.net.host.publish(); })()`);
await sleep(700);
d = await tokenToTileDistance(pid, 10);
assert(d >= 0 && d < tileSize * 0.5, `远处入狱应立即传送到监狱格，实际偏差 ${d}px`);
console.log(`✅ 远处入狱直接传送（偏差 ${d}px，没有绕圈）`);

// 3. 再从监狱掷到 23（长距离，属于传送范围）
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.pos = 23; p.inJail = false; S.net.host.publish(); })()`);
await sleep(900);
d = await tokenToTileDistance(pid, 23);
assert(d >= 0 && d < tileSize * 0.5, `长距离跳动后应在 23 号格，偏差 ${d}px`);
console.log(`✅ 长距离跳动定位正确（偏差 ${d}px）`);

// 4. 连续移动不应“走完又退回上一格”（旧 bug：动画待处理目标没清空）
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.inJail = false; p.pos = 5; S.net.host.publish(); })()`);
await sleep(1100);
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.pos = 9; S.net.host.publish(); })()`);
await sleep(300);
// 走到一半时再来一次状态更新（模拟其他玩家行动）
await ev("window.__dmj.net.host.publish()");
await sleep(1500);
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room;
  const p = room.players[1]; p.pos = 13; S.net.host.publish(); })()`);
await sleep(1700);
let maxD = 0;
for (let i = 0; i < 10; i++) {
  maxD = Math.max(maxD, await tokenToTileDistance(pid, 13));
  await sleep(100);
}
assert(maxD < tileSize * 0.6, `移动结束后不应回跳，最大偏差 ${maxD}px`);
console.log(`✅ 连续移动无回跳（最大偏差 ${maxD}px）`);

console.log('\n🎉 棋子定位测试全部通过');
process.exit(0);

