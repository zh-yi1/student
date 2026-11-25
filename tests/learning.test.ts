import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allQuestions, budget, claimNextJob, closeDb, createJob, getDb, getJob, getQuestion, listJobs, saveQuestionVersion, stories, updateJob } from '../lib/db';
import { activeAssessment, assessmentHistory, cancelAssessment, confirmQuestion, dashboard, gradeAnswer, mistakes, normalizeAnswer, practiceQuestions, publicQuestion, readingSummary, report, requireNoAssessment, startAssessment, submitAssessment, submitAttempt, submitStoryQuiz, teacherDashboard, teacherReview } from '../lib/learning';
import type { Question } from '../lib/types';

const directory = mkdtempSync(join(tmpdir(), 'sprout-learning-test-'));
process.env.DEMO_DB_PATH = join(directory, 'test.db');
after(() => { closeDb(); rmSync(directory, { recursive: true, force: true }); });

function example(id: string, overrides: Partial<Question> = {}) {
  return saveQuestionVersion({ id, version: 1, grade: 4, unit: 'Test', text: 'The book ___ on the desk.', type: 'choice', options: ['is', 'are'], answer: 'is', alternatives: [], explanation: 'One book takes is.', steps: ['Find the subject.', 'Choose is.'], skillId: 'g4-location', phase: 'practice', source: 'generated', approved: true, ...overrides });
}
function attempt(question: Question, answer: string, assisted = false, studentId = 's1') { return submitAttempt(studentId, { questionId: question.id, version: question.version, answer, assisted, phase: 'practice' }); }

test('grading normalizes whitespace/case/apostrophes without accepting wrong words', () => {
  const question = example('test-normalize', { answer: "isn't", alternatives: ['is not'] });
  assert.equal(gradeAnswer(question, '  ISN’T.  '), true);
  assert.equal(gradeAnswer(question, 'is not'), true);
  assert.equal(gradeAnswer(question, 'is'), false);
  assert.equal(gradeAnswer(question, ''), false);
  assert.equal(gradeAnswer({ ...question, answer: 'English', alternatives: [], caseSensitive: true }, 'english'), false);
  assert.equal(normalizeAnswer('  two   books! '), 'two books');
});

test('public question projection removes every grading secret', () => {
  const safe = publicQuestion(example('test-projection'));
  for (const key of ['answer', 'alternatives', 'explanation', 'steps']) assert.equal(key in safe, false);
  assert.equal(safe.text, 'The book ___ on the desk.');
});

test('wrong answers create reviews; assisted answers do not advance 1/3/7 day review', () => {
  const question = example('test-review');
  const feedback = attempt(question, 'are');
  assert.equal(feedback.correct, false);
  assert.equal(feedback.attempt.sample, false);
  let review = mistakes('s1').mistakes.find(item => item.question.id === question.id)!;
  assert.equal(review.stage, 0);
  assert.equal(review.corrected, false);
  assert.ok(Date.parse(review.dueAt) - Date.now() > 23 * 3600000);
  attempt(question, 'is', true);
  assert.equal(mistakes('s1').mistakes.find(item => item.question.id === question.id)!.stage, 0);
  assert.equal(mistakes('s1').mistakes.find(item => item.question.id === question.id)!.corrected, false);
  attempt(question, 'is');
  const corrected = mistakes('s1').mistakes.find(item => item.question.id === question.id)!;
  assert.equal(corrected.stage, 0, 'early practice cannot clear a spaced review');
  assert.equal(corrected.corrected, true, 'independent correction is recorded immediately');
  assert.equal(Date.parse(corrected.dueAt) - Date.parse(corrected.correctedAt!), 86400000);
  const makeDue = () => getDb().prepare('UPDATE reviews SET due_at=? WHERE student_id=? AND question_id=?').run(new Date(Date.now() - 1000).toISOString(), 's1', question.id);
  makeDue();
  attempt(question, 'is');
  review = mistakes('s1').mistakes.find(item => item.question.id === question.id)!;
  assert.equal(review.stage, 1);
  assert.equal(Date.parse(review.dueAt) - Date.parse(review.correctedAt!), 3 * 86400000);
  assert.ok(Date.parse(review.dueAt) - Date.now() > 71 * 3600000);
  makeDue();
  attempt(question, 'is');
  review = mistakes('s1').mistakes.find(item => item.question.id === question.id)!;
  assert.equal(review.stage, 2);
  assert.equal(Date.parse(review.dueAt) - Date.parse(review.correctedAt!), 7 * 86400000);
  assert.ok(Date.parse(review.dueAt) - Date.now() > 167 * 3600000);
  makeDue();
  attempt(question, 'is');
  assert.equal(mistakes('s1').mistakes.find(item => item.question.id === question.id)!.resolved, true);
});

