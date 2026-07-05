---
id: voice
title: Voice Interaction
sidebar_position: 19
---

# Voice Interaction

Innovator supports voice-driven innovation sessions. You can speak commands like _"investigate solar energy"_ or _"next angle"_ and hear results narrated back via text-to-speech. This guide covers setup, configuration, and usage.

:::caution Production availability
Browser UI and voice-specific surfaces are development/experimental and return `404` in the first production profile.
:::

## Prerequisites

### Browser-based (Web Speech API)

- **Chrome, Edge, or Safari** — the Web Speech API is not supported in Firefox
- **Microphone access** — the browser will prompt for permission on first use
- **HTTPS or localhost** — microphone access requires a secure context

### Server-based (Whisper)

- **OpenAI API key** — required for the Whisper speech-to-text API
- **Microphone** — for capturing audio input
- Configure in `.env.local`:

```bash
OPENAI_API_KEY=sk-proj-...your-key...
```

## Configuration

Voice sessions are configured via the `VoiceConfig` schema:

```typescript
import type { VoiceConfig } from "@innovator/core/types";

const config: VoiceConfig = {
  engine: "web-speech-api", // "web-speech-api" | "whisper" | "none"
  locale: "en-US", // BCP 47 language tag
  narrationEnabled: true, // Enable text-to-speech output
  voice: "Google US English", // TTS voice identifier (platform-dependent)
  speechRate: 1.0, // 0.25 (slow) to 4.0 (fast)
  pitch: 1.0, // 0.1 (low) to 2.0 (high)
  continuousListening: false, // Keep listening after each command
  wakeWord: "hey innovator", // Optional activation phrase
};
```

### Engine options

| Engine           | When to use                                 |
| ---------------- | ------------------------------------------- |
| `web-speech-api` | Browser-based sessions (Chrome/Edge/Safari) |
| `whisper`        | CLI or server-side with OpenAI Whisper API  |
| `none`           | Disable voice (default)                     |

## Voice Commands

Speak any of these commands during a voice session:

| Command                    | Action                            | Example phrases                                              |
| -------------------------- | --------------------------------- | ------------------------------------------------------------ |
| **investigate** `<topic>`  | Start investigating a subject     | _"Investigate solar energy"_, _"Research quantum computing"_ |
| **next angle**             | Move to the next innovation angle | _"Next angle"_, _"Next one"_, _"Continue"_                   |
| **previous angle**         | Go back to the previous angle     | _"Previous angle"_, _"Go back"_, _"Back"_                    |
| **score this**             | Score and rank current ideas      | _"Score this"_, _"Rate these"_, _"Evaluate"_                 |
| **refine** `[instruction]` | Refine current ideas              | _"Refine for healthcare"_, _"Improve"_                       |
| **export**                 | Export results to file            | _"Export"_, _"Save"_, _"Download"_                           |
| **summarize**              | Get a summary of current results  | _"Summarize"_, _"Give me a summary"_                         |
| **stop**                   | Stop the current operation        | _"Stop"_, _"Cancel"_, _"Quit"_                               |
| **help**                   | Show available commands           | _"Help"_, _"What can I say?"_, _"Commands"_                  |

### Command recognition

Voice input is matched against predefined regex patterns. The parser supports multiple phrasings per command (e.g., _"next angle"_, _"next one"_, and _"continue"_ all map to the `next-angle` command). Unrecognized speech is ignored.

## Programmatic Usage

### Parsing voice commands

```typescript
import { parseVoiceCommand } from "@innovator/core";
import type { VoiceTranscript } from "@innovator/core/types";

const transcript: VoiceTranscript = {
  text: "investigate renewable energy",
  confidence: 0.92,
  isFinal: true,
  timestamp: new Date().toISOString(),
};

const command = parseVoiceCommand(transcript);
if (command) {
  console.log(command.command); // "investigate"
  console.log(command.argument); // "renewable energy"
  console.log(command.confidence); // 0.92
}
```

### Building narration segments

Convert results to speech-friendly segments for TTS:

```typescript
import { buildNarrationSegments } from "@innovator/core";

const segments = buildNarrationSegments({
  subject: "renewable energy",
  summary: "A rapidly growing sector with significant innovation potential.",
  topIdeas: [
    { title: "Perovskite solar cells", description: "Low-cost flexible solar panels." },
    { title: "Green hydrogen hubs", description: "Decentralized hydrogen production." },
  ],
  themes: ["sustainability", "cost reduction"],
  recommendation: "Focus on perovskite manufacturing scale-up.",
});

// Each segment has: text, type, pauseAfterMs
for (const segment of segments) {
  console.log(`[${segment.type}] ${segment.text}`);
}
```

### Registering speech providers

Innovator uses a pluggable provider model for speech-to-text (STT) and text-to-speech (TTS):

```typescript
import {
  registerSTTProvider,
  registerTTSProvider,
  listSTTProviders,
  listTTSProviders,
} from "@innovator/core";
import type { SpeechRecognitionProvider, TextToSpeechProvider } from "@innovator/core/types";

// Register a custom STT provider
const mySTT: SpeechRecognitionProvider = {
  id: "my-stt",
  name: "My Speech Recognition",
  start(config) {
    /* start listening */
  },
  stop() {
    /* stop listening */
  },
  isListening() {
    return false;
  },
  onTranscript(callback) {
    /* register callback */
  },
  onError(callback) {
    /* register error handler */
  },
};

registerSTTProvider(mySTT);

// Register a custom TTS provider
const myTTS: TextToSpeechProvider = {
  id: "my-tts",
  name: "My Text to Speech",
  async speak(text, config) {
    /* synthesize and play audio */
  },
  stop() {
    /* stop playback */
  },
  isSpeaking() {
    return false;
  },
  listVoices() {
    return [{ id: "default", name: "Default", locale: "en-US" }];
  },
};

registerTTSProvider(myTTS);
```

### Getting help text

```typescript
import { getVoiceCommandHelp } from "@innovator/core";

console.log(getVoiceCommandHelp());
// Available voice commands:
// • "Investigate [topic]" — Start investigating a subject
// • "Next angle" — Move to the next innovation angle
// ...
```

## Narration Segment Types

The `buildNarrationSegments()` function produces segments with these types:

| Type        | Purpose                          | Default pause |
| ----------- | -------------------------------- | ------------- |
| `heading`   | Section titles, subject intro    | 1000ms        |
| `body`      | Main content paragraphs          | 800ms         |
| `emphasis`  | Important callouts               | 600ms         |
| `list-item` | Individual ideas or bullet items | 800ms         |
| `summary`   | Final recommendation             | 1000ms        |

## Troubleshooting

### Microphone not working

- Ensure you're on HTTPS or `localhost`
- Check browser permissions: Settings → Privacy → Microphone
- Try a different browser (Chrome has the best Web Speech API support)

### Low recognition accuracy

- Speak clearly and at a moderate pace
- Reduce background noise
- Use the `locale` setting to match your language (e.g., `en-GB` for British English)
- Check the `confidence` field in transcripts — values below 0.7 may be unreliable

### TTS not speaking

- Verify `narrationEnabled` is `true` in your config
- Check that a TTS provider is registered
- On browsers, ensure audio autoplay is not blocked
