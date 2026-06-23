# AUTOCONT — Dockerfile multi-stage para empaquetar la app v0.1
#
# Uso:
#   docker build -t autocont .
#   docker run -p 3000:3000 -v $(pwd)/data:/app/data -v $(pwd)/public/uploads:/app/public/uploads autocont
#
# O con docker-compose:
#   docker compose up -d

# ─── Stage 1: deps ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 necesita build tools en imagen slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=optional

# ─── Stage 2: builder ─────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runner ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# ffmpeg para el pipeline de transcripción/extracción de audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root
RUN groupadd -r autocont && useradd -r -g autocont -m -d /app autocont || true

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# data/ y public/uploads/ se montan como volúmenes (persistencia)
RUN mkdir -p data public/uploads && chown -R autocont:autocont /app

USER autocont
EXPOSE 3000
CMD ["node", "server.js"]
