// 统计不同人数下，各任务指标的分布（用来挑“约 30% 玩家能完成”的目标）
import { createRoom, addPlayer, startGame, tickBots, netWorth } from '../public/game/engine.js';
import { GROUPS } from '../public/game/board.js';

const GAMES = Number(process.argv[2] || 150);
const RAILS = [5, 15, 25, 35];

function pct(arr, p) {
  const b = [...arr].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(b.length * p))];
}

for (const players of [2, 4, 6]) {
  const lands = [], houses = [], rails = [], cash = [], groups = [], assets = [];
  for (let g = 0; g < GAMES; g++) {
    const room = createRoom('P');
    room.missionsEnabled = false;
    for (let i = 0; i < players; i++) addPlayer(room, 'B' + i, { isBot: true });
    startGame(room);
    const max = room.players.map(() => ({ lands: 0, houses: 0, rails: 0, cash: 0, groups: 0, assets: 0 }));
    let steps = 0;
    while (room.phase !== 'ended' && steps < 40000) {
      tickBots(room);
      steps++;
      room.players.forEach((p, i) => {
        const tiles = Object.keys(room.owners).filter((k) => room.owners[k] === p.id).map(Number);
        const m = max[i];
        m.lands = Math.max(m.lands, tiles.length);
        m.houses = Math.max(m.houses, tiles.reduce((s, t) => s + (room.houses[t] || 0), 0));
        m.rails = Math.max(m.rails, RAILS.filter((t) => room.owners[t] === p.id).length);
        m.cash = Math.max(m.cash, p.cash);
        const grp = Object.keys(GROUPS).filter((k) => GROUPS[k].tiles.every((t) => room.owners[t] === p.id)).length;
        m.groups = Math.max(m.groups, grp);
        m.assets = Math.max(m.assets, netWorth(room, p));
      });
    }
    for (const m of max) {
      lands.push(m.lands); houses.push(m.houses); rails.push(m.rails); cash.push(m.cash); groups.push(m.groups); assets.push(m.assets);
    }
  }
  console.log(`\n=== ${players} 人局（${GAMES} 局，${lands.length} 个玩家样本）===`);
  console.log(` 地皮数   p50=${pct(lands, 0.5)}  p70=${pct(lands, 0.7)}  p80=${pct(lands, 0.8)}  max=${Math.max(...lands)}`);
  console.log(` 房子数   p50=${pct(houses, 0.5)}  p70=${pct(houses, 0.7)}  p80=${pct(houses, 0.8)}  max=${Math.max(...houses)}`);
  console.log(` 车站数   p50=${pct(rails, 0.5)}  p70=${pct(rails, 0.7)}  p80=${pct(rails, 0.8)}  max=${Math.max(...rails)}`);
  console.log(` 现金峰值 p50=${pct(cash, 0.5)}  p70=${pct(cash, 0.7)}  p80=${pct(cash, 0.8)}  max=${Math.max(...cash)}`);
  console.log(` 完成组数 p50=${pct(groups, 0.5)}  p70=${pct(groups, 0.7)}  p80=${pct(groups, 0.8)}  max=${Math.max(...groups)}`);
  console.log(` 总资产   p50=${pct(assets, 0.5)}  p70=${pct(assets, 0.7)}  p80=${pct(assets, 0.8)}  max=${Math.max(...assets)}`);
}
