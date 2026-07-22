import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as root from "@innovator/core";
import * as analytics from "@innovator/core/analytics";
import * as apiGateway from "@innovator/core/api-gateway";
import * as copilot from "@innovator/core/copilot";
import * as innovation from "@innovator/core/innovation";
import * as providers from "@innovator/core/providers";
import * as runtime from "@innovator/core/runtime";
import * as verticals from "@innovator/core/verticals";
import type {
  AnalyticsSummary as RootAnalyticsSummary,
  ApiKey as RootApiKey,
  GenerateOptions as RootGenerateOptions,
  InnovatorRuntimeOptions as RootInnovatorRuntimeOptions,
  LLMProvider as RootLLMProvider,
  PipelineProgress as RootPipelineProgress,
  VerticalPackApiOutcome as RootVerticalPackApiOutcome,
} from "@innovator/core";
import type { AnalyticsSummary } from "@innovator/core/analytics";
import type { ApiKey } from "@innovator/core/api-gateway";
import type { GenerateOptions } from "@innovator/core/copilot";
import type { PipelineProgress } from "@innovator/core/innovation";
import type { LLMProvider } from "@innovator/core/providers";
import type { InnovatorRuntimeOptions } from "@innovator/core/runtime";
import type { VerticalPackApiOutcome } from "@innovator/core/verticals";

const AUD_25_ROOT_EXPORT_EDGE_COUNT = 6_781;
const AUD_25_ROOT_EXPORT_DIGEST =
  "fc744e50f0fb6a65806fb8b6d84452f7a9a184bf16a03a2e3e1428e0c6290089";

const POST_AUDIT_ROOT_ADDITIONS = new Set([
  "type|./innovation-monitor/index.js|InnovationMonitorPersistence|InnovationMonitorPersistence",
  "type|./innovation/index.js|TextGenerator|TextGenerator",
  "type|./runtime/index.js|DefaultInnovatorRuntimeOptions|DefaultInnovatorRuntimeOptions",
  "type|./runtime/index.js|InnovatorRuntimeOptions|InnovatorRuntimeOptions",
  "type|./verticals/api-service.js|VerticalPackApiAction|VerticalPackApiAction",
  "type|./verticals/api-service.js|VerticalPackApiOutcome|VerticalPackApiOutcome",
  "type|./verticals/api-service.js|VerticalPackApiResult|VerticalPackApiResult",
  "value|./innovation-monitor/index.js|FileInnovationMonitorPersistence|FileInnovationMonitorPersistence",
  "value|./innovation-monitor/index.js|InnovationMonitorContext|InnovationMonitorContext",
  "value|./providers/index.js|ProviderRegistry|ProviderRegistry",
  "value|./rbac/scim.js|ScimContext|ScimContext",
  "value|./runtime/index.js|DEFAULT_RUNTIME_DISPOSE_TIMEOUT_MS|DEFAULT_RUNTIME_DISPOSE_TIMEOUT_MS",
  "value|./runtime/index.js|InnovatorRuntime|InnovatorRuntime",
  "value|./runtime/index.js|createDefaultInnovatorRuntime|createDefaultInnovatorRuntime",
  "value|./storage/index.js|StorageContext|StorageContext",
  "value|./verticals/api-service.js|VerticalPackApiActionSchema|VerticalPackApiActionSchema",
  "value|./verticals/api-service.js|VerticalPackApiContext|VerticalPackApiContext",
  "value|./verticals/api-service.js|createVerticalPackApiContext|createVerticalPackApiContext",
  "value|./white-label/index.js|WhiteLabelContext|WhiteLabelContext",
]);

function collectExportEdges(source: string): string[] {
  const sourceFile = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const edges: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;

    const moduleName =
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : "";

    if (!statement.exportClause) {
      edges.push(`${statement.isTypeOnly ? "type" : "value"}|${moduleName}|*|*`);
      continue;
    }

    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const specifier of statement.exportClause.elements) {
      edges.push(
        [
          statement.isTypeOnly || specifier.isTypeOnly ? "type" : "value",
          moduleName,
          specifier.propertyName?.text ?? specifier.name.text,
          specifier.name.text,
        ].join("|")
      );
    }
  }

  return edges.sort();
}

describe("@innovator/core package exports", () => {
  it("maps supported feature subpaths to built leaf barrels and declarations", () => {
    const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      exports: Record<string, { import: string; types: string }>;
    };

    for (const feature of [
      "innovation",
      "runtime",
      "copilot",
      "providers",
      "verticals",
      "analytics",
      "api-gateway",
    ]) {
      expect(packageJson.exports[`./${feature}`]).toEqual({
        import: `./dist/${feature}/index.js`,
        types: `./dist/${feature}/index.d.ts`,
      });
    }
  });

  it("loads representative values from every supported feature subpath", () => {
    expect(innovation.runAutoPipeline).toBe(root.runAutoPipeline);
    expect(runtime.createDefaultInnovatorRuntime).toBe(root.createDefaultInnovatorRuntime);
    expect(copilot.getCopilotClient).toBe(root.getCopilotClient);
    expect(providers.ProviderRegistry).toBe(root.ProviderRegistry);
    expect(verticals.createVerticalPackApiContext).toBe(root.createVerticalPackApiContext);
    expect(analytics.trackEvent).toBe(root.trackEvent);
    expect(analytics.getLeaderboard).toBe(root.getAnalyticsLeaderboard);
    expect(apiGateway.createApiKey).toBe(root.createApiKey);
  });

  it("shares API gateway singleton state between the root and feature subpath", () => {
    apiGateway.clearApiGateway();
    const key = apiGateway.createApiKey("Subpath identity");

    expect(root.getApiKey(key.id)).toBe(key);
    root.clearApiGateway();
    expect(apiGateway.getApiKey(key.id)).toBeUndefined();
  });

  it("keeps representative subpath types identical to their root counterparts", () => {
    expectTypeOf<PipelineProgress>().toEqualTypeOf<RootPipelineProgress>();
    expectTypeOf<InnovatorRuntimeOptions>().toEqualTypeOf<RootInnovatorRuntimeOptions>();
    expectTypeOf<GenerateOptions>().toEqualTypeOf<RootGenerateOptions>();
    expectTypeOf<LLMProvider>().toEqualTypeOf<RootLLMProvider>();
    expectTypeOf<VerticalPackApiOutcome>().toEqualTypeOf<RootVerticalPackApiOutcome>();
    expectTypeOf<AnalyticsSummary>().toEqualTypeOf<RootAnalyticsSummary>();
    expectTypeOf<ApiKey>().toEqualTypeOf<RootApiKey>();
  });

  it("preserves every export edge from the audited 759-declaration root barrel", () => {
    const rootIndexPath = fileURLToPath(new URL("../index.ts", import.meta.url));
    const currentEdges = collectExportEdges(readFileSync(rootIndexPath, "utf8"));
    const currentEdgeSet = new Set(currentEdges);

    for (const addition of POST_AUDIT_ROOT_ADDITIONS) {
      expect(currentEdgeSet.has(addition), `missing post-audit root export: ${addition}`).toBe(
        true
      );
    }

    const auditBaselineEdges = currentEdges.filter((edge) => !POST_AUDIT_ROOT_ADDITIONS.has(edge));
    const digest = createHash("sha256").update(auditBaselineEdges.join("\n")).digest("hex");

    expect(auditBaselineEdges).toHaveLength(AUD_25_ROOT_EXPORT_EDGE_COUNT);
    expect(digest).toBe(AUD_25_ROOT_EXPORT_DIGEST);
  });
});
