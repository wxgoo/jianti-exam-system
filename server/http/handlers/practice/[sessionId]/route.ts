import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  await ensureDatabase();
  const { sessionId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const session = sqlite.prepare(
    "SELECT * FROM practice_sessions WHERE id = ? AND owner_id = ?",
  ).get(sessionId, ownerId) as { id: string; owner_id: string; student_id: string | null; paper_id: string | null; title: string; type: string; status: string; total_score: number | null; start_at: string; submitted_at: string | null; updated_at: string } | undefined;
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

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  await ensureDatabase();
  const { sessionId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const parsed = await request.json().catch(() => null) as { status?: string; total_score?: number } | null;
  if (!parsed) return Response.json({ error: "请求格式无效" }, { status: 400 });

  const session = sqlite.prepare("SELECT id FROM practice_sessions WHERE id = ? AND owner_id = ?").get(sessionId, ownerId);
  if (!session) return Response.json({ error: "练习会话不存在" }, { status: 404 });

  const updates: string[] = [];
  const params: unknown[] = [];
  if (parsed.status) {
    updates.push("status = ?");
    params.push(parsed.status);
  }
  if (parsed.total_score !== undefined) {
    updates.push("total_score = ?");
    params.push(parsed.total_score);
  }
  if (updates.length) {
    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(sessionId, ownerId);
    sqlite.prepare(`UPDATE practice_sessions SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`).run(...params);
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  await ensureDatabase();
  const { sessionId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const session = sqlite.prepare("SELECT id FROM practice_sessions WHERE id = ? AND owner_id = ?").get(sessionId, ownerId);
  if (!session) return Response.json({ error: "练习会话不存在" }, { status: 404 });

  sqlite.prepare("DELETE FROM practice_sessions WHERE id = ? AND owner_id = ?").run(sessionId, ownerId);
  return Response.json({ ok: true });
}
