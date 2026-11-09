// Node 联机服务：静态托管 + REST + SSE 推送 + 机器人回合驱动
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRoom, addPlayer, act, view, tickBots } from './public/game/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '0.0.0.0';

const rooms = new Map(); // code -> { room, clients: Set<{res, playerId}>, lastAct }
const tokens = new Map(); // token -> { code, playerId }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (let tries = 0; tries < 200; tries++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('无法生成房间码');
}

function getEntry(code) {
  return code ? rooms.get(String(code).toUpperCase()) : null;
}

function broadcast(entry) {
  const room = entry.room;
  for (const client of entry.clients) {
    if (client.res.writableEnded) { entry.clients.delete(client); continue; }
    try {
      client.res.write(`data: ${JSON.stringify(view(room, client.playerId))}\n\n`);
    } catch {
      entry.clients.delete(client);
    }
  }
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function findPlayerByToken(entry, token) {
  if (!token) return null;
  const rec = tokens.get(token);
  if (!rec || rec.code !== entry.room.code) return null;
  return entry.room.players.find((p) => p.id === rec.playerId) || null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/health') {
      return json(res, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
    }

    if (pathname === '/api/create' && req.method === 'POST') {
      const body = await readBody(req);
      const code = newCode();
      const room = createRoom(code);
      const r = addPlayer(room, body.name);
      if (!r.ok) return json(res, 400, r);
      const entry = { room, clients: new Set(), lastAct: Date.now() };
      rooms.set(code, entry);
      tokens.set(r.player.token, { code, playerId: r.player.id });
      return json(res, 200, { code, token: r.player.token, playerId: r.player.id });
    }

    if (pathname === '/api/join' && req.method === 'POST') {
      const body = await readBody(req);
      const entry = getEntry(body.code);
      if (!entry) return json(res, 404, { ok: false, err: '房间不存在，检查房间码' });
      const room = entry.room;

      // 断线重连：带旧 token 直接找回原来的玩家
      const existing = findPlayerByToken(entry, body.token);
      if (existing) {
        existing.connected = true;
        return json(res, 200, { code: room.code, token: body.token, playerId: existing.id });
      }
      if (room.phase !== 'lobby') return json(res, 400, { ok: false, err: '这局已经开始了' });

      const r = addPlayer(room, body.name);
      if (!r.ok) return json(res, 400, r);
      tokens.set(r.player.token, { code: room.code, playerId: r.player.id });
      broadcast(entry);
      return json(res, 200, { code: room.code, token: r.player.token, playerId: r.player.id });
    }

    if (pathname === '/api/act' && req.method === 'POST') {
      const body = await readBody(req);
      const rec = tokens.get(body.token);
      if (!rec) return json(res, 401, { ok: false, err: '会话已失效，请重新加入' });
      const entry = rooms.get(rec.code);
      if (!entry) return json(res, 404, { ok: false, err: '房间已关闭' });
      const result = act(entry.room, rec.playerId, body.action || {});
      entry.lastAct = Date.now();
      if (result.ok) broadcast(entry);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/stream' && req.method === 'GET') {
      const token = url.searchParams.get('token') || '';
      const rec = tokens.get(token);
      if (!rec) { res.writeHead(401); res.end('invalid token'); return; }
      const entry = rooms.get(rec.code);
      if (!entry) { res.writeHead(404); res.end('room closed'); return; }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');

      const player = entry.room.players.find((p) => p.id === rec.playerId);
      if (player) player.connected = true;

      const client = { res, playerId: rec.playerId };
      entry.clients.add(client);
      res.write(`data: ${JSON.stringify(view(entry.room, rec.playerId))}\n\n`);
      req.on('close', () => {
        entry.clients.delete(client);
        const stillOnline = [...entry.clients].some((c) => c.playerId === rec.playerId);
        const p = entry.room.players.find((x) => x.id === rec.playerId);
        if (p && !stillOnline) p.connected = false;
        broadcast(entry);
      });
      return;
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { ok: false, err: '接口不存在' });
    return serveStatic(req, res, pathname);
  } catch (e) {
    json(res, 500, { ok: false, err: e.message });
  }
});

// 机器人回合驱动
setInterval(() => {
  for (const entry of rooms.values()) {
    let changed = false;
    try {
      changed = tickBots(entry.room);
    } catch (e) {
      console.error('bot error', e.message);
    }
    if (changed) broadcast(entry);
  }
}, 900);

// 心跳，防止代理断开长连接
setInterval(() => {
  for (const entry of rooms.values()) {
    for (const client of entry.clients) {
      if (client.res.writableEnded) entry.clients.delete(client);
      else client.res.write(': ping\n\n');
    }
  }
}, 25000);

// 清理空闲房间
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of rooms) {
    const idle = now - entry.lastAct;
    const empty = entry.clients.size === 0;
    if ((entry.room.phase === 'ended' && idle > 30 * 60 * 1000) || (empty && idle > 2 * 60 * 60 * 1000)) {
      for (const [t, rec] of tokens) if (rec.code === code) tokens.delete(t);
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🎲 大富翁 · 中国城市版');
  console.log('  ─────────────────────────────');
  console.log(`  本机：   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  局域网： http://${ip}:${PORT}   （同一 WiFi 的朋友用这个）`);
  console.log('  公网：   用 Cloudflare Tunnel 或部署到服务器，见 README');
  console.log('');
});
