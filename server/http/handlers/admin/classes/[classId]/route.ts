import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { adminForbidden, requireAdminSession } from "../../shared";

export async function DELETE(request: Request, context: { params: Promise<{ classId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { classId } = await context.params;
  const sqlite = getSqlite();
  const classRow = sqlite.prepare("SELECT id FROM teaching_classes WHERE id = ?").get(classId) as { id: string } | undefined;
  if (!classRow) return Response.json({ error: "班级不存在" }, { status: 404 });
  const used = (sqlite.prepare("SELECT COUNT(*) AS c FROM assignment_classes WHERE class_id = ?").get(classId) as { c: number }).c;
  if (used > 0) return Response.json({ error: "该班级已被作业使用，请先删除作业" }, { status: 409 });
  sqlite.prepare("DELETE FROM class_students WHERE class_id = ?").run(classId);
  sqlite.prepare("DELETE FROM teaching_classes WHERE id = ?").run(classId);
  return Response.json({ ok: true });
}
