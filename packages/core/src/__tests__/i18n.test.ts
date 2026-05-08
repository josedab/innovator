import { describe, it, expect } from "vitest";
import { detectLanguage, localizePrompt, listLanguages, getLanguageConfig } from "../i18n/index.js";

describe("i18n", () => {
  describe("detectLanguage", () => {
    it("detects English text", () => {
      expect(detectLanguage("The quick brown fox jumps over the lazy dog")).toBe("en");
    });

    it("detects Spanish text", () => {
      expect(detectLanguage("El rápido zorro marrón salta sobre el perro perezoso")).toBe("es");
    });

    it("detects Japanese text", () => {
      expect(detectLanguage("太陽エネルギーの未来について")).toBe("ja");
    });

    it("detects German text", () => {
      expect(detectLanguage("Der schnelle braune Fuchs springt über den faulen Hund")).toBe("de");
    });

    it("detects Portuguese text", () => {
      expect(detectLanguage("O rápido raposa marrom pula sobre o cão preguiçoso")).toBe("pt");
    });

    it("defaults to 'en' for ambiguous text", () => {
      expect(detectLanguage("hello world")).toBe("en");
    });

    it("handles empty string", () => {
      expect(detectLanguage("")).toBe("en");
    });

    it("handles single-word input", () => {
      expect(detectLanguage("innovation")).toBe("en");
    });

    it("detects Japanese with hiragana characters", () => {
      expect(detectLanguage("こんにちは")).toBe("ja");
    });

    it("detects Japanese with katakana characters", () => {
      expect(detectLanguage("ソーラーエネルギー")).toBe("ja");
    });

    it("detects Spanish via accent marks", () => {
      expect(detectLanguage("información más según también")).toBe("es");
    });

    it("detects German via special characters", () => {
      expect(detectLanguage("Ökologie und Größe der Straße")).toBe("de");
    });
  });

  describe("localizePrompt", () => {
    it("returns prompt unchanged for English", () => {
      const prompt = "Generate ideas for solar energy";
      expect(localizePrompt(prompt, "en")).toBe(prompt);
    });

    it("appends language instruction for Spanish", () => {
      const prompt = "Generate ideas";
      const result = localizePrompt(prompt, "es");
      expect(result).toContain(prompt);
      expect(result).toContain("IMPORTANT LANGUAGE INSTRUCTION");
      expect(result).toContain("español");
    });

    it("appends language instruction for Japanese", () => {
      const result = localizePrompt("Generate ideas", "ja");
      expect(result).toContain("IMPORTANT LANGUAGE INSTRUCTION");
      expect(result).toContain("日本語");
    });

    it("keeps JSON keys instruction for non-English", () => {
      const result = localizePrompt("test", "es");
      expect(result).toContain("English");
    });
  });

  describe("listLanguages", () => {
    it("returns all 7 language configs", () => {
      const langs = listLanguages();
      expect(langs).toHaveLength(7);
      const codes = langs.map((l) => l.code);
      expect(codes).toContain("en");
      expect(codes).toContain("es");
      expect(codes).toContain("ja");
      expect(codes).toContain("de");
      expect(codes).toContain("pt");
      expect(codes).toContain("fr");
      expect(codes).toContain("zh");
    });

    it("each config has required fields", () => {
      for (const lang of listLanguages()) {
        expect(lang.code).toBeTruthy();
        expect(lang.name).toBeTruthy();
        expect(lang.nativeName).toBeTruthy();
        expect(lang.promptInstruction).toBeTruthy();
      }
    });
  });

  describe("getLanguageConfig", () => {
    it("returns config for valid code", () => {
      const config = getLanguageConfig("es");
      expect(config).toBeDefined();
      expect(config!.code).toBe("es");
      expect(config!.name).toBe("Spanish");
      expect(config!.nativeName).toBe("Español");
    });

    it("returns undefined for unknown code", () => {
      expect(getLanguageConfig("xx")).toBeUndefined();
      expect(getLanguageConfig("kr")).toBeUndefined();
    });

    it("returns config for all supported codes", () => {
      for (const code of ["en", "es", "ja", "de", "pt", "fr", "zh"]) {
        expect(getLanguageConfig(code)).toBeDefined();
      }
    });
  });
});
