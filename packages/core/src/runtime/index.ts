import { stopCopilotClient } from "../copilot/client.js";
import { withTimeout } from "../copilot/timeout.js";
import { ProviderRegistry, defaultProviderRegistry } from "../providers/index.js";
import { ScimContext, defaultScimContext } from "../rbac/scim.js";
import { StorageContext, defaultStorageContext } from "../storage/index.js";
import {
  InnovationMonitorContext,
  defaultInnovationMonitorContext,
} from "../innovation-monitor/index.js";
import { WhiteLabelContext, defaultWhiteLabelContext } from "../white-label/index.js";

export const DEFAULT_RUNTIME_DISPOSE_TIMEOUT_MS = 5_000;

export interface InnovatorRuntimeOptions {
  providerRegistry?: ProviderRegistry;
  storageContext?: StorageContext;
  whiteLabelContext?: WhiteLabelContext;
  scimContext?: ScimContext;
  monitorContext?: InnovationMonitorContext;
  copilotCleanup?: () => Promise<void>;
  disposeTimeoutMs?: number;
}

/** Explicit owner for Innovator's process-level runtime facilities. */
export class InnovatorRuntime {
  readonly providers: ProviderRegistry;
  readonly storage: StorageContext;
  readonly whiteLabel: WhiteLabelContext;
  readonly scim: ScimContext;
  readonly monitor: InnovationMonitorContext;

  private readonly copilotCleanup: () => Promise<void>;
  private readonly disposeTimeoutMs: number;
  private disposePromise: Promise<void> | undefined;

  constructor(options: InnovatorRuntimeOptions = {}) {
    this.providers = options.providerRegistry ?? new ProviderRegistry();
    this.storage = options.storageContext ?? new StorageContext();
    this.whiteLabel = options.whiteLabelContext ?? new WhiteLabelContext();
    this.scim = options.scimContext ?? new ScimContext();
    this.monitor = options.monitorContext ?? new InnovationMonitorContext();
    this.copilotCleanup = options.copilotCleanup ?? stopCopilotClient;
    this.disposeTimeoutMs = options.disposeTimeoutMs ?? DEFAULT_RUNTIME_DISPOSE_TIMEOUT_MS;
  }

  /** Stop owned timers and close storage/Copilot resources once, within a fixed deadline. */
  dispose(): Promise<void> {
    this.disposePromise ??= Promise.resolve().then(() =>
      withTimeout(this.disposeResources(), this.disposeTimeoutMs)
    );
    return this.disposePromise;
  }

  private async disposeResources(): Promise<void> {
    let monitorError: unknown;
    try {
      this.monitor.dispose();
    } catch (error) {
      monitorError = error;
    }

    const results = await Promise.allSettled([this.storage.closeStorage(), this.copilotCleanup()]);

    if (monitorError !== undefined) throw monitorError;
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failure) throw failure.reason;
  }
}

export interface DefaultInnovatorRuntimeOptions {
  copilotCleanup?: () => Promise<void>;
  disposeTimeoutMs?: number;
}

/**
 * Create a lifecycle owner around the compatibility singleton contexts.
 *
 * Each call returns a fresh idempotent disposal boundary while retaining the
 * existing process-global API state used by legacy consumers.
 */
export function createDefaultInnovatorRuntime(
  options: DefaultInnovatorRuntimeOptions = {}
): InnovatorRuntime {
  return new InnovatorRuntime({
    providerRegistry: defaultProviderRegistry,
    storageContext: defaultStorageContext,
    whiteLabelContext: defaultWhiteLabelContext,
    scimContext: defaultScimContext,
    monitorContext: defaultInnovationMonitorContext,
    copilotCleanup: options.copilotCleanup,
    disposeTimeoutMs: options.disposeTimeoutMs,
  });
}
