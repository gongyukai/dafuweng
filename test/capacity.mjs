import { createRoom, addPlayer, startGame, view, tickBots } from '../public/game/engine.js';
import v8 from 'node:v8';

const N = Number(process.argv[2] || 1000);
function makeRoom(i) {
  const room = createRoom('R' + i);
  room.missionsEnabled = true;
  for (let k = 0; k < 4; k++) addPlayer(room, 'P' + k);
  startGame(room);
  for (let t = 1; t < 40; t += 2) {
    room.owners[t] = room.players[t % 4].id;
    if (t % 6 === 0) room.houses[t] = 2;
  }
  for (let j = 0; j < 60; j++) room.log.push({ id: j, text: '这是一条测试日志'.repeat(4), kind: 'info' });
  for (let j = 0; j < 20; j++) room.chat.push({ id: j, from: room.players[0].id, name: 'P0', text: '聊天消息测试', t: Date.now() });
  return room;
}

global.gc?.();
const before = process.memoryUsage().heapUsed;
const rooms = [];
for (let i = 0; i < N; i++) rooms.push(makeRoom(i));
global.gc?.();
const after = process.memoryUsage().heapUsed;
const perRoom = (after - before) / N;
console.log(`rooms=${N} perRoom=${(perRoom / 1024).toFixed(1)}KB total=${((after - before) / 1048576).toFixed(1)}MB`);
console.log('heap limit MB:', (v8.getHeapStatistics().heap_size_limit / 1048576).toFixed(0));

const v = view(rooms[0], rooms[0].players[0].id);
const size = JSON.stringify(v).length;
console.log(`view JSON=${(size / 1024).toFixed(1)}KB ×4 players = ${(size * 4 / 1024).toFixed(1)}KB per broadcast`);

// 机器人调度耗时（每个房间一次 tick 的平均）
const t0 = process.hrtime.bigint();
const loops = 2000;
for (let i = 0; i < loops; i++) tickBots(rooms[i % rooms.length]);
const t1 = process.hrtime.bigint();
console.log(`tickBots avg=${(Number(t1 - t0) / 1e6 / loops).toFixed(4)}ms/room`);
