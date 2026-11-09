// 规则单测：不靠随机，直接构造局面验证关键规则
import { createRoom, addPlayer, startGame, act, view, rentFor } from '../public/game/engine.js';
import { BOARD } from '../public/game/board.js';

let passed = 0;
function expect(cond, msg) {
  if (!cond) {
    console.error('❌ ' + msg);
    process.exit(1);
  }
  passed++;
  console.log('  ✓ ' + msg);
}

function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

function makeGame(players = 2) {
  const room = createRoom('TEST');
  const list = [];
  for (let i = 0; i < players; i++) list.push(addPlayer(room, `玩家${i + 1}`).player);
  startGame(room);
  room.rng = seqRng([0.5, 0.5]);
  return { room, p1: list[0], p2: list[1], list };
}

console.log('\n掷骰与买地');
{
  const { room, p1 } = makeGame();
  room.rng = seqRng([1 / 6, 2 / 6]); // 2 + 3 = 5 → 台北车站
  const r = act(room, p1.id, { type: 'roll' });
  expect(r.ok, '掷骰成功');
  expect(p1.pos === 5, '落在第 5 格（台北车站）');
  expect(room.pendingBuy === 5, '出现购买提示');
  const cashBefore = p1.cash;
  act(room, p1.id, { type: 'buy' });
  expect(room.owners[5] === p1.id, '买下车站后归自己');
  expect(p1.cash === cashBefore - 200, '扣款 200');
  expect(room.phase === 'end', '非双数，进入结束回合阶段');
}

console.log('\n双数再掷');
{
  const { room, p1 } = makeGame();
  room.rng = seqRng([0.5, 0.5]); // 4 + 4
  act(room, p1.id, { type: 'roll' });
  expect(p1.pos === 8, '落在第 8 格');
  expect(room.phase === 'buy', '先处理购买');
  act(room, p1.id, { type: 'buy' });
  expect(room.phase === 'roll', '双数买完还能再掷一次');
}

console.log('\n回合校验');
{
  const { room, p2 } = makeGame();
  const r = act(room, p2.id, { type: 'roll' });
  expect(!r.ok, '不是自己的回合不能掷骰');
  const r2 = act(room, p2.id, { type: 'end' });
  expect(!r2.ok, '不是自己的回合不能结束回合');
}

console.log('\n同色租金翻倍');
{
  const { room, p1, p2 } = makeGame();
  room.owners[6] = p2.id;
  room.owners[8] = p2.id;
  room.owners[9] = p2.id;
  room.dice = [3, 4];
  expect(rentFor(room, 6) === BOARD[6].rent[0] * 2, '集齐三块浅蓝，租金翻倍');
  room.houses[6] = 1;
  expect(rentFor(room, 6) === BOARD[6].rent[1], '有房子时按房子档位算');
  room.mortgaged[6] = true;
  expect(rentFor(room, 6) === 0, '抵押中的地产不收租');
}

console.log('\n均衡建造 / 旅馆');
{
  const { room, p1 } = makeGame();
  room.owners[1] = p1.id;
  room.owners[3] = p1.id;
  p1.cash = 5000;
  expect(act(room, p1.id, { type: 'build', i: 1 }).ok, '同色齐全可以盖房');
  const again = act(room, p1.id, { type: 'build', i: 1 });
  expect(!again.ok, '不能只在一块地上连盖（必须均衡）');
  expect(act(room, p1.id, { type: 'build', i: 3 }).ok, '补齐另一块可以继续');
  for (let i = 0; i < 3; i++) {
    act(room, p1.id, { type: 'build', i: 1 });
    act(room, p1.id, { type: 'build', i: 3 });
  }
  expect(room.houses[1] === 4 && room.houses[3] === 4, '两边都是 4 栋房子');
  act(room, p1.id, { type: 'build', i: 1 });
  expect(room.houses[1] === 5, '第 5 栋是旅馆');
  const maxed = act(room, p1.id, { type: 'build', i: 1 });
  expect(!maxed.ok, '旅馆之后不能再盖');
}

