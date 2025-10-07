# Threadr Application Architecture - Detailed Mermaid Diagrams

## 1. High-Level Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Next.js Frontend]
        B[React Components]
        C[SocketProvider]
        D[PeerService]
    end

    subgraph "Communication Layer"
        E[Socket.IO Client]
        F[WebRTC Peer Connection]
    end

    subgraph "Server Layer"
        G[Node.js Backend]
        H[Socket.IO Server]
        I[Express HTTP Server]
    end

    subgraph "Data Layer"
        J[In-Memory Maps]
        K[Waiting Queue]
        L[Active Rooms]
    end

    A --> B
    B --> C
    C --> E
    B --> D
    D --> F
    E --> H
    F --> H
    H --> G
    G --> I
    G --> J
    G --> K
    G --> L

    style A fill:#e1f5fe
    style G fill:#f3e5f5
    style I fill:#e8f5e8
```

## 2. Component Breakdown

```mermaid
graph TD
    subgraph "Frontend (apps/frontend/)"
        FA[App Router]
        FB[Layout.tsx]
        FC[Page.tsx]
        FD[Room.tsx Component]
        FE[SocketProvider.tsx]
        FF[PeerService.ts]
        FG[UI Components]
        FH[Utils & Libs]
    end

    subgraph "Backend (apps/backend/)"
        BA[Index.ts]
        BB[Socket.ts]
        BC[Routes/]
        BD[Package.json]
    end

    subgraph "Shared"
        SA[Turbo.json]
        SB[Package.json]
        SC[Tsconfig.json]
    end

    FA --> FB
    FB --> FC
    FC --> FD
    FD --> FE
    FD --> FF
    FD --> FG
    FF --> FE
    FE --> FF

    BA --> BB
    BB --> BC

    SA --> FA
    SA --> BA
    SB --> FA
    SB --> BA
    SC --> FA
    SC --> BA

    style FA fill:#bbdefb
    style BA fill:#c8e6c9
    style SA fill:#fff3e0
```

## 3. User Flow Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (Room.tsx)
    participant SP as SocketProvider
    participant PS as PeerService
    participant S as Socket.IO Server
    participant B as Backend Logic

    U->>F: Open App
    F->>F: Initialize Media (getUserMedia)
    F->>SP: useSocket() - Get Socket Instance
    SP->>S: io(socketUrl) - Connect
    S->>B: connection Event
    B->>B: Setup Event Listeners

    F->>F: Auto-start Matching (setTimeout)
    F->>SP: socket.emit("find:match")
    SP->>S: "find:match"
    S->>B: socket.on("find:match")

    alt Queue Empty
        B->>B: Add to waitingQueue
        B->>S: socket.emit("queue:joined")
        S->>SP: "queue:joined"
        SP->>F: Update UI (Searching)
    else Queue Has Partner
        B->>B: Create Room & Match
        B->>S: io.to(partner).emit("match:found")
        B->>S: io.to(socket).emit("match:found")
        S->>SP: "match:found" (to both)
        SP->>F: handleMatchFound
        F->>PS: PeerService.initializePeer()
        F->>PS: PeerService.setRemotePeer()
        F->>PS: PeerService.addTracks(localStream)

        alt Should Initiate
            PS->>PS: createOffer()
            PS->>SP: socket.emit("user:call", {offer})
            SP->>S: "user:call"
            S->>B: socket.on("user:call")
            B->>S: io.to(to).emit("incoming:call")
            S->>SP: "incoming:call"
            SP->>F: handleIncomingCall
            F->>PS: PeerService.createAnswer(offer)
            F->>SP: socket.emit("call:accepted", {answer})
            SP->>S: "call:accepted"
            S->>B: socket.on("call:accepted")
            B->>S: io.to(to).emit("call:accepted")
            S->>SP: "call:accepted"
            SP->>F: handleCallAccepted
            F->>PS: PeerService.setRemoteDescription(answer)
        end

        PS->>PS: WebRTC ICE Candidates Exchange
        PS->>SP: socket.emit("peer:ice-candidate")
        SP->>S: "peer:ice-candidate"
        S->>B: Forward to Partner
        B->>S: io.to(to).emit("peer:ice-candidate")
        S->>SP: "peer:ice-candidate"
        SP->>PS: addIceCandidate()

        PS->>F: ontrack Event (Remote Stream)
        F->>F: Set remoteVideo.srcObject
        F->>F: Update UI (Connected)
    end

    U->>F: Click "Next"
    F->>SP: socket.emit("call:next")
    SP->>S: "call:next"
    S->>B: socket.on("call:next")
    B->>B: handleCallEnd(findNext=true)
    B->>S: io.to(partner).emit("partner:left")
    S->>SP: "partner:left"
    SP->>F: handlePartnerDisconnected
    F->>PS: PeerService.cleanup()
    F->>F: Reset State
    F->>SP: socket.emit("find:match") - Loop Back

    U->>F: Click "End Call"
    F->>SP: socket.emit("call:end")
    SP->>S: "call:end"
    S->>B: socket.on("call:end")
    B->>B: handleCallEnd(findNext=false)
    B->>B: Cleanup Room & Maps
    F->>F: Update UI (Ready)

    U->>F: Close Tab / Disconnect
    SP->>S: disconnect Event
    S->>B: socket.on("disconnect")
    B->>B: handleDisconnect()
    B->>B: Remove from Queue/Room
```

