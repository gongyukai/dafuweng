import { BOARD, GROUPS, sideOf, gridPos } from '../game/board.js';
import {
  HttpNet, HostNet, GuestNet, LocalNet, loadSession, saveSession, detectServer,
} from './net.js';

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  view: null,
  me: null,
  code: null,
  net: null,
  tab: 'log',
  lastDice: '',
  stickBottom: true,
  lastClick: 0,
  hasServer: false,
  solo: false,
};

const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
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
}

function showStart() {
  $('#app').classList.add('hidden');
  $('#start').classList.remove('hidden');
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

// ---------------- 联机入口 ----------------

const handlers = {
  onState(v) {
    S.view = v;
    if (v && v.you) S.me = v.you;
    render();
  },
  onStatus(text, kind) { setStatus(text, kind); },
  onError(msg) { toast(msg); },
  onSelf({ code, playerId, token }) {
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
  const url = new URL(location.href);
  url.searchParams.delete('room');
  location.href = url.toString();
}

// ---------------- 渲染 ----------------

function render() {
  const v = S.view;
  if (!v) return;
  $('#roomCode').textContent = v.code;
  renderBoard(v);
  renderPlayers(v);
  renderAction(v);
  renderLog(v);
  renderChat(v);
}

function dieHTML(face, rolling) {
  const on = new Set(PIPS[face] || PIPS[1]);
  let cells = '';
  for (let i = 0; i < 9; i++) cells += `<span class="pip${on.has(i) ? ' on' : ''}"></span>`;
  const dim = face ? '' : ' dim';
  return `<div class="die${rolling ? ' rolling' : ''}${dim}">${cells}</div>`;
}

function tileEl(t, v) {
  const side = sideOf(t.i);
  const { r, c } = gridPos(t.i);
  const el = document.createElement('div');
  el.className = `tile side-${side}${side === 'corner' ? ' corner' : ''}`;
  el.style.gridArea = `${r} / ${c} / ${r + 1} / ${c + 1}`;
  el.dataset.i = t.i;
  el.title = t.name;

  const parts = [];
  if (t.type === 'prop') {
    parts.push(`<div class="band" style="background:${GROUPS[t.group].color}"></div>`);
  }

  const ownerId = v.owners[t.i];
  if (ownerId) {
    const owner = v.players.find((p) => p.id === ownerId);
    if (owner) {
      el.style.setProperty('--owner', owner.color);
      el.classList.add('owned');
      parts.push('<span class="owner-dot"></span>');
    }
  }
  if (v.mortgaged[t.i]) el.classList.add('mortgaged');

  if (t.type === 'prop') {
    parts.push(`<div class="tname">${esc(t.name)}</div><div class="tprice">¥${t.price}</div>`);
  } else if (t.type === 'rail') {
    parts.push(`<div class="icon">🚉</div><div class="tname">${esc(t.short)}</div><div class="tprice">¥${t.price}</div>`);
  } else if (t.type === 'util') {
    parts.push(`<div class="icon">${t.i === 12 ? '💡' : '🚰'}</div><div class="tname">${esc(t.short)}</div><div class="tprice">¥${t.price}</div>`);
  } else if (t.type === 'chance') {
    parts.push('<div class="icon">❓</div><div class="tname">机会</div>');
  } else if (t.type === 'chest') {
    parts.push('<div class="icon">🎁</div><div class="tname">命运</div>');
  } else if (t.type === 'tax') {
    parts.push(`<div class="icon">💸</div><div class="tname">${esc(t.name)}</div><div class="tprice">¥${t.amount}</div>`);
  } else if (t.type === 'go') {
    parts.push('<div class="icon">🏁</div><div class="tname">起点</div><div class="tprice">领 ¥200</div>');
  } else if (t.type === 'jail') {
    parts.push('<div class="icon">🚔</div><div class="tname">监狱 / 探监</div>');
  } else if (t.type === 'parking') {
    parts.push('<div class="icon">🅿️</div><div class="tname">免费停车</div>');
  } else if (t.type === 'gotojail') {
    parts.push('<div class="icon">🚨</div><div class="tname">入狱</div>');
  }

  const h = v.houses[t.i] || 0;
  if (h > 0) {
    const marks = h >= 5
      ? '<span class="hotel"></span>'
      : Array.from({ length: h }, () => '<span class="h"></span>').join('');
    parts.push(`<div class="houses">${marks}</div>`);
  }

  const here = v.players.filter((p) => p.pos === t.i && !p.bankrupt);
  if (here.length) {
    parts.push(`<div class="tokens">${here.map((p) => (
      `<span class="tk${p.id === v.turnId ? ' active' : ''}" style="background:${p.color}" title="${esc(p.name)}"></span>`
    )).join('')}</div>`);
  }

  el.innerHTML = parts.join('');
  return el;
}

function centerEl(v) {
  const turnP = v.players.find((p) => p.id === v.turnId);
  const mine = !!v.turnId && v.turnId === S.me;
  const [a, b] = v.dice;
  const key = `${a}-${b}-${v.turnId || ''}-${v.round}`;
  const rolling = key !== S.lastDice;
  S.lastDice = key;

  let line = '';
  if (v.phase === 'lobby') line = '等待房主开始游戏';
  else if (v.phase === 'ended') line = '本局结束';
  else if (mine) {
    line = v.phase === 'buy' ? '要买下这块地吗？'
      : v.phase === 'end' ? '可以结束回合了'
        : '轮到你了，掷骰子';
  } else line = `等待 ${turnP ? turnP.name : '…'} 行动`;

  const center = document.createElement('div');
  center.className = 'center';
  center.innerHTML = `
    <div class="center-inner">
      <div class="center-brand">大富翁<small>中国城市版</small></div>
      <div class="turn-line${mine ? ' mine' : ''}">${esc(line)}</div>
      <div class="dice-row">${dieHTML(a, rolling && a > 0)}${dieHTML(b, rolling && b > 0)}</div>
      ${v.lastCard ? `<div class="card-line">${v.lastCard.deck === 'chance' ? '机会' : '命运'}：${esc(v.lastCard.text)}</div>` : ''}
      <div class="round-line">第 ${v.round || 1} / ${v.roundLimit || 50} 回合</div>
    </div>`;
  return center;
}

function renderBoard(v) {
  const board = $('#board');
  const frag = document.createDocumentFragment();
  for (const t of BOARD) frag.appendChild(tileEl(t, v));
  frag.appendChild(centerEl(v));
  board.replaceChildren(frag);
}

function renderPlayers(v) {
  const html = v.players.map((p) => {
    const count = Object.values(v.owners).filter((o) => o === p.id).length;
    const tags = [];
    if (p.isHost) tags.push('<span class="tag">房主</span>');
    if (p.isBot) tags.push('<span class="tag">电脑</span>');
    if (!p.connected && !p.isBot) tags.push('<span class="tag off">离线</span>');
    if (p.bankrupt) tags.push('<span class="tag off">破产</span>');
    return `<div class="prow${p.id === v.turnId ? ' turn' : ''}${p.bankrupt ? ' dead' : ''}">
      <span class="dot" style="background:${p.color}"></span>
      <div class="pinfo">
        <b>${esc(p.name)}${p.id === S.me ? ' <span style="color:var(--gold);font-weight:400">(我)</span>' : ''}</b>
        <small>¥${fmt(p.cash)} · ${count} 块地${p.inJail ? ' · 🚔 监狱' : ''}${p.jailCards ? ` · 出狱卡×${p.jailCards}` : ''}</small>
      </div>
      ${tags.join('')}
    </div>`;
  }).join('');
  $('#players').innerHTML = `<div class="act-head"><h3>玩家</h3><span>${v.players.length}/6</span></div>${html}`;
}

function rentHint(t) {
  if (t.type === 'prop') return `基础租金 ¥${t.rent[0]}，盖满房屋后最高 ¥${t.rent[5]}`;
  if (t.type === 'rail') return '租金按拥有车站数量：¥25 / 50 / 100 / 200';
  if (t.type === 'util') return '租金按骰子点数：拥有 1 家 ×4，2 家 ×10';
  return '';
}

function actionLobby(v, isHost) {
  const bots = v.players.filter((p) => p.isBot);
  const rows = bots.map((b) => `<div class="prop">
      <span class="swatch" style="background:${b.color}"></span>
      <span class="pname">${esc(b.name)}</span>
      <span class="acts"><button data-act="removeBot" data-id="${b.id}">移除</button></span>
    </div>`).join('');
  return `<div class="act-head"><h3>房间大厅</h3><span>${v.players.length}/6 人</span></div>
    <p class="act-msg">房间码 <b>${v.code}</b>。把邀请链接发给朋友，至少 2 人即可开局；凑不齐也可以加电脑玩家。</p>
    ${isHost ? `<div class="btn-row">
      <button class="btn primary" data-act="start" ${v.players.length < 2 ? 'disabled' : ''}>开始游戏</button>
      <button class="btn" data-act="addBot" ${v.players.length >= 6 ? 'disabled' : ''}>添加电脑</button>
    </div>` : '<p class="act-msg">等待房主开始…</p>'}
    ${bots.length ? `<div class="props"><h4>电脑玩家</h4>${rows}</div>` : ''}`;
}

function actionEnded(v, isHost) {
  const winner = v.players.find((p) => p.id === v.winnerId);
  const rank = v.finalRank && v.finalRank.length
    ? v.finalRank
    : [...v.players].sort((a, b) => b.cash - a.cash).map((p) => ({ id: p.id, name: p.name, worth: p.cash }));
  const winnerWorth = rank.find((r) => r.id === v.winnerId);
  return `<div class="over-card">
    <div class="trophy">🏆</div>
    <h2>${esc(winner ? winner.name : '—')} 获胜</h2>
    <p class="win">${winnerWorth ? `净资产 ¥${fmt(winnerWorth.worth)}` : ''}</p>
    <table>${rank.map((r) => `<tr><td>${esc(r.name)}</td><td>¥${fmt(r.worth)}</td></tr>`).join('')}</table>
    ${isHost
      ? '<button class="btn primary wide" data-act="restart">再来一局</button>'
      : '<p class="act-msg">等待房主开下一局…</p>'}
  </div>`;
}

function actionRoll(v, me) {
  if (me.inJail) {
    return `<div class="act-head"><h3>你在监狱</h3></div>
      <p class="act-msg">掷出双数可以出狱，或者付 ¥50 保释金；也可以使用出狱卡。</p>
      <div class="btn-row">
        <button class="btn primary" data-act="roll">掷骰子</button>
        <button class="btn" data-act="bail" ${me.cash < 50 ? 'disabled' : ''}>付 ¥50 保释</button>
        ${me.jailCards ? `<button class="btn" data-act="jailcard">用出狱卡（${me.jailCards}）</button>` : ''}
      </div>`;
  }
  return `<div class="act-head"><h3>轮到你</h3></div>
    <p class="act-msg">掷出双数可以再掷一次；连续三次双数会直接进监狱。</p>
    <div class="btn-row"><button class="btn primary" data-act="roll">掷骰子</button></div>`;
}

function actionBuy(v) {
  const t = BOARD[v.pendingBuy];
  const g = t.group ? GROUPS[t.group] : null;
  return `<div class="act-head"><h3>购买地产</h3></div>
    <div class="buy-card">
      <div class="head" style="background:${g ? g.color : '#9fae9f'}">
        <span>${esc(t.name)}</span><span>¥${t.price}</span>
      </div>
      <div class="body">${rentHint(t)}<br>买下后，其他玩家踩到就要向你付租金。</div>
    </div>
    <div class="btn-row">
      <button class="btn primary" data-act="buy" ${v.players.find((p) => p.id === S.me).cash < t.price ? 'disabled' : ''}>买下（¥${t.price}）</button>
      <button class="btn" data-act="pass">放弃</button>
    </div>`;
}

function actionProps(v, me, myTurn) {
  const mine = Object.keys(v.owners).filter((i) => v.owners[i] === me.id).map(Number).sort((a, b) => a - b);
  if (!mine.length) {
    return `<div class="props"><h4>我的地产</h4><div class="empty">还没有地产，踩到空地就可以买。</div></div>`;
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
    const label = h >= 5 ? '旅馆' : h > 0 ? `房×${h}` : '';
    return `<div class="prop">
      <span class="swatch" style="background:${g ? g.color : '#7f8f85'}"></span>
      <span class="pname">${esc(t.short || t.name)}${v.mortgaged[i] ? ' <span style="color:#e2574c">(抵)</span>' : ''}</span>
      <span class="ph">${label}</span>
      <span class="acts">
        ${g ? `<button data-act="build" data-i="${i}" ${canBuild ? '' : 'disabled'} title="建造 ¥${cost}">建</button>
        <button data-act="sellHouse" data-i="${i}" ${canSell ? '' : 'disabled'} title="卖房收回 ¥${Math.floor(cost / 2)}">卖</button>` : ''}
        <button data-act="mortgage" data-i="${i}" ${canMort ? '' : 'disabled'} title="抵押获得 ¥${Math.floor(t.price / 2)}">抵</button>
        <button data-act="unmortgage" data-i="${i}" ${canUnmort ? '' : 'disabled'} title="赎回 ¥${Math.ceil(t.price * 0.55)}">赎</button>
      </span>
    </div>`;
  }).join('');
  return `<div class="props"><h4><span>我的地产</span><span>${mine.length} 块</span></h4>${rows}</div>`;
}

function renderAction(v) {
  const me = v.players.find((p) => p.id === S.me);
  const el = $('#action');
  if (!me) { el.innerHTML = ''; return; }

  if (v.phase === 'lobby') { el.innerHTML = actionLobby(v, v.hostId === S.me); return; }
  if (v.phase === 'ended') { el.innerHTML = actionEnded(v, v.hostId === S.me); return; }

  const myTurn = v.turnId === S.me;
  let html = '';
  if (myTurn) {
    if (v.phase === 'roll') html = actionRoll(v, me);
    else if (v.phase === 'buy') html = actionBuy(v);
    else html = `<div class="act-head"><h3>轮到你</h3></div>
      <p class="act-msg">可以继续建造、抵押地产，或者结束回合。</p>
      <button class="btn primary wide" data-act="end">结束回合</button>`;
  } else {
    const t = v.players.find((p) => p.id === v.turnId);
    html = `<div class="act-head"><h3>等待中</h3></div>
      <p class="act-msg">等待 <b>${esc(t ? t.name : '…')}</b> 行动${t && t.isBot ? '（电脑玩家思考中）' : ''}…</p>`;
  }
  html += actionProps(v, me, myTurn);
  el.innerHTML = html;
}

function renderLog(v) {
  if (S.tab !== 'log') return;
  const el = $('#logBody');
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = v.log.map((l) => `<div class="log-line ${l.kind || 'info'}">${esc(l.text)}</div>`).join('')
    || '<div class="empty">还没有记录</div>';
  if (nearBottom || S.stickBottom) el.scrollTop = el.scrollHeight;
}

function renderChat(v) {
  if (S.tab !== 'chat') return;
  const el = $('#logBody');
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = v.chat.map((c) => `<div class="chat-line"><b>${esc(c.name)}</b>${esc(c.text)}</div>`).join('')
    || '<div class="empty">还没有人说话</div>';
  if (nearBottom || S.stickBottom) el.scrollTop = el.scrollHeight;
}

// ---------------- 交互 ----------------

$('#action').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn || btn.disabled || !S.net) return;
  const now = Date.now();
  if (now - S.lastClick < 350) return;
  S.lastClick = now;
  const type = btn.dataset.act;
  const i = btn.dataset.i !== undefined ? Number(btn.dataset.i) : undefined;
  const id = btn.dataset.id;
  S.net.send({ type, i, id });
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
    S.stickBottom = true;
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
    toast('邀请链接已复制，发给朋友即可');
  } catch {
    prompt('复制这个链接发给朋友：', link);
  }
});

