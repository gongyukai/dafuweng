// 端到端测试：起服务后验证 建房 → 加入 → 开局 → 掷骰 → SSE 推送
const BASE = process.env.BASE || 'http://127.0.0.1:3210';

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败：' + msg);
}

function openStream(token) {
  const controller = new AbortController();
  const promise = fetch(`${BASE}/api/stream?token=${encodeURIComponent(token)}`, {
    signal: controller.signal,
  });
  return { controller, promise };
}

// 每个 reader 维护自己的解码缓冲，避免把一次 read 里的多条事件丢掉
function sseReader(reader, label = '') {
  const decoder = new TextDecoder();
  let buf = '';
  return async function next(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const idx = buf.indexOf('\n\n');
      if (idx >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) return JSON.parse(line.slice(6));
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error(`SSE 提前结束 ${label}`);
      buf += decoder.decode(value, { stream: true });
    }
    throw new Error(`等待 SSE 状态超时 ${label}`);
  };
}

async function waitFor(next, predicate, timeoutMs = 4000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await next(timeoutMs);
    if (predicate(last)) return last;
  }
  throw new Error('等待状态超时，最后状态：' + JSON.stringify(last && { phase: last.phase, chat: last.chat?.length }));
}

const t0 = Date.now();

// 1. 静态页面
for (const p of ['/', '/style.css', '/js/app.js', '/js/net.js', '/game/engine.js', '/game/board.js']) {
  const r = await fetch(BASE + p);
  assert(r.status === 200, `${p} 应返回 200，实际 ${r.status}`);
}
console.log('✅ 静态资源可访问');

// 2. 建房
const a = await post('/api/create', { name: '测试A' });
assert(a.status === 200 && a.data.code && a.data.token, '创建房间失败：' + JSON.stringify(a.data));
const code = a.data.code;
const tokenA = a.data.token;

// 3. 加入
const b = await post('/api/join', { code, name: '测试B' });
assert(b.status === 200 && b.data.playerId, '加入房间失败：' + JSON.stringify(b.data));
const tokenB = b.data.token;
console.log(`✅ 房间 ${code} 建成，两人已加入`);

// 4. 打开 SSE
const sa = openStream(tokenA);
const sb = openStream(tokenB);
const ra = (await sa.promise).body.getReader();
const rb = (await sb.promise).body.getReader();
const nextA = sseReader(ra, 'A');
const nextB = sseReader(rb, 'B');
let s = await nextA();
assert(s.phase === 'lobby' && s.players.length === 2, 'SSE 初始状态不对');
console.log('✅ SSE 推送正常，初始为大厅');

// 5. 开局（非房主不能开）
const bad = await post('/api/act', { token: tokenB, action: { type: 'start' } });
assert(bad.status === 400, '非房主不应能开局');
const started = await post('/api/act', { token: tokenA, action: { type: 'start' } });
assert(started.status === 200, '开局失败：' + JSON.stringify(started.data));
s = await nextA();
assert(s.phase === 'roll', '开局后应进入掷骰阶段，实际 ' + s.phase);
assert(s.turnId === a.data.playerId, '房主应先行');
console.log('✅ 开局成功，轮到房主');

// 6. 掷骰
const rolled = await post('/api/act', { token: tokenA, action: { type: 'roll' } });
assert(rolled.status === 200, '掷骰失败');
s = await nextA();
assert(s.dice[0] >= 1 && s.dice[1] <= 6, '骰子点数异常：' + JSON.stringify(s.dice));
assert(['roll', 'buy', 'end', 'ended'].includes(s.phase), '掷骰后阶段异常：' + s.phase);
console.log(`✅ 掷骰成功：${s.dice[0]} + ${s.dice[1]}，阶段 ${s.phase}`);

// 7. 断线重连（用旧 token 再 join）
const rejoin = await post('/api/join', { code, name: '测试A', token: tokenA });
assert(rejoin.status === 200 && rejoin.data.playerId === a.data.playerId, '重连应找回同一玩家');
console.log('✅ 断线重连正常');

// 8. 错误动作
const wrong = await post('/api/act', { token: tokenB, action: { type: 'roll' } });
assert(wrong.status === 400, '不该轮到 B 掷骰');
console.log('✅ 回合校验生效');

// 9. 聊天
const chat = await post('/api/act', { token: tokenB, action: { type: 'chat', text: '大家好' } });
assert(chat.status === 200, '聊天失败');
s = await waitFor(nextB, (st) => st.chat.some((c) => c.text === '大家好'));
console.log('✅ 聊天推送正常');

sa.controller.abort();
sb.controller.abort();
console.log(`\n🎉 端到端测试全部通过（${Date.now() - t0}ms）`);
process.exit(0);

