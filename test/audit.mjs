import {
  createRoom, addPlayer, startGame, act, view, MISSIONS, resetRoom,
  missionTarget, missionRewardBase, missionText,
} from '../public/game/engine.js';
import { GROUPS } from '../public/game/board.js';

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.log('❌ ' + m); } };
const make = (n, code = 'A') => {
  const room = createRoom(code);
  room.missionsEnabled = true;
  const players = [];
  for (let i = 0; i < n; i++) players.push(addPlayer(room, 'P' + i, { isBot: true }).player);
  startGame(room);
  return { room, players };
};

for (let n = 2; n <= 6; n++) {
  const { room, players } = make(n, 'A' + n);
  ok(players.every((p) => p.mission), `${n} 人：每人都有任务`);
  ok(new Set(players.map((p) => p.mission)).size === n, `${n} 人：任务不重复`);
  ok(players.every((p) => MISSIONS.some((m) => m.id === p.mission)), `${n} 人：任务都在池里`);
  if (n >= 5) ok(players.every((p) => p.mission !== 'rails'), `${n} 人：不出现车站任务`);
  const railDef = MISSIONS.find((m) => m.id === 'rails');
  ok(railDef.min === 2 && railDef.max === 4, '车站任务定义限制为 2–4 人');
  for (const p of players) {
    const def = MISSIONS.find((m) => m.id === p.mission);
    ok(p.missionTarget === missionTarget(def, n), `${n} 人 ${p.mission} 目标一致`);
    ok(p.missionRewardBase === missionRewardBase(def, n), `${n} 人 ${p.mission} 奖励一致`);
    ok(p.missionText === missionText(def, n), `${n} 人 ${p.mission} 文案一致`);
  }
  const v = view(room, players[0].id);
  ok(v.players[0].missionText === players[0].missionText, `${n} 人：自己能看到任务文案`);
  ok(v.players[0].missionProgress && typeof v.players[0].missionProgress.cur === 'number', `${n} 人：自己有进度`);
  ok(v.players[1].mission === null && v.players[1].missionText === null, `${n} 人：看不到别人的任务`);
  ok(v.players[1].missionProgress === null, `${n} 人：看不到别人的进度`);
  room.phase = 'ended';
  ok(view(room, players[0].id).players[1].missionText === players[1].missionText, `${n} 人：结束后任务公开`);
}

// 收租计数（正常支付，先塞满道具防止领到免租卡）
{
  const { room, players } = make(2, 'RENT');
  room.missionsEnabled = false;
  const [a, b] = players;
  room.turn = 0;
  room.phase = 'roll';
  room.owners[1] = b.id;
  a.pos = 39;
  a.forcedDice = 2;
  a.items = ['dice', 'dice', 'dice'];
  act(room, a.id, { type: 'roll' });
  ok(b.rentIncome > 0, `正常付租应计入收租（实际 ${b.rentIncome}）`);
}

// 收租计数（免租询问后选择付租）
{
  const { room, players } = make(2, 'RENT2');
  room.missionsEnabled = false;
  const [a, b] = players;
  room.turn = 0;
  room.phase = 'roll';
  room.owners[1] = b.id;
  a.pos = 39;
  a.forcedDice = 2;
  a.isBot = false;
  a.items = ['shield'];
  act(room, a.id, { type: 'roll' });
  ok(room.phase === 'rent', '进入免租询问');
  act(room, a.id, { type: 'payRent' });
  ok(b.rentIncome > 0, `选择付租也应计入收租（实际 ${b.rentIncome}）`);
}

// 交易计数
{
  const { room, players } = make(2, 'TR');
  const [a, b] = players;
  room.turn = 0;
  room.phase = 'end';
  act(room, a.id, { type: 'tradeOffer', toId: b.id, giveCash: 10, getCash: 0, giveTiles: [], getTiles: [] });
  ok(!!room.trade, '发起交易');
  act(room, b.id, { type: 'tradeAccept', id: room.trade.id });
  ok(a.tradesDone === 1 && b.tradesDone === 1, `双方交易计数 +1（${a.tradesDone}/${b.tradesDone}）`);
}

// 道具计数
{
  const { room, players } = make(2, 'IT');
  const [a] = players;
  room.turn = 0;
  room.phase = 'roll';
  a.items = ['dice'];
  act(room, a.id, { useItem: true, type: 'useItem', item: 'dice', value: 4 });
  ok(a.itemsUsed === 1, `使用道具计数 +1（实际 ${a.itemsUsed}）`);
}

// 旅馆 / 双组同色判定
{
  const { room, players } = make(3, 'HT');
  const [a] = players;
  room.turn = 0;
  room.phase = 'end';
  room.round = 5;
  room.lastEventRound = 5;
  const g = GROUPS[Object.keys(GROUPS)[0]];
  g.tiles.forEach((i) => { room.owners[i] = a.id; });
  room.houses[g.tiles[0]] = 5;
  a.mission = 'hotel'; a.missionTarget = 1; a.missionText = '建成 1 座旅馆（5 栋房子）'; a.missionRewardBase = 800;
  a.cash = 4000;
  act(room, a.id, { type: 'end' });
  ok(a.missionDone === true, '旅馆任务可以完成');
}
{
  const { room, players } = make(3, 'TS');
  const [a] = players;
  room.turn = 0;
  room.phase = 'end';
  room.round = 5;
  room.lastEventRound = 5;
  const gs = Object.values(GROUPS).slice(0, 2);
  gs.forEach((g) => g.tiles.forEach((i) => { room.owners[i] = a.id; }));
  a.mission = 'twoSets'; a.missionTarget = 2; a.missionText = '集齐 2 组同色地块'; a.missionRewardBase = 800;
  a.cash = 4000;
  act(room, a.id, { type: 'end' });
  ok(a.missionDone === true, '双组同色任务可以完成');
}

// 再来一局后任务重新分配
{
  const { room, players } = make(3, 'RS');
  resetRoom(room);
  ok(players.every((p) => p.mission === null && p.missionTarget === 0), '重置后任务清空');
  startGame(room);
  ok(players.every((p) => p.mission && p.missionTarget > 0 && p.missionText && p.missionRewardBase > 0), '新一局任务重新下发');
}

// 财富系数边界
{
  const { room, players } = make(2, 'F');
  const [a, b] = players;
  room.turn = 0;
  room.phase = 'end';
  room.round = 5;
  room.lastEventRound = 5;
  a.mission = 'assets'; a.missionTarget = 3200; a.missionText = '总资产达到 ¥3200'; a.missionRewardBase = 600;
  b.mission = 'lands'; b.missionTarget = 99;
  a.cash = 3200; b.cash = 5000;
  act(room, a.id, { type: 'end' });
  const gain = a.cash - 3200;
  ok(gain >= 300 && gain <= 1200, `系数在 0.5–2.0 内（实得 ${gain}）`);
}

console.log(failed ? `\n${failed} 项异常` : '\n✅ 审计全部通过');
process.exit(failed ? 1 : 0);
