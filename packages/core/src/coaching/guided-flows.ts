/**
 * @module coaching/guided-flows
 *
 * Pre-built structured coaching scripts for common innovation scenarios.
 * Each flow defines a sequence of coaching steps with branching logic,
 * question templates, and success criteria.
 */

import { z } from "zod";

// ---- Types ----

export const FlowStepTypeSchema = z.enum([
  "question",
  "instruction",
  "checkpoint",
  "reflection",
  "exercise",
  "transition",
]);
export type FlowStepType = z.infer<typeof FlowStepTypeSchema>;

export interface FlowStep {
  id: string;
  type: FlowStepType;
  title: string;
  content: string;
  /** Questions to ask at this step. */
  questions?: string[];
  /** Expected outcomes or success criteria. */
  successCriteria?: string[];
  /** Duration hint in minutes. */
  durationMinutes?: number;
  /** Next step ID (linear by default). */
  nextStepId?: string;
  /** Conditional branching based on user response keywords. */
  branches?: Array<{
    condition: string;
    nextStepId: string;
    description: string;
  }>;
  /** Prompt template for AI coaching at this step. */
  coachPrompt?: string;
}

export interface GuidedFlow {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  estimatedMinutes: number;
  steps: FlowStep[];
  tags: string[];
  suggestedAngles: string[];
}

export interface FlowSession {
  id: string;
  flowId: string;
  currentStepIndex: number;
  responses: Map<string, string>;
  startedAt: string;
  completedAt?: string;
  insights: string[];
}

// ---- Built-In Flows ----

export const PRODUCT_LAUNCH_FLOW: GuidedFlow = {
  id: "product-launch",
  name: "Product Launch Innovation",
  description:
    "Guided coaching for launching a new product — from problem definition to go-to-market strategy",
  icon: "🚀",
  category: "Product",
  estimatedMinutes: 25,
  suggestedAngles: ["first-principles", "perspectives", "trend-collision", "constraints"],
  tags: ["product", "launch", "strategy"],
  steps: [
    {
      id: "problem-definition",
      type: "question",
      title: "Define the Problem",
      content: "Let's start by understanding the core problem you're solving.",
      questions: [
        "Who specifically experiences this problem?",
        "How are they solving it today (even badly)?",
        "What's the cost of NOT solving this problem?",
      ],
      successCriteria: [
        "Clear target user identified",
        "Current workarounds described",
        "Pain severity quantified",
      ],
      durationMinutes: 5,
      coachPrompt:
        "You are coaching someone through product launch ideation. They just described their problem. Challenge their assumptions about the target user and problem severity. Ask if they've validated this with real users.",
    },
    {
      id: "competitive-landscape",
      type: "question",
      title: "Competitive Landscape",
      content: "Now let's understand who else is tackling this space.",
      questions: [
        "Who are the top 3 competitors or alternatives?",
        "What do they do well that you want to match?",
        "What do they do poorly that creates your opportunity?",
      ],
      durationMinutes: 5,
      coachPrompt:
        "The user described their competitive landscape. Probe for indirect competitors they may have missed. Ask about switching costs and why users would choose them over incumbents.",
    },
    {
      id: "unique-insight",
      type: "reflection",
      title: "Your Unique Insight",
      content:
        "Every great product starts with a unique insight — something you believe that most people don't.",
      questions: [
        "What do you believe about this market that most people disagree with?",
        "What hidden truth have you discovered through experience?",
      ],
      durationMinutes: 3,
      coachPrompt:
        "The user shared their unique insight. Challenge them: Is this truly contrarian, or is it conventional wisdom? Help them sharpen the insight into a memorable one-sentence thesis.",
    },
    {
      id: "solution-brainstorm",
      type: "exercise",
      title: "Solution Brainstorm",
      content:
        "Let's generate solution ideas using innovation angles. I'll run the investigation and angles for you.",
      durationMinutes: 5,
      coachPrompt:
        "Based on the problem, competitive landscape, and unique insight shared so far, suggest which innovation angles would be most productive and why.",
    },
    {
      id: "go-to-market",
      type: "question",
      title: "Go-to-Market Strategy",
      content: "Now let's think about how to reach your first customers.",
      questions: [
        "Where do your target users already gather (online and offline)?",
        "What's the simplest version you could ship in 2 weeks?",
        "How will you measure success in the first month?",
      ],
      durationMinutes: 5,
      coachPrompt:
        "The user described their GTM approach. Push them toward smaller, faster experiments. Challenge any 'build it and they will come' thinking.",
    },
    {
      id: "wrap-up",
      type: "checkpoint",
      title: "Session Summary",
      content: "Let's summarize what we've discovered and define next steps.",
      successCriteria: [
        "Problem clearly defined with target user",
        "Unique insight articulated",
        "Top 3 solution ideas identified",
        "First experiment defined with success metric",
      ],
      durationMinutes: 2,
    },
  ],
};

