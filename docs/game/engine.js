// 同构规则引擎：Node 服务端和浏览器房主模式共用同一份代码
import { BOARD, GROUPS, RAIL_TILES, UTIL_TILES } from './board.js';
import { CHANCE, CHEST, DECK_NAME } from './cards.js';

export const COLORS = ['#e14b4b', '#3d8ee0', '#e5c33c', '#3fae62', '#a165d8', '#e8853a'];

// 可选棋子（Twemoji 素材，CC-BY 4.0）
export const PIECES = [
  { id: 'car', name: '跑车', file: '1f697.svg' },
  { id: 'taxi', name: '出租车', file: '1f695.svg' },
  { id: 'rocket', name: '火箭', file: '1f680.svg' },
  { id: 'heli', name: '直升机', file: '1f681.svg' },
  { id: 'boat', name: '帆船', file: '26f5.svg' },
  { id: 'horse', name: '赛马', file: '1f40e.svg' },
  { id: 'penguin', name: '企鹅', file: '1f427.svg' },
  { id: 'dino', name: '恐龙', file: '1f996.svg' },
  { id: 'hat', name: '礼帽', file: '1f3a9.svg' },
  { id: 'cat', name: '小猫', file: '1f431.svg' },
  { id: 'fox', name: '狐狸', file: '1f98a.svg' },
  { id: 'panda', name: '熊猫', file: '1f43c.svg' },
];

export function pieceOf(id) {
  return PIECES.find((p) => p.id === id) || PIECES[0];
}

function nextFreePiece(room) {
  const used = new Set(room.players.map((p) => p.piece));
  return (PIECES.find((p) => !used.has(p.id)) || PIECES[0]).id;
}
export const START_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const MAX_PLAYERS = 6;
// 回合上限：防止所有人都不破产导致无限对局，到点按净资产判胜
export const DEFAULT_ROUND_LIMIT = 50;
const BOT_NAMES = ['阿福', '小美', '老王', '阿强', '丽丽'];

// ---------------- 秘密任务 / 道具 / 事件 / 电脑性格 ----------------

export const MISSION_MIN_ROUND = 5;

export const MISSIONS = [
  { id: 'monopoly', text: '集齐任意一组同色地块' },
  { id: 'cash', text: '现金达到 ¥2200' },
  { id: 'lands', text: '拥有 8 块地产' },
  { id: 'houses', text: '建成 3 栋房子' },
  { id: 'rails', text: '拥有 3 个车站' },
];

