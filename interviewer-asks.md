# Interviewer Asks — Pioneer Voice Assistant

> This is a learning project. You built it to understand how real-time audio pipelines,
> WebSockets, STT/TTS APIs, and LLM orchestration work together end-to-end.
> Be honest about that. Interviewers respect self-awareness far more than overselling.

---

## How to Frame This Project in One Sentence

> "I built a real-time voice assistant from scratch to understand how audio streaming,
> WebSockets, and AI API orchestration work together — and ended up building two different
> architectures to compare latency, cost, and control tradeoffs."

That framing is honest, shows initiative, and immediately gives the interviewer something
interesting to dig into.

---

## Questions You Should Expect

---

### 1. "Walk me through how this works."

**What they want:** Can you explain a system end-to-end clearly? Do you actually understand
what you built, or did you just copy-paste code?

**Strong answer:**

"The browser captures microphone audio using the MediaRecorder API and records it as
WebM/Opus — that's the native browser format, no conversion needed. When the user stops
speaking, the audio blob is sent as raw binary over a WebSocket connection to a Node.js
server.

On the server, I detect the audio format from the first few magic bytes of the file header —
WebM starts with 0x1a45dfa3, WAV starts with RIFF, OGG starts with OggS. Then I send it to
Sarvam's speech-to-text API which returns a plain text transcript.

That transcript goes to Groq's API running Llama 3.3 70B — it's extremely fast, around 200-
300ms for a response. The system prompt constrains the model to reply in under 300 characters,
no markdown, plain spoken English.

The response text goes to Sarvam's TTS API which returns base64-encoded WAV audio. I decode
that, send the binary buffer to the browser first, then send a JSON message with the
transcript. The browser queues the binary, waits up to 5 seconds for it, then plays it
through a fresh Audio element.

I actually built two versions of this — the Sarvam/Groq pipeline, and a second one using
OpenAI's GPT-4o Realtime API which is a true WebSocket passthrough that streams audio chunks
in real time."

---

### 2. "Why WebSockets? Why not HTTP?"

**What they want:** Do you understand protocol tradeoffs, or did you just follow a tutorial?

**Strong answer:**

"HTTP is request-response — the client asks, server answers, connection closes. For a voice
conversation that's a terrible fit because you need the server to push audio chunks back to
the browser as they arrive, especially in the streaming OpenAI pipeline where you're getting
dozens of audio delta events.

WebSockets give you a persistent, full-duplex connection. The browser can send binary audio
data one way, and the server can push JSON events and binary WAV chunks the other way,
simultaneously, over the same connection. No polling, no repeated handshakes, no latency
overhead per message.

There's also a practical reason — browsers can't make direct API calls to Sarvam or OpenAI's
Realtime API from the frontend due to CORS and the fact that you can't expose API keys in
client-side code. The Node server acts as a secure proxy."

---

### 3. "What is the latency like and where does it come from?"

**What they want:** Do you think about performance? Can you reason about a system's bottlenecks?

**Strong answer:**

"In the modular pipeline — Sarvam STT to Groq to Sarvam TTS — the total round trip is
roughly 3 to 5 seconds. The breakdown is approximately:

- Sarvam STT: 1–2 seconds depending on audio length
- Groq Llama 3.3 70B: 200–400ms — this is genuinely fast
- Sarvam TTS: 1–2 seconds
- Network overhead: 200–500ms

The STT and TTS are the bottlenecks, not the LLM. Groq's inference is so fast it barely
shows up in the profile.

The OpenAI Realtime pipeline is fundamentally different — it streams audio chunks back as
they're generated, so perceived latency is under a second. You hear the AI start speaking
before it's finished generating. But it costs significantly more and you lose control over the
individual steps.

So there's a real tradeoff: Sarvam/Groq is cheaper, more modular, supports Indian languages,
but has higher latency. OpenAI Realtime feels instant but is a black box and expensive."

---

### 4. "How did you handle audio format issues?"

**What they want:** Real debugging experience. Did you actually hit problems, or is this theoretical?

