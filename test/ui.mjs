// 用 Chrome DevTools Protocol 驱动真实浏览器：点按钮、读 DOM、截图、抓异常
import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || '3210';

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes(TARGET));
if (!page) throw new Error('找不到目标页面');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 1;
const pending = new Map();
const errors = [];
fs.mkdirSync('shots', { recursive: true });

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Runtime.enable');

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(expr, label, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await ev(expr)) return true;
    await sleep(150);
  }
  throw new Error(`等待超时：${label}`);
}

function assert(cond, msg) { if (!cond) throw new Error('断言失败：' + msg); }

// 1. 棋盘渲染
await until("document.querySelectorAll('.tile').length === 40", '40 个格子');
const tiles = await ev("document.querySelectorAll('.tile').length");
const players = await ev("document.querySelectorAll('.prow').length");
assert(tiles === 40, `应有 40 格，实际 ${tiles}`);
assert(players === 4, `应有 4 名玩家，实际 ${players}`);
console.log(`✅ 棋盘渲染：${tiles} 格 / ${players} 名玩家`);

const meTokens = await ev("document.querySelectorAll('.tk').length");
assert(meTokens >= 1, `棋盘上应有棋子，实际 ${meTokens} 个`);
const sizesEqual = await ev("(() => { const t=[...document.querySelectorAll('.tk')].map(x=>x.getBoundingClientRect().width); return Math.max(...t)-Math.min(...t) < 1; })()");
assert(sizesEqual, '所有棋子大小应一致');
console.log('✅ 所有棋子等大、无额外高亮');

