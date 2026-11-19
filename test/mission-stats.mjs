// 统计：秘密任务在多少回合达成、完成率多少（按人数）
import { createRoom, addPlayer, startGame, tickBots } from '../public/game/engine.js';

const GAMES = Number(process.argv[2] || 200);
const PLAYERS = Number(process.argv[3] || 4);

const firstRound = {};
const assigned = {};

for (let g = 0; g < GAMES; g++) {
  const room = createRoom('MS');
  room.missionsEnabled = true;
  for (let i = 0; i < PLAYERS; i++) addPlayer(room, `B${i}`, { isBot: true });
  startGame(room);
  for (const p of room.players) assigned[p.mission] = (assigned[p.mission] || 0) + 1;
  const done = new Set();
  let steps = 0;
  while (room.phase !== 'ended' && steps < 50000) {
    tickBots(room);
    steps++;
    for (const p of room.players) {
      if (p.missionDone && !done.has(p.id)) {
        done.add(p.id);
        (firstRound[p.mission] = firstRound[p.mission] || []).push(room.round);
      }
    }
  }
}

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log(`样本：${GAMES} 局，${PLAYERS} 个电脑玩家`);
console.log(`各任务完成情况（${PLAYERS} 人局）：`);
for (const m of Object.keys(assigned)) {
  const arr = firstRound[m] || [];
  const rate = Math.round((arr.length / assigned[m]) * 100);
  console.log(`  ${m.padEnd(10)} 分配 ${String(assigned[m]).padStart(4)}  完成 ${String(arr.length).padStart(4)}（${String(rate).padStart(3)}%）  中位 ${arr.length ? median(arr) : '-'} 回合`);
}
