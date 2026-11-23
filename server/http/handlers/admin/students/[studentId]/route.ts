import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { readJsonPayload } from "../../../../../../lib/request-payload";
import { now } from "../../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../../shared";

export async function POST(request: Request, context: { params: Promise<{ studentId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { studentId } = await context.params;
  if (studentId) return Response.json({ error: "无法创建" }, { status: 400 });
  const parsed = await readJsonPayload<{ studentNo?: unknown; name?: unknown}>(request);
  if (!parsed.ok) return parsed.response;
  const sqlite = getSqlite();
  try {
    const studentNo = typeof parsed.value.studentNo === "string" ? parsed.value.studentNo.trim() : "";
    const name = typeof parsed.value.name === "string" ? parsed.value.name.trim() : "";
    if (!studentNo || studentNo.length > 30 || /[-]/.test(studentNo)) throw new Error("学号格式无效");
    if (!name || name.length > 20 || /[-]/.test(name)) throw new Error("学生姓名格式无效");
    const ownerId = session.teacherId;
    const existing = sqlite.prepare("SELECT 1 FROM students WHERE owner_id = ? AND student_no = ?").get(ownerId, studentNo);
    if (existing) throw new Error("该学生已存在（同一教师下）");
    const timestamp = now();
    sqlite.prepare("INSERT INTO students (id, owner_id, student_no, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      crypto.randomUUID(), ownerId, studentNo, name, timestamp, timestamp,
    );
    const row = sqlite.prepare("SELECT id, student_no AS studentNo, name FROM students WHERE owner_id = ? AND student_no = ?").get(ownerId, studentNo);
    return Response.json({ student: row }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法创建学生" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ studentId: string }> }) {
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
