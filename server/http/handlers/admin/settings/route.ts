import { ensureDatabase } from "../../../../../db/bootstrap";
import { getSqlite } from "../../../../../db";
import { readJsonPayload } from "../../../../../lib/request-payload";
import { readSystemSettings, writeSystemSetting } from "../../../../../lib/system-settings";
import { adminForbidden, requireAdminSession } from "../shared";

function validateSettings(value: { appName?: unknown; registrationOpen?: unknown; siteNotice?: unknown }) {
  if (value.appName !== undefined && (typeof value.appName !== "string" || !value.appName.trim() || value.appName.trim().length > 40)) {
    throw new Error("应用名称格式无效");
  }
  if (value.registrationOpen !== undefined && typeof value.registrationOpen !== "boolean") throw new Error("注册开关格式无效");
  if (value.siteNotice !== undefined && (typeof value.siteNotice !== "string" || value.siteNotice.trim().length > 500)) {
    throw new Error("公告格式无效");
  }
  return {
    appName: typeof value.appName === "string" ? value.appName.trim() : undefined,
    registrationOpen: value.registrationOpen,
    siteNotice: typeof value.siteNotice === "string" ? value.siteNotice.trim() : undefined,
  };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  return Response.json({ settings: readSystemSettings() });
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const session = requireAdminSession(request);
  if (!session) return adminForbidden();
  const parsed = await readJsonPayload<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  let changes: ReturnType<typeof validateSettings>;
  try {
    changes = validateSettings(parsed.value);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "系统设置无效" }, { status: 400 });
  }
  const sqlite = getSqlite();
  if (changes.appName !== undefined) writeSystemSetting(sqlite, "app_name", changes.appName);
  if (changes.registrationOpen !== undefined) writeSystemSetting(sqlite, "registration_open", changes.registrationOpen ? "1" : "0");
  if (changes.siteNotice !== undefined) writeSystemSetting(sqlite, "site_notice", changes.siteNotice);
  return Response.json({ settings: readSystemSettings() });
}