test('review dates remain anchored to correction rather than accumulating 1+3+7 days', () => {
  const question = example('test-review-anchor');
  attempt(question, 'are');
  attempt(question, 'is');
  const anchor = new Date(Date.now() - 2 * 86400000).toISOString();
  getDb().prepare('UPDATE reviews SET corrected_at=?,due_at=? WHERE student_id=? AND question_id=?').run(anchor, new Date(Date.now() - 86400000).toISOString(), 's1', question.id);
  attempt(question, 'is');
  const review = mistakes('s1').mistakes.find(item => item.question.id === question.id)!;
  assert.equal(review.stage, 1);
  assert.equal(Date.parse(review.dueAt), Date.parse(anchor) + 3 * 86400000);
  assert.ok(Date.parse(review.dueAt) - Date.now() < 25 * 3600000);
  attempt(question, 'are');
  assert.equal(mistakes('s1').mistakes.find(item => item.question.id === question.id)!.correctedAt, null, 'a new error requires a new independent correction');
});

test('photo answers stay provisional, teacher revision preserves raw attempts and recomputes metrics', () => {
  const baseline = dashboard('s1').stats.answered;
  const confirmed = confirmQuestion('s1', { draft: { grade: 4, type: 'choice', text: 'They ___ helpful.', options: ['is', 'are'], answer: 'is', skillId: 'g4-location' } });
  const question = getQuestion(confirmed.question.id)!;
  const feedback = attempt(question, 'are');
  assert.equal(feedback.provisional, true);
  assert.equal(dashboard('s1').stats.answered, baseline);
  assert.equal(mistakes('s1').mistakes.some(item => item.question.id === question.id), false);
  const reviewed = teacherReview({ questionId: question.id, approved: true, answer: 'are' }).question;
  assert.equal(reviewed.version, 2);
  assert.equal(getQuestion(question.id, 1)!.answer, 'is');
  assert.equal(dashboard('s1').stats.answered, baseline + 1);
  assert.equal(dashboard('s1').recent.find(item => item.id === feedback.attempt.id)!.correct, true);
  assert.equal(getDb().prepare('SELECT correct FROM attempts WHERE id=?').get(feedback.attempt.id)!.correct, 0);
  assert.throws(() => attempt(question, 'are'), /修订/);
  teacherReview({ questionId: question.id, approved: true, answer: 'is' });
  assert.equal(dashboard('s1').recent.find(item => item.id === feedback.attempt.id)!.correct, false);
  assert.equal(mistakes('s1').mistakes.some(item => item.question.id === question.id), true);
});

test('student attempts and imported questions are isolated', () => {
  const baseline = dashboard('s2').stats.answered;
  const question = example('test-isolation');
  attempt(question, 'are', false, 's1');
  assert.equal(dashboard('s2').stats.answered, baseline);
  assert.equal(mistakes('s2').mistakes.some(item => item.question.id === question.id), false);
  const imported = allQuestions().find(q => q.id.startsWith('photo-'))!;
  assert.equal(practiceQuestions('s2').some(q => q.id === imported.id), false);
  assert.throws(() => attempt(imported, 'is', false, 's2'), /不存在/);
  assert.throws(() => confirmQuestion('s2', { questionId: imported.id, draft: imported }), /其他学生/);
  assert.ok(dashboard('s2').stats.sampleCount > 0);
});

