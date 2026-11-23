# 拣题 · 智能组卷系统

一套面向 **K12 全学段**（小学 / 初中 / 高中）教师的本地部署题库与组卷系统。教师上传 PDF/Word 试卷，系统自动抽题入题库，人工或 AI 随机组卷，一键导出 Word / PDF / LaTeX。同时提供学生端练习考试、错题本、学习分析、学校模式作业批改。

> **GitHub**: https://github.com/wxgoo/jianti-exam-system
> **Docker 镜像**: `ghcr.io/wxgoo/jianti-exam-system:latest` (public)

---

## ✨ 核心亮点

| 能力 | 说明 |
|---|---|
| 🗂️ 题库导入 | PDF / Word 自动抽题 → AI 审核 → 入库；支持 OCR |
| 📥 外部题库抓取 | 弹窗一键拉取 **第一试卷网** 对应科目/年级栏目页，后端自动下载 .rar → 解压 → 入库 |
| 🎲 组卷 | 人工选题 / 按配比随机抽 / A-B 卷；实时预览 |
| 📄 三格式导出 | **Word** 可编辑（OMML 公式）/ **PDF** printable / **LaTeX** 源码 + 图片打包 |
| 📚 学生端 | 练习模式 / 考试模式（计时/自动交卷）/ 错题本 / 掌握度标记 / 学习分析 |
| 🏫 学校模式 | 多租户教师共享题库、作业布置与批改 |
| 🔐 认证 | HMAC-SHA256 签名 token，7 天有效 |
| 🐳 一键部署 | Docker Compose / Windows 一键脚本 / NSSM 开机服务 |

---

## 🚀 快速开始（5 分钟跑起来）

### 方式 A · Docker（推荐，Windows / NAS / Linux 通用）

```bash
mkdir -p /volume1/docker/jianti && cd /volume1/docker/jianti
curl -o docker-compose.yml \
  https://raw.githubusercontent.com/wxgoo/jianti-exam-system/main/deploy/nas/docker-compose.yml

# 改一行：APP_BASE_URL=http://<你的机器IP>:3050
docker compose pull
docker compose up -d

# 访问 http://<机器IP>:3050
```

### 方式 B · Windows 一键脚本（开发 / 本机）

前提：Node.js ≥ **22.13.0**（https://nodejs.org）+ 可选 7-Zip/WinRAR（RAR 解压用）

```cmd
cd jianti-exam-system
deploy-windows.bat
# 打开 http://127.0.0.1:3050
```

脚本自动：清理残留实例 → 缺 `node_modules` 自动 `npm ci` → **`.next` 比源码新则跳过 build（6 秒起），否则自动 build（~25 秒）** → 后台启动 → 轮询就绪。二次启动几乎瞬间完成。

可选参数（直接调用 mjs）：

```powershell
node scripts/deploy/deploy-windows.mjs --force-build   # 强制重建（改了构建配置时用）
node scripts/deploy/deploy-windows.mjs --skip-build    # 跳过 build（.next 肯定好的）
```

前台启动（窗口保持开着，关了就停）：

```cmd
scripts\start-local.bat
# 同样会自动清理 + 智能跳过 build
```

### 方式 C · Windows NSSM 开机服务（生产）

```powershell
cd jianti-exam-system
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\deploy\install-windows-service.ps1
```

脚本会自动：探测 nssm → 检查 Node 版本 → npm ci + build → `nssm install jianti-exam` → 启动 → 轮询 `/api/ready`。

### 方式 D · Linux / NAS 直接从 ghcr.io 拉

```bash
docker pull ghcr.io/wxgoo/jianti-exam-system:latest
docker run -d -p 3050:3050 -p 3051:3051 \
  -e APP_BASE_URL=http://<HOST_IP>:3050 \
  -v jianti_data:/app/data \
  --name jianti \
  ghcr.io/wxgoo/jianti-exam-system:latest
```

---

## 📋 部署矩阵

| 环境 | 命令 | 解压后端（RAR 自动入库） |
|---|---|---|
| **Docker 容器** | `docker compose up -d` | ✅ 开箱即用（镜像内已装 unrar + p7zip）|
| **Windows 开发机** | `deploy-windows.bat` | ⚠️ 需手动装 7-Zip 或 WinRAR 加 PATH |
| **Windows NSSM 服务** | `scripts\deploy\install-windows-service.ps1` | ⚠️ 同上，脚本会提示 |
| **Linux 服务器** | `docker compose up -d` | ✅ 同 Docker |
| **NAS 群晖/威联通** | Docker 应用里导入 compose | ✅ 同 Docker |