## 4. WebRTC Signaling Flow

```mermaid
stateDiagram-v2
    [*] --> Connecting
    Connecting --> OfferCreated: createOffer()
    OfferCreated --> OfferSent: emit("user:call")
    OfferSent --> AnswerReceived: on("call:accepted")
    AnswerReceived --> RemoteDescSet: setRemoteDescription()
    RemoteDescSet --> ICEExchanging: ICE Candidates
    ICEExchanging --> Connected: oniceconnectionstatechange = "connected"
    Connected --> [*]: cleanup()

    note right of OfferCreated
        SDP Offer contains
        media capabilities
    end note

    note right of AnswerReceived
        SDP Answer contains
        negotiated parameters
    end note

    note right of ICEExchanging
        STUN/TURN servers
        help with NAT traversal
    end note
```

## 5. Backend Event Handling Flowchart

```mermaid
flowchart TD
    A[Socket Connects] --> B{Event Type?}

    B -->|find:match| C[Check if in Queue]
    C -->|Already in Queue| D[Emit "queue:joined"]
    C -->|Not in Queue| E{Check Queue Length}
    E -->|>0| F[Pop Partner from Queue]
    E -->|=0| G[Add to Queue, Emit "queue:joined"]

    F --> H[Create Room ID]
    H --> I[Join Both Sockets to Room]
    I --> J[Update Maps: activeRooms, socketToRoomMap, socketToPartnerMap]
    J --> K[Emit "match:found" to Partner (shouldInitiate=true)]
    K --> L[Emit "match:found" to Current (shouldInitiate=false)]

    B -->|user:call| M[Forward Offer to Target]
    M --> N[Emit "incoming:call" to Target]

    B -->|call:accepted| O[Forward Answer to Target]
    O --> P[Emit "call:accepted" to Target]

    B -->|peer:ice-candidate| Q[Forward ICE Candidate to Target]
    Q --> R[Emit "peer:ice-candidate" to Target]

    B -->|peer:nego:needed| S[Forward Negotiation Offer]
    S --> T[Emit "peer:nego:needed" to Target]

    B -->|peer:nego:done| U[Forward Negotiation Answer]
    U --> V[Emit "peer:nego:final" to Target]

    B -->|call:next| W[handleCallEnd(findNext=true)]
    B -->|call:end| W

    W --> X[Notify Partner "partner:left"]
    X --> Y[Leave Room, Delete Maps]
    Y --> Z{findNext?}
    Z -->|true| AA[Emit "ready:next" to Current]
    Z -->|false| BB[End]

    B -->|disconnect| CC[handleDisconnect()]
    CC --> DD[Remove from Queue/Room]
    DD --> EE[Notify Partner if in Call]

    style A fill:#e8f5e8
    style B fill:#fff3e0
    style L fill:#c8e6c9
    style BB fill:#ffcdd2
```

## 6. Data Structures and State Management

```mermaid
classDiagram
    class UserQueueItem {
        +string socketId
        +number timestamp
    }

    class RoomData {
        +string user1
        +string user2
        +string roomId
    }

    class PeerService {
        -RTCPeerConnection peer
        -string roomId
        -Socket socket
        -Map~string, RTCRtpSender~ senders
        -RTCIceCandidateInit[] pendingCandidates
        -Map~string, StreamTrackingInfo~ _streamTracking
        +initializePeer(roomId: string)
        +createOffer(): RTCSessionDescriptionInit
        +createAnswer(offer): RTCSessionDescriptionInit
        +setRemoteDescription(answer)
        +addTracks(stream: MediaStream)
        +cleanup()
    }

    class StreamTrackingInfo {
        +boolean hasAudio
        +boolean hasVideo
        +boolean emitted
        +NodeJS.Timeout timeoutId
        +MediaStream stream
    }

    class SocketProvider {
        +Socket socket
        +useSocket(): Socket
    }

    class RoomComponent {
        +MediaStream localStream
        +MediaStream remoteStream
        +boolean isSearching
        +boolean isConnected
        +string connectionState
        +handleFindMatch()
        +handleNext()
        +handleEndCall()
    }

    PeerService --> StreamTrackingInfo
    RoomComponent --> SocketProvider
    RoomComponent --> PeerService

    note for UserQueueItem "Stored in waitingQueue array"
    note for RoomData "Stored in activeRooms Map"
```

