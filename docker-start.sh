#!/bin/bash
set -e

echo "🚀 Starting Threadr Services..."

# Start backend in background
cd /app/apps/backend
echo "📡 Starting Backend on port 3001..."
PORT=3001 bun run index.ts &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start frontend
cd /app/apps/frontend
echo "🎨 Starting Frontend on port 3000..."
bun run start &
FRONTEND_PID=$!

echo "✅ Both services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
