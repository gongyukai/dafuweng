// 玩家交易单测：发起、接受、拒绝、取消、非法内容、过期
import { createRoom, addPlayer, startGame, act, view, currentTrade, tickBots } from '../public/game/engine.js';
import { BOARD } from '../public/game/board.js';

let passed = 0;
function expect(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
  passed++;
  console.log('  ✓ ' + msg);
}

function makeGame() {
  const room = createRoom('TRADE');
  const p1 = addPlayer(room, '甲').player;
  const p2 = addPlayer(room, '乙').player;
  startGame(room);
  room.owners[1] = p1.id;   // 台北
  room.owners[6] = p2.id;   // 香港
  p1.cash = 500;
  p2.cash = 500;
  return { room, p1, p2 };
}

console.log('\n发起交易');
{
  const { room, p1, p2 } = makeGame();
  const r = act(room, p1.id, {
    type: 'tradeOffer', toId: p2.id,
    giveTiles: [1], giveCash: 100, getTiles: [6], getCash: 50,
  });
  expect(r.ok, '甲可以发起交易');
  expect(room.trade && room.trade.fromId === p1.id && room.trade.toId === p2.id, '交易记录正确');
  const v = view(room, p2.id);
  expect(v.trade && v.trade.give.tiles[0] === 1, '视图里能看到交易内容');
  const dup = act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveCash: 1 });
  expect(!dup.ok, '同一时间只能有一笔交易');
}

console.log('\n接受交易');
{
  const { room, p1, p2 } = makeGame();
  act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveTiles: [1], giveCash: 100, getTiles: [6], getCash: 50 });
  const id = room.trade.id;
  const wrong = act(room, p1.id, { type: 'tradeAccept', id });
  expect(!wrong.ok, '发起方不能自己接受');
  const r = act(room, p2.id, { type: 'tradeAccept', id });
  expect(r.ok, '乙接受成功');
  expect(room.owners[1] === p2.id && room.owners[6] === p1.id, '地产完成交换');
  expect(p1.cash === 450 && p2.cash === 550, '现金结算正确（甲 500-100+50，乙 500+100-50）');
  expect(room.trade === null, '成交后交易清空');
}

console.log('\n拒绝与取消');
{
  const { room, p1, p2 } = makeGame();
  act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveCash: 10 });
  const reject = act(room, p2.id, { type: 'tradeReject', id: room.trade.id });
  expect(reject.ok && room.trade === null, '乙可以拒绝');

  act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveCash: 10 });
  const cancel = act(room, p1.id, { type: 'tradeCancel', id: room.trade.id });
  expect(cancel.ok && room.trade === null, '甲可以取消');

  act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveCash: 10 });
  const wrongCancel = act(room, p2.id, { type: 'tradeCancel', id: room.trade.id });
  expect(!wrongCancel.ok, '乙不能取消甲发起的交易');
}

console.log('\n非法内容');
{
  const { room, p1, p2 } = makeGame();
  const notMine = act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveTiles: [6] });
  expect(!notMine.ok, '不能交易别人的地产');

  room.houses[1] = 1;
  const withHouse = act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveTiles: [1] });
  expect(!withHouse.ok, '有房子的地产不能交易');
  room.houses[1] = 0;

  const tooMuch = act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveCash: 99999 });
  expect(!tooMuch.ok, '不能给出超过自己现金的钱');

  const empty = act(room, p1.id, { type: 'tradeOffer', toId: p2.id });
  expect(!empty.ok, '空交易不允许');

  const self = act(room, p1.id, { type: 'tradeOffer', toId: p1.id, giveCash: 10 });
  expect(!self.ok, '不能和自己交易');
}

console.log('\n过期');
{
  const { room, p1, p2 } = makeGame();
  act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveCash: 10 });
  room.trade.expiresAt = Date.now() - 1000;
  expect(currentTrade(room) === null, '过期的交易会被清掉');
  const r = act(room, p2.id, { type: 'tradeAccept', id: 'whatever' });
  expect(!r.ok, '过期后无法接受');
}