export const PROCESS_IMPROVEMENT_FLOW: GuidedFlow = {
  id: "process-improvement",
  name: "Process Improvement Workshop",
  description:
    "Guided session for optimizing an existing process — find bottlenecks, eliminate waste, innovate",
  icon: "⚙️",
  category: "Operations",
  estimatedMinutes: 20,
  suggestedAngles: ["scamper", "first-principles", "inversion", "constraints"],
  tags: ["process", "improvement", "optimization"],
  steps: [
    {
      id: "map-current",
      type: "question",
      title: "Map the Current Process",
      content: "First, let's understand the current state.",
      questions: [
        "Describe the process from start to finish in 5-7 steps.",
        "Where are the biggest delays or bottlenecks?",
        "Which steps require the most manual effort?",
      ],
      durationMinutes: 5,
    },
    {
      id: "measure-pain",
      type: "question",
      title: "Measure the Pain",
      content: "Let's quantify the problem.",
      questions: [
        "How long does this process take end-to-end?",
        "What's the error/rework rate?",
        "How much does this process cost per execution?",
      ],
      durationMinutes: 4,
    },
    {
      id: "root-cause",
      type: "exercise",
      title: "Root Cause Analysis",
      content: "Apply the '5 Whys' technique to the biggest bottleneck you identified.",
      questions: [
        "Why does this bottleneck exist?",
        "Why is that the case? (ask 'why' 5 times to reach root cause)",
      ],
      durationMinutes: 4,
      coachPrompt:
        "Guide the user through 5-whys analysis. Don't accept surface-level answers. Push for the systemic root cause, not symptoms.",
    },
    {
      id: "innovate",
      type: "exercise",
      title: "Generate Improvements",
      content: "Now let's apply innovation angles to reimagine this process.",
      durationMinutes: 5,
    },
    {
      id: "action-plan",
      type: "checkpoint",
      title: "Action Plan",
      content: "Define the first improvement you'll implement.",
      questions: [
        "Which single improvement would have the highest impact with lowest effort?",
        "What's the concrete first step you'll take tomorrow?",
        "How will you measure if the improvement worked?",
      ],
      durationMinutes: 2,
    },
  ],
};

