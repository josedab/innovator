import type { Investigation } from "../../types.js";
import { investigationContext } from "../investigation.js";

const ANGLE_PROMPT_SUFFIX = `

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

Respond with this exact JSON structure:
{
  "angleId": "<angle-id>",
  "angleName": "<Angle Name>",
  "ideas": [
    {
      "title": "Innovation title",
      "description": "Detailed description of the innovation",
      "potentialImpact": "What impact this could have",
      "implementationHint": "How one might begin implementing this"
    }
  ],
  "reasoning": "How this angle was applied to generate these ideas"
}

Generate 3-5 creative, specific, and actionable innovation ideas.`;

/**
 * Build a prompt that applies the SCAMPER creative-thinking method to generate innovation ideas.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildScamperPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying the SCAMPER method.

${investigationContext(subject, investigation)}

Apply each letter of SCAMPER to this subject:
- **S**ubstitute: What can be replaced with something else?
- **C**ombine: What can be merged or integrated?
- **A**dapt: What can be borrowed from other domains?
- **M**odify/Magnify: What can be enlarged, shrunk, or changed?
- **P**ut to other use: How can this be used differently?
- **E**liminate: What can be removed to simplify?
- **R**everse/Rearrange: What happens if the order or structure is flipped?

Use angleId "scamper" and angleName "SCAMPER".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies First Principles thinking to strip away assumptions and rebuild solutions from fundamentals.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildFirstPrinciplesPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying First Principles thinking.

${investigationContext(subject, investigation)}

Apply first principles thinking:
1. Identify the fundamental truths and assumptions about this subject
2. Strip away all conventions and "how it's always been done"
3. Rebuild solutions from the ground up based only on fundamentals
4. Challenge every assumption — what if the opposite were true?

Use angleId "first-principles" and angleName "First Principles".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies Cross-Domain Analogy thinking to map structures from unrelated fields onto the subject.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildCrossDomainPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying Cross-Domain Analogy thinking.

${investigationContext(subject, investigation)}

Apply cross-domain analogies:
1. Identify analogous systems in completely different fields (biology, music, architecture, sports, cooking, military, nature, etc.)
2. Map the structures, processes, or principles from those fields onto this subject
3. Generate novel ideas that wouldn't emerge from within the subject's own domain
4. Be creative — the more unexpected the analogy, the more innovative the result

Use angleId "cross-domain" and angleName "Cross-Domain Analogy".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies Constraint Injection by imposing provocative limitations to force novel solutions.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildConstraintsPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying Constraint Injection.

${investigationContext(subject, investigation)}

Apply constraint injection — impose provocative constraints and see what innovations emerge:
1. "What if the budget were $0?" — free/open solutions only
2. "What if it had to work offline / with no internet?"
3. "What if a 10-year-old had to be able to use it?"
4. "What if it had to be done in 24 hours?"
5. "What if the primary technology disappeared tomorrow?"

Each constraint should force a fundamentally different approach.

Use angleId "constraints" and angleName "Constraint Injection".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies Problem Inversion by analyzing failure modes and reversing them into innovations.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildInversionPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying Problem Inversion.

${investigationContext(subject, investigation)}

Apply problem inversion:
1. State the main goals of this subject
2. Invert each goal — "How would you make this FAIL?" or "How would you make this WORSE?"
3. Analyze each failure mode for insights
4. Reverse the failure insights into innovative solutions
5. The contrast between the inverted and original often reveals hidden innovations

Use angleId "inversion" and angleName "Problem Inversion".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies Role-Based Perspectives by viewing the subject through diverse stakeholder lenses.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildPerspectivesPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying Role-Based Perspectives.

${investigationContext(subject, investigation)}

View this subject through different stakeholder lenses:
1. **End User / Customer** — What frustrations and delights do they experience?
2. **Competitor** — How would a disruptive competitor attack this space?
3. **Child / Beginner** — What naive questions reveal hidden complexity?
4. **Historian** — What historical patterns or precedents apply?
5. **Sci-Fi Author** — What would the far-future version look like?
6. **Regulator / Ethicist** — What guardrails or principles should guide innovation?

Each perspective should produce at least one unique insight.

Use angleId "perspectives" and angleName "Role-Based Perspectives".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies What-If Scenario thinking to push ideas beyond current boundaries with provocative hypotheticals.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildWhatIfPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying What-If Scenario thinking.

${investigationContext(subject, investigation)}

Generate provocative "What If" scenarios:
1. "What if this had to scale to 1 billion users overnight?"
2. "What if the cost had to be literally zero?"
3. "What if the primary technology behind this didn't exist?"
4. "What if this were run entirely by AI with no human involvement?"
5. "What if this needed to work in a developing country with limited infrastructure?"

Each scenario should push thinking beyond current boundaries and produce genuinely novel ideas.

Use angleId "what-if" and angleName "What-If Scenarios".${ANGLE_PROMPT_SUFFIX}`;
}

/**
 * Build a prompt that applies Trend Collision thinking by colliding the subject with emerging technologies and movements.
 * @param subject - The topic to innovate on
 * @param investigation - Prior investigation context for the subject
 * @returns A formatted LLM prompt string requesting JSON-structured ideas
 */
export function buildTrendCollisionPrompt(subject: string, investigation: Investigation): string {
  return `You are an innovation expert applying Trend Collision thinking.

${investigationContext(subject, investigation)}

Collide this subject with emerging trends and technologies:
1. **AI / LLMs** — How could advanced AI transform this?
2. **Spatial Computing / AR/VR** — What if this existed in 3D space?
3. **Sustainability / Climate** — How could this become carbon-negative or regenerative?
4. **Decentralization / Web3** — What if ownership or control were distributed?
5. **Biotech / Genomics** — What biological principles or tools could apply?
6. **Edge Computing / IoT** — What if this were embedded in physical objects?

Each collision should produce a genuinely novel combination, not just "add AI to it."

Use angleId "trend-collision" and angleName "Trend Collision".${ANGLE_PROMPT_SUFFIX}`;
}
