// 传输层：同一套 UI 支持三种联机方式
//   HttpNet  —— 连本地 Node 服务（SSE 推送，最稳）
//   HostNet  —— 浏览器当主机，WebRTC 直连（GitHub Pages 可用）
//   GuestNet —— 加入上面的房主
//   LocalNet —— 单机人机对战，不联网
import { createRoom, addPlayer, act, view, tickBots, tickStall } from '../game/engine.js';

const PEER_PREFIX = 'dmj-cn-';
const PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// ---------------- 会话存档 ----------------

// 会话存在 sessionStorage：同一个浏览器开多个标签页时，各自是独立玩家；
// 刷新页面仍能凭 token 找回原来的座位。
const sessKey = (code) => `dmj.sess.${code}`;

// 同一个标签页的稳定标识：重复点「加入」/刷新都认成同一个玩家
function getClientId() {
  try {
    let id = sessionStorage.getItem('dmj.cid');
    if (!id) {
      id = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('dmj.cid', id);
    }
    return id;
  } catch {
    return 'c' + Math.random().toString(36).slice(2);
  }
}

export function saveSession(code, data) {
  try {
    sessionStorage.setItem(sessKey(code), JSON.stringify(data));
    localStorage.setItem('dmj.lastCode', code);
  } catch { /* 隐私模式忽略 */ }
}

export function loadSession(code) {
  try { return JSON.parse(sessionStorage.getItem(sessKey(code)) || 'null'); } catch { return null; }
}

export function clearSession(code) {
  try { sessionStorage.removeItem(sessKey(code)); } catch { /* ignore */ }
}

export async function detectServer() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j.ok;
  } catch {
    return false;
  }
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch { /* ignore */ }
  if (!r.ok || data.ok === false) throw new Error(data.err || `请求失败（${r.status}）`);
  return data;
}

// ---------------- 本地服务器模式 ----------------

export class HttpNet {
  constructor(handlers) {
    this.h = handlers;
    this.code = null;
    this.token = null;
    this.playerId = null;
    this.es = null;
  }

  async create(name) {
    const r = await postJson('/api/create', { name, clientId: getClientId() });
    this.use(r);
  }

  async join(code, name) {
    const sess = loadSession(code);
    const r = await postJson('/api/join', { code, name, token: sess?.token, clientId: getClientId() });
    this.use(r);
  }

  use(r) {
    this.code = r.code;
    this.token = r.token;
    this.playerId = r.playerId;
    saveSession(r.code, { token: r.token, playerId: r.playerId });
    this.h.onSelf({ code: r.code, playerId: r.playerId, token: r.token });
    this.openStream();
  }