test('independent metrics count only first real attempts, excluding hinted attempts and all retries', () => {
  const baseline = dashboard('s2');
  const question = example('test-first-independent');
  attempt(question, 'are', false, 's2');
  attempt(question, 'is', false, 's2');
  const hinted = example('test-first-hinted');
  attempt(hinted, 'is', true, 's2');
  attempt(hinted, 'is', false, 's2');
  const current = dashboard('s2');
  assert.equal(current.stats.answered, baseline.stats.answered + 4);
  assert.equal(current.stats.independentCount, baseline.stats.independentCount + 1);
  assert.equal(current.stats.independentCorrect, baseline.stats.independentCorrect);
  const skillBefore = baseline.skills.find(skill => skill.id === question.skillId)!;
  const skillAfter = current.skills.find(skill => skill.id === question.skillId)!;
  assert.equal(skillAfter.independentCount, skillBefore.independentCount + 1);
  assert.equal(skillAfter.independentCorrect, skillBefore.independentCorrect);
});

test('assessment hides keys until final submission and locks tutoring/practice', () => {
  const assessment = startAssessment('s1', 'pre');
  assert.ok(assessment.questions.length > 0);
  for (const question of assessment.questions) {
    assert.equal('answer' in question, false);
    assert.equal('steps' in question, false);
    assert.equal('explanation' in question, false);
  }
  assert.equal(activeAssessment('s1')!.id, assessment.id);
  assert.throws(() => requireNoAssessment('s1'), /测评进行中/);
  assert.throws(() => practiceQuestions('s1'), /测评进行中/);
  assert.throws(() => mistakes('s1'), /测评进行中/);
  assert.throws(() => attempt(getQuestion('test-review')!, 'is'), /测评进行中/);
  assert.throws(() => submitAssessment('s2', assessment.id, []), /不存在/);
  assert.throws(() => submitAssessment('s1', assessment.id, []), /全部题目/);
  const answers = assessment.questions.map(q => ({ questionId: q.id, answer: getQuestion(q.id, q.version)!.answer }));
  const result = submitAssessment('s1', assessment.id, answers);
  assert.equal(result.score, result.total);
  assert.ok(result.results.every(row => typeof row.answer === 'string' && row.explanation));
  assert.equal(activeAssessment('s1'), null);
  assert.equal(assessmentHistory('s1').find(item => item.phase === 'pre')!.score, result.total);
  assert.throws(() => submitAssessment('s1', assessment.id, answers), /已提交/);
  assert.throws(() => startAssessment('s1', 'pre'), /已完成/);
  assert.equal(assessmentHistory('s2').length, 0);
});

test('cancelled assessments unlock practice and cannot be submitted', () => {
  const assessment = startAssessment('s2', 'pre');
  assert.throws(() => cancelAssessment('s1', assessment.id), /未找到/);
  assert.equal(cancelAssessment('s2', assessment.id).cancelled, true);
  assert.equal(activeAssessment('s2'), null);
  assert.ok(practiceQuestions('s2').length > 0);
  assert.throws(() => submitAssessment('s2', assessment.id, []), /不存在/);
});

test('exam mistakes create private review copies without duplicating attempts or changing score denominators', () => {
  const baseline = dashboard('s3').stats.answered;
  const independentBefore = dashboard('s3').stats.independentCount;
  const assessment = startAssessment('s3', 'pre');
  const answers = assessment.questions.map(question => ({ questionId: question.id, answer: question.options.find(option => !gradeAnswer(getQuestion(question.id, question.version)!, option)) || 'unmatched response' }));
  const result = submitAssessment('s3', assessment.id, answers);
  assert.equal(result.score, 0);
  assert.equal(dashboard('s3').stats.answered, baseline + result.total);
  const reviews = mistakes('s3').mistakes.filter(item => item.sourceAssessment?.id === assessment.id);
  assert.equal(reviews.length, result.total);
  for (const review of reviews) {
    assert.equal(review.question.phase, 'practice');
    assert.equal(review.attempt.phase, 'pre');
    assert.equal(review.attempt.sample, false);
    assert.equal(review.sourceAssessment!.version, review.attempt.version);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM attempts WHERE question_id=?').get(review.question.id)!.count, 0);
    assert.equal(practiceQuestions('s2').some(question => question.id === review.question.id), false);
    assert.throws(() => attempt(getQuestion(review.question.id)!, review.answer, false, 's2'), /不存在/);
  }
  const first = reviews[0];
  const copied = getQuestion(first.question.id)!;
  attempt(copied, copied.answer, false, 's3');
  assert.equal(dashboard('s3').stats.answered, baseline + result.total + 1);
  assert.equal(dashboard('s3').stats.independentCount, independentBefore + result.total, 'review copies cannot inflate the independent first-attempt denominator');
  assert.equal(assessmentHistory('s3')[0].score, 0, 'review practice must not alter the exam score');
  assert.equal(assessmentHistory('s3')[0].total, result.total);
  const sourceId = first.sourceAssessment!.questionId;
  const oldVersion = first.sourceAssessment!.version;
  const oldKey = getQuestion(sourceId, oldVersion)!.answer;
  teacherReview({ questionId: sourceId, answer: first.attempt.answer, approved: true });
  assert.equal(getQuestion(sourceId, oldVersion)!.answer, oldKey, 'the assigned exam version stays immutable');
  assert.equal(getQuestion(first.question.id)!.answer, first.attempt.answer, 'linked review key follows approved corrections');
  assert.equal(assessmentHistory('s3')[0].score, 1);
  assert.equal(getDb().prepare('SELECT correct FROM attempts WHERE id=?').get(first.attempt.id)!.correct, 0, 'original grade is preserved');
  assert.equal(mistakes('s3').mistakes.some(review => review.attempt.id === first.attempt.id), false, 'an overturned exam error is removed from the wrongbook');
});

