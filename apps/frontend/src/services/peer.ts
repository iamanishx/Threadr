import { EventEmitter } from "events";
import { Socket } from "socket.io-client";

interface StreamTrackingInfo {
  hasAudio: boolean;
  hasVideo: boolean;
  emitted: boolean;
  timeoutId: NodeJS.Timeout | null;
  stream: MediaStream;
}

interface RTCConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  iceTransportPolicy?: RTCIceTransportPolicy;
}

interface CloudflareCredentials {
  urls: string | string[];
  username: string;
  credential: string;
}

class PeerService extends EventEmitter {
  private peer: RTCPeerConnection | null = null;
  private roomId: string | null = null;
  private socket: Socket | null = null;
  
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private isReconnecting: boolean = false;
  private isSettingRemoteDescription: boolean = false;

  private senders: Map<string, RTCRtpSender> = new Map();
  private pendingCandidates: RTCIceCandidateInit[] = [];

  private _streamTracking: Map<string, StreamTrackingInfo> = new Map();
  private remotePeerId: string | null = null;
  private iceTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  setSocket(socket: Socket): void {
    this.socket = socket;
    this.setupSocketEvents();
  }

  private setupSocketEvents(): void {
    if (!this.socket) return;

    this.socket.off("peer:ice-candidate");

    this.socket.on("peer:ice-candidate", ({ candidate, room }: { candidate: RTCIceCandidateInit; room: string }) => {
      if (candidate && this.peer && room === this.roomId) {
        this.addIceCandidate(candidate);
      }
    });
  }

