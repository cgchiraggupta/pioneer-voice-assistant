import { useState, useRef } from "react";
import { LiveAudioVisualizer } from "react-audio-visualize";

export default function Home() {
  const canvasRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [words, setWords] = useState("");
  const [MEDIAREC, setMEDIAREC] = useState(null);

  // Refs — never stale inside closures
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioQueueRef = useRef([]);

  // Tracks whether Chrome has been unlocked for audio autoplay
  const audioUnlockedRef = useRef(false);

  // Call this inside any user-gesture handler to unlock autoplay for this page
  const warmUpAudio = () => {
    if (audioUnlockedRef.current) return;
    // Play a tiny silent WAV during the user gesture — after this Chrome
    // allows audio.play() from anywhere on the page (not just gesture callbacks)
    const el = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
    );
    el.play()
      .then(() => {
        audioUnlockedRef.current = true;
        console.log("[AUDIO] autoplay unlocked");
      })
      .catch(() => {});
  };

  // ─── Playback ───────────────────────────────────────────────────────────────

  const playBuffer = (arrayBuffer) => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([arrayBuffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      // Fresh Audio element every time — no stale state from previous playback
      const el = new Audio(url);

      el.onended = () => {
        URL.revokeObjectURL(url);
        console.log("[AUDIO] playback ended");
        resolve();
      };

      el.onerror = (e) => {
        URL.revokeObjectURL(url);
        console.error("[AUDIO] playback error:", e);
        reject(e);
      };

      console.log("[AUDIO] playing WAV —", arrayBuffer.byteLength, "bytes");

      el.play().catch((err) => {
        URL.revokeObjectURL(url);
        console.error("[AUDIO] play() blocked:", err.message);
        reject(err);
      });
    });
  };

  const drainQueue = async () => {
    console.log("[AUDIO] drainQueue — items:", audioQueueRef.current.length);
    while (audioQueueRef.current.length > 0) {
      const buf = audioQueueRef.current.shift();
      try {
        await playBuffer(buf);
      } catch (e) {
        console.error("[AUDIO] drainQueue error:", e);
      }
    }
  };

  // ─── WebSocket ──────────────────────────────────────────────────────────────

  const connectToAssistant = () => {
    const ws = new WebSocket("ws://localhost:4000/Assistant");
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] connected");
      setIsConnected(true);
    };

    ws.onmessage = async (event) => {
      // Binary frame — WAV audio from Sarvam TTS
      if (event.data instanceof Blob) {
        const ab = await event.data.arrayBuffer();
        console.log("[WS] binary frame received —", ab.byteLength, "bytes");
        audioQueueRef.current.push(ab);
        return;
      }

      // Text frame — JSON control message
      if (typeof event.data !== "string") return;

      let json;
      try {
        json = JSON.parse(event.data);
      } catch {
        console.log("[WS] plain text:", event.data.slice(0, 80));
        return;
      }

      console.log("[WS] json type:", json.type);

      if (json.type === "response.transcript") {
        setIsProcessing(false);
        setWords(json.aiResponse || json.transcript || "");
        console.log(
          "[WS] queue size before drain:",
          audioQueueRef.current.length,
        );
        // Binary WAV sometimes arrives slightly after the JSON transcript
        // Wait up to 5 seconds for it to land before draining
        const waitForAudio = () =>
          new Promise((resolve) => {
            if (audioQueueRef.current.length > 0) {
              resolve();
              return;
            }
            let waited = 0;
            const interval = setInterval(() => {
              waited += 50;
              if (audioQueueRef.current.length > 0 || waited >= 5000) {
                clearInterval(interval);
                console.log("[AUDIO] waited", waited, "ms for binary frame");
                resolve();
              }
            }, 50);
          });
        await waitForAudio();
        await drainQueue();
      } else if (json.type === "error") {
        console.error("[WS] server error:", json.error);
        setIsProcessing(false);
      }
    };

    ws.onclose = () => {
      console.log("[WS] closed");
      setIsConnected(false);
      socketRef.current = null;
    };

    ws.onerror = (e) => {
      console.error("[WS] error:", e);
    };
  };

  const closeConnection = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
  };

  // ─── Recording ──────────────────────────────────────────────────────────────

  const startRecording = async () => {
    // Warm up the Audio element RIGHT HERE inside the user gesture
    // This is the key — Chrome will allow future .play() calls on this element
    warmUpAudio();

    audioChunksRef.current = [];
    audioQueueRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error("[MIC] access denied:", e);
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    setMEDIAREC(recorder);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      console.log("[REC] stopped — chunks:", audioChunksRef.current.length);

      stream.getTracks().forEach((t) => t.stop());
      setMEDIAREC(null);

      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("[REC] WebSocket not open");
        setIsProcessing(false);
        return;
      }

      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      console.log("[REC] blob:", blob.size, "bytes | type:", blob.type);

      if (blob.size === 0) {
        console.error("[REC] empty blob");
        setIsProcessing(false);
        return;
      }

      audioQueueRef.current = [];

      const ab = await blob.arrayBuffer();
      ws.send(ab);
      console.log("[REC] sent to server");
    };

    recorder.start();
    setIsRecording(true);
    console.log("[REC] started — mimeType:", mimeType);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsProcessing(true);
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  // ─── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 relative">
      {!isConnected ? (
        <div className="flex flex-col items-center space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome to the Assistant
          </h1>
          <button
            className="px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-full shadow-lg hover:bg-blue-700 transition-all"
            onClick={connectToAssistant}
          >
            Connect to Assistant
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-8">
          {/* Record / Stop button */}
          <button
            className={`px-8 py-4 text-lg font-semibold text-white rounded-full shadow-lg transition-all ${
              isRecording
                ? "bg-red-500 hover:bg-red-600"
                : isProcessing
                  ? "bg-yellow-500 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
            }`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
          >
            {isRecording
              ? "Stop Recording"
              : isProcessing
                ? "Processing..."
                : "Start Recording"}
          </button>

          {/* AI response text */}
          {words ? (
            <div className="max-w-md px-6 py-4 bg-white rounded-xl shadow-md text-gray-800 text-center text-lg">
              {words}
            </div>
          ) : null}

          {/* Visualisations */}
          <div className="flex flex-col items-center space-y-4">
            {MEDIAREC && (
              <div className="p-4 bg-white rounded-lg shadow-md">
                <LiveAudioVisualizer
                  mediaRecorder={MEDIAREC}
                  width={300}
                  height={100}
                />
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={500}
              height={100}
              className="border border-gray-300 rounded-md shadow-sm"
            />
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="absolute top-6 right-6 flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-blue-600 animate-ping" />
              <span className="text-sm font-medium text-gray-700">
                Assistant is thinking...
              </span>
            </div>
          )}

          {/* Close button */}
          <button
            className="absolute left-6 bottom-6 px-6 py-3 text-sm font-medium text-white bg-red-500 rounded-lg shadow-md hover:bg-red-600 transition-all"
            onClick={closeConnection}
          >
            Close Connection
          </button>
        </div>
      )}
    </div>
  );
}
