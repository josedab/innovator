/**
 * @module i18n
 *
 * Multi-language support for prompt templates and output localization.
 * Detects input language using heuristics and provides localized prompt instructions.
 */

import { z } from "zod";

export const SupportedLanguageSchema = z.enum(["en", "es", "ja", "de", "pt", "fr", "zh"]);
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
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    promptInstruction:
      "Répondez en français. Les noms des champs JSON doivent rester en anglais, mais les valeurs doivent être en français.",
  },
  zh: {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    promptInstruction: "请用中文回答。JSON 字段名保持英文不变，但值应使用中文。",
  },
};

// ---- Language Detection (heuristic-based, no external deps) ----

const LANGUAGE_PATTERNS: Array<{ lang: SupportedLanguage; patterns: RegExp[] }> = [
  {
    lang: "ja",
    patterns: [
      /[\u3040-\u309F]/, // Hiragana
      /[\u30A0-\u30FF]/, // Katakana
      /[\u4E00-\u9FAF]/, // CJK (shared with Chinese but ja checked first via Hiragana/Katakana)
    ],
  },
  {
    lang: "zh",
    patterns: [
      /[\u4E00-\u9FFF]{2,}/, // CJK Unified Ideographs (2+ consecutive)
      /[\u3400-\u4DBF]/, // CJK Extension A
    ],
  },
  {
    lang: "fr",
    patterns: [
      /\b(le|la|les|de|du|des|un|une|et|est|en|pour|avec|sur|par|dans|ce|cette|ces|qui|que|ne|pas|sont|être|avoir|fait|plus|mais|aussi|très|bien|tous|peut|comme|sans|où|entre|même|autre|après|avant|depuis|donc|puis|encore|toujours|pendant)\b/i,
      /[àâæçéèêëïîôœùûüÿ]/,
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
  // Japanese detection via character sets (Hiragana/Katakana are unique to Japanese)
  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    if (lang === "ja") {
      // Only match if Hiragana or Katakana is present (not just CJK)
      if (patterns[0].test(text) || patterns[1].test(text)) return "ja";
      continue;
    }
  }

  // Chinese detection (CJK without Japanese kana)
  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    if (lang === "zh") {
      if (patterns.some((p) => p.test(text))) return "zh";
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

// ---- UI Translation Strings ----

export interface UITranslations {
  common: {
    loading: string;
    error: string;
    save: string;
    cancel: string;
    submit: string;
    back: string;
    next: string;
    search: string;
    noResults: string;
  };
  innovation: {
    investigate: string;
    generate: string;
    synthesize: string;
    ideas: string;
    angles: string;
    subject: string;
    enterSubject: string;
    startInvestigation: string;
    selectAngles: string;
    viewResults: string;
    exportResults: string;
  };
  analytics: {
    dashboard: string;
    pipelines: string;
    ideasGenerated: string;
    successRate: string;
    avgDuration: string;
    insights: string;
  };
}

const TRANSLATIONS: Record<SupportedLanguage, UITranslations> = {
  en: {
    common: {
      loading: "Loading...",
      error: "An error occurred",
      save: "Save",
      cancel: "Cancel",
      submit: "Submit",
      back: "Back",
      next: "Next",
      search: "Search",
      noResults: "No results found",
    },
    innovation: {
      investigate: "Investigate",
      generate: "Generate",
      synthesize: "Synthesize",
      ideas: "Ideas",
      angles: "Angles",
      subject: "Subject",
      enterSubject: "Enter a subject to investigate",
      startInvestigation: "Start Investigation",
      selectAngles: "Select Angles",
      viewResults: "View Results",
      exportResults: "Export Results",
    },
    analytics: {
      dashboard: "Dashboard",
      pipelines: "Pipelines",
      ideasGenerated: "Ideas Generated",
      successRate: "Success Rate",
      avgDuration: "Avg Duration",
      insights: "AI Insights",
    },
  },
  es: {
    common: {
      loading: "Cargando...",
      error: "Ocurrió un error",
      save: "Guardar",
      cancel: "Cancelar",
      submit: "Enviar",
      back: "Atrás",
      next: "Siguiente",
      search: "Buscar",
      noResults: "Sin resultados",
    },
    innovation: {
      investigate: "Investigar",
      generate: "Generar",
      synthesize: "Sintetizar",
      ideas: "Ideas",
      angles: "Ángulos",
      subject: "Tema",
      enterSubject: "Introduce un tema para investigar",
      startInvestigation: "Iniciar Investigación",
      selectAngles: "Seleccionar Ángulos",
      viewResults: "Ver Resultados",
      exportResults: "Exportar Resultados",
    },
    analytics: {
      dashboard: "Panel",
      pipelines: "Pipelines",
      ideasGenerated: "Ideas Generadas",
      successRate: "Tasa de Éxito",
      avgDuration: "Duración Media",
      insights: "Ideas IA",
    },
  },
  ja: {
    common: {
      loading: "読み込み中...",
      error: "エラーが発生しました",
      save: "保存",
      cancel: "キャンセル",
      submit: "送信",
      back: "戻る",
      next: "次へ",
      search: "検索",
      noResults: "結果が見つかりません",
    },
    innovation: {
      investigate: "調査",
      generate: "生成",
      synthesize: "統合",
      ideas: "アイデア",
      angles: "角度",
      subject: "テーマ",
      enterSubject: "調査するテーマを入力",
      startInvestigation: "調査開始",
      selectAngles: "角度を選択",
      viewResults: "結果を表示",
      exportResults: "結果をエクスポート",
    },
    analytics: {
      dashboard: "ダッシュボード",
      pipelines: "パイプライン",
      ideasGenerated: "生成されたアイデア",
      successRate: "成功率",
      avgDuration: "平均所要時間",
      insights: "AIインサイト",
    },
  },
  de: {
    common: {
      loading: "Laden...",
      error: "Ein Fehler ist aufgetreten",
      save: "Speichern",
      cancel: "Abbrechen",
      submit: "Absenden",
      back: "Zurück",
      next: "Weiter",
      search: "Suchen",
      noResults: "Keine Ergebnisse",
    },
    innovation: {
      investigate: "Untersuchen",
      generate: "Generieren",
      synthesize: "Synthetisieren",
      ideas: "Ideen",
      angles: "Blickwinkel",
      subject: "Thema",
      enterSubject: "Thema zur Untersuchung eingeben",
      startInvestigation: "Untersuchung starten",
      selectAngles: "Blickwinkel auswählen",
      viewResults: "Ergebnisse anzeigen",
      exportResults: "Ergebnisse exportieren",
    },
    analytics: {
      dashboard: "Dashboard",
      pipelines: "Pipelines",
      ideasGenerated: "Generierte Ideen",
      successRate: "Erfolgsrate",
      avgDuration: "Durchschnittliche Dauer",
      insights: "KI-Einblicke",
    },
  },
  pt: {
    common: {
      loading: "Carregando...",
      error: "Ocorreu um erro",
      save: "Salvar",
      cancel: "Cancelar",
      submit: "Enviar",
      back: "Voltar",
      next: "Próximo",
      search: "Buscar",
      noResults: "Sem resultados",
    },
    innovation: {
      investigate: "Investigar",
      generate: "Gerar",
      synthesize: "Sintetizar",
      ideas: "Ideias",
      angles: "Ângulos",
      subject: "Assunto",
      enterSubject: "Digite um assunto para investigar",
      startInvestigation: "Iniciar Investigação",
      selectAngles: "Selecionar Ângulos",
      viewResults: "Ver Resultados",
      exportResults: "Exportar Resultados",
    },
    analytics: {
      dashboard: "Painel",
      pipelines: "Pipelines",
      ideasGenerated: "Ideias Geradas",
      successRate: "Taxa de Sucesso",
      avgDuration: "Duração Média",
      insights: "Insights IA",
    },
  },
  fr: {
    common: {
      loading: "Chargement...",
      error: "Une erreur est survenue",
      save: "Enregistrer",
      cancel: "Annuler",
      submit: "Soumettre",
      back: "Retour",
      next: "Suivant",
      search: "Rechercher",
      noResults: "Aucun résultat",
    },
    innovation: {
      investigate: "Investiguer",
      generate: "Générer",
      synthesize: "Synthétiser",
      ideas: "Idées",
      angles: "Angles",
      subject: "Sujet",
      enterSubject: "Entrez un sujet à investiguer",
      startInvestigation: "Démarrer l'Investigation",
      selectAngles: "Sélectionner les Angles",
      viewResults: "Voir les Résultats",
      exportResults: "Exporter les Résultats",
    },
    analytics: {
      dashboard: "Tableau de bord",
      pipelines: "Pipelines",
      ideasGenerated: "Idées Générées",
      successRate: "Taux de Réussite",
      avgDuration: "Durée Moyenne",
      insights: "Insights IA",
    },
  },
  zh: {
    common: {
      loading: "加载中...",
      error: "发生错误",
      save: "保存",
      cancel: "取消",
      submit: "提交",
      back: "返回",
      next: "下一步",
      search: "搜索",
      noResults: "未找到结果",
    },
    innovation: {
      investigate: "调查",
      generate: "生成",
      synthesize: "综合",
      ideas: "创意",
      angles: "角度",
      subject: "主题",
      enterSubject: "输入要调查的主题",
      startInvestigation: "开始调查",
      selectAngles: "选择角度",
      viewResults: "查看结果",
      exportResults: "导出结果",
    },
    analytics: {
      dashboard: "仪表板",
      pipelines: "管道",
      ideasGenerated: "已生成创意",
      successRate: "成功率",
      avgDuration: "平均时长",
      insights: "AI洞察",
    },
  },
};

/** Get translations for a language. */
export function getTranslations(language: SupportedLanguage): UITranslations {
  return TRANSLATIONS[language] ?? TRANSLATIONS.en;
}

/** Translate a key path (e.g., "common.loading"). */
export function t(language: SupportedLanguage, keyPath: string): string {
  const translations = getTranslations(language);
  const keys = keyPath.split(".");
  let current: unknown = translations;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return keyPath; // Fallback to key path
    }
  }
  return typeof current === "string" ? current : keyPath;
}

// ---- Cultural Context ----

export interface CulturalContext {
  language: SupportedLanguage;
  innovationStyle: string;
  communicationPreference: string;
  exampleDomains: string[];
}

const CULTURAL_CONTEXTS: Record<SupportedLanguage, CulturalContext> = {
  en: {
    language: "en",
    innovationStyle:
      "Direct and action-oriented. Focus on disruptive potential and market opportunity.",
    communicationPreference: "Concise bullet points with clear metrics",
    exampleDomains: ["Silicon Valley tech", "startup ecosystem", "venture capital"],
  },
  es: {
    language: "es",
    innovationStyle:
      "Collaborative and relationship-driven. Emphasize community impact and social innovation.",
    communicationPreference: "Narrative style with context and human impact",
    exampleDomains: ["social enterprise", "community technology", "sustainable agriculture"],
  },
  ja: {
    language: "ja",
    innovationStyle:
      "Consensus-building and incremental improvement (kaizen). Focus on quality and harmony.",
    communicationPreference: "Detailed analysis with supporting evidence",
    exampleDomains: ["manufacturing excellence", "consumer electronics", "robotics"],
  },
  de: {
    language: "de",
    innovationStyle:
      "Engineering-driven and systematic. Emphasis on precision, reliability, and Mittelstand innovation.",
    communicationPreference: "Structured with technical depth",
    exampleDomains: ["industrial automation", "automotive engineering", "renewable energy"],
  },
  pt: {
    language: "pt",
    innovationStyle:
      "Creative and adaptive. Focus on frugal innovation and emerging market solutions.",
    communicationPreference: "Engaging storytelling with practical applications",
    exampleDomains: ["fintech", "agritech", "social platforms"],
  },
  fr: {
    language: "fr",
    innovationStyle:
      "Intellectual and design-focused. Emphasis on elegance, culture, and user experience.",
    communicationPreference: "Eloquent with philosophical depth",
    exampleDomains: ["luxury tech", "culinary innovation", "sustainable fashion"],
  },
  zh: {
    language: "zh",
    innovationStyle:
      "Scale-oriented and speed-driven. Focus on ecosystem building and platform strategy.",
    communicationPreference: "Data-driven with market size emphasis",
    exampleDomains: ["e-commerce platforms", "mobile payments", "smart manufacturing"],
  },
};

/** Get cultural context for localized innovation. */
export function getCulturalContext(language: SupportedLanguage): CulturalContext {
  return CULTURAL_CONTEXTS[language] ?? CULTURAL_CONTEXTS.en;
}

/** Enhance a prompt with cultural context. */
export function culturalizePrompt(prompt: string, language: SupportedLanguage): string {
  if (language === "en") return prompt;
  const context = getCulturalContext(language);
  const langConfig = SUPPORTED_LANGUAGES[language];

  return `${prompt}

CULTURAL & LANGUAGE CONTEXT:
${langConfig.promptInstruction}
Innovation style: ${context.innovationStyle}
Communication preference: ${context.communicationPreference}
When providing examples, prefer domains relevant to the audience: ${context.exampleDomains.join(", ")}.`;
}
