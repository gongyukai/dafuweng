// 统计收租金额、旅馆数等新任务候选指标的分布
import { createRoom, addPlayer, startGame, tickBots } from '../public/game/engine.js';

const GAMES = Number(process.argv[2] || 120);
const RAILS = [5, 15, 25, 35];

function pct(arr, p) {
  const b = [...arr].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(b.length * p))];
}
function shareAtLeast(arr, n) {
  return Math.round((arr.filter((x) => x >= n).length / arr.length) * 100);
}

for (const players of [2, 4, 6]) {
  const rent = [], hotels = [], cash = [];
  for (let g = 0; g < GAMES; g++) {
    const room = createRoom('R');
    room.missionsEnabled = false;
    for (let i = 0; i < players; i++) addPlayer(room, 'B' + i, { isBot: true });
    startGame(room);
    const names = room.players.map((p) => p.name);
    const rentSum = Object.fromEntries(names.map((n) => [n, 0]));
    const maxRent = Object.fromEntries(names.map((n) => [n, 0]));
    const maxHotel = Object.fromEntries(names.map((n) => [n, 0]));
    const maxCash = Object.fromEntries(names.map((n) => [n, 0]));
    let lastLog = 0;
    let steps = 0;
    while (room.phase !== 'ended' && steps < 40000) {
      tickBots(room);
      steps++;
      for (const l of room.log) {
        if (l.id <= lastLog) continue;
        lastLog = l.id;
        const m = /^(.+?) 踩到 (.+?) 的 .+，应付租金 ¥(\d+)/.exec(l.text);
        if (m && rentSum[m[2]] != null) {
          rentSum[m[2]] += Number(m[3]);
          maxRent[m[2]] = Math.max(maxRent[m[2]], rentSum[m[2]]);
        }
      }
      room.players.forEach((p) => {
        const owned = Object.keys(room.owners).filter((k) => room.owners[k] === p.id).map(Number);
        const hotelCount = owned.filter((i) => (room.houses[i] || 0) >= 5).length;
        maxHotel[p.name] = Math.max(maxHotel[p.name], hotelCount);
        maxCash[p.name] = Math.max(maxCash[p.name], p.cash);
      });
    }
    for (const n of names) {
      rent.push(maxRent[n]);
      hotels.push(maxHotel[n]);
      cash.push(maxCash[n]);
    }
  }
  console.log(`\n=== ${players} 人局（${GAMES} 局，${rent.length} 个样本）===`);
  console.log(` 累计收租 p50=${pct(rent, 0.5)} p70=${pct(rent, 0.7)} p80=${pct(rent, 0.8)}  达到800的占 ${shareAtLeast(rent, 800)}%  达到500的占 ${shareAtLeast(rent, 500)}%`);
  console.log(` 建成旅馆 至少1座的占 ${shareAtLeast(hotels, 1)}%`);
  console.log(` 现金峰值 p70=${pct(cash, 0.7)} p80=${pct(cash, 0.8)}  达到2500的占 ${shareAtLeast(cash, 2500)}%`);
}
