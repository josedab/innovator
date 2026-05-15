import { describe, it, expect } from "vitest";

import {
  EXTENDED_LANGUAGES,
  isRTL,
  getDirectionStyles,
  getLocalizedFramework,
  localizePromptExtended,
  getLocalizedArtifactTemplate,
  formatLocalizedReport,
  detectExtendedLanguage,
  listExtendedLanguages,
  getExtendedLanguageConfig,
} from "../i18n/extended.js";

describe("i18n/extended", () => {
  describe("language catalogue", () => {
    it("has at least 15 languages", () => {
      const langs = listExtendedLanguages();
      expect(langs.length).toBeGreaterThanOrEqual(15);
    });

    it("includes core languages", () => {
      expect(getExtendedLanguageConfig("en")).toBeDefined();
      expect(getExtendedLanguageConfig("ja")).toBeDefined();
      expect(getExtendedLanguageConfig("ko")).toBeDefined();
      expect(getExtendedLanguageConfig("ar")).toBeDefined();
      expect(getExtendedLanguageConfig("hi")).toBeDefined();
      expect(getExtendedLanguageConfig("ru")).toBeDefined();
    });

    it("each language has prompt instruction", () => {
      for (const lang of listExtendedLanguages()) {
        expect(lang.promptInstruction.length).toBeGreaterThan(0);
        expect(lang.innovationFramework.length).toBeGreaterThan(0);
        expect(lang.frameworkEmphasis.length).toBeGreaterThan(0);
      }
    });

    it("each language has artifact template", () => {
      for (const lang of listExtendedLanguages()) {
        expect(lang.artifactTemplate.reportTitle.length).toBeGreaterThan(0);
        expect(lang.artifactTemplate.executiveSummary.length).toBeGreaterThan(0);
      }
    });

    it("returns undefined for unknown language", () => {
      expect(getExtendedLanguageConfig("xx")).toBeUndefined();
    });
  });

  describe("RTL support", () => {
    it("detects Arabic as RTL", () => {
      expect(isRTL("ar")).toBe(true);
    });

    it("detects English as LTR", () => {
      expect(isRTL("en")).toBe(false);
    });

    it("returns correct direction styles", () => {
      const arStyles = getDirectionStyles("ar");
      expect(arStyles.direction).toBe("rtl");
      expect(arStyles.textAlign).toBe("right");

      const enStyles = getDirectionStyles("en");
      expect(enStyles.direction).toBe("ltr");
      expect(enStyles.textAlign).toBe("left");
    });
  });

  describe("framework localization", () => {
    it("returns TRIZ for Japanese", () => {
      const fw = getLocalizedFramework("ja");
      expect(fw.framework).toContain("TRIZ");
      expect(fw.emphasis).toContain("continuous improvement");
    });

    it("returns Jugaad for Hindi", () => {
      const fw = getLocalizedFramework("hi");
      expect(fw.framework).toContain("Jugaad");
    });

    it("returns Design Thinking for English", () => {
      const fw = getLocalizedFramework("en");
      expect(fw.framework).toContain("Design Thinking");
    });

    it("returns prompt addendum", () => {
      const fw = getLocalizedFramework("de");
      expect(fw.promptAddendum).toContain("Industrie 4.0");
    });
  });

  describe("prompt localization", () => {
    it("returns unmodified prompt for English", () => {
      const prompt = "Generate ideas about X";
      expect(localizePromptExtended(prompt, "en")).toBe(prompt);
    });

    it("adds language and cultural context for non-English", () => {
      const localized = localizePromptExtended("Generate ideas", "ja");
      expect(localized).toContain("日本語");
      expect(localized).toContain("TRIZ");
    });

    it("adds framework emphasis for Korean", () => {
      const localized = localizePromptExtended("Test", "ko");
      expect(localized).toContain("한국어");
    });
  });

  describe("artifact templates", () => {
    it("returns localized section headers", () => {
      const tmpl = getLocalizedArtifactTemplate("es");
      expect(tmpl.reportTitle).toBe("Informe de Innovación");
      expect(tmpl.executiveSummary).toBe("Resumen Ejecutivo");
    });

    it("falls back to English for unknown", () => {
      const tmpl = getLocalizedArtifactTemplate("en");
      expect(tmpl.reportTitle).toBe("Innovation Report");
    });

    it("formats a localized report", () => {
      const report = formatLocalizedReport("fr", "Test Innovation", [
        { key: "executiveSummary", content: "Résumé du projet" },
        { key: "findings", content: "Résultats importants" },
      ]);
      expect(report).toContain("Rapport d'Innovation");
      expect(report).toContain("Résumé Exécutif");
      expect(report).toContain("Résultats Clés");
    });

    it("adds RTL marker for Arabic", () => {
      const report = formatLocalizedReport("ar", "Test", []);
      expect(report).toContain("(RTL)");
    });
  });

  describe("extended language detection", () => {
    it("detects Korean", () => {
      expect(detectExtendedLanguage("혁신적인 아이디어를 생성해주세요")).toBe("ko");
    });

    it("detects Hindi", () => {
      expect(detectExtendedLanguage("नवाचार के बारे में बताइए")).toBe("hi");
    });

    it("detects Arabic", () => {
      expect(detectExtendedLanguage("ابتكار جديد في مجال التكنولوجيا")).toBe("ar");
    });

    it("detects Russian", () => {
      expect(detectExtendedLanguage("Инновации в области технологий")).toBe("ru");
    });

    it("defaults to English for ambiguous text", () => {
      expect(detectExtendedLanguage("Hello world")).toBe("en");
    });

    it("detects Japanese via kana", () => {
      expect(detectExtendedLanguage("こんにちは、イノベーション")).toBe("ja");
    });

    it("detects Chinese via CJK without kana", () => {
      expect(detectExtendedLanguage("创新技术发展")).toBe("zh");
    });
  });
});
