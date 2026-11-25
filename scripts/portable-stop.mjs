import { unlinkSync } from 'node:fs';
import { getLayout, localJson, packageIdentity, probeState, readState, sleep } from './portable-common.mjs';

async function main() {
  const layout = getLayout();
  const expectedPackage = packageIdentity(layout);
  const state = readState(layout.stateFile);
  if (!state) { console.log('本便携包当前没有运行中的实例。'); return; }
  const status = await probeState(state, expectedPackage);
  if (!status) {
    // A stale state file is not authority to terminate any process ID.
    console.log('未找到可验证的本包监督进程；没有结束任何进程。下次启动会清理失效状态。');
    return;
  }
  const response = await localJson(state.controlPort, '/shutdown', { method: 'POST', token: state.token, timeout: 5000 });
  if (response.status !== 200 || !response.body.accepted || response.body.instanceId !== state.instanceId) throw new Error('停止请求未通过实例身份校验，没有终止其他程序。');
  console.log('正在停止本便携包的应用与媒体工作进程……');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await sleep(300);
    if (!await probeState(state, expectedPackage)) {
      if (readState(layout.stateFile)?.instanceId === state.instanceId) { try { unlinkSync(layout.stateFile); } catch { /* supervisor already cleaned up */ } }
      console.log('本便携包已停止。'); return;
    }
  }
  throw new Error('停止等待超时，请查看 state/logs/launcher.log；未尝试结束其他程序。');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
