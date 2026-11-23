# BIG — 项目设计概览

## 架构
B/S：Next.js 16（前端）→ NestJS（后端）→ SQLite（better-sqlite3）。
- 前端：Next.js 16 Turbopack，`app/api/*` 代理后端（`lib/backend-client.ts`）
- 后端：`server/http/routes.ts` 注册路由，`lib/` 共享逻辑，`db/` schema/migrations（DATABASE_VERSION = 13）

## 核心设计决策
- 多租户（学校+学科）：`teachers` 表，`documents.school` 字段，题库共享 SQL `d.owner_id = ? OR d.school = ?`
- 认证：HMAC-SHA256 签名 token（`jianti-session`，7 天）
- 业务隔离：组卷/错题/记录按 teacher_id 隔离

## 模块解析
1. 试题学习考试系统核心：取题→筛选→入库→抽题→组卷→出卷→出答案→考评→讲解→记录→错题→管理
2. 教师认证：v13 多租户
3. 三格式导出：Word/PDF/LaTeX
4. 学校模式：作业批改

## 安全边界
- 路径遍历拒绝（相对数据目录）
- 并发数限制
- 上传和转换路径分离
- 防数据库直接写入（API 独占写权限）

## 测试策略
- node --test（tests/*.test.mjs），目标 ≥ 280 pass
- 环境边界：better-sqlite3 在 Windows 下的某些既有测试可能失败（没 C++ 编译器），非回归