export const ITEMS = {
  dice: { name: '遥控骰子', desc: '指定本次骰子总点数（2–12）' },
  shield: { name: '免租卡', desc: '下一次被收租自动抵消' },
  demolish: { name: '拆迁卡', desc: '拆掉对手一栋房子' },
  equalize: { name: '均富卡', desc: '所有玩家现金平均' },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const MAX_ITEMS = 3;

export const PERSONAS = {
  aggressive: '激进',
  steady: '稳健',
  collector: '收藏家',
  trickster: '捣蛋',
};
export const PERSONA_IDS = Object.keys(PERSONAS);

export const EVENTS = [
  { id: 'boom', name: '经济繁荣', text: '本回合所有租金翻倍' },
  { id: 'rail', name: '旅游旺季', text: '本回合车站租金翻倍' },
  { id: 'typhoon', name: '台风过境', text: '每位有房的玩家损失一栋房子' },
  { id: 'charity', name: '慈善晚宴', text: '最富的玩家把 10% 现金送给最穷的' },
  { id: 'tax', name: '税务稽查', text: '所有人缴纳 10% 现金' },
];

let seq = 0;
const uid = (pre) => `${pre}${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ok = () => ({ ok: true });
const fail = (err) => ({ ok: false, err });

function pushLog(room, text, kind = 'info') {
  room.logSeq = (room.logSeq || 0) + 1;
  room.log.push({ id: room.logSeq, text, kind });
  if (room.log.length > 120) room.log.splice(0, room.log.length - 120);
}

function byId(room, id) {
  return room.players.find((p) => p.id === id) || null;
}

export function currentPlayer(room) {
  return room.players[room.turn] || null;
}

export function alivePlayers(room) {
  return room.players.filter((p) => !p.bankrupt);
}

export function createRoom(code) {
  const room = {
    code,
    phase: 'lobby',
    hostId: null,
    players: [],
    owners: {},
    houses: {},
    mortgaged: {},
    turn: 0,
    dice: [0, 0],
    again: false,
    doubles: 0,
    pendingBuy: null,
    lastCard: null,
    trade: null,
    event: null,
    missionWin: null,
    missionsEnabled: false,
    winnerId: null,
    log: [],
    logSeq: 0,
    chat: [],
    chatSeq: 0,
    seq: 0,
    chance: [],
    chest: [],
    chancePos: 0,
    chestPos: 0,
    rng: Math.random,
    round: 1,
    roundLimit: DEFAULT_ROUND_LIMIT,
    lastEventRound: 0,
    createdAt: Date.now(),
    lastActionAt: Date.now(),
  };
  resetDecks(room);
  return room;
}

function resetDecks(room) {
  room.chance = shuffle(CHANCE.map((_, i) => i), room.rng);
  room.chest = shuffle(CHEST.map((_, i) => i), room.rng);
  room.chancePos = 0;
  room.chestPos = 0;
}

export function resetRoom(room) {
  room.phase = 'lobby';
  room.owners = {};
  room.houses = {};
  room.mortgaged = {};
  room.turn = 0;
  room.round = 1;
  room.lastEventRound = 0;
  room.dice = [0, 0];
  room.again = false;
  room.doubles = 0;
  room.pendingBuy = null;
  room.lastCard = null;
  room.trade = null;
  room.event = null;
  room.missionWin = null;
  room.winnerId = null;
  room.finalRank = null;
  room.log = [];
  room.chat = [];
  room.logSeq = 0;
  room.chatSeq = 0;
  room.seq++;
  resetDecks(room);
  for (const p of room.players) {
    p.cash = START_CASH;
    p.pos = 0;
    p.inJail = false;
    p.jailTurns = 0;
    p.jailCards = 0;
    p.bankrupt = false;
    p.items = [];
    p.shield = false;
    p.mission = null;
    p.missionDone = false;
    p.forcedDice = 0;
  }
  pushLog(room, '新的一局开始了，等待房主开局', 'system');
}

export function addPlayer(room, name, opts = {}) {
  if (room.phase !== 'lobby') return { ok: false, err: '游戏已经开始，无法加入' };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, err: '房间已满（最多 6 人）' };
  const clean = String(name || '').trim().slice(0, 10) || '玩家';
  const p = {
    id: uid('p'),
    token: opts.token || uid('t'),
    name: clean,
    color: COLORS[room.players.length % COLORS.length],
    piece: nextFreePiece(room),
    cash: START_CASH,
    pos: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    isBot: !!opts.isBot,
    connected: true,
    isHost: false,
    items: [],
    shield: false,
    mission: null,
    missionDone: false,
    persona: opts.persona || (opts.isBot ? PERSONA_IDS[Math.floor(Math.random() * PERSONA_IDS.length)] : null),
    joinedAt: Date.now(),
  };
  room.players.push(p);
  if (!room.hostId && !p.isBot) room.hostId = p.id;
  p.isHost = p.id === room.hostId;
  room.seq++;
  pushLog(room, `${p.name} 加入了房间`, 'system');
  return { ok: true, player: p };
}

export function removePlayer(room, id) {
  if (room.phase !== 'lobby') return { ok: false, err: '游戏开始后不能移除玩家' };
  const idx = room.players.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, err: '玩家不存在' };
  const p = room.players[idx];
  if (p.id === room.hostId) return { ok: false, err: '房主不能被移除' };
  room.players.splice(idx, 1);
  room.players.forEach((p, i) => { p.color = COLORS[i % COLORS.length]; });
  room.seq++;
  pushLog(room, `${p.name} 离开了房间`, 'system');
  return { ok: true };
}

// ---------------- 玩家间交易 ----------------

function tileOkForTrade(room, i, ownerId) {
  const tile = BOARD[i];
  if (!tile) return false;
  if (room.owners[i] !== ownerId) return false;
  if ((room.houses[i] || 0) > 0) return false;
  return true;
}

function tradeText(room, side) {
  const parts = [];
  if (side.cash > 0) parts.push(`¥${side.cash}`);
  for (const i of side.tiles) parts.push(BOARD[i].name);
  return parts.length ? parts.join(' + ') : '什么也不给';
}

export function currentTrade(room) {
  if (!room.trade) return null;
  if (Date.now() > room.trade.expiresAt) { room.trade = null; return null; }
  return room.trade;
}

function handleTrade(room, p, action) {
  if (room.phase === 'lobby' || room.phase === 'ended') return fail('现在不能交易');
  const type = action.type;
  const trade = currentTrade(room);

  if (type === 'tradeOffer') {
    if (trade) return fail('已经有一笔交易在处理中');
    const to = byId(room, action.toId);
    if (!to || to.bankrupt) return fail('对方不在对局中');
    if (to.id === p.id) return fail('不能和自己交易');
    const giveTiles = [...new Set((action.giveTiles || []).map(Number).filter(Number.isInteger))];
    const getTiles = [...new Set((action.getTiles || []).map(Number).filter(Number.isInteger))];
    const giveCash = Math.max(0, Math.floor(Number(action.giveCash) || 0));
    const getCash = Math.max(0, Math.floor(Number(action.getCash) || 0));
    if (giveCash > p.cash) return fail('你给出的现金不够');
    if (getCash > to.cash) return fail('对方现金不够');
    for (const i of giveTiles) {
      if (!tileOkForTrade(room, i, p.id)) return fail(`${BOARD[i] ? BOARD[i].name : '该地块'} 不能交易（不是你的，或上面有房子）`);
    }
    for (const i of getTiles) {
      if (!tileOkForTrade(room, i, to.id)) return fail(`${BOARD[i] ? BOARD[i].name : '该地块'} 不能交易（不属于对方，或上面有房子）`);
    }
    if (!giveTiles.length && !getTiles.length && !giveCash && !getCash) return fail('交易内容为空');
    room.trade = {
      id: uid('tr'),
      fromId: p.id,
      toId: to.id,
      give: { cash: giveCash, tiles: giveTiles },
      get: { cash: getCash, tiles: getTiles },
      createdAt: Date.now(),
      expiresAt: Date.now() + 120000,
    };
    pushLog(room, `${p.name} 向 ${to.name} 发起交易：给 ${tradeText(room, room.trade.give)}，换 ${tradeText(room, room.trade.get)}`, 'trade');
    room.seq++;
    return ok();
  }

  if (type === 'tradeAccept') {
    if (!trade) return fail('交易已失效');
    if (trade.id !== action.id) return fail('交易已失效');
    if (trade.toId !== p.id) return fail('这不是发给你的交易');
    const from = byId(room, trade.fromId);
    if (!from || from.bankrupt) { room.trade = null; return fail('对方已破产'); }
    for (const i of trade.give.tiles) if (!tileOkForTrade(room, i, from.id)) return fail('交易内容已变化，请让对方重新发起');
    for (const i of trade.get.tiles) if (!tileOkForTrade(room, i, p.id)) return fail('交易内容已变化，请让对方重新发起');
    if (trade.give.cash > from.cash) return fail('对方现金不足');
    if (trade.get.cash > p.cash) return fail('你的现金不足');
    for (const i of trade.give.tiles) room.owners[i] = p.id;
    for (const i of trade.get.tiles) room.owners[i] = from.id;
    from.cash -= trade.give.cash;
    p.cash += trade.give.cash;
    p.cash -= trade.get.cash;
    from.cash += trade.get.cash;
    pushLog(room, `交易达成：${from.name} 得到 ${tradeText(room, trade.get)}，${p.name} 得到 ${tradeText(room, trade.give)}`, 'trade');
    room.trade = null;
    room.seq++;
    return ok();
  }

  if (type === 'tradeReject' || type === 'tradeCancel') {
    if (!trade || trade.id !== action.id) return fail('交易已失效');
    const allowed = type === 'tradeReject' ? trade.toId : trade.fromId;
    if (p.id !== allowed) return fail('你没有权限处理这笔交易');
    pushLog(room, type === 'tradeReject'
      ? `${p.name} 拒绝了交易`
      : `${p.name} 取消了交易`, 'trade');
    room.trade = null;
    room.seq++;
    return ok();
  }

  return fail('未知的交易操作');
}

export function startGame(room) {
  if (room.phase !== 'lobby') return { ok: false, err: '游戏已经开始' };
  if (room.players.length < 2) return { ok: false, err: '至少需要 2 名玩家（可以添加电脑玩家）' };
  room.phase = 'roll';
  room.turn = 0;
  room.round = 1;
  room.roundLimit = room.roundLimit || DEFAULT_ROUND_LIMIT;
  room.lastEventRound = 0;
  room.dice = [0, 0];
  room.again = false;
  room.doubles = 0;
  room.winnerId = null;
  room.finalRank = null;
  room.event = null;
  room.missionWin = null;
  const missionDeck = shuffle(MISSIONS, room.rng);
  room.players.forEach((p, i) => {
    p.mission = room.missionsEnabled ? missionDeck[i % missionDeck.length].id : null;
  });
  for (const p of room.players) {
    p.cash = START_CASH;
    p.pos = 0;
    p.inJail = false;
    p.jailTurns = 0;
    p.jailCards = 0;
    p.bankrupt = false;
    p.items = [];
    p.shield = false;
    p.forcedDice = 0;
    p.missionDone = false;
  }
  room.owners = {};
  room.houses = {};
  room.mortgaged = {};
  room.seq++;
  pushLog(room, `游戏开始，共 ${room.players.length} 位玩家，初始资金 ¥${START_CASH}`, 'system');
  pushLog(room, `轮到 ${currentPlayer(room).name} 掷骰子`, 'turn');
  return { ok: true };
}

// ---------------- 金钱 ----------------

function ownedTiles(room, id) {
  return Object.keys(room.owners)
    .filter((k) => room.owners[k] === id)
    .map(Number);
}

export function rentFor(room, tileIdx) {
  const tile = BOARD[tileIdx];
  const ownerId = room.owners[tileIdx];
  if (!ownerId || room.mortgaged[tileIdx]) return 0;
  let base = 0;
  if (tile.type === 'prop') {
    const g = GROUPS[tile.group];
    const houses = room.houses[tileIdx] || 0;
    if (houses > 0) base = tile.rent[Math.min(houses, 5)];
    else {
      const ownsAll = g.tiles.every((i) => room.owners[i] === ownerId);
      base = ownsAll ? tile.rent[0] * 2 : tile.rent[0];
    }
  } else if (tile.type === 'rail') {
    const n = RAIL_TILES.filter((i) => room.owners[i] === ownerId).length;
    base = [0, 25, 50, 100, 200][n] || 0;
  } else if (tile.type === 'util') {
    const n = UTIL_TILES.filter((i) => room.owners[i] === ownerId).length;
    const total = (room.dice[0] || 0) + (room.dice[1] || 0);
    base = total * (n === 2 ? 10 : 4);
  }
  // 全场事件加成
  if (room.event && room.event.round === room.round) {
    if (room.event.id === 'boom') base *= 2;
    if (room.event.id === 'rail' && tile.type === 'rail') base *= 2;
  }
  return Math.round(base);
}

function sellHouseToBank(room, p, i) {
  const tile = BOARD[i];
  if (tile.type !== 'prop') return false;
  const g = GROUPS[tile.group];
  const cur = room.houses[i] || 0;
  if (cur <= 0) return false;
  const max = Math.max(...g.tiles.map((x) => room.houses[x] || 0));
  if (cur < max) return false;
  room.houses[i] = cur - 1;
  p.cash += Math.floor(g.houseCost / 2);
  pushLog(room, `${p.name} 卖掉 ${tile.name} 的一栋房子，收回 ¥${Math.floor(g.houseCost / 2)}`, 'build');
  return true;
}

function mortgageTile(room, p, i) {
  const tile = BOARD[i];
  if (room.owners[i] !== p.id || room.mortgaged[i]) return false;
  if (tile.type === 'prop' && GROUPS[tile.group].tiles.some((x) => (room.houses[x] || 0) > 0)) return false;
  room.mortgaged[i] = true;
  const gain = Math.floor(tile.price / 2);
  p.cash += gain;
  pushLog(room, `${p.name} 抵押 ${tile.name}，获得 ¥${gain}`, 'money');
  return true;
}

function raiseFunds(room, p, need) {
  let guard = 0;
  while (p.cash < need && guard++ < 300) {
    const cand = ownedTiles(room, p.id)
      .filter((i) => (room.houses[i] || 0) > 0)
      .sort((a, b) => (room.houses[b] || 0) - (room.houses[a] || 0));
    let sold = false;
    for (const i of cand) { if (sellHouseToBank(room, p, i)) { sold = true; break; } }
    if (!sold) break;
  }
  guard = 0;
  while (p.cash < need && guard++ < 300) {
    const cand = ownedTiles(room, p.id).filter((i) => !room.mortgaged[i]);
    let done = false;
    for (const i of cand) { if (mortgageTile(room, p, i)) { done = true; break; } }
    if (!done) break;
  }
  if (p.cash < need) {
    pushLog(room, `${p.name} 变卖资产后仍无法还清债务`, 'bankrupt');
  }
}

function bankrupt(room, p, creditorId) {
  if (p.bankrupt) return;
  p.bankrupt = true;
  const creditor = creditorId ? byId(room, creditorId) : null;
  for (const i of ownedTiles(room, p.id)) {
    if (creditor && !creditor.bankrupt) {
      room.owners[i] = creditor.id;
      room.houses[i] = 0;
    } else {
      delete room.owners[i];
      delete room.houses[i];
      delete room.mortgaged[i];
    }
  }
  if (creditor && !creditor.bankrupt) {
    creditor.cash += p.cash;
    if (p.cash > 0) pushLog(room, `${p.name} 剩余 ¥${p.cash} 交给 ${creditor.name}`, 'money');
  }
  p.cash = 0;
  p.pos = 0;
  p.inJail = false;
  p.jailTurns = 0;
  p.jailCards = 0;
  if (room.trade && (room.trade.fromId === p.id || room.trade.toId === p.id)) room.trade = null;
  room.again = false;
  pushLog(room, `${p.name} 破产了！`, 'bankrupt');
  checkEnd(room);
}

function pay(room, from, amount, toId = null) {
  if (!from || from.bankrupt || amount <= 0) return 0;
  if (from.cash < amount) raiseFunds(room, from, amount);
  const paid = Math.min(from.cash, amount);
  from.cash -= paid;
  if (toId) {
    const to = byId(room, toId);
    if (to && !to.bankrupt) to.cash += paid;
  }
  if (paid < amount) bankrupt(room, from, toId);
  return paid;
}

function checkEnd(room) {
  if (room.phase === 'lobby' || room.phase === 'ended') return;
  const alive = alivePlayers(room);
  if (alive.length <= 1) {
    room.phase = 'ended';
    room.winnerId = alive[0] ? alive[0].id : null;
    finalizeRanking(room);
    pushLog(room, alive[0] ? `🏆 ${alive[0].name} 赢得了本局！` : '本局没有胜者', 'system');
  }
}

// ---------------- 移动 ----------------

function moveBy(room, p, steps) {
  if (steps === 0) return;
  const raw = p.pos + steps;
  if (raw >= 40) {
    p.cash += GO_SALARY;
    pushLog(room, `${p.name} 经过起点，领取 ¥${GO_SALARY}`, 'money');
    grantItem(room, p);
  }
  p.pos = ((raw % 40) + 40) % 40;
}

function moveToTile(room, p, target) {
  const steps = (target - p.pos + 40) % 40;
  if (steps === 0) return;
  moveBy(room, p, steps);
}

function goToJail(room, p) {
  p.pos = 10;
  p.inJail = true;
  p.jailTurns = 0;
  room.again = false;
  pushLog(room, `${p.name} 被送进监狱`, 'jail');
}

// ---------------- 道具 ----------------

function grantItem(room, p, id) {
  if (p.items.length >= MAX_ITEMS) {
    pushLog(room, `${p.name} 手牌已满（${MAX_ITEMS} 张），道具作废`, 'card');
    return null;
  }
  const item = id || ITEM_IDS[Math.floor(room.rng() * ITEM_IDS.length)];
  p.items.push(item);
  pushLog(room, `${p.name} 获得道具「${ITEMS[item].name}」`, 'card');
  return item;
}

function useItem(room, p, action) {
  if (room.phase === 'lobby' || room.phase === 'ended') return fail('现在不能使用道具');
  const item = action.item;
  if (!ITEMS[item]) return fail('没有这个道具');
  if (item === 'shield') return fail('免租卡会在被收租时自动生效');
  const idx = p.items.indexOf(item);
  if (idx < 0) return fail(`你没有「${ITEMS[item].name}」`);
  const cur = currentPlayer(room);
  if (!cur || cur.id !== p.id) return fail('只能在自己的回合使用道具');
  if (room.phase !== 'roll' && room.phase !== 'end') return fail('现在不能使用道具');

  if (item === 'dice') {
    const v = Math.floor(Number(action.value));
    if (!Number.isFinite(v) || v < 2 || v > 12) return fail('点数要在 2–12 之间');
    if (room.phase !== 'roll') return fail('遥控骰子要在掷骰前使用');
    p.forcedDice = v;
    p.items.splice(idx, 1);
    pushLog(room, `${p.name} 使用遥控骰子，下次点数 ${v}`, 'card');
    return ok();
  }

  if (item === 'demolish') {
    const i = Number(action.i);
    const tile = BOARD[i];
    if (!tile) return fail('格子不存在');
    if (room.owners[i] === p.id) return fail('不能拆自己的房子');
    if ((room.houses[i] || 0) <= 0) return fail('那块地上没有房子');
    room.houses[i] -= 1;
    p.items.splice(idx, 1);
    pushLog(room, `${p.name} 用拆迁卡拆掉了 ${tile.name} 的一栋房子`, 'card');
    return ok();
  }

  if (item === 'equalize') {
    const alive = alivePlayers(room);
    if (alive.length < 2) return fail('现在没有可以均富的对象');
    const total = alive.reduce((s, x) => s + x.cash, 0);
    const avg = Math.floor(total / alive.length);
    for (const x of alive) x.cash = avg;
    p.items.splice(idx, 1);
    pushLog(room, `${p.name} 使用均富卡，所有人现金变为 ¥${avg}`, 'card');
    return ok();
  }

  return fail('这个道具不能主动使用');
}

function drawCard(room, deck) {
  const arr = deck === 'chance' ? CHANCE : CHEST;
  const list = deck === 'chance' ? room.chance : room.chest;
  let pos = deck === 'chance' ? room.chancePos : room.chestPos;
  if (pos >= list.length) {
    const reshuffled = shuffle(arr.map((_, i) => i), room.rng);
    if (deck === 'chance') { room.chance = reshuffled; } else { room.chest = reshuffled; }
    pos = 0;
  }
  const idx = (deck === 'chance' ? room.chance : room.chest)[pos];
  if (deck === 'chance') room.chancePos = pos + 1; else room.chestPos = pos + 1;
  return { deck, card: arr[idx] };
}

function applyCard(room, p, drawn, depth) {
  const { deck, card } = drawn;
  room.lastCard = { deck, text: card.text };
  pushLog(room, `${p.name} 抽到${DECK_NAME[deck]}：${card.text}`, 'card');
  switch (card.t) {
    case 'money':
      if (card.amount >= 0) {
        p.cash += card.amount;
        pushLog(room, `${p.name} 获得 ¥${card.amount}`, 'money');
      } else {
        pay(room, p, -card.amount, null);
      }
      break;
    case 'move':
      moveToTile(room, p, card.to);
      resolveLanding(room, p, depth + 1);
      break;
    case 'nearestRail': {
      const target = RAIL_TILES.find((i) => i > p.pos) ?? RAIL_TILES[0];
      moveToTile(room, p, target);
      resolveLanding(room, p, depth + 1);
      break;
    }
    case 'back': {
      p.pos = ((p.pos - card.n) % 40 + 40) % 40;
      pushLog(room, `${p.name} 后退到 ${BOARD[p.pos].name}`, 'info');
      resolveLanding(room, p, depth + 1);
      break;
    }
    case 'jail':
      goToJail(room, p);
      break;
    case 'jailcard':
      p.jailCards += 1;
      pushLog(room, `${p.name} 获得一张出狱卡`, 'card');
      break;
    case 'repair': {
      let total = 0;
      for (const i of ownedTiles(room, p.id)) {
        const h = room.houses[i] || 0;
        if (h === 0) continue;
        total += h >= 5 ? card.hotel : h * card.house;
      }
      if (total > 0) {
        pushLog(room, `${p.name} 需要支付维修费 ¥${total}`, 'money');
        pay(room, p, total, null);
      } else {
        pushLog(room, `${p.name} 没有房产需要维修`, 'info');
      }
      break;
    }
    case 'payEach': {
      for (const other of alivePlayers(room)) {
        if (other.id === p.id || p.bankrupt) continue;
        pay(room, p, card.amount, other.id);
      }
      break;
    }
    case 'collectEach': {
      for (const other of alivePlayers(room)) {
        if (other.id === p.id) continue;
        pay(room, other, card.amount, p.id);
      }
      break;
    }
    case 'item':
      grantItem(room, p);
      break;
    default:
      break;
  }
}

function resolveLanding(room, p, depth = 0) {
  if (!p || p.bankrupt || depth > 4) return;
  const tile = BOARD[p.pos];
  switch (tile.type) {
    case 'prop':
    case 'rail':
    case 'util': {
      const ownerId = room.owners[tile.i];
      if (!ownerId) {
        room.pendingBuy = tile.i;
        pushLog(room, `${p.name} 到达 ${tile.name}（售价 ¥${tile.price}），可以购买`, 'buy');
      } else if (ownerId === p.id) {
        pushLog(room, `${p.name} 回到自己的 ${tile.name}`, 'info');
      } else if (room.mortgaged[tile.i]) {
        pushLog(room, `${tile.name} 处于抵押状态，免租`, 'info');
      } else {
        const owner = byId(room, ownerId);
        const rent = rentFor(room, tile.i);
        if (p.items.includes('shield')) {
          p.items = p.items.filter((x) => x !== 'shield');
          pushLog(room, `${p.name} 用免租卡抵消了 ${owner.name} 的 ${tile.name} 租金 ¥${rent}`, 'card');
        } else {
          pushLog(room, `${p.name} 踩到 ${owner.name} 的 ${tile.name}，支付租金 ¥${rent}`, 'rent');
          pay(room, p, rent, ownerId);
        }
      }
      break;
    }
    case 'tax':
      pushLog(room, `${p.name} 缴纳${tile.name} ¥${tile.amount}`, 'money');
      pay(room, p, tile.amount, null);
      break;
    case 'chance':
    case 'chest':
      applyCard(room, p, drawCard(room, tile.type), depth);
      break;
    case 'gotojail':
      goToJail(room, p);
      break;
    case 'jail':
      pushLog(room, `${p.name} 只是来探监`, 'info');
      break;
    case 'parking':
      pushLog(room, `${p.name} 在免费停车场休息`, 'info');
      break;
    default:
      break;
  }
}

// ---------------- 全场事件 / 秘密任务 ----------------

function triggerEvent(room) {
  const ev = EVENTS[Math.floor(room.rng() * EVENTS.length)];
  room.event = { id: ev.id, round: room.round };
  pushLog(room, `【${ev.name}】${ev.text}`, 'system');
  if (ev.id === 'typhoon') {
    for (const p of alivePlayers(room)) {
      const tiles = ownedTiles(room, p.id).filter((i) => (room.houses[i] || 0) > 0);
      if (!tiles.length) continue;
      const i = tiles[Math.floor(room.rng() * tiles.length)];
      room.houses[i] -= 1;
      pushLog(room, `${p.name} 的 ${BOARD[i].name} 被吹坏一栋房子`, 'build');
    }
  } else if (ev.id === 'charity') {
    const alive = alivePlayers(room);
    if (alive.length >= 2) {
      const sorted = [...alive].sort((a, b) => b.cash - a.cash);
      const rich = sorted[0];
      const poor = sorted[sorted.length - 1];
      const amount = Math.floor(rich.cash * 0.1);
      if (amount > 0) {
        pay(room, rich, amount, poor.id);
        pushLog(room, `${rich.name} 向 ${poor.name} 捐赠 ¥${amount}`, 'money');
      }
    }
  } else if (ev.id === 'tax') {
    for (const p of alivePlayers(room)) {
      const amount = Math.floor(p.cash * 0.1);
      if (amount > 0) pay(room, p, amount, null);
    }
  }
  checkEnd(room);
}

function missionMet(room, p) {
  const tiles = ownedTiles(room, p.id);
  switch (p.mission) {
    case 'monopoly':
      return Object.keys(GROUPS).some((g) => GROUPS[g].tiles.every((i) => room.owners[i] === p.id));
    case 'cash':
      return p.cash >= 2200;
    case 'lands':
      return tiles.length >= 8;
    case 'houses':
      return tiles.reduce((s, i) => s + (room.houses[i] || 0), 0) >= 3;
    case 'rails':
      return RAIL_TILES.filter((i) => room.owners[i] === p.id).length >= 3;
    default:
      return false;
  }
}

function checkMissions(room) {
  if (!room.missionsEnabled) return;
  if (room.phase === 'lobby' || room.phase === 'ended') return;
  for (const p of room.players) {
    if (p.bankrupt || !p.mission || p.missionDone) continue;
    if (!missionMet(room, p)) continue;
    p.missionDone = true;
    const text = (MISSIONS.find((m) => m.id === p.mission) || {}).text || '';
    pushLog(room, `🎯 ${p.name} 完成了秘密任务「${text}」，结算时净资产 +20%`, 'system');
  }
}

// 结算时把秘密任务加成算进去
export function finalWorth(room, p) {
  const base = netWorth(room, p);
  return p.missionDone ? Math.round(base * 1.2) : base;
}

function finalizeRanking(room) {
  const ranked = room.players
    .filter((p) => !p.bankrupt)
    .map((p) => ({ id: p.id, name: p.name, worth: finalWorth(room, p), missionDone: !!p.missionDone }))
    .sort((a, b) => b.worth - a.worth);
  room.finalRank = ranked;
  return ranked;
}

function nextTurn(room) {  if (room.phase === 'ended') return;
  const n = room.players.length;
  const prev = room.turn;
  for (let k = 1; k <= n; k++) {
    const i = (prev + k) % n;
    const p = room.players[i];
    if (!p.bankrupt) {
      if (i <= prev) room.round += 1;
      room.turn = i;
      room.phase = 'roll';
      room.dice = [0, 0];
      room.again = false;
      room.doubles = 0;
      room.pendingBuy = null;
      room.lastCard = null;
      if (room.round > room.roundLimit) {
        settleByNetWorth(room);
        return;
      }
      if (room.round % 5 === 0 && room.lastEventRound !== room.round) {
        room.lastEventRound = room.round;
        triggerEvent(room);
        if (room.phase === 'ended') return;
      }
      pushLog(room, `第 ${room.round} 回合 · 轮到 ${p.name}`, 'turn');
      return;
    }
  }
  checkEnd(room);
}

export function netWorth(room, p) {
  let v = p.cash;
  for (const i of ownedTiles(room, p.id)) {
    const tile = BOARD[i];
    v += room.mortgaged[i] ? Math.floor(tile.price / 2) : tile.price;
    if (tile.type === 'prop') v += (room.houses[i] || 0) * GROUPS[tile.group].houseCost;
  }
  return v;
}

function settleByNetWorth(room) {
  const alive = alivePlayers(room);
  if (!alive.length) { checkEnd(room); return; }
  const ranked = alive
    .map((p) => ({ p, v: finalWorth(room, p) }))
    .sort((a, b) => b.v - a.v);
  room.phase = 'ended';
  room.winnerId = ranked[0].p.id;
  room.missionWin = null;
  finalizeRanking(room);
  pushLog(room, `达到 ${room.roundLimit} 回合上限，按净资产结算（秘密任务 +20%）：`, 'system');
  for (const { p, v } of ranked) {
    pushLog(room, `${p.name} 净资产 ¥${v}${p.missionDone ? '（含任务加成）' : ''}`, 'info');
  }
  pushLog(room, `🏆 ${ranked[0].p.name} 以 ¥${ranked[0].v} 获胜`, 'system');
}

// ---------------- 动作 ----------------

function doRoll(room) {
  const p = currentPlayer(room);
  let d1;
  let d2;
  if (p.forcedDice) {
    const v = Math.max(2, Math.min(12, Math.floor(p.forcedDice)));
    d1 = Math.min(6, v - 1);
    d2 = v - d1;
    p.forcedDice = 0;
    pushLog(room, `${p.name} 用遥控骰子指定 ${v} 点`, 'card');
  } else {
    d1 = 1 + Math.floor(room.rng() * 6);
    d2 = 1 + Math.floor(room.rng() * 6);
  }
  room.dice = [d1, d2];
  const total = d1 + d2;
  const dbl = d1 === d2;
  pushLog(room, `${p.name} 掷出 ${d1} + ${d2}${dbl ? '，双数！' : ''}`, 'dice');

  if (p.inJail) {
    if (dbl) {
      p.inJail = false;
      p.jailTurns = 0;
      pushLog(room, `${p.name} 掷出双数，成功出狱`, 'jail');
      moveBy(room, p, total);
      resolveLanding(room, p);
      room.phase = room.pendingBuy != null ? 'buy' : 'end';
    } else {
      p.jailTurns += 1;
      if (p.jailTurns >= 3) {
        pushLog(room, `${p.name} 三次未掷出双数，缴纳 ¥${JAIL_FINE} 保释金`, 'jail');
        pay(room, p, JAIL_FINE, null);
        if (!p.bankrupt && room.phase !== 'ended') {
          p.inJail = false;
          p.jailTurns = 0;
          moveBy(room, p, total);
          resolveLanding(room, p);
        }
        room.phase = room.phase === 'ended' ? 'ended' : room.pendingBuy != null ? 'buy' : 'end';
      } else {
        pushLog(room, `${p.name} 仍在监狱（第 ${p.jailTurns} 回合）`, 'jail');
        room.phase = 'end';
      }
    }
    room.again = false;
    return;
  }

  room.doubles = dbl ? room.doubles + 1 : 0;
  if (dbl && room.doubles >= 3) {
    pushLog(room, `${p.name} 连续三次双数，直接入狱`, 'jail');
    goToJail(room, p);
    room.phase = 'end';
    return;
  }
  room.again = dbl;
  moveBy(room, p, total);
  resolveLanding(room, p);
  if (room.phase === 'ended') return;
  room.phase = room.pendingBuy != null ? 'buy' : room.again && !p.inJail ? 'roll' : 'end';
}

function doBuy(room, p) {
  if (room.pendingBuy == null) return fail('现在没有可购买的地产');
  const tile = BOARD[room.pendingBuy];
  if (p.cash < tile.price) return fail('现金不足，无法购买');
  p.cash -= tile.price;
  room.owners[tile.i] = p.id;
  room.houses[tile.i] = 0;
  pushLog(room, `${p.name} 买下了 ${tile.name}（¥${tile.price}）`, 'buy');
  room.pendingBuy = null;
  room.phase = room.again ? 'roll' : 'end';
  return ok();
}

function doPass(room, p) {
  if (room.pendingBuy == null) return fail('现在没有待购买的地产');
  const tile = BOARD[room.pendingBuy];
  pushLog(room, `${p.name} 放弃购买 ${tile.name}`, 'info');
  room.pendingBuy = null;
  room.phase = room.again ? 'roll' : 'end';
  return ok();
}

function doEnd(room) {
  if (room.pendingBuy != null) return fail('请先决定是否购买');
  room.phase = 'end';
  nextTurn(room);
  return ok();
}

function doBail(room, p) {
  if (!p.inJail) return fail('你不在监狱里');
  if (p.cash < JAIL_FINE) return fail('现金不足，付不起保释金');
  p.cash -= JAIL_FINE;
  p.inJail = false;
  p.jailTurns = 0;
  pushLog(room, `${p.name} 支付 ¥${JAIL_FINE} 保释金出狱`, 'jail');
  return ok();
}

function doJailCard(room, p) {
  if (!p.inJail) return fail('你不在监狱里');
  if (p.jailCards <= 0) return fail('你没有出狱卡');
  p.jailCards -= 1;
  p.inJail = false;
  p.jailTurns = 0;
  pushLog(room, `${p.name} 使用出狱卡出狱`, 'jail');
  return ok();
}

function doBuild(room, p, i) {
  const tile = BOARD[i];
  if (!tile || tile.type !== 'prop') return fail('只能在地产上盖房');
  if (room.owners[i] !== p.id) return fail('这不是你的地');
  const g = GROUPS[tile.group];
  if (!g.tiles.every((x) => room.owners[x] === p.id)) return fail('需要集齐同色地块才能盖房');
  if (g.tiles.some((x) => room.mortgaged[x])) return fail('该组有地块处于抵押状态');
  const cur = room.houses[i] || 0;
  if (cur >= 5) return fail('已经建满旅馆');
  const min = Math.min(...g.tiles.map((x) => room.houses[x] || 0));
  if (cur > min) return fail('必须均衡建造（先补齐房子少的）');
  if (p.cash < g.houseCost) return fail(`现金不足，需要 ¥${g.houseCost}`);
  p.cash -= g.houseCost;
  room.houses[i] = cur + 1;
  pushLog(room, `${p.name} 在 ${tile.name} ${cur + 1 === 5 ? '建起了旅馆' : `盖了第 ${cur + 1} 栋房子`}（-¥${g.houseCost}）`, 'build');
  return ok();
}

function doSellHouse(room, p, i) {
  const tile = BOARD[i];
  if (!tile || tile.type !== 'prop') return fail('这不是地产');
  if (room.owners[i] !== p.id) return fail('这不是你的地');
  const g = GROUPS[tile.group];
  const cur = room.houses[i] || 0;
  if (cur <= 0) return fail('这里没有房子可卖');
  const max = Math.max(...g.tiles.map((x) => room.houses[x] || 0));
  if (cur < max) return fail('必须均衡出售（先卖房子多的）');
  room.houses[i] = cur - 1;
  p.cash += Math.floor(g.houseCost / 2);
  pushLog(room, `${p.name} 卖掉 ${tile.name} 的一栋房子（+¥${Math.floor(g.houseCost / 2)}）`, 'build');
  return ok();
}

function doMortgage(room, p, i) {
  const tile = BOARD[i];
  if (!tile) return fail('格子不存在');
  if (room.owners[i] !== p.id) return fail('这不是你的地');
  if (room.mortgaged[i]) return fail('已经抵押过了');
  if (tile.type === 'prop' && GROUPS[tile.group].tiles.some((x) => (room.houses[x] || 0) > 0)) {
    return fail('请先卖掉该组的所有房子');
  }
  mortgageTile(room, p, i);
  return ok();
}

function doUnmortgage(room, p, i) {
  const tile = BOARD[i];
  if (!tile) return fail('格子不存在');
  if (room.owners[i] !== p.id) return fail('这不是你的地');
  if (!room.mortgaged[i]) return fail('这块地没有抵押');
  const cost = Math.ceil(tile.price * 0.55);
  if (p.cash < cost) return fail(`赎回需要 ¥${cost}，现金不足`);
  p.cash -= cost;
  room.mortgaged[i] = false;
  pushLog(room, `${p.name} 赎回 ${tile.name}（-¥${cost}）`, 'money');
  return ok();
}

function normalize(room) {
  if (room.phase === 'ended' || room.phase === 'lobby') return;
  const cur = currentPlayer(room);
  if (!cur || cur.bankrupt) {
    if (alivePlayers(room).length <= 1) { checkEnd(room); return; }
    nextTurn(room);
  }
}

const BUILD_ACTIONS = new Set(['build', 'sellHouse', 'mortgage', 'unmortgage']);

export function act(room, playerId, action) {
  const res = actInner(room, playerId, action);
  if (res.ok && action && action.type !== 'chat') checkMissions(room);
  return res;
}

function actInner(room, playerId, action) {
  const p = byId(room, playerId);
  if (!p) return fail('玩家不存在');
  const type = action && action.type;
  room.lastActionAt = Date.now();

  if (type === 'chat') {
    const text = String(action.text || '').trim().slice(0, 120);
    if (!text) return fail('消息为空');
    room.chatSeq += 1;
    room.chat.push({ id: room.chatSeq, from: p.id, name: p.name, text, t: Date.now() });
    if (room.chat.length > 60) room.chat.splice(0, room.chat.length - 60);
    room.seq++;
    return ok();
  }

  if (room.phase === 'lobby') {
    if (type === 'start') {
      if (p.id !== room.hostId) return fail('只有房主能开始游戏');
      return startGame(room);
    }
    if (type === 'addBot') {
      if (p.id !== room.hostId) return fail('只有房主能添加电脑玩家');
      const used = new Set(room.players.map((x) => x.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || `电脑${room.players.length}`;
      return addPlayer(room, name, { isBot: true });
    }
    if (type === 'removeBot') {
      if (p.id !== room.hostId) return fail('只有房主能移除电脑玩家');
      const target = byId(room, action.id);
      if (!target || !target.isBot) return fail('只能移除电脑玩家');
      return removePlayer(room, target.id);
    }
    if (type === 'setPiece') {
      const piece = PIECES.find((x) => x.id === action.piece);
      if (!piece) return fail('没有这个棋子');
      if (room.players.some((x) => x.id !== p.id && x.piece === piece.id)) {
        return fail('这个棋子已经被别人选了');
      }
      p.piece = piece.id;
      room.seq++;
      return ok();
    }
    if (type === 'setRounds') {
      if (p.id !== room.hostId) return fail('只有房主能设置回合数');
      const n = Number(action.rounds);
      if (![20, 35, 50].includes(n)) return fail('回合数只能选 20 / 35 / 50');
      room.roundLimit = n;
      room.seq++;
      pushLog(room, `本局回合上限设为 ${n}`, 'system');
      return ok();
    }
    if (type === 'setMissions') {
      if (p.id !== room.hostId) return fail('只有房主能设置胜利条件');
      room.missionsEnabled = String(action.enabled) === '1' || action.enabled === true;
      room.seq++;
      pushLog(room, room.missionsEnabled ? '本局开启秘密任务（结算 +20%）' : '本局为经典胜负（无秘密任务）', 'system');
      return ok();
    }
    return fail('游戏还没有开始');
  }

  if (room.phase === 'ended') {
    if (type === 'restart') {
      if (p.id !== room.hostId) return fail('只有房主能重开一局');
      resetRoom(room);
      return ok();
    }
    return fail('本局已经结束');
  }

  const cur = currentPlayer(room);
  if (type && type.startsWith('trade')) return handleTrade(room, p, action);
  if (type === 'useItem') {
    const r = useItem(room, p, action);
    if (r.ok) { room.seq++; normalize(room); }
    return r;
  }

  if (!cur || cur.id !== p.id) return fail('还没轮到你');

  if (room.phase === 'roll') {
    if (type === 'roll') { doRoll(room); normalize(room); room.seq++; return ok(); }
    if (type === 'bail') { const r = doBail(room, p); if (r.ok) room.seq++; return r; }
    if (type === 'jailcard') { const r = doJailCard(room, p); if (r.ok) room.seq++; return r; }
  }
  if (room.phase === 'buy') {
    if (type === 'buy') { const r = doBuy(room, p); if (r.ok) room.seq++; return r; }
    if (type === 'pass') { doPass(room, p); normalize(room); room.seq++; return ok(); }
  }
  if (room.phase === 'end' && type === 'end') {
    doEnd(room);
    normalize(room);
    room.seq++;
    return ok();
  }
  if (BUILD_ACTIONS.has(type)) {
    let r;
    if (type === 'build') r = doBuild(room, p, action.i);
    else if (type === 'sellHouse') r = doSellHouse(room, p, action.i);
    else if (type === 'mortgage') r = doMortgage(room, p, action.i);
    else r = doUnmortgage(room, p, action.i);
    if (r.ok) { normalize(room); room.seq++; }
    return r;
  }
  return fail('当前阶段不能做这个操作');
}

// ---------------- 机器人 ----------------

function botBuild(room, p) {
  const persona = p.persona || 'steady';
  const keep = persona === 'aggressive' ? 50 : persona === 'steady' ? 500 : 200;
  const groups = Object.keys(GROUPS)
    .filter((g) => GROUPS[g].tiles.every((i) => room.owners[i] === p.id))
    .filter((g) => GROUPS[g].tiles.every((i) => !room.mortgaged[i]));
  for (const g of groups) {
    const cost = GROUPS[g].houseCost;
    if (p.cash - cost < keep) continue;
    const tiles = GROUPS[g].tiles
      .map((i) => ({ i, h: room.houses[i] || 0 }))
      .sort((a, b) => a.h - b.h);
    const target = tiles.find((t) => t.h < 5);
    if (target) return target.i;
  }
  return -1;
}

function botUseItem(room, p) {
  if (p.items.includes('demolish')) {
    const targets = Object.keys(room.houses)
      .filter((k) => (room.houses[k] || 0) > 0 && room.owners[k] !== p.id)
      .sort((a, b) => (room.houses[b] || 0) - (room.houses[a] || 0));
    if (targets.length) {
      const r = act(room, p.id, { type: 'useItem', item: 'demolish', i: Number(targets[0]) });
      if (r.ok) return true;
    }
  }
  if (p.items.includes('equalize')) {
    const alive = alivePlayers(room);
    const avg = alive.reduce((s, x) => s + x.cash, 0) / alive.length;
    if (p.cash < avg * 0.75) {
      const r = act(room, p.id, { type: 'useItem', item: 'equalize' });
      if (r.ok) return true;
    }
  }
  if (p.items.includes('dice')) {
    const r = act(room, p.id, { type: 'useItem', item: 'dice', value: 7 });
    if (r.ok) return true;
  }
  return false;
}

function tradeAssetValue(room, side) {
  let v = side.cash;
  for (const i of side.tiles) {
    const tile = BOARD[i];
    v += tile.price;
    if (tile.type === 'prop') v += (room.houses[i] || 0) * GROUPS[tile.group].houseCost;
  }
  return v;
}

function botTradeDecision(room, bot, trade) {
  const gets = tradeAssetValue(room, trade.give);   // 机器人得到的
  const gives = tradeAssetValue(room, trade.get);   // 机器人付出的
  if (gets <= 0 && gives > 0) return false;
  // 稍微高估自己手里的地，避免被白嫖
  return gets >= gives * 1.05;
}

export function tickBots(room) {
  if (room.phase === 'lobby' || room.phase === 'ended') return false;

  // 机器人对交易报价的回应
  const trade = currentTrade(room);
  if (trade && Date.now() - (trade.createdAt || 0) > 1500) {
    const target = byId(room, trade.toId);
    if (target && target.isBot && !target.bankrupt) {
      const accept = botTradeDecision(room, target, trade);
      act(room, target.id, { type: accept ? 'tradeAccept' : 'tradeReject', id: trade.id });
      return true;
    }
  }

  const p = currentPlayer(room);
  if (!p || !p.isBot || p.bankrupt) return false;
  const rng = room.rng;
  if (room.phase === 'roll') {
    if (p.inJail) {
      if (p.jailCards > 0) return act(room, p.id, { type: 'jailcard' }).ok;
      if (p.cash > 250) { const r = act(room, p.id, { type: 'bail' }); if (r.ok) return true; }
    }
    // 捣蛋型机器人会主动用道具
    if (p.persona === 'trickster' && p.items.length && rng() > 0.45) {
      if (botUseItem(room, p)) return true;
    }
    return act(room, p.id, { type: 'roll' }).ok;
  }
  if (room.phase === 'buy') {
    const tile = BOARD[room.pendingBuy];
    if (!tile) return false;
    const g = tile.group ? GROUPS[tile.group] : null;
    const completes = g ? g.tiles.every((i) => room.owners[i] === p.id || i === tile.i) : false;
    const persona = p.persona || 'steady';
    const keep = persona === 'aggressive' ? 30 : persona === 'steady' ? 350 : 150;
    const affordable = p.cash - tile.price >= keep;
    let buy;
    if (persona === 'aggressive') buy = affordable;
    else if (persona === 'collector') buy = completes || (affordable && rng() > 0.45);
    else buy = affordable && (completes || rng() > 0.15);
    const r = act(room, p.id, { type: buy ? 'buy' : 'pass' });
    if (r.ok) return true;
    return act(room, p.id, { type: 'pass' }).ok;
  }
  if (room.phase === 'end') {
    const i = botBuild(room, p);
    if (i >= 0 && rng() > 0.25) {
      const r = act(room, p.id, { type: 'build', i });
      if (r.ok) return true;
    }
    const r = act(room, p.id, { type: 'end' });
    if (r.ok) return true;
    return false;
  }
  return false;
}

// ---------------- 视图 ----------------

export function view(room, youId) {
  const cur = currentPlayer(room);
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    turnId: room.phase === 'lobby' || room.phase === 'ended' ? null : cur ? cur.id : null,
    you: youId || null,
    dice: room.dice,
    again: room.again,
    doubles: room.doubles,
    round: room.round,
    roundLimit: room.roundLimit,
    pendingBuy: room.pendingBuy,
    lastCard: room.lastCard,
    trade: currentTrade(room),
    event: room.event && room.event.round === room.round ? room.event : null,
    missionWin: room.missionWin,
    missionMinRound: MISSION_MIN_ROUND,
    missionsEnabled: !!room.missionsEnabled,
    winnerId: room.winnerId,
    finalRank: room.finalRank || null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      piece: p.piece,
      cash: p.cash,
      pos: p.pos,
      inJail: p.inJail,
      jailTurns: p.jailTurns,
      jailCards: p.jailCards,
      bankrupt: p.bankrupt,
      isBot: p.isBot,
      connected: p.connected,
      isHost: p.id === room.hostId,
      persona: p.persona || null,
      items: p.id === youId ? (p.items || []) : [],
      itemCount: (p.items || []).length,
      mission: (p.id === youId || room.phase === 'ended') ? p.mission : null,
      missionDone: !!p.missionDone,
    })),
    owners: room.owners,
    houses: room.houses,
    mortgaged: room.mortgaged,
    log: room.log.slice(-60),
    chat: room.chat.slice(-40),
    seq: room.seq,
  };
}
