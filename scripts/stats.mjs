// 查看联机服务的游玩统计
// 用法：node scripts/stats.mjs [服务地址，默认 http://127.0.0.1:3210]
const base = (process.argv[2] || 'http://127.0.0.1:3210').replace(/\/$/, '');

try {
  const res = await fetch(base + '/api/stats');
  const s = await res.json();
  const since = new Date(s.since);
  console.log('大富翁联机统计');
  console.log('----------------');
  console.log(`累计玩家：${s.uniquePlayers} 人`);
  console.log(`累计房间：${s.roomsCreated} 个`);
  console.log(`已开局数：${s.gamesStarted} 局`);
  console.log(`当前在线：${s.onlineRooms} 个房间 / ${s.onlinePlayers} 人`);
  console.log(`历史峰值：${s.peakRooms} 个房间同时在线`);
  console.log(`统计开始：${since.toLocaleString('zh-CN')}`);
  console.log(`服务运行：${Math.round(s.uptime / 60)} 分钟`);
} catch (e) {
  console.error('无法连接服务：' + e.message);
  console.error('请确认已运行 node server.mjs，或用参数指定地址。');
  process.exit(1);
}
