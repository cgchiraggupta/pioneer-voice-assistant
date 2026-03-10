const WebSocket = require("ws");
const http = require("http");
const helper = require("./utils/audiofunctions.js");
const ModularAIProcessor = require("./utils/modularAIProcessor.js");

require("dotenv").config();

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

// Single shared processor instance (one per server process)
const modularProcessor = new ModularAIProcessor();

wss.on("connection", async (ws) => {
  console.log("Client connected to /Assistant");

  let isProcessorReady = false;
  const audioQueue = [];

  // Initialize the modular pipeline
  try {
    const initialised = await modularProcessor.initialize();
    if (initialised) {
      isProcessorReady = true;
      ws.send("modular AI processor is ready for use");
      console.log("Modular AI Processor initialised successfully");

      // Drain any messages that arrived before init finished
      while (audioQueue.length > 0) {
        const queued = audioQueue.shift();
        await processAudioData(queued, ws).catch((e) =>
          console.error("Error processing queued audio:", e.message),
        );
      }
    } else {
      throw new Error("initialize() returned false");
    }
  } catch (error) {
    console.error("Failed to initialise modular processor:", error.message);
    ws.send(
      JSON.stringify({
        type: "error",
        error: {
          message: "Failed to initialise modular AI processor",
          details: error.message,
        },
      }),
    );
  }

  // Inbound message handler
  ws.on("message", async (message) => {
    try {
      // Binary frames - raw audio from the browser
      if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message);
        console.log("Received binary audio, size:", buf.byteLength, "bytes");

        if (isProcessorReady) {
          await processAudioData(buf, ws);
        } else {
          console.log("Processor not ready, queueing audio");
          audioQueue.push(buf);
        }
        return;
      }

      // Text frames - JSON events
      const raw = message.toString();
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        console.warn("Received non-JSON text frame, ignoring");
        return;
      }

      console.log("Received JSON event:", event.type);

      switch (event.type) {
        // OpenAI-compatible client events
        case "conversation.item.create": {
          // Client sends base64 PCM audio inside this envelope
          const content = event.item?.content?.[0];
          const base64Audio = content?.audio;

          if (!base64Audio) {
            console.warn("conversation.item.create has no audio content");
            break;
          }

          const audioBuf = Buffer.from(base64Audio, "base64");
          console.log(
            "Decoded audio from conversation.item.create -",
            audioBuf.byteLength,
            "bytes",
          );

          if (isProcessorReady) {
            await processAudioData(audioBuf, ws);
          } else {
            console.log("Processor not ready, queueing audio");
            audioQueue.push(audioBuf);
          }
          break;
        }

        case "response.create":
          // Processing is already triggered by conversation.item.create
          console.log(
            "response.create received, processing already in progress",
          );
          break;

        case "audio.config":
          console.log("Audio config received:", JSON.stringify(event));
          break;

        case "test.connection":
          ws.send(
            JSON.stringify({
              type: "test.response",
              status: isProcessorReady ? "ready" : "not_ready",
              architecture: "modular",
            }),
          );
          break;

        default:
          console.log("Unknown event type:", event.type);
      }
    } catch (err) {
      console.error("Error handling inbound message:", err.message);
      ws.send(
        JSON.stringify({
          type: "error",
          error: {
            message: "Failed to process message",
            details: err.message,
          },
        }),
      );
    }
  });

  // Process audio through the full pipeline: Sarvam STT -> Groq -> Sarvam TTS
  const processAudioData = async (audioBuffer, clientWs) => {
    try {
      console.log("Running modular pipeline...");

      const result = await modularProcessor.processAudio(audioBuffer);

      console.log("Pipeline complete");
      console.log("Transcript:", result.transcript);
      console.log("AI response:", result.aiResponse);

      // result.audioResponse is already a complete WAV file returned by Sarvam.
      // Send binary first so the client queues it, then send the JSON done signal
      // so the client knows to play the queued audio.
      clientWs.send(result.audioResponse);

      clientWs.send(
        JSON.stringify({
          type: "response.transcript",
          transcript: result.transcript,
          aiResponse: result.aiResponse,
        }),
      );

      console.log("Audio and transcript sent to client");
    } catch (error) {
      console.error("Modular pipeline failed:", error.message);
      clientWs.send(
        JSON.stringify({
          type: "error",
          error: {
            message: "Audio processing failed",
            details: error.message,
          },
        }),
      );
    }
  };

  // Disconnection and error handlers
  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

// HTTP to WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/Assistant") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Start server
server.listen(4000, () => {
  console.log(
    "Modular WebSocket server listening on ws://localhost:4000/Assistant",
  );
  console.log("Pipeline: Sarvam STT -> Groq -> Sarvam TTS");
});
