"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSocket } from "@/providers/SocketProvider"
import PeerService from "@/services/peer"
import { Button } from "@/components/ui/button"
import { Video, VideoOff, Mic, MicOff, SkipForward, PhoneOff, Search, X } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Room() {
  const socket = useSocket()
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<string>("initializing")
  const [error, setError] = useState<string | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const currentRoomRef = useRef<string | null>(null)
  const currentPartnerRef = useRef<string | null>(null)
  const hasAutoStartedRef = useRef(false)

  // Initialize local media and auto-start matching
  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        setLocalStream(stream)
        setConnectionState("ready")

        if (!hasAutoStartedRef.current) {
          hasAutoStartedRef.current = true
          setTimeout(() => {
            if (socket) {
              setIsSearching(true)
              setConnectionState("searching")
              socket.emit("find:match")
            }
          }, 500)
        }
      } catch (err: any) {
        console.error("Error accessing media devices:", err)
        setError("Failed to access camera/microphone. Please check permissions.")
        setConnectionState("error")
      }
    }

    initMedia()

    return () => {
      localStream?.getTracks().forEach((track) => track.stop())
    }
  }, [socket])

  // Attach local stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Handle remote video playback
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
      remoteVideoRef.current.play().catch((err) => {
        console.warn("Remote video autoplay failed:", err)
      })
    }
  }, [remoteStream])

  // Handle match found
  const handleMatchFound = useCallback(
    async (data: { roomId: string; partnerId: string; shouldInitiate?: boolean; isInitiator?: boolean }) => {
      const isInitiator = data.shouldInitiate || data.isInitiator || false
      setIsSearching(false)
      setConnectionState("connecting")
      currentRoomRef.current = data.roomId
      currentPartnerRef.current = data.partnerId

      try {
        await PeerService.initializePeer(data.roomId)
        PeerService.setRemotePeer(data.partnerId)

        if (localStream) {
          await PeerService.addTracks(localStream)
        }

        if (isInitiator) {
          const offer = await PeerService.createOffer()
          socket?.emit("user:call", {
            to: data.partnerId,
            offer,
            room: data.roomId,
          })
        }
      } catch (error) {
        console.error("Error in handleMatchFound:", error)
        setError("Failed to establish connection")
      }
    },
    [socket, localStream],
  )

  // Handle incoming call
  const handleIncomingCall = useCallback(
    async (data: { from: string; offer: RTCSessionDescriptionInit; room: string }) => {
      setConnectionState("connecting")
      currentRoomRef.current = data.room
      currentPartnerRef.current = data.from

      try {
        if (localStream) {
          await PeerService.addTracks(localStream)
        }

        const answer = await PeerService.createAnswer(data.offer)
        socket?.emit("call:accepted", {
          to: data.from,
          answer,
          room: data.room,
        })
      } catch (error) {
        console.error("Error handling incoming call:", error)
      }
    },
    [socket, localStream],
  )

  // Handle call accepted
  const handleCallAccepted = useCallback(async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    try {
      await PeerService.setRemoteDescription(data.answer)
    } catch (error) {
      console.error("Error setting remote description:", error)
    }
  }, [])

  // Handle negotiation needed
  const handleNegoNeeded = useCallback(
    async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      try {
        const answer = await PeerService.createAnswer(data.offer)
        socket?.emit("peer:nego:done", {
          to: data.from,
          answer,
        })
      } catch (error) {
        console.error("Error in negotiation:", error)
      }
    },
    [socket],
  )

  // Handle negotiation done
  const handleNegoDone = useCallback(async (data: { answer: RTCSessionDescriptionInit }) => {
    try {
      await PeerService.setRemoteDescription(data.answer)
    } catch (error) {
      console.error("Error in final negotiation:", error)
    }
  }, [])

  // Handle partner disconnected
  const handlePartnerDisconnected = useCallback(() => {
    setIsConnected(false)
    setRemoteStream(null)
    setConnectionState("disconnected")
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    PeerService.cleanup()
    currentRoomRef.current = null
    currentPartnerRef.current = null

    // Auto-reconnect to find new stranger
    setTimeout(() => {
      if (socket && localStream) {
        setIsSearching(true)
        setConnectionState("searching")
        socket.emit("find:match")
      }
    }, 1000)
  }, [socket, localStream])

  // Setup socket listeners
  useEffect(() => {
    if (!socket) return

    socket.on("match:found", handleMatchFound)
    socket.on("incoming:call", handleIncomingCall)
    socket.on("user:call", handleIncomingCall)
    socket.on("call:accepted", handleCallAccepted)
    socket.on("peer:nego:needed", handleNegoNeeded)
    socket.on("peer:nego:done", handleNegoDone)
    socket.on("peer:nego:final", handleNegoDone)
    socket.on("partner:disconnected", handlePartnerDisconnected)
    socket.on("partner:left", handlePartnerDisconnected)

    return () => {
      socket.off("match:found", handleMatchFound)
      socket.off("incoming:call", handleIncomingCall)
      socket.off("user:call", handleIncomingCall)
      socket.off("call:accepted", handleCallAccepted)
      socket.off("peer:nego:needed", handleNegoNeeded)
      socket.off("peer:nego:done", handleNegoDone)
      socket.off("peer:nego:final", handleNegoDone)
      socket.off("partner:disconnected", handlePartnerDisconnected)
      socket.off("partner:left", handlePartnerDisconnected)
    }
  }, [
    socket,
    handleMatchFound,
    handleIncomingCall,
    handleCallAccepted,
    handleNegoNeeded,
    handleNegoDone,
    handlePartnerDisconnected,
  ])

  // Setup peer service listeners
  useEffect(() => {
    const handleRemoteStream = ({ stream }: { stream: MediaStream }) => {
      setRemoteStream(stream)
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream
      }
      setIsConnected(true)
      setConnectionState("connected")
    }

    const handleIceConnected = () => {
      setConnectionState("connected")
    }

    const handleError = ({ message }: { message: string }) => {
      setError(message)
      setTimeout(() => setError(null), 5000)
    }

    PeerService.on("remoteStream", handleRemoteStream)
    PeerService.on("iceConnected", handleIceConnected)
    PeerService.on("error", handleError)

    return () => {
      PeerService.off("remoteStream", handleRemoteStream)
      PeerService.off("iceConnected", handleIceConnected)
      PeerService.off("error", handleError)
    }
  }, [])

  // Find match
  const handleFindMatch = useCallback(() => {
    if (!socket || !localStream) return
    setIsSearching(true)
    setConnectionState("searching")
    setError(null)
    socket.emit("find:match")
  }, [socket, localStream])

  // Next stranger (skip current and find new)
  const handleNext = useCallback(() => {
    if (!socket) return

    // Clean up current connection
    setIsConnected(false)
    setRemoteStream(null)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    PeerService.cleanup()

    // Emit call:next to server
    if (currentRoomRef.current) {
      socket.emit("call:next", { roomId: currentRoomRef.current })
    }

    // Reset state and search for new match
    currentRoomRef.current = null
    currentPartnerRef.current = null
    setConnectionState("searching")
    setIsSearching(true)
  }, [socket])

  // End call completely
  const handleEndCall = useCallback(() => {
    if (!socket) return

    if (currentRoomRef.current) {
      socket.emit("call:next", { roomId: currentRoomRef.current })
    }

    setIsSearching(false)
    setIsConnected(false)
    setRemoteStream(null)
    setConnectionState("ready")

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }

    PeerService.cleanup()
    currentRoomRef.current = null
    currentPartnerRef.current = null
  }, [socket])

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }, [localStream])

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }, [localStream])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold lowercase tracking-tight">threadr</h1>
            </div>
            <div className="flex items-center gap-4">
              {/* Status Indicator */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connectionState === "connected"
                      ? "bg-primary animate-pulse"
                      : connectionState === "searching"
                        ? "bg-primary/60 animate-pulse"
                        : connectionState === "connecting"
                          ? "bg-primary/80 animate-pulse"
                          : "bg-border"
                  }`}
                />
                <span className="text-sm text-muted-foreground capitalize">{connectionState}</span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-7xl">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-center animate-fadeIn">
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* Video Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Remote Video (Main) */}
            <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-card shadow-sm">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {isSearching ? (
                    <>
                      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
                      <p className="text-muted-foreground text-sm font-medium">Looking for a stranger…</p>
                    </>
                  ) : connectionState === "connecting" ? (
                    <>
                      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
                      <p className="text-muted-foreground text-sm font-medium">Connecting…</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-12 rounded-md border border-dashed border-border mb-3" />
                      <p className="text-muted-foreground text-sm font-medium">No stranger connected</p>
                    </>
                  )}
                </div>
              )}

              {/* Remote Controls Overlay */}
              {isConnected && (
                <div className="absolute top-3 left-3">
                  <div className="px-3 py-1.5 rounded-md border border-border bg-background/80 backdrop-blur">
                    <span className="text-xs font-medium">Stranger</span>
                  </div>
                </div>
              )}
            </div>

            {/* Local Video (Preview) */}
            <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-card shadow-sm">
              {localStream ? (
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">Initializing camera…</p>
                </div>
              )}

              {/* Local Controls Overlay */}
              <div className="absolute top-3 left-3">
                <div className="px-3 py-1.5 rounded-md border border-border bg-background/80 backdrop-blur">
                  <span className="text-xs font-medium">You</span>
                </div>
              </div>

              {/* Video/Audio Status */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                <div className="p-2 rounded-md border border-border bg-background/80 backdrop-blur transition-all">
                  {isVideoEnabled ? (
                    <Video className="w-4 h-4 text-primary" />
                  ) : (
                    <VideoOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="p-2 rounded-md border border-border bg-background/80 backdrop-blur transition-all">
                  {isAudioEnabled ? (
                    <Mic className="w-4 h-4 text-primary" />
                  ) : (
                    <MicOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            {!isConnected && !isSearching && (
              <Button
                onClick={handleFindMatch}
                disabled={!localStream}
                size="icon"
                variant="default"
                className="h-14 w-14 rounded-full"
                title="Find Stranger"
              >
                <Search className="w-5 h-5" />
              </Button>
            )}

            {isSearching && (
              <Button
                onClick={handleEndCall}
                size="icon"
                variant="destructive"
                className="h-14 w-14 rounded-full"
                title="Stop Search"
              >
                <X className="w-5 h-5" />
              </Button>
            )}

            {isConnected && (
              <div className="flex items-center justify-center gap-3">
                {/* Next Button */}
                <Button
                  onClick={handleNext}
                  size="icon"
                  variant="secondary"
                  className="h-12 w-12 rounded-full"
                  title="Next Stranger"
                >
                  <SkipForward className="w-5 h-5" />
                </Button>

                {/* Video Toggle */}
                <Button
                  onClick={toggleVideo}
                  size="icon"
                  variant={isVideoEnabled ? "secondary" : "destructive"}
                  className="h-12 w-12 rounded-full"
                  title={isVideoEnabled ? "Turn Camera Off" : "Turn Camera On"}
                >
                  {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>

                {/* Audio Toggle */}
                <Button
                  onClick={toggleAudio}
                  size="icon"
                  variant={isAudioEnabled ? "secondary" : "destructive"}
                  className="h-12 w-12 rounded-full"
                  title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>

                {/* End Call */}
                <Button
                  onClick={handleEndCall}
                  size="icon"
                  variant="destructive"
                  className="h-12 w-12 rounded-full"
                  title="Disconnect"
                >
                  <PhoneOff className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-center mt-6 border-t border-border bg-background/60 backdrop-blur">
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground">
            © 2025 <span className="font-medium">threadr</span> • Connect with strangers worldwide
          </p>
        </div>
      </footer>

      <style jsx>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  )
}
