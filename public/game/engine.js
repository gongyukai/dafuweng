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
// 回合超时：在线玩家 2 分钟，断线玩家 30 秒，避免幽灵玩家把对局卡死
export const TURN_TIMEOUT_MS = 60000;
export const TURN_TIMEOUT_OFFLINE_MS = 60000;
const BOT_NAMES = ['阿福', '小美', '老王', '阿强', '丽丽'];

// ---------------- 秘密任务 / 道具 / 事件 / 电脑性格 ----------------

export const MISSION_MIN_ROUND = 5;

export const MISSIONS = [
  { id: 'monopoly', min: 2, max: 6, target: () => 1, reward: { 2: 400, 3: 500, 4: 600, 5: 600, 6: 600 },
    text: () => '集齐任意 1 组同色地块' },
  { id: 'assets', min: 2, max: 6, target: () => 3200, reward: { 2: 600, 3: 600, 4: 600, 5: 600, 6: 600 },
    text: () => '总资产达到 ¥3200' },
  { id: 'lands', min: 2, max: 6, target: (n) => [13, 10, 9, 8, 6][n - 2], reward: { 2: 600, 3: 600, 4: 600, 5: 600, 6: 600 },
    text: (t) => `拥有 ${t} 块地产` },
  { id: 'houses', min: 2, max: 6, target: (n) => [4, 3, 3, 2, 2][n - 2], reward: { 2: 400, 3: 500, 4: 700, 5: 700, 6: 700 },
    text: (t) => `建成 ${t} 栋房子` },
  { id: 'rails', min: 2, max: 4, target: () => 2, reward: { 2: 700, 3: 700, 4: 700 },
    text: () => '拥有 2 个车站' },
  { id: 'rent', min: 2, max: 6, target: (n) => [400, 600, 800, 800, 800][n - 2], reward: { 2: 600, 3: 600, 4: 600, 5: 600, 6: 600 },
    text: (t) => `累计收取租金 ¥${t}` },
  { id: 'twoSets', min: 2, max: 6, target: () => 2, reward: { 2: 600, 3: 700, 4: 800, 5: 800, 6: 800 },
    text: () => '集齐 2 组同色地块' },
  { id: 'hotel', min: 2, max: 6, target: () => 1, reward: { 2: 600, 3: 700, 4: 800, 5: 800, 6: 800 },
    text: () => '建成 1 座旅馆（5 栋房子）' },
  { id: 'trade', min: 2, max: 6, target: () => 2, reward: { 2: 600, 3: 600, 4: 600, 5: 600, 6: 600 },
    text: () => '完成 2 次玩家交易' },
  { id: 'item', min: 2, max: 6, target: (n) => [6, 6, 6, 5, 4][n - 2], reward: { 2: 700, 3: 700, 4: 700, 5: 700, 6: 700 },
    text: (t) => `使用 ${t} 张道具卡` },
];

export function missionTarget(def, players) {
  return typeof def.target === 'function' ? def.target(players) : def.target;
}
export function missionText(def, players) {
  const t = missionTarget(def, players);
  return typeof def.text === 'function' ? def.text(t, players) : def.text;
}
export function missionRewardBase(def, players) {
  return (def.reward && def.reward[players]) || 600;
}

export const ITEMS = {
  dice: { name: '遥控骰子', desc: '指定本次骰子总点数（2–12）' },
  shield: { name: '免租卡', desc: '被收租时可以选择是否抵消' },
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
    debt: null,
    rentChoice: null,
    cardChoice: null,
    diceMode: 'three',
    altUses: 10,
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
    turnStartedAt: null,
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
  room.startTurn = 0;
  room.round = 1;
  room.lastEventRound = 0;
  room.dice = [0, 0];
  room.again = false;
  room.doubles = 0;
  room.pendingBuy = null;
  room.lastCard = null;
  room.trade = null;
  room.debt = null;
  room.rentChoice = null;
  room.cardChoice = null;
  room.diceOptions = null;
  room.diceRoll = null;
  room.dicePick = null;
  room.moveTotal = null;
  room.rollDouble = false;
  room.event = null;
  room.missionWin = null;
  room.winnerId = null;
  room.finalRank = null;
  room.cardChoice = null;
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
    p.missionOptions = [];
    p.missionPicked = false;
    p.missionTarget = 0;
    p.missionText = null;
    p.missionRewardBase = 0;
    p.itemChoices = [];
    p.rentIncome = 0;
    p.tradesDone = 0;
    p.tradesThisTurn = 0;
    p.itemsUsed = 0;
    p.planPoints = 0;
    p.forcedDice = 0;
    p.skipTurns = 0;
    p.jailCount = 0;
  }
  room.altUses = 10;
  pushLog(room, '新的一局开始了，等待房主开局', 'system');
}

