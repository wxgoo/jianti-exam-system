import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { adminForbidden, requireAdminSession } from "../shared";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const rows = getSqlite().prepare(
    `SELECT a.id, a.owner_id AS ownerId, u.username AS ownerName, a.title, a.assignment_code AS assignmentCode,
            a.status, a.due_at AS dueAt, a.total_score AS totalScore, a.created_at AS createdAt
     FROM assignments a LEFT JOIN teachers u ON u.id = a.owner_id
     ORDER BY a.created_at DESC`,
  ).all();
  return Response.json({ assignments: rows });
}
