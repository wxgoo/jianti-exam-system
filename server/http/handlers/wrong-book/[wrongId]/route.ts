import { readJsonPayload } from "../../../../../lib/request-payload";
import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import {
  markWrongRecordMastery,
  closeWrongRecord,
  getWrongRecord,
  type WrongRecord,
} from "../../../../../lib/wrong-book";

export async function PATCH(request: Request, context: { params: Promise<{ wrongId: string }> }) {
  await ensureDatabase();
  const { wrongId } = await context.params;
  const ownerId = requestOwner(request);

  const existing = getWrongRecord(ownerId, wrongId);
  if (!existing) return Response.json({ error: "错题记录不存在" }, { status: 404 });

  const parsed = await readJsonPayload<{
    masteryLevel?: "unfamiliar" | "learning" | "mastered";
    status?: "open" | "closed";
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  if (payload.masteryLevel) {
    markWrongRecordMastery(ownerId, wrongId, payload.masteryLevel);
  }
  if (payload.status) {
    closeWrongRecord(ownerId, wrongId);
  }

  const updated = getWrongRecord(ownerId, wrongId);
  return Response.json(updated);
}

export async function DELETE(request: Request, context: { params: Promise<{ wrongId: string }> }) {
  await ensureDatabase();
  const { wrongId } = await context.params;
  const ownerId = requestOwner(request);

  const existing = getWrongRecord(ownerId, wrongId);
  if (!existing) return Response.json({ error: "错题记录不存在" }, { status: 404 });

  closeWrongRecord(ownerId, wrongId);
  return Response.json({ ok: true });
}
