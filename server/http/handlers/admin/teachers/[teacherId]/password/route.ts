import { ensureDatabase } from "../../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../../db";
import { hashPassword } from "../../../../../../../lib/auth";
import { readJsonPayload } from "../../../../../../../lib/request-payload";
import { adminForbidden, requireAdminSession } from "../../../shared";
import type { TeacherRow } from "../route";

export async function POST(request: Request, context: { params: Promise<{ teacherId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { teacherId } = await context.params;
  const sqlite = getSqlite();
  const teacher = sqlite.prepare("SELECT id FROM teachers WHERE id = ?").get(teacherId) as TeacherRow | undefined;
  if (!teacher) return Response.json({ error: "教师不存在" }, { status: 404 });

  const parsed = await readJsonPayload<{ password?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const password = typeof parsed.value.password === "string" ? parsed.value.password.trim() : "";
  if (!password || password.length < 6 || password.length > 32 || /[-]/.test(password)) {
    return Response.json({ error: "密码长度必须是 6–32 位，且不含非法字符" }, { status: 400 });
  }
  sqlite.prepare("UPDATE teachers SET password_hash = ? WHERE id = ?").run(hashPassword(password), teacherId);
  return Response.json({ ok: true });
}
