/**
 * 错题本业务逻辑
 */

import { getSqlite } from "../db";
import { now } from "./server";

export type WrongRecord = {
  id: string;
  ownerId: string;
  studentId: string | null;
  questionId: string;
  sourceType: string;
  sourceId: string | null;
  userAnswer: string;
  correctAnswer: string;
  wrongReason: string | null;
  firstWrongAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  masteryLevel: "unfamiliar" | "learning" | "mastered";
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
};

export type AddWrongRecordInput = {
  studentId?: string;
  questionId: string;
  sourceType?: "practice" | "exam" | "assignment" | "manual" | "wrong_review";
  sourceId?: string;
  userAnswer: string;
  correctAnswer: string;
  wrongReason?: string;
};

export function addWrongRecord(ownerId: string, input: AddWrongRecordInput) {
  const sqlite = getSqlite();
  const timestamp = now();

  // 如果该题目已在错题本中且状态为 open，更新错题信息；否则插入新记录
  const existing = sqlite.prepare(
    `SELECT id, review_count, mastery_level FROM wrong_records
      WHERE owner_id = ? AND question_id = ? AND status = 'open'
      ORDER BY first_wrong_at ASC LIMIT 1`,
  ).get(ownerId, input.questionId) as { id: string; review_count: number; mastery_level: string } | undefined;

  if (existing) {
    sqlite.prepare(
      `UPDATE wrong_records
        SET user_answer = ?, correct_answer = ?, wrong_reason = COALESCE(?, wrong_reason),
            updated_at = ?, mastery_level = 'unfamiliar', review_count = review_count + 1
        WHERE id = ?`,
    ).run(
      input.userAnswer,
      input.correctAnswer,
      input.wrongReason ?? null,
      timestamp,
      existing.id,
    );
    return { id: existing.id, created: false } as const;
  }

  const id = crypto.randomUUID();
  sqlite.prepare(
    `INSERT INTO wrong_records (id, owner_id, student_id, question_id, source_type, source_id,
      user_answer, correct_answer, wrong_reason, first_wrong_at, last_reviewed_at, review_count,
      mastery_level, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ownerId,
    input.studentId ?? null,
    input.questionId,
    input.sourceType ?? "practice",
    input.sourceId ?? null,
    input.userAnswer,
    input.correctAnswer,
    input.wrongReason ?? null,
    timestamp,
    timestamp,
    0,
    "unfamiliar",
    "open",
    timestamp,
    timestamp,
  );
  return { id, created: true } as const;
}

export function listWrongRecords(
  ownerId: string,
  options: { studentId?: string; status?: "open" | "closed"; masteryLevel?: string; limit?: number } = {},
) {
  const sqlite = getSqlite();
  let sql = `
    SELECT wr.*, q.stem, q.type, q.answer, q.analysis, q.difficulty,
           d.name AS documentName, d.subject, d.grade
    FROM wrong_records wr
    JOIN questions q ON q.id = wr.question_id
    JOIN documents d ON d.id = q.document_id
    WHERE wr.owner_id = ?
  `;
  const params: unknown[] = [ownerId];

  if (options.studentId) {
    sql += ` AND wr.student_id = ?`;
    params.push(options.studentId);
  }
  if (options.status) {
    sql += ` AND wr.status = ?`;
    params.push(options.status);
  }
  if (options.masteryLevel) {
    sql += ` AND wr.mastery_level = ?`;
    params.push(options.masteryLevel);
  }
  sql += ` ORDER BY wr.updated_at DESC`;
  if (options.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }

  return sqlite.prepare(sql).all(...params) as Array<WrongRecord & {
    stem: string;
    type: string;
    answer: string;
    analysis: string;
    documentName: string;
    subject: string;
    grade: string;
  }>;
}

export function getWrongRecord(ownerId: string, id: string) {
  const sqlite = getSqlite();
  const row = sqlite.prepare(
    `SELECT * FROM wrong_records WHERE id = ? AND owner_id = ?`,
  ).get(id, ownerId) as WrongRecord | undefined;
  return row;
}

export function markWrongRecordMastery(ownerId: string, id: string, masteryLevel: "unfamiliar" | "learning" | "mastered") {
  const sqlite = getSqlite();
  const timestamp = now();
  const result = sqlite.prepare(
    `UPDATE wrong_records
       SET mastery_level = ?, last_reviewed_at = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`,
  ).run(masteryLevel, timestamp, timestamp, id, ownerId);
  return result.changes > 0;
}

export function closeWrongRecord(ownerId: string, id: string) {
  const sqlite = getSqlite();
  const timestamp = now();
  const result = sqlite.prepare(
    `UPDATE wrong_records SET status = 'closed', updated_at = ? WHERE id = ? AND owner_id = ?`,
  ).run(timestamp, id, ownerId);
  return result.changes > 0;
}

/** 获取到期复习的错题（基于掌握度和复习间隔） */
export function getDueForReview(ownerId: string, studentId?: string, limit = 20) {
  const sqlite = getSqlite();
  let sql = `
    SELECT wr.*, q.stem, q.type, q.answer, q.analysis, q.difficulty
    FROM wrong_records wr
    JOIN questions q ON q.id = wr.question_id
    WHERE wr.owner_id = ? AND wr.status = 'open'
  `;
  const params: unknown[] = [ownerId];

  if (studentId) {
    sql += ` AND wr.student_id = ?`;
    params.push(studentId);
  }

  // 复习策略：unfamiliar 每次都复习，learning 复习 2 次以上降频，mastered 不复习
  sql += ` AND (
    (wr.mastery_level = 'unfamiliar')
    OR (wr.mastery_level = 'learning' AND wr.review_count < 3)
    OR (wr.last_reviewed_at IS NULL)
  )`;
  sql += ` ORDER BY wr.mastery_level ASC, wr.review_count ASC, COALESCE(wr.last_reviewed_at, wr.first_wrong_at) ASC LIMIT ?`;
  params.push(limit);

  return sqlite.prepare(sql).all(...params) as Array<{
    id: string;
    questionId: string;
    stem: string;
    type: string;
    answer: string;
    analysis: string;
    difficulty: string;
    masteryLevel: string;
    reviewCount: number;
  }>;
}

export function getWrongBookStats(ownerId: string, studentId?: string) {
  const sqlite = getSqlite();
  let where = `WHERE owner_id = ?`;
  const params: unknown[] = [ownerId];
  if (studentId) {
    where += ` AND student_id = ?`;
    params.push(studentId);
  }

  const total = sqlite.prepare(`SELECT COUNT(*) AS n FROM wrong_records ${where}`).get(...params) as { n: number };
  const open = sqlite.prepare(`SELECT COUNT(*) AS n FROM wrong_records ${where} AND status = 'open'`).get(...params) as { n: number };
  const mastered = sqlite.prepare(`SELECT COUNT(*) AS n FROM wrong_records ${where} AND mastery_level = 'mastered'`).get(...params) as { n: number };
  const byMastery = sqlite.prepare(
    `SELECT mastery_level AS level, COUNT(*) AS n FROM wrong_records ${where} GROUP BY mastery_level`,
  ).all(...params) as Array<{ level: string; n: number }>;

  return { total: total.n, open: open.n, mastered: mastered.n, byMastery };
}
