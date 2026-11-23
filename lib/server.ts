import "server-only";
import { tenantContext } from "../server/core/tenant";
import { parseSessionToken, SESSION_COOKIE, type TeacherSession } from "./auth";

export type RuntimeConfig = {
  MODEL_KEY_ENCRYPTION_SECRET?: string;
};

export function runtimeEnv(): RuntimeConfig {
  return {
    MODEL_KEY_ENCRYPTION_SECRET: process.env.MODEL_KEY_ENCRYPTION_SECRET,
  };
}

export function requestOwner(request: Request) {
  const tenant = tenantContext.getStore();
  if (tenant) return tenant.ownerId;
  if (process.env.JIANTI_DEPLOYMENT_MODE === "remote") throw new Error("远端请求缺少已验证的租户上下文");

  // 优先从 Cookie Session 获取教师 ID（多租户模式）
  const cookie = request.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    if (match) {
      const session = parseSessionToken(match[1]);
      if (session) return session.teacherId;
    }
  }

  return request.headers.get("oai-authenticated-user-id") ?? "local-demo";
}

/** 从请求中解析当前教师会话（用于前端页面获取教师信息） */
export function requestTeacherSession(request: Request): TeacherSession | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return parseSessionToken(match[1]);
}

export function now() {
  return new Date().toISOString();
}
