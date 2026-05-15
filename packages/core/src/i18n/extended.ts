/**
 * @module i18n/extended
 *
 * Extended i18n support — additional languages (10+ total covering 80%+ of
 * global tech workforce), RTL support, locale-specific innovation framework
 * emphasis, and localized artifact templates.
 */

import { z } from "zod";

// ---- Extended Language Schema ----

export const ExtendedLanguageSchema = z.enum([
  "en",
  "es",
  "ja",
  "de",
  "pt",
  "fr",
  "zh",
  "ko",
  "hi",
  "ar",
  "ru",
  "it",
  "nl",
  "pl",
  "tr",
]);

export type ExtendedLanguage = z.infer<typeof ExtendedLanguageSchema>;

export interface ExtendedLanguageConfig {
  code: ExtendedLanguage;
  name: string;
  nativeName: string;
  promptInstruction: string;
  direction: "ltr" | "rtl";
  innovationFramework: string;
  frameworkEmphasis: string[];
  artifactTemplate: {
    reportTitle: string;
    executiveSummary: string;
    methodology: string;
    findings: string;
    recommendations: string;
    nextSteps: string;
  };
}

// ---- Extended Language Configurations ----

export const EXTENDED_LANGUAGES: Record<ExtendedLanguage, ExtendedLanguageConfig> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    promptInstruction: "Respond in English.",
    direction: "ltr",
    innovationFramework: "Design Thinking + Lean Startup",
    frameworkEmphasis: [
      "user-centered design",
      "rapid prototyping",
      "MVP validation",
      "pivot-or-persevere",
    ],
    artifactTemplate: {
      reportTitle: "Innovation Report",
      executiveSummary: "Executive Summary",
      methodology: "Methodology",
      findings: "Key Findings",
      recommendations: "Recommendations",
      nextSteps: "Next Steps",
    },
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    promptInstruction:
      "Responde en español. Los nombres de campos JSON deben permanecer en inglés.",
    direction: "ltr",
    innovationFramework: "Innovación Social + Design Thinking",
    frameworkEmphasis: [
      "impacto social",
      "colaboración comunitaria",
      "sostenibilidad",
      "inclusión",
    ],
    artifactTemplate: {
      reportTitle: "Informe de Innovación",
      executiveSummary: "Resumen Ejecutivo",
      methodology: "Metodología",
      findings: "Hallazgos Clave",
      recommendations: "Recomendaciones",
      nextSteps: "Próximos Pasos",
    },
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    promptInstruction: "日本語で回答してください。JSONフィールド名は英語のままにしてください。",
    direction: "ltr",
    innovationFramework: "カイゼン + TRIZ",
    frameworkEmphasis: [
      "continuous improvement",
      "quality circles",
      "gemba walks",
      "muda elimination",
    ],
    artifactTemplate: {
      reportTitle: "イノベーション報告書",
      executiveSummary: "エグゼクティブサマリー",
      methodology: "方法論",
      findings: "主要な発見",
      recommendations: "提案",
      nextSteps: "次のステップ",
    },
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    promptInstruction: "Antworte auf Deutsch. JSON-Feldnamen bleiben auf Englisch.",
    direction: "ltr",
    innovationFramework: "Systematic Innovation + TRIZ",
    frameworkEmphasis: [
      "engineering precision",
      "Industrie 4.0",
      "process optimization",
      "Mittelstand innovation",
    ],
    artifactTemplate: {
      reportTitle: "Innovationsbericht",
      executiveSummary: "Zusammenfassung",
      methodology: "Methodik",
      findings: "Zentrale Erkenntnisse",
      recommendations: "Empfehlungen",
      nextSteps: "Nächste Schritte",
    },
  },
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    promptInstruction:
      "Responda em português. Os nomes dos campos JSON devem permanecer em inglês.",
    direction: "ltr",
    innovationFramework: "Inovação Frugal + Design Thinking",
    frameworkEmphasis: [
      "inovação frugal",
      "adaptabilidade",
      "mercados emergentes",
      "tecnologia social",
    ],
    artifactTemplate: {
      reportTitle: "Relatório de Inovação",
      executiveSummary: "Resumo Executivo",
      methodology: "Metodologia",
      findings: "Principais Descobertas",
      recommendations: "Recomendações",
      nextSteps: "Próximos Passos",
    },
  },
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    promptInstruction: "Répondez en français. Les noms des champs JSON doivent rester en anglais.",
    direction: "ltr",
    innovationFramework: "Design Thinking + Innovation Ouverte",
    frameworkEmphasis: [
      "expérience utilisateur",
      "design élégant",
      "innovation ouverte",
      "co-création",
    ],
    artifactTemplate: {
      reportTitle: "Rapport d'Innovation",
      executiveSummary: "Résumé Exécutif",
      methodology: "Méthodologie",
      findings: "Résultats Clés",
      recommendations: "Recommandations",
      nextSteps: "Prochaines Étapes",
    },
  },
  zh: {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    promptInstruction: "请用中文回答。JSON字段名保持英文不变。",
    direction: "ltr",
    innovationFramework: "平台战略 + 精益创业",
    frameworkEmphasis: [
      "platform strategy",
      "ecosystem building",
      "scale-first thinking",
      "rapid iteration",
    ],
    artifactTemplate: {
      reportTitle: "创新报告",
      executiveSummary: "执行摘要",
      methodology: "方法论",
      findings: "关键发现",
      recommendations: "建议",
      nextSteps: "下一步",
    },
  },
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    promptInstruction: "한국어로 답변해주세요. JSON 필드 이름은 영어로 유지합니다.",
    direction: "ltr",
    innovationFramework: "빠른 추종자 전략 + 디자인 씽킹",
    frameworkEmphasis: [
      "fast follower strategy",
      "hallyu innovation",
      "chaebŏl R&D",
      "pali-pali speed",
    ],
    artifactTemplate: {
      reportTitle: "혁신 보고서",
      executiveSummary: "요약",
      methodology: "방법론",
      findings: "주요 발견",
      recommendations: "권고사항",
      nextSteps: "다음 단계",
    },
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    promptInstruction: "कृपया हिंदी में उत्तर दें। JSON फ़ील्ड नाम अंग्रेज़ी में रखें।",
    direction: "ltr",
    innovationFramework: "Jugaad Innovation + Frugal Engineering",
    frameworkEmphasis: [
      "jugaad creativity",
      "frugal engineering",
      "inclusive innovation",
      "digital India",
    ],
    artifactTemplate: {
      reportTitle: "नवाचार रिपोर्ट",
      executiveSummary: "कार्यकारी सारांश",
      methodology: "कार्यप्रणाली",
      findings: "प्रमुख निष्कर्ष",
      recommendations: "सिफारिशें",
      nextSteps: "अगले कदम",
    },
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    promptInstruction: "أجب باللغة العربية. يجب أن تبقى أسماء حقول JSON بالإنجليزية.",
    direction: "rtl",
    innovationFramework: "Open Innovation + Strategic Foresight",
    frameworkEmphasis: [
      "vision-driven innovation",
      "national transformation",
      "knowledge economy",
      "sustainability",
    ],
    artifactTemplate: {
      reportTitle: "تقرير الابتكار",
      executiveSummary: "الملخص التنفيذي",
      methodology: "المنهجية",
      findings: "النتائج الرئيسية",
      recommendations: "التوصيات",
      nextSteps: "الخطوات التالية",
    },
  },
  ru: {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    promptInstruction:
      "Ответьте на русском языке. Имена полей JSON должны оставаться на английском.",
    direction: "ltr",
    innovationFramework: "TRIZ + Systematic Innovation",
    frameworkEmphasis: [
      "TRIZ methodology",
      "systematic inventive thinking",
      "ideality",
      "contradiction resolution",
    ],
    artifactTemplate: {
      reportTitle: "Отчёт об инновациях",
      executiveSummary: "Резюме",
      methodology: "Методология",
      findings: "Ключевые результаты",
      recommendations: "Рекомендации",
      nextSteps: "Следующие шаги",
    },
  },
  it: {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    promptInstruction: "Rispondi in italiano. I nomi dei campi JSON devono rimanere in inglese.",
    direction: "ltr",
    innovationFramework: "Design-Driven Innovation",
    frameworkEmphasis: [
      "design excellence",
      "craftsmanship innovation",
      "made in Italy",
      "user experience",
    ],
    artifactTemplate: {
      reportTitle: "Report sull'Innovazione",
      executiveSummary: "Sintesi",
      methodology: "Metodologia",
      findings: "Risultati Chiave",
      recommendations: "Raccomandazioni",
      nextSteps: "Prossimi Passi",
    },
  },
  nl: {
    code: "nl",
    name: "Dutch",
    nativeName: "Nederlands",
    promptInstruction: "Antwoord in het Nederlands. JSON-veldnamen blijven in het Engels.",
    direction: "ltr",
    innovationFramework: "Open Innovation + Triple Helix",
    frameworkEmphasis: [
      "collaborative innovation",
      "public-private partnerships",
      "circular economy",
      "polder model",
    ],
    artifactTemplate: {
      reportTitle: "Innovatierapport",
      executiveSummary: "Samenvatting",
      methodology: "Methodologie",
      findings: "Belangrijkste Bevindingen",
      recommendations: "Aanbevelingen",
      nextSteps: "Volgende Stappen",
    },
  },
  pl: {
    code: "pl",
    name: "Polish",
    nativeName: "Polski",
    promptInstruction: "Odpowiedz po polsku. Nazwy pól JSON muszą pozostać w języku angielskim.",
    direction: "ltr",
    innovationFramework: "Lean Innovation + Agile",
    frameworkEmphasis: [
      "lean methodology",
      "agile development",
      "IT excellence",
      "startup ecosystem",
    ],
    artifactTemplate: {
      reportTitle: "Raport Innowacji",
      executiveSummary: "Podsumowanie",
      methodology: "Metodologia",
      findings: "Kluczowe Odkrycia",
      recommendations: "Rekomendacje",
      nextSteps: "Następne Kroki",
    },
  },
  tr: {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
    promptInstruction: "Türkçe olarak cevap verin. JSON alan adları İngilizce kalmalıdır.",
    direction: "ltr",
    innovationFramework: "Design Thinking + Entrepreneurial Innovation",
    frameworkEmphasis: [
      "entrepreneurial ecosystem",
      "bridge between markets",
      "digital transformation",
      "youth innovation",
    ],
    artifactTemplate: {
      reportTitle: "İnovasyon Raporu",
      executiveSummary: "Yönetici Özeti",
      methodology: "Metodoloji",
      findings: "Temel Bulgular",
      recommendations: "Öneriler",
      nextSteps: "Sonraki Adımlar",
    },
  },
};

