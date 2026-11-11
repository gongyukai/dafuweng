// 新玩法单测：回合设置、秘密任务、道具、全场事件、电脑性格
import {
  createRoom, addPlayer, startGame, act, view, PERSONA_IDS, MISSIONS,
} from '../public/game/engine.js';

let passed = 0;
function expect(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
  passed++;
  console.log('  ✓ ' + msg);
}

function makeGame(n = 2) {
  const room = createRoom('FEAT');
  const players = [];
  for (let i = 0; i < n; i++) players.push(addPlayer(room, `P${i + 1}`).player);
  startGame(room);
  return { room, players };
}

console.log('\n回合数设置');
{
  const room = createRoom('R');
  const host = addPlayer(room, '房主').player;
  const other = addPlayer(room, '路人').player;
  expect(act(room, host.id, { type: 'setRounds', rounds: 20 }).ok, '房主可以设 20 回合');
  expect(room.roundLimit === 20, '回合上限已更新');
  expect(!act(room, other.id, { type: 'setRounds', rounds: 35 }).ok, '非房主不能改');
  expect(!act(room, host.id, { type: 'setRounds', rounds: 99 }).ok, '只能选 20/35/50');
}

console.log('\n秘密任务分配与可见性');
{
  const { room, players } = makeGame(3);
  expect(players.every((p) => p.mission), '每个人都有秘密任务');
  expect(players.every((p) => MISSIONS.some((m) => m.id === p.mission)), '任务都在任务池里');
  const v0 = view(room, players[0].id);
  expect(v0.players[0].mission === players[0].mission, '自己能看到自己的任务');
  expect(v0.players[1].mission === null, '看不到别人的任务');
}

console.log('\n任务达成改为结算加成');
{
  const { room, players } = makeGame(3);
  room.round = 5;
  room.lastEventRound = 5; // 跳过全场事件，避免现金被扣
  players.forEach((p) => { p.mission = 'lands'; });
  players[0].mission = 'cash';
  players[0].cash = 3200;
  room.turn = 0;
  room.phase = 'end';
  const r = act(room, players[0].id, { type: 'end' });
  expect(r.ok, '结束回合正常');
  expect(room.phase !== 'ended', '任务达成不会提前结束对局');
  expect(players[0].missionDone === true, '任务标记为已完成');
  const v = view(room, players[1].id);
  expect(v.players.find((p) => p.id === players[0].id).missionDone === true, '其他人能看到任务已完成');
}

console.log('\n结算时任务加 20%');
{
  const { room, players } = makeGame(3);
  players[0].mission = 'cash';
  players[0].missionDone = true;
  players[0].cash = 3000;
  players[1].cash = 1000;
  players[2].cash = 1000;
  room.owners = {};
  room.houses = {};
  room.mortgaged = {};
  room.round = 50;
  room.roundLimit = 50;
  room.turn = 2;
  room.phase = 'end';
  room.pendingBuy = null;
  act(room, players[2].id, { type: 'end' });
  expect(room.phase === 'ended', '达到回合上限结算');
  const rank = room.finalRank;
  expect(rank[0].id === players[0].id, '任务完成者胜出');
  expect(rank[0].worth === 3600, `净资产含 20% 加成（实际 ${rank[0].worth}）`);
}

console.log('\n任务未达成不会误判');
{
  const { room, players } = makeGame(2);
  room.round = 8;
  players[0].mission = 'lands';
  room.phase = 'end';
  room.turn = 0;
  act(room, players[0].id, { type: 'end' });
  expect(players[0].missionDone !== true, '没凑够地产不会标记完成');
}

console.log('\n道具：经过起点获得');
{
  const { room, players } = makeGame(2);
  const p = players[0];
  p.pos = 38;
  p.forcedDice = 5; // 38 + 5 = 43 → 过起点，落在 3
  room.rng = () => 0;
  act(room, p.id, { type: 'roll' });
  expect(p.items.length === 1, '经过起点拿到 1 张道具');
  expect(p.cash >= 1500 + 200, '同时领了过路费');
}

console.log('\n道具：手牌上限');
{
  const { room, players } = makeGame(2);
  const p = players[0];
  p.items = ['dice', 'shield', 'demolish'];
  p.pos = 38;
  p.forcedDice = 5;
  act(room, p.id, { type: 'roll' });
  expect(p.items.length === 3, '手牌满了不会再获得（上限 3）');
}

console.log('\n道具：遥控骰子');
{
  const { room, players } = makeGame(2);
  const p = players[0];
  p.items = ['dice'];
  room.phase = 'roll';
  room.turn = 0;
  const r = act(room, p.id, { type: 'useItem', item: 'dice', value: 7 });
  expect(r.ok, '使用遥控骰子');
  expect(p.forcedDice === 7, '点数已锁定');
  act(room, p.id, { type: 'roll' });
  expect(room.dice[0] + room.dice[1] === 7, '掷骰结果就是指定点数');
}

console.log('\n道具：拆迁卡');
{
  const { room, players } = makeGame(2);
  room.owners[1] = players[1].id;
  room.houses[1] = 2;
  players[0].items = ['demolish'];
  players[0].pos = 0;
  room.turn = 0;
  room.phase = 'roll';
  const bad = act(room, players[0].id, { type: 'useItem', item: 'demolish', i: 1 });
  expect(bad.ok, '拆迁成功');
  expect(room.houses[1] === 1, '房子少了一栋');
  expect(players[0].items.length === 0, '道具已消耗');
  const self = act(room, players[0].id, { type: 'useItem', item: 'demolish', i: 1 });
  expect(!self.ok, '没有道具时不能再拆');
}

console.log('\n道具：均富卡');
{
  const { room, players } = makeGame(2);
  players[0].cash = 100;
  players[1].cash = 500;
  players[0].items = ['equalize'];
  room.turn = 0;
  room.phase = 'roll';
  const r = act(room, players[0].id, { type: 'useItem', item: 'equalize' });
  expect(r.ok, '均富成功');
  expect(players[0].cash === 300 && players[1].cash === 300, '两人现金都变成平均值');
}

console.log('\n道具：免租卡自动生效');
{
  const { room, players } = makeGame(2);
  room.owners[3] = players[1].id;
  players[0].items = ['shield'];
  players[0].pos = 0;
  players[0].forcedDice = 3;
  room.turn = 0;
  room.phase = 'roll';
  const before = players[0].cash;
  act(room, players[0].id, { type: 'roll' });
  expect(players[0].cash === before, '被收租时现金没减少');
  expect(players[0].items.length === 0, '免租卡已消耗');
}

console.log('\n全场事件');
{
  const { room, players } = makeGame(2);
  room.round = 4;
  room.turn = 1;
  room.phase = 'end';
  act(room, players[1].id, { type: 'end' });
  expect(room.round === 5, '进入第 5 回合');
  expect(room.event && room.event.round === 5, '触发了全场事件');
  expect(room.log.some((l) => /【.+】/.test(l.text)), '日志里播报了事件');
}

console.log('\n电脑性格');
{
  const room = createRoom('BOTP');
  const bot = addPlayer(room, '机器人', { isBot: true }).player;
  expect(PERSONA_IDS.includes(bot.persona), '机器人被分配了性格');
  const human = addPlayer(room, '真人').player;
  expect(human.persona === null, '真人没有电脑性格');
}

console.log(`\n🎉 新玩法单测全部通过（${passed} 项断言）`);
