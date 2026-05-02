/**
 * @module i18n
 *
 * Multi-language support for prompt templates and output localization.
 * Detects input language using heuristics and provides localized prompt instructions.
 */

import { z } from "zod";

export const SupportedLanguageSchema = z.enum(["en", "es", "ja", "de", "pt"]);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  promptInstruction: string;
}

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, LanguageConfig> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    promptInstruction: "Respond in English.",
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    promptInstruction:
      "Responde en español. All field names in JSON must remain in English, but values should be in Spanish.",
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    promptInstruction:
      "日本語で回答してください。JSON のフィールド名は英語のままにし、値を日本語にしてください。",
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    promptInstruction:
      "Antworte auf Deutsch. JSON-Feldnamen bleiben auf Englisch, aber die Werte sollten auf Deutsch sein.",
  },
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    promptInstruction:
      "Responda em português. Os nomes dos campos JSON devem permanecer em inglês, mas os valores devem estar em português.",
  },
};

// ---- Language Detection (heuristic-based, no external deps) ----

const LANGUAGE_PATTERNS: Array<{ lang: SupportedLanguage; patterns: RegExp[] }> = [
  {
    lang: "ja",
    patterns: [
      /[\u3040-\u309F]/, // Hiragana
      /[\u30A0-\u30FF]/, // Katakana
      /[\u4E00-\u9FAF]/, // CJK
    ],
  },
  {
    lang: "es",
    patterns: [
      /\b(el|la|los|las|de|del|en|es|por|para|con|como|más|pero|que|una?|este|esta|estos|estas|muy|también|sobre|puede|tiene|hacer|cada|donde|hasta|desde|entre|aquí|ahora|porque|cuando|todos|después|según|siempre|durante|antes|después)\b/i,
      /[áéíóúñ¿¡]/,
    ],
  },
  {
    lang: "de",
    patterns: [
      /\b(der|die|das|ein|eine|und|ist|von|für|mit|auf|den|dem|des|sich|nicht|auch|als|noch|wie|oder|aber|nach|bei|über|nur|dann|kann|mehr|wenn|wird|sind|aus|alle|zur|zum|schon|durch|sehr|muss|etwa|weil|viel)\b/i,
      /[äöüß]/,
    ],
  },
  {
    lang: "pt",
    patterns: [
      /\b(o|a|os|as|de|do|da|dos|das|em|no|na|nos|nas|por|para|com|como|mais|mas|que|uma?|este|esta|estes|estas|muito|também|sobre|pode|tem|fazer|cada|onde|até|desde|entre|aqui|agora|porque|quando|todos|depois|segundo|sempre|durante|antes|depois)\b/i,
      /[ãõçâêô]/,
    ],
  },
];

/**
 * Detect the language of input text using character and word pattern heuristics.
 * Returns 'en' as fallback when no strong signal is detected.
 */
export function detectLanguage(text: string): SupportedLanguage {
  // Japanese detection via character sets (highest priority)
  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    if (lang === "ja") {
      if (patterns.some((p) => p.test(text))) return "ja";
      continue;
    }
  }

  // Score-based detection for Latin-script languages
  let bestLang: SupportedLanguage = "en";
  let bestScore = 0;

  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    if (lang === "ja") continue;
    let score = 0;
    for (const pattern of patterns) {
      const matches = text.match(new RegExp(pattern, "gi"));
      if (matches) score += matches.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  // Require a minimum threshold to avoid false positives
  return bestScore >= 2 ? bestLang : "en";
}

/**
 * Wrap a prompt with language instructions.
 * Appends a localized instruction to ensure LLM output matches the target language.
 */
export function localizePrompt(prompt: string, language: SupportedLanguage): string {
  if (language === "en") return prompt;
  const config = SUPPORTED_LANGUAGES[language];
  return `${prompt}\n\nIMPORTANT LANGUAGE INSTRUCTION: ${config.promptInstruction}`;
}

/** Get the list of supported languages. */
export function listLanguages(): LanguageConfig[] {
  return Object.values(SUPPORTED_LANGUAGES);
}

/** Get language config by code. */
export function getLanguageConfig(code: string): LanguageConfig | undefined {
  return SUPPORTED_LANGUAGES[code as SupportedLanguage];
}
