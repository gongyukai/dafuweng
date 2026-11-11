// 统计：秘密任务在多少回合达成、占比多少、是否抢在破产/结算之前
import { createRoom, addPlayer, startGame, tickBots } from '../public/game/engine.js';
import { GROUPS } from '../public/game/board.js';

const GAMES = Number(process.argv[2] || 200);
const RAIL_TILES = [5, 15, 25, 35];

function met(room, p) {
  const tiles = Object.keys(room.owners).filter((k) => room.owners[k] === p.id).map(Number);
  switch (p.mission) {
    case 'monopoly':
      return Object.keys(GROUPS).some((g) => GROUPS[g].tiles.every((i) => room.owners[i] === p.id));
    case 'cash':
      return p.cash >= 2200;
    case 'lands':
      return tiles.length >= 8;
    case 'houses':
      return tiles.reduce((s, i) => s + (room.houses[i] || 0), 0) >= 3;
    case 'rails':
      return RAIL_TILES.filter((i) => room.owners[i] === p.id).length >= 3;
    default:
      return false;
  }
}

const firstRound = {};
const wins = { mission: 0, bankrupt: 0, settle: 0 };
const winnerMissions = {};
const endRounds = [];

for (let g = 0; g < GAMES; g++) {
  const room = createRoom('MS');
  for (let i = 0; i < 4; i++) addPlayer(room, `B${i}`, { isBot: true });
  startGame(room);
  const done = new Set();
  let steps = 0;
  while (room.phase !== 'ended' && steps < 40000) {
    tickBots(room);
    steps++;
    if (room.phase === 'ended') break;
    for (const p of room.players) {
      if (p.bankrupt || !p.mission || done.has(p.id)) continue;
      if (room.round >= 5 && met(room, p)) {
        done.add(p.id);
        (firstRound[p.mission] = firstRound[p.mission] || []).push(room.round);
      }
    }
  }
  endRounds.push(room.round);
  if (room.missionWin) {
    wins.mission++;
    const p = room.players.find((x) => x.id === room.missionWin);
    winnerMissions[p.mission] = (winnerMissions[p.mission] || 0) + 1;
  } else if (room.players.filter((p) => !p.bankrupt).length === 1) {
    wins.bankrupt++;
  } else {
    wins.settle++;
  }
}

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

console.log(`样本：${GAMES} 局，4 个电脑玩家`);
console.log(`结局：任务胜利 ${wins.mission}（${Math.round(wins.mission / GAMES * 100)}%），破产 ${wins.bankrupt}，50 回合结算 ${wins.settle}`);
console.log(`平均结束回合：${avg(endRounds).toFixed(1)}（中位数 ${median(endRounds)}）`);
console.log('');
console.log('各任务首次达成回合：');
for (const [m, arr] of Object.entries(firstRound)) {
  console.log(`  ${m.padEnd(9)} 样本 ${String(arr.length).padStart(4)}  中位 ${String(median(arr)).padStart(3)}  最早 ${Math.min(...arr)}`);
}
console.log('');
console.log('以任务获胜的类型分布：', winnerMissions);

