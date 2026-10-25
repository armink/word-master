# ─────────────────────────────────────────────────────────────
# Stage 1: 构建前端静态文件
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

# 子路径部署时传入，如：docker build --build-arg VITE_BASE_URL=/word-master/ .
# 默认 / 表示根路径部署
ARG VITE_BASE_URL=/
ENV VITE_BASE_URL=$VITE_BASE_URL

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# 获取 git SHA 写入 .env，供 Vite 构建时注入（无需手动传 --build-arg）
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY .git/ ./.git/
RUN echo "VITE_GIT_SHA=$(git rev-parse --short HEAD)" >> .env \
    && rm -rf .git

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: 编译后端 TypeScript + 安装生产依赖
#   使用 node:20-slim（glibc），better-sqlite3 可直接下载预编译包，
#   无需 python3/make/g++
#   INSTALL_SEMANTIC=false 时剔除本地语义模型（@xenova/transformers），
#   适合内存受限的轻量部署（配合运行时 SEMANTIC_ENABLED=false）
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS backend-build

ARG INSTALL_SEMANTIC=true

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build
# 移除 devDependencies；轻量构建时同时移除 optionalDependencies（语义模型栈）
RUN if [ "$INSTALL_SEMANTIC" = "false" ]; then \
      npm prune --omit=dev --omit=optional; \
    else \
      npm prune --omit=dev; \
    fi
# 裁剪运行期用不到的内容：
#   - @xenova/transformers/dist 仅浏览器端使用（Node 走 src 入口）
#   - onnxruntime-node 的 macOS / Windows 预编译二进制
RUN rm -rf node_modules/@xenova/transformers/dist \
           node_modules/onnxruntime-node/bin/napi-v3/darwin \
           node_modules/onnxruntime-node/bin/napi-v3/win32

# ─────────────────────────────────────────────────────────────
# Stage 3: 最终运行镜像
# ─────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# 后端编译产物
COPY --from=backend-build /app/backend/dist       ./dist
# 生产依赖（含已编译的 better-sqlite3）
COPY --from=backend-build /app/backend/node_modules ./node_modules
# 前端构建产物（backend 在生产模式下托管）
COPY --from=frontend-build /app/frontend/dist     ./frontend-dist

# SQLite 数据目录（挂载持久卷使用）
RUN mkdir -p data

# 运行时不需要 npm/npx/corepack，删除以减小镜像体积（约 50MB）
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /root/.npm

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