## 7. Deployment and Infrastructure

```mermaid
graph LR
    subgraph "Development"
        DEV[Local Machine]
        DEV -->|npm run dev| FE[Frontend: localhost:3000]
        DEV -->|npm run dev| BE[Backend: localhost:3001]
    end

    subgraph "Production"
        PROD[Cloud Server]
        PROD -->|Next.js Build| FE_PROD[Frontend: Static Files]
        PROD -->|Node.js| BE_PROD[Backend: Socket.IO Server]
        PROD -->|Nginx| LB[Load Balancer]
        LB --> FE_PROD
        LB --> BE_PROD
    end

    subgraph "Scaling Options"
        REDIS[(Redis)]
        LB2[Load Balancer]
        BE1[Backend Server 1]
        BE2[Backend Server 2]
        BE3[Backend Server 3]

        LB2 --> BE1
        LB2 --> BE2
        LB2 --> BE3
        BE1 --> REDIS
        BE2 --> REDIS
        BE3 --> REDIS
    end

    FE -.->|WebSocket| BE
    FE_PROD -.->|WebSocket| BE_PROD
    BE1 -.->|Adapter| BE2
    BE2 -.->|Adapter| BE3

    style DEV fill:#e3f2fd
    style PROD fill:#f3e5f5
    style REDIS fill:#fff3e0
```

## 8. Error Handling and Recovery

```mermaid
flowchart TD
    A[Error Occurs] --> B{Error Type?}

    B -->|WebRTC Connection| C[PeerService.handleConnectionFailure()]
    B -->|Socket Disconnect| D[handlePartnerDisconnected()]
    B -->|Media Access| E[setError("Failed to access camera/microphone")]
    B -->|ICE Candidate| F[addIceCandidate() with Retry]

    C --> G{Reconnect Attempts < Max?}
    G -->|Yes| H[Increment Attempts, Wait, Retry]
    G -->|No| I[Emit "error", Cleanup]

    D --> J[Set State to "disconnected"]
    D --> K[Cleanup PeerService]
    D --> L[Auto-reconnect after 1s]

    F --> M[Add to pendingCandidates]
    F --> N[Process when remoteDescription set]

    I --> O[User Sees Error Message]
    L --> P[Find New Match]

    style A fill:#ffcdd2
    style O fill:#ffecb3
    style P fill:#c8e6c9
```

## 9. Performance Considerations

```mermaid
pie title Memory Usage Breakdown (Estimated for 10k Users)
    "Socket.IO Connections" : 60
    "WebRTC Peer Connections" : 25
    "In-Memory Data Structures" : 10
    "Node.js Runtime" : 5
```

```mermaid
gantt title Performance Timeline
    dateFormat HH:mm:ss
    axisFormat %H:%M

    section User Journey
    Page Load          :done, 00:00:00, 2s
    Media Access       :done, 00:00:02, 1s
    Socket Connect     :done, 00:00:03, 0.5s
    Find Match         :active, 00:00:03.5, 5s
    WebRTC Signaling   : 00:00:08.5, 3s
    Connected          : 00:00:11.5, 300s
```

## 10. Security Considerations

```mermaid
flowchart LR
    A[Client Request] --> B{CORS Check}
    B -->|Allowed| C[Socket.IO Connection]
    B -->|Blocked| D[Reject]

    C --> E{Authentication?}
    E -->|Required| F[Token Validation]
    E -->|Optional| G[Proceed]

    F -->|Valid| G
    F -->|Invalid| H[Disconnect]

    G --> I[WebRTC Signaling]
    I --> J{Valid Room/User?}
    J -->|Yes| K[Forward Message]
    J -->|No| L[Ignore/Drop]

    K --> M[Peer Connection]
    M --> N{ICE Candidates Valid?}
    N -->|Yes| O[Establish Connection]
    N -->|No| P[Filter Out]

    style A fill:#e8f5e8
    style D fill:#ffcdd2
    style H fill:#ffcdd2
    style L fill:#ffecb3
    style P fill:#ffecb3
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