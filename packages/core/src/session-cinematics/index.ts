/**
 * @module session-cinematics
 *
 * Innovation Session Cinematics: auto-generates narrated video walkthrough
 * scripts from innovation sessions. Produces structured scripts with scene
 * descriptions, voiceover text, visual annotations, and timing data that can
 * be rendered by video engines (Remotion, Canvas/WebGL) or exported as
 * storyboards.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import type { Investigation, AngleResult, Synthesis } from "../types.js";

// ---- Schemas ----

/** Schema for a visual element in a scene. */
export const VisualElementSchema = z.object({
  type: z.enum(["idea-card", "score-chart", "comparison-table", "word-cloud", "flow-diagram", "highlight-text", "transition"]),
  content: z.string().max(2000),
  position: z.enum(["center", "left", "right", "fullscreen", "overlay"]),
  animation: z.enum(["fade-in", "slide-left", "slide-right", "zoom-in", "pop", "none"]).default("fade-in"),
  durationMs: z.number().min(500).max(30000),
});

/** Schema for a scene in the cinematic script. */
export const SceneSchema = z.object({
  id: z.string().max(100),
  order: z.number().min(1),
  title: z.string().max(200),
  voiceover: z.string().max(2000),
  visuals: z.array(VisualElementSchema).max(10),
  backgroundMood: z.enum(["intro", "energetic", "contemplative", "dramatic", "triumphant", "calm"]),
  durationMs: z.number().min(1000).max(60000),
  notes: z.string().max(500).optional(),
});

/** Schema for the full cinematic script. */
export const CinematicScriptSchema = z.object({
  title: z.string().max(300),
  subject: z.string().max(500),
  totalDurationMs: z.number().min(0),
  scenes: z.array(SceneSchema).max(30),
  metadata: z.object({
    ideaCount: z.number().min(0),
    angleCount: z.number().min(0),
    hasScoring: z.boolean(),
    hasSynthesis: z.boolean(),
  }),
  generatedAt: z.string(),
});

/** Schema for an export configuration. */
export const ExportConfigSchema = z.object({
  format: z.enum(["storyboard-md", "remotion-json", "srt-subtitles"]),
  resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  fps: z.number().min(24).max(60).default(30),
  voiceStyle: z.enum(["professional", "casual", "energetic", "calm"]).default("professional"),
});

// ---- Types ----

export type VisualElement = z.infer<typeof VisualElementSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type CinematicScript = z.infer<typeof CinematicScriptSchema>;
export type ExportConfig = z.infer<typeof ExportConfigSchema>;

// ---- In-memory store ----

const scripts: Map<string, CinematicScript> = new Map();

// ---- Session data types ----

export interface SessionData {
  subject: string;
  investigation?: Investigation;
  angleResults?: AngleResult[];
  synthesis?: Synthesis;
  scores?: Array<{ title: string; feasibility: number; impact: number; novelty: number }>;
}

// ---- Script generation ----

function buildScriptPrompt(session: SessionData): string {
  const ideas = session.angleResults?.flatMap((ar) => ar.ideas) ?? [];
  const topIdeas = session.synthesis?.topIdeas ?? ideas.slice(0, 5);

  return `You are a creative director producing a narrated video walkthrough of an innovation session.

Session subject: ${sanitizeUserInput(session.subject)}
${session.investigation ? `Investigation summary: ${sanitizeUserInput(session.investigation.summary)}` : ""}
Number of angles explored: ${session.angleResults?.length ?? 0}
Total ideas generated: ${ideas.length}
${session.synthesis ? `Synthesis recommendation: ${sanitizeUserInput(session.synthesis.recommendation)}` : ""}
Top ideas: ${topIdeas.map((i) => i.title).join(", ")}
${session.scores ? `Scores available: yes` : "Scores available: no"}

Create a cinematic script. Respond with JSON:
{
  "title": "video title",
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "title": "scene title",
      "voiceover": "narration text for this scene",
      "visuals": [
        {
          "type": "idea-card|score-chart|comparison-table|word-cloud|flow-diagram|highlight-text|transition",
          "content": "visual content description or data",
          "position": "center|left|right|fullscreen|overlay",
          "animation": "fade-in|slide-left|slide-right|zoom-in|pop|none",
          "durationMs": 3000
        }
      ],
      "backgroundMood": "intro|energetic|contemplative|dramatic|triumphant|calm",
      "durationMs": 8000
    }
  ]
}

Create 8-15 scenes covering:
1. Opening/intro with subject context
2. Investigation findings (challenges, opportunities)
3. Angle exploration highlights (2-3 key angles)
4. Top ideas showcase with visual cards
5. Scoring/comparison if available
6. Synthesis and recommendations
7. Closing with next steps

Each scene should have compelling voiceover narration and 1-3 visual elements. Total duration: 2-5 minutes.`;
}

