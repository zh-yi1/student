import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, createWriteStream, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { constantEqual, ensureConfig, ensureDirectories, getLayout, localJson, openBrowser, packageIdentity, portableEnvironment, probeState, readState, sleep, terminateOwnedChild } from './portable-common.mjs';

const layout = getLayout();
const packageId = packageIdentity(layout);
const noBrowser = process.argv.includes('--no-browser');
const children = [];
const streams = [];
let state;
let server;
let claimed = false;
let stopping = false;
let ready = false;
let finalExitCode = 0;
function log(message) {
  console.log(message);
  try { appendFileSync(path.join(layout.logs, 'launcher.log'), `${new Date().toISOString()} ${message}\n`); } catch { /* console remains available */ }
}
function removeOwnState() {
  if (readState(layout.stateFile)?.instanceId === state?.instanceId) { try { unlinkSync(layout.stateFile); } catch { /* already removed */ } }
}
async function shutdown(exitCode = 0) {
  if (exitCode) finalExitCode = exitCode;
  if (stopping) return;
  stopping = true; ready = false;
  log('正在停止本便携包启动的服务……');
  const results = await Promise.allSettled(children.map(terminateOwnedChild));
  if (results.some(result => result.status === 'rejected' || result.value !== true)) { finalExitCode ||= 1; log('部分本包子进程未能确认退出，请查看日志。'); }
  if (claimed) removeOwnState();
  server?.close();
  for (const child of children) { child.stdout?.unpipe(); child.stderr?.unpipe(); }
  for (const stream of streams) stream.end();
  process.exitCode = finalExitCode;
  setTimeout(() => process.exit(finalExitCode), 100).unref();
}
function launchChild(name, args, env) {
  const output = createWriteStream(path.join(layout.logs, `${name}.log`), { flags: 'a' });
  streams.push(output);
  output.write(`\n--- ${new Date().toISOString()} ${name} ---\n`);
  const child = spawn(layout.node, args, { cwd: layout.app, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
  child.once('error', error => { log(`${name} 无法启动：${error.code || '未知错误'}。请查看日志。`); void shutdown(1); });
  child.once('exit', (code, signal) => { if (!stopping) { log(`${name} 意外退出（${code ?? signal}），正在清理本包服务。`); void shutdown(Number.isInteger(code) && code > 0 && code < 256 ? code : 1); } });
  return child;
}
function makeControlServer() {
  return createServer((req, res) => {
    const authorized = req.socket.remoteAddress === '127.0.0.1' && constantEqual(req.headers.authorization, `Bearer ${state.token}`);
    if (!authorized) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({ protocol: 1, packageId, instanceId: state.instanceId, ready, stopping, appPort: state.appPort || null, startedAt: state.startedAt }));
    } else if (req.method === 'POST' && req.url === '/shutdown') {
      res.end(JSON.stringify({ accepted: true, instanceId: state.instanceId }));
      setImmediate(() => { void shutdown(0); });
    } else { res.writeHead(404); res.end('{}'); }
  });
}
async function listenControl() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve); });
  state.controlPort = server.address().port;
}
async function claimState() {
  for (let attempt = 0; attempt < 12; attempt++) {
    try { writeFileSync(layout.stateFile, JSON.stringify(state), { flag: 'wx', mode: 0o600 }); claimed = true; return null; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    let existing = readState(layout.stateFile);
    let status = await probeState(existing, packageId);
    if (status) return { state: existing, status };
    // An overlapping launch may still be finishing its tiny atomic file write.
    await sleep(300);
    existing = readState(layout.stateFile); status = await probeState(existing, packageId);
    if (status) return { state: existing, status };
    const stale = path.join(layout.state, `stale-${randomUUID()}.json`);
    try { renameSync(layout.stateFile, stale); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const moved = readState(stale);
    const alive = await probeState(moved, packageId);
    if (alive) {
      // A new launcher won the race before the rename. Restore or reuse the newer owner.
      try { writeFileSync(layout.stateFile, JSON.stringify(moved), { flag: 'wx', mode: 0o600 }); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const replacement = readState(layout.stateFile);
        const replacementStatus = await probeState(replacement, packageId);
        if (replacementStatus) {
          await localJson(moved.controlPort, '/shutdown', { method: 'POST', token: moved.token }).catch(() => {});
          unlinkSync(stale); return { state: replacement, status: replacementStatus };
        }
      }
      unlinkSync(stale); return { state: moved, status: alive };
    }
    unlinkSync(stale);
  }
  throw new Error('启动状态正在变化，请稍后重新双击启动。');
}
async function reuseExisting(existing) {
  server.close();
  log('已找到本便携包正在运行的实例，等待其就绪……');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const status = await probeState(existing.state, packageId);
    if (!status || status.stopping) throw new Error('原实例正在停止，请稍后重新启动。');
    if (status.ready && status.appPort) {
      const health = await localJson(status.appPort, '/api/health', { timeout: 3000 });
      if (health.status !== 200 || health.body.portableInstanceId !== existing.state.instanceId || health.body.portablePackageId !== packageId) throw new Error('现有应用端口归属校验失败，未打开其他服务。');
      const url = `http://127.0.0.1:${status.appPort}`;
      log(`本包已在运行：${url}`);
      if (!noBrowser) openBrowser(status.appPort, () => log(`浏览器未自动打开，请手动访问 ${url}`));
      return;
    }
    await sleep(500);
  }
  throw new Error('现有实例启动超时，请查看 state/logs 中的日志。');
}
async function reserveAppPort(preferred) {
  for (let port = preferred; port < Math.min(preferred + 200, 65536); port++) {
    const reservation = createNetServer();
    const available = await new Promise((resolve, reject) => {
      reservation.once('error', error => error.code === 'EADDRINUSE' || error.code === 'EACCES' ? resolve(false) : reject(error));
      reservation.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve(true));
    });
    if (available) return { port, release: () => new Promise(resolve => reservation.close(resolve)) };
  }
  throw new Error('未找到可用本地端口，请在 config.env 修改 PORT 后重试。');
}
function validateBundle(env) {
  for (const file of [layout.node, path.join(layout.app, '.next', 'BUILD_ID'), path.join(layout.app, 'node_modules', 'next', 'dist', 'bin', 'next'), env.FFMPEG_PATH, env.FFPROBE_PATH]) if (!existsSync(file)) throw new Error(`便携包缺少文件：${path.relative(layout.root, file)}。请重新完整解压。`);
  for (const file of ['model.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt', 'lexicon-zh.txt']) if (!existsSync(path.join(env.KOKORO_MODEL_DIR, file))) throw new Error(`便携包缺少 Kokoro 文件 ${file}，请重新完整解压。`);
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const require = createRequire(path.join(layout.app, 'package.json'));
  const browser = require('playwright').chromium.executablePath();
  if (!browser.toLowerCase().startsWith((env.PLAYWRIGHT_BROWSERS_PATH + path.sep).toLowerCase()) || !existsSync(browser)) throw new Error('便携包缺少内置 Chromium，请重新完整解压。');
  if (!require('sherpa-onnx-node').OfflineTts) throw new Error('本地语音运行时未完整包含在便携包中。');
}
async function main() {
  if (process.platform !== 'win32') throw new Error('此便携包仅支持 Windows。');
  ensureDirectories(layout); ensureConfig(layout);
  if (process.argv.includes('--configure')) {
    const editor = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'notepad.exe'), [layout.config], { detached: true, windowsHide: false, shell: false, stdio: 'ignore' });
    editor.once('error', () => { console.error(`请用文本编辑器打开：${layout.config}`); process.exitCode = 1; }); editor.unref(); return;
  }
  const env = portableEnvironment(layout);
  if (process.argv.includes('--check')) {
    validateBundle(env);
    const doctor = spawn(layout.node, [path.join(layout.app, 'scripts', 'check.mjs'), '--portable'], { cwd: layout.app, env, windowsHide: true, shell: false, stdio: 'inherit' });
    children.push(doctor);
    await new Promise((resolve, reject) => { doctor.once('error', reject); doctor.once('exit', code => { process.exitCode = code === 0 ? 0 : 1; resolve(); }); });
    return;
  }
  state = { protocol: 1, packageId, instanceId: randomUUID(), token: randomBytes(32).toString('hex'), controlPort: 0, appPort: null, startedAt: new Date().toISOString() };
  server = makeControlServer(); await listenControl();
  const existing = await claimState();
  if (existing) { await reuseExisting(existing); return; }
  validateBundle(env);
  const requested = Number(env.PORT || 3000);
  if (!Number.isInteger(requested) || requested < 1024 || requested > 65535) throw new Error('config.env 中的 PORT 应为 1024—65535 的整数。');
  const reservation = await reserveAppPort(requested);
  state.appPort = reservation.port;
  if (readState(layout.stateFile)?.instanceId !== state.instanceId) { await reservation.release(); throw new Error('本次启动未能持有实例状态，请重试。'); }
  writeFileSync(layout.stateFile, JSON.stringify(state), { mode: 0o600 });
  const childEnv = { ...env, PORT: String(state.appPort), PORTABLE_INSTANCE_ID: state.instanceId, PORTABLE_PACKAGE_ID: packageId };
  log(`正在启动小芽英语：http://127.0.0.1:${state.appPort}`);
  await reservation.release();
  launchChild('next', [path.join(layout.app, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(state.appPort)], childEnv);
  launchChild('worker', ['--import', 'tsx', path.join(layout.app, 'scripts', 'worker.ts')], childEnv);
  const deadline = Date.now() + 120000;
  while (!stopping && Date.now() < deadline) {
    try {
      const health = await localJson(state.appPort, '/api/health', { timeout: 2500 });
      if (health.status === 200 && health.body.ok) {
        if (health.body.portableInstanceId !== state.instanceId || health.body.portablePackageId !== packageId) throw new Error('PORT_OWNER_MISMATCH');
        ready = true;
        const url = `http://127.0.0.1:${state.appPort}`;
        log(`已就绪：${url}\n请保持此窗口打开。退出请使用“停止小芽英语.cmd”。`);
        if (!noBrowser) openBrowser(state.appPort, () => log(`浏览器未自动打开，请手动访问 ${url}`));
        return;
      }
    } catch (error) { if (error.message === 'PORT_OWNER_MISMATCH') throw new Error('应用端口已被其他实例占用，已停止本次启动，未打开其他服务。'); }
    await sleep(500);
  }
  if (!stopping) throw new Error('应用启动超时，请查看 state/logs/next.log 和 worker.log。');
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(signal, () => { void shutdown(0); });
process.on('uncaughtException', error => { log(`启动器异常：${error.code || error.message}`); void shutdown(1); });
main().catch(error => { log(`启动失败：${error.message}`); void shutdown(1); });
