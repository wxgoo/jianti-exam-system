import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { adminForbidden, requireAdminSession } from "../shared";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const url = new URL(request.url);
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? 1) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? 50) || 50)));
  const offset = (page - 1) * pageSize;
  const sqlite = getSqlite();
  const rows = sqlite.prepare(
    `SELECT d.id, d.owner_id AS ownerId, u.username AS ownerName, d.name, d.status, d.subject, d.grade,
            d.school, d.page_count AS pageCount, d.created_at AS createdAt, d.updated_at AS updatedAt
     FROM documents d LEFT JOIN teachers u ON u.id = d.owner_id
     WHERE d.source_removed_at IS NULL
     ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`,
  ).all(pageSize, offset);
  const total = (sqlite.prepare("SELECT COUNT(*) AS c FROM documents WHERE source_removed_at IS NULL").get() as { c: number }).c;
  return Response.json({ documents: rows, pagination: { page, pageSize, total } });
}
