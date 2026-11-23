import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { adminForbidden, requireAdminSession } from "../../shared";

export async function DELETE(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { assignmentId } = await context.params;
  const sqlite = getSqlite();
  const result = sqlite.prepare("DELETE FROM assignments WHERE id = ?").run(assignmentId);
  if (!result.changes) return Response.json({ error: "作业不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
