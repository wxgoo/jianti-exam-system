# jianti-exam-system — NAS（群晖 DSM）Docker 镜像
# 用法：docker compose up -d --build（见 docker-compose.yml）
# 构建上下文是项目根目录（jianti-exam-system/），自动包含源码与 .next 构建产物
#
# 容器启动时已预装：unrar / 7z / python3 / build-essential
# 所以第一试卷网 .rar 下载后能在容器内自动解压，无需用户先手动解压。
# 详见 server/services/archive-extract.ts 的后端探测链。

# DSM：x86_64 机型推荐；最低 Node 22.13，推荐 node:22 LTS
FROM node:22

WORKDIR /app

# context = project root (jianti-exam-system/)
COPY . .

# better-sqlite3 需要 gcc/make/python3 编译；
# unrar 用于解压第一试卷网 .rar；p7zip-full 解压 .7z；
# rarfile 是 Python 模块（pip install），它自己会探测 unrar/7z/bsdtar 任一；
# unrar 在 Debian 的 non-free 源里，先加源再装（node:22 基于 Debian 12 Bookworm）。
RUN set -eux; \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      python3-pip \
      ca-certificates \
    ; \
    # 试试从 main 装：Debian 12 把 unrar 放 contrib 源了
    apt-get install -y --no-install-recommends unrar p7zip-full || \
      (echo "unrar not in main/contrib, adding non-free" && \
       sed -i 's/ main$/ main contrib non-free/g' /etc/apt/sources.list.d/debian.sources && \
       apt-get update && \
       apt-get install -y --no-install-recommends unrar p7zip-full) || \
      true; \
    # rarfile 用 apt 装太慢太大，直接 pip install
    python3 -m pip install --break-system-packages --no-cache-dir rarfile==4.1 \
      || python3 -m pip install --break-system-packages --no-cache-dir rarfile \
      || true; \
    rm -rf /var/lib/apt/lists/*

# 安装 Node 依赖 + 生产构建
RUN npm ci --omit=dev && npm run build

EXPOSE 3050 3051

CMD ["npm", "start"]
