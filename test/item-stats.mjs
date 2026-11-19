import { createRoom, addPlayer, startGame, tickBots } from '../public/game/engine.js';

const GAMES = Number(process.argv[2] || 120);
function pct(arr, p) {
  const b = [...arr].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(b.length * p))];
}
for (const players of [2, 4, 6]) {
  const used = [], lands = [];
  for (let g = 0; g < GAMES; g++) {
    const room = createRoom('I');
    room.missionsEnabled = false;
    for (let i = 0; i < players; i++) addPlayer(room, 'B' + i, { isBot: true });
    startGame(room);
    let steps = 0;
    while (room.phase !== 'ended' && steps < 50000) {
      tickBots(room);
      steps++;
    }
    for (const p of room.players) {
      used.push(p.itemsUsed || 0);
      lands.push(Object.keys(room.owners).filter((k) => room.owners[k] === p.id).length);
    }
  }
  console.log(`${players} 人局：道具使用 p50=${pct(used, 0.5)} p70=${pct(used, 0.7)} p80=${pct(used, 0.8)}  |  地皮 p80=${pct(lands, 0.8)} p90=${pct(lands, 0.9)}`);
}
