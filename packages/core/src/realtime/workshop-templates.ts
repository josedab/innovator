/**
 * @module realtime/workshop-templates
 *
 * Pre-configured workshop templates for structured collaborative innovation sessions.
 */

import { z } from "zod";

export const WorkshopTemplateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  category: z.enum(["brainstorm", "design-thinking", "lean-startup", "strategy", "retrospective"]),
  phases: z
    .array(
      z.object({
        name: z.string().max(200),
        description: z.string().max(500),
        durationMinutes: z.number().min(1).max(120),
        activities: z.array(z.string().max(200)),
      })
    )
    .max(10),
  participantRange: z.object({ min: z.number().min(1), max: z.number().max(100) }),
  totalDurationMinutes: z.number().min(5).max(480),
});
export type WorkshopTemplate = z.infer<typeof WorkshopTemplateSchema>;

/** Built-in workshop templates for common collaborative innovation formats. */
export const WORKSHOP_TEMPLATES: WorkshopTemplate[] = WorkshopTemplateSchema.array().parse([
  {
    id: "design-sprint",
    name: "Design Sprint",
    description:
      "A fast-paced workshop for mapping problems, generating solutions, deciding on a direction, and validating the strongest concept.",
    category: "design-thinking",
    phases: [
      {
        name: "Map the Challenge",
        description: "Align on the user problem, success criteria, and constraints.",
        durationMinutes: 30,
        activities: ["Review challenge", "Capture assumptions", "Map user journey"],
      },
      {
        name: "Sketch Solutions",
        description: "Individually generate solution concepts before group review.",
        durationMinutes: 40,
        activities: ["Lightning demos", "Silent sketching", "Note key differentiators"],
      },
      {
        name: "Decide",
        description: "Cluster concepts, debate trade-offs, and select the concept to advance.",
        durationMinutes: 30,
        activities: ["Heatmap voting", "Decision matrix", "Select winning concept"],
      },
      {
        name: "Storyboard",
        description: "Turn the selected concept into a concrete end-to-end flow.",
        durationMinutes: 35,
        activities: ["Define steps", "Highlight risks", "Assign prototype tasks"],
      },
      {
        name: "Validate",
        description: "Review the concept against desired outcomes and next experiments.",
        durationMinutes: 20,
        activities: ["Capture feedback", "Prioritize experiments", "Document next steps"],
      },
    ],
    participantRange: { min: 4, max: 10 },
    totalDurationMinutes: 155,
  },
  {
    id: "crazy-8s",
    name: "Crazy 8s",
    description:
      "A rapid ideation exercise that pushes participants to generate multiple distinct concepts under tight time pressure.",
    category: "design-thinking",
    phases: [
      {
        name: "Frame the Prompt",
        description: "Set the design challenge and define what a strong idea should accomplish.",
        durationMinutes: 10,
        activities: ["Share prompt", "Clarify constraints", "Review examples"],
      },
      {
        name: "Generate Eight Concepts",
        description: "Participants sketch eight different ideas in quick succession.",
        durationMinutes: 8,
        activities: ["Time-boxed sketching", "Encourage bold variations", "Capture titles"],
      },
      {
        name: "Share and Reflect",
        description: "Participants present their strongest sketches and identify recurring patterns.",
        durationMinutes: 20,
        activities: ["Rapid share-outs", "Cluster themes", "Flag novel directions"],
      },
      {
        name: "Select Follow-Ups",
        description: "Choose the concepts worth developing in the next session.",
        durationMinutes: 12,
        activities: ["Dot voting", "Discuss feasibility", "Assign owners"],
      },
    ],
    participantRange: { min: 2, max: 20 },
    totalDurationMinutes: 50,
  },
  {
    id: "scamper-workshop",
    name: "SCAMPER Workshop",
    description:
      "Use the SCAMPER prompts to systematically modify an existing concept and uncover new opportunities.",
    category: "brainstorm",
    phases: [
      {
        name: "Baseline Review",
        description: "Capture the current product, process, or idea that will be remixed.",
        durationMinutes: 15,
        activities: ["Define baseline", "List constraints", "Agree on success metrics"],
      },
      {
        name: "SCAMPER Exploration",
        description: "Work through substitute, combine, adapt, modify, put to another use, eliminate, and reverse prompts.",
        durationMinutes: 45,
        activities: ["Prompt rotation", "Collect idea cards", "Tag promising combinations"],
      },
      {
        name: "Synthesize Themes",
        description: "Group related concepts and convert prompts into actionable innovation directions.",
        durationMinutes: 20,
        activities: ["Cluster ideas", "Name themes", "Select high-potential concepts"],
      },
      {
        name: "Commit to Experiments",
        description: "Define quick experiments for the best concepts.",
        durationMinutes: 15,
        activities: ["Choose experiments", "Set owners", "Capture next milestone"],
      },
    ],
    participantRange: { min: 3, max: 15 },
    totalDurationMinutes: 95,
  },
  {
    id: "lean-canvas",
    name: "Lean Canvas",
    description:
      "Structure a startup or venture idea by collaboratively filling out the key business-model assumptions.",
    category: "lean-startup",
    phases: [
      {
        name: "Problem and Audience",
        description: "Define the customer segments and top problems worth solving.",
        durationMinutes: 25,
        activities: ["Identify segments", "Rank pains", "Capture alternatives"],
      },
      {
        name: "Solution and Value Proposition",
        description: "Articulate the proposed solution and why it is uniquely compelling.",
        durationMinutes: 25,
        activities: ["Draft solutions", "Refine UVP", "Note unfair advantages"],
      },
      {
        name: "Channels and Revenue",
        description: "Map go-to-market assumptions, acquisition paths, and monetization ideas.",
        durationMinutes: 20,
        activities: ["List channels", "Estimate pricing", "Identify key metrics"],
      },
      {
        name: "Costs and Risks",
        description: "Review the cost structure, execution risks, and highest-priority assumptions to test.",
        durationMinutes: 20,
        activities: ["Map costs", "Highlight risks", "Prioritize validation steps"],
      },
    ],
    participantRange: { min: 2, max: 12 },
    totalDurationMinutes: 90,
  },
  {
    id: "innovation-retrospective",
    name: "Innovation Retrospective",
    description:
      "A reflective workshop to review what happened in a collaborative innovation session and improve the next cycle.",
    category: "retrospective",
    phases: [
      {
        name: "Reconstruct the Session",
        description: "Summarize what happened, what was produced, and which decisions were made.",
        durationMinutes: 20,
        activities: ["Review outcomes", "Revisit timeline", "List major decisions"],
      },
      {
        name: "What Helped / Hurt",
        description: "Collect evidence on what enabled progress and what created friction.",
        durationMinutes: 20,
        activities: ["Capture wins", "Capture blockers", "Discuss participation patterns"],
      },
      {
        name: "Insights and Learnings",
        description: "Convert observations into reusable facilitation and collaboration insights.",
        durationMinutes: 15,
        activities: ["Extract themes", "Name root causes", "Document learnings"],
      },
      {
        name: "Action Plan",
        description: "Commit to concrete changes for the next innovation session.",
        durationMinutes: 15,
        activities: ["Define actions", "Assign owners", "Set follow-up date"],
      },
    ],
    participantRange: { min: 3, max: 20 },
    totalDurationMinutes: 70,
  },
]);

/** Get a workshop template by ID. */
export function getTemplate(id: string): WorkshopTemplate | undefined {
  return WORKSHOP_TEMPLATES.find((template) => template.id === id);
}

/** List all built-in workshop templates. */
export function listTemplates(): WorkshopTemplate[] {
  return [...WORKSHOP_TEMPLATES];
}

/** Return templates in a specific workshop category. */
export function getTemplatesByCategory(
  category: WorkshopTemplate["category"]
): WorkshopTemplate[] {
  return WORKSHOP_TEMPLATES.filter((template) => template.category === category);
}
