import { createRoom, addPlayer, startGame, view, tickBots } from '../public/game/engine.js';
import v8 from 'node:v8';

const N = Number(process.argv[2] || 300);
function makeRoom(i) {
  const room = createRoom('B' + i);
  room.missionsEnabled = true;
  for (let k = 0; k < 4; k++) addPlayer(room, '电脑' + k, { isBot: true });
  startGame(room);
  for (let t = 1; t < 40; t += 2) {
    room.owners[t] = room.players[t % 4].id;
    if (t % 6 === 0) room.houses[t] = 2;
  }
  room.turn = 0;
  room.phase = 'roll';
  return room;
}

global.gc?.();
const before = process.memoryUsage().heapUsed;
const rooms = [];
for (let i = 0; i < N; i++) rooms.push(makeRoom(i));
global.gc?.();
const after = process.memoryUsage().heapUsed;
console.log(`bot rooms=${N} perRoom=${((after - before) / N / 1024).toFixed(1)}KB`);

// 模拟 10 秒的机器人调度：每 1.5 秒对每个房间 tick 一次，动作时序列化 4 份视图
const size = JSON.stringify(view(rooms[0], rooms[0].players[0].id)).length;
let actions = 0;
let bytes = 0;
const t0 = process.hrtime.bigint();
for (let round = 0; round < 7; round++) {
  for (const room of rooms) {
    if (tickBots(room)) {
      actions++;
      for (const p of room.players) bytes += JSON.stringify(view(room, p.id)).length;
    }
  }
}
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
console.log(`7 rounds × ${N} rooms: ${ms.toFixed(0)}ms, actions=${actions}, payload=${(bytes / 1048576).toFixed(1)}MB`);
console.log(`per room per 10s: ${(ms / N).toFixed(3)}ms CPU, ${(bytes / N / 1024).toFixed(0)}KB payload`);
console.log('heap limit MB:', (v8.getHeapStatistics().heap_size_limit / 1048576).toFixed(0));
