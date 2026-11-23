import { requestOwner } from "../../../../../lib/server";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { getStudentStats, getPracticeHistory } from "../../../../../lib/learning-record";

export async function GET(request: Request) {
  await ensureDatabase();
  const ownerId = requestOwner(request);
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") || undefined;

  const stats = getStudentStats(ownerId, studentId);
  const history = getPracticeHistory(ownerId, studentId, 20);

  return Response.json({ stats, history });
}
