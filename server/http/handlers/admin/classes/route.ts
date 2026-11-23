import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { adminForbidden, requireAdminSession } from "../shared";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const rows = getSqlite().prepare(
    `SELECT c.id, c.owner_id AS ownerId, u.username AS ownerName, c.name, c.grade, c.subject, c.school_year AS schoolYear,
            c.archived, c.created_at AS createdAt, c.updated_at AS updatedAt, COUNT(cs.student_id) AS studentCount
     FROM teaching_classes c
     LEFT JOIN class_students cs ON cs.class_id = c.id
     LEFT JOIN teachers u ON u.id = c.owner_id
     GROUP BY c.id ORDER BY c.archived, c.updated_at DESC`,
  ).all();
  return Response.json({ classes: rows });
}
