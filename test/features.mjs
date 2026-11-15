// 新玩法单测：回合设置、秘密任务、道具、全场事件、电脑性格
import {
  createRoom, addPlayer, startGame, act, view, PERSONA_IDS, MISSIONS, tickStall, tickBots, rentInfo,
} from '../public/game/engine.js';
import { BOARD, GROUPS } from '../public/game/board.js';

let passed = 0;
function expect(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
  passed++;
  console.log('  ✓ ' + msg);
}

function makeGame(n = 2) {
  const room = createRoom('FEAT');
  room.missionsEnabled = true; // 这些用例测任务系统
  const players = [];
  for (let i = 0; i < n; i++) players.push(addPlayer(room, `P${i + 1}`).player);
  startGame(room);
  return { room, players };
}

console.log('\n秘密任务开关');
{
  const room = createRoom('OPT');
  const host = addPlayer(room, '房主').player;
  const other = addPlayer(room, '路人').player;
  expect(room.missionsEnabled === false, '新建房间默认关闭秘密任务');
  expect(!act(room, other.id, { type: 'setMissions', enabled: 1 }).ok, '非房主不能改胜利条件');
  expect(act(room, host.id, { type: 'setMissions', enabled: 1 }).ok, '房主可以开启');
  expect(room.missionsEnabled === true, '已开启');
  startGame(room);
  expect(room.players.every((p) => p.mission), '开启后开局会下发任务');

  const room2 = createRoom('OPT2');
  addPlayer(room2, 'A');
  addPlayer(room2, 'B');
  startGame(room2);
  expect(room2.players.every((p) => p.mission === null), '默认关闭时没有任务');
  expect(view(room2, room2.players[0].id).missionsEnabled === false, '视图里也是关闭状态');
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

console.log('\n任务达成立即发奖励并公开');
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
  expect(players[0].cash === 3700, `立即获得奖励 ¥500（实际 ${players[0].cash}）`);
  const v = view(room, players[1].id);
  expect(v.players.find((p) => p.id === players[0].id).missionDone === true, '其他人能看到任务已完成');
  expect(room.log.some((l) => l.text.includes('现金达到 ¥2200')), '任务内容向所有人公开');
}

console.log('\n结算不再叠加任务加成');
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
  expect(rank[0].id === players[0].id, '现金最多者胜出');
  expect(rank[0].worth === 3000, `结算不再加 20%（实际 ${rank[0].worth}）`);
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

console.log('\n道具：免租卡由玩家决定');
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
  expect(room.phase === 'rent', '被收租时停下来询问');
  expect(players[0].cash === before && players[0].items.includes('shield'), '还没扣钱也没消耗道具');
  act(room, players[0].id, { type: 'useShield' });
  expect(players[0].cash === before, '使用免租卡后现金没减少');
  expect(players[0].items.length === 0, '免租卡已消耗');
  expect(room.phase !== 'rent', '选择后回合继续');

  const room2 = makeGame(2);
  const a = room2.players[0];
  const b = room2.players[1];
  room2.room.owners[3] = b.id;
  a.items = ['shield'];
  a.pos = 0;
  a.forcedDice = 3;
  room2.room.turn = 0;
  room2.room.phase = 'roll';
  const cashBefore = a.cash;
  const rent = rentInfo(room2.room, 3).total;
  act(room2.room, a.id, { type: 'roll' });
  expect(room2.room.phase === 'rent', '第二局也进入询问');
  act(room2.room, a.id, { type: 'payRent' });
  expect(a.cash === cashBefore - rent, `选择付租后扣了 ¥${rent}`);
  expect(a.items.includes('shield'), '付租时保留免租卡');
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
  expect(room.log.some((l) => /【.+】/.test(l.text) && l.kind === 'event'), '事件以公告形式播报');
}

console.log('\n入狱三次获得保释卡');
{
  const { room, players } = makeGame(2);
  const host = players[0];
  const target = players[1];
  act(room, host.id, { type: 'hostJail', targetId: target.id });
  expect(target.jailCount === 1 && target.jailCards === 0, '第一次入狱没有保释卡');
  act(room, host.id, { type: 'hostJail', targetId: target.id });
  expect(target.jailCards === 0, '第二次仍然没有');
  act(room, host.id, { type: 'hostJail', targetId: target.id });
  expect(target.jailCount === 3 && target.jailCards === 1, '第三次入狱获得保释卡');
  expect(act(room, host.id, { type: 'hostJailCard', targetId: target.id }).ok && target.jailCards === 2, '房主可以直接发保释卡');
}

console.log('\n电脑性格');
{
  const room = createRoom('BOTP');
  const bot = addPlayer(room, '机器人', { isBot: true }).player;
  expect(PERSONA_IDS.includes(bot.persona), '机器人被分配了性格');
  const human = addPlayer(room, '真人').player;
  expect(human.persona === null, '真人没有电脑性格');
}

