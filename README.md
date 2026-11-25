# 小芽英语 · 本地功能演示

面向小学四、五年级的英语学习辅导 Demo，以新版人教 PEP 上册为主线，串联「提出困惑 → 逐步讲解 → 学生表达 → 一题确认 → 辅导记录」。成绩是目标，理解与运用是路径。使用 Next.js、React、SQLite、本地任务队列和 FFmpeg，默认只监听本机 `127.0.0.1`。

新增两个年级上册共 12 个官方单元目录，各册第一单元各有词汇、句型、阅读三张原创辅导卡；其余单元明确标注教案待补充。教材目录有官方来源，教学正文不是课本原文，不声称逐页覆盖教材。另核验两份新版第一单元第三方教学样卷，展示来源、题型分析和原创平行示例，不转载整卷或冒称学校真卷。

完整计划见 `docs/textbook-tutoring-plan.md`，试卷来源审计见 `docs/exam-source-audit.md`。辅导支持多轮上下文、阶段保存、按学生续接、朗读与自评；离线按原创教案引导，接入 DeepSeek 后可围绕问题展开讲解。辅导自评和单题确认不会计入独立成绩。

原有 6 位演示学生、8 个通用知识点、80 道原创样题、2 本绘本及 12 张 SVG 插图继续用于功能演示。**这批通用检测样题不是新版教材同步题库**，原有记录保留，不会自动变成新版单元成绩。正式教学前需要按实际教材内容与试卷审核题库。

## 启动

当前电脑已安装依赖与 Kokoro 双语模型，可直接双击 `start-demo.cmd`。首次迁移到其他电脑时，再按以下步骤安装。

需要 Node.js 22.13 或更新版本、npm。Windows 环境可使用已安装的 Edge / Chrome 进行视频画面渲染；也可以安装 Playwright Chromium。视频生成需要可用的 FFmpeg、FFprobe 和语音引擎。

在项目目录执行：

```powershell
npm install
Copy-Item .env.example .env.local
npm run check
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。`dev` 同时启动 Next.js 和单并发媒体 worker，退出时按 `Ctrl+C`。不要再额外启动第二个 worker。

生产模式本地预览：

```powershell
npm run build
npm start
```

`start` 同样启动媒体 worker。这里的生产构建只表示 Next.js 优化构建，不代表本项目已具备生产级账户与部署安全措施。

## 无密钥时能体验什么

| 功能                             | 默认本地状态                           | 接入后的行为                             |
| -------------------------------- | -------------------------------------- | ---------------------------------------- |
| 样题练习、批改、错题、测评、报告 | 可用，数据落入 SQLite                  | 不依赖云模型                             |
| AI 助教                          | 明确标记为本地示例讲解                 | 配置 DeepSeek 后进行真实对话             |
| 拍照识题                         | 图片预览、框选裁剪可用；识别提示待配置 | 由 DeepSeek 读取上传图片，返回待核对草稿 |
| 语音输入                         | 可录音；转写提示待配置                 | 录音经本地规范化后提交 DeepSeek ASR      |
| 朗读、板书与绘本视频             | 需要本地语音与媒体运行环境             | Kokoro 在本机合成语音；FFmpeg 生成 MP4   |
| 新绘本插图                       | 使用内置原创 SVG                       | 配置北京地域 DashScope 后生成新图        |
| AI 变式题                        | 提示待配置，内置练习继续可用           | 生成草稿，经过教师审核后纳入正式统计     |

2026-11-18 已用用户提供并仅保存在本机的 DeepSeek 配置完成真实验证：两轮上下文授课（纠正 can 后误加 s）和一张原创练习图片识别。3 次调用按应用保守费率估算约 0.00495 元，实际费用以服务商账单为准；验证记录见 `docs/deepseek-live-validation.json`。千问 qwen-image-2.1-turbo 已于 2026-11-18 通过北京通用接口完成单张插图实测，约 19 秒，按应用费率估算 0.10 元；记录见 docs/qwen-live-validation.json，测试图见 examples/qwen-live-check.png。用户提供的业务空间地址返回 Endpoint.AccessDenied，当前本机配置使用已验证可用的北京通用接口。分发 ZIP 不携带密钥，首次使用仍需配置；本机免安装目录保留用户自己的配置。

界面「已配置」只表示检测到配置值，不是每次请求都能成功的保证。辅导回复逐条标记 AI 或离线教案，云端不可用时会明确提示。缺失密钥不会伪装已识别或已生成。

## 配置真实服务

修改 `.env.local` 后重新启动应用。密钥仅供服务端读取，不要写入浏览器代码或 `NEXT_PUBLIC_*` 变量。

| 配置项                    | 用途                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`        | 对话、图片识题、语音转写、讲解脚本和变式题                     |
| `DEEPSEEK_BASE_URL`       | 默认 `https://api.deepseek.com`                                |
| `DASHSCOPE_API_KEY`       | 北京地域百炼 / DashScope 图片生成密钥                          |
| `QWEN_BASE_URL`           | 默认 `https://dashscope.aliyuncs.com`                          |
| `KOKORO_MODEL_DIR`        | 默认 `data/models/kokoro-multi-lang-v1_1`                      |
| `ALLOW_DEMO_SYSTEM_VOICE` | 默认 `true`；未安装 Kokoro 时允许使用 Windows 已安装的系统语音 |
| `PROJECT_BUDGET_CNY`      | 默认 90 元项目累计可调用额度                                   |
| `PORT`                    | 默认 3000                                                      |
| `DEMO_DB_PATH`            | 默认 `data/local.db`，可指定单独的演示数据库                   |

