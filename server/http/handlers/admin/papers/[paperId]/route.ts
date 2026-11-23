import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { adminForbidden, requireAdminSession } from "../../shared";

export async function DELETE(request: Request, context: { params: Promise<{ paperId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { paperId } = await context.params;
  const sqlite = getSqlite();
  const paper = sqlite.prepare("SELECT id FROM papers WHERE id = ?").get(paperId) as { id: string } | undefined;
  if (!paper) return Response.json({ error: "试卷不存在" }, { status: 404 });
  const assignments = (sqlite.prepare("SELECT COUNT(*) AS c FROM assignments WHERE paper_id = ?").get(paperId) as { c: number }).c;
  if (assignments > 0) return Response.json({ error: "该试卷已被作业使用，请先删除作业" }, { status: 409 });
  sqlite.prepare("DELETE FROM papers WHERE id = ?").run(paperId);
  return Response.json({ ok: true });
}