test('reading quiz answers persist privately and remain separate from formal question metrics', () => {
  const story = stories.find(item => item.grade === 4)!;
  const before = dashboard('s2').stats;
  const answers = story.questions.map((question, index) => index === 0 ? question.answer : 'wrong answer');
  const result = submitStoryQuiz('s2', { storyId: story.id, answers });
  assert.ok(result.attemptId);
  assert.equal(result.score, 1);
  assert.equal(result.practiceOnly, true);
  const reading = readingSummary('s2');
  assert.equal(reading.attempts, 1);
  assert.equal(reading.correct, 1);
  assert.equal(reading.total, story.questions.length);
  assert.deepEqual(reading.history[0].answers, answers);
  assert.equal(readingSummary('s1').attempts, 0);
  assert.equal(report('s2').reading.history[0].id, result.attemptId);
  assert.equal(teacherDashboard().students.find(student => student.id === 's2')!.reading.attempts, 1);
  assert.equal(dashboard('s2').stats.answered, before.answered);
  assert.equal(dashboard('s2').stats.independentCount, before.independentCount);
  assert.throws(() => submitStoryQuiz('s4', { storyId: story.id, answers }), /完成绘本/);
  const active = startAssessment('s2', 'pre');
  assert.throws(() => submitStoryQuiz('s2', { storyId: story.id, answers }), /测评进行中/);
  cancelAssessment('s2', active.id);
});

test('budget reservations enforce project/category caps and settle once', () => {
  const reservation = budget.reserve('s1', 'images', 4);
  assert.equal(budget.summary().categories.images.reserved, 4);
  assert.throws(() => budget.reserve('s2', 'images', 2), /预算不足/);
  budget.settle(reservation, 3);
  assert.equal(budget.summary().categories.images.spent, 3);
  assert.equal(budget.summary().categories.images.reserved, 0);
  assert.throws(() => budget.settle(reservation, 3), /已结算/);
  const pending = budget.reserve('s2', 'text', 80);
  assert.throws(() => budget.reserve('s1', 'text', 0.01), /预算不足/);
  budget.release(pending);
  assert.equal(budget.summary().remaining, 87);
  assert.equal(budget.summary().reserve, 10);
  assert.throws(() => budget.reserve('s1', 'images', -1), /无效/);
});

test('job queue persists ownership, claims atomically and stores completion', () => {
  const a = createJob('s1', 'board', { questionId: 'test-review' });
  const b = createJob('s2', 'tts', { text: 'Hello.' });
  assert.equal(listJobs('s1').some(job => job.id === b.id), false);
  assert.equal(claimNextJob()!.id, b.id); // Narration takes priority over waiting video tasks.
  assert.equal(claimNextJob()!.id, a.id);
  assert.equal(claimNextJob(), undefined);
  updateJob(a.id, { status: 'completed', progress: 100, result: { url: '/api/media/example.mp4' } });
  assert.equal(getJob(a.id)!.result!.url, '/api/media/example.mp4');
});
