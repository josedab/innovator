/**
 * @module output-modes
 *
 * Audience-adaptive output mode definitions and prompt templates.
 * Each mode transforms synthesis results into audience-specific formats.
 */

import { z } from "zod";

/** All recognized output mode identifiers. */
export const OUTPUT_MODES = [
  "executive",
  "technical",
  "pitch",
  "research",
] as const;

export const OutputModeSchema = z.enum(OUTPUT_MODES);
export type OutputMode = z.infer<typeof OutputModeSchema>;

/** Metadata for a single output mode. */
export interface OutputModeDefinition {
  id: OutputMode;
  name: string;
  audience: string;
  description: string;
  icon: string;
}

/** All available output mode definitions. */
export const OUTPUT_MODE_DEFINITIONS: OutputModeDefinition[] = [
  {
    id: "executive",
    name: "Executive Summary",
    audience: "C-suite / Leadership",
    description: "High-level strategic overview with ROI focus and decision points",
    icon: "📊",
  },
  {
    id: "technical",
    name: "Technical Specification",
    audience: "Engineers / Developers",
    description: "Detailed technical spec with architecture decisions and implementation roadmap",
    icon: "⚙️",
  },
  {
    id: "pitch",
    name: "Pitch Deck Outline",
    audience: "Founders / Investors",
    description: "Compelling narrative with market opportunity, traction potential, and ask",
    icon: "🎯",
  },
  {
    id: "research",
    name: "Research Brief",
    audience: "Academics / Researchers",
    description: "Structured analysis with methodology, findings, and future work directions",
    icon: "📚",
  },
];

/** Get an output mode definition by ID. */
export function getOutputMode(id: string): OutputModeDefinition | undefined {
  return OUTPUT_MODE_DEFINITIONS.find((m) => m.id === id);
}

// ---- Per-mode Prompt Templates ----

export function buildExecutivePrompt(synthesisJson: string, subject: string): string {
  return `You are a senior strategy consultant preparing a briefing for C-suite executives.

SUBJECT: ${subject}

INNOVATION SYNTHESIS:
"""
${synthesisJson}
"""

Transform the above innovation synthesis into an executive summary. Focus on:
- Strategic implications and market opportunity size
- Top 3-5 highest-impact initiatives with ROI estimates
- Resource requirements and timeline
- Risk assessment and mitigation strategies
- Clear decision points and recommended next steps

Format as a professional executive briefing. Use bullet points, keep language concise and business-focused.
You MUST respond with valid JSON only:
{
  "title": "Executive briefing title",
  "summary": "2-3 sentence strategic overview",
  "keyInitiatives": [
    { "title": "Initiative name", "impact": "Expected impact", "investment": "Resource estimate", "timeline": "Timeframe", "risk": "low|medium|high" }
  ],
  "strategicRecommendation": "Overall strategic recommendation",
  "decisionPoints": ["Decision 1", "Decision 2"],
  "riskFactors": ["Risk 1", "Risk 2"]
}`;
}

export function buildTechnicalPrompt(synthesisJson: string, subject: string): string {
  return `You are a senior software architect preparing a technical specification document.

SUBJECT: ${subject}

INNOVATION SYNTHESIS:
"""
${synthesisJson}
"""

Transform the above innovation synthesis into a technical specification. Focus on:
- System architecture and component design
- Technology stack recommendations with justification
- API design and data models
- Implementation phases with milestones
- Technical risks and mitigation approaches
- Performance requirements and scalability considerations

You MUST respond with valid JSON only:
{
  "title": "Technical spec title",
  "overview": "Technical overview paragraph",
  "architecture": {
    "components": [{ "name": "Component", "purpose": "Purpose", "technology": "Tech stack" }],
    "dataFlow": "How data flows through the system"
  },
  "implementationPhases": [
    { "phase": "Phase name", "deliverables": ["Deliverable 1"], "duration": "Estimated duration", "dependencies": ["Dependency"] }
  ],
  "technicalRisks": [{ "risk": "Risk description", "mitigation": "Mitigation strategy", "severity": "low|medium|high" }],
  "performanceRequirements": ["Requirement 1"]
}`;
}

export function buildPitchPrompt(synthesisJson: string, subject: string): string {
  return `You are an experienced startup advisor helping craft a compelling pitch deck outline.

SUBJECT: ${subject}

INNOVATION SYNTHESIS:
"""
${synthesisJson}
"""

Transform the above innovation synthesis into a pitch deck outline. Focus on:
- Problem statement that resonates emotionally
- Solution with clear value proposition
- Market size (TAM/SAM/SOM estimates)
- Business model and revenue potential
- Competitive advantage and moat
- Traction potential and go-to-market strategy
- Team requirements and ask

You MUST respond with valid JSON only:
{
  "title": "Pitch deck title",
  "slides": [
    { "title": "Slide title", "content": "Key points for this slide", "speakerNotes": "What to say" }
  ],
  "elevatorPitch": "30-second elevator pitch",
  "marketSize": { "tam": "Total addressable market", "sam": "Serviceable addressable market", "som": "Serviceable obtainable market" },
  "competitiveAdvantage": "Why this wins",
  "ask": "What you need (funding, partnerships, etc.)"
}`;
}

export function buildResearchPrompt(synthesisJson: string, subject: string): string {
  return `You are an academic researcher preparing a structured research brief.

SUBJECT: ${subject}

INNOVATION SYNTHESIS:
"""
${synthesisJson}
"""

Transform the above innovation synthesis into a research brief. Focus on:
- Research question and hypothesis
- Methodology and analytical framework used
- Key findings with supporting evidence
- Theoretical implications and contributions
- Limitations and validity considerations
- Future research directions and open questions

You MUST respond with valid JSON only:
{
  "title": "Research brief title",
  "abstract": "Brief abstract (150-250 words)",
  "researchQuestions": ["RQ1", "RQ2"],
  "methodology": "Description of analytical approach",
  "keyFindings": [{ "finding": "Finding description", "evidence": "Supporting evidence", "significance": "Why this matters" }],
  "theoreticalImplications": ["Implication 1"],
  "limitations": ["Limitation 1"],
  "futureWork": ["Direction 1", "Direction 2"],
  "references": ["Relevant reference or framework"]
}`;
}

/** Map of output mode IDs to their prompt builders. */
export const OUTPUT_MODE_PROMPTS: Record<OutputMode, (synthesisJson: string, subject: string) => string> = {
  executive: buildExecutivePrompt,
  technical: buildTechnicalPrompt,
  pitch: buildPitchPrompt,
  research: buildResearchPrompt,
};
