# Mission Control — Next.js dashboard (production)
# Cloud Run and other container hosts should set PORT (default 8080 below).

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ARG NEXT_PUBLIC_ENABLE_BLOGS=false
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next standalone COPY expects this path; repo may not have a public/ dir.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ENABLE_BLOGS=${NEXT_PUBLIC_ENABLE_BLOGS}
# Prisma CLI only needs a valid SQLite URL for generate (schema is sqlite).
ENV DATABASE_URL="file:./prisma/dev.db"
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
