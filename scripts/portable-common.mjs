import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function getLayout() {
  const app = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const root = path.dirname(app);
  const state = path.join(root, 'state');
  return { root, app, state, logs: path.join(state, 'logs'), stateFile: path.join(state, 'launcher.json'), config: path.join(root, 'config.env'), node: path.join(root, 'runtime', 'node.exe') };
}
export function packageIdentity(layout) {
  return createHash('sha256').update(process.platform === 'win32' ? layout.root.toLowerCase() : layout.root).digest('hex');
}
export function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function readState(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
function validPort(port) { return Number.isInteger(port) && port > 0 && port <= 65535; }
export function validState(state, expectedPackage) {
  return state && state.protocol === 1 && state.packageId === expectedPackage && validPort(state.controlPort) && /^[0-9a-f]{64}$/.test(state.token || '') && /^[0-9a-f-]{36}$/.test(state.instanceId || '');
}
export function localJson(port, route, { method = 'GET', token, timeout = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: route, method, headers: token ? { Authorization: `Bearer ${token}` } : {} }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 64000) req.destroy(new Error('本地响应过大')); });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch { reject(new Error('本地服务尚未就绪')); } });
    });
    req.setTimeout(timeout, () => req.destroy(new Error('本地服务响应超时')));
    req.on('error', reject);
    req.end();
  });
}
export async function probeState(state, expectedPackage) {
  if (!validState(state, expectedPackage)) return null;
  try {
    const response = await localJson(state.controlPort, '/status', { token: state.token });
    const status = response.body;
    return response.status === 200 && status.protocol === 1 && status.packageId === expectedPackage && status.instanceId === state.instanceId ? status : null;
  } catch { return null; }
}
export function parseEnv(text) {
  const values = {};
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}
export function ensureConfig(layout) {
  if (!existsSync(layout.config)) {
    const template = path.join(layout.app, 'scripts', 'portable-template', 'config.env');
    if (!existsSync(template)) throw new Error('缺少 config.env 配置模板，请重新完整解压。');
    try { writeFileSync(layout.config, readFileSync(template), { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}
export function portableEnvironment(layout) {
  // Do not inherit API keys, NODE_OPTIONS, proxy settings, or paths from another installation.
  const systemKeys = new Set(['path', 'pathext', 'systemroot', 'windir', 'systemdrive', 'comspec', 'temp', 'tmp', 'userprofile', 'username', 'userdomain', 'homedrive', 'homepath', 'appdata', 'localappdata', 'programdata', 'programfiles', 'programfiles(x86)', 'programw6432', 'commonprogramfiles', 'commonprogramfiles(x86)', 'number_of_processors', 'processor_architecture', 'os', 'lang']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => systemKeys.has(key.toLowerCase()) && typeof value === 'string'));
  const configKeys = new Set(['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DASHSCOPE_API_KEY', 'QWEN_BASE_URL', 'PROJECT_BUDGET_CNY', 'PORT', 'KOKORO_EN_SPEAKER', 'KOKORO_ZH_SPEAKER', 'KOKORO_THREADS', 'KOKORO_SPEED', 'KOKORO_PREWARM']);
  // A blank key in the package-root config intentionally disables that provider.
  for (const file of [path.join(layout.app, '.env'), path.join(layout.app, '.env.local'), layout.config]) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) if (configKeys.has(key)) env[key] = value;
  }
  env.DEEPSEEK_API_KEY ??= '';
  env.DASHSCOPE_API_KEY ??= '';
  const require = createRequire(path.join(layout.app, 'package.json'));
  const ffmpeg = require('ffmpeg-static');
  const ffprobe = require('ffprobe-static').path;
  const insideApp = file => typeof file === 'string' && path.resolve(file).toLowerCase().startsWith((layout.app + path.sep).toLowerCase());
  if (!insideApp(ffmpeg) || !insideApp(ffprobe)) throw new Error('FFmpeg / FFprobe 必须来自当前便携包。');
  return { ...env, NODE_ENV: 'production', SPROUT_PORTABLE: '1', SPROUT_PORTABLE_ROOT: layout.root, NEXT_TELEMETRY_DISABLED: '1', PLAYWRIGHT_BROWSERS_PATH: path.join(layout.app, 'data', 'browsers'), KOKORO_MODEL_DIR: path.join(layout.app, 'data', 'models', 'kokoro-multi-lang-v1_1'), ALLOW_DEMO_SYSTEM_VOICE: 'false', FFMPEG_PATH: ffmpeg, FFPROBE_PATH: ffprobe, DEMO_DB_PATH: path.join(layout.app, 'data', 'local.db') };
}
export function openBrowser(port, onError = () => {}) {
  if (!validPort(port)) throw new Error('应用端口无效');
  const url = `http://127.0.0.1:${port}`;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe');
  const child = spawn(executable, ['url.dll,FileProtocolHandler', url], { windowsHide: true, detached: true, shell: false, stdio: 'ignore' });
  child.once('error', onError);
  child.unref();
  return url;
}
export function terminateOwnedChild(child) {
  // The ChildProcess object is held by the live supervisor. Never kill a PID read from disk.
  if (!Number.isInteger(child.pid) || child.pid <= 0 || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    const killer = spawn(executable, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    let settled = false;
    const finish = ok => { if (settled) return; settled = true; clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => { killer.kill(); finish(false); }, 10000);
    killer.once('error', () => finish(false));
    killer.once('exit', code => finish(code === 0 || child.exitCode !== null || child.signalCode !== null));
  });
}
export function ensureDirectories(layout) { mkdirSync(layout.logs, { recursive: true }); }