**Strong answer:**

"This was one of the messier parts. Browsers don't give you raw PCM audio from MediaRecorder
— they give you WebM/Opus containers, which is a compressed format. Different browsers
behave differently too; Safari might give you something different from Chrome.

The first problem was that Sarvam's STT API expects a proper audio file with the right
content type. So I had to detect the format from the file's magic bytes rather than trusting
the MIME type the browser reports, because those can be inconsistent.

The second problem was with the OpenAI pipeline. OpenAI's Realtime API expects raw 16-bit
PCM audio at 24kHz, mono — it doesn't accept WebM. So for that pipeline, the browser has to
convert the audio to PCM16 before sending it, which I do using the Web Audio API's
AudioContext and a ScriptProcessorNode to capture raw samples.

For the WAV output from OpenAI, each audio delta event is just raw PCM bytes — no header.
So I have to manually construct a WAV header with the right sample rate, bit depth, and
channel count and prepend it before the browser can play it. I wrote a helper function that
builds the 44-byte WAV header from scratch."

---

### 5. "What's the difference between your two pipelines architecturally?"

**What they want:** Can you compare architectural patterns, not just list features?

**Strong answer:**

"They represent two different architectural patterns.

The modular pipeline is a sequential processing chain — audio in, transcript out, response
out, speech out. Each step is a discrete API call. This gives you full observability and
control: you can log every step, swap any component, catch failures at each stage, and
optimise or replace individual pieces independently. The tradeoff is that latency adds up
across three sequential network calls.

The OpenAI Realtime pipeline is a streaming proxy pattern — the Node server is essentially
transparent, just forwarding events between the browser and OpenAI's WebSocket. OpenAI owns
the entire pipeline internally and streams results back in real time. You get much lower
perceived latency because audio starts arriving before generation is complete. But you give up
control — you can't swap the STT, you can't use a different LLM, you can't add custom
processing between steps, and you can't use it for Indian languages.

I designed the server so both handlers live in one file and you switch between them with a
single environment variable — MODE=openai or MODE=modular. That way neither implementation
was thrown away."

---

### 6. "Why Groq instead of OpenAI or Anthropic for the LLM?"

**What they want:** Do you make deliberate technical decisions or just use whatever's popular?

**Strong answer:**

"Speed was the primary reason. Groq runs on their own LPU hardware which is specifically
optimised for inference, not training. For a voice conversation, the LLM needs to be nearly
instantaneous — if users are already waiting for STT and TTS, adding a slow LLM makes the
total latency unacceptable.

Groq's Llama 3.3 70B returns a response in 200 to 400 milliseconds in practice. The same
model on OpenAI's API would take 2 to 5 seconds. For this use case that's a meaningful
difference.

There's also cost — Groq's free tier is generous for development and their production pricing
is significantly cheaper than GPT-4o.

The tradeoff is that Llama 3.3 is slightly less capable than GPT-4o for complex reasoning,
but for a voice assistant where responses are under 300 characters, that capability gap
basically disappears."

---

### 7. "This is just API calls — what did you actually build?"

**What they want:** This is the hardest question. They want to see if you can defend the
engineering value honestly without overselling.

**Strong answer:**

"That's fair, and I'll be honest — the core AI functionality is all delegated to external
APIs. What I actually built is the integration layer, and I'd argue that's where most real-
world engineering happens.

Specifically: I built a binary-safe WebSocket protocol that handles both raw audio buffers
and JSON control events on the same connection. I built audio format detection from magic
bytes. I built a WAV header constructor from scratch. I built a message queue system so audio
that arrives before the processor is initialised doesn't get dropped. I built a timing
mechanism on the client side that waits for the binary audio frame to arrive before draining
the playback queue, because the binary and JSON messages don't arrive in a guaranteed order.

And importantly, I built the same system twice using two fundamentally different
architectures — a modular sequential pipeline and a streaming proxy — and then unified both
into a single server with a runtime mode switch.

