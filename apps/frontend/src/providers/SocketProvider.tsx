"use client";

import { createContext, useMemo, useContext, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import PeerService from "../services/peer";

const SocketContext = createContext<Socket | null>(null);

export const useSocket = (): Socket | null => {
  const socket = useContext(SocketContext);
  return socket;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

  const socket = useMemo(() => {
    const s = io(socketUrl);

    s.on("connect", () => {
    });

    s.on("disconnect", () => {
      console.log("🔌 Socket disconnected");
    });

    s.on("user:joined", ({ id, room }: { id: string; room: string }) => {
      console.log(`New user joined room ${room} with ID:`, id);
    });

    return s;
  }, [socketUrl]);

  PeerService.setSocket(socket);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
