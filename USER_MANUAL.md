# 拣题（教师题库助手）使用手册

版本：1.3  
适用系统：Windows / Node.js >= 22.13.0（推荐 22.x、25.x、26.x，当前开发环境 v26.13.1）/ Python 3.10.11+  
项目目录：`jianti-exam-system`

---

## 目录

1. [系统简介](#1-系统简介)
2. [系统架构](#2-系统架构)
3. [环境要求](#3-环境要求)
4. [安装与部署](#4-安装与部署)
   - [4.1 从源码包安装](#41-从源码包安装)
   - [4.2 环境变量配置](#42-环境变量配置)
   - [4.3 构建与编译](#43-构建与编译)
5. [启动服务](#5-启动服务)
   - [5.1 Windows 一键启动](#51-windows-一键启动)
   - [5.2 手动启动](#52-手动启动)
   - [5.3 停止服务](#53-停止服务)
6. [功能使用指南](#6-功能使用指南)
   - [6.1 首页与导航](#61-首页与导航)
   - [6.2 题库管理](#62-题库管理)
   - [6.2.1 导入试卷（PDF / Word / 图片）](#621-导入试卷pdf--word--图片)
   - [6.2.2 找题 / 下载试卷（外部题库）](#622-找题--下载试卷外部题库)
   - [6.3 教师账号与多租户账号系统](#63-教师账号与多租户账号系统)
   - [6.4 试卷组卷（人工/随机/A-B 卷）](#64-试卷组卷)
   - [6.5 试卷导出（Word/PDF/LaTeX）](#65-试卷导出)
   - [6.6 学生练习与考试](#66-学生练习与考试)
   - [6.7 错题本与错题复习](#67-错题本与错题复习)
   - [6.8 题目讲解管理](#68-题目讲解管理)
   - [6.9 学习分析与统计](#69-学习分析与统计)
   - [6.10 作业批改（学校模式）](#610-作业批改)
7. [数据库与迁移](#7-数据库与迁移)
8. [API 接口概览](#8-api-接口概览)
9. [常见问题与故障排除](#9-常见问题与故障排除)
10. [开发者说明](#10-开发者说明)
12. [后台管理](#12-后台管理)
    - [12.1 访问与管理员账号](#121-访问与管理员账号)
    - [12.2 管理板块](#122-管理板块)
    - [12.3 管理员API](#123-管理员api)
11. [服务器与群晋 NAS 部署](#11-服务器与群晋-nas-部署)
    - [11.1 Windows 一键部署](#111-windows-一键部署)
    - [11.2 群晋 NAS 部署](#112-群晋-nas-部署)
    - [11.3 其他 Linux 服务器（通用）](#113-其他-linux-服务器通用)
    - [11.4 管理员账号说明](#114-管理员账号说明)
    - [11.5 部署排障提示](#115-部署排障提示)

---

## 1. 系统简介

拣题（教师题库助手）是一套覆盖中小学各学科、AI 驱动的「取题→筛选→入库→抽题→组卷→出卷→出答案→考评→讲解→记录→错题→管理」一体化试题学习考试系统。

本系统基于 Teacher-DB 基座，吸收了 WTS、yf-exam、java-exam、OnlineExamz、江苏小学练习生成器等 20 余个开源项目的精华，采用 B/S 架构（浏览器端 + 服务器 + 数据库），支持 Word、PDF、LaTeX 三种排版输出。

### 核心特性

| 特性 | 说明 |
|------|------|
| **识题 + 人工复核** | PDF/图片由 AI 自动提取题目；Word（.docx）直接按题号/选项/答案区解析，不需要识题模型；所有结果均需人工审核修正 |
| **学校多租户题库共享** | 同一学校的多名教师共享已审核题库；组卷/错题/记录个人隔离 |
| **随机抽题组卷** | 按题型/数量/分值/难度配比抽题，支持基于 seed 的 A-B 卷 |
| **三格式导出** | 支持 Word（.docx）、PDF、LaTeX（.tex 或 .zip 含图片） |
| **错题本** | 自动记录错题，支持掌握度标记和复习调度 |
| **学生练习/考试** | 支持练习模式和考试模式（计时、自动交卷、提交锁定） |
| **自动判分** | 单选/多选/填空题自动判分，解答题标记需人工批改 |
| **学习分析** | 正确率趋势、题型分布、薄弱题目可视化 |
| **题目讲解** | 支持文本/视频/音频讲解，AI/教师/导入来源 |

---

## 2. 系统架构

```
┌─────────────────┐      HTTP API      ┌──────────────────┐
│   浏览器端       │◄─────────────────►│   NestJS 服务器   │
│  (Next.js 16)   │      端口 3050      │   (NestJS)       │
│                 │                     │   端口 3051      │
└─────────────────┘                     └──────────────────┘
                                         │
                                         │ better-sqlite3
                                         ▼
                                    ┌─────────────┐
                                    │  SQLite DB  │
                                    │  本地优先   │
                                    └─────────────┘
```

- **浏览器端**：Next.js 16 (Turbopack)，负责页面渲染、用户交互、文件上传预览
- **服务端**：NestJS，提供 REST API 路由，数据库读写、文件存储、PDF 渲染
- **数据库**：SQLite（本地优先），存储题目、试卷、错题本、学习记录等

---

## 3. 环境要求

### 必需软件

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | **v26.x** | 运行 Next.js 前端和 NestJS 后端（**必须是 v26**，不要使用 v22） |
| npm | 随 Node.js 自带 | 安装依赖 |
| Python | 3.10.11+ | 可选，用于 FastAPI 文档处理（如启用 `--with-python`） |
| Git | 2.56+ | 版本管理（可选） |
| Windows | 10/11 | 推荐开发运行平台 |

### 已验证环境

- 工作目录：`C:\Users\anan\Documents\默认项目\jianti-exam-system`
- Node.js：v26.13.1
- Python：3.15.2（虚拟环境 `.venv`）

### ⚠️ 重要提示

本系统依赖 `better-sqlite3` 原生模块，**必须与 Node.js 版本匹配**。如果你之前安装了 Node.js v22，请卸载后重新安装 Node.js v26.x，否则会出现 `Could not locate the bindings file` 错误。

---

## 4. 安装与部署

### 4.1 从源码包安装

将源码包 `jianti-exam-system-src.tar.gz`（或 `jianti-exam-system-src.zip`）解压到任意目录：

```cmd
tar -xzf jianti-exam-system-src.tar.gz
cd jianti-exam-system
```

如果用 zip 包，在资源管理器中右键「全部解压」后进入 `jianti-exam-system` 目录即可。

源码包**不含**依赖目录、构建产物、运行时数据和 `.env` 密钥文件，先按 4.2、4.3 初始化：

```cmd
copy .env.example .env
npm install
npm run build
```

### 4.2 环境变量配置

源码包只提供 `.env.example`，首次使用需复制为 `.env`（上面命令已完成）：

```cmd
copy .env.example .env
```

主要配置项如下：

```ini
# 应用公开地址
APP_BASE_URL=http://localhost:3050

# 部署模式（local 本地优先 / remote 远端）
JIANTI_DEPLOYMENT_MODE=local

# 数据库提供商
JIANTI_DATABASE_PROVIDER=sqlite

# 服务端口
JIANTI_WEB_PORT=3050
JIANTI_API_PORT=3051
JIANTI_API_URL=http://127.0.0.1:3051

# 是否启用 Python 文档处理器
# JIANTI_WITH_PYTHON=1
```

**注意**：`.env` 文件仅在当前会话生效，不会污染系统环境变量。如需修改端口或数据目录，直接编辑 `.env` 即可。

### 4.3 构建与编译

#### 方法一：使用 Python 构建脚本（推荐）

```cmd
python build.py
```

该脚本将自动：
1. 创建 Python 虚拟环境 `.venv/`
2. 执行 `npm install` 安装 Node.js 依赖（包含 `better-sqlite3` 原生二进制）
3. 执行 `npm run build` 进行 Next.js 生产构建（含 TypeScript 类型检查）

可选参数：
- `--no-venv`：跳过创建 Python venv
- `--no-deps`：跳过 npm install
- `--no-build`：跳过构建
- `--test`：构建后运行测试套件

#### 方法二：手动构建

```cmd
npm install
npm run build
```

**必须按顺序执行**：先 `npm install`，再 `npm run build`。`npm run build` 会生成 `.next/` 目录，如果没有先构建，直接启动会报 `Could not find a production build` 错误。

---

## 5. 启动服务

### 5.1 Windows 一键启动（推荐）

双击运行：

```cmd
scripts/start-local.bat
```

或在命令行执行：

```cmd
.\scripts\start-local.bat
```

脚本会自动完成：
1. 检查 Node.js 版本
2. **清理残留实例**（PID 文件 + 端口 3050/3051 扫描 + 进程名匹配，三重保障）
3. 缺 `node_modules` 时自动 `npm ci`
4. 缺 `.next\BUILD_ID` 时自动 `npm run build`
5. 加载 `.env` 环境变量（仅当前窗口）
6. 启动 Node.js 全栈服务（Web 3050 / API 3051）
7. 所有退出路径都 **pause**，不会闪退——双击后窗口不会瞬间消失

启动成功后会显示：
```
[local] ready http://localhost:3050 (NestJS + independent worker)
```

**注意**：这是前台启动，关闭窗口即停止服务。想要后台常驻（关窗口继续跑）用根目录 `deploy-windows.bat`（一键部署）或装成 NSSM 服务（见 11.1.2）。

### 5.2 手动启动

如果不使用 `.bat` 脚本，可以手动执行（二者等价，`npm start` 实际就是运行 `scripts/run-local.mjs`）：

```cmd
npm start
```

或：

```cmd
node scripts/run-local.mjs
```

或指定端口：

```cmd
node scripts/run-local.mjs --web-port=3050 --api-port=3051
```

### 5.3 停止服务

- 按 `Ctrl+C` 停止前台启动脚本，会自动清理子进程
- 执行：`node scripts/stop-local.mjs`（停止后台运行的服务）

---

## 6. 功能使用指南

### 6.1 首页与导航

访问 `http://localhost:3050` 后先登录（没有账号可去 `/register` 注册，注册成功后自动登录；页面顶部显示教师姓名、学校、学科，右侧可退出登录）。登录后进入系统首页。左侧边栏导航包含：

| 菜单项 | 路径 | 说明 |
|--------|------|------|
| 工作台 | `/` | 系统入口 |
| 题库 | `/bank` | 浏览已审核题目，供组卷选题 |
| 组卷 | `/papers/new` | 创建新试卷 |
| 试卷库 | `/papers` | 管理已保存试卷 |
| 错题本 | `/wrong-book` | 查看和管理错题 |
| 错题复习 | `/wrong-book/review` | 基于掌握度的复习调度 |
| 练习 | `/practice` | 学生练习入口 |
| 学习分析 | `/learning/analytics` | 学习数据可视化 |
| 班级学生 | `/classes` | 学校模式：班级管理 |
| 作业批改 | `/assignments` | 学校模式：作业布置与批分 |

### 6.2 题库管理

**路径**：`/bank`

功能：
- 浏览已审核（status=approved）的题目
- 按学科、学段、题型、标签筛选
- 查看题目干扰项、答案、解析
- 选中题目加入组卷篮

页面顶部有两个 Tab：

| Tab | 说明 |
|---|---|
| **基础题库** | 平台跨学校共享资源池（规划中）。目前为空，后续开放模卷 / 名校试卷聚合。**当前请用顶部「找题 / 下载」按钮从第一试卷网 / 组卷网导入** |
| **我的题库** | 你自己上传、导入、AI 变式的全部题目与试卷，按学科/学段永久保存。admin 登录时可看到全库所有题目（不受学科/学段过滤） |

题目状态说明：
- `pending`：待审核（AI 提取后，未通过人工审核）
- `approved`：已审核（可用于组卷）
- `needs_attention`：需人工关注

题库共享说明：同一学校（`documents.school` 字段）的多名教师共享已审核题目；不同学校的老师互不可见。admin 角色**不受学科/学段过滤**，可看到全库。

### 6.2.1 导入试卷（PDF / Word / 图片）

在工作台或题库点击「导入试卷」，选择文件后开始导入：

| 来源 | 处理方式 | 是否需要识题模型 | 审核方式 |
|------|----------|------------------|----------|
| PDF | 浏览器分页 → 逐页由模型识别题目 | 需要 | 原卷图片 + 题目逐题核对 |
| 图片组 | 合成一份试卷 → 模型识别 | 需要 | 原卷图片 + 题目逐题核对 |
| Word（.docx） | 服务端按文档顺序提取文字，再按题号、选项、大题标题和答案区拆题 | **不需要** | 纯文字审核页（无分页图） |

Word 导入识别规则（与参考工具「江苏小学练习生成器」一致）：

- 题号支持 `1.`、`1．`、`1、`、`1)`、`1）`、`(1)`、`第1题`，以及 `1 题干` 这种空格分隔写法；小数 `3.5` 不会被误判为题号。
- 选项支持每行 `A. 内容` / `A．内容` / `（A）内容`，也支持同一行的 `A．甲 B．乙 C．丙 D．丁`；选项按 A、B、C… 重新编号。
- 大题标题（如「一、选择题」「二、填空题」「三、解答题」）决定题型：选择/单选 → 单选题，多选 → 多选题，填空/判断 → 填空题，解答/计算/应用/证明等 → 解答题；答案含多个字母时自动改判为多选题。
- 答案支持文末「参考答案 / 答案」区（`1. B`、`2．BD`）和每题旁的 `【答案】B`、`答案：B`；`【解析】…`、`解析：…` 会写入解析字段。
- 不同大题中重复的题号会按文档顺序重新编号为 1…N，满足审核的题号连续性要求。
- 旧版 `.doc` 请先另存为 `.docx`；Word 中的图片不会被自动提取，系统会在导入结果中提示图片数量，需在审核时人工核对。
- 同一份 Word 文件重复导入会被拒绝（按文件校验和去重），避免产生重复题目。

导入完成后在任务的「查看试卷」中逐题核对，确认入库后题目即进入老师题库，可继续筛选、组卷和导出。

### 6.2.2 找题 / 下载试卷（外部题库）

**路径**：`/bank` 顶部「🔍 找题 / 下载」按钮，弹窗分两个 Tab。

弹窗顶部有一条**解压后端状态条**，绿色代表后端 RAR 自动入库已就绪（容器部署开箱即用），黄色代表需手动装解压工具。详见下文「解压后端」。

---

#### Tab 1 · 第一试卷网（自动搜索 / 自动入库）

| 功能 | 说明 |
|---|---|
| 搜索 | 弹窗内直接选科目（9 门）+ 年级（14 个）+ 可选版本关键词（如「人教版」），后端实时抓取 `www.shijuan1.com` 栏目页并展示匹配列表 |
| 自动入库 | 点每行右侧「自动入库」→ 后端下载 .rar → **自动解压** → 挑出 .docx → 解析 → 入库。弹窗内直接展示「成功/跳过的文件清单」 |
| 仅下载 | 经典模式：浏览器保存 .rar 到本机，解压后用「导入试卷」上传 |

**注意**：
- 第一试卷网大多数试卷用旧版 `.doc`，后端目前只解析 `.docx`。结果里会明确提示 `.doc` 文件需手动用 Word/WPS 另存为 `.docx` 再上传
- 解压后端缺失时「自动入库」按钮自动禁用，状态条告诉你怎么装
- 下载的 .rar 里若含 `.pdf`，会提示 PDF 需 OCR 流程（单独功能）

#### Tab 2 · 组卷网 / 学科网（油猴脚本导出导入）

本系统**不自动抓取**组卷网/学科网，走浏览器端导出路径：

1. 打开对应站点，安装油猴脚本 `zxxk-zujuan-export.user.js`
2. 在当前页面导出：题目离线 HTML / 题目 ZIP / 答案合集 HTML / 答案 ZIP
3. 回到本系统「找题 / 下载」弹窗，选导出文件直接导入

解析特性：QID 卡片去重、`答:` / `.ans` 区块提取答案与解析、重复文件按校验和拦截；图片不自动导入，结果里提示数量需人工核对。

> ⚠️ 请尊重外部站点服务条款与试卷版权，仅将本功能用于个人学习、备课和归档；不要用于批量抓取或商业分发。

---

#### 解压后端（RAR 自动入库必需）

| 部署环境 | 就绪状态 | 说明 |
|---|---|---|
| **Docker 容器** | ✅ 绿状态，开箱即用 | 镜像已预装 `unrar` + `p7zip-full` + Python `rarfile` |
| **Windows 开发机** | ⚠️ 需手动装 | 安装 **7-Zip** (https://www.7-zip.org) 或 **WinRAR** 并加入 PATH；或运行 `winget install -e --id=7zip.7zip` |
| **Linux 服务器** | 视环境 | 推荐走 Docker 容器部署，自动具备 |
| **NAS 群晖/威联通** | ✅ 同 Docker | ghcr.io 镜像内已装 unrar |

后端探测链：`unrar → unar → 7z → bsdtar → rarfile(Python)`，自动挑选第一个真正可用的后端。可通过「弹窗顶部状态条」或 `GET /api/sources/shijuan1?action=archive-backends` 查看。

### 6.3 教师账号与多租户账号系统

当前系统按「学校+学科」实现多租户：同一学校的多名教师（不同学科）共享题库中的已审核题目；组卷、试卷、错题本、学习记录等个人数据按 `teacher_id` 隔离。

#### 6.3.1 注册与登录

- 入口：`http://localhost:3050/register`（注册）、`http://localhost:3050/login`（登录）
- 注册字段：用户名、密码（至少 6 位）、姓名、学校、学科
- **空库首次启动时系统自动创建 `admin / admin123`**（role=admin，无需手动注册；代码见 `db/bootstrap.ts → seedDefaultAdmin()`）
- 后续通过 `/register` 注册的账号一律为 `teacher` 角色
- admin 角色特权：不受前端 subject/stage 过滤，打开全库所有学段/科目的题目与试卷；teacher 只能看到自己学科范围内的数据
- 注册成功后自动登录（`set-cookie`）
- 重复用户名注册会返回 409
- 登录错误密码返回 401

> 💡 部署后先用 `admin / admin123` 登录验证，再按需创建教师账号。首次登录后建议立刻改掉默认密码。

#### 6.3.2 账号属性

| 字段 | 说明 |
|------|------|
| id | 自动生成的 UUID |
| username | 唯一登录名 |
| password_hash | 格式 `salt:hash`（salt 为 16 位 hex，hash=HMAC-SHA256） |
| name / school / subject | 姓名、学校、学科 |
| role | `admin`（首位注册者）/ `teacher` |
| created_at | 注册时间（ISO 格式） |

#### 6.3.3 会话

- Cookie 名：`jianti-session`；Max-Age：7 天
- Token 格式：Base64url JSON + HMAC 签名
- `POST /api/auth/me` 获取当前教师信息（teacherId、username、name、school、subject、role）
- `POST /api/auth/logout` 清除会话

---

### 6.4 试卷组卷（人工/随机/A-B 卷）

#### 6.4.1 人工组卷

**路径**：`/papers/new`

1. 从题库选择题目，添加到组卷篮
2. 设置试卷标题、副标题
3. 为每道题设置分值
4. 选择试卷模板（中考/高考/作业/测试）
5. 保存试卷

> 📐 **分页算法说明**：答题卡书写空白按题型自适应分配
> （小题约 12% 页高、大题最多 25% 页高），不再是每道题硬塞半页。
>
> ▶️ **保存后直接开考**：点击「保存试卷」后，顶栏的「**▶️ 进入练习**」按钮自动激活。
> 或在试卷库 `/papers` 的组卷作品卡片下拉菜单里选「进入练习」。
> 两者都会跳到 `/practice/exam/[paperId]/start` 设时长 → 开考。
> 6 道综合题答题卡一页即可排完（旧版需要 4 页）。
> 需要特别大的书写空间可在题目设置里单独指定 `minimumBlank`。

#### 6.4.2 随机组卷

系统提供随机抽题接口 `POST /api/papers/generate`，配置参数如下：

```json
{
  "title": "三年级数学期中试卷",
  "quotas": [
    {
      "type": "single",
      "count": 3,
      "score": 5,
      "difficultyRatio": { "easy": 50, "medium": 30, "hard": 20 }
    },
    {
      "type": "fill",
      "count": 2,
      "score": 5,
      "difficultyRatio": { "easy": 0, "medium": 100, "hard": 0 }
    },
    {
      "type": "answer",
      "count": 1,
      "score": 10,
      "difficultyRatio": { "easy": 0, "medium": 0, "hard": 100 }
    }
  ],
  "versionCode": "A",
  "seed": "固定种子（可选，用于 A-B 卷）"
}
```

参数说明：
- `type`：题型（single 单选 / multiple 多选 / fill 填空 / answer 解答）
- `count`：该板块题目数量（1-100）
- `score`：每题分值（0-100）
- `difficultyRatio`：难度配比百分比，总和应为 100
- `versionCode`：卷别（A/B/C...，用于 A-B 卷）
- `seed`：随机种子，相同 seed 生成相同题目顺序

#### 6.3.3 A-B 卷

使用相同的 `seed` 和不同的 `versionCode`，可生成题目顺序相同但卷别不同的 A-B 卷，适用于考试防抄。

### 6.5 试卷导出（Word/PDF/LaTeX）

试卷保存后，可在试卷详情页导出：

| 格式 | 接口 | 说明 |
|------|------|------|
| Word | `GET /api/papers/{id}/docx` | 生成 .docx，公式为 OMML 格式，支持 Word 打开 |
| PDF | `GET /api/papers/{id}/pdf` | 生成 PDF 打印版 |
| LaTeX | `GET /api/papers/{id}/tex` | 无图片时返回 .tex，有图片时返回 .zip（含 tex + images） |

参数：
- `?answers=1`：包含答案和解析
- `?answers=0`（默认）：仅题目，不含答案

**Word 公式说明**：所有 LaTeX 公式通过 temml 渲染为 MathML，再转换为 OMML 注入 Word，支持 `\frac`、`\int`、`\sum`、`\cases`、`\overparen`、`\degree` 等公式。

**LaTeX 图片说明**：LaTeX 导出包含图片时自动打包为 ZIP，内部文件名为 ASCII 编码（避免 Windows 资源管理器乱码）。

### 6.6 学生练习与考试

#### 6.5.1 练习模式

**路径**：`/practice`

1. 选择一份已生成的试卷
2. 点击「开始练习」
3. 作答题目（单选/多选/填空）
4. 提交答案，系统自动判分并显示得分
5. 错题自动记入错题本

#### 6.5.2 考试模式

**路径**：`/practice/exam`

1. 选择试卷，设置考试时长（分钟）
2. 点击「开始考试」
3. 页面显示倒计时，时间到自动交卷
4. 提交后锁定，禁止重复提交
5. 查看考试结果和错题

考试模式特点：
- 带计时器，倒计时到 0 自动交卷
- 提交后会话状态变为 `submitted`，禁止再次提交
- 自动判分，解答题暂不计分（需人工批改）

### 6.7 错题本与错题复习

#### 6.6.1 错题本

**路径**：`/wrong-book`

功能：
- 查看所有错题（状态=open）
- 按掌握度筛选（未掌握 / 学习中 / 已掌握）
- 修改题目的掌握度
- 关闭已复习的错题（状态=closed）
- 查看错题统计（总数、待复习、已掌握、掌握率）

错题自动来源：学生在练习/考试中答错的题目会自动写入错题本。

#### 6.6.2 错题复习

**路径**：`/wrong-book/review`

复习调度规则：
- `unfamiliar`（未掌握）：每次都复习
- `learning`（学习中）：复习次数 < 3 时复习，≥3 次降频
- `mastered`（已掌握）：不再复习

复习页面列出待复习的错题，点击掌握度下拉框可更新状态。

### 6.8 题目讲解管理

**路径**：`/questions/{questionId}/explain`

功能：
- 查看题目的所有讲解（文本/视频/音频）
- 添加新讲解（支持来源：教师/AI/导入）
- 删除讲解
- 查看题目干扰项、答案、解析

讲解内容支持 LaTeX 公式（如 `\frac{1}{2} + \frac{1}{4} = \frac{3}{4}`）。

### 6.9 学习分析与统计

**路径**：`/learning/analytics`

功能：
- **总体统计**：总做题数、正确率、平均分、总用时
- **近30天正确率趋势**：SVG 折线图，显示每日正确率变化
- **题型正确率分布**：条形图，显示单选/多选/填空/解答的正确率
- **薄弱题目**：按错误次数排序，显示最容易错的题目

数据来源：`learning_records` 表，记录每次作答的正确性、得分、耗时。

### 6.10 作业批改（学校模式）

**路径**：`/assignments`

学校模式（teacher_mode=school）下可使用：
1. 创建作业，选择试卷和班级
2. 系统为班级所有学生预创建提交记录
3. 学生提交答案后，教师批改每题得分
4. 系统计算总分并生成作业分析

注意：个人模式（teacher_mode=personal）下隐藏班级和作业菜单。

---

## 7. 数据库与迁移

### 7.1 数据库版本

当前数据库版本：`DATABASE_VERSION = 13`

迁移历史：
- v1：基础表（题目、文档、试卷等）
- v2-v11：功能增量（运行时心跳、PDF 准备、文档来源、提取问题、AI 审核、模型服务、教育范围隔离等）
- v12：错题本、学习记录、练习会话、讲解、试卷版本等新表；`questions` 新增 `difficulty` 字段；`practice_sessions` 新增 `duration_minutes`
- v13（多租户）：新增 `teachers` 教师表（id、username 唯一登录名、password_hash、name、school、subject、role、created_at）；`documents` 新增 `school` 字段。同时调整了迁移校验：v13 后 `documents.school` 列由版本 13 的 `ALTER TABLE` 创建，不再放在 `upgrades` 升级列表中，修复了 v13 升级时出现「数据库迁移校验不一致」的失败

### 7.2 数据库文件

- 路径：`data/teacher-question-bank.sqlite3`
- 格式：SQLite（WAL 模式）
- 备份：`scripts/backup.mjs` / `scripts/restore.mjs`

### 7.3 重置数据库

如遇到数据库迁移校验错误（例如 `"数据库迁移校验不一致"` 或 `"no such table: practice_sessions"`），可删除数据库文件重置：

```cmd
del data\teacher-question-bank.sqlite3
del data\teacher-question-bank.sqlite3-shm
del data\teacher-question-bank.sqlite3-wal
del .runtime\local-3050.json
```

重新启动系统会自动初始化空数据库。

---

## 8. API 接口概览

### 8.1 试卷相关

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 创建试卷 | POST | `/api/papers` | 保存试卷和题目项 |
| 随机组卷 | POST | `/api/papers/generate` | 按配比抽题生成试卷 |
| 试卷列表 | GET | `/api/papers?autoGenerated=1` | 获取自动生成的试卷 |
| 试卷详情 | GET/PATCH/DELETE | `/api/papers/[paperId]` | 获取/更新/删除试卷 |
| 导出 Word | GET | `/api/papers/[paperId]/docx` | 下载 .docx |
| 导出 PDF | GET | `/api/papers/[paperId]/pdf` | 下载 .pdf |
| 导出 LaTeX | GET | `/api/papers/[paperId]/tex` | 下载 .tex 或 .zip |
| 上传文档 | POST | `/api/documents` | 上传 PDF，自动按当前登录教师归档学校（以 Cookie session 为准） |
| 导入 Word 题目 | POST | `/api/imports/word` | FormData：`file`（.docx）+ 试卷信息；返回 `documentId`、`questionCount`、`warnings`。无需识题模型；审核页为纯文字模式 |
| 导入组卷网导出包 | POST | `/api/imports/zujuan` | FormData：`file`（油猴脚本导出的 .html/.zip，可多个）+ 试卷信息；按 QID 去重，返回 `documentId`、`questionCount`、`warnings` |

### 8.2 教师认证与多租户

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 注册 | POST | `/api/auth/register` | 字段：username、password、name、school、subject；首位成员自动成为 `admin` |
| 登录 | POST | `/api/auth/login` | 返回 set-cookie（`jianti-session`，Max-Age 7 天） |
| 退出 | POST | `/api/auth/logout` | 清除会话 |
| 当前教师 | GET | `/api/auth/me` | 返回 teacherId、username、name、school、subject、role |

### 8.3 题库共享与搜索

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 题库列表（含同校共享） | GET | `/api/bank?subject=...` | 同校教师可见同学科共享的已审核题目 |
| 题库搜索 | POST | `/api/view` | body `{resource:"bank"}`，携带 Cookie 查共享题库 |
| 文档列表（含同校共享） | POST | `/api/view` | body `{resource:"documents"}`，携带 Cookie 查共享文档 |

### 8.4 错题本

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 错题列表/统计 | GET | `/api/wrong-book` | 获取错题和统计 |
| 添加错题 | POST | `/api/wrong-book` | 手动或自动添加错题 |
| 更新错题 | PATCH | `/api/wrong-book/[wrongId]` | 更新掌握度/状态 |
| 删除错题 | DELETE | `/api/wrong-book/[wrongId]` | 关闭错题 |
| 复习调度 | GET | `/api/wrong-book/review` | 获取待复习错题 |
| 标记掌握度 | POST | `/api/wrong-book/review` | 更新题目掌握度 |

### 8.5 练习/考试

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 创建会话 | POST | `/api/practice/sessions` | 创建练习/考试会话 |
| 会话详情 | GET | `/api/practice/[sessionId]` | 获取会话和题目 |
| 提交答案 | POST | `/api/practice/[sessionId]/answers` | 提交作答，自动判分 |
| 更新会话 | PATCH | `/api/practice/[sessionId]` | 更新状态/分数 |
| 删除会话 | DELETE | `/api/practice/[sessionId]` | 删除会话 |

### 8.6 学习分析

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 学习统计 | GET | `/api/learning/stats` | 基础统计（总数/正确率等）|
| 学习分析 | GET | `/api/learning/analytics` | 聚合分析（趋势/题型/薄弱点）|

### 8.7 题目讲解

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 讲解列表 | GET | `/api/questions/[questionId]/explanations` | 获取题目讲解 |
| 添加讲解 | POST | `/api/questions/[questionId]/explanations` | 添加新讲解 |
| 删除讲解 | DELETE | `/api/questions/[questionId]/explanations/[explanationId]` | 删除讲解 |

### 8.8 题目详情

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 题目详情 | GET | `/api/questions/[questionId]` | 获取题目完整信息 |
| 更新题目 | PUT | `/api/questions/[questionId]` | 更新题目内容 |

---

## 9. 常见问题与故障排除

### 9.1 启动失败：better-sqlite3 原生模块缺失

**现象**：`Could not locate the bindings file` 或 `ERR_DLOPEN_FAILED`

**原因**：`better-sqlite3` 是 C++ 原生扩展，Node.js 升级后原生二进制不匹配，或 `npm install` 未成功下载二进制文件。

**解决**：
```cmd
# 在项目根目录执行
npm install better-sqlite3
# 或
npm rebuild better-sqlite3
```

确保 `node_modules/better-sqlite3/prebuilds/win32-x64.node` 文件存在。

### 9.2 数据库迁移校验错误

**现象**：`数据库迁移校验不一致，已停止启动` 或 `no such table: practice_sessions`

**原因**：数据库 schema 与代码版本不匹配，通常是因为手动修改了 `db/bootstrap.ts` 迁移脚本。

**解决**：删除数据库文件重置（开发环境）：
```cmd
del data\teacher-question-bank.sqlite3
del data\teacher-question-bank.sqlite3-shm
del data\teacher-question-bank.sqlite3-wal
del .runtime\local-3050.json
```
重新启动系统会自动创建新数据库。

### 9.3 Web 启动失败：未找到生产构建

**现象**：`Could not find a production build in the '.next' directory`

**原因**：还没有运行 `npm run build`，或者 `.next/` 目录被意外删除。

**解决**：
```cmd
npm run build
```
构建成功后再启动服务。

### 9.4 端口已被占用

**现象**：`[local] 服务端口已被另一实例占用`

**原因**：之前的实例未正常关闭，端口 3050/3051 被占用。

**解决**：
```cmd
taskkill /F /IM node.exe
```
然后重新启动。

### 9.5 构建失败：TypeScript 类型错误

**现象**：`npm run build` 报 `Failed to type check`

**原因**：新增代码的类型不匹配，或导入路径错误。

**解决**：检查错误信息中的文件路径，确保：
- `lib/` 内运行时相对导入带 `.ts` 扩展名
- `server/` 下导入不带扩展名
- 代理路由使用 `@/lib/backend-client` 绝对路径

### 9.6 旧版启动脚本的历史问题（已清理）

**现象**：早期有用户报告双击 `启动题库.cmd` 提示 `Node.js 22.22.0 is required` 或强制要求安装特定 Node 版本。

**原因**：早期手写的批处理脚本硬编码了 Node 版本检查，与本项目实际要求的 Node ≥ 22.13.0 不一致。旧脚本已于本次文档/代码整理中全部删除。

**解决**：请使用以下任一方式启动系统：
- 双击项目根目录 `deploy-windows.bat`（一键：安装 + 构建 + 后台启动，带健康检查）
- 双击 `scripts/start-local.bat`（前台启动，需保持窗口打开）
- 或命令行：`node scripts/run-local.mjs`

停止服务：`node scripts/stop-local.mjs`

### 9.7 LaTeX 导出中文乱码

**现象**：ZIP 包内图片文件名在 Windows 资源管理器显示乱码

**原因**：`fflate` 不设置 UTF-8 文件名标志位。

**解决**：系统已固定使用 ASCII 文件名（`paper.tex`、`images/001-xxx.png`），避免此问题。

### 9.8 Word 公式不显示

**现象**：导出的 Word 文档中公式显示为空或乱码

**原因**：OMML 注入失败，或 Word 版本不支持 MathML。

**解决**：系统使用 temml → MathML → OMML 管线，已验证常见公式（frac/sum/int/cases/angle/dfrac/degree/overparen/aligned/text/matrix/blank）。如遇特定公式失败，系统会回退显示源码。

---

### 9.9 题库 / 组卷 / 审核全空

**现象**：登录后题库页显示 0 道题，组卷下拉选不到试卷，审核页面没内容。

**原因**：本地部署的多租户 owner 关联没对齐。新注册的 admin teacherId 和旧 `local-demo` tenantId 不一致，数据落在旧 owner 下被过滤掉了。

**排查步骤**：

```powershell
cd jianti-exam-system
node -e "
const {Database}=require('better-sqlite3');
const db=new Database('data/teacher-question-bank.sqlite3');
console.log('teachers:', db.prepare('select id,username,role from teachers').all());
console.log('docs:', db.prepare('select id,owner_id,status,subject from documents').all());
console.log('q total:', db.prepare('select count(*) from questions').get()['count(*)']);
"
```

**解决**（一条 SQL 把数据归到当前 admin）：

```sql
UPDATE documents SET owner_id = '<当前 admin 的 teacherId>' WHERE owner_id != '<当前 admin 的 teacherId>';
UPDATE documents SET status = 'ready' WHERE status = 'reviewing' 
  AND (SELECT COUNT(*) FROM questions WHERE document_id = documents.id) > 0;
```

admin 角色还会绕过 subject/stage 过滤（普通 teacher 只看到自己学科的数据）。

---

## 10. 开发者说明

### 10.1 代码规范

- `lib/` 内运行时相对导入必须带 `.ts` 扩展名（strip-types 下裸模块名无法解析）
- `server/` 下导入沿用无扩展名写法
- `.env` 文件为无 BOM UTF-8
- PowerShell 控制台输出中文需先设 `[Console]::OutputEncoding=[Text.Encoding]::UTF8`

### 10.2 添加新 API 路由

1. 在 `server/http/handlers/` 下创建 handler 文件
2. 在 `server/http/routes.ts` 中注册路由（`{ path, methods, load }`）
3. 在 `app/api/` 下创建 Next 代理路由（调用 `proxyBackendRequest`）
4. 在 `lib/backend-data.ts` 中添加前端数据获取函数（如需要）

### 10.3 数据库迁移

1. 在 `db/bootstrap.ts` 中添加新的迁移条目（`version` 递增）
2. 在 `upgrades` 中添加已有数据库的列补加逻辑
3. 更新 `DATABASE_VERSION`
4. 确保迁移幂等（`CREATE TABLE IF NOT EXISTS`，`ALTER TABLE` 前检查列是否存在）
5. **不要在 `upgrades` 中引用 v1 迁移后才创建的表**（如 `practice_sessions`），否则基线迁移会失败

### 10.4 测试

```cmd
npm test
```

测试使用 `node --experimental-strip-types --test` 运行 `tests/*.test.mjs`。

---

## 附录：目录结构

```
jianti-exam-system/
├── .env                    # 环境变量配置
├── .env.example            # 环境变量模板
├── .gitignore              # Git 忽略规则
├── build.py                # Python 构建脚本
├── package.json            # Node.js 项目配置
├── scripts/
│   ├── start-local.bat     # Windows 一键启动脚本（推荐使用）
│   ├── run-local.mjs       # 全栈启动脚本
│   ├── stop-local.mjs      # 停止脚本
│   └── *.mjs               # 各种工具脚本
├── lib/                    # 共享库（前端+后端）
│   ├── exam-grading.ts     # 考试判分引擎
│   ├── paper-generator.ts  # 随机组卷算法
│   ├── wrong-book.ts       # 错题本业务
│   ├── learning-record.ts  # 学习记录业务
│   ├── paper-latex.ts      # LaTeX 导出
│   ├── paper-docx.ts       # Word 导出
│   └── ...
├── server/                 # NestJS 后端
│   ├── http/handlers/      # API 路由处理器
│   └── main.ts             # 入口文件
├── db/                     # 数据库
│   ├── schema.ts           # Drizzle Schema 定义
│   └── bootstrap.ts        # 数据库初始化与迁移
├── app/                    # Next.js 页面
│   ├── api/                # API 代理路由
│   ├── practice/           # 练习/考试页面
│   ├── wrong-book/         # 错题本页面
│   ├── learning/           # 学习分析页面
│   └── questions/          # 题目详情页面
├── components/             # React 组件
├── data/                   # SQLite 数据库文件（运行时生成）
├── .venv/                  # Python 虚拟环境（运行时生成）
├── node_modules/           # Node.js 依赖（安装时生成）
├── .next/                  # 构建产物（构建时生成，不要手动删除）
└── USER_MANUAL.md          # 本使用手册
```

---

## 快速启动检查清单

在新电脑上首次运行，请按此顺序：

1. [ ] 安装 Node.js（>= 22.13.0，推荐 22.x；当前开发环境为 v26.13.1）
2. [ ] 解压源码包到任意目录
3. [ ] 在项目目录执行 `npm install`
4. [ ] 执行 `npm run build`
5. [ ] 双击 `deploy-windows.bat`（一键：安装+构建+后台启动）或 `scripts/start-local.bat`（前台启动）
6. [ ] 浏览器打开 `http://localhost:3050`
7. [ ] NAS 部署：在 NAS 上上传源码，`docker compose up -d --build`，访问 `http://<NAS-IP>:3050`

---

## 11. 服务器与群晋 NAS 部署

本系统运行环境：Node.js >= 22.13.0（`engines` 声明 `>=22.13.0 <23`，当前开发环境 v26.13.1 也可运行）。

### 11.1 Windows 一键部署

双击项目根目录的 `deploy-windows.bat`（或在命令行执行 `node scripts/deploy/deploy-windows.mjs`）。脚本会：

1. 检查 Node 版本（需 >= 22.13.0）
2. **清理残留实例**（PID 文件 + 端口 3050/3051 扫描 + 进程名匹配）
3. 缺 `node_modules` 时自动 `npm ci --omit=dev`
4. **智能 build**：扫描 `.next/BUILD_ID` 时间戳 vs 所有源码 + 配置文件 mtime → **`.next` 比源码新则跳过 build（二次启动约 6 秒）**，否则自动 `npm run build`（约 25 秒）
5. 后台启动全栈服务（Web http://127.0.0.1:3050 / API http://127.0.0.1:3051）
6. 轮询 `http://127.0.0.1:3050/api/ready` 等待就绪
7. 打印访问地址与后续步骤

**可选参数**（直接调 mjs 时）：

```powershell
node scripts/deploy/deploy-windows.mjs --force-build   # 强制重建（改了 next.config / tailwind 时用）
node scripts/deploy/deploy-windows.mjs --skip-build    # 跳过 build（确信 .next 好的）
```

成功后会显示（**二次启动示例，跳过了 build**）：

```
[INFO] Node.js: v26.13.1
[INFO] node_modules present, skipping npm ci
[INFO] .next built at 2026/11/23 22:17:00
[INFO] .next is fresh, skipping build. (Use --force-build to rebuild anyway)
[start] Launching background (Web http://127.0.0.1:3050 / API :3051)

========================================
  Deployed - service is running
========================================
[URL] Web:     http://127.0.0.1:3050
[URL] API:     http://127.0.0.1:3051
[URL] Health:  GET http://127.0.0.1:3050/api/ready

[stop] node scripts/stop-local.mjs
```

首次使用：访问 `http://127.0.0.1:3050`，去 `/register` 注册第一个教师（即 admin）并登录。

与 [5.1](#51-windows-一键启动)（前台启动，需保持窗口打开）的区别：11.1 是完整部署——安装、构建、后台启动、健康检查，脚本结束时服务继续运行。

### 11.2 群晋 NAS 部署（推荐：直接拉 ghcr.io 预构建镜像）

**方式 A（推荐）· 从 GitHub Container Registry 拉镜像，免本机构建**

```bash
mkdir -p /volume1/docker/jianti && cd /volume1/docker/jianti
# 下载现成的 compose 文件（已配好 ghcr.io 镜像）
curl -o docker-compose.yml \
  https://raw.githubusercontent.com/wxgoo/jianti-exam-system/main/deploy/nas/docker-compose.yml

# 唯一要改的：APP_BASE_URL=http://<群晋IP>:3050
docker compose pull
docker compose up -d
```

首次启动约 2 分钟（拉镜像 500 MB 左右）。**解压后端已预装**（镜像内含 `unrar` + `p7zip-full` + Python `rarfile`），第一试卷网 RAR 自动入库**开箱即用**。

**方式 B · 本地构建（需要把源码上传到 NAS，第一次慢）**

```bash
# 在源码根目录下
cd jianti-exam-system
docker compose -f deploy/nas/docker-compose.yml up -d --build
```

**方式 C · GitHub 手动发布**（如果你要推自己的镜像）

仓库自带 `.github/workflows/publish-docker.yml`，`push main` 自动 build + push 到 `ghcr.io/wxgoo/jianti-exam-system:latest`。打 tag `v1.0.0` 会同时发 `ghcr.io/wxgoo/jianti-exam-system:v1.0.0`。

**compose 关键配置**（文件里已设置好）：

| 变量/配置 | 值 |
|---|---|
| 镜像 | `ghcr.io/wxgoo/jianti-exam-system:latest`（public） |
| `APP_BASE_URL` | `http://<群晋IP>:3050`（自行替换） |
| `JIANTI_WEB_PORT` | 3050（Web，必需） |
| `JIANTI_API_PORT` | 3051（API，可选映射） |
| `jianti_data` 卷 | 容器内 `/app/data`（SQLite + 上传文件，**持久化**） |
| 重启策略 | `unless-stopped`（自动拉着） |
| 健康检查 | `/api/ready` 30s 间隔，DSM 7.2+ 容器管理器显示绿/红 |

**常用运维**：

```bash
docker compose pull && docker compose up -d   # 升级到最新镜像
docker compose logs -f                         # 看实时日志
docker compose ps                              # 状态
docker compose down                            # 停止（数据保留）
docker compose down -v                         # ⚠️ 清卷（删数据）
```

**注意事项**：

- SQLite 使用 WAL 模式（`PRAGMA journal_mode = WAL`）：建议把存储落在群晋本地磁盘，不要挂载 SMB/NFS 共享网盘（WAL 文件不适合共享文件系统）
- DSM 版本：x86_64 推荐；ARM 架构群晖需改 Dockerfile 用 `node:22-alpine` + 交叉编译
- 端口：3050 必须对外开放（Web）；3051 可不映射（API 仅内部使用）
- 群晖容器管理器里可把 `jianti_data` 卷授给 DSM 用户（Volume1 中显示为普通目录）
- 想接域名反代理：群晖 DSM → 控制面板 → 应用程序门户 → 反向代理 → 来源 `localhost:3050` → 自定义域名

### 11.1.2 Windows NSSM 开机服务（生产推荐）

如果希望开机自动启动、崩溃自动重启，用 NSSM 注册成 Windows 服务：

```powershell
cd jianti-exam-system
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\deploy\install-windows-service.ps1
```

脚本自动：探测 nssm（没有则 winget install）→ 检查 Node 版本 → npm ci + build → `nssm install jianti-exam` → 设置自动启动 + 故障重启 + 日志滚动 → 启动 → 轮询就绪。

成功后看到：
```
========================================
  部署完成 — 服务已就绪
========================================
  Web:     http://127.0.0.1:3050
```

**运维命令**：

```powershell
sc.exe query jianti-exam                     # 查状态
nssm restart jianti-exam                    # 重启（代码更新后）
.\scripts\deploy\uninstall-windows-service.ps1   # 卸载
Get-Content .runtime\logs\service.err.log -Wait   # 实时看错误日志
```

**可选参数**：

```powershell
.\scripts\deploy\install-windows-service.ps1 `
  -ServiceName jianti-exam -WebPort 3050 -ApiPort 3051 `
  -BaseUrl https://exam.yourdomain.com
```

解压后端提示：脚本会自动检查 unrar/7z 是否在 PATH。缺失时建议先 `winget install -e --id=7zip.7zip`。

### 11.3 其他 Linux 服务器（通用，非 Docker）

```bash
npm ci && npm run build && npm start
```

- 端口：Web 3050（必需）、API 3051
- 解压后端：`apt-get install unrar p7zip-full`（或走 Docker 方案更省心）
- 防火墙放行：3050（必需）、3051（可选）
- 数据目录默认 `.runtime/data`，可用 `JIANTI_DATA_DIR` 改到其他位置

### 11.4 管理员账号说明

- 系统没有内置默认管理员账号密码：第一个注册（`POST /api/auth/register`）的教师自动获得 `admin` 角色（`teachers` 表为空时）。
- 开发数据库（`data/teacher-question-bank.sqlite3`）里有测试管理员 `zhangsan`（第一中学，数学；项目测试脚本用密码 `123456`）——正式部署建议使用新库，用自己的首注册账号做 admin。

### 11.5 部署排障提示

1. 启动报 `Could not find a production build`：先执行 `npm run build` 再 `npm start`。
2. 端口被占用：修改 `JIANTI_WEB_PORT` / `JIANTI_API_PORT`。
3. 服务启动失败：先 `node scripts/stop-local.mjs` 清理旧实例，查看控制台输出或 `.runtime/logs/`。
4. 数据库位置：`<项目目录>/data/teacher-question-bank.sqlite3`。
5. Windows 快速排查：双击 `deploy-windows.bat` 重新跑一遍一键部署，看控制台输出。

---

## 12. 后台管理（管理员控制台）

系统提供独立的「后台管理」控制台（`/admin` 页面），集中管理教师、题库、错题、试卷、班级学生、作业和系统设置。仅管理员（`role = "admin"`）可见并访问。

### 12.1 访问与管理员账号

- 登录后在侧边栏点击「后台管理」即可进入控制台。
- 非管理员访问 `/admin` 会自动跳转回 `/`。
- **管理员账号**：没有内置默认账号。第一个注册的教师自动获得 `admin` 角色；管理员也可在「教师管理」里把其他教师设为管理员（角色由 `teachers.role` 决定）。
- 当前管理员账号：`admin`（密码 `admin123`，姓名王兴国）与 `zhangsan`（第一中学，数学）。首次部署后请尽快修改默认密码。

### 12.2 管理板块

| 板块 | 功能 |
|------|------|
| 统计概览 | 教师 / 文档 / 题目 / 已审核题目 / 试卷 / 错题记录 / 班级 / 学生 / 作业 / 学习记录总数 |
| 教师管理 | 列表、创建（用户名/姓名/学校/学科/密码/角色）、编辑（姓名/学校/学科/角色）、重置密码、删除。禁止删除自己、禁止将自己设为普通教师、禁止删除最后一位管理员 |
| 题库管理 | 按科目分类的**单题**视图（不是试卷/文档）：顶部科目标签显示各科题目数，可按类型、审核状态、题干关键词筛选；表格显示科目、类型、题干、状态、难度、来源文档、创建时间。支持查看详情（题干/选项/答案/解析/标签/所属教师）、标记审核通过/未审核/需复核、删除。用于教师组卷或出练习题时从同一题库中选题 |
| 错题管理 | 错题列表、掌握度（未掌握/学习中/已掌握）、状态（开启/关闭）、删除 |
| 试卷管理 | 试卷列表、删除 |
| 试卷夹管理 | 试卷夹列表、创建（名称/学科/学段）、删除 |
| 班级学生管理 | 班级列表（含学生数）、创建班级（名称/年级/学科/学年）、删除班级（移出全部学生） |
| 学生管理 | 学生列表（含班级数）、创建学生（学号+姓名）、删除学生（移出所有班级） |
| 作业管理 | 作业列表、删除 |
| 系统设置 | 应用名称（显示在登录页标题）、允许新教师注册开关、系统公告（显示在工作台顶部） |

### 12.3 管理员API

所有接口需管理员会话，非管理员返回 403。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin` | 总览：`{ admin, stats }` |
| GET | `/api/admin/stats` | 数据统计 |
| GET/POST | `/api/admin/teachers` | 列表；创建教师 |
| GET/PATCH/DELETE | `/api/admin/teachers/[teacherId]` | 详情；编辑姓名/学校/学科/角色；删除 |
| POST | `/api/admin/teachers/[teacherId]/password` | 重置教师密码 |
| GET | `/api/admin/documents` | 文档列表（含所有教师的，分页） |
| PATCH/DELETE | `/api/admin/documents/[documentId]` | 编辑名称/状态/学科/年级/学校；删除（软删除） |
| GET | `/api/admin/questions` | 题目列表；支持 `subject` / `type` / `status` / `search` / `page` / `pageSize`，返回 `questions`、`pagination`、科目分面计数 `subjects` 与 `filteredTotal` |
| GET/DELETE | `/api/admin/questions/[questionId]` | 题目详情（含标签 `tags`）；删除题目 |
| POST | `/api/admin/questions/[questionId]/status` | 设置状态 `pending` / `approved` / `failed` |
| GET | `/api/admin/wrong-records` | 错题列表 |
| PATCH/DELETE | `/api/admin/wrong-records/[wrongId]` | 设置掌握度/状态；删除 |
| GET | `/api/admin/papers` | 试卷列表 |
| DELETE | `/api/admin/papers/[paperId]` | 删除试卷（已被作业使用则报错） |
| GET/POST | `/api/admin/paper-folders` | 试卷夹列表；创建 |
| DELETE | `/api/admin/paper-folders/[folderId]` | 删除试卷夹 |
| GET | `/api/admin/classes` | 班级列表 |
| DELETE | `/api/admin/classes/[classId]` | 删除班级（移出学生） |
| GET/POST | `/api/admin/students` | 学生列表；创建 |
| DELETE | `/api/admin/students/[studentId]` | 删除学生（移出所有班级） |
| GET | `/api/admin/assignments` | 作业列表 |
| DELETE | `/api/admin/assignments/[assignmentId]` | 删除作业 |
| GET/PATCH | `/api/admin/settings` | 系统设置（`appName` / `registrationOpen` / `siteNotice`） |

注册门控：`PATCH /api/admin/settings` 设置 `registration_open = 0` 后，`POST /api/auth/register` 返回 400「注册暂时关闭，请联系管理员」。

### 数据库变更

- `DATABASE_VERSION` 13 → 14：新增 `system_settings` 表（`id` / `value` / `updated_at`），用于存储系统设置（`app_name`、`registration_open`、`site_notice`）。

---

**文档结束**。如有问题，请检查 `data/teacher-question-bank.sqlite3` 数据库文件或 `.runtime/logs/` 目录下的日志。