  openStream() {
    if (this.es) this.es.close();
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(this.token)}`);
    this.es = es;
    es.onopen = () => this.h.onStatus('已连接服务器', 'ok');
    es.onmessage = (e) => {
      try { this.h.onState(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    es.onerror = () => this.h.onStatus('连接中断，正在重连…', 'warn');
  }

  async send(action) {
    try {
      await postJson('/api/act', { token: this.token, action });
    } catch (e) {
      this.h.onError(e.message);
    }
  }

  close() {
    if (this.es) { this.es.close(); this.es = null; }
  }
}

// ---------------- 引擎主机（单机 / WebRTC 房主共用） ----------------

class EngineHost {
  constructor({ room, playerId, autoStart, onState, onError, onChange }) {
    this.room = room;
    this.playerId = playerId;
    this.onState = onState;
    this.onError = onError;
    this.onChange = onChange || null;
    this.botTimer = null;
    this.startBots();
    if (autoStart) this.publish();
  }

  startBots() {
    this.botTimer = setInterval(() => {
      let changed = false;
      try { changed = tickBots(this.room) || tickStall(this.room); } catch (e) { console.error(e); }
      if (changed) {
        this.publish();
        if (this.onChange) this.onChange();
      }
    }, 1500);
  }

  apply(action) {
    const r = act(this.room, this.playerId, action);
    if (!r.ok) this.onError(r.err);
    else {
      this.publish();
      if (this.onChange) this.onChange();
    }
    return r;
  }

  publish() {
    this.onState(view(this.room, this.playerId));
  }

  close() {
    if (this.botTimer) clearInterval(this.botTimer);
    this.botTimer = null;
  }
}

// ---------------- 单机人机 ----------------

export class LocalNet {
  constructor(handlers) {
    this.h = handlers;
    this.code = 'SOLO';
    this.playerId = null;
    this.host = null;
  }

  async create(name, opts = {}) {
    const room = createRoom('SOLO');
    const me = addPlayer(room, name, { clientId: getClientId() });
    const bots = ['阿福', '小美', '老王', '阿强', '丽丽'].slice(0, Math.max(1, Math.min(5, opts.bots || 3)));
    for (const b of bots) addPlayer(room, b, { isBot: true });
    // 先停在大厅，让玩家挑棋子，再点开始
    this.playerId = me.player.id;
    this.h.onSelf({ code: 'SOLO', playerId: this.playerId, token: null });
    this.host = new EngineHost({
      room,
      playerId: this.playerId,
      onState: this.h.onState,
      onError: this.h.onError,
      autoStart: true,
    });
  }

  async join() { throw new Error('单机模式不能加入房间'); }

  send(action) { this.host.apply(action); }

  close() { if (this.host) this.host.close(); }
}

// ---------------- WebRTC ----------------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`加载失败：${src}`));
    document.head.appendChild(el);
  });
}

let peerLoading = null;
async function ensurePeer() {
  if (window.Peer) return;
  if (peerLoading) return peerLoading;
  peerLoading = (async () => {
    const urls = [
      'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
      'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js',
      'https://cdn.staticfile.org/peerjs/1.5.5/peerjs.min.js',
    ];
    for (const u of urls) {
      try { await loadScript(u); } catch { /* 换下一个源 */ }
      if (window.Peer) return;
    }
    throw new Error('无法加载 WebRTC 组件（PeerJS），请检查网络后重试，或改用本地服务器模式');
  })();
  try { await peerLoading; } finally { peerLoading = null; }
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, PEER_OPTS);
    const timer = setTimeout(() => {
      cleanup();
      try { peer.destroy(); } catch { /* ignore */ }
      reject(new Error('连接信令服务器超时，稍后再试'));
    }, 15000);
    const onOpen = () => { cleanup(); resolve(peer); };
    const onErr = (err) => {
      cleanup();
      const e = new Error(err?.message || '连接信令服务器失败');
      e.code = err?.type;
      reject(e);
    };
    function cleanup() {
      clearTimeout(timer);
      peer.off('open', onOpen);
      peer.off('error', onErr);
    }
    peer.on('open', onOpen);
    peer.on('error', onErr);
  });
}

export class HostNet {
  constructor(handlers) {
    this.h = handlers;
    this.code = null;
    this.playerId = null;
    this.peer = null;
    this.conns = new Map();
    this.host = null;
  }

  async create(name) {
    await ensurePeer();
    this.h.onStatus('正在创建房间…', 'warn');
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(PEER_PREFIX + code);
        this.code = code;
        break;
      } catch (e) {
        lastErr = e;
        if (e.code !== 'unavailable-id') throw e;
      }
    }
    if (!this.peer) throw lastErr || new Error('创建房间失败');

    this.h.onStatus('房间已创建，等待朋友加入', 'ok');
    this.peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') return;
      this.h.onStatus(`P2P 连接异常：${err?.type || err?.message || ''}`, 'bad');
    });
    this.peer.on('disconnected', () => {
      this.h.onStatus('与信令服务器断开，正在重连…', 'warn');
      try { this.peer.reconnect(); } catch { /* ignore */ }
    });

    const room = createRoom(this.code);
    const me = addPlayer(room, name, { clientId: getClientId() });
    this.playerId = me.player.id;
    saveSession(this.code, { token: me.player.token, playerId: me.player.id, host: true });
    this.h.onSelf({ code: this.code, playerId: this.playerId, token: me.player.token });

    this.host = new EngineHost({
      room,
      playerId: this.playerId,
      onState: this.h.onState,
      onError: this.h.onError,
      autoStart: true,
      onChange: () => this.pushGuests(),
    });

    this.peer.on('connection', (conn) => this.accept(conn));
  }

  accept(conn) {
    let started = false;
    // 房主侧收到连接时，数据通道可能已经 open，先补一次检查
    const setup = () => {
      if (started) return;
      started = true;
      this.setupConn(conn);
    };
    conn.on('open', setup);
    if (conn.open) setup();
  }

  setupConn(conn) {
    const room = this.host.room;
    const meta = conn.metadata || {};
    let player = meta.token ? room.players.find((p) => p.token === meta.token) : null;
    // 同一个标签页重复连进来：认回原来的座位，不新建玩家
    if (!player && meta.clientId) {
      player = room.players.find((p) => !p.isBot && p.clientId === meta.clientId) || null;
    }

      if (player) {
        player.connected = true;
      } else {
        if (room.phase !== 'lobby') {
          conn.send({ t: 'err', msg: '这局已经开始了，等下一局吧' });
          setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 500);
          return;
        }
        const r = addPlayer(room, meta.name, { clientId: meta.clientId });
        if (!r.ok) {
          conn.send({ t: 'err', msg: r.err });
          setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 500);
          return;
        }
        player = r.player;
      }

      this.conns.set(conn.peer, { conn, playerId: player.id });
      conn.send({ t: 'hello', code: room.code, playerId: player.id, token: player.token });
      conn.send({ t: 'state', view: view(room, player.id) });

      conn.on('data', (d) => {
        if (!d || d.t !== 'act') return;
        const res = act(room, player.id, d.action || {});
        if (!res.ok) conn.send({ t: 'err', msg: res.err });
        this.broadcast();
      });

      conn.on('close', () => {
        this.conns.delete(conn.peer);
        const still = [...this.conns.values()].some((c) => c.playerId === player.id);
        const p = room.players.find((x) => x.id === player.id);
        if (p && !still) p.connected = false;
        this.broadcast();
      });

      this.broadcast();
  }

  pushGuests() {
    if (!this.host) return;
    const room = this.host.room;
    for (const { conn, playerId } of this.conns.values()) {
      if (!conn.open) continue;
      try { conn.send({ t: 'state', view: view(room, playerId) }); } catch { /* ignore */ }
    }
  }

  broadcast() {
    this.pushGuests();
    if (this.host) this.host.publish();
  }

  send(action) { this.host.apply(action); }

  close() {
    if (this.host) this.host.close();
    for (const { conn } of this.conns.values()) { try { conn.close(); } catch { /* ignore */ } }
    if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } }
  }
}

export class GuestNet {
  constructor(handlers) {
    this.h = handlers;
    this.code = null;
    this.playerId = null;
    this.peer = null;
    this.conn = null;
  }

  async create() { throw new Error('访客模式不能创建房间'); }

  async join(code, name) {
    await ensurePeer();
    this.code = code;
    this.h.onStatus('正在连接房主…', 'warn');
    const sess = loadSession(code);
    this.peer = await openPeer(undefined);
    this.peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') {
        this.h.onError('找不到这个房间，可能房主已关闭页面');
        this.h.onStatus('连接失败', 'bad');
      }
    });

    const conn = this.peer.connect(PEER_PREFIX + code, {
      reliable: true,
      metadata: { name, token: sess?.token, clientId: getClientId() },
    });
    this.conn = conn;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接房主超时，可能对方网络受限')), 20000);
      conn.on('open', () => { clearTimeout(timer); resolve(); });
      conn.on('error', (e) => { clearTimeout(timer); reject(new Error(e?.message || '连接失败')); });
      const off = (err) => {
        if (err?.type === 'peer-unavailable') {
          clearTimeout(timer);
          this.peer.off('error', off);
          reject(new Error('找不到这个房间，检查房间码或让房主重新建房'));
        }
      };
      this.peer.on('error', off);
    });

    this.h.onStatus('已连接房主', 'ok');
    conn.on('data', (d) => {
      if (!d) return;
      if (d.t === 'state') this.h.onState(d.view);
      else if (d.t === 'hello') {
        this.playerId = d.playerId;
        saveSession(code, { token: d.token, playerId: d.playerId });
        this.h.onSelf({ code, playerId: d.playerId, token: d.token });
      } else if (d.t === 'err') {
        this.h.onError(d.msg);
      }
    });
    conn.on('close', () => this.h.onStatus('与房主断开连接', 'bad'));
  }

  send(action) {
    if (this.conn && this.conn.open) this.conn.send({ t: 'act', action });
    else this.h.onError('连接已断开');
  }

  close() {
    if (this.conn) { try { this.conn.close(); } catch { /* ignore */ } }
    if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } }
  }
}
