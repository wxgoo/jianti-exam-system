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
    `SELECT wr.id, wr.owner_id AS ownerId, u.username AS ownerName, wr.question_id AS questionId,
            q.stem, q.type, d.name AS documentName, wr.user_answer AS userAnswer, wr.correct_answer AS correctAnswer,
            wr.wrong_reason AS wrongReason, wr.first_wrong_at AS firstWrongAt, wr.last_reviewed_at AS lastReviewedAt,
            wr.review_count AS reviewCount, wr.mastery_level AS masteryLevel, wr.status, wr.created_at AS createdAt
     FROM wrong_records wr
     LEFT JOIN teachers u ON u.id = wr.owner_id
     LEFT JOIN questions q ON q.id = wr.question_id
     LEFT JOIN documents d ON d.id = q.document_id
     ORDER BY wr.updated_at DESC LIMIT ? OFFSET ?`,
  ).all(pageSize, offset);
  const total = (sqlite.prepare("SELECT COUNT(*) AS c FROM wrong_records").get() as { c: number }).c;
  return Response.json({ records: rows, pagination: { page, pageSize, total } });
}
