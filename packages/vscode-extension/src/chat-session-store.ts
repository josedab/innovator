import type { InnovationIdea, Investigation } from "@innovator/core/innovation" with {
  "resolution-mode": "import",
};

export interface ChatSessionContext {
  lastInvestigation?: Investigation;
  lastIdeas?: InnovationIdea[];
  lastSubject?: string;
}

export class ChatSessionStore {
  private readonly contexts = new Map<string, ChatSessionContext>();

  constructor(private readonly maxSessions = 50) {}

  getContext(request: unknown): ChatSessionContext {
    const key = (request as { threadId?: string }).threadId ?? "default";
    if (!this.contexts.has(key)) {
      if (this.contexts.size >= this.maxSessions) {
        const firstKey = this.contexts.keys().next().value;
        if (firstKey !== undefined) this.contexts.delete(firstKey);
      }
      this.contexts.set(key, {});
    }
    return this.contexts.get(key)!;
  }

  getFirstIdeas(): InnovationIdea[] | undefined {
    for (const context of this.contexts.values()) {
      if (context.lastIdeas && context.lastIdeas.length > 0) return context.lastIdeas;
    }
    return undefined;
  }

  clear(): void {
    this.contexts.clear();
  }
}
