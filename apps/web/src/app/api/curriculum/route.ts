/**
 * @description Innovation learning curriculum and skill tracking.
 */
export const runtime = "nodejs";

import {
  generateLearningPath,
  getLearningPath,
  getUserLearningPaths,
  getLearningModule,
  startModule,
  completeModule,
  getLearnerProfile,
  getWeakestSkills,
  generateCertificate,
  getUserCertificates,
  INNOVATION_SKILLS,
  DIFFICULTY_LEVELS,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const GeneratePathSchema = z.object({
  action: z.literal("generate-path"),
  userId: z.string().min(1).max(200),
  skills: z.array(z.enum(INNOVATION_SKILLS)).min(1).max(15),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  maxModules: z.number().int().min(1).max(30).optional(),
  model: z.string().optional(),
});

const StartModuleSchema = z.object({
  action: z.literal("start-module"),
  userId: z.string().min(1).max(200),
  moduleId: z.string().min(1).max(100),
});

const CompleteModuleSchema = z.object({
  action: z.literal("complete-module"),
  userId: z.string().min(1).max(200),
  moduleId: z.string().min(1).max(100),
  quizScore: z.number().min(0).max(100),
  timeSpentMinutes: z.number().min(0).max(10000),
});

const CertificateSchema = z.object({
  action: z.literal("certificate"),
  userId: z.string().min(1).max(200),
  pathId: z.string().min(1).max(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  GeneratePathSchema,
  StartModuleSchema,
  CompleteModuleSchema,
  CertificateSchema,
]);

/**
 * Innovation curriculum — generate learning paths, track progress, issue certificates.
 *
 * @route POST /api/curriculum
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid curriculum request", {
        route: "/api/curriculum",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;

    switch (data.action) {
      case "generate-path": {
        const modelError = validateModel(data.model);
        if (modelError) return modelError;
        const path = await generateLearningPath(data.userId, data.skills, {
          difficulty: data.difficulty,
          maxModules: data.maxModules,
          model: data.model,
          signal: request.signal,
        });
        logger.info("Learning path generated", {
          route: "/api/curriculum",
          requestId,
          userId: data.userId,
          modules: path.modules.length,
          durationMs: Date.now() - startTime,
        });
        return Response.json(path, { headers: API_RESPONSE_HEADERS });
      }
      case "start-module": {
        const progress = startModule(data.userId, data.moduleId);
        return Response.json(progress, { headers: API_RESPONSE_HEADERS });
      }
      case "complete-module": {
        const progress = completeModule(
          data.userId,
          data.moduleId,
          data.quizScore,
          data.timeSpentMinutes
        );
        return Response.json(progress, { headers: API_RESPONSE_HEADERS });
      }
      case "certificate": {
        const cert = generateCertificate(data.userId, data.pathId);
        if (!cert) {
          return new Response(
            JSON.stringify({
              error: "Cannot generate certificate. Path not found or modules incomplete.",
            }),
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json(cert, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Curriculum error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/curriculum",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Curriculum operation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * Get learning profile, paths, modules, or certificates.
 *
 * @route GET /api/curriculum?userId=u1 or GET /api/curriculum?moduleId=m1
 *        or GET /api/curriculum?userId=u1&paths=true or GET /api/curriculum?userId=u1&certificates=true
 *        or GET /api/curriculum?userId=u1&weakSkills=3
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const moduleId = searchParams.get("moduleId");
    const pathId = searchParams.get("pathId");
    const paths = searchParams.get("paths");
    const certificates = searchParams.get("certificates");
    const weakSkills = searchParams.get("weakSkills");

    if (moduleId) {
      const mod = getLearningModule(moduleId);
      if (!mod) {
        return new Response(JSON.stringify({ error: "Module not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      return Response.json(mod, { headers: API_RESPONSE_HEADERS });
    }

    if (pathId) {
      const path = getLearningPath(pathId);
      if (!path) {
        return new Response(JSON.stringify({ error: "Path not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      return Response.json(path, { headers: API_RESPONSE_HEADERS });
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Provide 'userId', 'moduleId', or 'pathId' parameter" }),
        {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        }
      );
    }

    if (certificates === "true") {
      return Response.json(getUserCertificates(userId), { headers: API_RESPONSE_HEADERS });
    }

    if (paths === "true") {
      return Response.json(getUserLearningPaths(userId), { headers: API_RESPONSE_HEADERS });
    }

    if (weakSkills) {
      return Response.json(getWeakestSkills(userId, parseInt(weakSkills) || 3), {
        headers: API_RESPONSE_HEADERS,
      });
    }

    return Response.json(getLearnerProfile(userId), { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Curriculum GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve curriculum data." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
