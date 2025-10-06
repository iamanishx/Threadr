import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import axios from "axios";

export async function turnRoutes(fastify: FastifyInstance) {
  fastify.get("/get-turn-credentials", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const TURN_TOKEN_ID = process.env.TURN_TOKEN_ID;
      const API_TOKEN = process.env.API_TOKEN;

      if (!TURN_TOKEN_ID || !API_TOKEN) {
        return reply.status(500).send({
          error: "TURN credentials not configured",
        });
      }

      const response = await axios.post(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_TOKEN_ID}/credentials/generate`,
        {
          ttl: 86400,
        },
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      return reply.send(response.data.iceServers);
    } catch (error: any) {
      fastify.log.error("Error generating TURN credentials:", error.response?.data || error.message);
      return reply.status(500).send({
        error: "Failed to generate TURN credentials",
      });
    }
  });
}
