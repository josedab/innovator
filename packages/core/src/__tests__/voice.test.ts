import { describe, it, expect, beforeEach } from "vitest";
import {
  parseVoiceCommand,
  buildNarrationSegments,
  getVoiceCommandHelp,
  registerSTTProvider,
  registerTTSProvider,
  getSTTProvider,
  getTTSProvider,
  listSTTProviders,
  listTTSProviders,
  clearVoiceProviders,
  VOICE_COMMANDS,
  type VoiceTranscript,
  type SpeechRecognitionProvider,
  type TextToSpeechProvider,
} from "../voice/index.js";

function makeTranscript(text: string, confidence = 0.95): VoiceTranscript {
  return {
    text,
    confidence,
    isFinal: true,
    timestamp: new Date().toISOString(),
  };
}

describe("voice", () => {
  beforeEach(() => {
    clearVoiceProviders();
  });

  // ---- parseVoiceCommand ----

  describe("parseVoiceCommand", () => {
    it("parses 'investigate' command", () => {
      const result = parseVoiceCommand(makeTranscript("investigate renewable energy"));
      expect(result).toBeDefined();
      expect(result!.command).toBe("investigate");
      expect(result!.argument).toBe("renewable energy");
    });

    it("parses 'look into' as investigate", () => {
      const result = parseVoiceCommand(makeTranscript("look into AI safety"));
      expect(result).toBeDefined();
      expect(result!.command).toBe("investigate");
      expect(result!.argument).toBe("AI safety");
    });

    it("parses 'research' as investigate", () => {
      const result = parseVoiceCommand(makeTranscript("research quantum computing"));
      expect(result!.command).toBe("investigate");
    });

    it("parses 'next angle' command", () => {
      const result = parseVoiceCommand(makeTranscript("next angle"));
      expect(result!.command).toBe("next-angle");
    });

    it("parses 'next' as next-angle", () => {
      const result = parseVoiceCommand(makeTranscript("next"));
      expect(result!.command).toBe("next-angle");
    });

    it("parses 'continue' as next-angle", () => {
      const result = parseVoiceCommand(makeTranscript("continue"));
      expect(result!.command).toBe("next-angle");
    });

    it("parses 'previous angle' command", () => {
      const result = parseVoiceCommand(makeTranscript("previous angle"));
      expect(result!.command).toBe("previous-angle");
    });

    it("parses 'go back' as previous-angle", () => {
      const result = parseVoiceCommand(makeTranscript("go back"));
      expect(result!.command).toBe("previous-angle");
    });

    it("parses 'score this' command", () => {
      const result = parseVoiceCommand(makeTranscript("score this"));
      expect(result!.command).toBe("score-this");
    });

    it("parses 'rate this' as score-this", () => {
      const result = parseVoiceCommand(makeTranscript("rate this"));
      expect(result!.command).toBe("score-this");
    });

    it("parses 'evaluate' as score-this", () => {
      const result = parseVoiceCommand(makeTranscript("evaluate"));
      expect(result!.command).toBe("score-this");
    });

    it("parses 'refine' command with argument", () => {
      const result = parseVoiceCommand(makeTranscript("refine the descriptions"));
      expect(result!.command).toBe("refine");
      expect(result!.argument).toBe("the descriptions");
    });

    it("parses 'export' command", () => {
      const result = parseVoiceCommand(makeTranscript("export"));
      expect(result!.command).toBe("export");
    });

    it("parses 'save' as export", () => {
      const result = parseVoiceCommand(makeTranscript("save results"));
      expect(result!.command).toBe("export");
    });

    it("parses 'download' as export", () => {
      const result = parseVoiceCommand(makeTranscript("download"));
      expect(result!.command).toBe("export");
    });

    it("parses 'summarize' command", () => {
      const result = parseVoiceCommand(makeTranscript("summarize"));
      expect(result!.command).toBe("summarize");
    });

    it("parses 'give me a summary' as summarize", () => {
      const result = parseVoiceCommand(makeTranscript("give me a summary"));
      expect(result!.command).toBe("summarize");
    });

    it("parses 'stop' command", () => {
      const result = parseVoiceCommand(makeTranscript("stop"));
      expect(result!.command).toBe("stop");
    });

    it("parses 'cancel' as stop", () => {
      const result = parseVoiceCommand(makeTranscript("cancel"));
      expect(result!.command).toBe("stop");
    });

    it("parses 'help' command", () => {
      const result = parseVoiceCommand(makeTranscript("help"));
      expect(result!.command).toBe("help");
    });

    it("parses 'what can I say' as help", () => {
      const result = parseVoiceCommand(makeTranscript("what can I say"));
      expect(result!.command).toBe("help");
    });

    it("returns undefined for unrecognized command", () => {
      const result = parseVoiceCommand(makeTranscript("hello world"));
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty transcript", () => {
      const result = parseVoiceCommand(makeTranscript(""));
      expect(result).toBeUndefined();
    });

    it("preserves confidence from transcript", () => {
      const result = parseVoiceCommand(makeTranscript("help", 0.8));
      expect(result!.confidence).toBe(0.8);
    });

    it("is case-insensitive", () => {
      const result = parseVoiceCommand(makeTranscript("INVESTIGATE blockchain"));
      expect(result!.command).toBe("investigate");
    });

    it("trims whitespace from transcript", () => {
      const result = parseVoiceCommand(makeTranscript("  help  "));
      expect(result!.command).toBe("help");
    });
  });

  // ---- buildNarrationSegments ----

  describe("buildNarrationSegments", () => {
    it("builds segments from complete data", () => {
      const segments = buildNarrationSegments({
        subject: "AI Innovation",
        summary: "A comprehensive summary",
        topIdeas: [
          { title: "Idea 1", description: "Desc 1" },
          { title: "Idea 2", description: "Desc 2" },
        ],
        themes: ["automation", "efficiency"],
        recommendation: "Focus on automation",
      });

      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0].type).toBe("heading");
      expect(segments[0].text).toContain("AI Innovation");
    });

    it("includes section titles for ideas", () => {
      const segments = buildNarrationSegments({
        topIdeas: [{ title: "Idea 1", description: "Desc 1" }],
      });
      expect(segments.some((s) => s.text.includes("top 1 ideas"))).toBe(true);
    });

    it("includes theme text", () => {
      const segments = buildNarrationSegments({
        themes: ["AI", "ML"],
      });
      expect(segments.some((s) => s.text.includes("AI, ML"))).toBe(true);
    });

    it("includes recommendation", () => {
      const segments = buildNarrationSegments({
        recommendation: "Do this thing",
      });
      const recSeg = segments.find((s) => s.type === "summary");
      expect(recSeg).toBeDefined();
      expect(recSeg!.text).toContain("Do this thing");
    });

    it("returns empty array for empty data", () => {
      const segments = buildNarrationSegments({});
      expect(segments).toEqual([]);
    });

    it("has appropriate pause durations", () => {
      const segments = buildNarrationSegments({
        subject: "Test",
        summary: "Summary",
        topIdeas: [{ title: "I", description: "D" }],
        recommendation: "R",
      });
      // Headings should have longer pauses
      const heading = segments.find((s) => s.type === "heading");
      expect(heading!.pauseAfterMs).toBeGreaterThanOrEqual(600);
    });

    it("skips topIdeas section if empty array", () => {
      const segments = buildNarrationSegments({ topIdeas: [] });
      expect(segments.some((s) => s.text.includes("top"))).toBe(false);
    });

    it("skips themes section if empty array", () => {
      const segments = buildNarrationSegments({ themes: [] });
      expect(segments).toHaveLength(0);
    });
  });

  // ---- getVoiceCommandHelp ----

  describe("getVoiceCommandHelp", () => {
    it("returns help text covering all commands", () => {
      const help = getVoiceCommandHelp();
      expect(help).toContain("Investigate");
      expect(help).toContain("Next angle");
      expect(help).toContain("Previous angle");
      expect(help).toContain("Score this");
      expect(help).toContain("Refine");
      expect(help).toContain("Export");
      expect(help).toContain("Summarize");
      expect(help).toContain("Stop");
      expect(help).toContain("Help");
    });

    it("mentions all voice commands", () => {
      const help = getVoiceCommandHelp().toLowerCase();
      for (const cmd of VOICE_COMMANDS) {
        const searchTerm = cmd.replace("-", " ");
        expect(help).toContain(searchTerm);
      }
    });
  });

  // ---- Provider Registration ----

  describe("STT/TTS Provider Registry", () => {
    const mockSTTProvider: SpeechRecognitionProvider = {
      id: "test-stt",
      name: "Test STT",
      start: () => {},
      stop: () => {},
      isListening: () => false,
      onTranscript: () => {},
      onError: () => {},
    };

    const mockTTSProvider: TextToSpeechProvider = {
      id: "test-tts",
      name: "Test TTS",
      speak: async () => {},
      stop: () => {},
      isSpeaking: () => false,
      listVoices: () => [{ id: "v1", name: "Voice 1", locale: "en-US" }],
    };

    it("registers and retrieves STT provider", () => {
      registerSTTProvider(mockSTTProvider);
      const provider = getSTTProvider("test-stt");
      expect(provider).toBeDefined();
      expect(provider!.name).toBe("Test STT");
    });

    it("registers and retrieves TTS provider", () => {
      registerTTSProvider(mockTTSProvider);
      const provider = getTTSProvider("test-tts");
      expect(provider).toBeDefined();
      expect(provider!.name).toBe("Test TTS");
    });

    it("returns undefined for unregistered provider", () => {
      expect(getSTTProvider("nonexistent")).toBeUndefined();
      expect(getTTSProvider("nonexistent")).toBeUndefined();
    });

    it("lists all registered STT providers", () => {
      registerSTTProvider(mockSTTProvider);
      const providers = listSTTProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("test-stt");
    });

    it("lists all registered TTS providers", () => {
      registerTTSProvider(mockTTSProvider);
      const providers = listTTSProviders();
      expect(providers).toHaveLength(1);
    });

    it("clearVoiceProviders empties both registries", () => {
      registerSTTProvider(mockSTTProvider);
      registerTTSProvider(mockTTSProvider);
      clearVoiceProviders();
      expect(listSTTProviders()).toHaveLength(0);
      expect(listTTSProviders()).toHaveLength(0);
    });

    it("overwrites provider with same id", () => {
      registerSTTProvider(mockSTTProvider);
      const updated = { ...mockSTTProvider, name: "Updated STT" };
      registerSTTProvider(updated);
      expect(getSTTProvider("test-stt")!.name).toBe("Updated STT");
      expect(listSTTProviders()).toHaveLength(1);
    });
  });
});
