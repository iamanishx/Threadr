import { Server as SocketServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";

// WebRTC type definitions for Node.js environment
type RTCSessionDescriptionInit = any;
type RTCIceCandidateInit = any;

interface UserQueueItem {
  socketId: string;
  timestamp: number;
}

interface RoomData {
  user1: string;
  user2: string;
  roomId: string;
}

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL || "",
].filter(Boolean);

// Global state
const waitingQueue: UserQueueItem[] = [];
const activeRooms = new Map<string, RoomData>();
const socketToRoomMap = new Map<string, string>();
const socketToPartnerMap = new Map<string, string>();

export const initializeSocket = (server: HTTPServer) => {
  const io = new SocketServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    },
  });

  io.on("connection", (socket: Socket) => {

    // User wants to find a match
    socket.on("find:match", () => {
      console.log(`🔍 ${socket.id} looking for match`);
      
      // Check if user is already in queue
      const alreadyInQueue = waitingQueue.some((item) => item.socketId === socket.id);
      if (alreadyInQueue) {
        console.log(`⚠️ ${socket.id} already in queue`);
        return;
      }

      // Check if there's someone waiting
      if (waitingQueue.length > 0) {
        const partner = waitingQueue.shift()!;
        
        // Create a unique room for this pair
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Both users join the room
        socket.join(roomId);
        io.sockets.sockets.get(partner.socketId)?.join(roomId);
        
        // Store room and partner information
        activeRooms.set(roomId, {
          user1: partner.socketId,
          user2: socket.id,
          roomId,
        });
        socketToRoomMap.set(socket.id, roomId);
        socketToRoomMap.set(partner.socketId, roomId);
        socketToPartnerMap.set(socket.id, partner.socketId);
        socketToPartnerMap.set(partner.socketId, socket.id);
        
        console.log(`✅ Matched ${partner.socketId} with ${socket.id} in ${roomId}`);
        
        // Notify both users they've been matched
        io.to(partner.socketId).emit("match:found", {
          roomId,
          partnerId: socket.id,
          shouldInitiate: true, // First user initiates the call
        });
        
        io.to(socket.id).emit("match:found", {
          roomId,
          partnerId: partner.socketId,
          shouldInitiate: false, // Second user waits
        });
      } else {
        // Add to waiting queue
        waitingQueue.push({
          socketId: socket.id,
          timestamp: Date.now(),
        });
        socket.emit("queue:joined", { position: waitingQueue.length });
        console.log(`📝 ${socket.id} added to queue. Queue size: ${waitingQueue.length}`);
      }
    });

    // User cancels search
    socket.on("find:cancel", () => {
      const index = waitingQueue.findIndex((item) => item.socketId === socket.id);
      if (index !== -1) {
        waitingQueue.splice(index, 1);
        console.log(`❌ ${socket.id} left queue`);
        socket.emit("queue:left");
      }
    });

    // User wants to skip/next
    socket.on("call:next", () => {
      handleCallEnd(socket, true);
    });

    // User ends call
    socket.on("call:end", () => {
      handleCallEnd(socket, false);
    });

    // WebRTC signaling events
    socket.on("user:call", ({ to, offer, room }: { to: string; offer: RTCSessionDescriptionInit; room: string }) => {
      console.log(`📞 Call initiated from ${socket.id} to ${to} in room ${room}`);
      io.to(to).emit("incoming:call", {
        from: socket.id,
        offer,
        room,
      });
    });

    socket.on("peer:ice-candidate", ({ candidate, to, room }: { candidate: RTCIceCandidateInit; to: string; room: string }) => {
      console.log(`📤 Forwarding ICE candidate from ${socket.id} to ${to} in room ${room}`);
      io.to(to).emit("peer:ice-candidate", {
        candidate,
        from: socket.id,
        room,
      });
    });

    socket.on("call:accepted", ({ to, answer, room }: { to: string; answer: RTCSessionDescriptionInit; room: string }) => {
      console.log(`✅ Call accepted by ${socket.id} in room ${room}`);
      io.to(to).emit("call:accepted", {
        from: socket.id,
        answer,
        room,
      });
    });

    socket.on("peer:nego:needed", ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
      const room = socketToRoomMap.get(socket.id);
      console.log(`🔄 Negotiation needed in room ${room} from ${socket.id}`);
      io.to(to).emit("peer:nego:needed", {
        from: socket.id,
        offer,
        room,
      });
    });

    socket.on("peer:nego:done", ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
      const room = socketToRoomMap.get(socket.id);
      console.log(`✔️ Negotiation completed in room ${room}`);
      io.to(to).emit("peer:nego:final", {
        from: socket.id,
        answer,
        room,
      });
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Socket Disconnected:`, socket.id);
      handleDisconnect(socket);
    });
  });

  // Helper function to handle call end
  function handleCallEnd(socket: Socket, findNext: boolean) {
    const roomId = socketToRoomMap.get(socket.id);
    const partnerId = socketToPartnerMap.get(socket.id);

    if (roomId && partnerId) {
      console.log(`🔚 Call ended in room ${roomId}. FindNext: ${findNext}`);
      
      // Notify partner
      io.to(partnerId).emit("partner:left", { findNext });
      
      // Clean up room
      socket.leave(roomId);
      io.sockets.sockets.get(partnerId)?.leave(roomId);
      
      activeRooms.delete(roomId);
      socketToRoomMap.delete(socket.id);
      socketToRoomMap.delete(partnerId);
      socketToPartnerMap.delete(socket.id);
      socketToPartnerMap.delete(partnerId);
      
      if (findNext) {
        socket.emit("ready:next");
        // Automatically find next match for both users if they want
        setTimeout(() => {
          socket.emit("ready:next");
        }, 100);
      }
    }
  }

  // Helper function to handle disconnect
  function handleDisconnect(socket: Socket) {
    // Remove from queue if present
    const queueIndex = waitingQueue.findIndex((item) => item.socketId === socket.id);
    if (queueIndex !== -1) {
      waitingQueue.splice(queueIndex, 1);
    }

    // Handle active call disconnect
    const roomId = socketToRoomMap.get(socket.id);
    const partnerId = socketToPartnerMap.get(socket.id);

    if (roomId && partnerId) {
      io.to(partnerId).emit("partner:disconnected");
      
      // Clean up
      activeRooms.delete(roomId);
      socketToRoomMap.delete(socket.id);
      socketToRoomMap.delete(partnerId);
      socketToPartnerMap.delete(socket.id);
      socketToPartnerMap.delete(partnerId);
      
      io.sockets.sockets.get(partnerId)?.leave(roomId);
    }
  }

  return io;
};
