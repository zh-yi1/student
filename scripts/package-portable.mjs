import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Copy a tested production build into a relocatable folder. No install step runs here.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(process.argv[2] || path.join(project, '..', 'Sprout-English-Windows-x64'));
const nodeDistribution = path.resolve(process.argv[3] || '');
if (!process.argv[3]) throw new Error('Pass destination and an extracted official Windows x64 Node distribution.');
if (destination === project || destination.startsWith(project + path.sep)) throw new Error('Package must be outside the source project.');
if (existsSync(destination)) throw new Error('Destination already exists. Use a new empty release directory.');
for (const file of ['.next/BUILD_ID', 'scripts/portable-launcher.mjs', 'scripts/portable-stop.mjs', 'node_modules/next/package.json', 'data/models/kokoro-multi-lang-v1_1/model.onnx']) {
  if (!existsSync(path.join(project, file))) throw new Error('Missing build input: ' + file);
}
for (const file of ['node.exe', 'LICENSE']) if (!existsSync(path.join(nodeDistribution, file))) throw new Error('Missing official Node runtime file: ' + file);
if (!existsSync(path.join(project, 'data/browsers'))) throw new Error('Install the bundled Playwright Chromium first.');

const app = path.join(destination, 'app');
mkdirSync(app, { recursive: true });
const copy = (relative, target = relative, filter) => {
  console.log('Copying ' + relative);
  cpSync(path.join(project, relative), path.join(app, target), { recursive: true, dereference: true, filter });
};
for (const dir of ['app', 'lib', 'public', 'scripts', 'node_modules', 'examples']) copy(dir);
copy('.next', '.next', (src) => {
  const rel = path.relative(path.join(project, '.next'), src).replaceAll('\\', '/');
  return !['cache', 'dev', 'diagnostics', 'types'].some(x => rel === x || rel.startsWith(x + '/'));
});
for (const file of ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'README.md', '.env.example']) if (existsSync(path.join(project, file))) copy(file);
writeFileSync(path.join(app, 'README.md'), '> 便携版使用提示：请返回上一级目录，双击“启动小芽英语.cmd”。本包无需安装 Node、npm 或模型。下面的安装与开发命令只供源码开发参考；实际配置请修改包根 config.env。\n\n' + readFileSync(path.join(app, 'README.md'), 'utf8'));
copy('data/models/kokoro-multi-lang-v1_1');
copy('data/browsers', 'data/browsers', (src) => !path.relative(path.join(project, 'data/browsers'), src).split(path.sep).includes('.links'));
mkdirSync(path.join(destination, 'runtime'), { recursive: true });
for (const file of ['node.exe', 'LICENSE', 'README.md']) if (existsSync(path.join(nodeDistribution, file))) copyFileSync(path.join(nodeDistribution, file), path.join(destination, 'runtime', file));
for (const file of readdirSync(path.join(project, 'scripts/portable-template'))) {
  const source = path.join(project, 'scripts/portable-template', file);
  const target = path.join(destination, file);
  if (file.endsWith('.cmd')) writeFileSync(target, readFileSync(source, 'ascii').replace(/\r?\n/g, '\r\n'), 'ascii');
  else copyFileSync(source, target);
}
mkdirSync(path.join(destination, 'third-party'), { recursive: true });
copyFileSync(path.join(nodeDistribution, 'LICENSE'), path.join(destination, 'third-party', 'Node-LICENSE.txt'));
if (existsSync(path.join(project, 'licenses/media'))) cpSync(path.join(project, 'licenses/media'), path.join(destination, 'third-party/media'), { recursive: true, dereference: true });
for (const file of ['PORTABLE-THIRD-PARTY.txt', 'PORTABLE-MEDIA-MANIFEST.json']) {
  if (existsSync(path.join(project, file))) copyFileSync(path.join(project, file), path.join(destination, 'third-party', file));
}
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest = {
  product: '小芽英语本地 Demo', platform: 'win32-x64', createdAt: new Date().toISOString(),
  node: { version: '24.13.0', executableSha256: hash(path.join(destination, 'runtime/node.exe')), distribution: 'https://nodejs.org/dist/v24.13.0/node-v24.13.0-win-x64.zip', archiveSha256: 'ca2742695be8de44027d71b3f53a4bdb36009b95575fe1ae6f7f0b5ce091cb88' },
  buildId: readFileSync(path.join(app, '.next/BUILD_ID'), 'utf8').trim(),
  dependencyLockSha256: hash(path.join(app, 'package-lock.json')),
  dataPolicy: 'No developer database, logs, credentials or temporary job cache is packaged. A fresh demo database is created on first launch.',
  models: { text: 'deepseek-flash', images: 'qwen-image-2.1-turbo', speech: 'kokoro-multi-lang-v1_1' }
};
writeFileSync(path.join(destination, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
let files = 0, bytes = 0;
function measure(dir) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) measure(file); else { files++; bytes += statSync(file).size; } } }
measure(destination);
console.log(JSON.stringify({ destination, files, bytes, gib: +(bytes / 1024 ** 3).toFixed(2) }));
