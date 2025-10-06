# 🚀 Threadr - Random Video Chat

A modern, real-time video chat application built with Next.js, Fastify, Socket.IO, and WebRTC.

## 🎯 Features

- Random video chat with strangers
- WebRTC peer-to-peer connections
- Socket.IO real-time signaling
- TURN/STUN server support
- Minimalistic, modern UI
- Auto-matching system

## 📦 Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Fastify, Socket.IO, Bun
- **WebRTC**: Native browser APIs
- **Deployment**: Docker, Railway

## 🔧 Local Development

```bash
# Install dependencies
bun install

# Start development servers
bun run dev

# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

## 📝 Environment Variables

### Backend
- `PORT` - Backend server port (default: 3001)
- `CLOUDFLARE_TURN_TOKEN_ID` - Cloudflare TURN token ID
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token

### Frontend
- `NEXT_PUBLIC_SOCKET_URL` - Backend Socket.IO URL

## 🎮 Usage

1. **Allow camera and microphone permissions**
2. **Wait for automatic matching** or click "Find Stranger"
3. **Chat with random strangers**
4. **Click "Next"** to skip to another stranger
5. **Toggle camera/mic** as needed
6. **Click disconnect** to end the session

## 🐳 Docker Commands

```bash
# Build the image
docker build -t threadr .

# Run the container
docker run -p 3000:3000 -p 3001:3001 \
  -e CLOUDFLARE_TURN_TOKEN_ID=your_token \
  -e CLOUDFLARE_API_TOKEN=your_api_token \
  -e NEXT_PUBLIC_SOCKET_URL=http://localhost:3001 \
  threadr

# Stop the container
docker stop threadr

# View logs
docker logs -f threadr
```

## 🔒 Security Notes

- Always use HTTPS in production
- Keep TURN credentials secure
- Set proper CORS origins
- Use environment variables for secrets

## 📄 License

MIT License - feel free to use this project for your own purposes!

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 💬 Support

For issues or questions, please open a GitHub issue.

---