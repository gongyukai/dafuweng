import { BOARD, GROUPS, sideOf, gridPos } from '../game/board.js';
import { PIECES, pieceOf } from '../game/engine.js';
import {
  HttpNet, HostNet, GuestNet, LocalNet, loadSession, saveSession, detectServer,
} from './net.js';

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const icon = (file) => `assets/twemoji/${file}`;

const S = {
  view: null,
  me: null,
  code: null,
  net: null,
  tab: 'log',
  hasServer: false,
  solo: false,
  lastClick: 0,
  lastClickType: '',
  selectedTile: null,
  lastDiceKey: '',
  lastCardKey: null,
  tokens: new Map(),
  lastCash: new Map(),
  ready: false,
  trade: null,
};

const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

const TILE_ICON = {
  go: '1f3c1.svg',
  jail: '1f694.svg',
  parking: '1f17f.svg',
  gotojail: '1f6a8.svg',
  chance: '2753.svg',
  chest: '1f381.svg',
  tax: '1f4b8.svg',
  rail: '1f689.svg',
};

// ---------------- 基础 UI ----------------

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setStatus(text, kind = '') {
  const el = $('#status');
  el.textContent = text;
  el.className = `status ${kind}`;
}

function showApp() {
  $('#start').classList.add('hidden');
  $('#app').classList.remove('hidden');
  S.ready = true;
  requestAnimationFrame(relayoutTokens);
}

function showStart() {
  $('#app').classList.add('hidden');
  $('#start').classList.remove('hidden');
  S.ready = false;
}

function getQueryRoom() {
  const raw = new URLSearchParams(location.search).get('room') || '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function getName() {
  const v = $('#nameInput').value.trim().slice(0, 10);
  if (v) { localStorage.setItem('dmj.name', v); return v; }
  const fallback = `玩家${Math.floor(Math.random() * 90 + 10)}`;
  localStorage.setItem('dmj.name', fallback);
  return fallback;
}

// ---------------- 行动字幕 ----------------

const SUB_KINDS = new Set(['dice', 'money', 'rent', 'buy', 'card', 'jail', 'build', 'bankrupt', 'trade']);
const subQueue = [];
let subBusy = false;
let lastLogId = null;

function syncSubtitles(v) {
  const logs = v.log || [];
  if (!logs.length) return;
  const newest = logs[logs.length - 1].id;
  if (lastLogId == null) { lastLogId = newest; return; }
  if (newest <= lastLogId) return;
  const fresh = logs.filter((l) => l.id > lastLogId && SUB_KINDS.has(l.kind));
  lastLogId = newest;
  if (!fresh.length) return;
  subQueue.push(...fresh.slice(-3));
  while (subQueue.length > 2) subQueue.shift();
  if (!subBusy) pumpSubtitles();
}

async function pumpSubtitles() {
  subBusy = true;
  const el = $('#subtitle');
  while (subQueue.length) {
    const item = subQueue.shift();
    el.textContent = item.text;
    el.className = `subtitle show kind-${item.kind}`;
    await sleep(1400);
    el.classList.remove('show');
    await sleep(260);
  }
  subBusy = false;
}

function resetSubtitles() {
  subQueue.length = 0;
  lastLogId = null;
  const el = $('#subtitle');
  if (el) { el.className = 'subtitle'; el.textContent = ''; }
}

// ---------------- 联机入口 ----------------

const handlers = {
  onState(v) {
    S.view = v;
    if (v && v.you) S.me = v.you;
    render();
  },
  onStatus(text, kind) { setStatus(text, kind); },
  onError(msg) { toast(msg); },
  onSelf({ code, playerId }) {
    S.code = code;
    S.me = playerId;
    if (code && code !== 'SOLO') {
      const url = new URL(location.href);
      url.searchParams.set('room', code);
      history.replaceState({}, '', url);
    }
    showApp();
  },
};

async function createRoom() {
  const name = getName();
  setStatus('正在建房…', 'warn');
  const net = S.hasServer ? new HttpNet(handlers) : new HostNet(handlers);
  S.net = net;
  try {
    await net.create(name);
    S.solo = false;
  } catch (e) {
    S.net = null;
    net.close();
    toast(e.message);
    setStatus('建房失败', 'bad');
  }
}

async function joinRoom(code, silent = false) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (c.length !== 4) { if (!silent) toast('房间码是 4 位字母数字'); return; }
  const name = getName();
  setStatus('正在加入…', 'warn');
  const net = S.hasServer ? new HttpNet(handlers) : new GuestNet(handlers);
  S.net = net;
  try {
    await net.join(c, name);
    S.solo = false;
  } catch (e) {
    S.net = null;
    net.close();
    if (!silent) { toast(e.message); setStatus('加入失败', 'bad'); }
  }
}

async function startSolo() {
  const name = getName();
  setStatus('创建单机对局…', 'warn');
  const net = new LocalNet(handlers);
  S.net = net;
  S.solo = true;
  const q = new URLSearchParams(location.search);
  const bots = Math.max(1, Math.min(5, Number(q.get('bots')) || 3));
  try {
    await net.create(name, { bots });
    setStatus('单机人机对战', 'ok');
  } catch (e) {
    S.net = null;
    toast(e.message);
  }
}

function leave() {
  if (S.net) S.net.close();
  S.net = null;
  S.view = null;
  S.me = null;
  S.tokens.clear();
  resetSubtitles();
  const url = new URL(location.href);
  url.searchParams.delete('room');
  location.href = url.toString();
}

// ---------------- 棋盘 ----------------

