# ─── Build Stage ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# argon2 requires native build tools on Alpine
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ─── Production Stage ─────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# argon2 native addon must be compiled in production stage too
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Remove build tools after install to shrink image
RUN apk del python3 make g++

COPY --from=builder /app/dist ./dist

# Health check for Render
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["node", "dist/server.js"]
