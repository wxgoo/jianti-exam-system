import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { now } from "../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../shared";
import { readJsonPayload } from "../../../../../lib/request-payload";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const rows = getSqlite().prepare(
    `SELECT s.id, s.owner_id AS ownerId, u.username AS ownerName, s.student_no AS studentNo, s.name,
            (SELECT COUNT(*) FROM class_students cs WHERE cs.student_id = s.id) AS classCount,
            s.created_at AS createdAt
     FROM students s LEFT JOIN teachers u ON u.id = s.owner_id
     ORDER BY s.name`,
  ).all();
  return Response.json({ students: rows });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const parsed = await readJsonPayload<{ ownerId?: unknown; studentNo?: unknown; name?: unknown; }>(request);
  if (!parsed.ok) return parsed.response;
  const sqlite = getSqlite();
  try {
    const studentNo = typeof parsed.value.studentNo === "string" ? parsed.value.studentNo.trim() : "";
    const name = typeof parsed.value.name === "string" ? parsed.value.name.trim() : "";
    if (!studentNo || studentNo.length > 30) throw new Error("学号格式无效");
    if (!name || name.length > 20) throw new Error("学生姓名格式无效");
    // Admin can specify ownerId or default to themselves
    const ownerId = typeof parsed.value.ownerId === "string" && parsed.value.ownerId ? parsed.value.ownerId : session.teacherId;
    const existing = sqlite.prepare("SELECT 1 FROM students WHERE owner_id = ? AND student_no = ?").get(ownerId, studentNo);
    if (existing) throw new Error("该教师下此学号已存在");
    const timestamp = now();
    const id = crypto.randomUUID();
    sqlite.prepare("INSERT INTO students (id, owner_id, student_no, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, ownerId, studentNo, name, timestamp, timestamp,
    );
    const row = sqlite.prepare("SELECT id, student_no AS studentNo, name, owner_id AS ownerId FROM students WHERE id = ?").get(id);
    return Response.json({ student: row }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法创建学生" }, { status: 400 });
  }
}
