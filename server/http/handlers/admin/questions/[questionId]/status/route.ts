import { ensureDatabase } from "../../../../../../../db/bootstrap";
import { getSqlite } from "../../../../../../../db";
import { readJsonPayload } from "../../../../../../../lib/request-payload";
import { adminForbidden, requireAdminSession } from "../../../shared";

export async function POST(request: Request, context: { params: Promise<{ questionId: string }> }) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const { questionId } = await context.params;
  const allowed = new Set(["pending", "approved", "failed"]);
  const parsed = await readJsonPayload<{ status?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  if (typeof parsed.value.status !== "string" || !allowed.has(parsed.value.status)) {
    return Response.json({ error: "题目状态只能是 pending / approved / failed" }, { status: 400 });
  }
  const sqlite = getSqlite();
  const result = sqlite.prepare("UPDATE questions SET status = ? WHERE id = ? AND status <> ?").run(parsed.value.status, questionId, parsed.value.status);
  if (!result.changes) return Response.json({ error: "题目不存在" }, { status: 404 });
  return Response.json({ ok: true, status: parsed.value.status });
}
