import { investigate, generateForAngle, runAutoPipeline } from "@innovator/core";
import type { AngleId, PipelineProgress } from "@innovator/core";
import { InvestigateInputSchema, GenerateInputSchema, AutoPipelineInputSchema } from "./schemas.js";

export async function handleInvestigate(args: unknown): Promise<string> {
  const input = InvestigateInputSchema.parse(args);
  const result = await investigate(input.subject, input.model);
  return JSON.stringify(result, null, 2);
}

export async function handleGenerate(args: unknown): Promise<string> {
  const input = GenerateInputSchema.parse(args);
  const result = await generateForAngle(
    input.subject,
    input.investigation,
    input.angleId as AngleId,
    input.model
  );
  return JSON.stringify(result, null, 2);
}

export async function handleAutoPipeline(args: unknown): Promise<string> {
  const input = AutoPipelineInputSchema.parse(args);
  const progressUpdates: PipelineProgress[] = [];

  const result = await runAutoPipeline(
    input.subject,
    (progress) => {
      progressUpdates.push({ ...progress });
    },
    input.model,
    input.angles as AngleId[] | undefined
  );

  return JSON.stringify(
    {
      finalResult: result,
      progressLog: progressUpdates.map((p) => ({
        stage: p.stage,
        completedAngles: p.completedAngles,
        totalAngles: p.totalAngles,
      })),
    },
    null,
    2
  );
}
