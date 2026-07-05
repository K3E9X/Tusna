# Tusna web app — multi-stage build producing a tiny standalone image.
# Runs anywhere Node runs: Linux or Windows containers, Docker, Kubernetes, bare VM.
#
#   docker build -t tusna .
#   docker run -p 3000:3000 tusna
#
# Optional env (all features degrade gracefully if unset):
#   COLLECTOR_URL, COLLECTOR_TOKEN  → deep scans (Maigret/Holehe/SpiderFoot worker)
#   POSTGRES_URL                    → durable cases + snapshot history (else localStorage)
#   INTELX_API_KEY                  → breach search (optional)
#   RECORDED_FUTURE_API_KEY         → enterprise risk/exposure (optional bonus)
#   LLM_API_URL / LLM_MODEL         → grounded synthesis (optional)

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# standalone output bundles only what's needed to run
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
