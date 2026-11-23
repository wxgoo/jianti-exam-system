import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { canTransitionDocument, documentStatuses } from "../../../../../../lib/document-state";
import { readJsonPayload } from "../../../../../../lib/request-payload";
import { now } from "../../../../../../lib/server";
import { adminForbidden, requireAdminSession } from "../../shared";

type DocumentRow = { id: string; name: string; status: string; subject: string | null; grade: string | null; school: string | null; sourceRemovedAt: string | null };

function selectDocument(sqlite: ReturnType<typeof getSqlite>, documentId: string): DocumentRow | undefined {
  return sqlite.prepare("SELECT id, name, status, subject, grade, school, source_removed_at AS sourceRemovedAt FROM documents WHERE id = ?").get(documentId) as DocumentRow | undefined;
}

function cleanText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length < min || text.length > max || /[-]/.test(text)) throw new Error(`${label}无效`);
  return text;
}

export async function PATCH(request: Request, context: { params: Promise<{ documentId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { documentId } = await context.params;
  const sqlite = getSqlite();
  const document = selectDocument(sqlite, documentId);
  if (!document || document.sourceRemovedAt) return Response.json({ error: "试卷不存在或已删除" }, { status: 404 });

  const parsed = await readJsonPayload<{ name?: unknown; status?: unknown; subject?: unknown; grade?: unknown; school?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const updates: string[] = [];
  const params: unknown[] = [];
  try {
    if (parsed.value.name !== undefined) { updates.push("name = ?"); params.push(cleanText(parsed.value.name, "试卷名称", 1, 180)); }
    if (parsed.value.status !== undefined && parsed.value.status !== "") {
      if (typeof parsed.value.status !== "string" || !documentStatuses.includes(parsed.value.status as (typeof documentStatuses)[number])) {
        return Response.json({ error: "非法文档状态" }, { status: 400 });
      }
      if (!canTransitionDocument(document.status, parsed.value.status)) {
        return Response.json({ error: `不能从 ${document.status} 直接转换为 ${parsed.value.status}` }, { status: 409 });
      }
      updates.push("status = ?"); params.push(parsed.value.status);
    }
    for (const [field, label] of [["subject", "学科"], ["grade", "年级"], ["school", "学校"]] as const) {
      const value = parsed.value[field];
      if (value !== undefined && value !== null) {
        updates.push(`${field} = ?`); params.push(cleanText(value, label, 1, 60));
      } else if (value === null) {
        updates.push(`${field} = NULL`);
      }
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "试卷信息无效" }, { status: 400 });
  }
  if (updates.length) sqlite.prepare(`UPDATE documents SET ${updates.join(", ")} WHERE id = ?`).run(...params, documentId);
  const updated = selectDocument(sqlite, documentId);
  return Response.json({ document: { ...updated, subject: updated?.subject ?? null, grade: updated?.grade ?? null, school: updated?.school ?? null } });
}

export async function DELETE(request: Request, context: { params: Promise<{ documentId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { documentId } = await context.params;
  const sqlite = getSqlite();
  const document = sqlite.prepare("SELECT id, source_removed_at AS sourceRemovedAt FROM documents WHERE id = ?").get(documentId) as { id: string; sourceRemovedAt: string | null } | undefined;
  if (!document) return Response.json({ error: "试卷不存在" }, { status: 404 });
  if (document.sourceRemovedAt) return Response.json({ ok: true });
  sqlite.prepare("UPDATE documents SET source_removed_at = ? WHERE id = ?").run(now(), documentId);
  return Response.json({ ok: true });
}
