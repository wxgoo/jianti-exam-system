import { readJsonPayload } from "../../../../../../lib/request-payload";
import { requestOwner } from "../../../../../../lib/server";
import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { now } from "../../../../../../lib/server";
import { recordAttempt } from "../../../../../../lib/learning-record";
import { gradeAnswer, type GradingQuestion } from "../../../../../../lib/exam-grading";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  await ensureDatabase();
  const { sessionId } = await context.params;
  const parsed = await readJsonPayload<{
    studentId?: string;
    answers: Array<{ questionId: string; answer: string; timeSpentMs?: number }>;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  if (!Array.isArray(payload.answers) || !payload.answers.length) {
    return Response.json({ error: "没有提交任何答案" }, { status: 400 });
  }

  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const session = sqlite.prepare("SELECT id, owner_id, student_id, status, end_at, submitted_at FROM practice_sessions WHERE id = ?").get(sessionId) as { id: string; owner_id: string; student_id: string | null; status: string; end_at: string | null; submitted_at: string | null } | undefined;
  if (!session) return Response.json({ error: "练习会话不存在" }, { status: 404 });
  if (session.owner_id !== ownerId) return Response.json({ error: "无权访问此会话" }, { status: 403 });
  if (session.status !== "active") return Response.json({ error: "会话已结束，无法提交答案" }, { status: 400 });

  // 考试模式：检查是否已过截止时间
  if (session.end_at && new Date(session.end_at) < new Date()) {
    return Response.json({ error: "考试时间已到，自动交卷" }, { status: 400 });
  }

  const timestamp = now();
  let totalScore = 0;
  let maxTotalScore = 0;
  let correctCount = 0;
  let gradedCount = 0;

  sqlite.transaction(() => {
    // 标记会话已提交（锁定，防止重复提交）
    sqlite.prepare("UPDATE practice_sessions SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, sessionId);

    const insertItem = sqlite.prepare(
      `INSERT INTO practice_items (id, session_id, question_id, position, user_answer, is_correct, score, max_score, time_spent_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let position = 0;
    for (const ans of payload.answers) {
      const question = sqlite.prepare("SELECT answer, score, type FROM questions WHERE id = ?").get(ans.questionId) as { answer: string; score: number; type: string } | undefined;
      if (!question) continue;

      const q: GradingQuestion = { id: ans.questionId, type: question.type as GradingQuestion["type"], answer: question.answer, score: question.score };
      const grade = gradeAnswer(q, ans.answer);

      const itemScore = grade.score;
      const itemMax = grade.maxScore;
      totalScore += itemScore;
      maxTotalScore += itemMax;
      gradedCount += 1;
      if (grade.isCorrect) correctCount += 1;

      const itemId = crypto.randomUUID();
      insertItem.run(itemId, sessionId, ans.questionId, position + 1, ans.answer, grade.isCorrect ? 1 : 0, itemScore, itemMax, ans.timeSpentMs ?? 0);

      // 写入学习记录（自动关联错题本）
      recordAttempt(ownerId, {
        studentId: payload.studentId ?? session.student_id ?? undefined,
        sessionId,
        questionId: ans.questionId,
        answer: ans.answer,
        isCorrect: grade.isCorrect,
        score: itemScore,
        timeSpentMs: ans.timeSpentMs ?? 0,
        sourceType: "practice",
      });

      position += 1;
    }

    // 更新会话总分
    sqlite.prepare("UPDATE practice_sessions SET total_score = ?, updated_at = ? WHERE id = ?").run(totalScore, timestamp, sessionId);
  }).immediate();

  return Response.json({
    sessionId,
    totalScore,
    maxTotalScore,
    correctCount,
    gradedCount,
    totalCount: payload.answers.length,
    accuracy: gradedCount ? Math.round((correctCount / gradedCount) * 100) : 0,
    submittedAt: timestamp,
  });
}