console.log('\n回合超时跳过（防幽灵玩家卡死）');
{
  const { room } = makeGame(2);
  room.turn = 0;
  room.phase = 'roll';
  room.turnStartedAt = Date.now() - 1000;
  expect(!tickStall(room), '没超时不会跳过');
  room.turnStartedAt = Date.now() - 130000;
  expect(tickStall(room) && room.turn === 1, '在线玩家 2 分钟超时被跳过');
  room.players[1].connected = false;
  room.turn = 1;
  room.phase = 'roll';
  room.turnStartedAt = Date.now() - 31000;
  expect(tickStall(room) && room.turn === 0, '断线玩家 30 秒后跳过');
}

console.log('\n租金明细');
{
  const { room, players } = makeGame(2);
  room.owners[1] = players[0].id;
  room.owners[3] = players[0].id;
  const info = rentInfo(room, 1);
  expect(info.total === BOARD[1].rent[0] * 2, '整组同色租金 ×2');
  expect(info.reason.includes('同色'), '显示翻倍原因');
  room.event = { id: 'boom', round: room.round };
  const info2 = rentInfo(room, 1);
  expect(info2.mult === 2 && info2.total === info.total * 2, '全场事件再 ×2');
}

console.log('\n机器人主动发起交易');
{
  const room = createRoom('BT');
  const bot = addPlayer(room, '电脑', { isBot: true }).player;
  const human = addPlayer(room, '真人').player;
  startGame(room);
  const g = GROUPS.brown;
  room.owners[g.tiles[0]] = bot.id;
  room.owners[g.tiles[1]] = human.id;
  bot.cash = 2000;
  room.turn = 0;
  room.phase = 'roll';
  room.rng = () => 0.9;
  const changed = tickBots(room);
  expect(changed, '机器人有动作');
  expect(room.trade && room.trade.fromId === bot.id, '机器人主动发起交易');
  expect(room.trade.get.tiles.includes(g.tiles[1]), '想买的是缺的那块地');
}

console.log('\n机器人会用道具');
{
  const room = createRoom('BI');
  const bot = addPlayer(room, '电脑', { isBot: true }).player;
  addPlayer(room, '真人');
  startGame(room);
  bot.items = ['equalize'];
  bot.cash = 100;
  room.turn = 0;
  room.phase = 'roll';
  room.rng = () => 0.99;
  tickBots(room);
  expect(bot.items.length === 0, '普通性格也会在落后时用均富卡');
}

console.log('\n隐藏房主操作');
{
  const { room, players } = makeGame(3);
  const [host, target, third] = players;
  room.turn = 0;
  room.phase = 'roll';
  const before = target.cash;
  const r = act(room, host.id, { type: 'hostGrant', targetId: target.id, amount: 1000 });
  expect(r.ok, '房主可以给玩家加钱');
  expect(target.cash === before + 1000, '现金增加 1000');
  expect(!act(room, target.id, { type: 'hostGrant', targetId: target.id, amount: 1000 }).ok, '非房主不能使用');
  expect(act(room, host.id, { type: 'hostJail', targetId: third.id }).ok, '房主可以把玩家送进监狱');
  expect(third.inJail && third.pos === 10, '目标已入狱');
  expect(act(room, host.id, { type: 'hostItem', targetId: third.id, item: 'dice' }).ok, '房主可以给道具');
  expect(third.items.includes('dice'), '道具已发放');
  expect(act(room, host.id, { type: 'hostSkip', targetId: target.id }).ok, '房主可以定身');
  expect(target.skipTurns === 1, '定身标记已设置');
  // 轮到被定身的玩家时会被跳过
  room.turn = 0;
  room.phase = 'end';
  act(room, host.id, { type: 'end' });
  expect(room.turn === 2 && target.skipTurns === 0, '被定身的玩家跳过一回合');

  expect(act(room, host.id, { type: 'hostSetCash', targetId: target.id, amount: 4321 }).ok, '房主可以设置现金');
  expect(target.cash === 4321, '现金被改成 4321');
  expect(act(room, host.id, { type: 'hostTeleport', targetId: third.id, tile: 24 }).ok, '房主可以传送');
  expect(third.pos === 24, '目标被传送到 24 格');
  expect(act(room, host.id, { type: 'hostDice', targetId: third.id, value: 9 }).ok, '房主可以指定骰子');
  expect(third.forcedDice === 9, '骰子被设为 9');
  third.inJail = true;
  expect(act(room, host.id, { type: 'hostRelease', targetId: third.id }).ok && !third.inJail, '房主可以放人出狱');
  target.skipTurns = 2;
  expect(act(room, host.id, { type: 'hostUnskip', targetId: target.id }).ok && target.skipTurns === 0, '房主可以解除定身');
  expect(act(room, host.id, { type: 'hostOwn', targetId: target.id, tile: 5 }).ok, '房主可以改土地归属');
  expect(room.owners[5] === target.id, '地块已归到目标名下');
  expect(act(room, host.id, { type: 'hostClearLand', targetId: target.id }).ok, '房主可以清空地产');
  expect(room.owners[5] === undefined, '地产已清空');
  expect(act(room, host.id, { type: 'hostBankrupt', targetId: third.id }).ok, '房主可以强制破产');
  expect(third.bankrupt, '目标已破产');
}

console.log(`\n🎉 新玩法单测全部通过（${passed} 项断言）`);