More honestly though, I built this to learn. I now understand WebSocket binary framing, audio
container formats, API orchestration, streaming vs batch tradeoffs, and browser autoplay
policy — things you don't learn by reading documentation."

---

### 8. "What would you do differently if you rebuilt this?"

**What they want:** Self-awareness, engineering maturity, ability to critique your own work.

**Strong answer:**

"A few things.

First, I'd add proper error boundaries at every pipeline stage with typed error responses
instead of generic catch blocks. Right now if Sarvam STT fails, the client just gets a
generic error JSON.

Second, I'd implement a connection state machine on the client — right now the UI has a few
boolean flags like isRecording and isProcessing, but a proper state machine would make
impossible states impossible.

Third, I'd add voice activity detection on the client so recording stops automatically when
the user stops speaking, rather than requiring a button press. This is what makes voice
assistants feel natural.

Fourth, I'd move the API keys out of the hardcoded string in modularAIProcessor.js and
validate all environment variables at startup rather than failing mid-request.

Fifth, and most importantly — I'd build it with a specific use case in mind from day one
rather than building a general voice chat demo. The technology is more interesting when it's
solving a concrete problem, like hands-free guidance for field workers or a multilingual
receptionist for small businesses."

---

### 9. "How does browser autoplay policy affect this and how did you handle it?"

**What they want:** Depth of understanding. Most people who use the Web Audio API don't know
this exists.

**Strong answer:**

"Chrome and most modern browsers block audio from playing unless it was triggered by a direct
user gesture — a click, a tap, a keypress. This is the autoplay policy, introduced to stop
websites from blasting audio at users on page load.

The problem this creates: by the time the server responds with audio, the original user
gesture — clicking the record button — is long gone. The browser has no way to know that the
audio coming back is a response to that gesture. So calling audio.play() inside a WebSocket
message handler gets blocked.

The fix is to use a technique called unlocking the AudioContext during the gesture. When the
user clicks Record, I immediately play a tiny silent WAV file — a 44-byte WAV with no audio
data. That play() call happens inside the gesture handler, so Chrome allows it. Once any
audio has been played inside a gesture, the browser unlocks audio playback for the rest of
the page session. All subsequent audio.play() calls — including the server's response — work
without a gesture.

I track this with a ref called audioUnlockedRef so the unlock only fires once per session."

---

### 10. "Is this production-ready?"

**What they want:** Honesty, and understanding of what production actually requires.

**Strong answer:**

"No, and I wouldn't claim it is. It's a working proof of concept.

What's missing for production: authentication and per-user session isolation — right now any
connection gets the same processor. Rate limiting — nothing stops someone from hammering the
STT API. The Sarvam API key is hardcoded in the source, which is a security problem. There's
no retry logic if an API call fails transiently. There's no horizontal scaling — the server
is stateful per WebSocket connection. There's no monitoring or alerting. The client has no
reconnection logic if the WebSocket drops.

On the product side — there's no clear use case, no user research, no reason someone would
use this over just talking to Siri or Google Assistant.

I built it as a learning project and I'm clear about that. The value for me was understanding
how these systems work at the protocol level, not shipping something people pay for."

---

## Questions You Should Ask the Interviewer

Asking good questions shows you think like an engineer, not a student.

- "How does your team handle audio streaming at scale — do you use WebSockets or something
  like WebRTC?"
- "What's your approach to managing latency budgets in real-time AI pipelines?"
- "How do you handle the gap between what the AI model does in dev versus what it does with
  real user inputs in production?"
- "When you're evaluating STT or TTS vendors, what metrics matter most to your team?"

---

## The One Thing to Remember

> Interviewers are not impressed by the fact that you called three APIs.
> They are impressed by whether you understand *why* each decision was made,
> *what tradeoffs* it introduced, and *what you would do better* next time.
>
> Know your project deeply. Know its weaknesses better than its strengths.
> That is what senior engineers do.

---

*Project: Pioneer Voice Assistant*
*Repository: cgchiraggupta/pioneer-voice-assistant*
*Category: Learning Project — Systems & AI API Integration*