import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { adminForbidden, requireAdminSession } from "../shared";

type QuestionRow = {
  id: string;
  documentId: string;
  documentName: string;
  ownerName: string | null;
  subject: string | null;
  grade: string | null;
  type: string;
  number: string;
  status: string;
  difficulty: string;
  score: number;
  stem: string;
  createdAt: string;
};

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject")?.trim() || null;
  const type = url.searchParams.get("type")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const search = url.searchParams.get("search")?.trim().slice(0, 80) || null;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? 1) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? 50) || 50)));
  const offset = (page - 1) * pageSize;
  const sqlite = getSqlite();

  const baseWhere = ["d.source_removed_at IS NULL"];
  const baseParams: unknown[] = [];
  if (type && ["single", "multiple", "fill", "answer"].includes(type)) { baseWhere.push("q.type = ?"); baseParams.push(type); }
  if (status && ["pending", "approved", "failed"].includes(status)) { baseWhere.push("q.status = ?"); baseParams.push(status); }
  if (search) {
    baseWhere.push("q.stem LIKE ? ESCAPE '\\'");
    baseParams.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const baseWhereSql = baseWhere.join(" AND ");
  const whereSql = subject ? `${baseWhereSql} AND d.subject = ?` : baseWhereSql;
  const params = subject ? [...baseParams, subject] : baseParams;

  const rows = sqlite.prepare(
    `SELECT q.id, q.document_id AS documentId, d.name AS documentName, u.username AS ownerName,
            d.subject AS subject, d.grade AS grade, q.type, q.number, q.status, q.difficulty, q.score,
            q.stem, q.created_at AS createdAt
     FROM questions q
     JOIN documents d ON d.id = q.document_id
     LEFT JOIN teachers u ON u.id = d.owner_id
     WHERE ${whereSql}
     ORDER BY d.updated_at DESC, q.created_at DESC, q.number
     LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, offset) as QuestionRow[];
  const total = (sqlite.prepare(`SELECT COUNT(*) AS c FROM questions q JOIN documents d ON d.id = q.document_id WHERE ${whereSql}`).get(...params) as { c: number }).c;
  const subjects = sqlite.prepare(
    `SELECT d.subject AS subject, COUNT(*) AS count
     FROM questions q JOIN documents d ON d.id = q.document_id
     WHERE ${baseWhereSql} AND d.subject IS NOT NULL AND TRIM(d.subject) <> ''
     GROUP BY d.subject
     ORDER BY count DESC, d.subject`,
  ).all(...baseParams) as Array<{ subject: string; count: number }>;
  const filteredTotal = (sqlite.prepare(`SELECT COUNT(*) AS c FROM questions q JOIN documents d ON d.id = q.document_id WHERE ${baseWhereSql}`).get(...baseParams) as { c: number }).c;
  return Response.json({ questions: rows, pagination: { page, pageSize, total }, subjects, filteredTotal });
}