$('#btnRules').addEventListener('click', () => {
  showModal(`<h2 style="margin-top:0">玩法速览</h2>
    <div style="text-align:left;font-size:13px;line-height:1.85;color:var(--muted)">
      <p><b style="color:var(--text)">目标</b>：让其他玩家破产，或撑到 50 回合结束时净资产最高。</p>
      <p><b style="color:var(--text)">移动</b>：掷两枚骰子，经过起点领 ¥200；掷出双数可再掷一次，连续三次双数直接入狱。</p>
      <p><b style="color:var(--text)">买地</b>：停在无主地产可以按标价买下；别人踩到要付租金。集齐同色地块后基础租金翻倍。</p>
      <p><b style="color:var(--text)">盖房</b>：集齐同色且没有抵押时才能盖，必须均衡建造，4 栋房子后第 5 栋是旅馆。</p>
      <p><b style="color:var(--text)">缺钱</b>：可以半价卖房、抵押地产换一半地价；还不起债会自动变卖，仍不够就破产。</p>
      <p><b style="color:var(--text)">监狱</b>：掷双数、付 ¥50 或用出狱卡；三次掷不出双数会被强制收 ¥50 并移动。</p>
      <p><b style="color:var(--text)">联机</b>：同一 WiFi 用房间链接即可；公网可用 Cloudflare Tunnel；纯静态托管时由房主浏览器当主机。</p>
    </div>
    <button class="btn primary wide" id="modalClose">知道了</button>`);
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

function hideModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') hideModal(); });

// ---------------- 启动 ----------------

$('#startForm').addEventListener('submit', (e) => { e.preventDefault(); createRoom(); });
$('#btnJoin').addEventListener('click', () => joinRoom($('#codeInput').value));
$('#btnSolo').addEventListener('click', () => startSolo());
$('#codeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); joinRoom($('#codeInput').value); }
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
}

window.addEventListener('resize', () => {
  const board = $('#board');
  if (!board) return;
  const w = board.clientWidth;
  board.style.setProperty('--tile-fs', `${Math.max(6, Math.round(w / 62))}px`);
});

findResizeHook();
function findResizeHook() {
  const board = $('#board');
  if (!board || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => {
    const w = board.clientWidth;
    if (w) board.style.setProperty('--tile-fs', `${Math.max(6, Math.round(w / 62))}px`);
  });
  ro.observe(board);
}

boot();
