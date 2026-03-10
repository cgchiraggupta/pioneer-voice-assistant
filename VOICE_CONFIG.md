# 🎙️ Voice Configuration Guide

Everything you need to change how the assistant **sounds**, **speaks**, and **behaves** is in one single file:

```
server/utils/modularAIProcessor.js
```

---

## 1. Change the Voice

Find these two lines near the top of the file:

```js
const TTS_SPEAKER = "pooja";   // ← change this
const TTS_PACE    = 1.0;       // ← change this
```

Replace `"pooja"` with any name from the list below, save the file, and the server will auto-restart (nodemon). That's it.

---

### 🔵 Male Voices

| Name | Style |
|------|-------|
| `shubh` | Default male, clear and neutral |
| `aditya` | Young, energetic |
| `rahul` | Warm and conversational |
| `rohan` | Casual and friendly |
| `amit` | Deep and authoritative |
| `dev` | Smooth and professional |
| `ratan` | Mature and calm |
| `varun` | Upbeat |
| `manan` | Soft spoken |
| `sumit` | Neutral, clean |
| `kabir` | Rich, expressive |
| `aayan` | Young and bright |
| `ashutosh` | Steady and clear |
| `advait` | Gentle and measured |
| `anand` | Warm and cheerful |
| `tarun` | Energetic and punchy |
| `sunny` | Light and casual |
| `mani` | Soft and natural |
| `gokul` | Clear and grounded |
| `vijay` | Bold and confident |
| `mohit` | Calm and articulate |
| `rehan` | Modern and crisp |
| `soham` | Natural and relaxed |
| `karun` | Steady |
| `hitesh` | Direct |
| `abhilash` | Expressive |

---

### 🔴 Female Voices

| Name | Style |
|------|-------|
| `pooja` | Current default, warm Indian English |
| `anushka` | Soft and friendly |
| `manisha` | Calm and clear |
| `vidya` | Mature and composed |
| `arya` | Crisp and modern |
| `ritu` | Warm and natural |
| `priya` | Cheerful and conversational |
| `neha` | Light and bright |
| `simran` | Smooth and expressive |
| `kavya` | Gentle and clear |
| `ishita` | Professional and clean |
| `shreya` | Sweet and articulate |
| `roopa` | Grounded and warm |
| `amelia` | Neutral international accent |
| `sophia` | Polished, slightly formal |
| `tanya` | Young and energetic |
| `shruti` | Soft spoken |
| `suhani` | Pleasant and easy |
| `kavitha` | Steady and warm |
| `rupali` | Natural and relaxed |

---

## 2. Change the Speed

```js
const TTS_PACE = 1.0;   // ← this controls speed
```

| Value | Effect |
|-------|--------|
| `0.5` | Very slow — good for clarity |
| `0.75` | Slow |
| `1.0` | Normal (default) |
| `1.25` | Slightly fast |
| `1.5` | Fast |
| `2.0` | Very fast |

Just change the number, save, done.

---

## 3. Change the Personality (System Prompt)

This controls how the AI **thinks and responds** — its tone, style, and rules.

Find this section inside `processWithAI()` in the same file:

```js
{
  role: "system",
  content:
    "You are a helpful voice assistant. Always reply in plain spoken English with no markdown, no bullet points, no special characters. Keep every response under 300 characters - short, direct and conversational.",
},
```

Replace the `content` string with anything you want. Examples:

---

### 🧑‍💼 Professional Assistant
```js
content: "You are a professional executive assistant. Speak formally, be concise and precise. No filler words. Keep responses under 300 characters."
```

---

### 😎 Casual Friend
```js
content: "You are a chill, funny friend. Keep it casual, use everyday language, throw in some humour. Short answers only, under 300 characters."
```

---

### 🧠 Expert Advisor
```js
content: "You are a knowledgeable advisor. Give smart, direct answers. No fluff, no markdown. Under 300 characters per response."
```

---

### 🇮🇳 Hinglish Mode
```js
content: "You are a fun assistant who speaks in Hinglish — a natural mix of Hindi and English. Keep it short, casual and under 300 characters."
```

---

> **Important:** Keep responses under 300 characters for best TTS results. Sarvam TTS supports up to 2500 characters but shorter = faster + more natural sounding speech.

---

## 4. Quick Reference — One Line Summary

| What | Where | What to change |
|------|-------|----------------|
| Voice | `modularAIProcessor.js` line ~13 | `TTS_SPEAKER = "name"` |
| Speed | `modularAIProcessor.js` line ~14 | `TTS_PACE = 1.0` |
| Personality | `modularAIProcessor.js` inside `processWithAI()` | `content: "..."` in system message |

---

> All changes take effect immediately on file save — nodemon restarts the server automatically. No client restart needed.