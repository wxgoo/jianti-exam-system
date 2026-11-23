import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { readJsonPayload } from "../../../../../../lib/request-payload";
import { adminForbidden, requireAdminSession } from "../../shared";
import type { TeacherRow } from "../route";
export type { TeacherRow };

function selectTeacher(sqlite: ReturnType<typeof getSqlite>, id: string): TeacherRow | undefined {
  return sqlite.prepare("SELECT id, username, name, school, subject, role, created_at AS createdAt FROM teachers WHERE id = ?").get(id) as TeacherRow | undefined;
}

export async function GET(request: Request, context: { params: Promise<{ teacherId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { teacherId } = await context.params;
  const teacher = selectTeacher(getSqlite(), teacherId);
  if (!teacher) return Response.json({ error: "教师不存在" }, { status: 404 });
  return Response.json({ teacher });
}

export async function PATCH(request: Request, context: { params: Promise<{ teacherId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { teacherId } = await context.params;
  const sqlite = getSqlite();
  if (!selectTeacher(sqlite, teacherId)) return Response.json({ error: "教师不存在" }, { status: 404 });

  const parsed = await readJsonPayload<{ name?: unknown; school?: unknown; subject?: unknown; role?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const updates: string[] = [];
  const params: unknown[] = [];
  const clean = (value: unknown, label: string, min: number, max: number): string => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.length < min || text.length > max || /[-]/.test(text)) throw new Error(`${label}无效`);
    return text;
  };
  try {
    const name = parsed.value.name;
    if (name !== undefined) { updates.push("name = ?"); params.push(clean(name, "姓名", 1, 20)); }
    const school = parsed.value.school;
    if (school !== undefined) { updates.push("school = ?"); params.push(clean(school, "学校", 1, 40)); }
    const subject = parsed.value.subject;
    if (subject !== undefined) { updates.push("subject = ?"); params.push(clean(subject, "学科", 1, 20)); }
    if (parsed.value.role !== undefined && parsed.value.role !== "admin" && parsed.value.role !== "teacher") {
      return Response.json({ error: "角色只能是 admin 或 teacher" }, { status: 400 });
    }
    if (parsed.value.role !== undefined) {
      if (session.teacherId === teacherId && parsed.value.role === "teacher") {
        return Response.json({ error: "不能将自己设为普通教师" }, { status: 409 });
      }
      updates.push("role = ?"); params.push(parsed.value.role);
    }
    if (!updates.length) return Response.json({ teacher: selectTeacher(sqlite, teacherId) });
    sqlite.prepare(`UPDATE teachers SET ${updates.join(", ")} WHERE id = ?`).run(...params, teacherId);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "教师信息无效" }, { status: 400 });
  }
  return Response.json({ teacher: selectTeacher(sqlite, teacherId) });
}

export async function DELETE(request: Request, context: { params: Promise<{ teacherId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { teacherId } = await context.params;
  const sqlite = getSqlite();
  const teacher = selectTeacher(sqlite, teacherId);
  if (!teacher) return Response.json({ error: "教师不存在" }, { status: 404 });
  if (teacherId === session.teacherId) return Response.json({ error: "不能删除自己" }, { status: 409 });
  if (teacher.role === "admin") {
    const others = sqlite.prepare("SELECT COUNT(*) AS c FROM teachers WHERE role = 'admin' AND id <> ?").get(teacherId) as { c: number };
    if (others.c === 0) return Response.json({ error: "不能删除最后一位管理员" }, { status: 409 });
  }
  sqlite.prepare("DELETE FROM teachers WHERE id = ?").run(teacherId);
  return Response.json({ ok: true });
}