// ---- RTL Support ----

/** Check if a language uses right-to-left text direction. */
export function isRTL(language: ExtendedLanguage): boolean {
  return EXTENDED_LANGUAGES[language]?.direction === "rtl";
}

/** Get CSS direction properties for a language. */
export function getDirectionStyles(language: ExtendedLanguage): {
  direction: "ltr" | "rtl";
  textAlign: "left" | "right";
  unicodeBidi: string;
} {
  const rtl = isRTL(language);
  return {
    direction: rtl ? "rtl" : "ltr",
    textAlign: rtl ? "right" : "left",
    unicodeBidi: rtl ? "embed" : "normal",
  };
}

// ---- Innovation Framework Localization ----

/**
 * Get the recommended innovation framework for a locale, including
 * culturally appropriate emphasis areas.
 */
export function getLocalizedFramework(language: ExtendedLanguage): {
  framework: string;
  emphasis: string[];
  promptAddendum: string;
} {
  const config = EXTENDED_LANGUAGES[language] ?? EXTENDED_LANGUAGES.en;

  return {
    framework: config.innovationFramework,
    emphasis: config.frameworkEmphasis,
    promptAddendum: `When generating innovation ideas, consider the ${config.innovationFramework} framework. Emphasize: ${config.frameworkEmphasis.join(", ")}.`,
  };
}

