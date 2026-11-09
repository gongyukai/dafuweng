// 当 github.com:443 连不上时，用 api.github.com 推送工作区快照
// 用法：GH_TOKEN=xxx node scripts/api-push.mjs [owner] [repo] [message]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.GH_TOKEN;
if (!token) {
  console.error('缺少 GH_TOKEN 环境变量');
  process.exit(1);
}
const owner = process.argv[2] || 'gongyukai';
const repo = process.argv[3] || 'dafuweng';
const message = process.argv[4] || '更新站点';
const API = 'https://api.github.com';

const headers = {
  Authorization: `token ${token}`,
  'User-Agent': 'dafuweng-push',
  Accept: 'application/vnd.github+json',
};

async function api(p, method = 'GET', body) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(API + p, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      if (!res.ok) {
        const err = new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 300)}`);
        err.status = res.status;
        // 5xx 才重试，4xx 直接抛
        if (res.status < 500) throw err;
        lastErr = err;
      } else {
        return data;
      }
    } catch (e) {
      if (e.status && e.status < 500) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastErr;
}

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

console.log(`准备推送 ${files.length} 个文件到 ${owner}/${repo}`);

// 空仓库不能直接建 blob，先用 Contents API 打一个初始提交
let parent = null;
try {
  const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/main`);
  parent = ref.object.sha;
} catch (e) {
  if (e.status !== 404 && e.status !== 409) throw e;
  const boot = await api(`/repos/${owner}/${repo}/contents/.gitkeep`, 'PUT', {
    message: 'chore: bootstrap repository',
    content: Buffer.from('\n').toString('base64'),
  });
  parent = boot.commit.sha;
  console.log('空仓库，已创建初始提交');
}

const tree = [];
for (const file of files) {
  const content = fs.readFileSync(file).toString('base64');
  const blob = await api(`/repos/${owner}/${repo}/git/blobs`, 'POST', { content, encoding: 'base64' });
  tree.push({ path: file.split(path.sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write('.');
}
console.log('');

const treeRes = await api(`/repos/${owner}/${repo}/git/trees`, 'POST', { tree });
const commit = await api(`/repos/${owner}/${repo}/git/commits`, 'POST', {
  message,
  tree: treeRes.sha,
  parents: parent ? [parent] : [],
});

if (parent) {
  await api(`/repos/${owner}/${repo}/git/refs/heads/main`, 'PATCH', { sha: commit.sha, force: true });
} else {
  await api(`/repos/${owner}/${repo}/git/refs`, 'POST', { ref: 'refs/heads/main', sha: commit.sha });
}

console.log(`已推送 commit ${commit.sha.slice(0, 7)}`);
console.log(`https://github.com/${owner}/${repo}/commit/${commit.sha}`);