当前实现的请求模型名为 `deepseek-flash` 和 `qwen-image-2.1-turbo`，本地 TTS 模型为 `kokoro-multi-lang-v1_1`。替换模型时需要核对供应商接口与费用计算，并修改服务端实现；没有未实现的模型切换配置项。

## 安装本地双语语音

```powershell
npm run setup:voice
npm run check
```

脚本从 sherpa-onnx 的发布地址下载数百 MB 的 Kokoro 双语模型，校验归档路径后解压到 `data/models/kokoro-multi-lang-v1_1`，生成安装来源与 SHA-256 记录。下载需要网络和系统 `tar`；本地推理不收取 API 费用。完成后重启服务。

若已有可信的归档 SHA-256，可以先在 shell 设置 `KOKORO_ARCHIVE_SHA256`，再运行安装命令；仅记录下载后的摘要不构成对发布者的独立校验。安装脚本本身不读取 `.env.local`。若手动安装到其他目录，用 `KOKORO_MODEL_DIR` 指向它。

未安装模型时，Windows 可尝试已安装的中文 / 英文 `System.Speech` 语音；生成结果明确标记 `demo-system-voice`，不能当作 Kokoro 验收结果。非 Windows 环境需要先安装 Kokoro。可将 `ALLOW_DEMO_SYSTEM_VOICE=false` 关闭演示回退。

如果检查提示没有渲染浏览器，可在 PowerShell 执行：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/data/browsers"
npx playwright install chromium
```

## 建议演示顺序

1. 选择学生与年级，观察样例学习记录及明确的样例标记。
2. 完成 8 题独立前测。测评进行时，后端禁止练习、答案讲解、助教与媒体等辅助入口；退出测评后才能恢复。
3. 进入专项练习，尝试选择题、填空题、三步讲解与朗读。使用提示后的作答与独立首答分别记录。
4. 上传 1—3 张 JPG / PNG / WebP，每张不超过 10 MiB。可拖动框选一道题，也可按像素调整；裁剪保留原始分辨率并导出 PNG，超过 10 MiB 时需缩小选区。图片只在提交识别后发送到服务端及配置的模型服务。
5. 核对识别出的题干、选项与答案，保存为待审核题。切换教师视角后审核；未审核结果暂不计入正式统计。
6. 播放绘本、回答阅读问题，生成讲解或绘本 MP4。在任务列表观察排队、进度、失败提示和重试。
7. 完成后测，再完成延迟测，查看独立成绩变化、知识点与错题复习报告。

每个年级包含前测 8 题、练习 16 题、后测 8 题、延迟测 8 题；各阶段覆盖相同四个知识点，题目不同。测评按前测、后测、延迟测顺序开放，同一阶段不能反复重考。**Demo 不强制等待真实的延迟天数**，正式使用时应由机构确定施测间隔。单次样本的分数变化不等于已验证教学效果。

错题独立订正后，第 1 / 3 / 7 天安排复习；独立首答、提示后作答与样例数据分别统计。界面中的学习分钟数是由答题量估算的值，不是后台精确计时。内置种子记录用于展示页面，不计作真实独立学习证据。

## 任务、预算与存储

- `data/local.db`：学生作答、题目版本、审核记录、测评、错题、队列和用量账本。
- `data/media`：可播放的 WAV / MP4 / 图片及归属元数据；通过 `/api/media/...` 提供访问和视频分段请求。
- `data/cache`：模型响应、已完成任务阶段与临时缓存。转写原始录音和规范化临时 WAV 在处理后删除。
- `data/models`：本地语音模型；`data/browsers`：可选 Playwright 浏览器。

队列由单个本地 worker 顺序消费。中断任务启动时恢复；重试复用已有阶段。云请求超时、响应不明确时保留预算和请求状态，避免盲目重复扣费；这类失败需先核对服务商记录。不要在核对前删除用量数据库或对应请求缓存。

默认预算为文字及图片理解 80 元、ASR 5 元、图片生成 5 元，另预留 10 元作为项目计费差额。后端在请求前预留费用，达到累计或分类上限时拒绝新付费请求。当前预估费率写在代码中；实际账单、服务商价格变化及账户级消费限制仍以服务商控制台为准。

## 本地身份与交付边界

学生 / 教师切换是演示用角色选择器，cookie **没有实现生产级签名账户认证**。接口包含角色、学生归属与测评状态检查，但能操作本机环境的人也能切换角色。默认仅限本机访问，不应直接部署给真实儿童或公开互联网使用。

机构部署需要另行完成正式身份权限与数据方案。拍照题、模型变式题和答案需教师审核；六位示例学生均为虚构身份。

## 开发命令与接口

| 命令                  | 行为                                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`         | 启动本地开发服务与 worker                                                    |
| `npm run build`       | 执行 Next.js 构建                                                            |
| `npm start`           | 启动已构建应用与 worker                                                      |
| `npm test`            | 运行 `tests/*.test.ts` 的 Node 测试                                          |
| `npm run typecheck`   | TypeScript 静态检查                                                          |
| `npm run check`       | 检查 Node、SQLite、FFmpeg、浏览器、语音运行时和配置状态；不发起付费 API 调用 |
| `npm run setup:voice` | 下载并安装本地 Kokoro 模型                                                   |
| `npm run worker`      | 单独启动 worker，适合自行分别管理服务进程的开发者                            |

