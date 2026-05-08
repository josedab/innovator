import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  localizePrompt,
  getTranslations,
  t as translate,
  getCulturalContext,
  culturalizePrompt,
  listLanguages,
  getLanguageConfig,
} from "../i18n/index.js";

describe("i18n Enhancements", () => {
  describe("New language support", () => {
    it("supports French", () => {
      const config = getLanguageConfig("fr");
      expect(config).toBeDefined();
      expect(config!.nativeName).toBe("Français");
    });

    it("supports Chinese", () => {
      const config = getLanguageConfig("zh");
      expect(config).toBeDefined();
      expect(config!.nativeName).toBe("中文");
    });

    it("lists all 7 languages", () => {
      const langs = listLanguages();
      expect(langs).toHaveLength(7);
      const codes = langs.map((l) => l.code);
      expect(codes).toContain("fr");
      expect(codes).toContain("zh");
    });
  });

  describe("Language detection - French", () => {
    it("detects French text", () => {
      expect(
        detectLanguage("Bonjour, comment allez-vous? Les résultats sont très bien pour tous")
      ).toBe("fr");
    });

    it("detects French from accented characters", () => {
      expect(detectLanguage("Les résultats sont très intéressants")).toBe("fr");
    });
  });

  describe("Language detection - Chinese", () => {
    it("detects Chinese text", () => {
      expect(detectLanguage("人工智能在医疗领域的应用")).toBe("zh");
    });
  });

  describe("Prompt localization", () => {
    it("localizes prompt for French", () => {
      const result = localizePrompt("Generate ideas", "fr");
      expect(result).toContain("français");
    });

    it("localizes prompt for Chinese", () => {
      const result = localizePrompt("Generate ideas", "zh");
      expect(result).toContain("中文");
    });

    it("returns unmodified prompt for English", () => {
      const prompt = "Generate ideas";
      expect(localizePrompt(prompt, "en")).toBe(prompt);
    });
  });

  describe("UI Translations", () => {
    it("returns translations for each language", () => {
      for (const code of ["en", "es", "ja", "de", "pt", "fr", "zh"] as const) {
        const t = getTranslations(code);
        expect(t.common.loading).toBeDefined();
        expect(t.innovation.investigate).toBeDefined();
        expect(t.analytics.dashboard).toBeDefined();
      }
    });

    it("translate function works with dot path", () => {
      expect(translate("en", "common.loading")).toBe("Loading...");
      expect(translate("es", "common.loading")).toBe("Cargando...");
      expect(translate("fr", "common.loading")).toBe("Chargement...");
      expect(translate("zh", "common.loading")).toBe("加载中...");
      expect(translate("ja", "common.loading")).toBe("読み込み中...");
    });

    it("translate falls back to key path for unknown keys", () => {
      expect(translate("en", "unknown.key.path")).toBe("unknown.key.path");
    });

    it("translates innovation terms correctly", () => {
      expect(translate("de", "innovation.investigate")).toBe("Untersuchen");
      expect(translate("pt", "innovation.ideas")).toBe("Ideias");
      expect(translate("fr", "innovation.generate")).toBe("Générer");
    });
  });

  describe("Cultural Context", () => {
    it("returns cultural context for each language", () => {
      for (const code of ["en", "es", "ja", "de", "pt", "fr", "zh"] as const) {
        const context = getCulturalContext(code);
        expect(context.language).toBe(code);
        expect(context.innovationStyle).toBeDefined();
        expect(context.communicationPreference).toBeDefined();
        expect(context.exampleDomains.length).toBeGreaterThan(0);
      }
    });

    it("culturalizePrompt adds cultural context for non-English", () => {
      const result = culturalizePrompt("Generate ideas about AI", "ja");
      expect(result).toContain("CULTURAL");
      expect(result).toContain("日本語");
    });

    it("culturalizePrompt returns unmodified for English", () => {
      const prompt = "Generate ideas";
      expect(culturalizePrompt(prompt, "en")).toBe(prompt);
    });

    it("Japanese context emphasizes kaizen", () => {
      const context = getCulturalContext("ja");
      expect(context.innovationStyle.toLowerCase()).toContain("kaizen");
    });

    it("German context emphasizes engineering", () => {
      const context = getCulturalContext("de");
      expect(context.innovationStyle.toLowerCase()).toContain("engineering");
    });
  });
});
