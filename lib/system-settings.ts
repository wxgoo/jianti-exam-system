import { getSqlite } from "../db";
import { now } from "./server";

/** 系统级设置（由管理员后台管理，供注册门控等全局逻辑读取）。 */
export type SystemSettings = {
  appName: string;
  registrationOpen: boolean;
  siteNotice: string;
};

export function readSystemSettings(sqlite = getSqlite()): SystemSettings {
  const rows = sqlite.prepare("SELECT id, value FROM system_settings").all() as Array<{ id: string; value: string }>;
  const map = new Map(rows.map((row) => [row.id, row.value]));
  const appName = typeof map.get("app_name") === "string" && (map.get("app_name") as string).trim() ? (map.get("app_name") as string).trim() : "拣题";
  return {
    appName: appName.slice(0, 40),
    registrationOpen: map.get("registration_open") !== "0",
    siteNotice: typeof map.get("site_notice") === "string" ? (map.get("site_notice") as string).slice(0, 500) : "",
  };
}

export function writeSystemSetting(sqlite: ReturnType<typeof getSqlite>, id: string, value: string): void {
  sqlite.prepare(
    "INSERT INTO system_settings (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(id, value, now());
}
