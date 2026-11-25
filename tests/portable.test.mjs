import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseEnv, portableEnvironment, probeState } from '../scripts/portable-common.mjs';

const root = mkdtempSync(path.join(tmpdir(), '小芽 便携测试-'));
const app = path.join(root, 'app');
const layout = { root, app, config: path.join(root, 'config.env') };
mkdirSync(app, { recursive: true });
writeFileSync(path.join(app, 'package.json'), '{}');
for (const name of ['ffmpeg-static', 'ffprobe-static']) {
  const directory = path.join(app, 'node_modules', name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'index.js'), name === 'ffmpeg-static' ? "module.exports=require('node:path').join(__dirname,'ffmpeg.exe');" : "module.exports={path:require('node:path').join(__dirname,'ffprobe.exe')};");
}
after(() => rmSync(root, { recursive: true, force: true }));

test('portable config preserves explicit blanks and quoted values without evaluation', () => {
  assert.deepEqual(parseEnv('\uFEFFDEEPSEEK_API_KEY=\nPORT=3001 # local\nQWEN_BASE_URL="https://example.test/a#b"\n# ignore\n'), { DEEPSEEK_API_KEY: '', PORT: '3001', QWEN_BASE_URL: 'https://example.test/a#b' });
});

test('portable subprocesses ignore inherited secrets and force bundled paths in Unicode directories', () => {
  const names = ['DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'NODE_OPTIONS', 'PLAYWRIGHT_BROWSERS_PATH', 'KOKORO_MODEL_DIR'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = 'inherited-test-value';
    writeFileSync(path.join(app, '.env.local'), 'DEEPSEEK_API_KEY=old-file-test-value\nDASHSCOPE_API_KEY=old-file-test-value\n');
    writeFileSync(layout.config, 'DEEPSEEK_API_KEY=\nDASHSCOPE_API_KEY=\nPORT=3100\nKOKORO_THREADS=2\nKOKORO_PREWARM=false\n');
    const env = portableEnvironment(layout);
    assert.equal(env.DEEPSEEK_API_KEY, '');
    assert.equal(env.DASHSCOPE_API_KEY, '');
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.PORT, '3100');
    assert.equal(env.KOKORO_THREADS, '2');
    assert.equal(env.KOKORO_PREWARM, 'false');
    assert.equal(env.SPROUT_PORTABLE_ROOT, root);
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, path.join(app, 'data', 'browsers'));
    assert.equal(env.KOKORO_MODEL_DIR, path.join(app, 'data', 'models', 'kokoro-multi-lang-v1_1'));
    assert.equal(env.DEMO_DB_PATH, path.join(app, 'data', 'local.db'));
    assert.equal(env.ALLOW_DEMO_SYSTEM_VOICE, 'false');
    assert.ok(env.FFMPEG_PATH.startsWith(app));
    assert.ok(env.FFPROBE_PATH.startsWith(app));
  } finally {
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test('control discovery requires the package, instance, and private token to all match', async () => {
  const packageId = randomBytes(32).toString('hex');
  const token = randomBytes(32).toString('hex');
  const instanceId = randomUUID();
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); res.end('{}'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ protocol: 1, packageId, instanceId, ready: true, appPort: 3000 }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const state = { protocol: 1, packageId, token, instanceId, controlPort: server.address().port };
    assert.equal((await probeState(state, packageId)).ready, true);
    assert.equal(await probeState({ ...state, token: randomBytes(32).toString('hex') }, packageId), null);
    assert.equal(await probeState({ ...state, instanceId: randomUUID() }, packageId), null);
    assert.equal(await probeState(state, randomBytes(32).toString('hex')), null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
