// 新玩法单测：回合设置、秘密任务、道具、全场事件、电脑性格
import {
  createRoom, addPlayer, startGame, act, view, PERSONA_IDS, MISSIONS, tickStall, tickBots, rentInfo,
  missionTarget, missionRewardBase, missionText,
} from '../public/game/engine.js';
import { BOARD, GROUPS } from '../public/game/board.js';

let passed = 0;
function expect(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
  passed++;
  console.log('  ✓ ' + msg);
}
function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeGame(n = 2) {
  const room = createRoom('FEAT');
  room.missionsEnabled = true;
  room.diceMode = 'classic'; // 这些用例测任务系统
  const players = [];
  for (let i = 0; i < n; i++) players.push(addPlayer(room, `P${i + 1}`).player);
  startGame(room);
  // 二选一任务：测试里统一选第一个选项，进入正常回合
  for (const p of room.players) {
    if (!p.missionPicked) act(room, p.id, { type: 'pickMission', i: 0 });
  }
  room.turn = 0; // 测试默认从第一位玩家开始（正式游戏先手随机）
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
  expect(room.phase === 'mission', '开启后开局先选任务');
  expect(room.players.every((p) => p.missionOptions.length === 2), '每人两个任务选项');
  for (const p of room.players) act(room, p.id, { type: 'pickMission', i: 0 });
  expect(room.phase === 'roll', '选完任务进入掷骰');
  expect(room.players.every((p) => p.mission), '选择后下发任务');

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

console.log('\n任务按人数过滤、目标与奖励随人数变化');
{
  const { room, players } = makeGame(6);
  expect(players.every((p) => p.mission !== 'rails'), '6 人局没有车站任务');
  for (const p of players) {
    const def = MISSIONS.find((m) => m.id === p.mission);
    expect(!!def, '任务在任务池里');
    expect(p.missionTarget === missionTarget(def, 6), `${p.mission} 目标按 6 人计算`);
    expect(p.missionRewardBase === missionRewardBase(def, 6), `${p.mission} 奖励按 6 人计算`);
    expect(p.missionText === missionText(def, 6), '任务文案与目标一致');
  }
  const r2 = makeGame(2);
  expect(r2.players.every((p) => p.mission !== 'hotel' || p.missionRewardBase === 600), '2 人局旅馆奖励 600');
  const railOk = r2.players.some((p) => p.mission === 'rails');
  if (railOk) expect(r2.players.find((p) => p.mission === 'rails').missionRewardBase === 700, '2 人局车站奖励 700');
}

console.log('\n新任务：收租 / 交易 / 道具');
{
  const { room, players } = makeGame(3);
  room.round = 5;
  room.lastEventRound = 5;
  players.forEach((p, i) => { p.cash = 2000; p.mission = 'lands'; p.missionTarget = 99; p.missionDone = false; });
  const p = players[0];
  p.mission = 'rent';
  p.missionTarget = 600;
  p.missionText = '累计收取租金 ¥600';
  p.missionRewardBase = 600;
  p.rentIncome = 600;
  room.turn = 0;
  room.phase = 'end';
  expect(act(room, p.id, { type: 'end' }).ok, '结束回合正常');
  expect(p.missionDone === true, '收租任务可以完成');
  expect(p.cash > 2000, '收租任务发了奖励');

  const g2 = makeGame(3);
  g2.room.round = 5;
  g2.room.lastEventRound = 5;
  g2.players.forEach((x) => { x.cash = 2000; x.mission = 'lands'; x.missionTarget = 99; });
  const t = g2.players[1];
  t.mission = 'trade';
  t.missionText = '完成 2 次玩家交易';
  t.missionRewardBase = 600;
  t.tradesDone = 2;
  g2.room.turn = 1;
  g2.room.phase = 'end';
  expect(act(g2.room, t.id, { type: 'end' }).ok, '结束回合正常');
  expect(t.missionDone === true, '交易任务可以完成');

  const g3 = makeGame(3);
  g3.room.round = 5;
  g3.room.lastEventRound = 5;
  g3.players.forEach((x) => { x.cash = 2000; x.mission = 'lands'; x.missionTarget = 99; });
  const it = g3.players[2];
  it.mission = 'item';
  it.missionTarget = 3;
  it.missionText = '使用 3 张道具卡';
  it.missionRewardBase = 700;
  it.itemsUsed = 3;
  g3.room.turn = 2;
  g3.room.phase = 'end';
  expect(act(g3.room, it.id, { type: 'end' }).ok, '结束回合正常');
  expect(it.missionDone === true, '道具任务可以完成');
}

console.log('\n财富系数：落后的人奖励更高');
{
  const { room, players } = makeGame(3);
  room.round = 5;
  room.lastEventRound = 5;
  players[0].cash = 1000;
  players[1].cash = 5000;
  players[2].cash = 5000;
  players[0].mission = 'assets';
  players[0].missionTarget = 3200;
  players[0].missionText = '总资产达到 ¥3200';
  players[0].missionRewardBase = 600;
  room.owners = {};
  room.phase = 'end';
  room.turn = 0;
  players[0].cash = 3200; // 达成
  players[1].cash = 6000;
  players[2].cash = 6000;
  // 平均 (3200+6000+6000)/3=5066，3200 的系数约 1.58 → 约 950
  expect(act(room, players[0].id, { type: 'end' }).ok, '结束回合正常');
  expect(players[0].missionDone === true, '总资产任务完成');
  expect(players[0].cash > 3200 + 600, `落后时奖励应高于基础 600（实际 ${players[0].cash - 3200}）`);
  expect(room.log.some((l) => l.text.includes('财富系数')), '日志里显示财富系数');
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
  players.forEach((p) => { p.mission = 'lands'; p.missionTarget = 99; });
  players[0].mission = 'assets';
  players[0].missionTarget = 3200;
  players[0].missionText = '总资产达到 ¥3200';
  players[0].missionRewardBase = 600;
  players.forEach((p) => { p.cash = 4000; });
  room.turn = 0;
  room.phase = 'end';
  const r = act(room, players[0].id, { type: 'end' });
  expect(r.ok, '结束回合正常');
  expect(room.phase !== 'ended', '任务达成不会提前结束对局');
  expect(players[0].missionDone === true, '任务标记为已完成');
  expect(players[0].cash === 4600, `立即获得奖励 ¥600（实际 ${players[0].cash}）`);
  const v = view(room, players[1].id);
  expect(v.players.find((p) => p.id === players[0].id).missionDone === true, '其他人能看到任务已完成');
  expect(room.log.some((l) => l.text.includes('总资产达到 ¥3200')), '任务内容向所有人公开');
}

console.log('\n结算不再叠加任务加成');
{
  const { room, players } = makeGame(3);
  players[0].mission = 'assets';
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
  room.startTurn = 0; // 从 2 结束会绕回 0，触发第 51 回合结算
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
  players[0].missionTarget = 8;
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
  expect(p.itemChoices.length === 2, '经过起点获得两个道具选项');
  expect(p.items.length === 0, '还没选择，不直接进背包');
  expect(p.cash >= 1500 + 200, '同时领了过路费');
  room.turn = 0;
  room.phase = 'item';
  room.turnStartedAt = Date.now();
  expect(act(room, p.id, { type: 'pickItem', i: 0 }).ok, '选择第一个道具');
  expect(p.items.length === 1, '选择后拿到 1 张道具');
  expect(p.itemChoices.length === 0, '选项清空');
  expect(room.phase === 'roll', '选完进入掷骰');
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
  room.startTurn = 0;
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

console.log('\n回合超时自动掷骰行动');
{
  const { room, players } = makeGame(2);
  room.turn = 0;
  room.phase = 'roll';
  room.turnStartedAt = Date.now() - 1000;
  expect(!tickStall(room), '没超时不会行动');
  const before = players[0].pos;
  room.turnStartedAt = Date.now() - 61000;
  expect(tickStall(room), '60 秒超时自动行动');
  expect(room.turn === 1, '自动完成回合并轮换到下一位');
  expect(players[0].pos !== before || room.phase === 'ended', '自动掷骰后发生了移动');

  const { room: room2, players: players2 } = makeGame(2);
  players2[1].connected = false;
  room2.turn = 1;
  room2.phase = 'roll';
  room2.turnStartedAt = Date.now() - 61000;
  expect(tickStall(room2) && room2.turn === 0, '离线玩家 60 秒后也会自动行动');
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
  room.missionsEnabled = false; // 避免任务奖励干扰金额断言
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
  third.items = ['dice', 'shield'];
  third.jailCards = 1;
  expect(act(room, host.id, { type: 'hostRemoveItem', targetId: third.id, item: 'dice' }).ok, '房主可以销毁道具');
  expect(!third.items.includes('dice') && third.items.includes('shield'), '只销毁指定的那一张');
  expect(act(room, host.id, { type: 'hostRemoveJailCard', targetId: third.id }).ok, '房主可以销毁出狱卡');
  expect(third.jailCards === 0, '出狱卡已销毁');
  expect(act(room, host.id, { type: 'hostBankrupt', targetId: third.id }).ok, '房主可以强制破产');
  expect(third.bankrupt, '目标已破产');
}

console.log('\n免租选择不会被心跳自动付掉');
{
  const { room, players } = makeGame(2);
  room.owners[3] = players[1].id;
  players[0].items = ['shield'];
  players[0].pos = 0;
  players[0].forcedDice = 3;
  room.turn = 0;
  room.phase = 'roll';
  act(room, players[0].id, { type: 'roll' });
  expect(room.phase === 'rent', '进入免租选择');
  room.turnStartedAt = Date.now();
  expect(!tickStall(room), '心跳不会立刻替玩家付款');
  expect(room.phase === 'rent' && players[0].items.includes('shield'), '选择仍然保留');
  room.turnStartedAt = Date.now() - 130000;
  expect(tickStall(room), '超时后才自动付租');
  expect(room.phase !== 'rent', '超时后离开选择');
}

console.log('\n保释金不强制卖房');
{
  const { room, players } = makeGame(2);
  room.missionsEnabled = false;
  const p = players[0];
  p.inJail = true;
  p.jailTurns = 2;
  p.pos = 10;
  p.cash = 5;
  room.owners[1] = p.id;
  room.owners[3] = p.id;
  room.turn = 0;
  room.phase = 'roll';
  p.forcedDice = 3; // 1 + 2，非双数
  act(room, p.id, { type: 'roll' });
  expect(room.phase === 'debt', '保释金不足时进入筹钱');
  expect(room.owners[1] === p.id && room.owners[3] === p.id, '没有自动卖房');
  act(room, p.id, { type: 'mortgage', i: 1 });
  expect(room.phase === 'debt', '第一块抵押后仍差一点');
  act(room, p.id, { type: 'mortgage', i: 3 });
  expect(room.phase !== 'debt', '凑够保释金后自动结算');
  expect(p.inJail === false && p.pos === 13, '交完保释金后正常走 3 格');
}

console.log('\n债务超时不会凭空消失');
{
  const { room, players } = makeGame(2);
  room.missionsEnabled = false;
  room.owners[3] = players[1].id;
  players[0].cash = 0;
  players[0].pos = 0;
  players[0].forcedDice = 3;
  room.turn = 0;
  room.phase = 'roll';
  act(room, players[0].id, { type: 'roll' });
  expect(room.phase === 'debt', '先进入筹钱');
  room.turnStartedAt = Date.now() - 130000;
  tickStall(room);
  expect(players[0].bankrupt || room.phase !== 'debt', '超时后债务被结算，不会消失');
  if (players[0].bankrupt) {
    expect(room.phase === 'ended', '破产后对局结束');
    expect(room.finalRank && room.finalRank[0].worth > 0, '赢家净资产不为 0');
  }
}

console.log('\n起手顺序随机');
{
  const room = createRoom('ORD');
  addPlayer(room, 'A');
  addPlayer(room, 'B');
  addPlayer(room, 'C');
  const firsts = new Set();
  for (let i = 0; i < 12; i++) {
    room.phase = 'lobby';
    startGame(room);
    firsts.add(room.players[room.turn].id);
  }
  expect(firsts.size >= 2, `先手应该随机（12 局出现 ${firsts.size} 种先手）`);
  expect(room.players.length === 3, '随机先手不影响人数');
}

console.log('\n长按入口限 10 次');
{
  const { room, players } = makeGame(2);
  room.missionsEnabled = false;
  const host = room.players.find((p) => p.id === room.hostId);
  const other = room.players.find((p) => p.id !== host.id);
  let okCount = 0;
  for (let i = 0; i < 10; i++) {
    if (act(room, host.id, { type: 'hostGrant', targetId: other.id, amount: 1, source: 'alt' }).ok) okCount++;
  }
  expect(okCount === 10, '长按入口可以用 10 次');
  expect(!act(room, host.id, { type: 'hostGrant', targetId: other.id, amount: 1, source: 'alt' }).ok, '第 11 次被拒绝');
  expect(act(room, host.id, { type: 'hostGrant', targetId: other.id, amount: 1, source: 'command' }).ok, '密令入口不限次数');
  expect(view(room, host.id).altUses === 0, '视图里剩余次数为 0');
}

console.log('\n一次免租只消耗一张卡');
{
  const { room, players } = makeGame(2);
  const p = players[0];
  const other = players[1];
  p.items = ['shield', 'shield'];
  room.owners[1] = other.id;
  room.rentChoice = { payerId: p.id, ownerId: other.id, tile: 1, amount: 50 };
  room.phase = 'rent';
  expect(act(room, p.id, { type: 'useShield' }).ok, '使用免租卡成功');
  expect(p.items.filter((x) => x === 'shield').length === 1, `还剩一张免租卡（实际 ${p.items.length} 张手牌）`);
  expect(p.itemsUsed === 1, '道具使用计数为 1');
}

console.log('\n机器人一次免租也只消耗一张');
{
  const room = createRoom('BS');
  room.missionsEnabled = false;
  const a = addPlayer(room, 'A', { isBot: true }).player;
  const b = addPlayer(room, 'B', { isBot: true }).player;
  startGame(room);
  room.turn = 0;
  room.phase = 'roll';
  room.owners[1] = b.id;
  a.pos = 39;
  a.forcedDice = 2;
  a.items = ['shield', 'shield', 'dice'];
  act(room, a.id, { type: 'roll' });
  expect(a.items.filter((x) => x === 'shield').length === 1, `机器人一次免租后还剩一张（实际 ${a.items.filter((x) => x === 'shield').length}）`);
}

console.log('\n随机先手不破坏回合公平');
{
  const room = createRoom('FAIR');
  room.missionsEnabled = false;
  const players = [];
  for (let i = 0; i < 4; i++) players.push(addPlayer(room, 'F' + i).player);
  startGame(room);
  room.startTurn = 1;
  room.turn = 1;
  room.round = 1;
  room.roundLimit = 3;
  room.phase = 'end';
  const counts = {};
  let guard = 0;
  while (room.phase !== 'ended' && guard < 40) {
    const cur = room.players[room.turn];
    counts[cur.id] = (counts[cur.id] || 0) + 1;
    room.phase = 'end';
    act(room, cur.id, { type: 'end' });
    guard++;
  }
  expect(room.phase === 'ended', '到达回合上限后结束');
  expect(guard === 12, `3 回合 × 4 人 = 12 次行动（实际 ${guard}）`);
  expect(players.every((p) => counts[p.id] === 3), `每人正好 3 次行动（${players.map((p) => counts[p.id]).join('/')}）`);
}

console.log('\n赎回价格不再因浮点误差多收 1 块');
{
  const { room, players } = makeGame(2);
  room.missionsEnabled = false;
  const p = players[0];
  room.owners[5] = p.id;
  room.mortgaged[5] = true;
  p.cash = 110;
  room.turn = 0;
  room.phase = 'end';
  const r = act(room, p.id, { type: 'unmortgage', i: 5 });
  expect(r.ok, '正好 ¥110 可以赎回台北车站');
  expect(p.cash === 0, `赎回后现金为 0（实际 ${p.cash}）`);
  expect(!room.mortgaged[5], '赎回后抵押状态清除');
}

console.log('\n满员大厅离线玩家会让出座位');
{
  const room = createRoom('FULL');
  const list = [];
  for (let i = 0; i < 6; i++) list.push(addPlayer(room, 'P' + i).player);
  room.hostId = list[5].id; // 让最后一位（即将离线的人）当房主
  list[5].connected = false;
  const r = addPlayer(room, '新人');
  expect(r.ok, '离线玩家让位后新人可以加入');
  expect(room.players.length === 6, '人数仍然为 6');
  expect(room.players.some((p) => p.name === '新人'), '新人已在房间里');
  expect(room.hostId === list[0].id, '房主自动转给在线的第一位玩家');
  expect(room.players.find((p) => p.id === list[0].id).isHost, '新房主标记正确');
}

console.log('\n机器人不会卡在失效的报价上');
{
  const room = createRoom('STALL');
  room.missionsEnabled = false;
  const human = addPlayer(room, '甲').player;
  const bot = addPlayer(room, '机器人', { isBot: true }).player;
  startGame(room);
  room.turn = 0;
  room.owners[5] = bot.id;
  human.cash = 300;
  bot.cash = 500;
  const offer = act(room, human.id, { type: 'tradeOffer', toId: bot.id, giveCash: 220, getTiles: [5], giveTiles: [], getCash: 0 });
  expect(offer.ok, '发起 ¥220 换车站的报价');
  human.cash = 200; // 发起人随后把钱花掉，报价已无法成交
  room.trade.createdAt = Date.now() - 5000;
  expect(tickBots(room), '机器人尝试处理报价');
  expect(room.trade === null, '失效报价被拒绝，不会一直挂着');
  expect(!tickBots(room), '报价处理后不再占用机器人回合');
}

console.log('\n别人破产不会取消你的双数奖励');
{
  const { room, players } = makeGame(3);
  room.missionsEnabled = false;
  const host = players.find((p) => p.id === room.hostId);
  const other = players.find((p) => p.id !== host.id);
  room.turn = 0;
  room.again = true; // 当前玩家掷出双数，等待再掷一次
  const r = act(room, host.id, { type: 'hostBankrupt', targetId: other.id });
  expect(r.ok, '房主强制另一名玩家破产');
  expect(room.again === true, '当前玩家的双数奖励保留');
  expect(room.phase !== 'ended', '还有两人存活，对局继续');
}

console.log('\n破产时房东也能计入收租');
{
  const { room, players } = makeGame(2);
  room.missionsEnabled = false;
  const [p1, p2] = players;
  room.turn = 1;
  room.phase = 'debt';
  p2.cash = 3;
  room.debt = { payerId: p2.id, amount: 4, creditorId: p1.id, resume: 'end', after: null };
  const r = act(room, p2.id, { type: 'declareBankrupt' });
  expect(r.ok, '租客宣告破产');
  expect(p1.cash === 1500 + 3, `房东拿到剩余 ¥3（实际 ${p1.cash}）`);
  expect(p1.rentIncome === 3, `房东累计收租计入 ¥3（实际 ${p1.rentIncome}）`);
}

console.log('\n秘密任务二选一');
{
  const room = createRoom('PICK');
  room.missionsEnabled = true;
  const a = addPlayer(room, 'A').player;
  const b = addPlayer(room, 'B').player;
  startGame(room);
  expect(room.phase === 'mission', '开局进入任务选择阶段');
  const va = view(room, a.id);
  const pa = va.players.find((p) => p.id === a.id);
  const pb = va.players.find((p) => p.id === b.id);
  expect(pa.missionOptions.length === 2, '自己能看到两个选项');
  expect(pb.missionOptions.length === 0, '看不到别人的选项');
  expect(act(room, a.id, { type: 'pickMission', i: 0 }).ok, 'A 选择第一个任务');
  expect(room.phase === 'mission', 'B 还没选，继续等待');
  expect(act(room, b.id, { type: 'pickMission', i: 1 }).ok, 'B 选择第二个任务');
  expect(room.phase === 'roll', '两人都选完后开始掷骰');
  expect(a.mission && b.mission, '任务已分配');
  expect(a.missionOptions.length === 0, '选项已清空');

  const room2 = createRoom('PICK2');
  room2.missionsEnabled = true;
  addPlayer(room2, 'A');
  addPlayer(room2, 'B');
  startGame(room2);
  room2.turnStartedAt = Date.now() - 31000;
  tickStall(room2);
  expect(room2.phase === 'roll', '超时后自动选任务并开始');
  expect(room2.players.every((p) => p.mission), '超时也有任务');
}

console.log('\n抽卡二选一');
{
  const { room, players } = makeGame(2);
  const p = players[0];
  room.turn = 0;
  room.phase = 'roll';
  p.pos = 0;
  p.forcedDice = 2; // 0 + 2 → 命运格（2）
  room.chest = [0, 1];
  room.chestPos = 0;
  act(room, p.id, { type: 'roll' });
  expect(room.phase === 'card' && !!room.cardChoice, '踩到命运进入选卡');
  expect(room.cardChoice.options.length === 2, '抽到两张卡');
  const vOther = view(room, players[1].id);
  expect(vOther.cardChoice && vOther.cardChoice.options === null, '别人看不到卡面');
  const r = act(room, p.id, { type: 'chooseCard', i: 0 });
  expect(r.ok, '选第一张卡');
  expect(room.cardChoice === null, '选完清空');
  expect(room.phase !== 'card', '离开选卡阶段');
}
{
  const room = createRoom('CARD-BOT');
  room.missionsEnabled = false;
  addPlayer(room, '甲');
  const bot = addPlayer(room, '机器人', { isBot: true }).player;
  startGame(room);
  room.turn = 1;
  room.phase = 'card';
  room.cardChoice = {
    playerId: bot.id,
    deck: 'chest',
    depth: 0,
    options: [
      { deck: 'chest', card: { t: 'money', amount: -50, text: '罚款' } },
      { deck: 'chest', card: { t: 'money', amount: 50, text: '收入' } },
    ],
  };
  const before = bot.cash;
  expect(tickBots(room), '机器人处理选卡');
  expect(room.cardChoice === null, '机器人选完卡');
  expect(bot.cash === before + 50, '机器人选了收益更高的卡');
}

console.log('\n三骰选二与规划点调整');
{
  const room = createRoom('DICE');
  room.missionsEnabled = false;
  room.diceMode = 'three';
  const p = addPlayer(room, 'A').player;
  addPlayer(room, 'B', { isBot: true });
  startGame(room);
  room.turn = 0;
  room.rng = seqRng([2 / 6, 2 / 6, 0]); // 3,3,1
  act(room, p.id, { type: 'roll' });
  expect(room.phase === 'dice' && room.diceOptions.length === 3, '三颗骰子给出三个选项');
  expect(act(room, p.id, { type: 'pickDice', i: 0 }).ok, '选择 3+3');
  expect(p.pos === 6, `按选择的点数移动（实际 ${p.pos}）`);
  expect(room.rollDouble === true, '选到双数');
}
{
  const room = createRoom('DICE2');
  room.missionsEnabled = false;
  room.diceMode = 'three';
  const p = addPlayer(room, 'A').player;
  addPlayer(room, 'B', { isBot: true });
  startGame(room);
  room.turn = 0;
  room.rng = seqRng([0, 1 / 6, 2 / 6]); // 1,2,3
  p.planPoints = 1;
  act(room, p.id, { type: 'roll' });
  act(room, p.id, { type: 'pickDice', i: 0 }); // 1+2=3
  expect(room.phase === 'adjust', '有规划点时进入调整');
  act(room, p.id, { type: 'adjustRoll', delta: 1 });
  expect(p.pos === 4, `调整 +1 后走 4 格（实际 ${p.pos}）`);
  expect(p.planPoints === 0, '消耗 1 枚规划点');
}
{
  const room = createRoom('DICE3');
  room.missionsEnabled = false;
  room.diceMode = 'three';
  const p = addPlayer(room, 'A').player;
  addPlayer(room, 'B', { isBot: true });
  startGame(room);
  room.turn = 0;
  p.inJail = true;
  p.pos = 10;
  p.jailTurns = 0;
  room.rng = seqRng([2 / 6, 2 / 6, 0]); // 3,3,1
  act(room, p.id, { type: 'roll' });
  act(room, p.id, { type: 'pickDice', i: 0 }); // 双数 3+3
  expect(p.inJail === false, '选到双数可以出狱');
  expect(p.pos === 16, `出狱后移动 6 格（实际 ${p.pos}）`);
}
{
  const room = createRoom('DICE-BOT');
  room.missionsEnabled = false;
  room.diceMode = 'three';
  addPlayer(room, '机器人A', { isBot: true });
  addPlayer(room, '机器人B', { isBot: true });
  startGame(room);
  let guard = 0;
  while (room.phase === 'roll' || room.phase === 'dice' || room.phase === 'adjust') {
    tickBots(room);
    if (guard++ > 20) break;
  }
  expect(room.phase !== 'dice' && room.phase !== 'adjust', '机器人能自己选骰子/调整');
}

console.log('\n道具二选一在下回合开始');
{
  const { room, players } = makeGame(2);
  room.missionsEnabled = false;
  const [a, b] = players;
  a.itemChoices = ['dice', 'shield'];
  room.turn = 1; // 让 b 结束回合，轮到 a
  room.phase = 'end';
  room.turnStartedAt = Date.now();
  expect(act(room, b.id, { type: 'end' }).ok, 'B 结束回合');
  expect(room.phase === 'item' && room.turn === 0, '轮到 A 时先选道具');
  const before = a.items.length;
  expect(act(room, a.id, { type: 'pickItem', i: 1 }).ok, 'A 选择第二个道具');
  expect(a.items.length === before + 1 && a.items.includes('shield'), '拿到免租卡');
  expect(room.phase === 'roll', '选完道具进入掷骰');
}

console.log('\n净资产与财富系数可见');
{
  const { room, players } = makeGame(2);
  const v = view(room, players[0].id);
  const p0 = v.players.find((p) => p.id === players[0].id);
  const p1 = v.players.find((p) => p.id === players[1].id);
  expect(typeof p0.worth === 'number' && p0.worth >= 1500, '玩家视图包含总资产');
  expect(p0.wealthFactor >= 0.5 && p0.wealthFactor <= 2, `财富系数在 0.5–2 之间（${p0.wealthFactor}）`);
  expect(p1.wealthFactor >= 0.5 && p1.wealthFactor <= 2, '其他玩家的系数也可见');
}

console.log(`\n🎉 新玩法单测全部通过（${passed} 项断言）`);
