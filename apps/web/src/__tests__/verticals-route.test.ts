import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/verticals/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/verticals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const response = await POST(makePost(body) as Parameters<typeof POST>[0]);
  return { response, body: await response.json() };
}

function expectKeys(value: Record<string, unknown>, keys: string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

describe("API /api/verticals characterization", () => {
  it("lists exact summaries and applies tag and search filters", async () => {
    const { response, body } = await post({ action: "list" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expectKeys(body, ["packs"]);
    expect(body.packs).toEqual([
      {
        id: "healthcare",
        name: "Healthcare & Life Sciences",
        version: "1.0.0",
        description:
          "Comprehensive innovation pack for healthcare technology, digital health, medical devices, and life sciences with regulatory guidance, clinical evaluation rubrics, and domain expertise.",
        author: "Innovator Core Team",
        angleCount: 5,
        complianceRuleCount: 5,
        glossaryTermCount: 31,
        metadata: {
          tags: [
            "healthcare",
            "healthtech",
            "digital-health",
            "medtech",
            "HIPAA",
            "FDA",
            "patient-safety",
            "telehealth",
          ],
          icon: "🏥",
          color: "#0EA5E9",
        },
        installed: false,
      },
      {
        id: "fintech",
        name: "Financial Technology",
        version: "1.0.0",
        description:
          "Comprehensive innovation pack for financial technology, payments, banking, lending, and insurance with regulatory guidance and risk evaluation rubrics.",
        author: "Innovator Core Team",
        angleCount: 5,
        complianceRuleCount: 5,
        glossaryTermCount: 31,
        metadata: {
          tags: [
            "fintech",
            "payments",
            "banking",
            "lending",
            "insurance",
            "regtech",
            "defi",
            "embedded-finance",
            "KYC",
            "AML",
          ],
          icon: "💰",
          color: "#10B981",
        },
        installed: false,
      },
      {
        id: "climate",
        name: "Climate Tech & Sustainability",
        version: "1.0.0",
        description:
          "Comprehensive innovation pack for climate technology, clean energy, circular economy, and environmental sustainability with ESG evaluation rubrics.",
        author: "Innovator Core Team",
        angleCount: 5,
        complianceRuleCount: 5,
        glossaryTermCount: 32,
        metadata: {
          tags: [
            "climate",
            "cleantech",
            "sustainability",
            "carbon",
            "renewable-energy",
            "circular-economy",
            "ESG",
            "decarbonization",
          ],
          icon: "🌍",
          color: "#22C55E",
        },
        installed: false,
      },
    ]);

    const tagged = await post({ action: "list", tag: "HEALTH" });
    expect(tagged.response.status).toBe(200);
    expect(tagged.body.packs.map((pack: { id: string }) => pack.id)).toEqual(["healthcare"]);

    const searched = await post({ action: "list", search: "financial" });
    expect(searched.response.status).toBe(200);
    expect(searched.body.packs.map((pack: { id: string }) => pack.id)).toEqual(["fintech"]);

    const empty = await post({ action: "list", tag: "healthcare", search: "no-match" });
    expect(empty.response.status).toBe(200);
    expect(empty.body).toEqual({ packs: [] });
  });

  it("gets a pack and preserves the not-found payload", async () => {
    const { response, body } = await post({ action: "get", packId: "healthcare" });

    expect(response.status).toBe(200);
    expectKeys(body, ["pack", "installed"]);
    expect(body.installed).toBe(false);
    expectKeys(body.pack, [
      "id",
      "name",
      "version",
      "description",
      "author",
      "domainAngles",
      "evaluationRubrics",
      "complianceRules",
      "glossary",
      "exampleSessions",
      "biomimicrySubset",
      "metadata",
    ]);
    expect(body.pack).toMatchObject({
      id: "healthcare",
      name: "Healthcare & Life Sciences",
      metadata: {
        tags: [
          "healthcare",
          "healthtech",
          "digital-health",
          "medtech",
          "HIPAA",
          "FDA",
          "patient-safety",
          "telehealth",
        ],
      },
    });
    expect(body.pack.domainAngles[0]).toMatchObject({
      id: "patient-safety",
      name: "Patient Safety",
      description:
        "Innovations that reduce medical errors, adverse events, and improve patient safety outcomes.",
    });

    const missing = await post({ action: "get", packId: "missing" });
    expect(missing.response.status).toBe(404);
    expect(missing.body).toEqual({ error: "Pack not found" });
  });

  it("evaluates with the current rubric heuristic and handles missing rubrics", async () => {
    const { response, body } = await post({
      action: "evaluate",
      ideas: ["AI-powered patient safety monitoring system with HIPAA compliance"],
      rubricId: "healthcare-innovation",
    });

    expect(response.status).toBe(200);
    expectKeys(body, ["evaluation"]);
    expect(body.evaluation).toEqual({
      rubricId: "healthcare-innovation",
      rubricName: "Healthcare Innovation Assessment",
      scores: [
        {
          criterion: "Patient Safety Impact",
          score: 2.5,
          weight: 0.25,
          weightedScore: 0.63,
        },
        {
          criterion: "Clinical Evidence Requirements",
          score: 0,
          weight: 0.2,
          weightedScore: 0,
        },
        {
          criterion: "HIPAA Compliance",
          score: 0,
          weight: 0.2,
          weightedScore: 0,
        },
        {
          criterion: "Implementation Feasibility",
          score: 0,
          weight: 0.15,
          weightedScore: 0,
        },
        {
          criterion: "Health Equity Impact",
          score: 0,
          weight: 0.1,
          weightedScore: 0,
        },
        {
          criterion: "Cost-Effectiveness",
          score: 0,
          weight: 0.1,
          weightedScore: 0,
        },
      ],
      totalScore: 0.63,
      passed: false,
      passingScore: 6,
    });

    const missing = await post({
      action: "evaluate",
      ideas: ["Some idea"],
      rubricId: "missing-rubric",
    });
    expect(missing.response.status).toBe(404);
    expect(missing.body).toEqual({ error: "Rubric not found" });
  });

  it("checks compliance with the current engine and handles missing packs", async () => {
    const { response, body } = await post({
      action: "compliance_check",
      ideas: ["A digital health app handling patient data"],
      packId: "healthcare",
    });

    expect(response.status).toBe(200);
    expectKeys(body, ["compliance"]);
    expect(body.compliance).toEqual({
      packId: "healthcare",
      results: [
        {
          ruleId: "hipaa-phi",
          ruleName: "HIPAA PHI Handling",
          regulation: "HIPAA Privacy Rule (45 CFR §164.500-534)",
          severity: "critical",
          passed: false,
          message:
            "Ideas may not adequately address HIPAA PHI Handling (HIPAA Privacy Rule (45 CFR §164.500-534))",
        },
        {
          ruleId: "fda-device-class",
          ruleName: "FDA Device Classification",
          regulation: "FDA 21 CFR Part 820",
          severity: "critical",
          passed: false,
          message:
            "Ideas may not adequately address FDA Device Classification (FDA 21 CFR Part 820)",
        },
        {
          ruleId: "clinical-trial-req",
          ruleName: "Clinical Trial Requirements",
          regulation: "FDA 21 CFR Parts 50, 56, 312",
          severity: "high",
          passed: false,
          message:
            "Ideas may not adequately address Clinical Trial Requirements (FDA 21 CFR Parts 50, 56, 312)",
        },
        {
          ruleId: "patient-consent",
          ruleName: "Patient Consent Requirements",
          regulation: "HIPAA Authorization (45 CFR §164.508)",
          severity: "high",
          passed: true,
          message: "Ideas appear to address Patient Consent Requirements",
        },
        {
          ruleId: "data-retention",
          ruleName: "Data Retention Policies",
          regulation: "HIPAA (45 CFR §164.530(j))",
          severity: "medium",
          passed: false,
          message:
            "Ideas may not adequately address Data Retention Policies (HIPAA (45 CFR §164.530(j)))",
        },
      ],
      overallPassed: false,
      criticalFailures: 2,
      highFailures: 1,
    });

    const missing = await post({
      action: "compliance_check",
      ideas: ["Some idea"],
      packId: "missing",
    });
    expect(missing.response.status).toBe(404);
    expect(missing.body).toEqual({ error: "Pack not found" });
  });

  it("returns the current glossary payload and handles missing packs", async () => {
    const { response, body } = await post({ action: "glossary", packId: "healthcare" });

    expect(response.status).toBe(200);
    expectKeys(body, ["packId", "glossary", "termCount"]);
    expect(body.packId).toBe("healthcare");
    expect(body.termCount).toBe(31);
    expect(Object.keys(body.glossary)).toEqual([
      "PHI",
      "EHR",
      "FHIR",
      "ICD-10",
      "CPT",
      "SaMD",
      "DTx",
      "RPM",
      "SDOH",
      "HIPAA",
      "HL7",
      "HCAHPS",
      "QALY",
      "NPI",
      "BAA",
      "FDA 510(k)",
      "De Novo",
      "PMA",
      "GCP",
      "IRB",
      "RWE",
      "CDS",
      "SMART",
      "HIE",
      "ACO",
      "VBC",
      "EMR",
      "RTM",
      "PHR",
      "CDI",
      "UDI",
    ]);
    expect(body.glossary.PHI).toBe(
      "Protected Health Information — individually identifiable health information covered by HIPAA"
    );

    const missing = await post({ action: "glossary", packId: "missing" });
    expect(missing.response.status).toBe(404);
    expect(missing.body).toEqual({ error: "Pack not found" });
  });

  it("installs idempotently and exposes installed state in list and get", async () => {
    const first = await post({ action: "install", packId: "healthcare" });
    expect(first.response.status).toBe(200);
    expect(first.body).toEqual({
      installed: true,
      packId: "healthcare",
      packName: "Healthcare & Life Sciences",
    });

    const repeated = await post({ action: "install", packId: "healthcare" });
    expect(repeated.response.status).toBe(200);
    expect(repeated.body).toEqual(first.body);

    const listed = await post({ action: "list" });
    expect(listed.body.packs).toHaveLength(3);
    expect(
      listed.body.packs.find((pack: { id: string }) => pack.id === "healthcare").installed
    ).toBe(true);

    const fetched = await post({ action: "get", packId: "healthcare" });
    expect(fetched.body.installed).toBe(true);

    const missing = await post({ action: "install", packId: "missing" });
    expect(missing.response.status).toBe(404);
    expect(missing.body).toEqual({ error: "Pack not found" });
  });

  it("accepts and rejects community submissions with the current payloads", async () => {
    const accepted = await post({
      action: "community_submit",
      pack: {
        id: "test-pack",
        name: "Test Pack",
        domainAngles: [{ id: "a1", name: "Angle 1" }],
        glossary: { term: "definition" },
      },
      authorName: "Test Author",
      authorEmail: "author@example.com",
      notes: "Review this pack",
    });

    expect(accepted.response.status).toBe(201);
    expect(accepted.body).toEqual({
      submitted: true,
      message: "Community pack submitted for review",
      authorName: "Test Author",
    });

    const rejected = await post({
      action: "community_submit",
      pack: { domainAngles: [], glossary: {} },
      authorName: "Author",
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: "Pack validation failed",
      details: [
        "Pack must have a string id",
        "Pack must have a string name",
        "Pack must include at least one domain angle",
        "Pack must include at least one glossary term",
      ],
    });
  });

  it("preserves malformed, null JSON, and schema error responses", async () => {
    const malformedRequest = new Request("http://localhost/api/verticals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const malformed = await POST(malformedRequest as Parameters<typeof POST>[0]);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid JSON" });

    const nullJson = await post(null);
    expect(nullJson.response.status).toBe(400);
    expect(nullJson.body).toEqual({ error: "Invalid JSON" });

    const missingField = await post({ action: "get" });
    expect(missingField.response.status).toBe(400);
    expect(missingField.body).toEqual({
      error: "Invalid request",
      details: {
        formErrors: [],
        fieldErrors: { packId: ["Required"] },
      },
    });

    const unknownAction = await post({ action: "unknown_action" });
    expect(unknownAction.response.status).toBe(400);
    expectKeys(unknownAction.body, ["error", "details"]);
    expect(unknownAction.body.error).toBe("Invalid request");
    expectKeys(unknownAction.body.details, ["formErrors", "fieldErrors"]);
  });

  it("seeds once per route module and keeps installed state module-local", async () => {
    const firstList = await post({ action: "list" });
    const secondList = await post({ action: "list" });
    expect(firstList.body).toEqual(secondList.body);
    expect(firstList.body.packs.map((pack: { id: string }) => pack.id)).toEqual([
      "healthcare",
      "fintech",
      "climate",
    ]);

    await post({ action: "install", packId: "climate" });
    const installedList = await post({ action: "list" });
    expect(
      installedList.body.packs.find((pack: { id: string }) => pack.id === "climate").installed
    ).toBe(true);
  });
});
