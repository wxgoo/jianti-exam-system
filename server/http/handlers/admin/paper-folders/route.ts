import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { readJsonPayload } from "../../../../../lib/request-payload";
import { now } from "../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../shared";

function cleanText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length < min || text.length > max || /[-]/.test(text)) throw new Error(`${label}无效`);
  return text;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const sqlite = getSqlite();
  const rows = sqlite.prepare(
    `SELECT f.id, f.owner_id AS ownerId, u.username AS ownerName, f.name, f.subject, f.stage, f.created_at AS createdAt
     FROM paper_folders f LEFT JOIN teachers u ON u.id = f.owner_id
     ORDER BY f.name COLLATE NOCASE`,
  ).all();
  return Response.json({ folders: rows });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const parsed = await readJsonPayload<{ name?: unknown; subject?: unknown; stage?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  try {
    const name = cleanText(parsed.value.name, "文件夹名称", 1, 60);
    const subject = typeof parsed.value.subject === "string" && parsed.value.subject.trim() ? parsed.value.subject.trim() : "数学";
    const stage = typeof parsed.value.stage === "string" && parsed.value.stage.trim() ? parsed.value.stage.trim() : "middle";
    const sqlite = getSqlite();
    if (sqlite.prepare("SELECT 1 FROM paper_folders WHERE name = ? AND owner_id = ?").get(name, session.teacherId)) {
      return Response.json({ error: "文件夹名称已存在" }, { status: 409 });
    }
    const timestamp = now();
    sqlite.prepare("INSERT INTO paper_folders (id, owner_id, name, subject, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      crypto.randomUUID(), session.teacherId, name, subject, stage, timestamp, timestamp,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法创建文件夹" }, { status: 400 });
  }
}
