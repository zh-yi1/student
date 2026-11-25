import { NextRequest, NextResponse } from 'next/server';
import { allQuestions, budget, canAccessQuestion, createJob, getJob, getQuestion, listJobs, skills, stories, students, updateJob } from '@/lib/db';
import { activeAssessment, ApiError, assessmentHistory, cancelAssessment, confirmQuestion, dashboard, getStudent, mistakes, practiceQuestions, report, requireNoAssessment, startAssessment, submitAssessment, submitAttempt, submitStoryQuiz, teacherDashboard, teacherReview } from '@/lib/learning';
import { chatWithTutor, recognizeImage, transcribeAudio, narrateAnimatedLesson } from '@/lib/ai';
import { originalAnimatedLesson } from '@/lib/animated-lessons';
import { readPreparedLesson, preparedLessonRoot } from '@/lib/prepared-lessons';
import nodePath from 'node:path';
import { cachedSpeech, getMediaResponse, getSystemStatus } from '@/lib/media';
import type { JobKind, Session } from '@/lib/types';
import { completeCoaching, getCoaching, listCoaching, sendCoaching, startCoaching, validateDraftSkill } from '@/lib/tutoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cookieName = 'localdemo';
type Context = { params: Promise<{ path: string[] }> };

function session(request: NextRequest): Session {
  try {
    const raw = request.cookies.get(cookieName)?.value;
    if (raw) {
      const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (students.some(student => student.id === decoded.studentId) && (decoded.role === 'student' || decoded.role === 'teacher')) return decoded;
    }
  } catch { /* Invalid local selector resets to the first demo learner. */ }
  return { studentId: 's1', role: 'student' };
}
function teacherOnly(current: Session) { if (current.role !== 'teacher') throw new ApiError('请先切换到老师视角。此功能只供演示老师使用。', 403); }
async function bodyOf(request: NextRequest): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') || 0) > 100000) throw new ApiError('请求内容过大', 413);
  try { const body = await request.json(); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; }
  catch { throw new ApiError('请求格式无效'); }
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
function errorResponse(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : '处理失败，请重试';
  if (status >= 500) console.error('[api]', message);
  return json({ error: status >= 500 ? `服务暂时未完成请求：${message}` : message }, status >= 400 && status <= 599 ? status : 500);
}
function practiceQuestionFor(studentId: string, id: unknown) {
  if (typeof id !== 'string') return undefined;
  const question = getQuestion(id);
  if (!question || question.grade !== getStudent(studentId).grade || question.phase !== 'practice' || !canAccessQuestion(studentId, question.id)) throw new ApiError('当前学生不可访问该练习题', 404);
  return question;
}

