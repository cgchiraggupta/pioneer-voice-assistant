# Pioneer Voice Assistant

A real-time voice conversation AI assistant built using OpenAI's GPT-4o Realtime API with WebSocket connections.

## Features

- Real-time voice conversation with AI
- Audio visualization during playback
- WebSocket-based communication
- Modern Next.js frontend with Node.js backend

## Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend**: Node.js, WebSocket
- **AI**: OpenAI GPT-4o Realtime API
- **Audio**: Custom WAV processing, Web Audio API

## Getting Started

### Prerequisites
- Node.js 18+
- OpenAI API key

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   # Client
   cd client && npm install
   
   # Server  
   cd server && npm install
   ```

3. Set up environment variables:
   ```bash
   # In server directory
   echo "KEY=your_openai_api_key" > .env
   ```

4. Run the application:
   ```bash
   # Server (in server directory)
   npm run dev
   
   # Client (in client directory) 
   npm run dev
   ```

5. Open http://localhost:3000 in your browser

## Architecture

- **Client/**: Next.js React application
- **Server/**: Node.js WebSocket server
- **Real-time Communication**: WebSocket proxy to OpenAI's API

## Project History

This project was initially developed in November 2024, ahead of the mainstream voice AI trend, demonstrating early innovation in real-time voice interfaces.

## License

MIT License
