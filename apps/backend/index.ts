import Fastify from "fastify";
import cors from "@fastify/cors";
import { initializeSocket } from "./socket";
import { turnRoutes } from "./routes/turn";

const fastify = Fastify({
  logger: true,
});

// Register CORS
fastify.register(cors, {
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    process.env.FRONTEND_URL || "",
  ].filter(Boolean),
  credentials: true,
});

// Register routes
fastify.register(turnRoutes, { prefix: "/api" });

// Health check
fastify.get("/", async (request, reply) => {
  return { status: "ok", service: "omegle-backend" };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: "0.0.0.0" });
    
    // Initialize Socket.IO
    const io = initializeSocket(fastify.server);
    console.log("✅ Socket.IO initialized");
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();