/** Options for script generation. */
export interface GenerateScriptOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Generate a cinematic script from session data.
 */
export async function generateCinematicScript(
  session: SessionData,
  options: GenerateScriptOptions = {}
): Promise<CinematicScript> {
  if (!session.subject || session.subject.trim().length === 0) {
    throw new Error("Session subject is required");
  }

  const prompt = buildScriptPrompt(session);
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new Error(`Failed to parse cinematic script: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal: options.signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const scenes = z.array(SceneSchema).max(30).parse(parsed.scenes ?? []);
  const totalDurationMs = scenes.reduce((sum, s) => sum + s.durationMs, 0);

  const ideas = session.angleResults?.flatMap((ar) => ar.ideas) ?? [];

  const script: CinematicScript = {
    title: (parsed.title as string) ?? `Innovation Session: ${session.subject}`,
    subject: session.subject,
    totalDurationMs,
    scenes,
    metadata: {
      ideaCount: ideas.length,
      angleCount: session.angleResults?.length ?? 0,
      hasScoring: !!session.scores && session.scores.length > 0,
      hasSynthesis: !!session.synthesis,
    },
    generatedAt: new Date().toISOString(),
  };

  const id = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  scripts.set(id, script);

  return script;
}

/**
 * Get a stored script by ID.
 */
export function getCinematicScript(id: string): CinematicScript | undefined {
  return scripts.get(id);
}

/**
 * List all stored scripts.
 */
export function listCinematicScripts(): Array<{ id: string; title: string; generatedAt: string }> {
  return Array.from(scripts.entries()).map(([id, s]) => ({
    id,
    title: s.title,
    generatedAt: s.generatedAt,
  }));
}

/**
 * Clear all stored scripts.
 */
export function clearCinematicScripts(): void {
  scripts.clear();
}

/**
 * Export a script as a Markdown storyboard.
 */
export function scriptToStoryboard(script: CinematicScript): string {
  const lines: string[] = [];
  const totalMinutes = Math.ceil(script.totalDurationMs / 60000);

  lines.push(`# 🎬 ${script.title}\n`);
  lines.push(`*Subject: ${script.subject}*`);
  lines.push(`*Duration: ~${totalMinutes} min | ${script.scenes.length} scenes*`);
  lines.push(`*Generated: ${script.generatedAt}*\n`);
  lines.push(`---\n`);

  for (const scene of script.scenes) {
    const secs = Math.ceil(scene.durationMs / 1000);
    lines.push(`## Scene ${scene.order}: ${scene.title} (${secs}s, ${scene.backgroundMood})\n`);
    lines.push(`**🎙️ Voiceover:**`);
    lines.push(`> ${scene.voiceover}\n`);

    if (scene.visuals.length > 0) {
      lines.push(`**🎨 Visuals:**`);
      for (const v of scene.visuals) {
        lines.push(`- [${v.type}] ${v.content} *(${v.position}, ${v.animation}, ${v.durationMs}ms)*`);
      }
    }

    if (scene.notes) lines.push(`\n*Notes: ${scene.notes}*`);
    lines.push(`\n---\n`);
  }

  return lines.join("\n");
}

/**
 * Export a script as SRT subtitles.
 */
export function scriptToSrt(script: CinematicScript): string {
  const lines: string[] = [];
  let currentMs = 0;

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const startMs = currentMs;
    const endMs = currentMs + scene.durationMs;

    lines.push(`${i + 1}`);
    lines.push(`${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`);
    lines.push(scene.voiceover);
    lines.push("");

    currentMs = endMs;
  }

  return lines.join("\n");
}

function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

/**
 * Export a script as Remotion-compatible JSON configuration.
 */
export function scriptToRemotionConfig(script: CinematicScript): object {
  return {
    durationInFrames: Math.ceil(script.totalDurationMs / (1000 / 30)),
    fps: 30,
    width: 1920,
    height: 1080,
    sequences: script.scenes.map((scene) => ({
      id: scene.id,
      from: 0,
      durationInFrames: Math.ceil(scene.durationMs / (1000 / 30)),
      voiceover: scene.voiceover,
      mood: scene.backgroundMood,
      elements: scene.visuals.map((v) => ({
        type: v.type,
        content: v.content,
        position: v.position,
        animation: v.animation,
        durationInFrames: Math.ceil(v.durationMs / (1000 / 30)),
      })),
    })),
  };
}