console.log('\n卖房均衡');
{
  const { room, p1 } = makeGame();
  room.owners[1] = p1.id;
  room.owners[3] = p1.id;
  room.houses[1] = 2;
  room.houses[3] = 1;
  const fail = act(room, p1.id, { type: 'sellHouse', i: 3 });
  expect(!fail.ok, '不能先卖房子少的一边（会拉开差距）');
  expect(act(room, p1.id, { type: 'sellHouse', i: 1 }).ok, '从房子多的一边卖，保持均衡');
}

console.log('\n抵押与赎回');
{
  const { room, p1 } = makeGame();
  room.owners[1] = p1.id;
  room.houses[1] = 1;
  const blocked = act(room, p1.id, { type: 'mortgage', i: 1 });
  expect(!blocked.ok, '有房子时不能抵押');
  room.houses[1] = 0;
  p1.cash = 100;
  const m = act(room, p1.id, { type: 'mortgage', i: 1 });
  expect(m.ok && room.mortgaged[1] === true, '抵押成功');
  expect(p1.cash === 130, '抵押获得地价一半（60 / 2 = 30）');
  const rent = rentFor(room, 1);
  expect(rent === 0, '抵押后不收租');
  p1.cash = 100;
  const u = act(room, p1.id, { type: 'unmortgage', i: 1 });
  expect(u.ok && room.mortgaged[1] === false, '赎回成功');
  expect(p1.cash === 100 - Math.ceil(60 * 0.55), '赎回支付 55% 地价');
}

console.log('\n自动变卖抵债');
{
  const { room, p1, p2 } = makeGame();
  room.owners[1] = p1.id;
  room.owners[3] = p1.id;
  room.houses[1] = 3;
  room.houses[3] = 3;
  p1.cash = 10;
  p2.cash = 1000;
  // 玩家 1 掷到 5 号车站（属于玩家 2），租金 25，钱不够会自动卖房
  room.owners[5] = p2.id;
  room.rng = seqRng([1 / 6, 2 / 6]);
  act(room, p1.id, { type: 'roll' });
  expect(p1.cash >= 0, '现金不会变成负数');
  expect(room.owners[1] === p1.id, '还完债仍保有地产');
}

console.log('\n破产转移');
{
  const { room, p1, p2 } = makeGame();
  room.owners[1] = p1.id;
  room.owners[3] = p1.id;
  room.owners[5] = p2.id;
  p1.cash = 5;
  p2.cash = 1000;
  // 让租金远超资产：玩家 2 在 1 号地盖满旅馆
  room.owners[1] = p2.id;
  room.houses[1] = 5;
  p1.pos = 39;
  room.rng = seqRng([0, 0]); // 1 + 1 = 2，39 + 2 = 41 → 1 号地
  act(room, p1.id, { type: 'roll' });
  expect(p1.bankrupt, '资不抵债后破产');
  expect(p1.cash === 0, '破产后现金清零');
  expect(room.owners[1] === p2.id, '地产转移给债主');
  const alive = room.players.filter((p) => !p.bankrupt);
  expect(alive.length === 1 && room.phase === 'ended', '只剩一人时游戏结束');
  expect(room.winnerId === p2.id, '胜者是债主');
}

console.log('\n视图不泄露 token');
{
  const { room, p1 } = makeGame();
  const v = view(room, p1.id);
  const text = JSON.stringify(v);
  expect(!text.includes('"token"'), 'view 里没有 token 字段');
}

console.log('\n重开一局');
{
  const { room, p1 } = makeGame();
  room.phase = 'ended';
  room.winnerId = p1.id;
  const r = act(room, p1.id, { type: 'restart' });
  expect(r.ok && room.phase === 'lobby', '房主可以重开');
  expect(room.players.length === 2, '玩家保留');
  const r2 = act(room, p1.id, { type: 'start' });
  expect(r2.ok && room.phase === 'roll', '重开后能再次开局');
  expect(room.round === 1, '回合数重置');
}

console.log(`\n🎉 规则单测全部通过（${passed} 项断言）`);
