import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminConsole } from "../../components/AdminConsole";
import { requestTeacherSession } from "../../lib/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const requestHeaders = await headers();
  const session = requestTeacherSession(new Request(`${process.env.APP_BASE_URL ?? "http://127.0.0.1:3050"}/api/admin`, { headers: requestHeaders }));
  if (!session || session.role !== "admin") redirect("/");
  return <AdminConsole />;
}