export const MARKET_ENTRY_FLOW: GuidedFlow = {
  id: "market-entry",
  name: "Market Entry Strategy",
  description:
    "Guided coaching for entering a new market — analysis, positioning, and entry tactics",
  icon: "🌍",
  category: "Strategy",
  estimatedMinutes: 20,
  suggestedAngles: ["perspectives", "inversion", "what-if", "trend-collision"],
  tags: ["market", "entry", "strategy"],
  steps: [
    {
      id: "market-definition",
      type: "question",
      title: "Define the Target Market",
      content: "Let's get specific about the market you want to enter.",
      questions: [
        "What geographic region or customer segment are you targeting?",
        "What is the estimated market size (TAM/SAM/SOM)?",
        "Why this market, why now?",
      ],
      durationMinutes: 5,
    },
    {
      id: "competitive-dynamics",
      type: "question",
      title: "Competitive Dynamics",
      content: "Understand who controls this market today.",
      questions: [
        "Who are the incumbents and what's their market share?",
        "What are the barriers to entry (capital, regulation, network effects)?",
        "Where are the incumbents' blind spots?",
      ],
      durationMinutes: 5,
    },
    {
      id: "entry-strategy",
      type: "exercise",
      title: "Entry Strategy Options",
      content: "Let's explore different entry approaches using innovation angles.",
      durationMinutes: 5,
      coachPrompt:
        "Help the user explore unconventional entry strategies: niche beachhead, partnership/acquisition, disruptive pricing, platform strategy, or indirect entry through an adjacent market.",
      branches: [
        { condition: "b2b", nextStepId: "b2b-tactics", description: "B2B-specific entry tactics" },
        {
          condition: "consumer",
          nextStepId: "consumer-tactics",
          description: "Consumer-specific entry tactics",
        },
      ],
    },
    {
      id: "validation-plan",
      type: "checkpoint",
      title: "Validation Plan",
      content: "Define how you'll test this market entry hypothesis.",
      questions: [
        "What's the cheapest experiment to validate demand?",
        "What signal would make you go/no-go on this market?",
        "What's your timeline for the validation phase?",
      ],
      durationMinutes: 5,
    },
  ],
};

// ---- Flow Registry ----

const flows = new Map<string, GuidedFlow>();
[PRODUCT_LAUNCH_FLOW, PROCESS_IMPROVEMENT_FLOW, MARKET_ENTRY_FLOW].forEach((f) =>
  flows.set(f.id, f)
);

export function registerFlow(flow: GuidedFlow): void {
  flows.set(flow.id, flow);
}

export function getFlow(id: string): GuidedFlow | undefined {
  return flows.get(id);
}

export function listFlows(): GuidedFlow[] {
  return Array.from(flows.values());
}

export function getFlowsByCategory(category: string): GuidedFlow[] {
  return Array.from(flows.values()).filter(
    (f) => f.category.toLowerCase() === category.toLowerCase()
  );
}

export function searchFlows(query: string): GuidedFlow[] {
  const q = query.toLowerCase();
  return Array.from(flows.values()).filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.tags.some((t) => t.includes(q))
  );
}

export function unregisterFlow(id: string): boolean {
  return flows.delete(id);
}

export function clearFlows(): void {
  flows.clear();
}

// ---- Flow Session Management ----

const sessions = new Map<string, FlowSession>();

export function startFlowSession(flowId: string): FlowSession | undefined {
  const flow = flows.get(flowId);
  if (!flow) return undefined;

  const session: FlowSession = {
    id: `fs-${Date.now().toString(36)}`,
    flowId,
    currentStepIndex: 0,
    responses: new Map(),
    startedAt: new Date().toISOString(),
    insights: [],
  };
  sessions.set(session.id, session);
  return session;
}

export function getCurrentStep(sessionId: string): FlowStep | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  const flow = flows.get(session.flowId);
  return flow?.steps[session.currentStepIndex];
}

export function submitStepResponse(
  sessionId: string,
  response: string
): { nextStep: FlowStep | null; completed: boolean } | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  const flow = flows.get(session.flowId);
  if (!flow) return undefined;

  const currentStep = flow.steps[session.currentStepIndex];
  if (!currentStep) return undefined;

  session.responses.set(currentStep.id, response);

  // Check for branching
  let nextIndex = session.currentStepIndex + 1;
  if (currentStep.branches) {
    for (const branch of currentStep.branches) {
      if (response.toLowerCase().includes(branch.condition.toLowerCase())) {
        const branchIdx = flow.steps.findIndex((s) => s.id === branch.nextStepId);
        if (branchIdx >= 0) {
          nextIndex = branchIdx;
          break;
        }
      }
    }
  }

  if (nextIndex >= flow.steps.length) {
    session.completedAt = new Date().toISOString();
    return { nextStep: null, completed: true };
  }

  session.currentStepIndex = nextIndex;
  return { nextStep: flow.steps[nextIndex], completed: false };
}

export function getFlowSession(id: string): FlowSession | undefined {
  return sessions.get(id);
}

export function clearFlowSessions(): void {
  sessions.clear();
}
