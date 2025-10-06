# Base stage
FROM oven/bun:1.2.23 AS base
WORKDIR /app

# Dependencies stage - Install all workspace dependencies
FROM base AS deps
COPY package.json bun.lock* ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
RUN bun install

# Backend builder - Build backend application
FROM base AS backend-builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
RUN bun install

# Frontend builder - Build Next.js application
FROM base AS frontend-builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend
RUN bun install

# Build frontend with environment variables
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
RUN bun run build

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Copy backend
COPY --from=backend-builder /app/apps/backend ./apps/backend

# Copy frontend
COPY --from=frontend-builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=frontend-builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=frontend-builder /app/apps/frontend/package.json ./apps/frontend/
COPY --from=frontend-builder /app/apps/frontend/node_modules ./apps/frontend/node_modules

# Install turbo globally
RUN bun add -g turbo

# Copy workspace files
COPY package.json turbo.json ./

# Expose ports
EXPOSE 3000 3001

# Start script
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

CMD ["./docker-start.sh"]
