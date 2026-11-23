import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { readJsonPayload } from "../../../../../../lib/request-payload";
import { now } from "../../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../../shared";

function cleanText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length < min || text.length > max || /[-]/.test(text)) throw new Error(`${label}无效`);
  return text;
}

export async function DELETE(request: Request, context: { params: Promise<{ folderId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { folderId } = await context.params;
  const sqlite = getSqlite();
  const result = sqlite.prepare("DELETE FROM paper_folders WHERE id = ?").run(folderId);
  if (!result.changes) return Response.json({ error: "文件夹不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
