/**
 * 学习记录聚合分析 API
 * 返回：近30天正确率趋势、题型正确率分布、薄弱题目、总体统计
 */

import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";

export async function GET(request: Request) {
  await ensureDatabase();
  const ownerId = requestOwner(request);
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const sqlite = getSqlite();

  const studentFilter = studentId ? " AND lr.student_id = ?" : "";
  const params: unknown[] = [ownerId];
  if (studentId) params.push(studentId);

  // 总体统计
  const totalRow = sqlite.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN lr.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
       SUM(lr.score) AS totalScore,
       AVG(lr.score) AS avgScore,
       SUM(lr.time_spent_ms) AS totalTimeMs
     FROM learning_records lr
     WHERE lr.owner_id = ?${studentFilter}`,
  ).get(...params) as {
    total: number; correct: number; totalScore: number | null; avgScore: number | null; totalTimeMs: number | null;
  };

  // 近 days 天每天正确率趋势
  const daily = sqlite.prepare(
    `SELECT
       date(lr.attempted_at) AS day,
       COUNT(*) AS total,
       SUM(CASE WHEN lr.is_correct = 1 THEN 1 ELSE 0 END) AS correct
     FROM learning_records lr
     WHERE lr.owner_id = ?${studentFilter}
       AND date(lr.attempted_at) >= date('now', -${days} || ' days')
     GROUP BY date(lr.attempted_at)
     ORDER BY day`,
  ).all(...params) as Array<{ day: string; total: number; correct: number }>;

  // 按题型/来源分类正确率
  const byType = sqlite.prepare(
    `SELECT
       lr.source_type AS type,
       COUNT(*) AS total,
       SUM(CASE WHEN lr.is_correct = 1 THEN 1 ELSE 0 END) AS correct
     FROM learning_records lr
     WHERE lr.owner_id = ?${studentFilter}
     GROUP BY lr.source_type`,
  ).all(...params) as Array<{ type: string; total: number; correct: number }>;

  // 薄弱题目（错误次数最多）
  const weakQuestions = sqlite.prepare(
    `SELECT
       lr.question_id AS questionId,
       q.stem,
       q.type,
       q.difficulty,
       COUNT(*) AS total,
       SUM(CASE WHEN lr.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
       COUNT(*) - SUM(CASE WHEN lr.is_correct = 1 THEN 1 ELSE 0 END) AS wrongCount
     FROM learning_records lr
     JOIN questions q ON q.id = lr.question_id
     WHERE lr.owner_id = ?${studentFilter} AND lr.is_correct = 0
     GROUP BY lr.question_id
     ORDER BY wrongCount DESC, total DESC
     LIMIT 10`,
  ).all(...params) as Array<{
    questionId: string; stem: string; type: string; difficulty: string;
    total: number; correct: number; wrongCount: number;
  }>;

  return Response.json({
    total: {
      total: totalRow.total ?? 0,
      correct: totalRow.correct ?? 0,
      accuracy: totalRow.total ? Math.round(((totalRow.correct ?? 0) / totalRow.total) * 100) : 0,
      avgScore: totalRow.avgScore ?? 0,
      totalScore: totalRow.totalScore ?? 0,
      totalTimeMs: totalRow.totalTimeMs ?? 0,
    },
    daily: daily.map((d) => ({
      day: d.day,
      accuracy: d.total ? Math.round((d.correct / d.total) * 100) : 0,
      total: d.total,
      correct: d.correct,
    })),
    byType: byType.map((t) => ({
      type: t.type,
      total: t.total,
      correct: t.correct,
      accuracy: t.total ? Math.round((t.correct / t.total) * 100) : 0,
    })),
    weakQuestions: weakQuestions.map((w) => ({
      ...w,
      accuracy: w.total ? Math.round((w.correct / w.total) * 100) : 0,
    })),
  });
}
