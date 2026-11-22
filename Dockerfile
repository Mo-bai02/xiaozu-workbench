# ---------- 构建前端 ----------
FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 运行：Node 同时提供 API 与静态文件 ----------
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
# 数据库落在 /app/data，挂 volume 就能持久化
RUN mkdir -p /app/data

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY package.json ./

EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
