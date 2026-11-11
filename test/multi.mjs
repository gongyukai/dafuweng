// 多人联机（HTTP/SSE）端到端测试：6 人房间、权限、交易、重连、满员
const BASE = process.env.BASE || 'http://127.0.0.1:3210';

let passed = 0;
function expect(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
  passed++;
  console.log('  ✓ ' + msg);
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch { /* ignore */ }
  return { status: r.status, data };
}

function sse(token) {
  const controller = new AbortController();
  let buf = '';
  const decoder = new TextDecoder();
  let reader = null;
  const ready = fetch(`${BASE}/api/stream?token=${encodeURIComponent(token)}`, { signal: controller.signal })
    .then((r) => { reader = r.body.getReader(); });
  async function next(timeout = 5000) {
    await ready;
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const idx = buf.indexOf('\n\n');
      if (idx >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) return JSON.parse(line.slice(6));
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SSE 结束');
      buf += decoder.decode(value, { stream: true });
    }
    throw new Error('SSE 超时');
  }
  async function waitFor(pred, timeout = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const s = await next(timeout);
      if (pred(s)) return s;
    }
    throw new Error('等待状态超时');
  }
  return { next, waitFor, close: () => controller.abort() };
}

console.log('\n建房与加入');
const a = await post('/api/create', { name: '房主A' });
expect(a.status === 200, '创建房间');
const code = a.data.code;
const tokens = { A: a.data.token };
const ids = { A: a.data.playerId };
for (const n of ['B', 'C', 'D', 'E', 'F']) {
  const r = await post('/api/join', { code, name: `玩家${n}` });
  expect(r.status === 200, `${n} 加入`);
  tokens[n] = r.data.token;
  ids[n] = r.data.playerId;
}
const full = await post('/api/join', { code, name: '迟到G' });
expect(full.status === 400 && /满/.test(full.data.err), '第 7 人被拒绝（房间已满）');

console.log('\n开局权限');
const notHost = await post('/api/act', { token: tokens.B, action: { type: 'start' } });
expect(notHost.status === 400, '非房主不能开局');
const started = await post('/api/act', { token: tokens.A, action: { type: 'start' } });
expect(started.status === 200, '房主开局成功');
const late = await post('/api/join', { code, name: '迟到H' });
expect(late.status === 400 && /开始/.test(late.data.err), '开局后不能加入');

console.log('\n多客户端同步');
const sa = sse(tokens.A);
const sb = sse(tokens.B);
const sc = sse(tokens.C);
const stA = await sa.next();
expect(stA.players.length === 6, '房主看到 6 名玩家');
expect(stA.phase === 'roll' && stA.turnId === ids.A, '轮到房主 A');
const wrongTurn = await post('/api/act', { token: tokens.B, action: { type: 'roll' } });
expect(wrongTurn.status === 400, '不是自己的回合不能掷骰');

const rolled = await post('/api/act', { token: tokens.A, action: { type: 'roll' } });
expect(rolled.status === 200, 'A 掷骰成功');
let sA = await sa.waitFor((s) => s.dice[0] > 0);
let sB = await sb.waitFor((s) => s.dice[0] > 0);
let sC = await sc.waitFor((s) => s.dice[0] > 0);
expect(JSON.stringify(sA.dice) === JSON.stringify(sB.dice) && JSON.stringify(sA.dice) === JSON.stringify(sC.dice),
  '三个客户端看到的骰子一致');

// 处理可能的购买提示
if (sA.phase === 'buy') {
  const pass = await post('/api/act', { token: tokens.A, action: { type: 'pass' } });
  expect(pass.status === 200, 'A 放弃购买');
  sA = await sa.waitFor((s) => s.phase !== 'buy');
}
const ended = await post('/api/act', { token: tokens.A, action: { type: 'end' } });
expect(ended.status === 200, 'A 结束回合');
sB = await sb.waitFor((s) => s.turnId === ids.B);
expect(sB.turnId === ids.B, '回合推进到 B（所有客户端同步）');

console.log('\n聊天广播');
const chat = await post('/api/act', { token: tokens.C, action: { type: 'chat', text: '多人测试消息' } });
expect(chat.status === 200, 'C 发送聊天');
const chatSeen = await sa.waitFor((s) => s.chat.some((c) => c.text === '多人测试消息'));
expect(!!chatSeen, 'A 收到 C 的聊天');

console.log('\n玩家间交易');
const cashBefore = { A: sA.players.find((p) => p.id === ids.A).cash, B: sA.players.find((p) => p.id === ids.B).cash };
const offer = await post('/api/act', {
  token: tokens.A,
  action: { type: 'tradeOffer', toId: ids.B, giveCash: 100, getCash: 0, giveTiles: [], getTiles: [] },
});
expect(offer.status === 200, 'A 向 B 发起 ¥100 交易');
const offerSeen = await sb.waitFor((s) => !!s.trade);
expect(offerSeen.trade.fromId === ids.A && offerSeen.trade.toId === ids.B, 'B 收到交易请求');
const accept = await post('/api/act', { token: tokens.B, action: { type: 'tradeAccept', id: offerSeen.trade.id } });
expect(accept.status === 200, 'B 接受交易');
const afterTrade = await sc.waitFor((s) => s.log.some((l) => l.text.includes('交易达成')));
const cashA = afterTrade.players.find((p) => p.id === ids.A).cash;
const cashB = afterTrade.players.find((p) => p.id === ids.B).cash;
expect(cashA === cashBefore.A - 100 && cashB === cashBefore.B + 100, '第三个客户端看到现金正确变化');

console.log('\n断线重连');
sb.close();
await new Promise((r) => setTimeout(r, 300));
const rejoin = await post('/api/join', { code, name: '玩家B', token: tokens.B });
expect(rejoin.status === 200 && rejoin.data.playerId === ids.B, 'B 用旧 token 重连，座位不变');
const sb2 = sse(tokens.B);
const back = await sb2.next();
expect(back.you === ids.B && back.players.length === 6, '重连后拿到完整状态');

console.log('\n状态一致性');
const s1 = await sa.next();
expect(s1.players.length === 6, '房主仍然看到 6 人');
expect(s1.code === code, '房间码一致');

sa.close(); sb2.close(); sc.close();
console.log(`\n🎉 多人联机测试全部通过（${passed} 项断言）`);
process.exit(0);
