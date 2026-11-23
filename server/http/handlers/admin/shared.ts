import type Database from "better-sqlite3";
import { getSqlite } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import type { TeacherSession } from "../../../../lib/auth";
import { requestTeacherSession } from "../../../../lib/server";

/** 管理员会话校验：仅 role === "admin" 的教师可访问 */
export function requireAdminSession(request: Request): TeacherSession | null {
  const session = requestTeacherSession(request);
  return session?.role === "admin" ? session : null;
}

export function adminForbidden(): Response {
  return Response.json({ error: "需要管理员权限" }, { status: 403 });
}

function count(sqlite: Database.Database, sql: string, params: unknown[] = []): number {
  return (sqlite.prepare(sql).get(...params) as { c: number }).c;
}

export async function adminStats(): Promise<Record<string, number>> {
  await ensureDatabase();
  const sqlite = getSqlite();
  return {
    teachers: count(sqlite, "SELECT COUNT(*) AS c FROM teachers"),
    documents: count(sqlite, "SELECT COUNT(*) AS c FROM documents WHERE source_removed_at IS NULL"),
    questions: count(sqlite, "SELECT COUNT(*) AS c FROM questions"),
    approvedQuestions: count(sqlite, "SELECT COUNT(*) AS c FROM questions WHERE status = 'approved'"),
    papers: count(sqlite, "SELECT COUNT(*) AS c FROM papers"),
    wrongRecords: count(sqlite, "SELECT COUNT(*) AS c FROM wrong_records"),
    classes: count(sqlite, "SELECT COUNT(*) AS c FROM teaching_classes"),
    students: count(sqlite, "SELECT COUNT(*) AS c FROM students"),
    assignments: count(sqlite, "SELECT COUNT(*) AS c FROM assignments"),
    learningRecords: count(sqlite, "SELECT COUNT(*) AS c FROM learning_records"),
  };
}
