/**
 * 跨平台归档解压服务（.rar / .zip / .7z）。
 *
 * 设计思路（吸取 macOS unrar 缺失 / Windows Docker 安装失败的经验）：
 *  1. 探测链：依次尝试 unrar, 7z, bsdtar, unar, rarfile(Python)
 *  2. 每个后端都用 spawnSync，从 stderr/stdout 文本确认是否"真正可用"
 *  3. 全部缺失时返回"未找到任何解压后端 + 安装提示"
 *     而不是静默失败或继续尝试联网安装
 *
 * rarfile 模块本身不包含二进制，但它会在运行时探测系统里的 unrar/bsdtar/7z/unar。
 * 所以 rarfile 是 Python 封装的"系统解压后端"，不是独立后端。
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

type Backend = "unrar" | "7z" | "bsdtar" | "unar" | "rarfile";

type ProbeResult = {
  backend: Backend;
  executable: string;
  version?: string;
};

const PROBE_ORDER: Record<NodeJS.Platform, Backend[]> = {
  win32: ["7z", "unrar", "rarfile"],
  darwin: ["unar", "7z", "bsdtar", "rarfile"],
  linux: ["unrar", "unar", "7z", "bsdtar", "rarfile"],
  aix: ["unrar"],
  android: ["unrar"],
  freebsd: ["unrar", "bsdtar"],
  haiku: ["unrar"],
  openbsd: ["unrar", "bsdtar"],
  sunos: ["unrar"],
  cygwin: ["unrar", "7z"],
  netbsd: ["unrar", "bsdtar"],
};

const ARCHIVE_EXTS = [".rar", ".zip", ".7z", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2"];

/** 探测缓存（1 分钟） */
let _cached: ProbeResult | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export function probeBackend(): ProbeResult | null {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;
  _cached = null;
  _cachedAt = now;
  const order = PROBE_ORDER[process.platform] ?? PROBE_ORDER.linux;
  for (const backend of order) {
    const probe = tryBackend(backend);
    if (probe) { _cached = probe; return probe; }
  }
  return null;
}