function tileEl(t, v) {
  const side = sideOf(t.i);
  const { r, c } = gridPos(t.i);
  const el = document.createElement('div');
  el.className = `tile side-${side}${side === 'corner' ? ' corner' : ''}`;
  el.style.gridArea = `${r} / ${c} / ${r + 1} / ${c + 1}`;
  el.dataset.i = t.i;
  el.title = t.name;
  if (S.selectedTile === t.i) el.classList.add('sel');

  const parts = [];
  if (t.type === 'prop') {
    const g = GROUPS[t.group];
    el.style.background = `linear-gradient(180deg, ${g.color}30, #fffdf6 62%)`;
    parts.push(`<div class="band" style="background:linear-gradient(180deg, ${g.color}, ${g.color}b8)"></div>`);
    parts.push(`<img class="wm" src="${icon(`${t.icon}.svg`)}" alt="">`);
  }

  const ownerId = v.owners[t.i];
  const owner = ownerId ? v.players.find((p) => p.id === ownerId) : null;
  if (owner) {
    el.style.setProperty('--owner', owner.color);
    el.classList.add('owned');
  }
  if (v.mortgaged[t.i]) el.classList.add('mortgaged');

  if (t.type === 'prop') {
    parts.push(`<div class="tname">${esc(t.name)}</div><div class="tprice">¥${t.price}</div>`);
  } else if (t.type === 'rail') {
    parts.push(`<img class="ico" src="${icon('1f689.svg')}" alt=""><div class="tname">${esc(t.short)}</div><div class="tprice">¥${t.price}</div>`);
  } else if (t.type === 'util') {
    parts.push(`<img class="ico" src="${icon(t.i === 12 ? '1f4a1.svg' : '1f6b0.svg')}" alt=""><div class="tname">${esc(t.short)}</div><div class="tprice">¥${t.price}</div>`);
  } else if (t.type === 'chance' || t.type === 'chest') {
    parts.push(`<img class="ico" src="${icon(TILE_ICON[t.type])}" alt=""><div class="tname">${t.type === 'chance' ? '机会' : '命运'}</div>`);
  } else if (t.type === 'tax') {
    parts.push(`<img class="ico" src="${icon(TILE_ICON.tax)}" alt=""><div class="tname">${esc(t.name)}</div><div class="tprice">¥${t.amount}</div>`);
  } else if (t.type === 'go') {
    parts.push(`<img class="ico" src="${icon(TILE_ICON.go)}" alt=""><div class="tname">起点</div><div class="tprice">+¥200</div>`);
  } else if (t.type === 'jail') {
    parts.push(`<img class="ico" src="${icon(TILE_ICON.jail)}" alt=""><div class="tname">监狱 / 探监</div>`);
  } else if (t.type === 'parking') {
    parts.push(`<img class="ico" src="${icon(TILE_ICON.parking)}" alt=""><div class="tname">免费停车</div>`);
  } else if (t.type === 'gotojail') {
    parts.push(`<img class="ico" src="${icon(TILE_ICON.gotojail)}" alt=""><div class="tname">入狱</div>`);
  }

  if (owner) {
    parts.push(`<span class="owner-pin" style="background:${owner.color}" title="${esc(owner.name)}"></span>`);
  }

  const h = v.houses[t.i] || 0;
  if (h > 0) {
    const marks = h >= 5 ? '<span class="hotel"></span>' : Array.from({ length: h }, () => '<span class="h"></span>').join('');
    parts.push(`<div class="houses">${marks}</div>`);
  }

  el.innerHTML = parts.join('');
  return el;
}

function dieHTML(face, rolling) {
  if (!face) return '<div class="die dim"><span class="die-q">?</span></div>';
  const on = new Set(PIPS[face] || PIPS[1]);
  let cells = '';
  for (let i = 0; i < 9; i++) cells += `<span class="pip${on.has(i) ? ' on' : ''}"></span>`;
  return `<div class="die${rolling ? ' rolling' : ''}">${cells}</div>`;
}

function tileBox(pos) {
  const layer = $('#gridLayer');
  const board = $('#board');
  const el = layer && layer.querySelector(`.tile[data-i="${pos}"]`);
  if (!el || !board) return { x: 0, y: 0, w: 0, h: 0 };
  const b = board.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  // 减去边框宽度：绝对定位的 token 层以内边距盒为原点
  return {
    x: r.left - b.left - board.clientLeft,
    y: r.top - b.top - board.clientTop,
    w: r.width,
    h: r.height,
  };
}

