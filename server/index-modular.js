const WebSocket = require("ws");
const http = require("http");
const helper = require("./utils/audiofunctions.js");
const ModularAIProcessor = require("./utils/modularAIProcessor.js");
const server = http.createServer();
require("dotenv").config();

// Original OpenAI Configuration (COMMENTED OUT)
// const gptKey = process.env.KEY;
const wss = new WebSocket.Server({ noServer: true });

// Initialize Modular AI Processor
const modularProcessor = new ModularAIProcessor();

wss.on("connection", async (ws) => {
  console.log("Client connected to /Assistant (Modular Architecture)");

  // Original OpenAI Code (COMMENTED OUT)
  /*
  // Message queue for messages received before gptClient is ready
  const messageQueue = [];
  let gptClientReady = false;

  // Generate a gpt ws client for our user
  const url =
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
  const gptClient = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${gptKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  // When gpt client gets connected to openai's WebSocket server
  gptClient.on("open", function open() {
    console.log("Connected to gpt WebSocket server.");
    gptClientReady = true;

    // Send queued messages
    while (messageQueue.length > 0) {
      const queuedMessage = messageQueue.shift();
      gptClient.send(queuedMessage);
    }

    ws.send("your gpt client is ready for u to use");
  });

  // When our gpt client gets a message from the openai server
  gptClient.on("message", (data) => {
    const parsedData = JSON.parse(data);
    console.log(parsedData.type);

    if (parsedData.type === "response.audio.delta") {
      const pcmData = helper.base64ToArrayBuffer(parsedData.delta);
      const sampleRate = 24000;
      const header = helper.createWavHeader(sampleRate, pcmData.byteLength);
      const finalAudioBuffer = helper.concatenateWavHeaderAndData(
        header,
        pcmData,
      );
      ws.send(finalAudioBuffer);
    } else {
      ws.send(JSON.stringify(parsedData));
    }
  });

  // Handle errors from gptClient
  gptClient.on("error", (error) => {
    console.error("GPT WebSocket error:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        error: {
          message: "Connection to OpenAI failed",
          details: error.message,
        },
      }),
    );
  });

  // Handle gptClient closure
  gptClient.on("close", () => {
    console.log("GPT WebSocket closed");
    ws.close();
  });
  */

  // NEW MODULAR ARCHITECTURE
  let isProcessorReady = false;
  const audioQueue = [];

  // Initialize modular processor
  try {
    const initialized = await modularProcessor.initialize();
    if (initialized) {
      isProcessorReady = true;
      ws.send("modular AI processor is ready for use");
      console.log("✅ Modular AI Processor initialized successfully");
    } else {
      throw new Error("Failed to initialize modular processor");
    }
  } catch (error) {
    console.error("❌ Failed to initialize modular processor:", error);
    ws.send(JSON.stringify({
      type: "error",
      error: {
        message: "Failed to initialize modular AI processor",
        details: error.message,
      },
    }));
  }

  // Process queued audio messages
  const processQueue = async () => {
    while (audioQueue.length > 0 && isProcessorReady) {
      const audioData = audioQueue.shift();
      try {
        await processAudioData(audioData, ws);
      } catch (error) {
        console.error("Error processing queued audio:", error);
      }
    }
  };

  // Handle messages from the client
  ws.on("message", async (message) => {
    try {
      if (typeof message === 'string') {
        const event = JSON.parse(message);
        console.log("📨 Received JSON message:", event.type);

        // Handle different message types
        switch (event.type) {
          case 'audio.config':
            // Audio configuration from client
            console.log("🎵 Audio config received:", event);
            break;
          
          case 'test.connection':
            // Test connection
            ws.send(JSON.stringify({
              type: "test.response",
              status: isProcessorReady ? "ready" : "not_ready",
              architecture: "modular"
            }));
            break;
            
          default:
            console.log("🔍 Unknown message type:", event.type);
        }
      } else {
        // Handle binary audio data
        console.log("🎤 Received audio data, size:", message.byteLength, "bytes");
        
        if (isProcessorReady) {
          await processAudioData(message, ws);
        } else {
          console.log("⏳ Queueing audio until processor is ready");
          audioQueue.push(message);
        }
      }
    } catch (e) {
      console.error("❌ Error processing message from client:", e);
      const errorEvent = {
        type: "error",
        error: {
          message: "Failed to process message",
          details: e.message,
        },
      };
      ws.send(JSON.stringify(errorEvent));
    }
  });

  // Process audio data with modular pipeline
  const processAudioData = async (audioBuffer, clientWs) => {
    try {
      console.log("🔄 Starting modular audio processing...");
      
      // Step 1-3: Process through Whisper → Kimi → Sarvam
      const result = await modularProcessor.processAudio(audioBuffer);
      
      console.log("✅ Modular processing completed");
      console.log("📝 Transcript:", result.transcript);
      console.log("🧠 AI Response:", result.aiResponse);
      
      // Convert Sarvam audio to WAV format for client
      const sampleRate = 24000;
      const header = helper.createWavHeader(sampleRate, result.audioResponse.byteLength);
      const finalAudioBuffer = helper.concatenateWavHeaderAndData(
        header,
        result.audioResponse,
      );
      
      // Send transcript to client
      clientWs.send(JSON.stringify({
        type: "response.transcript",
        transcript: result.transcript,
        aiResponse: result.aiResponse
      }));
      
      // Send audio response
      clientWs.send(finalAudioBuffer);
      
      console.log("🔊 Audio response sent to client");
      
    } catch (error) {
      console.error("❌ Modular audio processing failed:", error);
      clientWs.send(JSON.stringify({
        type: "error",
        error: {
          message: "Audio processing failed",
          details: error.message,
        },
      }));
    }
  };

  // Original OpenAI Client Disconnection (COMMENTED OUT)
  /*
  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
    if (gptClient.readyState === WebSocket.OPEN) {
      gptClient.close();
    }
  });
  */

  // NEW MODULAR CLIENT DISCONNECTION
  ws.on("close", () => {
    console.log("Client disconnected from modular architecture");
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Handle upgrades to WebSocket connections
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/Assistant") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Start the server on port 4000
server.listen(4000, () => {
  console.log("🚀 Modular WebSocket server is listening on ws://localhost:4000/Assistant");
  console.log("📋 Architecture: Whisper → Kimi K2.5 → Sarvam TTS");
});
