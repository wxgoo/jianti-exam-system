import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { hashPassword } from "../../../../../lib/auth";
import { readJsonPayload } from "../../../../../lib/request-payload";
import { now } from "../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../shared";

function cleanText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length < min || text.length > max || /[-]/.test(text)) throw new Error(`${label}无效`);
  return text;
}

export type TeacherRow = { id: string; username: string; name: string; school: string; subject: string; role: string; createdAt: string };

function selectTeacher(sqlite: ReturnType<typeof getSqlite>, id: string): TeacherRow | undefined {
  return sqlite.prepare("SELECT id, username, name, school, subject, role, created_at AS createdAt FROM teachers WHERE id = ?").get(id) as TeacherRow | undefined;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const teachers = getSqlite().prepare(
    "SELECT id, username, name, school, subject, role, created_at AS createdAt FROM teachers ORDER BY created_at DESC",
  ).all() as TeacherRow[];
  return Response.json({ teachers });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const parsed = await readJsonPayload<{ username?: unknown; name?: unknown; password?: unknown; school?: unknown; subject?: unknown; role?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const sqlite = getSqlite();
  try {
    const username = cleanText(parsed.value.username, "用户名", 2, 30);
    const name = cleanText(parsed.value.name, "姓名", 1, 20);
    const password = cleanText(parsed.value.password, "密码", 6, 32);
    const school = cleanText(parsed.value.school, "学校", 1, 40);
    const subject = cleanText(parsed.value.subject, "学科", 1, 20);
    if (parsed.value.role !== undefined && parsed.value.role !== "admin" && parsed.value.role !== "teacher") {
      return Response.json({ error: "角色只能是 admin 或 teacher" }, { status: 400 });
    }
    const role = parsed.value.role === "admin" ? "admin" : "teacher";
    if (sqlite.prepare("SELECT 1 FROM teachers WHERE username = ?").get(username)) {
      return Response.json({ error: "用户名已存在" }, { status: 409 });
    }
    const id = crypto.randomUUID();
    const timestamp = now();
    sqlite.prepare(
      `INSERT INTO teachers (id, username, password_hash, name, school, subject, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, username, hashPassword(password), name, school, subject, role, timestamp);
    const teacher = selectTeacher(sqlite, id);
    return Response.json({ teacher }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法创建教师" }, { status: 400 });
  }
}
