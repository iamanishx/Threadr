# Backend Dockerfile
FROM oven/bun:1.2.23

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Expose backend port
EXPOSE 3001

# Set environment variable
ENV PORT=3001

# Start backend
CMD ["bun", "run", "start"]