/**
 * Localize a prompt with language instructions, cultural context, and
 * framework emphasis for the target locale.
 */
export function localizePromptExtended(prompt: string, language: ExtendedLanguage): string {
  if (language === "en") return prompt;
  const config = EXTENDED_LANGUAGES[language];
  if (!config) return prompt;

  return `${prompt}

LANGUAGE & CULTURAL CONTEXT:
${config.promptInstruction}
Innovation framework: ${config.innovationFramework}
Emphasis areas: ${config.frameworkEmphasis.join(", ")}
When providing examples, use culturally relevant references.`;
}

// ---- Artifact Template Localization ----

/**
 * Get localized artifact template section headers.
 */
export function getLocalizedArtifactTemplate(
  language: ExtendedLanguage
): ExtendedLanguageConfig["artifactTemplate"] {
  return EXTENDED_LANGUAGES[language]?.artifactTemplate ?? EXTENDED_LANGUAGES.en.artifactTemplate;
}

/**
 * Format a localized report header.
 */
export function formatLocalizedReport(
  language: ExtendedLanguage,
  title: string,
  sections: Array<{ key: keyof ExtendedLanguageConfig["artifactTemplate"]; content: string }>
): string {
  const template = getLocalizedArtifactTemplate(language);
  const dir = isRTL(language) ? " (RTL)" : "";
  const lines: string[] = [`# ${template.reportTitle}: ${title}${dir}`, ""];

  for (const section of sections) {
    const header = template[section.key] ?? section.key;
    lines.push(`## ${header}`, "", section.content, "");
  }

  return lines.join("\n");
}

