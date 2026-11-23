import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { adminForbidden, requireAdminSession } from "../../shared";

export async function GET(request: Request, context: { params: Promise<{ questionId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { questionId } = await context.params;
  const sqlite = getSqlite();
  const question = sqlite.prepare(
    `SELECT q.id, q.document_id AS documentId, d.name AS documentName, u.username AS ownerName,
            d.subject AS subject, d.grade AS grade, q.type, q.number, q.status, q.difficulty, q.score,
            q.stem, q.answer, q.analysis, q.options_json AS optionsJson, q.confidence, q.ai_review_json,
            q.created_at AS createdAt
     FROM questions q
     JOIN documents d ON d.id = q.document_id
     LEFT JOIN teachers u ON u.id = d.owner_id
     WHERE q.id = ?`,
  ).get(questionId) as Record<string, unknown> | undefined;
  if (!question) return Response.json({ error: "题目不存在" }, { status: 404 });
  const tags = sqlite.prepare("SELECT t.name AS name FROM question_tags qt JOIN tags t ON t.id = qt.tag_id WHERE qt.question_id = ? ORDER BY t.name").all(questionId) as Array<{ name: string }>;
  return Response.json({ question: { ...question, tags: tags.map((t) => t.name) } });
}

export async function DELETE(request: Request, context: { params: Promise<{ questionId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { questionId } = await context.params;
  const sqlite = getSqlite();
  const result = sqlite.prepare("DELETE FROM questions WHERE id = ?").run(questionId);
  if (!result.changes) return Response.json({ error: "题目不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
