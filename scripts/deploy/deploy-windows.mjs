/**
 * jianti-exam-system — Windows 一键部署（完整）
 *
 * 步骤：
 *   1. 检查 Node 版本（>= 22.13.0）
 *   2. npm install（未安装依赖时执行）
 *   3. npm run build（生产构建）
 *   4. 后台启动全栈服务（Web http://127.0.0.1:3050 / API http://127.0.0.1:3051）
 *   5. 轮询 http://127.0.0.1:3050/api/ready 等待就绪
 *   6. 打印访问地址与后续步骤
 *
 * 用法：在命令行或双击 `deploy-windows.bat` 执行。
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const webPort = Number(process.env.JIANTI_WEB_PORT ?? 3050);
const apiPort = Number(process.env.JIANTI_API_PORT ?? 3051);

function out(text = "") { console.log(text); }

function checkNode() {
  const version = process.versions.node;
  const parts = version.split(".").map(Number);
  const ok = parts[0] > 22 || (parts[0] === 22 && parts[1] >= 13);
  out(`[INFO] Node.js 版本: v${version}`);
  if (!ok) {
    out("[ERROR] Node.js 版本过低：engines 要求 >= 22.13.0。");
    out("[ERROR] 请安装 Node.js 22.x LTS（https://nodejs.org/en/download/releases）后重新运行。");
    process.exit(1);
  }
}

function run(cmd, args) {
  out(`[INFO] 执行：${cmd} ${args.join(" ")} ...`);
  // Windows: npm 是 .cmd 脚本，需要 shell 才能执行
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" });
  if (result.status !== 0) {
    out(`[ERROR] ${cmd} ${args.join(" ")} 执行失败。`);
    process.exit(1);
  }
}

function startDetached() {
  const child = spawn(process.execPath, ["scripts/run-local.mjs"], {
    cwd: root, detached: true, stdio: "ignore", windowsHide: true,
  });
  child.unref();
  return child.pid;
}

async function waitReady(timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3050/api/ready");
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

checkNode();

if (!existsSync(path.join(root, "node_modules"))) {
  run("npm", ["install"]);
} else {
  out("[INFO] node_modules 已存在，跲跳过 npm install（删除 node_modules 后可强制重装）");
}

out("[INFO] 构建生产环境 (npm run build) ...");
run("npm", ["run", "build"]);

out(`[start] 启动服务 (Web http://127.0.0.1:${webPort} / API http://127.0.0.1:${apiPort})，已切到后台运行 ...`);
startDetached();

if (!(await waitReady())) {
  out("[ERROR] 服务未就绪（超时），请查看日志（.runtime/logs/）。");
  process.exit(1);
}

out("");
out("========================================");
out("  部署完成 — 服务已在后台运行");
out("========================================");
out(`[URL] Web:  http://127.0.0.1:${webPort}`);
out(`[URL] API:  http://127.0.0.1:${apiPort}`);
out(`[URL] 健康: GET http://127.0.0.1:${webPort}/api/ready`);
out("");
out(`[next] 首次使用：浏览器打开 http://127.0.0.1:${webPort} ，`);
out(`       没有账号可去 http://127.0.0.1:${webPort}/register 注册，`);
out("       第一个注册的教师自动成为 admin。");
out("");
out("[stop] 停止服务：node scripts/stop-local.mjs");
out("");
