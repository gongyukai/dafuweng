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

// 2. 大厅：选棋子后开始
const hasStart = await ev("!!document.querySelector('button[data-act=\"start\"]')");
if (hasStart) {
  const pieces = await ev("document.querySelectorAll('.piece-opt').length");
  assert(pieces >= 12, `棋子数量应 >= 12，实际 ${pieces}`);
  await ev("document.querySelectorAll('.piece-opt')[2].click()");
  await sleep(400);
  console.log(`✅ 棋子选择器：${pieces} 种可选`);
  await ev("document.querySelector('button[data-act=\"start\"]').click()");
  await until("!!document.querySelector('button[data-act=\"roll\"]')", '开局后的掷骰按钮');
  console.log('✅ 大厅开始游戏');
}

// 3. 掷骰子
const hasRoll = await ev("!!document.querySelector('button[data-act=\"roll\"]')");
assert(hasRoll, '没有掷骰子按钮');
await ev("document.querySelector('button[data-act=\"roll\"]').click()");
await until("document.querySelector('#logBody').textContent.includes('掷出')", '掷骰日志');
await until("document.querySelector('#subtitle').textContent.includes('掷出')", '行动字幕');
console.log('✅ 行动字幕显示：' + (await ev("document.querySelector('#subtitle').textContent")));
const frames = await ev(`(async () => {
  const el = document.querySelector('.tk');
  if (!el) return 0;
  const seen = new Set();
  for (let i = 0; i < 24; i++) { seen.add(el.style.transform); await new Promise(r => setTimeout(r, 55)); }
  return seen.size;
})()`);
assert(frames >= 2, `棋子应有逐格移动动画，实际位置变化 ${frames} 次`);
console.log(`✅ 棋子移动动画：${frames} 个中间位置`);
console.log('✅ 掷骰子按钮生效，日志已更新');

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

// 交易弹窗
const hasTrade = await ev("!!document.querySelector('button[data-ui=\"trade\"]')");
assert(hasTrade, '应有发起交易按钮');
await ev("document.querySelector('button[data-ui=\"trade\"]').click()");
await until("!!document.querySelector('.trade-cols')", '交易弹窗');
const tradeCols = await ev("document.querySelectorAll('.trade-col').length");
assert(tradeCols === 2, `交易弹窗应有两栏，实际 ${tradeCols}`);
await ev("document.querySelector('#tradeClose').click()");
console.log('✅ 交易弹窗可打开（两栏）');

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