// 2. 大厅：选棋子后开始
const hasStart = await ev("!!document.querySelector('button[data-act=\"start\"]')");
if (hasStart) {
  const pieces = await ev("document.querySelectorAll('.piece-opt').length");
  assert(pieces >= 12, `棋子数量应 >= 12，实际 ${pieces}`);
  const rounds = await ev("document.querySelectorAll('[data-act=\"setRounds\"]').length");
  assert(rounds === 3, `回合选择应有 3 项，实际 ${rounds}`);
  const missionDefaultOff = await ev("document.querySelector('[data-act=\"setMissions\"][data-enabled=\"0\"]')?.classList.contains('on')");
  assert(missionDefaultOff, '秘密任务默认应为关闭');
  // 回合数选择
  await ev("document.querySelector('[data-act=\"setRounds\"][data-rounds=\"20\"]').click()");
  await sleep(400);
  const chosenRounds = await ev("window.__dmj.view.roundLimit");
  assert(chosenRounds === 20, `回合数应该能选到 20（实际 ${chosenRounds}）`);
  await ev("document.querySelector('[data-act=\"setMissions\"][data-enabled=\"1\"]').click()");
  await sleep(300);
  await ev("document.querySelectorAll('.piece-opt')[2].click()");
  await sleep(400);
  console.log(`✅ 棋子选择器：${pieces} 种可选，回合数 ${rounds} 档`);
  await ev("document.querySelector('button[data-act=\"start\"]').click()");
  await until("!!document.querySelector('button[data-act=\"roll\"]')", '开局后的掷骰按钮', 30000);
  await until("!!document.querySelector('.mission-card')", '秘密任务卡');
  console.log('✅ 大厅开始游戏，秘密任务已下发');

  // 隐藏房主面板：输入 dafuweng
  await ev("(() => { for (const ch of 'laoban') document.dispatchEvent(new KeyboardEvent('keydown', { key: ch })); })()");
  await until("!!document.querySelector('.host-chips')", '隐藏房主面板');
  const targetId = await ev("window.__dmj.view.players.find((p) => p.id !== window.__dmj.me).id");
  await ev(`(() => { const S = window.__dmj; const room = S.net.host.room; const t = room.players.find((p) => p.id === ${JSON.stringify(targetId)}); t.mission = 'lands'; t.missionTarget = 99; t.missionText = '拥有 99 块地产'; t.missionRewardBase = 600; S.net.host.publish(); })()`);
  await sleep(300);
  await ev(`document.querySelector('.host-chip[data-id="${targetId}"]').click()`);
  await sleep(300);
  const beforeCash = await ev(`window.__dmj.view.players.find((p) => p.id === ${JSON.stringify(targetId)}).cash`);
  await ev("document.querySelector('.host-acts [data-host=\"cash\"][data-amount=\"1000\"]').click()");
  await sleep(500);
  const afterCash = await ev(`window.__dmj.view.players.find((p) => p.id === ${JSON.stringify(targetId)}).cash`);
  assert(afterCash === beforeCash + 1000, `房主加钱生效（${beforeCash} → ${afterCash}）`);
  // 改土地归属
  await ev("document.querySelector('[data-host=\"land\"]').click()");
  await until("!!document.querySelector('.host-tiles')", '土地面板');
  await ev("document.querySelector('.host-tile[data-tile=\"1\"]').click()");
  await sleep(500);
  const owner = await ev("window.__dmj.view.owners[1]");
  assert(owner === targetId, '房主可以改土地归属');
  await ev("document.querySelector('[data-host=\"back\"]').click()");
  await sleep(200);
  // 传送
  await ev("document.querySelector('[data-host=\"tpview\"]').click()");
  await until("!!document.querySelector('.host-tiles')", '传送面板');
  await ev("document.querySelector('.host-tile[data-tile=\"5\"]').click()");
  await sleep(500);
  const pos = await ev(`window.__dmj.view.players.find((p) => p.id === ${JSON.stringify(targetId)}).pos`);
  assert(pos === 5, `房主可以传送（落点 ${pos}）`);
  await ev("document.querySelector('#modalClose').click()");
  console.log('✅ 隐藏房主面板可用（加钱 + 改土地 + 传送）');

  // 长按入口：限 10 次，用一次要提示剩余
  await ev("document.querySelector('.brand').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  await sleep(1800);
  await until("!!document.querySelector('.alt-hint')", '长按入口面板', 5000);
  const altBefore = await ev("window.__dmj.view.altUses");
  await ev("document.querySelector('.host-acts [data-host=\"cash\"][data-amount=\"1000\"]').click()");
  await sleep(600);
  const altAfter = await ev("window.__dmj.view.altUses");
  assert(altAfter === altBefore - 1, `长按入口消耗一次（${altBefore} → ${altAfter}）`);
  await ev("document.querySelector('#modalClose').click()");
  console.log('✅ 长按入口触发，剩余次数会递减');
}

// 3. 掷骰子
const hasRoll = await ev("!!document.querySelector('button[data-act=\"roll\"]')");
assert(hasRoll, '没有掷骰子按钮');
await ev("document.querySelector('button[data-act=\"roll\"]').click()");
// 立刻开始采样，避免等字幕时棋子已经走完
const anim = JSON.parse(await ev(`(async () => {
  const el = document.querySelector('.tk.me') || document.querySelector('.tk');
  const seen = new Set();
  let sawDice = false;
  for (let i = 0; i < 30; i++) {
    if (el) seen.add(el.style.transform);
    if (document.querySelector('#subtitle').textContent.includes('掷出')) sawDice = true;
    await new Promise((r) => setTimeout(r, 55));
  }
  return JSON.stringify({ frames: seen.size, sawDice });
})()`));
assert(anim.frames >= 2, `棋子应有逐格移动动画，实际位置变化 ${anim.frames} 次`);
console.log(`✅ 棋子移动动画：${anim.frames} 个中间位置`);
if (!anim.sawDice) await until("document.querySelector('#subtitle').textContent.includes('掷出')", '行动字幕', 20000);
console.log('✅ 行动字幕显示：' + (await ev("document.querySelector('#subtitle').textContent")));
await until("document.querySelector('#logBody').textContent.includes('掷出')", '掷骰日志');

// 3. 处理可能的购买 / 结束回合，直到轮换到电脑
const phase = await ev("document.querySelector('.act-head h3')?.textContent || ''");
if (phase.includes('购买')) {
  await ev("document.querySelector('button[data-act=\"pass\"]').click()");
  console.log('✅ 放弃购买按钮生效');
}
const endBtn = await ev("!!document.querySelector('button[data-act=\"end\"]')");
if (endBtn) {
  await ev("document.querySelector('button[data-act=\"end\"]').click()");
  console.log('✅ 结束回合按钮生效');
}
await sleep(1200);

// 交易弹窗（把回合切回自己，交易只能在自己回合发起）
await ev(`(() => { const S = window.__dmj; const room = S.net.host.room; room.turn = room.players.findIndex((p) => p.id === S.me); room.phase = 'end'; room.turnStartedAt = Date.now(); S.net.host.publish(); })()`);
await sleep(400);
const hasTrade = await ev("!!document.querySelector('button[data-ui=\"trade\"]')");
assert(hasTrade, '应有发起交易按钮');
await ev("document.querySelector('button[data-ui=\"trade\"]').click()");
await until("!!document.querySelector('.trade-cols')", '交易弹窗');
const tradeCols = await ev("document.querySelectorAll('.trade-col').length");
assert(tradeCols === 2, `交易弹窗应有两栏，实际 ${tradeCols}`);
// 价值差超过 100 时禁止提交
await ev("(() => { const i = document.querySelector('input[data-cash=\"give\"]'); i.value = '200'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
await sleep(200);
const overDiff = await ev("document.querySelector('.trade-diff')?.textContent || ''");
assert(overDiff.includes('200'), '交易弹窗显示价值差');
assert(await ev("document.querySelector('#tradeSubmit').disabled"), '价值差超过 100 时不能提交');
await ev("(() => { const i = document.querySelector('input[data-cash=\"give\"]'); i.value = '100'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
await sleep(200);
assert(!(await ev("document.querySelector('#tradeSubmit').disabled")), '价值差 100 时可以提交');
await ev("document.querySelector('#tradeClose').click()");
console.log('✅ 交易弹窗可打开，价值差限制生效');

// 道具栏（需要 ?dev=1）
if (await ev("!!window.__dmj")) {
  await ev(`(() => {
    const S = window.__dmj;
    const room = S.net.host.room;
    const me = room.players.find((p) => p.id === S.me);
    room.turn = room.players.indexOf(me);
    room.phase = 'roll';
    room.pendingBuy = null;
    me.items = ['dice', 'shield'];
    S.net.host.publish();
  })()`);
  await until("document.querySelectorAll('.item-btn').length === 2", '道具栏');
  await ev("document.querySelector('.item-btn[data-item=\"dice\"]').click()");
  await until("document.querySelectorAll('.dice-pick').length === 11", '遥控骰子弹窗');
  await ev("document.querySelector('#modalClose').click()");
  console.log('✅ 道具栏与遥控骰子弹窗');
}

// 4. 机器人自动行动
const turnText = await ev("document.querySelector('.act-msg')?.textContent || ''");
console.log(`✅ 回合推进：${turnText.trim()}`);

// 5. 聊天
await ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
await ev("document.querySelector('#chatInput').value = '测试消息'");
await ev("document.querySelector('#chatForm').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}))");
await until("document.querySelector('#logBody').textContent.includes('测试消息')", '聊天消息');
console.log('✅ 聊天发送并在列表显示');

// 6. 规则弹窗
await ev("document.querySelector('#btnRules').click()");
await until("!document.querySelector('#modal').classList.contains('hidden')", '规则弹窗');
console.log('✅ 规则弹窗打开');

// 筹钱面板（需要 ?dev=1）
if (await ev("!!window.__dmj")) {
  await ev(`(() => {
    const S = window.__dmj;
    const room = S.net.host.room;
    const me = room.players.find((p) => p.id === S.me);
    room.turn = room.players.indexOf(me);
    room.debt = { payerId: me.id, amount: 800, creditorId: null, resume: 'end' };
    room.phase = 'debt';
    S.net.host.publish();
  })()`);
  await until("document.querySelector('#action .act-head h3')?.textContent.includes('筹钱')", '筹钱面板');
  const hasBtn = await ev("!!document.querySelector('[data-act=\"declareBankrupt\"]')");
  assert(hasBtn, '筹钱面板要有宣告破产按钮');
  console.log('✅ 筹钱面板与宣告破产按钮');
}

// 免租卡询问面板（需要 ?dev=1）
if (await ev("!!window.__dmj")) {
  await ev(`(() => {
    const S = window.__dmj;
    const room = S.net.host.room;
    const me = room.players.find((p) => p.id === S.me);
    const other = room.players.find((p) => p.id !== S.me);
    room.debt = null;
    room.owners[1] = other.id;
    room.rentChoice = { payerId: me.id, ownerId: other.id, tile: 1, amount: 50 };
    room.phase = 'rent';
    S.net.host.publish();
  })()`);
  await until("!!document.querySelector('[data-act=\"useShield\"]') && !!document.querySelector('[data-act=\"payRent\"]')", '免租卡询问');
  await ev("document.querySelector('[data-act=\"payRent\"]').click()");
  await sleep(300);
  console.log('✅ 免租卡询问面板（使用 / 付租）');
}

// 聊天未读红点（需要 ?dev=1）
if (await ev("!!window.__dmj")) {
  await ev("document.querySelector('.tab[data-tab=\"log\"]').click()");
  await sleep(200);
  await ev(`(() => {
    const S = window.__dmj;
    const room = S.net.host.room;
    const other = room.players.find((p) => p.id !== S.me);
    room.chatSeq = (room.chatSeq || 0) + 1;
    room.chat.push({ id: room.chatSeq, from: other.id, name: other.name, text: '未读测试', t: Date.now() });
    S.net.host.publish();
  })()`);
  await until("!!document.querySelector('.tab[data-tab=\"chat\"] .unread-badge')", '未读红点', 5000);
  const badge = await ev("document.querySelector('.tab[data-tab=\"chat\"] .unread-badge').textContent");
  assert(badge === '1', `未读数应为 1，实际 ${badge}`);
  await ev("document.querySelector('.tab[data-tab=\"chat\"]').click()");
  await sleep(300);
  const gone = await ev("!document.querySelector('.unread-badge')");
  assert(gone, '进入聊天后红点应消失');
  console.log('✅ 聊天未读红点（1 条，进入后清除）');
}
await ev("document.querySelector('#modalClose').click()");

// 7. 截图
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('shots/playing.png', Buffer.from(shot.data, 'base64'));
console.log('✅ 截图已保存 shots/playing.png');

// 8. 手机布局
await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 896, deviceScaleFactor: 2, mobile: true });
await sleep(600);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('shots/mobile.png', Buffer.from(shot2.data, 'base64'));
console.log('✅ 手机截图已保存 shots/mobile.png');

if (errors.length) {
  console.error('运行时错误：');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('\n🎉 UI 交互测试全部通过，无运行时异常');
ws.close();
process.exit(0);
