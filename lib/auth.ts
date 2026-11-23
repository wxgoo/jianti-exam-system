/**
 * 教师认证模块（多租户：学校+科目共享题库，个人数据隔离）
 * 使用简单的 Cookie Session，避免引入复杂的第三方依赖
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const SESSION_SECRET = process.env.JIANTI_AUTH_SECRET || "jianti-default-secret-change-me";
const SESSION_COOKIE = "jianti-session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export type TeacherSession = {
  teacherId: string;
  username: string;
  name: string;
  school: string;
  subject: string;
  role: string;
  exp: number;
};

/** 对密码进行哈希（格式：salt:hash，存储在同一字段） */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return `${salt}:${hash}`;
}

/** 验证密码 */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = createHmac("sha256", salt).update(password).digest("hex");
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

/** 创建会话令牌（Base64 URL 编码的 JSON，带 HMAC 签名） */
export function createSessionToken(teacher: TeacherSession): string {
  const payload = JSON.stringify(teacher);
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** 解析并验证会话令牌 */
export function parseSessionToken(token: string): TeacherSession | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const dot = raw.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (!timingSafeEqual(Buffer.from(sig, "base64url"), Buffer.from(expected, "base64url"))) return null;
    const session = JSON.parse(payload) as TeacherSession;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE };
