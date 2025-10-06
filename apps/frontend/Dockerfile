# Frontend Dockerfile
FROM oven/bun:1.2.23 AS builder

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build args for environment variables
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_TURN_CRED_URL
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
ENV NEXT_PUBLIC_TURN_CRED_URL=${NEXT_PUBLIC_TURN_CRED_URL}

# Build Next.js app
RUN bun run build

# Production stage
FROM oven/bun:1.2.23

WORKDIR /app

# Copy built files and dependencies from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Expose frontend port
EXPOSE 3000

# Start frontend
CMD ["bun", "run", "start"]
