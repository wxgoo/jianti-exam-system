/**
 * 学习记录业务逻辑：学生做题/考试记录、错题复习记录
 */

import { getSqlite } from "../db";
import { now } from "./server";
import { addWrongRecord } from "./wrong-book";

export type LearningRecord = {
  id: string;
  ownerId: string;
  studentId: string | null;
  sessionId: string | null;
  questionId: string;
  answer: string;
  isCorrect: boolean;
  score: number;
  timeSpentMs: number;
  sourceType: "practice" | "exam" | "wrong_review";
  attemptedAt: string;
};

export type RecordAttemptInput = {
  studentId?: string;
  sessionId?: string;
  questionId: string;
  answer: string;
  isCorrect: boolean;
  score: number;
  timeSpentMs?: number;
  sourceType?: "practice" | "exam" | "wrong_review";
};

export function recordAttempt(ownerId: string, input: RecordAttemptInput) {
  const sqlite = getSqlite();
  const timestamp = now();
  const id = crypto.randomUUID();

  sqlite.prepare(
    `INSERT INTO learning_records (id, owner_id, student_id, session_id, question_id, answer,
      is_correct, score, time_spent_ms, source_type, attempted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ownerId,
    input.studentId ?? null,
    input.sessionId ?? null,
    input.questionId,
    input.answer,
    input.isCorrect ? 1 : 0,
    input.score,
    input.timeSpentMs ?? 0,
    input.sourceType ?? "practice",
    timestamp,
  );

  // 如果答错，自动写入错题本
  if (!input.isCorrect) {
    addWrongRecord(ownerId, {
      studentId: input.studentId,
      questionId: input.questionId,
      sourceType: input.sourceType ?? "practice",
      sourceId: input.sessionId,
      userAnswer: input.answer,
      correctAnswer: "",
      wrongReason: "答错",
    });
  }

  return { id } as const;
}

export function listLearningRecords(
  ownerId: string,
  options: { studentId?: string; sessionId?: string; sourceType?: string; limit?: number } = {},
) {
  const sqlite = getSqlite();
  let sql = `
    SELECT lr.*, q.stem, q.type, q.answer AS correctAnswer, q.analysis
    FROM learning_records lr
    JOIN questions q ON q.id = lr.question_id
    WHERE lr.owner_id = ?
  `;
  const params: unknown[] = [ownerId];

  if (options.studentId) {
    sql += ` AND lr.student_id = ?`;
    params.push(options.studentId);
  }
  if (options.sessionId) {
    sql += ` AND lr.session_id = ?`;
    params.push(options.sessionId);
  }
  if (options.sourceType) {
    sql += ` AND lr.source_type = ?`;
    params.push(options.sourceType);
  }
  sql += ` ORDER BY lr.attempted_at DESC`;
  if (options.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }

  return sqlite.prepare(sql).all(...params) as Array<LearningRecord & {
    stem: string;
    type: string;
    correctAnswer: string;
    analysis: string;
  }>;
}

export function getStudentStats(ownerId: string, studentId?: string) {
  const sqlite = getSqlite();
  let where = `WHERE owner_id = ?`;
  const params: unknown[] = [ownerId];
  if (studentId) {
    where += ` AND student_id = ?`;
    params.push(studentId);
  }

  const total = sqlite.prepare(`SELECT COUNT(*) AS n FROM learning_records ${where}`).get(...params) as { n: number };
  const correct = sqlite.prepare(`SELECT COUNT(*) AS n FROM learning_records ${where} AND is_correct = 1`).get(...params) as { n: number };
  const avgScore = sqlite.prepare(`SELECT AVG(score) AS avg FROM learning_records ${where}`).get(...params) as { avg: number | null };
  const byType = sqlite.prepare(
    `SELECT source_type AS type, COUNT(*) AS n, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
      FROM learning_records ${where} GROUP BY source_type`,
  ).all(...params) as Array<{ type: string; n: number; correct: number }>;
  const weakPoints = sqlite.prepare(
    `SELECT question_id AS questionId, q.stem, COUNT(*) AS wrongCount
      FROM learning_records lr
      JOIN questions q ON q.id = lr.question_id
      WHERE lr.owner_id = ?${studentId ? ` AND lr.student_id = ?` : ''} AND lr.is_correct = 0
      GROUP BY lr.question_id
      ORDER BY wrongCount DESC
      LIMIT 10`,
  ).all(...params) as Array<{ questionId: string; stem: string; wrongCount: number }>;

  return {
    total: total.n,
    correct: correct.n,
    accuracy: total.n ? Math.round((correct.n / total.n) * 100) : 0,
    avgScore: avgScore.avg ?? 0,
    byType,
    weakPoints,
  };
}

export function getPracticeHistory(ownerId: string, studentId?: string, limit = 50) {
  const sqlite = getSqlite();
  let sql = `
    SELECT ps.id, ps.title, ps.type, ps.status, ps.total_score, ps.start_at, ps.submitted_at,
           COUNT(pi.id) AS questionCount,
           SUM(CASE WHEN pi.is_correct = 1 THEN 1 ELSE 0 END) AS correctCount
    FROM practice_sessions ps
    LEFT JOIN practice_items pi ON pi.session_id = ps.id
    WHERE ps.owner_id = ?
  `;
  const params: unknown[] = [ownerId];
  if (studentId) {
    sql += ` AND ps.student_id = ?`;
    params.push(studentId);
  }
  sql += ` GROUP BY ps.id ORDER BY ps.updated_at DESC LIMIT ?`;
  params.push(limit);

  return sqlite.prepare(sql).all(...params) as Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    totalScore: number | null;
    startAt: string;
    submittedAt: string | null;
    questionCount: number;
    correctCount: number | null;
  }>;
}
