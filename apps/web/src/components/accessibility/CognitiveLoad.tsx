"use client";

import { useState } from "react";
import { useAccessibility } from "./AccessibilityProvider";

interface WizardStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
}

/**
 * Simplified 3-step wizard for reduced cognitive load mode.
 * Replaces the complex multi-panel interface with a linear flow:
 * 1. Enter subject → 2. Choose mode → 3. View results
 */
export function SimplifiedWizard({
  steps,
  onComplete,
}: {
  steps: WizardStep[];
  onComplete?: () => void;
}) {
  const { preferences } = useAccessibility();
  const [currentStep, setCurrentStep] = useState(0);

  if (!preferences.cognitiveLoadReduction) return null;

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <div
      role="region"
      aria-label="Step-by-step wizard"
      style={{
        maxWidth: "600px",
        margin: "2rem auto",
        padding: "2rem",
        border: "2px solid #d1d5db",
        borderRadius: "12px",
        backgroundColor: "white",
      }}
    >
      {/* Step indicator */}
      <div
        role="navigation"
        aria-label="Wizard progress"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s.id}
            aria-current={i === currentStep ? "step" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: "14px",
                backgroundColor:
                  i < currentStep ? "#22c55e" : i === currentStep ? "#3b82f6" : "#e5e7eb",
                color: i <= currentStep ? "white" : "#6b7280",
              }}
            >
              {i < currentStep ? "✓" : i + 1}
            </div>
            <span
              style={{
                fontSize: "14px",
                fontWeight: i === currentStep ? 600 : 400,
                color: i === currentStep ? "#111827" : "#6b7280",
              }}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>

      {/* Current step content */}
      <div
        role="group"
        aria-labelledby={`wizard-step-${step?.id}`}
        style={{ marginBottom: "2rem" }}
      >
        <h2
          id={`wizard-step-${step?.id}`}
          style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}
        >
          {step?.title}
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          {step?.description}
        </p>
        {step?.content}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={isFirst}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            cursor: isFirst ? "not-allowed" : "pointer",
            opacity: isFirst ? 0.5 : 1,
            backgroundColor: "white",
          }}
          aria-label="Go to previous step"
        >
          ← Back
        </button>

        {isLast ? (
          <button
            onClick={onComplete}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#22c55e",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
            aria-label="Complete wizard"
          >
            Complete ✓
          </button>
        ) : (
          <button
            onClick={() => setCurrentStep((s) => Math.min(steps.length - 1, s + 1))}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#3b82f6",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
            aria-label="Go to next step"
          >
            Next →
          </button>
        )}
      </div>

      {/* Screen reader progress announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        Step {currentStep + 1} of {steps.length}: {step?.title}
      </div>
    </div>
  );
}

/**
 * Screen reader optimized view for innovation results.
 * Provides a linear, well-structured reading order with clear headings.
 */
export function ScreenReaderResultsView({
  results,
}: {
  results: Array<{
    angleId: string;
    angleName: string;
    ideas: Array<{
      title: string;
      description: string;
      potentialImpact: string;
      implementationHint: string;
    }>;
  }>;
}) {
  return (
    <div role="region" aria-label="Innovation results">
      <h2 id="results-heading">Innovation Results</h2>
      <p>
        {results.length} angles analyzed, {results.reduce((s, r) => s + r.ideas.length, 0)} total
        ideas generated.
      </p>

      {results.map((angle, ai) => (
        <section key={angle.angleId} aria-labelledby={`angle-heading-${ai}`}>
          <h3 id={`angle-heading-${ai}`}>{angle.angleName}</h3>
          <p>{angle.ideas.length} ideas from this angle.</p>

          <ol aria-label={`Ideas from ${angle.angleName}`}>
            {angle.ideas.map((idea, ii) => (
              <li key={ii}>
                <h4>{idea.title}</h4>
                <p>{idea.description}</p>
                <dl>
                  <dt>Potential Impact</dt>
                  <dd>{idea.potentialImpact}</dd>
                  <dt>Implementation Hint</dt>
                  <dd>{idea.implementationHint}</dd>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