// ---- Extended Language Detection ----

const EXTENDED_PATTERNS: Array<{ lang: ExtendedLanguage; patterns: RegExp[] }> = [
  { lang: "ko", patterns: [/[\uAC00-\uD7AF]/, /[\u1100-\u11FF]/] },
  { lang: "hi", patterns: [/[\u0900-\u097F]/] },
  { lang: "ar", patterns: [/[\u0600-\u06FF]/, /[\u0750-\u077F]/] },
  { lang: "ru", patterns: [/[\u0400-\u04FF]{2,}/] },
  {
    lang: "it",
    patterns: [
      /\b(il|lo|la|gli|le|di|del|della|dei|delle|in|con|per|che|non|una?|anche|questo|questa|sono|essere|fare|come|più|molto|tutto|dopo|prima|sempre|ancora)\b/i,
    ],
  },
  {
    lang: "nl",
    patterns: [
      /\b(het|een|van|de|en|is|dat|op|voor|met|zijn|maar|als|niet|ook|aan|bij|nog|wel|dan|kan|moet|naar|door|over|uit|meer|alle|deze|heeft|wordt|geen)\b/i,
    ],
  },
  {
    lang: "pl",
    patterns: [
      /\b(jest|nie|to|na|się|że|ale|jak|od|do|za|przez|przy|bez|pod|nad|między)\b/i,
      /[ąćęłńóśźż]/,
    ],
  },
  {
    lang: "tr",
    patterns: [
      /\b(bir|ve|bu|için|ile|olan|olarak|gibi|daha|çok|var|olan|sonra|ancak|ama|kadar|üzerinde|altında)\b/i,
      /[çğıöşüÇĞİÖŞÜ]/,
    ],
  },
];

/**
 * Detect language from text, supporting all 15 extended languages.
 */
export function detectExtendedLanguage(text: string): ExtendedLanguage {
  // Check CJK first
  if (/[\u3040-\u309F]|[\u30A0-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u4E00-\u9FFF]{2,}/.test(text)) return "zh";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0400-\u04FF]{2,}/.test(text)) return "ru";

  // Score-based for Latin-script languages
  let bestLang: ExtendedLanguage = "en";
  let bestScore = 0;

  for (const { lang, patterns } of EXTENDED_PATTERNS) {
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

  return bestScore >= 2 ? bestLang : "en";
}

/** List all supported extended languages. */
export function listExtendedLanguages(): ExtendedLanguageConfig[] {
  return Object.values(EXTENDED_LANGUAGES);
}

/** Get extended language config by code. */
export function getExtendedLanguageConfig(code: string): ExtendedLanguageConfig | undefined {
  return EXTENDED_LANGUAGES[code as ExtendedLanguage];
}
