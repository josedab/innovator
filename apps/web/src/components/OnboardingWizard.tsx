/**
 * @description Step-by-step onboarding wizard that configures user preferences and introduces key features.
 */
"use client";

import { useState, useCallback } from "react";

type UserRole = "developer" | "pm" | "exec" | "researcher";

interface UserProfile {
  role: UserRole;
  experience: "beginner" | "intermediate" | "expert";
  interests: string[];
}

interface OnboardingStep {
  subject: string;
  angles: string[];
}

interface OnboardingProps {
  onComplete: (profile: UserProfile, session?: OnboardingStep) => void;
  onSkip: () => void;
}

const ROLES: Array<{
  id: UserRole;
  emoji: string;
  label: string;
  description: string;
  preset: string;
}> = [
  {
    id: "developer",
    emoji: "👩‍💻",
    label: "Developer",
    description: "Building software, exploring technical innovation",
    preset: "tech-startup",
  },
  {
    id: "pm",
    emoji: "📋",
    label: "Product Manager",
    description: "Discovering product opportunities and user needs",
    preset: "product-innovation",
  },
  {
    id: "exec",
    emoji: "📊",
    label: "Executive / Leader",
    description: "Strategic planning and competitive innovation",
    preset: "strategic",
  },
  {
    id: "researcher",
    emoji: "🔬",
    label: "Researcher",
    description: "Academic research and cross-domain exploration",
    preset: "research",
  },
];

const SUGGESTED_SUBJECTS: Record<UserRole, string[]> = {
  developer: [
    "AI-assisted code review",
    "Developer productivity tools",
    "Microservices architecture patterns",
  ],
  pm: [
    "User onboarding optimization",
    "Feature prioritization frameworks",
    "Customer feedback loops",
  ],
  exec: [
    "Digital transformation strategy",
    "Market disruption opportunities",
    "Innovation portfolio management",
  ],
  researcher: [
    "Cross-domain knowledge transfer",
    "Emerging technology applications",
    "Research collaboration platforms",
  ],
};

const RECOMMENDED_ANGLES: Record<UserRole, string[]> = {
  developer: ["first-principles", "constraints", "cross-domain"],
  pm: ["scamper", "perspectives", "what-if"],
  exec: ["trend-collision", "inversion", "first-principles"],
  researcher: ["cross-domain", "what-if", "perspectives"],
};

/** Smart onboarding wizard — detects user context, suggests presets, and walks through a guided first session. */
export function OnboardingWizard({ onComplete, onSkip }: OnboardingProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [role, setRole] = useState<UserRole | null>(null);
  const [subject, setSubject] = useState("");

  const finishOnboarding = useCallback(
    (profile: UserProfile, session?: OnboardingStep) => {
      try {
        localStorage.setItem("innovator-onboarded", "true");
        localStorage.setItem("innovator-profile", JSON.stringify(profile));
      } catch {
        // Ignore storage errors
      }
      onComplete(profile, session);
    },
    [onComplete]
  );

  // Step 0: Welcome
  if (step === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-6">
        <div className="text-5xl mb-2">💡</div>
        <h2 className="text-3xl font-bold text-neutral-800 dark:text-neutral-200">
          Welcome to Innovator
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 text-lg max-w-md mx-auto">
          AI-powered innovation engine that explores ideas from 8 creativity angles. Let&apos;s set
          you up in under a minute.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => setStep(1)}
            className="rounded-xl bg-indigo-600 px-8 py-3 font-medium text-white hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            Get Started
          </button>
          <button
            onClick={onSkip}
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline transition"
          >
            Skip for now
          </button>
        </div>
        <div className="flex justify-center gap-6 pt-8 text-xs text-neutral-500 dark:text-neutral-400">
          <span>🔍 Investigate</span>
          <span>→</span>
          <span>💡 Ideate</span>
          <span>→</span>
          <span>📊 Score</span>
        </div>
      </div>
    );
  }

  // Step 1: Role selection
  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <StepIndicator current={1} total={3} />
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200 mt-4">
            What best describes you?
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            This helps us recommend the right innovation angles
          </p>
        </div>
        <div className="grid gap-3">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRole(r.id);
                setStep(2);
              }}
              className={`flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 ${
                role === r.id
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                  : "border-neutral-200 dark:border-neutral-700"
              }`}
            >
              <span className="text-2xl">{r.emoji}</span>
              <div>
                <div className="font-medium text-neutral-800 dark:text-neutral-200">{r.label}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {r.description}
                </div>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={() => setStep(0)}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
        >
          Back
        </button>
      </div>
    );
  }

  // Step 2: Subject suggestion
  if (step === 2 && role) {
    const suggestions = SUGGESTED_SUBJECTS[role];
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <StepIndicator current={2} total={3} />
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200 mt-4">
            What do you want to innovate on?
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Pick a suggestion or type your own
          </p>
        </div>
        <div className="grid gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSubject(s);
                setStep(3);
              }}
              className="rounded-lg border border-neutral-200 px-4 py-3 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:border-neutral-700 dark:hover:bg-indigo-900/20 transition"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Or type your own subject…"
            onKeyDown={(e) => e.key === "Enter" && subject.trim() && setStep(3)}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          />
          <button
            onClick={() => subject.trim() && setStep(3)}
            disabled={!subject.trim()}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            Next
          </button>
        </div>
        <button
          onClick={() => setStep(1)}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
        >
          Back
        </button>
      </div>
    );
  }

  // Step 3: Review & launch
  if (step === 3 && role) {
    const roleInfo = ROLES.find((r) => r.id === role)!;
    const angles = RECOMMENDED_ANGLES[role];
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <StepIndicator current={3} total={3} />
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200 mt-4">
            Ready to innovate!
          </h2>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <span className="text-xl">{roleInfo.emoji}</span>
            <div>
              <div className="font-medium text-neutral-800 dark:text-neutral-200">
                {roleInfo.label}
              </div>
              <div className="text-xs text-neutral-500">Using {roleInfo.preset} preset</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
              Subject
            </div>
            <div className="text-sm text-neutral-800 dark:text-neutral-200">{subject}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
              Recommended Angles
            </div>
            <div className="flex flex-wrap gap-2">
              {angles.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                >
                  ⭐ {a}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => {
              const profile: UserProfile = { role, experience: "beginner", interests: angles };
              finishOnboarding(profile, { subject, angles });
            }}
            className="rounded-xl bg-indigo-600 px-8 py-3 font-medium text-white hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            🚀 Launch Innovation Session
          </button>
        </div>
        <div className="text-center">
          <button
            onClick={() => setStep(2)}
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 <= current ? "w-8 bg-indigo-600" : "w-2 bg-neutral-300 dark:bg-neutral-600"
          }`}
        />
      ))}
    </div>
  );
}
