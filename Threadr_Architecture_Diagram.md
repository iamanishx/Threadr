# Threadr Application Architecture - Detailed Mermaid Diagrams

## 1. High-Level Architecture Overview

```mermaid
graph TB
    subgraph "Frontend (Client)"
        A[Next.js App]
        B[Room Component]
        C[SocketProvider]
        D[PeerService]
        E[Socket.IO Client]
        F[WebRTC Peer Connection]
    end

    subgraph "Backend (Server)"
        G[Bun Runtime]
        H[Socket.IO Server]
        I[HTTP Server]
        J[In-Memory Data]
        J1[Waiting Queue]
        J2[Active Rooms]
        J3[Socket Maps]
    end

    subgraph "Communication"
        K[WebSocket Signaling]
        L[WebRTC P2P Video/Audio]
    end

    A --> B
    B --> C
    B --> D
    C --> E
    D --> F
    E --> K
    F --> L
    K --> H
    L --> H
    H --> G
    G --> I
    G --> J
    J --> J1
    J --> J2
    J --> J3

    style A fill:#e1f5fe
    style G fill:#f3e5f5
    style K fill:#fff3e0
    style L fill:#e8f5e8
```


## Summary

This Threadr application is a real-time video chat platform similar to Omegle, built with:

- **Frontend**: Next.js + React + TypeScript + Socket.IO Client + WebRTC
- **Backend**: Node.js + Socket.IO Server + Express
- **Communication**: WebSocket for signaling, WebRTC for P2P video/audio
- **Matching**: Queue-based random pairing system
- **State Management**: In-memory data structures (scalable with Redis)
- **Deployment**: Single server for small scale, horizontal scaling for large scale

Key features include automatic media access, real-time matching, WebRTC video calls, and graceful error handling with reconnection logic.