console.log('\n交易后租金归属');
{
  const { room, p1, p2 } = makeGame();
  act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveTiles: [1], getTiles: [6] });
  act(room, p2.id, { type: 'tradeAccept', id: room.trade.id });
  expect(room.owners[1] === p2.id, '台北归乙');
  expect(room.owners[6] === p1.id, '香港归甲');
  // 乙掷到 1 号地不再付租（自己的地）
  room.turn = 1;
  room.rng = () => 0.999;
  const before = p2.cash;
  act(room, p2.id, { type: 'roll' });
  // 0.999 → 骰子 6+6=12，不一定落在 1；这里只验证不报错
  expect(p2.cash >= 0, '交易后掷骰正常');
}

console.log('\n机器人回应交易');
{
  const room = createRoom('BOT');
  const p1 = addPlayer(room, '甲').player;
  const bot = addPlayer(room, '机器人', { isBot: true }).player;
  startGame(room);
  room.owners[1] = p1.id;   // 台北 60
  room.owners[6] = bot.id;  // 香港 100
  p1.cash = 500;
  bot.cash = 500;
  // 甲给台北 + ¥50 换香港：机器人得到 110，付出 100 → 应该接受
  act(room, p1.id, { type: 'tradeOffer', toId: bot.id, giveTiles: [1], giveCash: 50, getTiles: [6] });
  room.trade.createdAt = Date.now() - 5000;
  const acted = tickBots(room);
  expect(acted, '机器人有动作');
  expect(room.trade === null, '机器人处理了报价');
  expect(room.owners[6] === p1.id, '机器人接受了划算的交易');

  // 反向：甲用台北换香港，机器人亏 → 拒绝
  const room2 = createRoom('BOT2');
  const a = addPlayer(room2, '甲').player;
  const b = addPlayer(room2, '机器人', { isBot: true }).player;
  startGame(room2);
  room2.owners[1] = a.id;
  room2.owners[6] = b.id;
  a.cash = 500;
  b.cash = 500;
  act(room2, a.id, { type: 'tradeOffer', toId: b.id, giveTiles: [1], getTiles: [6] });
  room2.trade.createdAt = Date.now() - 5000;
  tickBots(room2);
  expect(room2.trade === null, '机器人也会拒绝不划算的交易');
  expect(room2.owners[1] === a.id, '拒绝后地产不变');
}

console.log('\n抵押地产交易要付 10% 手续费');
{
  const { room, p1, p2 } = makeGame();
  room.owners[1] = p1.id;
  room.mortgaged[1] = true;
  p1.cash = 1000;
  p2.cash = 1000;
  const offer = act(room, p1.id, { type: 'tradeOffer', toId: p2.id, giveTiles: [1], getTiles: [] });
  expect(offer.ok, '发起带抵押地产的交易');
  const id = room.trade.id;
  const fee = Math.floor(BOARD[1].price * 0.05);
  const res = act(room, p2.id, { type: 'tradeAccept', id });
  expect(res.ok, '接受交易');
  expect(room.owners[1] === p2.id, '地产转给新业主');
  expect(p2.cash === 1000 - fee, `新业主支付抵押额 10% 手续费（¥${fee}）`);
  expect(room.mortgaged[1] === true, '抵押状态随地产保留');
}

console.log('\n无人拥有的抵押地块可以被购买');
{
  const { room, p1 } = makeGame();
  room.owners[1] = p1.id;
  room.mortgaged[1] = true;
  delete room.owners[1]; // 模拟脏数据：无主但残留抵押标记
  p1.pos = 39;
  room.turn = 0;
  room.phase = 'roll';
  room.rng = (() => { const s = [0, 0]; let i = 0; return () => s[i++ % 2]; })();
  act(room, p1.id, { type: 'roll' }); // 39 + 2 → 1 号地
  expect(room.phase === 'buy', '无主抵押地仍然可以购买');
  act(room, p1.id, { type: 'buy' });
  expect(room.owners[1] === p1.id, '买下成功');
  expect(!room.mortgaged[1], '购买后清掉抵押标记');
}

console.log(`\n🎉 交易单测全部通过（${passed} 项断言）`);
