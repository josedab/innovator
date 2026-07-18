import { createDefaultInnovatorRuntime } from "@innovator/core/runtime";
import type { Command, OutputConfiguration, ParseOptions } from "commander";

export interface CliOutput {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface CliRuntime {
  dispose(): Promise<void>;
}

export type CliSignal = "SIGINT" | "SIGTERM";
export type CliExitCode = string | number;

export interface CliDependencies {
  output?: CliOutput;
  commanderOutput?: OutputConfiguration;
  createRuntime?: () => CliRuntime;
  onSignal?: (signal: CliSignal, handler: () => void) => void;
  exit?: (code: CliExitCode) => void;
  getExitCode?: () => CliExitCode | null | undefined;
}

export interface CliContext {
  readonly program: Command;
  readonly output: CliOutput;
  readonly createRuntime: () => CliRuntime;
  readonly onSignal: (signal: CliSignal, handler: () => void) => void;
  readonly exit: (code: CliExitCode) => void;
  readonly getExitCode: () => CliExitCode | null | undefined;
  verbose: boolean;
  commandCleanup: (() => Promise<void>) | null;
  signalHandlersInstalled: boolean;
  activeShutdown: (() => Promise<void>) | null;
}

const defaultOutput: CliOutput = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
};

export function createCliContext(program: Command, dependencies: CliDependencies = {}): CliContext {
  return {
    program,
    output: dependencies.output ?? defaultOutput,
    createRuntime: dependencies.createRuntime ?? createDefaultInnovatorRuntime,
    onSignal:
      dependencies.onSignal ??
      ((signal, handler) => {
        process.on(signal, handler);
      }),
    exit:
      dependencies.exit ??
      ((code) => {
        process.exit(code);
      }),
    getExitCode: dependencies.getExitCode ?? (() => process.exitCode),
    verbose: false,
    commandCleanup: null,
    signalHandlersInstalled: false,
    activeShutdown: null,
  };
}

function installSignalHandlers(context: CliContext): void {
  if (context.signalHandlersInstalled) return;
  context.signalHandlersInstalled = true;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    context.onSignal(signal, () => {
      const code = context.getExitCode() ?? 130;
      const cleanup = context.commandCleanup ? context.commandCleanup() : Promise.resolve();
      cleanup.finally(() => {
        const shutdown = context.activeShutdown;
        if (!shutdown) {
          context.exit(code);
          return;
        }
        shutdown().finally(() => context.exit(code));
      });
    });
  }
}

export async function executeCli(
  context: CliContext,
  args: readonly string[],
  parseOptions: ParseOptions | undefined,
  installSignals: boolean
): Promise<void> {
  const runtime = context.createRuntime();
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => (shutdownPromise ??= runtime.dispose());

  if (installSignals) {
    installSignalHandlers(context);
    context.activeShutdown = shutdown;
  }

  try {
    if (parseOptions) {
      await context.program.parseAsync([...args], parseOptions);
    } else {
      await context.program.parseAsync([...args]);
    }
  } finally {
    try {
      await shutdown();
    } finally {
      if (context.activeShutdown === shutdown) context.activeShutdown = null;
    }
  }
}