export function addPlayer(room, name, opts = {}) {
  if (room.phase !== 'lobby') return { ok: false, err: '游戏已经开始，无法加入' };
  if (room.players.length >= MAX_PLAYERS) {
    // 大厅满员时，先让已经离线的玩家让出座位
    const idx = room.players.findIndex((p) => !p.isBot && !p.connected);
    if (idx < 0) return { ok: false, err: '房间已满（最多 6 人）' };
    const gone = room.players[idx];
    room.players.splice(idx, 1);
    room.players.forEach((p, i) => { p.color = COLORS[i % COLORS.length]; });
    if (room.hostId === gone.id) {
      const nextHost = room.players.find((p) => !p.isBot);
      room.hostId = nextHost ? nextHost.id : null;
      if (nextHost) nextHost.isHost = true;
    }
    pushLog(room, `${gone.name} 已离线，让出座位`, 'system');
  }
  const clean = String(name || '').trim().slice(0, 10) || '玩家';
  if (!opts.isBot && room.players.some((p) => !p.isBot && p.name === clean)) {
    return { ok: false, err: '昵称已被占用，换一个名字' };
  }
  const p = {
    id: uid('p'),
    token: opts.token || uid('t'),
    clientId: opts.clientId || null,
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
    missionOptions: [],
    missionPicked: false,
    missionTarget: 0,
    missionText: null,
    missionRewardBase: 0,
    itemChoices: [],
    rentIncome: 0,
    tradesDone: 0,
    tradesThisTurn: 0,
    itemsUsed: 0,
    planPoints: 0,
    skipTurns: 0,
    jailCount: 0,
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

const MAX_TRADE_DIFF = 100;

// 交易内容的实际价值：现金 + 地产（抵押按半价）+ 房子（按造价）
function tradeSideValue(room, side) {
  let v = side.cash || 0;
  for (const i of side.tiles || []) {
    const tile = BOARD[i];
    if (!tile) continue;
    v += room.mortgaged[i] ? Math.floor(tile.price / 2) : tile.price;
    if (tile.type === 'prop') v += (room.houses[i] || 0) * GROUPS[tile.group].houseCost;
  }
  return v;
}

function handleTrade(room, p, action) {
  if (room.phase === 'lobby' || room.phase === 'ended') return fail('现在不能交易');
  const type = action.type;
  const trade = currentTrade(room);

  if (type === 'tradeOffer') {
    if (trade) return fail('已经有一笔交易在处理中');
    const cur = currentPlayer(room);
    if (!cur || cur.id !== p.id) return fail('只能在自己的回合发起交易');
    if (room.phase !== 'roll' && room.phase !== 'buy' && room.phase !== 'end') return fail('当前阶段不能交易');
    if ((p.tradesThisTurn || 0) >= 2) return fail('本回合已经交易过 2 次了');
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
    const diff = Math.abs(tradeSideValue(room, { cash: getCash, tiles: getTiles }) - tradeSideValue(room, { cash: giveCash, tiles: giveTiles }));
    if (diff > MAX_TRADE_DIFF) return fail(`双方交易价值相差 ¥${diff}，不能超过 ¥${MAX_TRADE_DIFF}`);
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
    const cur = currentPlayer(room);
    if (!cur || cur.id !== trade.fromId) { room.trade = null; return fail('发起人的回合已结束，交易失效'); }
    const from = byId(room, trade.fromId);
    if (!from || from.bankrupt) { room.trade = null; return fail('对方已破产'); }
    for (const i of trade.give.tiles) if (!tileOkForTrade(room, i, from.id)) return fail('交易内容已变化，请让对方重新发起');
    for (const i of trade.get.tiles) if (!tileOkForTrade(room, i, p.id)) return fail('交易内容已变化，请让对方重新发起');
    if (trade.give.cash > from.cash) return fail('对方现金不足');
    if (trade.get.cash > p.cash) return fail('你的现金不足');
    const diff = Math.abs(tradeSideValue(room, trade.get) - tradeSideValue(room, trade.give));
    if (diff > MAX_TRADE_DIFF) return fail(`双方交易价值相差 ¥${diff}，不能超过 ¥${MAX_TRADE_DIFF}`);
    // 抵押地产交易：新业主需向银行支付抵押额 10% 的手续费（官方规则）
    const feeOf = (tiles) => tiles.filter((i) => room.mortgaged[i]).reduce((s, i) => s + Math.floor(BOARD[i].price * 0.05), 0);
    const feeGet = feeOf(trade.give.tiles); // 接收方（p）拿到抵押地的手续费
    const feeGive = feeOf(trade.get.tiles); // 发起方（from）拿到抵押地的手续费
    if (p.cash + trade.give.cash - trade.get.cash - feeGet < 0) return fail('你的现金不够支付抵押地产 10% 手续费');
    if (from.cash - trade.give.cash + trade.get.cash - feeGive < 0) return fail('对方现金不够支付抵押地产 10% 手续费');
    for (const i of trade.give.tiles) room.owners[i] = p.id;
    for (const i of trade.get.tiles) room.owners[i] = from.id;
    from.cash -= trade.give.cash;
    p.cash += trade.give.cash;
    p.cash -= trade.get.cash;
    from.cash += trade.get.cash;
    if (feeGet) { p.cash -= feeGet; pushLog(room, `${p.name} 为接手的抵押地产支付 10% 手续费 ¥${feeGet}`, 'money'); }
    if (feeGive) { from.cash -= feeGive; pushLog(room, `${from.name} 为接手的抵押地产支付 10% 手续费 ¥${feeGive}`, 'money'); }
    pushLog(room, `交易达成：${from.name} 得到 ${tradeText(room, trade.get)}，${p.name} 得到 ${tradeText(room, trade.give)}`, 'trade');
    from.tradesDone = (from.tradesDone || 0) + 1;
    p.tradesDone = (p.tradesDone || 0) + 1;
    from.tradesThisTurn = (from.tradesThisTurn || 0) + 1;
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
  // 起手顺序随机：随机抽一位先手，之后按座位轮转
  room.turn = Math.floor(room.rng() * room.players.length);
  room.startTurn = room.turn;
  room.altUses = 10;
  room.round = 1;
  room.roundLimit = room.roundLimit || DEFAULT_ROUND_LIMIT;
  room.lastEventRound = 0;
  room.turnStartedAt = Date.now();
  room.dice = [0, 0];
  room.diceOptions = null;
  room.diceRoll = null;
  room.dicePick = null;
  room.moveTotal = null;
  room.rollDouble = false;
  room.again = false;
  room.doubles = 0;
  room.winnerId = null;
  room.finalRank = null;
  room.event = null;
  room.missionWin = null;
  const n = room.players.length;
  const pool = MISSIONS.filter((m) => n >= (m.min || 2) && n <= (m.max || 6));
  room.players.forEach((p) => {
    p.mission = null;
    p.missionOptions = [];
    p.missionPicked = false;
    p.missionTarget = 0;
    p.missionText = null;
    p.missionRewardBase = 0;
    p.itemChoices = [];
    if (!room.missionsEnabled) return;
    const options = shuffle(pool, room.rng).slice(0, Math.min(2, pool.length));
    p.missionOptions = options.map((d) => d.id);
    if (p.isBot) {
      assignMission(room, p, options[Math.floor(room.rng() * options.length)]);
      p.missionOptions = [];
      p.missionPicked = true;
    }
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
    p.skipTurns = 0;
    p.jailCount = 0;
    p.rentIncome = 0;
    p.tradesDone = 0;
    p.tradesThisTurn = 0;
    p.itemsUsed = 0;
    p.planPoints = 0;
  }
  room.owners = {};
  room.houses = {};
  room.mortgaged = {};
  room.seq++;
  pushLog(room, `游戏开始，共 ${room.players.length} 位玩家，初始资金 ¥${START_CASH}`, 'system');
  const waiting = room.missionsEnabled && room.players.some((p) => !p.missionPicked);
  if (waiting) {
    room.phase = 'mission';
    room.turnStartedAt = Date.now();
    pushLog(room, '请选择你的秘密任务（每人二选一）', 'system');
  } else {
    room.phase = 'roll';
    room.turnStartedAt = Date.now();
    pushLog(room, `轮到 ${currentPlayer(room).name} 掷骰子`, 'turn');
  }
  return { ok: true };
}

function assignMission(room, p, def) {
  if (!def) return;
  p.mission = def.id;
  p.missionTarget = missionTarget(def, room.players.length);
  p.missionText = missionText(def, room.players.length);
  p.missionRewardBase = missionRewardBase(def, room.players.length);
}

function pickMission(room, p, action) {
  if (!p.missionOptions || !p.missionOptions.length) return fail('现在不需要选择任务');
  const idx = Number(action.i);
  if (idx !== 0 && idx !== 1) return fail('请选择一个任务');
  const def = MISSIONS.find((m) => m.id === p.missionOptions[idx]);
  if (!def) return fail('任务不存在');
  assignMission(room, p, def);
  p.missionOptions = [];
  p.missionPicked = true;
  pushLog(room, `${p.name} 已经选好了秘密任务`, 'system');
  if (room.players.every((x) => x.missionPicked)) beginFirstTurn(room);
  room.seq++;
  return ok();
}

function beginFirstTurn(room) {
  room.phase = 'roll';
  room.turnStartedAt = Date.now();
  pushLog(room, `轮到 ${currentPlayer(room).name} 掷骰子`, 'turn');
}

function autoPickMissions(room) {
  for (const p of room.players) {
    if (p.missionPicked || !p.missionOptions || !p.missionOptions.length) continue;
    const def = MISSIONS.find((m) => m.id === p.missionOptions[0]);
    assignMission(room, p, def);
    p.missionOptions = [];
    p.missionPicked = true;
    pushLog(room, `${p.name} 超时未选，自动分配了秘密任务`, 'system');
  }
  beginFirstTurn(room);
}

// ---------------- 金钱 ----------------

function ownedTiles(room, id) {
  return Object.keys(room.owners)
    .filter((k) => room.owners[k] === id)
    .map(Number);
}

export function rentInfo(room, tileIdx) {
  const tile = BOARD[tileIdx];
  const ownerId = room.owners[tileIdx];
  if (!ownerId) return { total: 0, base: 0, mult: 1, reason: '无主' };
  if (room.mortgaged[tileIdx]) return { total: 0, base: 0, mult: 1, reason: '已抵押免租' };
  let base = 0;
  let reason = '';
  if (tile.type === 'prop') {
    const g = GROUPS[tile.group];
    const houses = room.houses[tileIdx] || 0;
    if (houses > 0) {
      base = tile.rent[Math.min(houses, 5)];
      reason = houses >= 5 ? '旅馆' : `${houses} 栋房子`;
    } else {
      const ownsAll = g.tiles.every((i) => room.owners[i] === ownerId);
      base = ownsAll ? tile.rent[0] * 2 : tile.rent[0];
      reason = ownsAll ? '整组同色 ×2' : '基础租金';
    }
  } else if (tile.type === 'rail') {
    const n = RAIL_TILES.filter((i) => room.owners[i] === ownerId).length;
    base = [0, 25, 50, 100, 200][n] || 0;
    reason = `${n} 个车站`;
  } else if (tile.type === 'util') {
    const n = UTIL_TILES.filter((i) => room.owners[i] === ownerId).length;
    const total = room.moveTotal || ((room.dice[0] || 0) + (room.dice[1] || 0));
    base = total * (n === 2 ? 10 : 4);
    reason = `${n} 家公用事业 × 骰子 ${total}`;
  }
  let mult = 1;
  if (room.event && room.event.round === room.round) {
    if (room.event.id === 'boom') mult = 2;
    if (room.event.id === 'rail' && tile.type === 'rail') mult = 2;
  }
  if (mult > 1) reason += ' · 活动 ×2';
  return { total: Math.round(base * mult), base, mult, reason };
}

export function rentFor(room, tileIdx) {
  return rentInfo(room, tileIdx).total;
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
    addRentIncome(room, creditorId, p.cash);
    if (p.cash > 0) pushLog(room, `${p.name} 剩余 ¥${p.cash} 交给 ${creditor.name}`, 'money');
  }
  p.cash = 0;
  p.pos = 0;
  p.inJail = false;
  p.jailTurns = 0;
  p.jailCards = 0;
  if (room.trade && (room.trade.fromId === p.id || room.trade.toId === p.id)) room.trade = null;
  // 只有当前玩家破产才结束他的回合；别人破产不应清掉当前玩家的双数奖励
  const cur = currentPlayer(room);
  if (cur && cur.id === p.id) room.again = false;
  room.debt = null;
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

function transferCash(room, from, toId, amount) {
  const paid = Math.min(from.cash, amount);
  from.cash -= paid;
  if (toId) {
    const to = byId(room, toId);
    if (to && !to.bankrupt) to.cash += paid;
  }
  return paid;
}

function addRentIncome(room, creditorId, amount) {
  const to = creditorId ? byId(room, creditorId) : null;
  if (to && !to.bankrupt && amount > 0) to.rentIncome = (to.rentIncome || 0) + amount;
}

// 真人玩家现金不足时进入「筹钱」阶段，由玩家自己决定卖房/抵押；机器人仍然自动变卖
function charge(room, payer, amount, creditorId = null, opts = {}) {
  if (!payer || payer.bankrupt || amount <= 0) return 'ok';
  if (payer.cash >= amount) {
    transferCash(room, payer, creditorId, amount);
    addRentIncome(room, creditorId, amount);
    return 'ok';
  }
  if (payer.isBot) {
    raiseFunds(room, payer, amount);
    const paid = transferCash(room, payer, creditorId, amount);
    addRentIncome(room, creditorId, paid);
    if (paid < amount) { bankrupt(room, payer, creditorId); return 'bankrupt'; }
    return 'ok';
  }
  room.debt = {
    payerId: payer.id,
    amount,
    creditorId,
    resume: room.again && !payer.inJail ? 'roll' : 'end',
    after: opts.after || null,
  };
  room.phase = 'debt';
  pushLog(room, `${payer.name} 需要支付 ¥${amount}，请卖房或抵押筹钱（也可宣告破产）`, 'money');
  return 'debt';
}

function settleDebt(room) {
  const d = room.debt;
  if (!d) return;
  const payer = byId(room, d.payerId);
  room.debt = null;
  if (!payer || payer.bankrupt) { room.phase = 'end'; return; }
  transferCash(room, payer, d.creditorId, d.amount);
  addRentIncome(room, d.creditorId, d.amount);
  if (d.after === 'jailMove') {
    room.phase = 'end';
    payer.inJail = false;
    payer.jailTurns = 0;
    const total = room.moveTotal || ((room.dice[0] || 0) + (room.dice[1] || 0));
    moveBy(room, payer, total);
    resolveLanding(room, payer);
    if (room.phase === 'rent' || room.phase === 'debt' || room.phase === 'ended' || room.phase === 'card') return;
    room.phase = room.pendingBuy != null ? 'buy' : room.again && !payer.inJail ? 'roll' : 'end';
    return;
  }
  room.phase = d.resume || 'end';
  pushLog(room, `${payer.name} 付清 ¥${d.amount}`, 'money');
  checkEnd(room);
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
    p.planPoints = Math.min(3, (p.planPoints || 0) + 1);
    pushLog(room, `${p.name} 获得 1 枚规划点（共 ${p.planPoints} 枚）`, 'info');
    offerGoItems(room, p);
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
  const cur = currentPlayer(room);
  if (cur && cur.id === p.id) room.again = false;
  p.jailCount = (p.jailCount || 0) + 1;
  pushLog(room, `${p.name} 被送进监狱（第 ${p.jailCount} 次）`, 'jail');
  if (p.jailCount % 3 === 0) {
    p.jailCards = (p.jailCards || 0) + 1;
    pushLog(room, `${p.name} 入狱满 3 次，获得一张保释卡`, 'jail');
  }
}

// ---------------- 道具 ----------------

function removeOneItem(p, id) {
  const idx = p.items.indexOf(id);
  if (idx >= 0) p.items.splice(idx, 1);
  return idx >= 0;
}

function grantItem(room, p, id) {  if (p.items.length >= MAX_ITEMS) {
    pushLog(room, `${p.name} 手牌已满（${MAX_ITEMS} 张），道具作废`, 'card');
    return null;
  }
  const item = id || ITEM_IDS[Math.floor(room.rng() * ITEM_IDS.length)];
  p.items.push(item);
  pushLog(room, `${p.name} 获得道具「${ITEMS[item].name}」`, 'card');
  return item;
}

function offerGoItems(room, p) {
  if (p.items.length >= MAX_ITEMS) {
    pushLog(room, `${p.name} 手牌已满（${MAX_ITEMS} 张），过起点道具作废`, 'card');
    return;
  }
  const first = ITEM_IDS[Math.floor(room.rng() * ITEM_IDS.length)];
  let second = ITEM_IDS[Math.floor(room.rng() * ITEM_IDS.length)];
  let guard = 0;
  while (second === first && guard++ < 10) second = ITEM_IDS[Math.floor(room.rng() * ITEM_IDS.length)];
  p.itemChoices = [first, second];
  pushLog(room, `${p.name} 经过起点，下回合可以挑选一件道具`, 'card');
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
    p.itemsUsed = (p.itemsUsed || 0) + 1;
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
    p.itemsUsed = (p.itemsUsed || 0) + 1;
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
    p.itemsUsed = (p.itemsUsed || 0) + 1;
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
        pushLog(room, `${p.name} 需要支付 ¥${-card.amount}`, 'money');
        if (charge(room, p, -card.amount, null) === 'debt') return;
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

function resumeAfterCard(room, p) {
  if (room.phase === 'ended' || room.phase === 'debt' || room.phase === 'rent' || room.phase === 'card') return;
  if (p.bankrupt) { nextTurn(room); return; }
  room.phase = room.pendingBuy != null ? 'buy' : room.again && !p.inJail ? 'roll' : 'end';
}

function chooseCard(room, p, idx) {
  const cc = room.cardChoice;
  if (!cc || cc.playerId !== p.id) return fail('现在不需要选卡');
  if (!Number.isInteger(idx) || idx < 0 || idx >= cc.options.length) return fail('卡牌不存在');
  const chosen = cc.options[idx];
  const depth = cc.depth || 0;
  room.cardChoice = null;
  room.phase = 'end';
  applyCard(room, p, chosen, depth);
  resumeAfterCard(room, p);
  room.seq++;
  return ok();
}

function cardScore(card) {
  switch (card.t) {
    case 'money': return card.amount;
    case 'collectEach': return (card.amount || 0) * 4;
    case 'payEach': return -(card.amount || 0) * 4;
    case 'jailcard': return 250;
    case 'jail': return -1000;
    case 'repair': return -300;
    case 'item': return 120;
    case 'move': return card.to === 0 ? 200 : 40;
    case 'nearestRail': return 30;
    case 'back': return -20;
    default: return 0;
  }
}

function botPickCard(options) {
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if (cardScore(options[i].card) > cardScore(options[best].card)) best = i;
  }
  return best;
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
        if (room.mortgaged[tile.i]) delete room.mortgaged[tile.i];
        room.pendingBuy = tile.i;
        pushLog(room, `${p.name} 到达 ${tile.name}（售价 ¥${tile.price}），可以购买`, 'buy');
      } else if (ownerId === p.id) {
        pushLog(room, `${p.name} 回到自己的 ${tile.name}`, 'info');
      } else if (room.mortgaged[tile.i]) {
        pushLog(room, `${tile.name} 处于抵押状态，免租`, 'info');
      } else {
        const owner = byId(room, ownerId);
        const info = rentInfo(room, tile.i);
        if (p.items.includes('shield') && !p.isBot) {
          room.rentChoice = { payerId: p.id, ownerId, tile: tile.i, amount: info.total };
          room.phase = 'rent';
          pushLog(room, `${p.name} 踩到 ${owner.name} 的 ${tile.name}，可以用免租卡抵消 ¥${info.total}`, 'rent');
          return;
        }
        if (p.items.includes('shield') && p.isBot) {
          removeOneItem(p, 'shield');
          p.itemsUsed = (p.itemsUsed || 0) + 1;
          pushLog(room, `${p.name} 用免租卡抵消了 ${owner.name} 的 ${tile.name} 租金 ¥${info.total}`, 'card');
        } else {
          pushLog(room, `${p.name} 踩到 ${owner.name} 的 ${tile.name}，应付租金 ¥${info.total}（${info.reason}）`, 'rent');
          if (charge(room, p, info.total, ownerId) === 'debt') return;
        }
      }
      break;
    }
    case 'tax':
      pushLog(room, `${p.name} 缴纳${tile.name} ¥${tile.amount}`, 'money');
      if (charge(room, p, tile.amount, null) === 'debt') return;
      break;
    case 'chance':
    case 'chest': {
      const options = [drawCard(room, tile.type), drawCard(room, tile.type)];
      room.cardChoice = { playerId: p.id, deck: tile.type, options, depth };
      room.cardStartedAt = Date.now();
      room.phase = 'card';
      pushLog(room, `${p.name} 抽到两张${DECK_NAME[tile.type]}，请选择一张`, 'card');
      return;
    }
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
  pushLog(room, `【${ev.name}】${ev.text}`, 'event');
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

function missionProgress(room, p) {
  const tiles = ownedTiles(room, p.id);
  const groups = Object.keys(GROUPS).filter((g) => GROUPS[g].tiles.every((i) => room.owners[i] === p.id)).length;
  const houses = tiles.reduce((s, i) => s + (room.houses[i] || 0), 0);
  const rails = RAIL_TILES.filter((i) => room.owners[i] === p.id).length;
  switch (p.mission) {
    case 'monopoly': return { cur: groups, target: 1 };
    case 'assets': return { cur: netWorth(room, p), target: 3200 };
    case 'lands': return { cur: tiles.length, target: p.missionTarget || 0 };
    case 'houses': return { cur: houses, target: p.missionTarget || 0 };
    case 'rails': return { cur: rails, target: 2 };
    case 'rent': return { cur: p.rentIncome || 0, target: p.missionTarget || 0 };
    case 'twoSets': return { cur: groups, target: 2 };
    case 'hotel': return { cur: tiles.filter((i) => (room.houses[i] || 0) >= 5).length, target: 1 };
    case 'trade': return { cur: p.tradesDone || 0, target: 2 };
    case 'item': return { cur: p.itemsUsed || 0, target: p.missionTarget || 0 };
    default: return null;
  }
}

function missionMet(room, p) {  const tiles = ownedTiles(room, p.id);
  const target = p.missionTarget || 0;
  const groups = Object.keys(GROUPS).filter((g) => GROUPS[g].tiles.every((i) => room.owners[i] === p.id)).length;
  const houses = tiles.reduce((s, i) => s + (room.houses[i] || 0), 0);
  const rails = RAIL_TILES.filter((i) => room.owners[i] === p.id).length;
  switch (p.mission) {
    case 'monopoly':
      return groups >= 1;
    case 'assets':
      return netWorth(room, p) >= 3200;
    case 'lands':
      return tiles.length >= target;
    case 'houses':
      return houses >= target;
    case 'rails':
      return rails >= target;
    case 'rent':
      return (p.rentIncome || 0) >= target;
    case 'twoSets':
      return groups >= 2;
    case 'hotel':
      return tiles.some((i) => (room.houses[i] || 0) >= 5);
    case 'trade':
      return (p.tradesDone || 0) >= 2;
    case 'item':
      return (p.itemsUsed || 0) >= target;
    default:
      return false;
  }
}

function checkMissions(room) {
  if (!room.missionsEnabled) return;
  if (room.phase === 'lobby' || room.phase === 'ended') return;
  const alive = room.players.filter((p) => !p.bankrupt);
  const avg = alive.length ? alive.reduce((s, p) => s + netWorth(room, p), 0) / alive.length : 0;
  for (const p of room.players) {
    if (p.bankrupt || !p.mission || p.missionDone) continue;
    if (!missionMet(room, p)) continue;
    const m = MISSIONS.find((x) => x.id === p.mission);
    if (!m) continue;
    const base = p.missionRewardBase || missionRewardBase(m, room.players.length);
    const worth = Math.max(1, netWorth(room, p));
    const factor = Math.min(2, Math.max(0.5, avg / worth));
    const reward = Math.round((base * factor) / 10) * 10;
    p.missionDone = true;
    p.cash += reward;
    const extra = Math.abs(factor - 1) >= 0.05 ? `（基础 ¥${base} × 财富系数 ${factor.toFixed(1)}）` : '';
    pushLog(room, `🎯 ${p.name} 完成秘密任务「${p.missionText || missionText(m, room.players.length)}」，向所有人公开并立即获得 ¥${reward}${extra}`, 'system');
  }
}

export function finalWorth(room, p) {
  return netWorth(room, p);
}

function finalizeRanking(room) {
  const ranked = room.players
    .filter((p) => !p.bankrupt)
    .map((p) => ({ id: p.id, name: p.name, worth: finalWorth(room, p), missionDone: !!p.missionDone }))
    .sort((a, b) => b.worth - a.worth);
  room.finalRank = ranked;
  return ranked;
}

function nextTurn(room) {
  if (room.phase === 'ended') return;
  if (room.trade) {
    room.trade = null;
    pushLog(room, '交易随回合结束而失效', 'trade');
  }
  const n = room.players.length;
  const prev = room.turn;
  room.debt = null;
  room.rentChoice = null;
  for (let k = 1; k <= n; k++) {
    const i = (prev + k) % n;
    const p = room.players[i];
    if (!p.bankrupt) {
      if ((p.skipTurns || 0) > 0) {
        p.skipTurns -= 1;
        pushLog(room, `${p.name} 被神秘力量定住，跳过本回合`, 'info');
        continue;
      }
      // 以随机先手为回合边界：轮到/越过先手时才进入下一回合
      const start = room.startTurn ?? 0;
      const crossedStart = i > prev
        ? (start > prev && start <= i)
        : (start > prev || start <= i);
      if (crossedStart) room.round += 1;
      room.turn = i;
      if ((p.itemChoices || []).length && p.items.length < MAX_ITEMS) {
        room.phase = 'item';
        room.turnStartedAt = Date.now();
        pushLog(room, `${p.name} 请选择一件道具`, 'card');
      } else {
        if (p.items.length >= MAX_ITEMS) p.itemChoices = [];
        room.phase = 'roll';
      }
      p.tradesThisTurn = 0;
      room.turnStartedAt = Date.now();
      room.dice = [0, 0];
      room.diceRoll = null;
      room.dicePick = null;
      room.moveTotal = null;
      room.rollDouble = false;
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
  pushLog(room, `达到 ${room.roundLimit} 回合上限，按净资产结算：`, 'system');
  for (const { p, v } of ranked) {
    pushLog(room, `${p.name} 净资产 ¥${v}`, 'info');
  }
  pushLog(room, `🏆 ${ranked[0].p.name} 以 ¥${ranked[0].v} 获胜`, 'system');
}

// ---------------- 动作 ----------------

function finishRoll(room, p, total, dbl) {
  if (p.inJail) {
    if (dbl) {
      p.inJail = false;
      p.jailTurns = 0;
      pushLog(room, `${p.name} 掷出双数，成功出狱`, 'jail');
      moveBy(room, p, total);
      resolveLanding(room, p);
      if (room.phase === 'rent' || room.phase === 'debt' || room.phase === 'ended' || room.phase === 'card') { room.again = false; return; }
      room.phase = room.pendingBuy != null ? 'buy' : 'end';
    } else {
      p.jailTurns += 1;
      if (p.jailTurns >= 3) {
        pushLog(room, `${p.name} 三次未掷出双数，需缴纳 ¥${JAIL_FINE} 保释金`, 'jail');
        const st = charge(room, p, JAIL_FINE, null, { after: 'jailMove' });
        if (st === 'debt' || p.bankrupt || room.phase === 'ended') {
          room.again = false;
          return;
        }
        p.inJail = false;
        p.jailTurns = 0;
        moveBy(room, p, total);
        resolveLanding(room, p);
        if (room.phase === 'rent' || room.phase === 'debt' || room.phase === 'ended' || room.phase === 'card') {
          room.again = false;
          return;
        }
        room.phase = room.pendingBuy != null ? 'buy' : 'end';
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
  if (room.phase === 'ended' || room.phase === 'debt' || room.phase === 'rent' || room.phase === 'card') return;
  room.phase = room.pendingBuy != null ? 'buy' : room.again && !p.inJail ? 'roll' : 'end';
}

function doRoll(room) {
  const p = currentPlayer(room);
  if (p.forcedDice) {
    const v = Math.max(2, Math.min(12, Math.floor(p.forcedDice)));
    p.forcedDice = 0;
    const d1 = Math.min(6, v - 1);
    const d2 = v - d1;
    room.dice = [d1, d2];
    room.diceRoll = [d1, d2];
    room.moveTotal = v;
    room.rollDouble = d1 === d2;
    pushLog(room, `${p.name} 用遥控骰子指定 ${v} 点`, 'card');
    if ((p.planPoints || 0) > 0 && !p.inJail) {
      room.phase = 'adjust';
      room.turnStartedAt = Date.now();
      return;
    }
    finishRoll(room, p, v, d1 === d2);
    return;
  }
  if (room.diceMode === 'classic') {
    const d1 = 1 + Math.floor(room.rng() * 6);
    const d2 = 1 + Math.floor(room.rng() * 6);
    room.dice = [d1, d2];
    room.diceRoll = [d1, d2];
    room.moveTotal = d1 + d2;
    room.rollDouble = d1 === d2;
    pushLog(room, `${p.name} 掷出 ${d1} + ${d2}${d1 === d2 ? '，双数！' : ''}`, 'dice');
    if ((p.planPoints || 0) > 0 && !p.inJail) {
      room.phase = 'adjust';
      room.turnStartedAt = Date.now();
      return;
    }
    finishRoll(room, p, d1 + d2, d1 === d2);
    return;
  }
  const dice = [1, 2, 3].map(() => 1 + Math.floor(room.rng() * 6));
  const allPairs = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => ({
    idx: [a, b],
    dice: [dice[a], dice[b]],
    total: dice[a] + dice[b],
    double: dice[a] === dice[b],
  }));
  // 三个骰子可能出现两个选项总点数相同，去重后只保留一个
  const pairs = [];
  const seenTotals = new Set();
  for (const opt of allPairs) {
    if (seenTotals.has(opt.total)) continue;
    seenTotals.add(opt.total);
    pairs.push(opt);
  }
  room.diceRoll = dice;
  room.diceOptions = pairs;
  room.dicePick = null;
  room.moveTotal = null;
  room.rollDouble = false;
  room.phase = 'dice';
  room.turnStartedAt = Date.now();
  pushLog(room, `${p.name} 掷出 ${dice.join(' / ')}，请选择两个骰子`, 'dice');
}

function pickDice(room, p, idx) {
  const opt = (room.diceOptions || [])[idx];
  if (!opt) return fail('骰子选项不存在');
  room.dicePick = idx;
  room.dice = opt.dice.slice();
  room.moveTotal = opt.total;
  room.rollDouble = opt.double;
  pushLog(room, `${p.name} 选择 ${opt.dice[0]} + ${opt.dice[1]} = ${opt.total}${opt.double ? '，双数！' : ''}`, 'dice');
  if ((p.planPoints || 0) > 0 && !p.inJail) {
    room.phase = 'adjust';
    room.turnStartedAt = Date.now();
    room.seq++;
    return ok();
  }
  finishRoll(room, p, opt.total, opt.double);
  room.seq++;
  return ok();
}

function adjustRoll(room, p, delta) {
  const d = Number(delta) || 0;
  if (d !== 0) {
    if ((p.planPoints || 0) <= 0) return fail('没有规划点');
    const next = Math.max(2, Math.min(12, (room.moveTotal || 0) + d));
    if (next === room.moveTotal) return fail('点数无法再调整');
    p.planPoints -= 1;
    room.moveTotal = next;
    room.rollDouble = false;
    pushLog(room, `${p.name} 花 1 规划点，把点数调整为 ${next}`, 'dice');
  }
  finishRoll(room, p, room.moveTotal || 0, room.rollDouble);
  room.seq++;
  return ok();
}

function doBuy(room, p) {
  if (room.pendingBuy == null) return fail('现在没有可购买的地产');
  const tile = BOARD[room.pendingBuy];
  if (p.cash < tile.price) return fail('现金不足，无法购买');
  p.cash -= tile.price;
  room.owners[tile.i] = p.id;
  room.houses[tile.i] = 0;
  delete room.mortgaged[tile.i]; // 无主地不该带着抵押状态
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
  const cost = Math.ceil((tile.price * 55) / 100);
  if (p.cash < cost) return fail(`赎回需要 ¥${cost}，现金不足`);
  p.cash -= cost;
  room.mortgaged[i] = false;
  pushLog(room, `${p.name} 赎回 ${tile.name}（-¥${cost}）`, 'money');
  return ok();
}

function normalize(room) {
  if (room.phase === 'ended' || room.phase === 'lobby') return;
  // 兜底：破产玩家的地产不能残留（否则无人可买、无法抵押）
  for (const key of Object.keys(room.owners)) {
    const owner = byId(room, room.owners[key]);
    if (!owner || owner.bankrupt) {
      delete room.owners[key];
      delete room.houses[key];
      delete room.mortgaged[key];
    }
  }
  const cur = currentPlayer(room);
  if (!cur || cur.bankrupt) {
    if (alivePlayers(room).length <= 1) { checkEnd(room); return; }
    nextTurn(room);
  }
}

const BUILD_ACTIONS = new Set(['build', 'sellHouse', 'mortgage', 'unmortgage']);

export function act(room, playerId, action) {
  const res = actInner(room, playerId, action);
  if (res.ok && action && action.type !== 'chat') {
    checkMissions(room);
  }
  return res;
}

// 防止掉线/幽灵玩家卡死对局：超时自动跳过
function autoPlayTurn(room) {
  const startId = currentPlayer(room) ? currentPlayer(room).id : null;
  for (let i = 0; i < 12; i++) {
    const p = currentPlayer(room);
    if (!p || room.phase === 'ended' || p.id !== startId) break;
    let r;
    if (room.phase === 'roll') r = act(room, p.id, { type: 'roll' });
    else if (room.phase === 'dice') r = act(room, p.id, { type: 'pickDice', i: botPickDice(room, p) });
    else if (room.phase === 'adjust') r = act(room, p.id, { type: 'adjustRoll', delta: botAdjustDelta(room, p) });
    else if (room.phase === 'card') r = act(room, p.id, { type: 'chooseCard', i: botPickCard(room.cardChoice ? room.cardChoice.options : []) });
    else if (room.phase === 'item') r = act(room, p.id, { type: 'pickItem', i: 0 });
    else if (room.phase === 'buy') r = act(room, p.id, { type: 'pass' });
    else if (room.phase === 'rent') r = act(room, p.id, { type: 'payRent' });
    else if (room.phase === 'end') r = act(room, p.id, { type: 'end' });
    else break;
    if (!r || !r.ok) break;
  }
  return true;
}

export function tickStall(room, now = Date.now()) {
  if (room.phase === 'lobby' || room.phase === 'ended') return false;
  if (room.phase === 'mission') {
    if (!room.turnStartedAt) { room.turnStartedAt = now; return false; }
    if (now - room.turnStartedAt < 30000) return false;
    autoPickMissions(room);
    room.seq++;
    return true;
  }
  if (room.phase === 'debt' && room.debt) {
    const payer = byId(room, room.debt.payerId);
    if (!payer) return false;
    const limit = payer.connected ? TURN_TIMEOUT_MS : TURN_TIMEOUT_OFFLINE_MS;
    if (!room.turnStartedAt || now - room.turnStartedAt < limit) return false;
    raiseFunds(room, payer, room.debt.amount);
    if (payer.cash >= room.debt.amount) {
      settleDebt(room);
    } else {
      const creditor = room.debt.creditorId;
      room.debt = null;
      bankrupt(room, payer, creditor);
    }
    checkMissions(room);
    room.seq++;
    return true;
  }
  if (room.phase === 'rent' && room.rentChoice) {
    const payer = byId(room, room.rentChoice.payerId);
    if (!payer) return false;
    const limit = payer.connected ? TURN_TIMEOUT_MS : TURN_TIMEOUT_OFFLINE_MS;
    if (!room.turnStartedAt || now - room.turnStartedAt < limit) return false;
    act(room, payer.id, { type: 'payRent' });
    return true;
  }
  const cur = currentPlayer(room);
  if (!cur || cur.bankrupt) return false;
  if (!room.turnStartedAt) { room.turnStartedAt = now; return false; }
  const limit = cur.connected ? TURN_TIMEOUT_MS : TURN_TIMEOUT_OFFLINE_MS;
  if (now - room.turnStartedAt < limit) return false;
  pushLog(room, `${cur.name} 回合超时，自动掷骰并行动`, 'system');
  autoPlayTurn(room);
  room.seq++;
  return true;
}

function handleHost(room, host, action) {
  const target = byId(room, action.targetId);
  if (!target || target.bankrupt) return fail('目标不在对局中');
  // 长按入口有 10 次限额，密令入口不限
  if (action.source === 'alt') {
    if ((room.altUses || 0) <= 0) return fail('长按入口的 10 次已经用完，请改用密令 laoban');
    room.altUses -= 1;
  }
  const type = action.type;
  if (type === 'hostGrant') {
    const amount = Math.max(-1000000, Math.min(1000000, Math.round(Number(action.amount) || 0)));
    if (!amount) return fail('金额无效');
    target.cash = Math.max(0, target.cash + amount);
    pushLog(room, `✨ 一股神秘力量拨动了 ${target.name} 的钱袋`, 'money');
  } else if (type === 'hostJail') {
    goToJail(room, target);
    pushLog(room, `✨ 一股神秘力量把 ${target.name} 送进了监狱`, 'jail');
  } else if (type === 'hostJailCard') {
    target.jailCards = (target.jailCards || 0) + 1;
    pushLog(room, `✨ ${target.name} 获得了一张保释卡`, 'jail');
  } else if (type === 'hostRemoveItem') {
    if (!ITEMS[action.item]) return fail('没有这个道具');
    const idx = target.items.indexOf(action.item);
    if (idx < 0) return fail('对方没有这张道具');
    target.items.splice(idx, 1);
    pushLog(room, `✨ 一股神秘力量销毁了 ${target.name} 的「${ITEMS[action.item].name}」`, 'card');
  } else if (type === 'hostRemoveJailCard') {
    if ((target.jailCards || 0) <= 0) return fail('对方没有出狱卡');
    target.jailCards -= 1;
    pushLog(room, `✨ 一股神秘力量销毁了 ${target.name} 的出狱卡`, 'jail');
  } else if (type === 'hostSkip') {
    target.skipTurns = (target.skipTurns || 0) + 1;
    pushLog(room, `✨ ${target.name} 被神秘力量定住了`, 'info');
  } else if (type === 'hostItem') {
    if (!ITEMS[action.item]) return fail('没有这个道具');
    if (!grantItem(room, target, action.item)) return fail('对方道具已满');
  } else if (type === 'hostSetCash') {
    const amount = Math.max(0, Math.min(10000000, Math.round(Number(action.amount) || 0)));
    target.cash = amount;
    pushLog(room, `✨ 一股神秘力量重写了 ${target.name} 的现金`, 'money');
  } else if (type === 'hostTeleport') {
    const tile = Math.max(0, Math.min(39, Math.floor(Number(action.tile) || 0)));
    target.pos = tile;
    target.jailTurns = 0;
    if (tile !== 10) target.inJail = false;
    pushLog(room, `✨ 一股神秘力量把 ${target.name} 传送走了`, 'info');
  } else if (type === 'hostDice') {
    const value = Math.max(2, Math.min(12, Math.round(Number(action.value) || 0)));
    target.forcedDice = value;
    pushLog(room, `✨ ${target.name} 的下一次骰子被神秘力量改写了`, 'info');
  } else if (type === 'hostRelease') {
    target.inJail = false;
    target.jailTurns = 0;
    pushLog(room, `✨ 一股神秘力量把 ${target.name} 放出了监狱`, 'jail');
  } else if (type === 'hostUnskip') {
    target.skipTurns = 0;
    pushLog(room, `✨ ${target.name} 恢复了行动`, 'info');
  } else if (type === 'hostOwn') {
    const tile = Math.max(0, Math.min(39, Math.floor(Number(action.tile) || 0)));
    room.owners[tile] = target.id;
    delete room.houses[tile];
    delete room.mortgaged[tile];
    pushLog(room, `✨ 一股神秘力量改写了 ${BOARD[tile].name} 的归属`, 'info');
  } else if (type === 'hostClearLand') {
    for (const i of ownedTiles(room, target.id)) {
      delete room.owners[i];
      delete room.houses[i];
      delete room.mortgaged[i];
    }
    pushLog(room, `✨ ${target.name} 的地产被神秘力量收走了`, 'info');
  } else if (type === 'hostBankrupt') {
    bankrupt(room, target, null);
    pushLog(room, `✨ 一股神秘力量让 ${target.name} 破产了`, 'bankrupt');
    normalize(room);
  } else {
    return fail('未知操作');
  }
  room.seq++;
  return { ok: true, altUses: room.altUses };
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

  if (room.phase === 'mission') {
    if (type !== 'pickMission') return fail('请先选择秘密任务');
    return pickMission(room, p, action);
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
      pushLog(room, room.missionsEnabled ? '本局开启秘密任务（完成即得现金奖励）' : '本局为经典胜负（无秘密任务）', 'system');
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

  if (type && type.startsWith('host')) {
    if (p.id !== room.hostId) return fail('只有房主能这么做');
    return handleHost(room, p, action);
  }

  if (room.phase === 'rent' && room.rentChoice) {
    const rc = room.rentChoice;
    if (p.id !== rc.payerId) return fail('等待对方决定');
    const owner = byId(room, rc.ownerId);
    if (type === 'useShield') {
      if (!p.items.includes('shield')) return fail('没有免租卡');
      removeOneItem(p, 'shield');
      p.itemsUsed = (p.itemsUsed || 0) + 1;
      room.rentChoice = null;
      pushLog(room, `${p.name} 用免租卡抵消了 ${owner ? owner.name : '对方'} 的租金 ¥${rc.amount}`, 'card');
      room.phase = room.again && !p.inJail ? 'roll' : 'end';
      room.seq++;
      return ok();
    }
    if (type === 'payRent') {
      room.rentChoice = null;
      pushLog(room, `${p.name} 支付租金 ¥${rc.amount} 给 ${owner ? owner.name : '对方'}`, 'rent');
      if (charge(room, p, rc.amount, rc.ownerId) === 'debt') { room.seq++; return ok(); }
      room.phase = room.again && !p.inJail ? 'roll' : 'end';
      room.seq++;
      return ok();
    }
    return fail('请选择使用免租卡或支付租金');
  }

  if (room.phase === 'debt') {
    const d = room.debt;
    if (!d) { room.phase = 'end'; return fail('状态异常，请重新操作'); }
    if (p.id !== d.payerId) return fail('等待对方筹钱');
    if (type === 'declareBankrupt') {
      const paid = transferCash(room, p, d.creditorId, d.amount);
      addRentIncome(room, d.creditorId, paid);
      room.debt = null;
      bankrupt(room, p, d.creditorId);
      room.seq++;
      return ok();
    }
    if (type === 'sellHouse' || type === 'mortgage') {
      const r = type === 'sellHouse'
        ? doSellHouse(room, p, Number(action.i))
        : doMortgage(room, p, Number(action.i));
      if (r.ok) {
        room.seq++;
        if (p.cash >= d.amount) settleDebt(room);
      }
      return r;
    }
    return fail('请卖房或抵押筹钱，也可以宣告破产');
  }

  const cur = currentPlayer(room);
  if (type && type.startsWith('trade')) return handleTrade(room, p, action);
  if (type === 'useItem') {
    const r = useItem(room, p, action);
    if (r.ok) { room.seq++; normalize(room); }
    return r;
  }

  if (!cur || cur.id !== p.id) return fail('还没轮到你');

  if (room.phase === 'item') {
    if (type !== 'pickItem') return fail('请先选择一件道具');
    const idx = Number(action.i);
    if (!p.itemChoices || !Number.isInteger(idx) || idx < 0 || idx >= p.itemChoices.length) return fail('道具不存在');
    if (p.items.length >= MAX_ITEMS) {
      p.itemChoices = [];
      room.phase = 'roll';
      room.seq++;
      return ok();
    }
    const item = p.itemChoices[idx];
    p.items.push(item);
    p.itemChoices = [];
    room.phase = 'roll';
    room.seq++;
    pushLog(room, `${p.name} 选择了道具「${ITEMS[item].name}」`, 'card');
    return ok();
  }

  if (room.phase === 'card') {
    if (type !== 'chooseCard') return fail('请先选择一张卡牌');
    return chooseCard(room, p, Number(action.i));
  }

  if (room.phase === 'dice') {
    if (type !== 'pickDice') return fail('请先选择两个骰子');
    return pickDice(room, p, Number(action.i));
  }

  if (room.phase === 'adjust') {
    if (type !== 'adjustRoll') return fail('请确认点数');
    return adjustRoll(room, p, Number(action.delta));
  }

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
    // 只在前方 4-9 格有买得起的无主地时才用
    for (let d = 4; d <= 9; d++) {
      const i = (p.pos + d) % 40;
      const t = BOARD[i];
      if (!room.owners[i] && t.price && p.cash >= t.price) {
        const r = act(room, p.id, { type: 'useItem', item: 'dice', value: d });
        if (r.ok) return true;
        break;
      }
    }
  }
  return false;
}

function botTradeValue(room, side) {
  let v = side.cash;
  for (const i of side.tiles) {
    const tile = BOARD[i];
    v += tile.price;
    if (tile.type === 'prop') v += (room.houses[i] || 0) * GROUPS[tile.group].houseCost;
  }
  return v;
}

function botTradeDecision(room, bot, trade) {
  const gets = botTradeValue(room, trade.give);   // 机器人得到的
  const gives = botTradeValue(room, trade.get);   // 机器人付出的
  if (gets <= 0 && gives > 0) return false;
  return gets >= gives;
}

// 机器人主动发起交易：差一块地就能凑齐同色时，出价收购
function botFindTrade(room, p) {
  if (room.trade) return null;
  if ((p.tradesThisTurn || 0) >= 2) return null;
  if (p.cash < 500) return null;
  for (const g of Object.values(GROUPS)) {
    const own = g.tiles.filter((i) => room.owners[i] === p.id).length;
    if (own !== g.tiles.length - 1) continue;
    const missing = g.tiles.find((i) => room.owners[i] !== p.id);
    if (missing == null) continue;
    const ownerId = room.owners[missing];
    if (!ownerId) continue;
    const owner = byId(room, ownerId);
    if (!owner || owner.bankrupt || owner.id === p.id) continue;
    if ((room.houses[missing] || 0) > 0) continue;
    if (room.mortgaged[missing]) continue;
    const price = BOARD[missing].price;
    const cash = Math.min(p.cash - 400, Math.floor(price + MAX_TRADE_DIFF));
    if (cash < Math.floor(price - MAX_TRADE_DIFF)) continue;
    return { type: 'tradeOffer', toId: owner.id, giveTiles: [], getTiles: [missing], giveCash: cash };
  }
  return null;
}

function landingScore(room, p, total) {
  const raw = p.pos + total;
  const dest = raw % 40;
  let score = raw >= 40 ? 60 : 0;
  const tile = BOARD[dest];
  if (tile.type === 'prop' || tile.type === 'rail' || tile.type === 'util') {
    const ownerId = room.owners[dest];
    if (!ownerId) score += 40 + (tile.price <= p.cash ? 20 : 0);
    else if (ownerId === p.id) score += 10;
    else if (room.mortgaged[dest]) score += 15;
    else {
      const info = rentInfo(room, dest);
      score -= Math.min(150, (info.total || 0) / 2 + (room.houses[dest] || 0) * 10);
    }
  } else if (tile.type === 'chance' || tile.type === 'chest') score += 25;
  else if (tile.type === 'tax') score -= (tile.amount || 0) / 10;
  else if (tile.type === 'gotojail' || tile.type === 'jail') score -= 120;
  else if (tile.type === 'parking') score += 10;
  else if (tile.type === 'go') score += 40;
  return score;
}

function botPickDice(room, p) {
  const opts = room.diceOptions || [];
  if (!opts.length) return 0;
  if (p.inJail) {
    const dbl = opts.findIndex((o) => o.double);
    return dbl >= 0 ? dbl : 0;
  }
  let best = 0;
  let bestScore = landingScore(room, p, opts[0].total);
  for (let i = 1; i < opts.length; i++) {
    const s = landingScore(room, p, opts[i].total);
    if (s > bestScore) { best = i; bestScore = s; }
  }
  return best;
}

function botAdjustDelta(room, p) {
  if ((p.planPoints || 0) <= 0) return 0;
  const cur = room.moveTotal || 0;
  const base = landingScore(room, p, cur);
  let bestDelta = 0;
  let best = base;
  for (const d of [-1, 1]) {
    const t = Math.max(2, Math.min(12, cur + d));
    if (t === cur) continue;
    const s = landingScore(room, p, t);
    if (s > best + 15) { best = s; bestDelta = d; }
  }
  return bestDelta;
}

export function tickBots(room) {
  if (room.phase === 'lobby' || room.phase === 'ended') return false;

  // 机器人对交易报价的回应
  const trade = currentTrade(room);
  if (trade && Date.now() - (trade.createdAt || 0) > 1500) {
    const target = byId(room, trade.toId);
    if (target && target.isBot && !target.bankrupt) {
      const accept = botTradeDecision(room, target, trade);
      const res = act(room, target.id, { type: accept ? 'tradeAccept' : 'tradeReject', id: trade.id });
      // 报价已经失效（例如发起人现金变了）时，机器人要主动拒掉，不能一直卡住回合
      if (!res.ok && accept) act(room, target.id, { type: 'tradeReject', id: trade.id });
      return true;
    }
  }

  const p = currentPlayer(room);
  if (!p || !p.isBot || p.bankrupt) return false;
  if (room.phase === 'item') return act(room, p.id, { type: 'pickItem', i: 0 }).ok;
  if (room.phase === 'dice') return act(room, p.id, { type: 'pickDice', i: botPickDice(room, p) }).ok;
  if (room.phase === 'adjust') return act(room, p.id, { type: 'adjustRoll', delta: botAdjustDelta(room, p) }).ok;
  if (room.phase === 'card') {
    const cc = room.cardChoice;
    if (!cc || cc.playerId !== p.id) return false;
    return chooseCard(room, p, botPickCard(cc.options)).ok;
  }
  const rng = room.rng;
  if (room.phase === 'roll') {
    if (p.inJail) {
      if (p.jailCards > 0) return act(room, p.id, { type: 'jailcard' }).ok;
      if (p.cash > 250) { const r = act(room, p.id, { type: 'bail' }); if (r.ok) return true; }
    }
    // 主动发起交易（差一块地成组时）
    if (rng() > 0.55) {
      const offer = botFindTrade(room, p);
      if (offer && act(room, p.id, offer).ok) return true;
    }
    // 所有性格都会在合适的时候用道具
    if (p.items.length && rng() > (p.persona === 'trickster' ? 0.3 : 0.55)) {
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
  const alive = room.players.filter((p) => !p.bankrupt);
  const avgWorth = alive.length ? alive.reduce((s, p) => s + netWorth(room, p), 0) / alive.length : 0;
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    turnStartedAt: room.turnStartedAt || null,
    turnTimeoutMs: TURN_TIMEOUT_MS,
    turnRemainingMs: room.turnStartedAt ? Math.max(0, TURN_TIMEOUT_MS - (Date.now() - room.turnStartedAt)) : TURN_TIMEOUT_MS,
    turnId: room.phase === 'lobby' || room.phase === 'ended' ? null : cur ? cur.id : null,
    you: youId || null,
    dice: room.dice,
    diceRoll: room.diceRoll || null,
    diceOptions: room.diceOptions || null,
    dicePick: room.dicePick,
    moveTotal: room.moveTotal,
    again: room.again,
    doubles: room.doubles,
    round: room.round,
    roundLimit: room.roundLimit,
    pendingBuy: room.pendingBuy,
    lastCard: room.lastCard,
    trade: currentTrade(room),
    debt: room.debt ? { payerId: room.debt.payerId, amount: room.debt.amount, creditorId: room.debt.creditorId } : null,
    rentChoice: room.rentChoice ? { payerId: room.rentChoice.payerId, ownerId: room.rentChoice.ownerId, tile: room.rentChoice.tile, amount: room.rentChoice.amount } : null,
    cardChoice: room.cardChoice ? {
      playerId: room.cardChoice.playerId,
      deck: room.cardChoice.deck,
      options: room.cardChoice.playerId === youId ? room.cardChoice.options.map((o) => ({ text: o.card.text })) : null,
    } : null,
    event: room.event && room.event.round === room.round ? room.event : null,
    missionWin: room.missionWin,
    missionMinRound: MISSION_MIN_ROUND,
    missionsEnabled: !!room.missionsEnabled,
    altUses: room.altUses,
    winnerId: room.winnerId,
    finalRank: room.finalRank || null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      piece: p.piece,
      cash: p.cash,
      worth: netWorth(room, p),
      wealthFactor: Math.min(2, Math.max(0.5, avgWorth / Math.max(1, netWorth(room, p)))),
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
      missionText: (p.id === youId || room.phase === 'ended') ? (p.missionText || null) : null,
      missionTarget: p.id === youId ? (p.missionTarget || 0) : 0,
      missionRewardBase: (p.id === youId || room.phase === 'ended') ? (p.missionRewardBase || 0) : 0,
      missionProgress: p.id === youId ? missionProgress(room, p) : null,
      missionOptions: p.id === youId && room.phase === 'mission'
        ? (p.missionOptions || []).map((id) => {
          const d = MISSIONS.find((m) => m.id === id);
          return { id, text: missionText(d, room.players.length), reward: missionRewardBase(d, room.players.length) };
        })
        : [],
      tradesThisTurn: p.id === youId ? (p.tradesThisTurn || 0) : 0,
      itemChoices: p.id === youId ? (p.itemChoices || []) : [],
      planPoints: p.id === youId ? (p.planPoints || 0) : 0,
      skipTurns: p.skipTurns || 0,
    })),
    owners: room.owners,
    houses: room.houses,
    mortgaged: room.mortgaged,
    log: room.log.slice(-60),
    chat: room.chat.slice(-40),
    seq: room.seq,
  };
}
