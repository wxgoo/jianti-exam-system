import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { readJsonPayload } from "../../../../../../lib/request-payload";
import { now } from "../../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../../shared";

type Context = { params: Promise<{ studentId: string }> };

export async function PATCH(request: Request, context: Context) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { studentId } = await context.params;
  const parsed = await readJsonPayload<{ studentNo?: unknown; name?: unknown; ownerId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const sqlite = getSqlite();
  try {
    const row = sqlite.prepare("SELECT id, owner_id AS ownerId, student_no AS studentNo, name FROM students WHERE id = ?").get(studentId) as { id: string; ownerId: string; studentNo: string; name: string } | undefined;
    if (!row) return Response.json({ error: "学生不存在" }, { status: 404 });
    const studentNo = typeof parsed.value.studentNo === "string" && parsed.value.studentNo.trim() ? parsed.value.studentNo.trim() : row.studentNo;
    const name = typeof parsed.value.name === "string" && parsed.value.name.trim() ? parsed.value.name.trim() : row.name;
    const ownerId = typeof parsed.value.ownerId === "string" && parsed.value.ownerId ? parsed.value.ownerId : row.ownerId;
    if (studentNo.length > 30 || /[\x01-\x1f]/.test(studentNo)) throw new Error("学号格式无效");
    if (name.length > 20 || /[\x01-\x1f]/.test(name)) throw new Error("学生姓名格式无效");
    // Check no duplicate student_no within same owner
    if (studentNo !== row.studentNo || ownerId !== row.ownerId) {
      const dup = sqlite.prepare("SELECT id FROM students WHERE owner_id = ? AND student_no = ? AND id != ?").get(ownerId, studentNo, studentId);
      if (dup) throw new Error("新学号在该教师下已存在");
    }
    sqlite.prepare("UPDATE students SET owner_id = ?, student_no = ?, name = ?, updated_at = ? WHERE id = ?").run(ownerId, studentNo, name, now(), studentId);
    const updated = sqlite.prepare("SELECT id, owner_id AS ownerId, student_no AS studentNo, name FROM students WHERE id = ?").get(studentId);
    return Response.json({ student: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新学生失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { studentId } = await context.params;
  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT id FROM students WHERE id = ?").get(studentId) as { id: string } | undefined;
  if (!row) return Response.json({ error: "学生不存在" }, { status: 404 });
  sqlite.prepare("DELETE FROM class_students WHERE student_id = ?").run(studentId);
  sqlite.prepare("DELETE FROM students WHERE id = ?").run(studentId);
  return Response.json({ ok: true });
}
