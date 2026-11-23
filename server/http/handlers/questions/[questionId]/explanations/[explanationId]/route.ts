import { requestOwner } from "@/lib/server";
import { ensureDatabase } from "@/db/bootstrap";
import { getSqlite } from "@/db";

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