主要接口定义在 `app/api/[...path]/route.ts`：

| 接口                                                                  | 用途                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/session`、`GET /api/bootstrap`                             | 切换演示身份、读取启动数据                              |
| `GET /api/questions`、`POST /api/attempts`                            | 获取练习题、提交作答                                    |
| `GET /api/mistakes`、`GET /api/reports`                               | 错题与学习报告                                          |
| `GET/POST /api/assessments`、`POST/DELETE /api/assessments/:id`       | 测评状态、开始、提交与取消                              |
| `POST /api/imports`                                                   | 表单 `images` 多图上传识题，也兼容单图 `image` / `file` |
| `POST /api/questions/confirm`、`POST /api/teacher/review`             | 保存待核对题、教师审核                                  |
| `POST /api/tutor`、`POST /api/asr`、`POST /api/tts`                   | 助教、语音转写、朗读                                    |
| `GET/POST /api/jobs`、`GET /api/jobs/:id`、`POST /api/jobs/:id/retry` | 任务创建、状态和重试                                    |
| `GET/HEAD /api/media/:file`                                           | 带学生归属检查的媒体与 Range 请求                       |
| `POST /api/story-quiz`、`GET /api/health`                             | 绘本练习与本地健康状态                                  |

若媒体任务一直排队，检查启动终端中是否显示 `Local media worker ready`。若模型显示待配置，核对 `.env.local` 后重启。若朗读失败，运行 `npm run check` 并安装双语模型；若识别返回不完整题目，重新拍摄清晰区域，不要直接发布猜测答案。

## 本机验收记录（2026-11-18）

22 项自动测试与 TypeScript 检查通过；浏览器完成了真实 Kokoro 板书生成。`examples/` 中的四年级绘本、五年级绘本和 `board-kokoro.mp4` 均使用本地 Kokoro 真实语音，FFprobe 验证为 1280×720 H.264 视频及 AAC 音轨。板书时长 18.706 秒，本次任务从创建到完成耗时 56.023 秒；完整来源和时间记录见 `examples/manifest.json`。另保留明确标注 Windows 示例语音的板书对照版本。

`npm run build` 通过。浏览器验证了练习批改、自动错题记录、八题前测提交（7/8）、刷新恢复未提交答案、阅读理解提交及报告保存、学生切换与 768 像素平板布局。预览截图见 `examples/home-preview.jpg` 和 `examples/report-tablet.jpg`。随交付保留的上述作答来自虚构学生的开发验收，不是真实儿童成绩。图片选择器自动化中断，因此图片裁剪尚未完成浏览器端到端验收。

本机未配置 DeepSeek / DashScope 密钥，因此云端聊天、识图、ASR 和 Qwen 出图未做真实联网验收；其接口格式、预算与重试行为使用模拟响应测试，不能视作云端效果验证。
