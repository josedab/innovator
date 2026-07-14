import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "../../providers/index.js";
import { ProviderRegistry, registerProvider, clearProviders } from "../../providers/index.js";
import { ScimContext, clearScimData, scimCreateUser } from "../../rbac/scim.js";
import { InMemoryStorageProvider } from "../../storage/memory.js";
import { StorageContext, getStorage, setStorage } from "../../storage/index.js";
import {
  InnovationMonitorContext,
  addMonitorSource,
  clearMonitorData,
} from "../../innovation-monitor/index.js";
import type {
  InnovationMonitorPersistence,
  MonitorSource,
  MonitorState,
  OpportunitySignal,
} from "../../innovation-monitor/index.js";
import {
  BrandingConfigSchema,
  FeatureTogglesSchema,
  TenantConfigSchema,
  WhiteLabelContext,
  clearWhiteLabelData,
  registerTenant,
} from "../../white-label/index.js";
import { InnovatorRuntime, createDefaultInnovatorRuntime } from "../index.js";

function makeProvider(id: string): LLMProvider {
  return {
    id,
    name: id,
    generateText: vi.fn().mockResolvedValue(""),
    generateStream: vi.fn().mockResolvedValue(""),
    listModels: vi.fn().mockResolvedValue([]),
  };
}

function makeSource(id: string): MonitorSource {
  return {
    id,
    type: "market",
    name: id,
    config: {},
    enabled: true,
    pollIntervalMs: 60_000,
  };
}

function createMemoryPersistence(): InnovationMonitorPersistence {
  let signals: OpportunitySignal[] = [];
  let state: MonitorState = { status: "idle", signalCount: 0, digestCount: 0 };
  return {
    loadSignals: () => [...signals],
    saveSignals: (next) => {
      signals = [...next];
    },
    loadState: () => ({ ...state }),
    saveState: (next) => {
      state = { ...next };
    },
  };
}

function makeTenant(tenantId: string) {
  return TenantConfigSchema.parse({
    tenantId,
    organizationName: tenantId,
    branding: BrandingConfigSchema.parse({}),
    features: FeatureTogglesSchema.parse({}),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("InnovatorRuntime", () => {
  it("keeps two explicit runtime contexts isolated", () => {
    const first = new InnovatorRuntime({
      monitorContext: new InnovationMonitorContext(createMemoryPersistence()),
      copilotCleanup: vi.fn().mockResolvedValue(undefined),
    });
    const second = new InnovatorRuntime({
      monitorContext: new InnovationMonitorContext(createMemoryPersistence()),
      copilotCleanup: vi.fn().mockResolvedValue(undefined),
    });

    const provider = makeProvider("first");
    first.providers.registerProvider(provider);
    first.storage.setStorage(new InMemoryStorageProvider());
    first.whiteLabel.registerTenant(makeTenant("first"));
    const user = first.scim.scimCreateUser({
      userName: "first",
      displayName: "First",
      emails: [{ value: "first@example.com" }],
    });
    first.scim.setScimToken("first-token");
    first.monitor.addMonitorSource(makeSource("first"));

    expect(second.providers.getProvider("first")).toBeUndefined();
    expect(second.storage.getStorage()).not.toBe(first.storage.getStorage());
    expect(second.whiteLabel.getTenantConfig("first")).toBeUndefined();
    expect(second.scim.scimGetUser(user.id)).toBeUndefined();
    expect(second.scim.validateScimToken("first-token")).toBe(false);
    expect(second.monitor.listMonitorSources()).toEqual([]);
  });

  it("wraps the existing compatibility singleton contexts", () => {
    clearProviders();
    clearWhiteLabelData();
    clearScimData();
    clearMonitorData();

    const runtime = createDefaultInnovatorRuntime({
      copilotCleanup: vi.fn().mockResolvedValue(undefined),
    });
    const provider = makeProvider("compat");
    const storage = new InMemoryStorageProvider();
    const tenant = makeTenant("compat");

    registerProvider(provider);
    setStorage(storage);
    registerTenant(tenant);
    const user = scimCreateUser({
      userName: "compat",
      displayName: "Compat",
      emails: [{ value: "compat@example.com" }],
    });
    addMonitorSource(makeSource("compat"));

    expect(runtime.providers.getProvider("compat")).toBe(provider);
    expect(runtime.storage.getStorage()).toBe(getStorage());
    expect(runtime.whiteLabel.getTenantConfig("compat")).toBe(tenant);
    expect(runtime.scim.scimGetUser(user.id)).toBe(user);
    expect(runtime.monitor.listMonitorSources()).toEqual([makeSource("compat")]);
  });

  it("disposes storage, monitor timers, and Copilot cleanup exactly once", async () => {
    vi.useFakeTimers();
    try {
      const provider = new InMemoryStorageProvider();
      const close = vi.spyOn(provider, "close");
      const storage = new StorageContext(provider);
      await storage.initializeStorage();

      const monitor = new InnovationMonitorContext(createMemoryPersistence());
      monitor.startMonitor({
        sources: [makeSource("one"), makeSource("two")],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      const monitorDispose = vi.spyOn(monitor, "dispose");
      const copilotCleanup = vi.fn().mockResolvedValue(undefined);
      const runtime = new InnovatorRuntime({
        storageContext: storage,
        monitorContext: monitor,
        copilotCleanup,
      });

      expect(vi.getTimerCount()).toBe(2);
      await Promise.all([runtime.dispose(), runtime.dispose()]);

      expect(monitorDispose).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(copilotCleanup).toHaveBeenCalledOnce();
      expect(monitor.getMonitorState().status).toBe("idle");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds disposal with the shared timeout utility", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new InnovatorRuntime({
        monitorContext: new InnovationMonitorContext(createMemoryPersistence()),
        copilotCleanup: () => new Promise<void>(() => {}),
        disposeTimeoutMs: 25,
      });

      const disposal = runtime.dispose();
      const rejection = expect(disposal).rejects.toMatchObject({
        name: "LlmTimeoutError",
      });
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(runtime.dispose()).toBe(disposal);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("instance-owned facilities", () => {
  it("allow direct provider, storage, white-label, and SCIM contexts", () => {
    const providers = new ProviderRegistry();
    const storage = new StorageContext();
    const whiteLabel = new WhiteLabelContext();
    const scim = new ScimContext();

    providers.registerProvider(makeProvider("direct"));
    whiteLabel.registerTenant(makeTenant("direct"));
    scim.setScimToken("direct-token");

    expect(providers.getActiveProvider().id).toBe("copilot");
    expect(providers.getProvider("direct")?.id).toBe("direct");
    expect(storage.getStorage().name).toBe("memory");
    expect(whiteLabel.resolveTenant({ tenantHeader: "direct" })?.tenantId).toBe("direct");
    expect(scim.validateScimToken("direct-token")).toBe(true);
  });
});
