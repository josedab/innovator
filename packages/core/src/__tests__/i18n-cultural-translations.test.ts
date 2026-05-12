import { describe, it, expect } from "vitest";
import {
  getCulturalContext,
  culturalizePrompt,
  getTranslations,
  t,
  type SupportedLanguage,
} from "../i18n/index.js";

describe("i18n cultural context & translations (extended)", () => {
  describe("getCulturalContext", () => {
    const locales: SupportedLanguage[] = ["en", "es", "ja", "de", "pt", "fr", "zh"];

    for (const locale of locales) {
      it(`returns complete cultural context for ${locale}`, () => {
        const ctx = getCulturalContext(locale);
        expect(ctx).toMatchObject({
          language: locale,
          innovationStyle: expect.any(String),
          communicationPreference: expect.any(String),
          exampleDomains: expect.any(Array),
        });
        expect(ctx.innovationStyle.length).toBeGreaterThan(10);
        expect(ctx.communicationPreference.length).toBeGreaterThan(5);
        expect(ctx.exampleDomains.length).toBeGreaterThanOrEqual(3);
      });
    }

    it("English context focuses on disruptive potential", () => {
      const ctx = getCulturalContext("en");
      expect(ctx.innovationStyle.toLowerCase()).toContain("disruptive");
      expect(ctx.communicationPreference.toLowerCase()).toContain("concise");
    });

    it("Spanish context emphasizes community", () => {
      const ctx = getCulturalContext("es");
      expect(ctx.innovationStyle.toLowerCase()).toContain("collaborative");
    });

    it("Japanese context emphasizes kaizen and quality", () => {
      const ctx = getCulturalContext("ja");
      expect(ctx.innovationStyle.toLowerCase()).toContain("kaizen");
      expect(ctx.innovationStyle.toLowerCase()).toContain("quality");
    });

    it("German context emphasizes engineering and precision", () => {
      const ctx = getCulturalContext("de");
      expect(ctx.innovationStyle.toLowerCase()).toContain("engineering");
      expect(ctx.innovationStyle.toLowerCase()).toContain("precision");
    });

    it("Portuguese context emphasizes creative and adaptive", () => {
      const ctx = getCulturalContext("pt");
      expect(ctx.innovationStyle.toLowerCase()).toContain("creative");
    });

    it("French context emphasizes design and elegance", () => {
      const ctx = getCulturalContext("fr");
      expect(ctx.innovationStyle.toLowerCase()).toContain("design");
      expect(ctx.innovationStyle.toLowerCase()).toContain("elegance");
    });

    it("Chinese context emphasizes scale and speed", () => {
      const ctx = getCulturalContext("zh");
      expect(ctx.innovationStyle.toLowerCase()).toContain("scale");
    });
  });

  describe("culturalizePrompt", () => {
    it("returns prompt unchanged for en locale (passthrough)", () => {
      const prompt = "Generate ideas about innovation";
      expect(culturalizePrompt(prompt, "en")).toBe(prompt);
    });

    it("adds cultural instructions for non-English locale", () => {
      const prompt = "Generate ideas";
      const result = culturalizePrompt(prompt, "ja");
      expect(result).toContain(prompt);
      expect(result).toContain("CULTURAL & LANGUAGE CONTEXT");
      expect(result).toContain("日本語");
      expect(result).toContain("kaizen");
    });

    it("includes communication preference for es", () => {
      const result = culturalizePrompt("Test", "es");
      expect(result).toContain("Narrative style");
    });

    it("includes example domains for de", () => {
      const result = culturalizePrompt("Test", "de");
      expect(result).toContain("automotive engineering");
    });

    it("includes language instruction for fr", () => {
      const result = culturalizePrompt("Test", "fr");
      expect(result).toContain("français");
    });

    it("includes language instruction for zh", () => {
      const result = culturalizePrompt("Test", "zh");
      expect(result).toContain("中文");
    });
  });

  describe("getTranslations", () => {
    const locales: SupportedLanguage[] = ["en", "es", "ja", "de", "pt", "fr", "zh"];

    for (const locale of locales) {
      it(`returns complete translations for ${locale}`, () => {
        const trans = getTranslations(locale);
        expect(trans).toMatchObject({
          common: {
            loading: expect.any(String),
            error: expect.any(String),
            save: expect.any(String),
            cancel: expect.any(String),
            submit: expect.any(String),
            back: expect.any(String),
            next: expect.any(String),
            search: expect.any(String),
            noResults: expect.any(String),
          },
          innovation: {
            investigate: expect.any(String),
            generate: expect.any(String),
            synthesize: expect.any(String),
            ideas: expect.any(String),
            angles: expect.any(String),
            subject: expect.any(String),
            enterSubject: expect.any(String),
            startInvestigation: expect.any(String),
            selectAngles: expect.any(String),
            viewResults: expect.any(String),
            exportResults: expect.any(String),
          },
          analytics: {
            dashboard: expect.any(String),
            pipelines: expect.any(String),
            ideasGenerated: expect.any(String),
            successRate: expect.any(String),
            avgDuration: expect.any(String),
            insights: expect.any(String),
          },
        });
      });
    }

    it("Spanish translations are in Spanish", () => {
      const trans = getTranslations("es");
      expect(trans.common.loading).toBe("Cargando...");
      expect(trans.innovation.investigate).toBe("Investigar");
    });

    it("Japanese translations are in Japanese", () => {
      const trans = getTranslations("ja");
      expect(trans.common.loading).toBe("読み込み中...");
      expect(trans.innovation.investigate).toBe("調査");
    });

    it("Chinese translations are in Chinese", () => {
      const trans = getTranslations("zh");
      expect(trans.common.loading).toBe("加载中...");
      expect(trans.innovation.investigate).toBe("调查");
    });
  });

  describe("t() translation function", () => {
    it("translates known keys for all locales", () => {
      expect(t("en", "common.loading")).toBe("Loading...");
      expect(t("es", "common.loading")).toBe("Cargando...");
      expect(t("ja", "common.loading")).toBe("読み込み中...");
      expect(t("de", "common.loading")).toBe("Laden...");
      expect(t("pt", "common.loading")).toBe("Carregando...");
      expect(t("fr", "common.loading")).toBe("Chargement...");
      expect(t("zh", "common.loading")).toBe("加载中...");
    });

    it("falls back to key path for undefined keys", () => {
      expect(t("en", "nonexistent.key")).toBe("nonexistent.key");
    });

    it("falls back to key path for deeply nested undefined keys", () => {
      expect(t("en", "common.nonexistent.deep")).toBe("common.nonexistent.deep");
    });

    it("handles single-segment key path", () => {
      // "common" resolves to an object, not a string, so fallback to key
      expect(t("en", "common")).toBe("common");
    });

    it("translates analytics terms", () => {
      expect(t("de", "analytics.dashboard")).toBe("Dashboard");
      expect(t("fr", "analytics.dashboard")).toBe("Tableau de bord");
      expect(t("pt", "analytics.insights")).toBe("Insights IA");
    });

    it("translates innovation terms", () => {
      expect(t("de", "innovation.generate")).toBe("Generieren");
      expect(t("fr", "innovation.generate")).toBe("Générer");
      expect(t("zh", "innovation.generate")).toBe("生成");
    });
  });

  describe("CJK character handling", () => {
    it("Japanese translations contain kanji/hiragana/katakana", () => {
      const trans = getTranslations("ja");
      expect(trans.common.cancel).toBe("キャンセル"); // Katakana
      expect(trans.innovation.ideas).toBe("アイデア"); // Katakana
    });

    it("Chinese translations contain CJK characters", () => {
      const trans = getTranslations("zh");
      expect(trans.common.save).toBe("保存");
      expect(trans.innovation.ideas).toBe("创意");
    });
  });
});
