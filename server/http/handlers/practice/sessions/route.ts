import { readJsonPayload } from "../../../../../lib/request-payload";
import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { now } from "../../../../../lib/server";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  await ensureDatabase();
  const { sessionId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const session = sqlite.prepare(
    "SELECT * FROM practice_sessions WHERE id = ? AND owner_id = ?",
  ).get(sessionId, ownerId) as { id: string; owner_id: string; student_id: string | null; paper_id: string | null; title: string; type: string; status: string; total_score: number | null; start_at: string; submitted_at: string | null; updated_at: string; duration_minutes: number | null; end_at: string | null } | undefined;
  if (!session) return Response.json({ error: "练习会话不存在" }, { status: 404 });

  let questions: Array<{ id: string; number: string; type: string; stem: string; options_json: string | null; difficulty: string }> = [];
  if (session.paper_id) {
    const items = sqlite.prepare(
      "SELECT question_id FROM paper_items WHERE paper_id = ? ORDER BY position",
    ).all(session.paper_id) as Array<{ question_id: string }>;
    const questionIds = items.map((i) => i.question_id);
    if (questionIds.length) {
      const placeholders = questionIds.map(() => "?").join(",");
      questions = sqlite.prepare(
        `SELECT q.id, q.number, q.type, q.stem, q.options_json AS options_json, q.difficulty
          FROM questions q WHERE q.id IN (${placeholders})`,
      ).all(...questionIds) as Array<{ id: string; number: string; type: string; stem: string; options_json: string | null; difficulty: string }>;
    }
  }

  return Response.json({ session, questions });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = await readJsonPayload<{
    studentId?: string;
    paperId?: string;
    title?: string;
    type?: "practice" | "exam";
    durationMinutes?: number;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  let questionIds: string[] = [];
  let sessionTitle = payload.title ?? "练习";
  let durationMinutes: number | null = null;
  let endAt: string | null = null;
  if (payload.type === "exam") {
    durationMinutes = payload.durationMinutes ?? 60;
    endAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  }
  if (payload.paperId) {
    const paper = sqlite.prepare("SELECT title FROM papers WHERE id = ? AND owner_id = ?").get(payload.paperId, ownerId) as { title: string } | undefined;
    if (!paper) return Response.json({ error: "试卷不存在" }, { status: 404 });
    sessionTitle = payload.title ?? paper.title;
    const items = sqlite.prepare("SELECT question_id FROM paper_items WHERE paper_id = ? ORDER BY position").all(payload.paperId) as Array<{ question_id: string }>;
    questionIds = items.map((i) => i.question_id);
  }

  const id = crypto.randomUUID();
  const timestamp = now();
  sqlite.prepare(
    `INSERT INTO practice_sessions (id, owner_id, student_id, paper_id, version_code, title, type, status, start_at, duration_minutes, end_at, updated_at)
      VALUES (?, ?, ?, ?, 'A', ?, ?, 'active', ?, ?, ?, ?)`,
  ).run(id, ownerId, payload.studentId ?? null, payload.paperId ?? null, sessionTitle, payload.type ?? "practice", timestamp, durationMinutes, endAt, timestamp);

  let questions: Array<{ id: string; number: string; type: string; stem: string; optionsJson: string | null; difficulty: string }> = [];
  if (questionIds.length) {
    const placeholders = questionIds.map(() => "?").join(",");
    questions = sqlite.prepare(
      `SELECT q.id, q.number, q.type, q.stem, q.options_json AS optionsJson, q.difficulty
        FROM questions q WHERE q.id IN (${placeholders})`,
    ).all(...questionIds) as Array<{ id: string; number: string; type: string; stem: string; optionsJson: string | null; difficulty: string }>;
  }

  return Response.json({
    sessionId: id,
    title: sessionTitle,
    type: payload.type ?? "practice",
    status: "active",
    startAt: timestamp,
    durationMinutes,
    endAt,
    questions,
  }, { status: 201 });
}
