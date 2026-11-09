// 当 github.com:443 连不上时，用 api.github.com 推送工作区快照
// 文本文件内联进 tree（1 次请求），只有二进制文件才单独建 blob
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

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.json', '.css', '.html', '.htm', '.md', '.yml', '.yaml',
  '.txt', '.svg', '.bat', '.ps1', '.gitignore', '.nojekyll',
]);

const headers = {
  Authorization: `token ${token}`,
  'User-Agent': 'dafuweng-push',
  Accept: 'application/vnd.github+json',
};

async function api(p, method = 'GET', body) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
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
        if (res.status < 500) throw err;
        lastErr = err;
      } else {
        return data;
      }
    } catch (e) {
      if (e.status && e.status < 500) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  throw lastErr;
}

const files = execSync('git -c core.quotepath=false ls-files', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
console.log(`准备推送 ${files.length} 个文件到 ${owner}/${repo}`);

// 空仓库不能直接建 blob/tree，先用 Contents API 打一个初始提交
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
let binary = 0;
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const posix = file.split(path.sep).join('/');
  if (TEXT_EXT.has(ext) || TEXT_EXT.has(path.basename(file))) {
    tree.push({ path: posix, mode: '100644', type: 'blob', content: fs.readFileSync(file, 'utf8') });
  } else {
    const blob = await api(`/repos/${owner}/${repo}/git/blobs`, 'POST', {
      content: fs.readFileSync(file).toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: posix, mode: '100644', type: 'blob', sha: blob.sha });
    binary++;
    process.stdout.write('*');
  }
}
console.log(`\n内联文本 ${tree.length - binary} 个，上传二进制 ${binary} 个`);

const treeRes = await api(`/repos/${owner}/${repo}/git/trees`, 'POST', { tree });
const commit = await api(`/repos/${owner}/${repo}/git/commits`, 'POST', {
  message,
  tree: treeRes.sha,
  parents: parent ? [parent] : [],
});
await api(`/repos/${owner}/${repo}/git/refs/heads/main`, 'PATCH', { sha: commit.sha, force: true });

console.log(`已推送 commit ${commit.sha.slice(0, 7)}`);
console.log(`https://github.com/${owner}/${repo}/commit/${commit.sha}`);
