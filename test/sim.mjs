// 机器人压力测试：跑 N 局全 AI 对局，检查规则引擎不崩、能分出胜负、状态合法
import { createRoom, addPlayer, startGame, tickBots, view } from '../public/game/engine.js';
import { BOARD } from '../public/game/board.js';

const GAMES = Number(process.argv[2] || 100);
const MAX_TICKS = 40000;

function checkInvariants(room, tag) {
  for (const p of room.players) {
    if (!Number.isFinite(p.cash) || p.cash < 0) throw new Error(`${tag}: ${p.name} 现金异常 ${p.cash}`);
    if (p.pos < 0 || p.pos >= 40) throw new Error(`${tag}: ${p.name} 位置异常 ${p.pos}`);
    if (!Number.isInteger(p.jailCards) || p.jailCards < 0) throw new Error(`${tag}: 出狱卡异常`);
    if (p.inJail && p.pos !== 10) throw new Error(`${tag}: 监狱状态与位置不一致`);
  }
  for (const [i, ownerId] of Object.entries(room.owners)) {
    const idx = Number(i);
    if (!BOARD[idx]) throw new Error(`${tag}: 非法地产索引 ${i}`);
    if (!room.players.some((p) => p.id === ownerId)) throw new Error(`${tag}: 地产拥有者不存在`);
    const owner = room.players.find((p) => p.id === ownerId);
    if (owner.bankrupt) throw new Error(`${tag}: 破产玩家仍持有地产 ${BOARD[idx].name}`);
    const h = room.houses[idx] || 0;
    if (h < 0 || h > 5) throw new Error(`${tag}: 房屋数异常 ${h}`);
    if (h > 0 && !BOARD[idx].rent) throw new Error(`${tag}: 非地产上有房子`);
  }
}

function runOne(n) {
  const room = createRoom('SIM');
  addPlayer(room, '真人', { isBot: true });
  const bots = 2 + (n % 3);
  for (let i = 0; i < bots; i++) addPlayer(room, `电脑${i}`, { isBot: true });
  startGame(room);
  let ticks = 0;
  while (room.phase !== 'ended' && ticks < MAX_TICKS) {
    const acted = tickBots(room);
    if (!acted) {
      // 机器人没有动作可做（理论上不该发生），强制结束回合避免死循环
      const cur = room.players[room.turn];
      if (!cur || cur.bankrupt) throw new Error(`第 ${n} 局卡死：当前玩家无效`);
      throw new Error(`第 ${n} 局卡死：阶段 ${room.phase} 玩家 ${cur.name} 无动作`);
    }
    ticks++;
    if (ticks % 500 === 0) checkInvariants(room, `第${n}局 tick${ticks}`);
  }
  if (room.phase !== 'ended') throw new Error(`第 ${n} 局超过 ${MAX_TICKS} 步仍未结束`);
  checkInvariants(room, `第${n}局结束`);
  const winners = room.players.filter((p) => !p.bankrupt);
  const v = view(room, winners[0].id);
  if (!v.winnerId) throw new Error(`第 ${n} 局没有胜者`);
  const winner = room.players.find((p) => p.id === v.winnerId);
  if (!winner || winner.bankrupt) throw new Error(`第 ${n} 局胜者无效`);
  if (winners.length === 1 && winner.id !== winners[0].id) throw new Error(`第 ${n} 局胜者不是唯一存活玩家`);
  return { ticks, players: room.players.length, winner: winner.name, alive: winners.length };
}

const t0 = Date.now();
let totalTicks = 0;
let maxTicks = 0;
for (let i = 0; i < GAMES; i++) {
  const r = runOne(i);
  totalTicks += r.ticks;
  maxTicks = Math.max(maxTicks, r.ticks);
}
const ms = Date.now() - t0;
console.log(`✅ ${GAMES} 局全部正常结束`);
console.log(`   平均 ${Math.round(totalTicks / GAMES)} 步/局，最长 ${maxTicks} 步，耗时 ${ms}ms`);
