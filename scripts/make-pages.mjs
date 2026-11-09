// 生成可直接用于 GitHub Pages「分支 /docs」发布方式的目录
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, '..', 'public');
const dst = path.join(root, '..', 'docs');

fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
fs.writeFileSync(path.join(dst, '.nojekyll'), '');
console.log('已生成 docs/，可以在 GitHub 仓库设置里把 Pages 指向 main 分支的 /docs 目录');
