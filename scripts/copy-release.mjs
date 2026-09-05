// 构建后将发行文件统一复制到 release/ 目录
// 用法：node scripts/copy-release.mjs（通常由 `npm run release` 自动调用）
import { copyFileSync, existsSync, readdirSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// 从 package.json 读取版本号
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

const releaseDir = join(root, 'release');
if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });

// 1. NSIS 安装包：src-tauri/target/release/bundle/nsis/*.exe
// 注意：目录里可能残留多个历史版本的 -setup.exe（如 1.0.0/2.0.0），
// 必须取「最新构建」的那一个，不能按字母序 .find() 取第一个。
const nsisDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
let installer = null;
if (existsSync(nsisDir)) {
  const setups = readdirSync(nsisDir)
    .filter((f) => f.endsWith('-setup.exe'))
    .map((f) => join(nsisDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs); // 新的在前
  if (setups.length > 0) installer = setups[0];
}

// 2. 便携版 app.exe：src-tauri/target/release/app.exe
const portable = join(root, 'src-tauri', 'target', 'release', 'app.exe');

const results = [];

if (installer && existsSync(installer)) {
  const dest = join(releaseDir, `DesktopTaskManager-v${version}-setup.exe`);
  try {
    copyFileSync(installer, dest);
    results.push(`安装包  -> DesktopTaskManager-v${version}-setup.exe`);
  } catch (e) {
    results.push(`安装包  -> 复制失败：${e.message}`);
  }
} else {
  results.push('安装包  -> 未找到（请先运行 tauri build）');
}

if (existsSync(portable)) {
  const dest = join(releaseDir, `DesktopTaskManager-v${version}.exe`);
  try {
    copyFileSync(portable, dest);
    results.push(`便携版  -> DesktopTaskManager-v${version}.exe`);
  } catch (e) {
    results.push(`便携版  -> 复制失败（可能被运行中的进程锁定）：${e.message}`);
  }
} else {
  results.push('便携版  -> 未找到（请先运行 tauri build）');
}

console.log('\n=== 发行文件已归档到 release/ ===');
results.forEach((r) => console.log('  ' + r));
console.log('');