---

## 🗂️ 目录结构

```
jianti-exam-system/
├── app/                      # Next.js 16 前端（App Router）
│   ├── api/                  # API 路由
│   ├── bank/                 # 题库页
│   ├── papers/               # 试卷页
│   └── ...
├── server/                   # 后端服务
│   ├── services/             # 业务服务（含 shijuan1.ts / archive-extract.ts）
│   └── http/                 # NestJS 风格路由
├── components/               # React 组件（SourceFinderDialog.tsx 即找题弹窗）
├── scripts/                  # 运行脚本
│   ├── run-local.mjs         # 本地启动
│   ├── stop-local.mjs        # 停止
│   └── deploy/
│       ├── install-windows-service.ps1
│       └── uninstall-windows-service.ps1
├── deploy/
│   └── nas/
│       ├── Dockerfile        # 含 unrar + p7zip + rarfile
│       └── docker-compose.yml
├── processor/                # Python OCR / rarfile 兜底
├── db/                        # SQLite schema + migrations
├── .github/workflows/
│   └── publish-docker.yml    # push main → 自动 build + push ghcr.io
├── USER_MANUAL.md            # 完整使用手册
└── deploy-windows.bat        # Windows 一键部署入口
```

---

## 🔧 找题 / 下载（新）

题库页（`/bank`）顶部「🔍 找题 / 下载」按钮打开弹窗，分两个 Tab：

| Tab | 来源 | 工作流 |
|---|---|---|
| **第一试卷网** | `www.shijuan1.com` | 选科目/年级 → 弹窗内直接搜索列表 → 点「自动入库」后端下载 .rar → 解压 → 入库（**容器内绿状态，Windows 需装 7-Zip/WinRAR**）；或仅下载 .rar 到本机 |
| **组卷网 / 学科网** | zujuan.com / zxxk.com | 安装油猴脚本 → 浏览器端导出题目 HTML/ZIP → 弹窗内选文件直接导入 |

---

## 🔐 默认管理员账号

**空库首次启动时自动创建**（无需手动注册）：

```
用户名: admin
密码:   admin123
```

- 首次登录后**必须改密码**（数据库里是 `salt:HMAC-SHA256` 哈希）
- admin 角色不受 subject/stage 过滤，打开全库所有学段/科目的题目与试卷
- 注册路由 `/register` 仍然开放，后续注册者会成为普通 `teacher`（按学科隔离数据）

---

## 📦 数据在哪里

| 位置 | 路径 |
|---|---|
| SQLite 题库 | `.runtime/data/teacher-question-bank.sqlite3` |
| 上传文件 | `.runtime/data/files/` |
| 解压临时目录 | `.runtime/extract/` |
| 日志 | `.runtime/logs/local-3050/` |

Docker 部署时全部落 `jianti_data` 命名卷（`docker compose down` **不丢**，`docker compose down -v` 才清）。

---

## 🔄 升级

```bash
# Docker / NAS
docker compose pull && docker compose up -d

# Windows NSSM
git pull
npm ci --omit=dev && npm run build
nssm restart jianti-exam
```

---

## 📖 完整文档

- [USER_MANUAL.md](./USER_MANUAL.md) — 使用手册（功能/部署/排障/API 概览）
- [deploy/nas/README](./deploy/nas/Dockerfile) — 容器环境说明
- 架构概览见下文「开发者说明」

---

## 🛠️ 开发者说明

### 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 16 (App Router) · Turbopack · React · TailwindCSS |
| 后端 | Next.js API Routes + NestJS 风格分层（route → handler → service → db） |
| 数据库 | SQLite (better-sqlite3, 单文件、零配置) |
| 认证 | HMAC-SHA256 签名 token `jianti-session`，7 天有效 |
| Python | 3.10+（OCR / rarfile 兜底）|
| Node | ≥ 22.13.0 |

### 本地开发

```bash
npm install
node scripts/run-local.mjs    # 同时起 Web :3050 + API :3051 + Worker
# 或
node scripts/stop-local.mjs
```

### 测试

```bash
node --test tests/*.test.mjs
# 目标 ≥ 280 pass
```

### 安全设计

- 路径遍历拒绝（相对数据目录）
- 并发数限制
- 上传/转换路径分离
- API 独占数据库写权限

---

## 🧾 许可

本项目仅供学习研究使用。商用请联系作者并获得授权。
