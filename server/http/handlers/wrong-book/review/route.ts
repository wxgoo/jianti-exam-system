import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { getDueForReview } from "../../../../../lib/wrong-book";

export async function GET(request: Request) {
  await ensureDatabase();
  const ownerId = requestOwner(request);
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20;

  const records = getDueForReview(ownerId, studentId, limit);
  return Response.json({ records, count: records.length });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const ownerId = requestOwner(request);
  const parsed = await request.json().catch(() => null) as { wrongId: string; masteryLevel: "unfamiliar" | "learning" | "mastered" } | null;
  if (!parsed) return Response.json({ error: "请求格式无效" }, { status: 400 });

  const { markWrongRecordMastery } = await import("../../../../../lib/wrong-book");
  const ok = markWrongRecordMastery(ownerId, parsed.wrongId, parsed.masteryLevel);
  if (!ok) return Response.json({ error: "错题记录不存在" }, { status: 404 });

  return Response.json({ ok: true });
}
