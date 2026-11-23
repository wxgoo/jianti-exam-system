import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { adminForbidden, requireAdminSession } from "../shared";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const sqlite = getSqlite();
  const rows = sqlite.prepare(
    `SELECT p.id, p.owner_id AS ownerId, u.username AS ownerName, p.title, COALESCE(p.subtitle, '') AS subtitle,
            (SELECT COUNT(*) FROM paper_items pi WHERE pi.paper_id = p.id) AS questionCount,
            json_extract(p.settings_json, '$.subject') AS subject, json_extract(p.settings_json, '$.stage') AS stage,
            p.created_at AS createdAt, p.updated_at AS updatedAt
     FROM papers p LEFT JOIN teachers u ON u.id = p.owner_id
     ORDER BY p.updated_at DESC`,
  ).all();
  return Response.json({ papers: rows });
}