  // ICE Candidate Management
  private async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      if (this.peer?.remoteDescription && this.peer?.remoteDescription.type) {
        await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
      this.emit("error", {
        type: "ice-candidate",
        message: "Error adding ICE candidate",
        error,
      });
    }
  }

  // Offer/Answer Management
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peer) {
      throw new Error("No peer connection available");
    }

    try {
      const offer = await this.peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
      });

      await this.peer.setLocalDescription(offer);
      return offer;
    } catch (error) {
      this.emit("error", {
        type: "offer",
        message: "Error creating offer",
        error,
      });
      await this.handleConnectionFailure();
      throw error;
    }
  }

  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peer) {
      throw new Error("No peer connection available");
    }
    try {
      await this.peer.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);

      return answer;
    } catch (error) {
      console.error("Error creating answer:", error);
      this.emit("error", {
        type: "answer",
        message: "Error creating answer",
        error,
      });
      await this.handleConnectionFailure();
      throw error;
    }
  }

  async setRemoteDescription(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peer) {
      console.warn("No peer connection available for setRemoteDescription");
      return;
    }
    if (this.isSettingRemoteDescription) {
      return;
    }
    try {
      this.isSettingRemoteDescription = true;
      const currentState = this.peer.signalingState;
      if (["stable", "have-local-offer"].includes(currentState)) {
        await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
        await this.processPendingCandidates();
      } else {
        const errorMsg = `Invalid signaling state for remote description: ${currentState}`;
        console.warn("⚠️", errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error setting remote description:", error);
      this.emit("error", {
        type: "remote-description",
        message: "Connection failed. Please try again.",
        error,
      });
      await this.handleConnectionFailure();
    } finally {
      this.isSettingRemoteDescription = false;
    }
  }

  private async processPendingCandidates(): Promise<void> {
    if (this.pendingCandidates.length === 0) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        await this.addIceCandidate(candidate);
      }
    }
  }

  async initializePeer(roomId: string): Promise<void> {
    this.cleanup();

    this.roomId = roomId;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    await this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.initializeWithTurnAndStun();
    } catch (error) {
      console.error("Connection initialization failed", error);
      throw error;
    }
  }

  private async initializeWithTurnAndStun(): Promise<void> {
    try {
      const credUrl = process.env.NEXT_PUBLIC_TURN_CRED_URL;
      
      const iceServers: RTCIceServer[] = [
        {
          urls: [
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
          ],
        },
      ];

      if (credUrl) {
        try {
          const response = await fetch(credUrl);
          const cloudflareCredentials: CloudflareCredentials = await response.json();
          
          iceServers.push({
            urls: cloudflareCredentials.urls,
            username: cloudflareCredentials.username,
            credential: cloudflareCredentials.credential,
          });
        } catch (err) {
          console.warn("Failed to get Cloudflare TURN credentials:", err);
        }
      }

      const expressTurnUsername = process.env.NEXT_PUBLIC_EXPRESSTURN_USERNAME;
      const expressTurnCredential = process.env.NEXT_PUBLIC_EXPRESSTURN_CREDENTIAL;
      if (expressTurnUsername) {
        iceServers.push({
          urls: ["turn:relay1.expressturn.com:3478"],
          username: expressTurnUsername,
          credential: expressTurnCredential!,
        });
      }

      const config: RTCConfig = {
        iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      };

      await this.createPeerConnection(config);
    } catch (error) {
      console.error("Error initializing connection:", error);
      throw error;
    }
  }

  private async createPeerConnection(config: RTCConfig): Promise<void> {
    if (!config?.iceServers?.length) {
      throw new Error("Invalid configuration: iceServers array is required");
    }

    this.peer = new RTCPeerConnection(config);
    this.setupPeerEvents();
  }

  setRemotePeer(peerId: string): void {
    this.remotePeerId = peerId;
  }

  private setupPeerEvents(): void {
    if (!this.peer) return;

    // ICE candidate handling
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate && this.socket) {
        if (this.remotePeerId) {
          this.socket.emit("peer:ice-candidate", {
            candidate,
            to: this.remotePeerId,
            room: this.roomId,
          });
        }
      }
    };

    this.peer.ontrack = (event: RTCTrackEvent) => {
      this.handleIncomingTrack(event);
    };

    // Connection state monitoring
    this.peer.oniceconnectionstatechange = () => {
      const iceState = this.peer?.iceConnectionState;

      switch (iceState) {
        case "connected":
        case "completed":
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit("iceConnected");
          break;
        case "checking":
          if (this.iceTimeout) clearTimeout(this.iceTimeout);
          this.iceTimeout = setTimeout(() => {
            if (this.peer?.iceConnectionState === "checking") {
              this.handleConnectionFailure();
            }
          }, 10000);
          break;
        case "failed":
          if (this.iceTimeout) clearTimeout(this.iceTimeout);
          this.handleConnectionFailure();
          break;
        case "disconnected":
          if (this.iceTimeout) clearTimeout(this.iceTimeout);
          setTimeout(() => {
            if (this.peer?.iceConnectionState === "disconnected") {
              this.handleConnectionFailure();
            }
          }, 3000);
          break;
        default:
      }
    };

    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;

      if (state === "connected") {
        console.log("Peer connection fully established");
      } else if (["failed", "disconnected"].includes(state || "")) {
        this.handleConnectionFailure();
      }
    };

    // Signaling state changes
    this.peer.onsignalingstatechange = () => {
      console.log("Signaling state:", this.peer?.signalingState);
    };
  }

  // Track Handling
  private handleIncomingTrack(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    if (!stream) {
      return;
    }

    const streamId = stream.id;
    const trackKind = event.track.kind;

    let trackingInfo = this._streamTracking.get(streamId);
    if (!trackingInfo) {
      trackingInfo = {
        hasAudio: false,
        hasVideo: false,
        emitted: false,
        timeoutId: null,
        stream: stream,
      };
      this._streamTracking.set(streamId, trackingInfo);
    }

    if (trackKind === "audio") {
      trackingInfo.hasAudio = true;
    } else if (trackKind === "video") {
      trackingInfo.hasVideo = true;
    }

    if (trackingInfo.timeoutId) {
      clearTimeout(trackingInfo.timeoutId);
    }

    trackingInfo.timeoutId = setTimeout(() => {
      if (!trackingInfo.emitted) {
        trackingInfo.emitted = true;
        this.emit("remoteStream", { stream: trackingInfo.stream });
      }
    }, 1000);
  }

  // Track Management
  async addTracks(stream: MediaStream): Promise<void> {
    if (!this.peer || !stream) {
      console.error("No peer connection or stream available");
      return;
    }

    try {
      for (const sender of this.senders.values()) {
        try {
          this.peer.removeTrack(sender);
        } catch (e: any) {
          console.warn("Error removing existing track:", e.message);
        }
      }
      this.senders.clear();

      // Add new tracks
      const tracks = stream.getTracks();
      tracks.forEach((track) => {
        try {
          const sender = this.peer!.addTrack(track, stream);
          this.senders.set(track.kind, sender);
        } catch (e) {
          console.error(`Error adding ${track.kind} track:`, e);
        }
      });
    } catch (error) {
      console.error("Error managing tracks:", error);
      this.emit("error", {
        type: "add-tracks",
        message: "Error adding tracks",
        error,
      });
    }
  }

  // Connection Recovery
  private async handleConnectionFailure(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      this.emit("error", {
        type: "reconnect",
        message: "Connection failed. Please refresh and try again.",
      });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    setTimeout(async () => {
      try {
        const currentRemotePeer = this.remotePeerId;
        const currentRoom = this.roomId;
        
        await this.cleanup();
        await this.initializeWithTurnAndStun();
        
        this.remotePeerId = currentRemotePeer;
        this.roomId = currentRoom;
        
        if (this.remotePeerId && this.roomId) {
          this.emit("reconnectCall");
        }

        this.isReconnecting = false;
      } catch (error) {
        console.error("Reconnection failed:", error);
        this.isReconnecting = false;
        setTimeout(() => this.handleConnectionFailure(), 1000);
      }
    }, delay);
  }

  // Utility Methods
  async switchMediaSource(newStream: MediaStream): Promise<void> {
    if (!this.peer) {
      console.error("No peer connection available for media switch");
      return;
    }
    console.log("Switching media source");
    await this.addTracks(newStream);
    this.emit("media-source-switched", { newStream });
  }

  async waitForStableState(timeout: number = 5000): Promise<void> {
    if (!this.peer || this.peer.signalingState === "stable") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timeout waiting for stable signaling state"));
      }, timeout);

      const checkState = () => {
        if (!this.peer || this.peer.signalingState === "stable") {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(checkState, 100);
        }
      };

      checkState();
    });
  }

  // Cleanup
  cleanup(): void {
    for (const trackingInfo of this._streamTracking.values()) {
      if (trackingInfo.timeoutId) {
        clearTimeout(trackingInfo.timeoutId);
      }
    }
    this._streamTracking.clear();

    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onicecandidate = null;
      this.peer.oniceconnectionstatechange = null;
      this.peer.onconnectionstatechange = null;
      this.peer.onsignalingstatechange = null;
      this.remotePeerId = null;

      this.peer.close();
      this.peer = null;
    }

    this.senders.clear();
    this.pendingCandidates.length = 0;
    this.roomId = null;
    this.isReconnecting = false;
    this.isSettingRemoteDescription = false;
    this.reconnectAttempts = 0;
  }

  get connectionState(): RTCPeerConnectionState {
    return this.peer?.connectionState || "closed";
  }

  get iceConnectionState(): RTCIceConnectionState {
    return this.peer?.iceConnectionState || "closed";
  }

  get signalingState(): RTCSignalingState {
    return this.peer?.signalingState || "closed";
  }
}

export default new PeerService();
