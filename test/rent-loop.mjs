import { createRoom, addPlayer, startGame, act } from '../public/game/engine.js';
for (let i = 0; i < 15; i++) {
  const room = createRoom('R' + i);
  room.missionsEnabled = false;
  const a = addPlayer(room, 'A', { isBot: true }).player;
  const b = addPlayer(room, 'B', { isBot: true }).player;
  startGame(room);
  room.turn = 0;
  room.phase = 'roll';
  room.owners[1] = b.id;
  a.pos = 39;
  a.forcedDice = 2;
  const r = act(room, a.id, { type: 'roll' });
  if (!(b.rentIncome > 0)) {
    console.log(i, 'FAIL', r, 'pos', a.pos, 'phase', room.phase, 'dice', room.dice, 'income', b.rentIncome);
    console.log(room.log.slice(-6).map((l) => l.kind + ':' + l.text));
  } else {
    console.log(i, 'ok', b.rentIncome);
  }
}
