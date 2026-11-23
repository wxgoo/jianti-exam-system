/**
 * 教师认证 API（多租户：学校+科目共享题库，个人数据隔离）
 * POST /api/auth/login    - 登录
 * POST /api/auth/register - 注册（首个注册者自动成为 admin）
 * POST /api/auth/logout   - 登出
 * GET  /api/auth/me       - 获取当前教师信息
 */

import { readJsonPayload } from "../../../../lib/request-payload";
import { getSqlite } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { readSystemSettings } from "../../../../lib/system-settings";
import { createSessionToken, verifyPassword, hashPassword, SESSION_COOKIE } from "../../../../lib/auth";
import type { TeacherSession } from "../../../../lib/auth";

export async function POST(request: Request, context: { params: Promise<{ action: string | string[] }> }) {
  await ensureDatabase();
  const rawAction = await context.params;
  const action = Array.isArray(rawAction.action) ? rawAction.action.join("/") : rawAction.action;
  if (action === "logout") {
    return new Response(null, {
      status: 204,
      headers: {
        "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
      },
    });
  }

  const parsed = await readJsonPayload<{
    username?: string;
    password?: string;
    name?: string;
    school?: string;
    subject?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  const sqlite = getSqlite();

  if (action === "register") {
    if (typeof payload.username !== "string" || !payload.username.trim()) {
      return Response.json({ error: "用户名不能为空" }, { status: 400 });
    }
    if (typeof payload.password !== "string" || payload.password.length < 6) {
      return Response.json({ error: "密码长度至少 6 位" }, { status: 400 });
    }
    if (typeof payload.name !== "string" || !payload.name.trim()) {
      return Response.json({ error: "姓名不能为空" }, { status: 400 });
    }
    if (typeof payload.school !== "string" || !payload.school.trim()) {
      return Response.json({ error: "学校不能为空" }, { status: 400 });
    }
    if (typeof payload.subject !== "string" || !payload.subject.trim()) {
      return Response.json({ error: "学科不能为空" }, { status: 400 });
    }

    const existing = sqlite.prepare("SELECT id FROM teachers WHERE username = ?").get(payload.username.trim());
    if (existing) {
      return Response.json({ error: "用户名已存在" }, { status: 409 });
    }
    if (!readSystemSettings(sqlite).registrationOpen) {
      return Response.json({ error: "注册暂时关闭，请联系管理员" }, { status: 400 });
    }

    // 首个注册者自动成为 admin
    const count = sqlite.prepare("SELECT COUNT(*) AS c FROM teachers").get({}) as { c: number };
    const role = count.c === 0 ? "admin" : "teacher";

    const passwordHash = hashPassword(payload.password);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    sqlite.prepare(
      `INSERT INTO teachers (id, username, password_hash, name, school, subject, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, payload.username.trim(), passwordHash, payload.name.trim(), payload.school.trim(), payload.subject.trim(), role, now);

    const session = createSessionToken({
      teacherId: id,
      username: payload.username.trim(),
      name: payload.name.trim(),
      school: payload.school.trim(),
      subject: payload.subject.trim(),
      role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return Response.json({ ok: true, teacher: { id, username: payload.username.trim(), name: payload.name.trim(), school: payload.school.trim(), subject: payload.subject.trim(), role } }, {
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${session}; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; SameSite=Lax`,
      },
    });
  }

  if (action === "login") {
    if (typeof payload.username !== "string" || !payload.username.trim()) {
      return Response.json({ error: "用户名不能为空" }, { status: 400 });
    }
    if (typeof payload.password !== "string") {
      return Response.json({ error: "密码不能为空" }, { status: 400 });
    }

    const teacher = sqlite.prepare("SELECT * FROM teachers WHERE username = ?").get(payload.username.trim()) as {
      id: string; username: string; password_hash: string; name: string; school: string; subject: string; role: string;
    } | undefined;
    if (!teacher) {
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    if (!verifyPassword(payload.password, teacher.password_hash)) {
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const session = createSessionToken({
      teacherId: teacher.id,
      username: teacher.username,
      name: teacher.name,
      school: teacher.school,
      subject: teacher.subject,
      role: teacher.role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return Response.json({ ok: true, teacher: { id: teacher.id, username: teacher.username, name: teacher.name, school: teacher.school, subject: teacher.subject, role: teacher.role } }, {
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${session}; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; SameSite=Lax`,
      },
    });
  }

  return Response.json({ error: "未知的认证请求" }, { status: 400 });
}

export async function GET(request: Request, context: { params: Promise<{ action: string | string[] }> }) {
  await ensureDatabase();
  const rawAction = await context.params;
  const action = Array.isArray(rawAction.action) ? rawAction.action.join("/") : rawAction.action;
  if (action !== "me") {
    return Response.json({ error: "未知的认证请求" }, { status: 400 });
  }
  const { requestTeacherSession } = await import("../../../../lib/server").then((m) => ({ requestTeacherSession: m.requestTeacherSession }));
  const session = requestTeacherSession(request);
  if (!session) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  return Response.json({ ok: true, teacher: session });
}
