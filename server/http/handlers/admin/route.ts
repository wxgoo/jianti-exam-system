import { ensureDatabase } from "../../../../db/bootstrap";
import { adminForbidden, adminStats, requireAdminSession } from "./shared";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  return Response.json({ admin: session, stats: await adminStats() });
}