function tryBackend(backend: Backend): ProbeResult | null {
  for (const exe of getCandidateExecutables(backend)) {
    if (!exe) continue;
    try {
      const result = spawnSync(exe, probeArgs(backend), {
        windowsHide: true,
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const combined = (result.stdout?.toString("utf8") ?? "") + (result.stderr?.toString("utf8") ?? "");
      if (!isBackendAlive(backend, combined, result.status)) continue;
      return { backend, executable: exe, version: extractVersion(combined) };
    } catch { /* 下一个 */ }
  }
  return null;
}

function getCandidateExecutables(backend: Backend): string[] {
  switch (backend) {
    case "unrar": {
      if (process.platform === "win32") {
        const winrarCommon = [
          findInCommonLocations("UnRAR.exe", [
            "C:\\Program Files\\WinRAR",
            "C:\\Program Files (x86)\\WinRAR",
          ]),
        ];
        const candidates = [
          "unrar.exe", "UnRAR.exe",
          findInPath("UnRAR.exe"), findInPath("unrar.exe"),
          ...winrarCommon,
        ];
        return candidates.filter((c): c is string => Boolean(c));
      }
      return ["unrar", "/usr/bin/unrar", "/usr/local/bin/unrar"];
    }
    case "7z": {
      if (process.platform === "win32") {
        const candidates = [
          "7z.exe", "7za.exe",
          findInPath("7z.exe"),
          findInCommonLocations("7z.exe", ["C:\\Program Files\\7-Zip", "C:\\Program Files (x86)\\7-Zip"]),
        ];
        return candidates.filter((c): c is string => Boolean(c));
      }
      return ["7z", "7za", "/usr/bin/7z", "/usr/local/bin/7z"];
    }
    case "bsdtar":
      return ["bsdtar", "/usr/bin/bsdtar"];
    case "unar":
      return ["unar", "/usr/local/bin/unar"];
    case "rarfile":
      return [process.env.JIANTI_PYTHON_EXECUTABLE ?? "python3", "python3", "python"];
  }
}

function findInPath(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(cmd, [name], { windowsHide: true, timeout: 3000, encoding: "utf8" });
    if (result.status === 0) {
      const first = result.stdout.trim().split(/\r?\n/)[0]?.trim();
      if (first) return first;
    }
  } catch { /* ignore */ }
  return null;
}

function findInCommonLocations(filename: string, dirs: string[]): string | null {
  for (const dir of dirs) {
    const full = path.join(dir, filename);
    if (existsSync(full)) return full;
  }
  return null;
}

function probeArgs(backend: Backend): string[] {
  switch (backend) {
    case "unrar": return ["lb"];
    case "7z": return ["l"];
    case "bsdtar": return ["--version"];
    case "unar": return ["--version"];
    case "rarfile": {
      // rarfile 是 Python 模块，先 import 确认存在
      // 探测脚本同时检查 rarfile 模块 + 它能找到的系统后端
      return [
        "-c",
        "import rarfile,sys; print(rarfile.__version__); print('backend:', rarfile.toolname())",
      ];
    }
  }
}

function isBackendAlive(backend: Backend, output: string, exitStatus: number | null): boolean {
  if (/command not found|is not recognized|spawn\s+\w+\s+ENOENT|No such file/i.test(output)) return false;
  if (backend === "rarfile") {
    // Python 未找到或 rarfile 模块缺失都算"不可用"
    if (exitStatus !== 0) return false;
    if (/ModuleNotFoundError|ImportError/i.test(output)) return false;
    // 还要看 rarfile 能不能找到系统后端（rarfile.toolname() 输出）
    const found = /backend:\s*(\w+)/i.exec(output);
    if (!found) return false;
    return true;
  }
  if (backend === "bsdtar") return /libarchive/i.test(output) || (exitStatus === 0 && output.trim().length > 0);
  if (backend === "unar") return /unar/i.test(output) || (exitStatus === 0 && output.trim().length > 0);
  return exitStatus === 0 || output.trim().length > 0;
}

function extractVersion(output: string): string | undefined {
  const m = output.match(/(\d+\.\d+(?:\.\d+)?)/);
  return m?.[1];
}

/**
 * 用探测到的后端解压归档文件到目标目录。
 */
export function extractArchive(
  archivePath: string,
  outputDir: string,
): { ok: true; files: string[]; backend: Backend } | { ok: false; error: string } {
  if (!existsSync(archivePath)) return { ok: false, error: `归档文件不存在: ${archivePath}` };
  mkdirSync(outputDir, { recursive: true });

  const probe = probeBackend();
  if (!probe) return { ok: false, error: `未找到可用的解压后端。${installHint()}` };

  const args = extractArgs(probe.backend, archivePath, outputDir);
  const result = spawnSync(probe.executable, args, {
    windowsHide: true,
    timeout: 120_000,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const combined = (result.stdout ?? "") + (result.stderr ?? "");
  if (result.status !== 0) {
    return {
      ok: false,
      error: `${probe.backend} 解压失败 (exit ${result.status}): ${combined.slice(0, 500)}`,
    };
  }

  // rarfile 的 stdout 会打印 OK 数字，忽略即可
  return { ok: true, files: walkFiles(outputDir), backend: probe.backend };
}

function extractArgs(backend: Backend, archive: string, outDir: string): string[] {
  const absArchive = path.resolve(archive);
  const absOut = path.resolve(outDir);
  switch (backend) {
    case "unrar":
      return ["e", "-o+", "-y", absArchive, path.join(absOut, "")];
    case "7z":
      return ["x", absArchive, `-o${absOut}`, "-y"];
    case "bsdtar":
      return ["-xf", absArchive, "-C", absOut];
    case "unar":
      return ["-o", absOut, absArchive];
    case "rarfile": {
      const escapedArchive = absArchive.replace(/\\/g, "/").replace(/'/g, `'\\''`);
      const escapedOut = absOut.replace(/\\/g, "/").replace(/'/g, `'\\''`);
      return [
        "-c",
        `import rarfile, sys, os; p=r'''${escapedArchive}'''; o=r'''${escapedOut}'''; ` +
        `f=rarfile.RarFile(p); f.extractall(o); f.close(); print('OK', len(os.listdir(o)))`,
      ];
    }
  }
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  const walk = (current: string, prefix = "") => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full, rel);
        else if (stat.isFile()) result.push(rel);
      } catch { /* ignore */ }
    }
  };
  walk(dir);
  return result;
}

/** 从解压结果里挑出可入库的文件（docx / pdf / doc） */
export function extractEditableFiles(allFiles: string[]): string[] {
  return allFiles.filter((name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".docx") || lower.endsWith(".pdf") || lower.endsWith(".doc");
  });
}

/** 解压后发现 Word 文件超过一个版本，优先 .docx */
export function preferDocx(files: string[]): string[] {
  const docx = files.filter((f) => f.toLowerCase().endsWith(".docx"));
  const others = files.filter((f) => !f.toLowerCase().endsWith(".docx"));
  return [...docx, ...others];
}

export function installHint(): string {
  const platform = process.platform;
  if (platform === "linux") {
    return "Docker/Ubuntu/Debian: apt-get update && apt-get install -y unrar p7zip-full";
  }
  if (platform === "win32") {
    return "Windows: 安装 7-Zip (https://www.7-zip.org) 或 WinRAR 并加入 PATH";
  }
  if (platform === "darwin") {
    return "macOS: brew install unar  或  brew install unrar (需要 non-free 源)";
  }
  return "请参考所在系统的包管理器安装 unrar / 7-Zip / bsdtar / unar";
}

export function makeTempDir(prefix = "extract"): string {
  const hash = createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 12);
  const dir = path.join(ROOT, ".runtime", "extract", `${prefix}-${hash}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function removeTempDir(dir: string): void {
  try {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) removeTempDir(full);
        else unlinkSync(full);
      } catch { /* ignore */ }
    }
    try { unlinkSync(dir); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

export function isArchive(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ARCHIVE_EXTS.some((ext) => lower.endsWith(ext));
}

/** (供测试) 验证 spawn 后端 */
export function _probeBackendForTest(): ProbeResult | null { return probeBackend(); }

// 保留 spawn 的显式引用（某些 lint 配置要求不导入未用模块）
void spawn;
export { spawnSync };
