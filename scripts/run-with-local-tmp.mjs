/**
 * 用一个项目内的临时目录跑命令。
 *
 * 为什么需要：Windows 上 `%TEMP%` 经常被安全软件或权限策略卡住，
 * esbuild 解压出的临时文件删不掉，构建就会报 "Access is denied"。
 * 把 TEMP/TMP 指到仓库里的 .cache/tmp（已在 .gitignore），既不污染系统目录，
 * 也让构建在别人机器上更稳。
 *
 * 用法：node scripts/run-with-local-tmp.mjs vite build
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('用法: node scripts/run-with-local-tmp.mjs <command> [args...]');
  process.exit(1);
}

const tmpDir = path.resolve('.cache', 'tmp');
mkdirSync(tmpDir, { recursive: true });

// 本地二进制优先，保证 npm scripts 里直接写 vite / vitest 也能找到
const binPath = path.resolve('node_modules', '.bin');
const env = {
  ...process.env,
  TEMP: tmpDir,
  TMP: tmpDir,
  TMPDIR: tmpDir,
  PATH: `${binPath}${path.delimiter}${process.env.PATH ?? ''}`,
};

const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
