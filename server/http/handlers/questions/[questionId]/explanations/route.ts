import { readJsonPayload } from "../../../../../../lib/request-payload";
import { requestOwner } from "../../../../../../lib/server";
import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { now } from "../../../../../../lib/server";

export async function GET(request: Request, context: { params: Promise<{ questionId: string }> }) {
  await ensureDatabase();
  const { questionId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const rows = sqlite.prepare(
    `SELECT * FROM explanations WHERE question_id = ? ORDER BY created_at DESC`,
  ).all(questionId) as Array<{
    id: string; question_id: string; type: string; content: string; source: string;
    created_at: string; updated_at: string;
  }>;
  return Response.json({ explanations: rows });
}

export async function POST(request: Request, context: { params: Promise<{ questionId: string }> }) {
  await ensureDatabase();
  const { questionId } = await context.params;
  const parsed = await readJsonPayload<{
    type?: "text" | "video" | "audio";
    content?: string;
    source?: "ai" | "teacher" | "imported";
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  // 确保题目存在
  const question = sqlite.prepare("SELECT id FROM questions WHERE id = ?").get(questionId);
  if (!question) return Response.json({ error: "题目不存在" }, { status: 404 });

  const id = crypto.randomUUID();
  const timestamp = now();
  sqlite.prepare(
    `INSERT INTO explanations (id, question_id, type, content, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, questionId, payload.type ?? "text", payload.content ?? "", payload.source ?? "ai", timestamp, timestamp);

  return Response.json({ id, created: true }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ questionId: string; explanationId: string }> }) {
  await ensureDatabase();
  const { questionId, explanationId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const row = sqlite.prepare("SELECT id FROM explanations WHERE id = ? AND question_id = ?").get(explanationId, questionId);
  if (!row) return Response.json({ error: "讲解不存在" }, { status: 404 });

  sqlite.prepare("DELETE FROM explanations WHERE id = ? AND question_id = ?").run(explanationId, questionId);
  return Response.json({ ok: true });
}