function tileCenter(pos) {
  const box = tileBox(pos);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function tokenWidth() {
  const el = document.querySelector('.tk');
  return el ? el.getBoundingClientRect().width : 26;
}

function layoutToken(t, animate = true) {
  const v = S.view;
  if (!v) return;
  const pid = t.el.dataset.pid;
  const p = v.players.find((x) => x.id === pid);
  if (!p) return;
  // 以棋子自己的位置为准：动画过程中视图可能已经更新，用 p.pos 会画错地方
  const at = t.pos;
  const box = tileBox(at);
  const same = v.players.filter((x) => !x.bankrupt && x.pos === at);
  const idx = same.findIndex((x) => x.id === pid);
  const n = Math.max(same.length, 1);
  const size = tokenWidth();
  const spread = n > 1 ? Math.min(size * 0.62, Math.max(0, (box.w - size - 4) / (n - 1))) : 0;
  const off = (idx - (n - 1) / 2) * spread;
  const x = box.x + box.w / 2 + off;
  const y = box.y + box.h - size * 0.78;
  if (!animate) t.el.classList.add('instant');
  t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  t.el.style.zIndex = String(8 + (idx < 0 ? 0 : idx));
  if (!animate) {
    void t.el.offsetWidth;
    t.el.classList.remove('instant');
  }
}

async function walkToken(t, from, to, v) {
  const dist = (to - from + 40) % 40;
  if (dist === 0) { layoutToken(t); return; }
  const p = S.view && S.view.players.find((x) => x.id === t.el.dataset.pid);
  // 入狱是“押送”，不能按向前走的格数算：从 38 格进监狱否则会绕棋盘走 12 格
  const jailMove = !!(p && p.inJail && to === 10 && from !== 10);
  t.walking = true;
  if (jailMove || dist > 12) {
    // 传送：先在原地淡出，再淡入到目标格，避免“瞬移闪一下”
    t.el.classList.add('fade-out');
    await sleep(170);
    t.pos = to;
    layoutToken(t);
    await sleep(70);
    t.el.classList.remove('fade-out');
    await sleep(320);
    const tile = document.querySelector(`.tile[data-i="${to}"]`);
    if (tile) { tile.classList.add('landed'); setTimeout(() => tile.classList.remove('landed'), 700); }
  } else {
    t.el.classList.add('walking');
    for (let i = 1; i <= dist; i++) {
      const box = tileBox((from + i) % 40);
      const y = box.y + box.h - tokenWidth() * 0.78;
      t.el.style.transform = `translate(${box.x + box.w / 2}px, ${y}px) translate(-50%, -50%)`;
      await sleep(170);
    }
    t.pos = to;
    t.el.classList.remove('walking');
    layoutToken(t, false);
    const tile = document.querySelector(`.tile[data-i="${to}"]`);
    if (tile) { tile.classList.add('landed'); setTimeout(() => tile.classList.remove('landed'), 700); }
  }
  t.walking = false;
  if (t.pending != null && t.pending !== t.pos) {
    const next = t.pending;
    const cur = t.pos;
    t.pending = null;
    walkToken(t, cur, next, v);
  }
}

function syncTokens(v) {
  const layer = $('#tokenLayer');
  const alive = new Set(v.players.filter((p) => !p.bankrupt).map((p) => p.id));
  for (const [id, t] of S.tokens) {
    if (!alive.has(id)) { t.el.remove(); S.tokens.delete(id); }
  }
  for (const p of v.players) {
    if (p.bankrupt) continue;
    let t = S.tokens.get(p.id);
    if (!t) {
      const el = document.createElement('div');
      el.className = 'tk instant';
      el.dataset.pid = p.id;
      el.style.setProperty('--pc', p.color);
      el.innerHTML = `<img src="${icon(pieceOf(p.piece).file)}" alt="${esc(p.name)}">`;
      layer.appendChild(el);
      t = { el, pos: p.pos, walking: false, pending: null };
      S.tokens.set(p.id, t);
      void el.offsetWidth;
      el.classList.remove('instant');
      layoutToken(t, false);
      continue;
    }
    t.el.style.setProperty('--pc', p.color);
    const img = t.el.querySelector('img');
    const src = icon(pieceOf(p.piece).file);
    if (img.getAttribute('src') !== src) img.src = src;
    if (t.walking) { t.pending = p.pos; continue; }
    if (t.pos !== p.pos) walkToken(t, t.pos, p.pos, v);
  }
  for (const [, t] of S.tokens) {
    if (!t.walking) layoutToken(t, false);
  }
}

function relayoutTokens() {
  if (!S.view) return;
  for (const [, t] of S.tokens) {
    if (!t.walking) layoutToken(t, false);
  }
}

function floatMoney(p, delta) {
  const layer = $('#tokenLayer');
  const c = tileCenter(p.pos);
  const el = document.createElement('div');
  el.className = `float-money ${delta > 0 ? 'plus' : 'minus'}`;
  el.textContent = `${delta > 0 ? '+' : '−'}¥${fmt(Math.abs(delta))}`;
  el.style.left = `${c.x}px`;
  el.style.top = `${c.y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function syncMoney(v) {
  for (const p of v.players) {
    const prev = S.lastCash.get(p.id);
    S.lastCash.set(p.id, p.cash);
    if (prev == null || prev === p.cash) continue;
    if (Math.abs(p.cash - prev) < 1) continue;
    floatMoney(p, p.cash - prev);
  }
}

// ---------------- 中央信息区 ----------------

function rentTable(t) {
  if (t.type === 'prop') return t.rent;
  return null;
}

function centerLobby(v) {
  const code = v.code === 'SOLO' ? '单机对战' : v.code;
  return `<div class="center-inner lobby-center">
    <div class="brand-big">大富翁</div>
    <div class="brand-sub-big">中国城市版</div>
    <div class="lobby-code">${esc(code)}</div>
    <p class="lobby-tip">${v.players.length < 2 ? '至少 2 人才能开局，可以添加电脑玩家' : '人齐了，房主点击「开始游戏」'}</p>
    <div class="lobby-players">${v.players.map((p) => `
      <div class="lp"><span class="lp-av" style="--pc:${p.color}"><img src="${icon(pieceOf(p.piece).file)}" alt=""></span>${esc(p.name)}</div>
    `).join('')}</div>
  </div>`;
}

function centerEnded(v) {
  const w = v.players.find((p) => p.id === v.winnerId);
  return `<div class="center-inner">
    <img class="trophy-big" src="${icon('1f3c6.svg')}" alt="">
    <div class="end-name">${esc(w ? w.name : '—')}</div>
    <div class="end-sub">赢得本局</div>
  </div>`;
}

function focusCard(v, idx) {
  const t = BOARD[idx];
  if (!t) return '';
  const ownerId = v.owners[idx];
  const owner = ownerId ? v.players.find((p) => p.id === ownerId) : null;
  const h = v.houses[idx] || 0;
  const g = t.group ? GROUPS[t.group] : null;
  const color = g ? g.color : '#9aab9f';
  let body = '';
  if (t.type === 'prop' || t.type === 'rail' || t.type === 'util') {
    const rents = t.rent ? t.rent.map((x) => `¥${x}`).join(' · ') : '';
    let bars = '';
    if (t.rent) {
      const max = Math.max(...t.rent);
      bars = `<div class="fc-bars">${t.rent.map((r) => `<span style="height:${Math.max(10, Math.round((r / max) * 100))}%" title="¥${r}"></span>`).join('')}</div>`;
    }
    body = `<div class="fc-row"><span>标价</span><b>¥${t.price}</b></div>
      ${owner ? `<div class="fc-row"><span>拥有者</span><b style="color:${owner.color}">${esc(owner.name)}</b></div>` : '<div class="fc-row"><span>状态</span><b class="free">无主</b></div>'}
      ${h > 0 ? `<div class="fc-row"><span>建筑</span><b>${h >= 5 ? '旅馆' : `${h} 栋房子`}</b></div>` : ''}
      ${v.mortgaged[idx] ? '<div class="fc-row"><span>状态</span><b class="warn">已抵押</b></div>' : ''}
      ${rents ? `<div class="fc-rents">${t.type === 'prop' ? '租金 ' + rents : t.type === 'rail' ? '租金 ¥25 / 50 / 100 / 200' : '租金 骰子点数 ×4（双持 ×10）'}</div>` : ''}
      ${bars}`;
  } else if (t.type === 'chance' || t.type === 'chest') {
    body = `<div class="fc-row"><span>类型</span><b>${t.type === 'chance' ? '机会' : '命运'}</b></div>
      <div class="fc-desc">踩到抽一张卡，可能是收入、罚款、前进或入狱。</div>`;
  } else if (t.type === 'tax') {
    body = `<div class="fc-row"><span>金额</span><b>¥${t.amount}</b></div><div class="fc-desc">踩到就要缴纳。</div>`;
  } else if (t.type === 'go') {
    body = '<div class="fc-desc">经过或停留领取 ¥200。</div>';
  } else if (t.type === 'jail') {
    body = '<div class="fc-desc">入狱后掷出双数、付 ¥50 或用出狱卡才能出来。</div>';
  } else if (t.type === 'gotojail') {
    body = '<div class="fc-desc">踩到直接进监狱，不经过起点。</div>';
  } else if (t.type === 'parking') {
    body = '<div class="fc-desc">免费休息，什么都不发生。</div>';
  }
  return `<div class="focus-card${S.selectedTile === idx ? ' selected' : ''}" style="--c:${color}">
    <div class="fc-head"><span class="fc-name">${esc(t.name)}</span><span class="fc-tag">${t.type === 'prop' ? '地产' : t.type === 'rail' ? '车站' : t.type === 'util' ? '公用事业' : '格子'}</span></div>
    <div class="fc-body">${body}</div>
  </div>`;
}

function renderCenter(v) {
  const el = $('#centerLayer');
  if (v.phase === 'lobby') { el.innerHTML = centerLobby(v); return; }
  if (v.phase === 'ended') { el.innerHTML = centerEnded(v); return; }

  const cur = v.players.find((p) => p.id === v.turnId);
  const isMine = v.turnId === S.me;
  const [a, b] = v.dice;
  const diceKey = `${a}-${b}-${v.turnId || ''}-${v.round}`;
  const rolling = diceKey !== S.lastDiceKey && a > 0;
  S.lastDiceKey = diceKey;

  const cardKey = v.lastCard ? `${v.lastCard.deck}:${v.lastCard.text}` : null;
  const cardChanged = cardKey && cardKey !== S.lastCardKey;
  S.lastCardKey = cardKey;

  const focusIdx = S.selectedTile != null ? S.selectedTile : (cur ? cur.pos : 0);
  const turnText = isMine ? '轮到你了' : `等待 ${cur ? esc(cur.name) : '…'}`;
  const curPiece = cur ? icon(pieceOf(cur.piece).file) : '';
  const strip = v.players.filter((p) => !p.bankrupt).map((p) => `
    <span class="ccp${p.id === v.turnId ? ' on' : ''}" style="--pc:${p.color}">
      <img src="${icon(pieceOf(p.piece).file)}" alt="">
      <em>${esc(p.name)}</em><b>¥${fmt(p.cash)}</b>
    </span>`).join('');

  el.innerHTML = `<div class="cc-watermark">大富翁</div>
  <div class="center-inner">
    <div class="cc-block">
      <div class="cc-top">
        <span class="cc-round">第 ${v.round} / ${v.roundLimit} 回合</span>
        <div class="cc-turn-row">
          ${cur ? `<img class="cc-av" src="${curPiece}" alt="">` : ''}
          <span class="cc-turn${isMine ? ' mine' : ''}">${turnText}</span>
        </div>
      </div>
      <div class="dice-row">${dieHTML(a, rolling)}${dieHTML(b, rolling)}</div>
    </div>
    <div class="cc-block">
      ${focusCard(v, focusIdx)}
      <div class="cc-players">${strip}</div>
    </div>
    <div class="cc-foot${cardChanged ? ' flip' : ''}">
      ${v.lastCard ? `<span class="cc-card-ico">${v.lastCard.deck === 'chance' ? '机会' : '命运'}</span>${esc(v.lastCard.text)}` : '点击任意格子查看地产详情'}
    </div>
  </div>`;
}

// ---------------- 侧栏 ----------------

function renderPlayers(v) {
  const html = v.players.map((p) => {
    const mine = Object.keys(v.owners).filter((i) => v.owners[i] === p.id).map(Number);
    const chips = mine.map((i) => {
      const tile = BOARD[i];
      const g = tile.group ? GROUPS[tile.group] : null;
      const h = v.houses[i] || 0;
      const color = g ? g.color : '#8fa39a';
      return `<button class="pchip${v.mortgaged[i] ? ' mort' : ''}" data-tile="${i}" style="--c:${color}" title="${esc(tile.name)}">
        <i></i>${esc(tile.short || tile.name)}${h ? `<em>${h >= 5 ? '馆' : h}</em>` : ''}
      </button>`;
    }).join('');
    const tags = [];
    if (p.isHost) tags.push('<span class="tag">房主</span>');
    if (p.isBot) tags.push('<span class="tag">电脑</span>');
    if (!p.connected && !p.isBot) tags.push('<span class="tag off">离线</span>');
    if (p.inJail) tags.push('<span class="tag jail">狱</span>');
    if (p.bankrupt) tags.push('<span class="tag off">破产</span>');
    return `<div class="prow${p.id === v.turnId ? ' turn' : ''}${p.bankrupt ? ' dead' : ''}" data-pid="${p.id}">
      <div class="prow-head">
        <span class="pavatar" style="--pc:${p.color}"><img src="${icon(pieceOf(p.piece).file)}" alt=""></span>
        <div class="pinfo">
          <b>${esc(p.name)}${p.id === S.me ? ' <span class="me">(我)</span>' : ''}</b>
          <small>¥${fmt(p.cash)} · ${mine.length} 块地${p.jailCards ? ` · 出狱卡×${p.jailCards}` : ''}</small>
        </div>
        <div class="ptags">${tags.join('')}</div>
      </div>
      ${mine.length ? `<div class="pchips">${chips}</div>` : '<div class="pchips empty">暂无地产</div>'}
    </div>`;
  }).join('');
  $('#players').innerHTML = `<div class="act-head"><h3>玩家资产</h3><span>${v.players.length}/6</span></div><div class="player-list">${html}</div>`;
}

function pieceGrid(v, me) {
  return `<div class="piece-grid">${PIECES.map((pc) => {
    const owner = v.players.find((x) => x.piece === pc.id);
    const mine = me && me.piece === pc.id;
    const taken = owner && !mine;
    return `<button class="piece-opt${mine ? ' sel' : ''}${taken ? ' taken' : ''}" data-act="setPiece" data-piece="${pc.id}" ${taken ? 'disabled' : ''} title="${owner ? esc(owner.name) : pc.name}">
      <img src="${icon(pc.file)}" alt="">
      <span>${owner ? esc(owner.name) : pc.name}</span>
    </button>`;
  }).join('')}</div>`;
}

function actionLobby(v, isHost, me) {
  const bots = v.players.filter((p) => p.isBot);
  return `<div class="act-head"><h3>准备中</h3><span>${v.players.length}/6 人</span></div>
    <p class="act-msg">房间码 <b>${v.code}</b>，先选一个自己的棋子。人齐后房主开局。</p>
    ${pieceGrid(v, me)}
    ${isHost ? `<div class="btn-row">
      <button class="btn primary big" data-act="start" ${v.players.length < 2 ? 'disabled' : ''}>开始游戏</button>
      <button class="btn" data-act="addBot" ${v.players.length >= 6 ? 'disabled' : ''}>添加电脑</button>
    </div>` : '<p class="act-msg">等待房主开始…</p>'}
    ${bots.length ? `<div class="mini-list">${bots.map((b) => `<div class="mini-row"><img src="${icon(pieceOf(b.piece).file)}" alt=""><span>${esc(b.name)}</span><button class="btn tiny" data-act="removeBot" data-id="${b.id}">移除</button></div>`).join('')}</div>` : ''}`;
}

function actionEnded(v, isHost) {
  const winner = v.players.find((p) => p.id === v.winnerId);
  const rank = v.finalRank && v.finalRank.length
    ? v.finalRank
    : [...v.players].sort((a, b) => b.cash - a.cash).map((p) => ({ id: p.id, name: p.name, worth: p.cash }));
  const winnerWorth = rank.find((r) => r.id === v.winnerId);
  return `<div class="over-card">
    <img class="trophy" src="${icon('1f3c6.svg')}" alt="">
    <h2>${esc(winner ? winner.name : '—')} 获胜</h2>
    <p class="win">${winnerWorth ? `净资产 ¥${fmt(winnerWorth.worth)}` : ''}</p>
    <table>${rank.map((r) => `<tr><td>${esc(r.name)}</td><td>¥${fmt(r.worth)}</td></tr>`).join('')}</table>
    ${isHost
      ? '<button class="btn primary big wide" data-act="restart">再来一局</button>'
      : '<p class="act-msg">等待房主开下一局…</p>'}
  </div>`;
}

function actionRoll(v, me) {
  if (me.inJail) {
    return `<div class="act-head"><h3>你在监狱</h3></div>
      <p class="act-msg">掷出双数可以出狱，或者付 ¥50 保释金。</p>
      <button class="btn primary big wide" data-act="roll">掷骰子试试双数</button>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn" data-act="bail" ${me.cash < 50 ? 'disabled' : ''}>付 ¥50 保释</button>
        ${me.jailCards ? `<button class="btn" data-act="jailcard">用出狱卡（${me.jailCards}）</button>` : ''}
      </div>`;
  }
  return `<div class="act-head"><h3>轮到你</h3><span>${v.again ? '双数奖励回合' : ''}</span></div>
    <p class="act-msg">掷出双数可以再掷一次；连续三次双数直接进监狱。</p>
    <button class="btn primary big wide" data-act="roll">掷骰子</button>`;
}

function actionBuy(v, me) {
  const t = BOARD[v.pendingBuy];
  const g = t.group ? GROUPS[t.group] : null;
  return `<div class="act-head"><h3>购买地产</h3></div>
    <div class="buy-card">
      <div class="head" style="background:${g ? g.color : '#8fa39a'}">
        <span>${esc(t.name)}</span><span>¥${t.price}</span>
      </div>
      <div class="body">
        ${t.type === 'prop' ? `基础租金 ¥${t.rent[0]}，盖满后 ¥${t.rent[5]}` : t.type === 'rail' ? '租金按车站数量：¥25 / 50 / 100 / 200' : '租金按骰子点数 ×4（双持 ×10）'}
        <br>别人踩到就要向你付租金。
      </div>
    </div>
    <div class="btn-row">
      <button class="btn primary big" data-act="buy" ${me.cash < t.price ? 'disabled' : ''}>买下（¥${t.price}）</button>
      <button class="btn big" data-act="pass">放弃</button>
    </div>`;
}

function actionProps(v, me, myTurn) {
  const mine = Object.keys(v.owners).filter((i) => v.owners[i] === me.id).map(Number).sort((a, b) => a - b);
  if (!mine.length) {
    return `<div class="props"><h4><span>我的地产</span><span>0 块</span></h4><div class="empty">还没有地产，踩到空地就可以买。</div></div>`;
  }
  const rows = mine.map((i) => {
    const t = BOARD[i];
    const g = t.type === 'prop' ? GROUPS[t.group] : null;
    const h = v.houses[i] || 0;
    const groupTiles = g ? g.tiles : [i];
    const ownsAll = g ? g.tiles.every((x) => v.owners[x] === me.id) : true;
    const anyMort = groupTiles.some((x) => v.mortgaged[x]);
    const minH = g ? Math.min(...g.tiles.map((x) => v.houses[x] || 0)) : h;
    const maxH = g ? Math.max(...g.tiles.map((x) => v.houses[x] || 0)) : h;
    const cost = g ? g.houseCost : 0;
    const canBuild = myTurn && g && ownsAll && !anyMort && h < 5 && h === minH && me.cash >= cost;
    const canSell = myTurn && h > 0 && h === maxH;
    const canMort = myTurn && !v.mortgaged[i] && !groupTiles.some((x) => (v.houses[x] || 0) > 0);
    const canUnmort = myTurn && v.mortgaged[i] && me.cash >= Math.ceil(t.price * 0.55);
    const label = h >= 5 ? '旅馆' : h > 0 ? `${h} 房` : '';
    return `<div class="prop">
      <span class="swatch" style="background:${g ? g.color : '#7f8f85'}"></span>
      <span class="pname">${esc(t.short || t.name)}${v.mortgaged[i] ? ' <em class="mort">抵</em>' : ''}</span>
      <span class="ph">${label}</span>
      <span class="acts">
        ${g ? `<button data-act="build" data-i="${i}" ${canBuild ? '' : 'disabled'} title="建造 ¥${cost}">建</button>
        <button data-act="sellHouse" data-i="${i}" ${canSell ? '' : 'disabled'} title="卖房 +¥${Math.floor(cost / 2)}">卖</button>` : ''}
        <button data-act="mortgage" data-i="${i}" ${canMort ? '' : 'disabled'} title="抵押 +¥${Math.floor(t.price / 2)}">抵</button>
        <button data-act="unmortgage" data-i="${i}" ${canUnmort ? '' : 'disabled'} title="赎回 −¥${Math.ceil(t.price * 0.55)}">赎</button>
      </span>
    </div>`;
  }).join('');
  return `<div class="props"><h4><span>我的地产</span><span>${mine.length} 块</span></h4>${rows}</div>`;
}

// ---------------- 玩家交易 ----------------

function sideText(side) {
  const parts = [];
  if (side.cash > 0) parts.push(`¥${fmt(side.cash)}`);
  for (const i of side.tiles) parts.push(BOARD[i] ? (BOARD[i].short || BOARD[i].name) : '?');
  return parts.length ? parts.join(' + ') : '什么也不给';
}

function tradeBarHTML(v, me) {
  const t = v.trade;
  if (t && t.toId === me.id) {
    const from = v.players.find((p) => p.id === t.fromId);
    if (!from) return '';
    return `<div class="trade-ask">
      <div class="ta-head"><img src="${icon(pieceOf(from.piece).file)}" alt="">${esc(from.name)} 想和你交易</div>
      <div class="ta-body">
        <div><span>他给你</span><b>${esc(sideText(t.give))}</b></div>
        <div><span>他要走</span><b>${esc(sideText(t.get))}</b></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="tradeAccept" data-id="${t.id}">接受</button>
        <button class="btn" data-act="tradeReject" data-id="${t.id}">拒绝</button>
      </div>
    </div>`;
  }
  if (t && t.fromId === me.id) {
    const to = v.players.find((p) => p.id === t.toId);
    return `<div class="trade-wait">
      <span>已向 ${esc(to ? to.name : '对方')} 发起交易，等待回应…</span>
      <button class="btn tiny" data-act="tradeCancel" data-id="${t.id}">取消</button>
    </div>`;
  }
  return '<button class="btn wide trade-open" data-ui="trade">🤝 发起交易</button>';
}

function tileBtn(v, i, side, selected) {
  const t = BOARD[i];
  const g = t.group ? GROUPS[t.group] : null;
  const h = v.houses[i] || 0;
  return `<button class="ttile${selected ? ' sel' : ''}" data-side="${side}" data-tile="${i}" ${h > 0 ? 'disabled title="有房子的地产不能交易，先卖掉房子"' : ''}>
    <i style="background:${g ? g.color : '#8fa39a'}"></i>
    <span>${esc(t.short || t.name)}</span>
    ${h ? `<em>${h >= 5 ? '馆' : h}</em>` : ''}
  </button>`;
}

function openTradeModal() {
  const v = S.view;
  if (!v) return;
  const me = v.players.find((p) => p.id === S.me);
  if (!me) return;
  const others = v.players.filter((p) => p.id !== me.id && !p.bankrupt);
  if (!others.length) { toast('没有可以交易的对手'); return; }
  S.trade = { toId: others[0].id, give: new Set(), get: new Set(), giveCash: 0, getCash: 0 };
  $('#modalCard').classList.add('wide');
  renderTradeModal();
  $('#modal').classList.remove('hidden');
}

function renderTradeModal() {
  const v = S.view;
  if (!v || !S.trade) return;
  const me = v.players.find((p) => p.id === S.me);
  const others = v.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const to = v.players.find((p) => p.id === S.trade.toId) || others[0];
  if (!to) return;
  S.trade.toId = to.id;
  const mine = Object.keys(v.owners).filter((i) => v.owners[i] === me.id).map(Number).sort((a, b) => a - b);
  const theirs = Object.keys(v.owners).filter((i) => v.owners[i] === to.id).map(Number).sort((a, b) => a - b);
  const tabs = others.map((p) => `<button class="trade-tab${p.id === to.id ? ' on' : ''}" data-to="${p.id}">
      <img src="${icon(pieceOf(p.piece).file)}" alt="">${esc(p.name)}
    </button>`).join('');

  $('#modalCard').innerHTML = `<h2 class="trade-title">玩家间交易</h2>
    <p class="trade-hint">选地产和现金，对方同意后立刻生效。有房子的地产要先卖掉才能交易。</p>
    <div class="trade-tabs">${tabs}</div>
    <div class="trade-cols">
      <div class="trade-col">
        <h4>你给出 <b>${esc(me.name)}</b><span>现金 ¥${fmt(me.cash)}</span></h4>
        <label class="trade-cash">现金 <input type="number" min="0" max="${me.cash}" step="10" value="${S.trade.giveCash}" data-cash="give"></label>
        <div class="trade-tiles">${mine.map((i) => tileBtn(v, i, 'give', S.trade.give.has(i))).join('') || '<div class="empty">你没有地产</div>'}</div>
      </div>
      <div class="trade-arrow">⇄</div>
      <div class="trade-col">
        <h4>你获得 <b>${esc(to.name)}</b><span>现金 ¥${fmt(to.cash)}</span></h4>
        <label class="trade-cash">现金 <input type="number" min="0" max="${to.cash}" step="10" value="${S.trade.getCash}" data-cash="get"></label>
        <div class="trade-tiles">${theirs.map((i) => tileBtn(v, i, 'get', S.trade.get.has(i))).join('') || '<div class="empty">对方没有地产</div>'}</div>
      </div>
    </div>
    <div class="trade-summary"></div>
    <div class="btn-row trade-actions">
      <button class="btn primary big" id="tradeSubmit">发起交易</button>
      <button class="btn big" id="tradeClose">取消</button>
    </div>`;
  updateTradeSummary();
}

function updateTradeSummary() {
  const el = document.querySelector('#modalCard .trade-summary');
  if (!el || !S.trade) return;
  const list = (set, cash) => {
    const parts = [];
    if (cash > 0) parts.push(`¥${fmt(cash)}`);
    for (const i of set) parts.push(BOARD[i].short || BOARD[i].name);
    return parts.length ? parts.join(' + ') : '什么也不给';
  };
  el.innerHTML = `你付出 <b>${esc(list(S.trade.give, S.trade.giveCash))}</b>，得到 <b>${esc(list(S.trade.get, S.trade.getCash))}</b>`;
  const btn = $('#tradeSubmit');
  if (btn) btn.disabled = !S.trade.give.size && !S.trade.get.size && !S.trade.giveCash && !S.trade.getCash;
}

function submitTrade() {
  const s = S.trade;
  if (!s || !S.net) return;
  if (!s.give.size && !s.get.size && !s.giveCash && !s.getCash) { toast('先选地产或填现金'); return; }
  S.net.send({
    type: 'tradeOffer',
    toId: s.toId,
    giveTiles: [...s.give],
    getTiles: [...s.get],
    giveCash: s.giveCash,
    getCash: s.getCash,
  });
  hideModal();
  toast('交易已发起，等待对方回应');
}

function renderAction(v) {
  const me = v.players.find((p) => p.id === S.me);
  const el = $('#action');
  if (!me) { el.innerHTML = ''; return; }

  if (v.phase === 'lobby') { el.innerHTML = actionLobby(v, v.hostId === S.me, me); return; }
  if (v.phase === 'ended') { el.innerHTML = actionEnded(v, v.hostId === S.me); return; }

  const myTurn = v.turnId === S.me;
  let html = '';
  if (myTurn) {
    if (v.phase === 'roll') html = actionRoll(v, me);
    else if (v.phase === 'buy') html = actionBuy(v, me);
    else html = `<div class="act-head"><h3>轮到你</h3></div>
      <p class="act-msg">可以继续建造、抵押，或者结束回合。</p>
      <button class="btn primary big wide" data-act="end">结束回合</button>`;
  } else {
    const t = v.players.find((p) => p.id === v.turnId);
    html = `<div class="act-head"><h3>等待中</h3></div>
      <p class="act-msg">等待 <b>${esc(t ? t.name : '…')}</b> 行动${t && t.isBot ? '（电脑思考中）' : ''}…</p>`;
  }
  html += tradeBarHTML(v, me);
  html += actionProps(v, me, myTurn);
  el.innerHTML = html;
}

function renderLog(v) {
  if (S.tab !== 'log') return;
  const el = $('#logBody');
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = v.log.map((l) => `<div class="log-line ${l.kind || 'info'}">${esc(l.text)}</div>`).join('')
    || '<div class="empty">还没有记录</div>';
  if (nearBottom) el.scrollTop = el.scrollHeight;
}

function renderChat(v) {
  if (S.tab !== 'chat') return;
  const el = $('#logBody');
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = v.chat.map((c) => `<div class="chat-line"><b>${esc(c.name)}</b>${esc(c.text)}</div>`).join('')
    || '<div class="empty">还没有人说话</div>';
  if (nearBottom) el.scrollTop = el.scrollHeight;
}

// ---------------- 渲染入口 ----------------

function render() {
  const v = S.view;
  if (!v) return;
  $('#roomCode').textContent = v.code;
  renderBoard(v);
  renderCenter(v);
  syncTokens(v);
  syncMoney(v);
  renderPlayers(v);
  renderAction(v);
  renderLog(v);
  renderChat(v);
  syncSubtitles(v);
}

function renderBoard(v) {
  const grid = $('#gridLayer');
  const frag = document.createDocumentFragment();
  for (const t of BOARD) frag.appendChild(tileEl(t, v));
  grid.replaceChildren(frag);
}

function setTileFont() {
  const board = $('#board');
  if (!board) return;
  const w = board.clientWidth;
  if (!w) return;
  board.style.setProperty('--tile-fs', `${Math.max(7, Math.round(w / 50))}px`);
}

// ---------------- 交互 ----------------

$('#board').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const i = Number(tile.dataset.i);
  S.selectedTile = S.selectedTile === i ? null : i;
  document.querySelectorAll('.tile.sel').forEach((x) => x.classList.remove('sel'));
  if (S.selectedTile != null) tile.classList.add('sel');
  if (S.view) renderCenter(S.view);
});

$('#players').addEventListener('click', (e) => {
  const chip = e.target.closest('.pchip');
  if (!chip || !S.view) return;
  const i = Number(chip.dataset.tile);
  S.selectedTile = i;
  document.querySelectorAll('.tile.sel').forEach((x) => x.classList.remove('sel'));
  const tile = document.querySelector(`.tile[data-i="${i}"]`);
  if (tile) { tile.classList.add('sel'); tile.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  renderCenter(S.view);
});

$('#action').addEventListener('click', (e) => {
  const uiBtn = e.target.closest('button[data-ui]');
  if (uiBtn) {
    if (uiBtn.dataset.ui === 'trade') openTradeModal();
    return;
  }
  const btn = e.target.closest('button[data-act]');
  if (!btn || btn.disabled || !S.net) return;
  const now = Date.now();
  const type = btn.dataset.act;
  // 只拦同一种操作的连点，避免「开局后马上掷骰」被误吞
  if (S.lastClickType === type && now - S.lastClick < 320) return;
  S.lastClick = now;
  S.lastClickType = type;
  const i = btn.dataset.i !== undefined ? Number(btn.dataset.i) : undefined;
  const id = btn.dataset.id;
  const piece = btn.dataset.piece;
  S.net.send({ type, i, id, piece });
});

$('#logBody').addEventListener('scroll', (e) => {
  const el = e.target;
  S.stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    S.tab = tab.dataset.tab;
    $('#chatForm').classList.toggle('hidden', S.tab !== 'chat');
    if (S.view) { renderLog(S.view); renderChat(S.view); }
    if (S.tab === 'chat') $('#chatInput').focus();
  });
});

$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text || !S.net) return;
  S.net.send({ type: 'chat', text });
  input.value = '';
});

$('#btnCopy').addEventListener('click', async () => {
  if (!S.view || S.solo) { toast('单机模式没有邀请链接'); return; }
  const url = new URL(location.href);
  url.searchParams.set('room', S.view.code);
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    toast('邀请链接已复制，发给朋友就行');
  } catch {
    prompt('复制这个链接发给朋友：', link);
  }
});

$('#btnZen').addEventListener('click', () => {
  document.body.classList.toggle('zen');
  const on = document.body.classList.contains('zen');
  $('#btnZen').textContent = on ? '退出全屏' : '全屏棋盘';
  setTimeout(() => { setTileFont(); relayoutTokens(); if (S.view) renderCenter(S.view); }, 260);
});

$('#zenExit').addEventListener('click', () => $('#btnZen').click());

$('#btnRules').addEventListener('click', () => {
  showModal(`<h2 style="margin-top:0">玩法速览</h2>
    <div style="text-align:left;font-size:13px;line-height:1.85;color:var(--muted)">
      <p><b style="color:var(--text)">目标</b>：让其他玩家破产，或撑到 50 回合结束时净资产最高。</p>
      <p><b style="color:var(--text)">移动</b>：掷两枚骰子，经过起点领 ¥200；掷出双数可再掷一次，连续三次双数直接入狱。</p>
      <p><b style="color:var(--text)">买地</b>：停在无主地产可以按标价买下；别人踩到要付租金。集齐同色地块后基础租金翻倍。</p>
      <p><b style="color:var(--text)">盖房</b>：集齐同色且没有抵押时才能盖，必须均衡建造，4 栋房子后第 5 栋是旅馆。</p>
      <p><b style="color:var(--text)">缺钱</b>：可以半价卖房、抵押地产换一半地价；还不起债会自动变卖，仍不够就破产。</p>
      <p><b style="color:var(--text)">监狱</b>：掷双数、付 ¥50 或用出狱卡；三次掷不出双数会被强制收 ¥50 并移动。</p>
      <p><b style="color:var(--text)">看别人的地</b>：右侧玩家卡片下方就是每个人当前持有的地产，点一下会在棋盘中央显示详情。</p>
    </div>
    <button class="btn primary big wide" id="modalClose">知道了</button>`);
});

$('#btnLeave').addEventListener('click', () => {
  if (S.view && S.view.phase !== 'ended' && S.view.phase !== 'lobby') {
    if (!confirm('确定退出当前对局？')) return;
  }
  leave();
});

function showModal(html) {
  $('#modalCard').innerHTML = html;
  $('#modal').classList.remove('hidden');
  const close = $('#modalClose');
  if (close) close.addEventListener('click', hideModal);
}

function hideModal() {
  $('#modal').classList.add('hidden');
  $('#modalCard').classList.remove('wide');
  S.trade = null;
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') hideModal(); });

$('#modalCard').addEventListener('click', (e) => {
  const tab = e.target.closest('.trade-tab');
  if (tab && S.trade) {
    S.trade.toId = tab.dataset.to;
    S.trade.get = new Set();
    S.trade.getCash = 0;
    renderTradeModal();
    return;
  }
  const tile = e.target.closest('.ttile');
  if (tile && !tile.disabled && S.trade) {
    const side = tile.dataset.side;
    const i = Number(tile.dataset.tile);
    const set = side === 'give' ? S.trade.give : S.trade.get;
    if (set.has(i)) { set.delete(i); tile.classList.remove('sel'); }
    else { set.add(i); tile.classList.add('sel'); }
    updateTradeSummary();
    return;
  }
  if (e.target.id === 'tradeSubmit') submitTrade();
  else if (e.target.id === 'tradeClose') hideModal();
});

$('#modalCard').addEventListener('input', (e) => {
  const inp = e.target.closest('input[data-cash]');
  if (!inp || !S.trade) return;
  const val = Math.max(0, Math.floor(Number(inp.value) || 0));
  if (inp.dataset.cash === 'give') S.trade.giveCash = val;
  else S.trade.getCash = val;
  updateTradeSummary();
});

// ---------------- 启动 ----------------

$('#startForm').addEventListener('submit', (e) => { e.preventDefault(); createRoom(); });
$('#btnJoin').addEventListener('click', () => joinRoom($('#codeInput').value));
$('#btnSolo').addEventListener('click', () => startSolo());
$('#codeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); joinRoom($('#codeInput').value); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (S.ready) $('#btnZen').click();
  }
});

async function boot() {
  const savedName = localStorage.getItem('dmj.name');
  if (savedName) $('#nameInput').value = savedName;
  $('#nameInput').focus();

  const room = getQueryRoom();
  if (room) $('#codeInput').value = room;

  S.hasServer = await detectServer();
  $('#startHint').textContent = S.hasServer
    ? '已检测到本地服务器：联机走服务器转发，最稳定（局域网 / 公网隧道都适用）。'
    : '当前是纯静态托管：联机使用 WebRTC，房主浏览器即主机，需要保持页面打开。';

  if (room) {
    const sess = loadSession(room);
    if (sess && !sess.host) {
      try { await joinRoom(room, true); } catch { /* 回落到手动加入 */ }
    }
  } else if (new URLSearchParams(location.search).get('solo') === '1') {
    await startSolo();
  }

  // 调试钩子：自动化测试用，普通访问不会暴露
  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.__dmj = S;
  }
}

const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(() => { setTileFont(); relayoutTokens(); })
  : null;
if (ro) ro.observe($('#board'));
window.addEventListener('resize', () => { setTileFont(); relayoutTokens(); });

boot();


