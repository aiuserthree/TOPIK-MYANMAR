# Build from repo root: docker build -f api/Dockerfile .
FROM node:20-alpine AS builder
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app/api
ENV NODE_ENV=production
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/api/dist ./dist
COPY api/scripts ./scripts
COPY db /app/db
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
# Production: prod seed only (reference data). Dev demo/admin come from `npm run migrate` locally.
CMD ["sh", "-c", "node scripts/migrate.js --prod && node dist/index.js"]
