#!/usr/bin/env python3
# ================================================================
# jianti-exam-system 构建脚本（Python）
# - 创建 Python venv 虚拟环境（隔离系统 Python）
# - 安装 Node.js 依赖（npm install）
# - 运行 Next.js 生产构建（npm run build）
# - 可选运行测试（npm test）
# ================================================================

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV_DIR = ROOT / ".venv"
NODE_MODULES = ROOT / "node_modules"


def run(cmd, cwd=ROOT, check=True, env=None):
    """运行命令并打印输出。"""
    print(f"[run] {cmd}")
    result = subprocess.run(
        cmd,
        cwd=str(cwd),
        shell=True,
        env=env or os.environ.copy(),
        text=True,
    )
    if check and result.returncode != 0:
        print(f"[error] 命令失败（退出码 {result.returncode}）: {cmd}")
        sys.exit(result.returncode)
    return result


def ensure_venv():
    """创建 Python venv 虚拟环境（若不存在），避免污染系统 Python。"""
    if VENV_DIR.exists():
        print(f"[venv] 已存在: {VENV_DIR}")
        return
    print(f"[venv] 创建虚拟环境: {VENV_DIR}")
    run(f"{sys.executable} -m venv {VENV_DIR}")


def venv_python():
    """返回 venv 中的 Python 可执行文件路径。"""
    if os.name == "nt":  # Windows
        return str(VENV_DIR / "Scripts" / "python.exe")
    return str(VENV_DIR / "bin" / "python")


def ensure_node_deps():
    """安装 Node.js 依赖（若 node_modules 不存在）。"""
    if NODE_MODULES.exists():
        print("[node] node_modules 已存在，跳过 npm install")
        return
    print("[node] 安装 Node.js 依赖...")
    run("npm install")


def build():
    """运行 Next.js 生产构建。"""
    print("[build] 运行 npm run build...")
    run("npm run build")


def test():
    """运行测试套件。"""
    print("[test] 运行 npm test...")
    run("npm test")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="jianti-exam-system 构建脚本")
    parser.add_argument("--no-venv", action="store_true", help="跳过创建 Python venv")
    parser.add_argument("--no-deps", action="store_true", help="跳过 npm install")
    parser.add_argument("--no-build", action="store_true", help="跳过 npm run build")
    parser.add_argument("--test", action="store_true", help="构建后运行 npm test")
    args = parser.parse_args()

    if not args.no_venv:
        ensure_venv()
    if not args.no_deps:
        ensure_node_deps()
    if not args.no_build:
        build()
    if args.test:
        test()

    print("[done] 构建完成。")
    print(f"   启动命令: .\\scripts\\start-local.bat  (或 node scripts/run-local.mjs)")


if __name__ == "__main__":
    main()