async function handle(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const resource = path[0], id = path[1];
    const method = request.method;
    const current = session(request);
    const student = getStudent(current.studentId);

    if (resource === 'session' && method === 'POST') {
      const body = await bodyOf(request);
      getStudent(String(body.studentId));
      if (body.role !== 'teacher' && body.role !== 'student') throw new ApiError('角色无效');
      const next: Session = { studentId: String(body.studentId), role: body.role };
      const response = json({ ...next, student: getStudent(next.studentId) });
      response.cookies.set(cookieName, Buffer.from(JSON.stringify(next)).toString('base64url'), { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30, secure: request.nextUrl.protocol === 'https:' });
      return response;
    }
    if (resource === 'bootstrap' && method === 'GET') {
      const status = await getSystemStatus();
      return json({ students, skills, stories: stories.filter(story => story.grade === student.grade).map(story => ({ ...story, questions: story.questions.map(({ answer: _answer, ...question }) => question) })), student, role: current.role, mode: status.deepseek && status.qwen ? 'live' : 'demo', status, budget: budget.summary(), localDemo: true });
    }
    if (resource === 'dashboard' && method === 'GET') return json(dashboard(current.studentId));
    if (resource === 'questions' && id === 'confirm' && method === 'POST') {
      const body = await bodyOf(request); validateDraftSkill(current.studentId,body);
      return json(confirmQuestion(current.studentId, body), 201);
    }
    if (resource === 'questions' && method === 'GET') {
      if (request.nextUrl.searchParams.get('phase') && request.nextUrl.searchParams.get('phase') !== 'practice') throw new ApiError('请通过测评入口获取试卷', 403);
      return json({ questions: practiceQuestions(current.studentId, request.nextUrl.searchParams.get('skillId') || undefined) });
    }
    if (resource === 'attempts' && method === 'POST') return json(submitAttempt(current.studentId, await bodyOf(request)), 201);
    if (resource === 'mistakes' && method === 'GET') return json(mistakes(current.studentId));
    if (resource === 'assessments') {
      if (method === 'GET' && !id) return json({ active: activeAssessment(current.studentId), history: assessmentHistory(current.studentId) });
      if (method === 'POST' && !id) return json(startAssessment(current.studentId, (await bodyOf(request)).phase), 201);
      if (method === 'POST' && id) return json(submitAssessment(current.studentId, id, (await bodyOf(request)).answers));
      if (method === 'DELETE' && id) return json(cancelAssessment(current.studentId, id));
    }
    if (resource === 'reports' && method === 'GET') {
      const target = request.nextUrl.searchParams.get('studentId') || current.studentId;
      if (target !== current.studentId) teacherOnly(current);
      return json(report(target, current.role === 'teacher'));
    }
    if (resource === 'teacher') {
      teacherOnly(current);
      if (method === 'GET' && !id) return json(teacherDashboard());
      if (method === 'POST' && id === 'review') return json(teacherReview(await bodyOf(request)));
    }
    if (resource === 'tutor' && method === 'POST') {
      requireNoAssessment(current.studentId);
      const body = await bodyOf(request);
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) throw new ApiError('请输入 1—2000 字的问题');
      const question = practiceQuestionFor(current.studentId, body.questionId);
      return json(await chatWithTutor(current.studentId, body.message, question));
    }
    if (resource === 'coaching') {
      if (method === 'GET') {
        const coachingId = request.nextUrl.searchParams.get('id');
        return json(coachingId ? { session: getCoaching(current.studentId,coachingId) } : { sessions: listCoaching(current.studentId) });
      }
      if (method === 'POST') {
        const body = await bodyOf(request);
        if (body.action === 'start') return json({ session: await startCoaching(current.studentId,body) },201);
        if (body.action === 'send') return json({ session: await sendCoaching(current.studentId,body) });
        if (body.action === 'complete') return json({ session: completeCoaching(current.studentId,body) });
        throw new ApiError('辅导操作无效');
      }
    }
    if (resource === 'imports' && method === 'POST') {
      requireNoAssessment(current.studentId);
      if (Number(request.headers.get('content-length') || 0) > 32 * 1024 * 1024) throw new ApiError('最多上传 3 张图片，每张不超过 10 MB', 413);
      const form = await request.formData();
      const attached = form.getAll('images');
      const files = attached.length ? attached : [form.get('image') || form.get('file')];
      if (!files.length || files.length > 3 || files.some(file => !(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0)) throw new ApiError('请选择 1—3 张 JPEG、PNG 或 WebP 图片，每张不超过 10 MB');
      return json(await recognizeImage(current.studentId, files as File[]));
    }
    if (resource === 'asr' && method === 'POST') {
      requireNoAssessment(current.studentId);
      if (Number(request.headers.get('content-length') || 0) > 21 * 1024 * 1024) throw new ApiError('录音请小于 20 MB', 413);
      const form = await request.formData(); const file = form.get('audio') || form.get('file');
      if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new ApiError('请选择小于 20 MB 的录音');
      return json(await transcribeAudio(current.studentId, file));
    }
    if (resource === 'animated-lesson' && method === 'POST') {
      requireNoAssessment(current.studentId);
      const body = await bodyOf(request);
      let lesson;
      try { lesson = originalAnimatedLesson(student.grade, String(body.bookId), String(body.unitId), String(body.mode)); }
      catch (error) { throw new ApiError((error as Error).message, 400); }
      const prepared = readPreparedLesson(lesson);
      return json({ lesson: prepared || await narrateAnimatedLesson(current.studentId, lesson), prepared: Boolean(prepared) });
    }
    if (resource === 'tts' && method === 'POST') {
      requireNoAssessment(current.studentId);
      const body = await bodyOf(request);
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) throw new ApiError('朗读文本应为 1—2000 字');
      const cached = cachedSpeech(current.studentId, body.text);
      if (cached) return json(cached);
      const active = listJobs(current.studentId).filter(job => job.status === 'queued' || job.status === 'running');
      const pending = active.find(job => job.kind === 'tts' && String(job.input.text).trim() === String(body.text).trim());
      if (!pending && active.length >= 4) throw new ApiError('请等待现有任务完成后继续生成', 429);
      const created = pending || createJob(current.studentId, 'tts', { text: body.text.trim() });
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const job = getJob(created.id)!;
        if (job.status === 'completed') return json(job.result);
        if (job.status === 'failed') throw new ApiError(job.error || '语音生成失败', 503);
      }
      return json({ job: getJob(created.id) }, 202);
    }
    if (resource === 'jobs') {
      requireNoAssessment(current.studentId);
      if (method === 'GET' && !id) return json({ jobs: listJobs(current.studentId) });
      if (method === 'GET' && id) {
        const job = getJob(id);
        if (!job || job.studentId !== current.studentId) throw new ApiError('任务不存在', 404);
        return json({ job });
      }
      if (method === 'POST' && id && path[2] === 'retry') {
        const job = getJob(id);
        if (!job || job.studentId !== current.studentId) throw new ApiError('任务不存在', 404);
        if (job.status !== 'failed') throw new ApiError('只有失败的任务可以重试', 409);
        return json({ job: updateJob(id, { status: 'queued', progress: 0, error: null, message: '已重新加入队列，将复用完成的阶段' }) }, 202);
      }
      if (method === 'POST' && !id) {
        const body = await bodyOf(request);
        const kinds: JobKind[] = ['board', 'story', 'tts', 'explanation', 'variants', 'illustrations'];
        if (!kinds.includes(body.kind as JobKind)) throw new ApiError('任务类型无效');
        const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input as Record<string, unknown> : {};
        if (input.questionId) practiceQuestionFor(current.studentId, input.questionId);
        if ((body.kind === 'board' || body.kind === 'variants' || body.kind === 'explanation') && !input.questionId) throw new ApiError('请先选择练习题');
        if (input.storyId && !stories.some(story => story.id === input.storyId && story.grade === student.grade)) throw new ApiError('绘本不存在', 404);
        if (listJobs(current.studentId).filter(job => job.status === 'queued' || job.status === 'running').length >= 4) throw new ApiError('请等待现有任务完成后继续生成', 429);
        return json({ job: createJob(current.studentId, body.kind as JobKind, input) }, 202);
      }
    }
    if (resource === 'lesson-audio' && (method === 'GET' || method === 'HEAD') && id) {
      requireNoAssessment(current.studentId);
      if (!new RegExp(`^lesson-${student.grade}-[a-f0-9]{32}\\.wav$`).test(id)) throw new ApiError('课程音频不存在',404);
      return await getMediaResponse(id, request, 'sample', nodePath.join(preparedLessonRoot(),'audio'));
    }
    if (resource === 'media' && (method === 'GET' || method === 'HEAD') && id) {
      requireNoAssessment(current.studentId);
      return await getMediaResponse(id, request, current.studentId);
    }
    if (resource === 'story-quiz' && method === 'POST') {
      return json(submitStoryQuiz(current.studentId, await bodyOf(request)), 201);
    }
    if (resource === 'health' && method === 'GET') return json({ ok: true, status: await getSystemStatus(), questionCount: allQuestions().length, portableInstanceId: process.env.PORTABLE_INSTANCE_ID || null, portablePackageId: process.env.PORTABLE_PACKAGE_ID || null });
    throw new ApiError('接口不存在', 404);
  } catch (error) { return errorResponse(error); }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const HEAD = handle;
