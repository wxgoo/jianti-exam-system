/**
 * jianti-exam-system — Windows 一键部署（完整）
 *
 * Steps:
 *   1. Check Node version (>= 22.13.0)
 *   2. npm ci (if node_modules missing)
 *   3. npm run build (if .next missing OR source newer than .next)
 *   4. Background start full stack (Web :3050 / API :3051)
 *   5. Poll /api/ready until ready
 *   6. Print URLs
 *
 * CLI flags:
 *   --force-build    rebuild even if .next looks fresh
 *   --skip-build     never build (assumes .next is already good)
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const webPort = Number(process.env.JIANTI_WEB_PORT ?? 3050);
const apiPort = Number(process.env.JIANTI_API_PORT ?? 3051);
const forceBuild = process.argv.includes("--force-build");
const skipBuild  = process.argv.includes("--skip-build");

function out(text = "") { console.log(text); }

function checkNode() {
  const version = process.versions.node;
  const parts = version.split(".").map(Number);
  const ok = parts[0] > 22 || (parts[0] === 22 && parts[1] >= 13);
  out(`[INFO] Node.js: v${version}`);
  if (!ok) {
    out("[ERROR] Node.js too old. Need >= 22.13.0 (https://nodejs.org)");
    process.exit(1);
  }
}

function run(cmd, args) {
  out(`[INFO] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" });
  if (result.status !== 0) {
    out(`[ERROR] ${cmd} failed.`);
    process.exit(1);
  }
}

// Walk all files under a directory (recursive). Returns paths.
function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".")) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * Compare .next mtime vs source tree mtime.
 * Returns true if build is needed.
 */
function needsBuild() {
  const buildId = path.join(root, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) { out("[INFO] .next/BUILD_ID missing -> build needed"); return true; }

  const nextMtime = fs.statSync(buildId).mtimeMs;
  out(`[INFO] .next built at ${new Date(nextMtime).toLocaleString()}`);

  // Directories whose changes should trigger a rebuild
  const sourceDirs = ["app", "server", "components", "lib", "scripts", "db", "public"];
  const sourceFiles = ["package.json", "package-lock.json", "next.config.ts", "next.config.mjs",
                       "tailwind.config.ts", "tailwind.config.js", "postcss.config.mjs",
                       "postcss.config.js", "tsconfig.json"];

  const checkDir = (d) => {
    const full = path.join(root, d);
    if (!fs.existsSync(full)) return null;
    const files = walk(full);
    // Fast path: scan max 2000 files, bail early on first newer
    let newest = 0;
    for (const f of files) {
      // skip node_modules inside scripts, etc.
      if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
      // skip Next.js cache dirs we might have nested elsewhere
      if (f.includes(`${path.sep}.next${path.sep}`)) continue;
      const m = fs.statSync(f).mtimeMs;
      if (m > nextMtime) {
        out(`[INFO] Source newer than .next: ${path.relative(root, f)} -> rebuild needed`);
        return true;
      }
      if (m > newest) newest = m;
    }
    return newest;
  };

  for (const d of sourceDirs) {
    const r = checkDir(d);
    if (r === true) return true;
  }
  for (const f of sourceFiles) {
    const full = path.join(root, f);
    if (fs.existsSync(full)) {
      const m = fs.statSync(full).mtimeMs;
      if (m > nextMtime) {
        out(`[INFO] Source newer than .next: ${f} -> rebuild needed`);
        return true;
      }
    }
  }
  out("[INFO] .next is fresh, skipping build. (Use --force-build to rebuild anyway)");
  return false;
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

// ===== main =====
checkNode();

// deps
const nodeModules = path.join(root, "node_modules");
if (!fs.existsSync(nodeModules)) {
  run("npm", ["ci", "--omit=dev"]);
} else {
  out("[INFO] node_modules present, skipping npm ci");
}

// build
if (skipBuild) {
  out("[INFO] --skip-build: skipping build by user request");
} else if (forceBuild) {
  out("[INFO] --force-build: rebuilding by user request");
  run("npm", ["run", "build"]);
} else if (needsBuild()) {
  run("npm", ["run", "build"]);
}
// else: .next fresh, skip build

// launch
out(`[start] Launching background (Web http://127.0.0.1:${webPort} / API :${apiPort})`);
startDetached();

if (!(await waitReady())) {
  out("[ERROR] Service did not become ready. Check .runtime/logs/");
  process.exit(1);
}

out("");
out("========================================");
out("  Deployed - service is running");
out("========================================");
out(`[URL] Web:     http://127.0.0.1:${webPort}`);
out(`[URL] API:     http://127.0.0.1:${apiPort}`);
out(`[URL] Health:  GET http://127.0.0.1:${webPort}/api/ready`);
out("");
out("[stop] node scripts/stop-local.mjs");
out("");
