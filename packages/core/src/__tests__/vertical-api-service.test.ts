import { describe, expect, it } from "vitest";
import {
  createVerticalPackApiContext,
  VerticalPackApiActionSchema,
} from "../verticals/api-service.js";

describe("VerticalPackApiContext", () => {
  it("seeds the route-compatible packs through the core registry", () => {
    const context = createVerticalPackApiContext();

    expect(context.execute({ action: "list" })).toEqual({
      outcome: "ok",
      payload: {
        packs: [
          expect.objectContaining({
            id: "healthcare",
            angleCount: 5,
            complianceRuleCount: 5,
            glossaryTermCount: 31,
            installed: false,
          }),
          expect.objectContaining({
            id: "fintech",
            angleCount: 5,
            complianceRuleCount: 5,
            glossaryTermCount: 31,
            installed: false,
          }),
          expect.objectContaining({
            id: "climate",
            angleCount: 5,
            complianceRuleCount: 5,
            glossaryTermCount: 32,
            installed: false,
          }),
        ],
      },
    });
  });

  it("delegates evaluation and compliance to the registry engines", () => {
    const context = createVerticalPackApiContext();

    expect(
      context.execute({
        action: "evaluate",
        ideas: ["AI-powered patient safety monitoring system with HIPAA compliance"],
        rubricId: "healthcare-innovation",
      })
    ).toMatchObject({
      outcome: "ok",
      payload: {
        evaluation: {
          rubricId: "healthcare-innovation",
          totalScore: 0.63,
          passed: false,
        },
      },
    });
    expect(
      context.execute({
        action: "compliance_check",
        ideas: ["A digital health app handling patient data"],
        packId: "healthcare",
      })
    ).toMatchObject({
      outcome: "ok",
      payload: {
        compliance: {
          packId: "healthcare",
          criticalFailures: 2,
          highFailures: 1,
        },
      },
    });
  });

  it("keeps installed-pack state isolated per context", () => {
    const first = createVerticalPackApiContext();
    const second = createVerticalPackApiContext();

    expect(first.execute({ action: "install", packId: "healthcare" }).outcome).toBe("ok");
    expect(first.execute({ action: "get", packId: "healthcare" })).toMatchObject({
      payload: { installed: true },
    });
    expect(second.execute({ action: "get", packId: "healthcare" })).toMatchObject({
      payload: { installed: false },
    });
  });

  it("retains the current action validation contract", () => {
    expect(
      VerticalPackApiActionSchema.safeParse({
        action: "community_submit",
        pack: {},
        authorName: "Author",
      }).success
    ).toBe(true);
    expect(VerticalPackApiActionSchema.safeParse({ action: "get" }).success).toBe(false);
  });
});
