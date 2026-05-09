import { z } from "zod";

/** A wizard step question. */
export interface WizardQuestion {
  id: string;
  step: number;
  label: string;
  description: string;
  type: "select" | "text" | "multiselect";
  options?: Array<{ value: string; label: string; description?: string }>;
  placeholder?: string;
  required: boolean;
}

/** Answers collected from the wizard. */
export interface WizardAnswers {
  goal: string;
  domain: string;
  constraints: string;
  audience: string;
  timeBudget: string;
}

/** Generated pipeline configuration from wizard answers. */
export interface GeneratedConfig {
  angles: string[];
  depth: "shallow" | "medium" | "deep";
  model: string;
  scoringRubric: string[];
  exportFormat: string;
  maxIdeasPerAngle: number;
  autoMode: boolean;
}

/** A saved template combining answers and generated config. */
export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  answers: WizardAnswers;
  config: GeneratedConfig;
  createdAt: string;
  updatedAt: string;
}

/** Zod schema for wizard answers input. */
export const WizardAnswersSchema = z.object({
  goal: z.string().min(1).max(500),
  domain: z.string().min(1).max(200),
  constraints: z.string().max(500).default(""),
  audience: z.string().min(1).max(200),
  timeBudget: z.enum(["quick", "standard", "thorough", "exhaustive"]),
});

/** Zod schema for saving a template. */
export const SaveTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  answers: WizardAnswersSchema,
  config: z.object({
    angles: z.array(z.string()),
    depth: z.enum(["shallow", "medium", "deep"]),
    model: z.string(),
    scoringRubric: z.array(z.string()),
    exportFormat: z.string(),
    maxIdeasPerAngle: z.number().min(1).max(20),
    autoMode: z.boolean(),
  }),
});
