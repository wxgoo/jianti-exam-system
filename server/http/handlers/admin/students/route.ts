import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { adminForbidden, requireAdminSession } from "../shared";

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
