import { ensureDatabase } from "../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../db";
import { readJsonPayload } from "../../../../../../lib/request-payload";
import { closeWrongRecord, getWrongRecord, markWrongRecordMastery } from "../../../../../../lib/wrong-book";
import { adminForbidden, requireAdminSession } from "../../shared";

export async function PATCH(request: Request, context: { params: Promise<{ wrongId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { wrongId } = await context.params;
  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT id, owner_id AS ownerId FROM wrong_records WHERE id = ?").get(wrongId) as { id: string; ownerId: string } | undefined;
  if (!row) return Response.json({ error: "错题记录不存在" }, { status: 404 });

  const parsed = await readJsonPayload<{ masteryLevel?: unknown; status?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  try {
    if (parsed.value.masteryLevel !== undefined) {
      if (!["unfamiliar", "learning", "mastered"].includes(parsed.value.masteryLevel as string)) {
        return Response.json({ error: "掌握度只能是 unfamiliar / learning / mastered" }, { status: 400 });
      }
      markWrongRecordMastery(row.ownerId, wrongId, parsed.value.masteryLevel as "unfamiliar" | "learning" | "mastered");
    }
    if (parsed.value.status !== undefined) {
      if (parsed.value.status !== "open" && parsed.value.status !== "closed") {
        return Response.json({ error: "状态只能是 open / closed" }, { status: 400 });
      }
      closeWrongRecord(row.ownerId, wrongId);
    }
  } catch {
    // 忽略空更新
  }
  const updated = getWrongRecord(row.ownerId, wrongId);
  return Response.json({ record: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ wrongId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { wrongId } = await context.params;
  const sqlite = getSqlite();
  const result = sqlite.prepare("DELETE FROM wrong_records WHERE id = ?").run(wrongId);
  if (!result.changes) return Response.json({ error: "错题记录不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
