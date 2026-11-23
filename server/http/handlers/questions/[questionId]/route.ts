import { saveQuestion } from "../../../../services/question-review";
import { toResponse } from "../../../../core/result";
import { readJsonPayload } from "../../../../../lib/request-payload";
import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";

export async function GET(request: Request, context: { params: Promise<{ questionId: string }> }) {
  await ensureDatabase();
  const { questionId } = await context.params;
  const ownerId = requestOwner(request);
  const sqlite = getSqlite();

  const question = sqlite.prepare(
    `SELECT q.*, d.name AS documentName, d.subject, d.grade
      FROM questions q JOIN documents d ON d.id = q.document_id
      WHERE q.id = ? AND d.owner_id = ?`,
  ).get(questionId, ownerId) as { id: string; number: string; type: string; stem: string; options_json: string | null; answer: string; analysis: string; difficulty: string; documentName: string; subject: string; grade: string } | undefined;
  if (!question) return Response.json({ error: "题目不存在" }, { status: 404 });

  return Response.json({ question });
}

export async function PUT(request: Request, context: { params: Promise<{ questionId: string }> }) {
  const payload = await readJsonPayload<Record<string, unknown>>(request);
  if (!payload.ok) return payload.response;
  const { questionId } = await context.params;
  return toResponse(await saveQuestion(requestOwner(request), questionId, payload.value));
}
