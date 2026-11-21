# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build && npm prune --omit=dev

# ---- run ----
FROM node:22-alpine
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
WORKDIR /app
COPY --from=build /app /app
# Runs as root so a mounted persistent disk (Render/Fly volume) is writable.
RUN mkdir -p /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${PORT}/healthz || exit 1
CMD ["npx", "tsx", "server/src/index.ts"]
