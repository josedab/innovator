"use client";

import { useState, useEffect } from "react";

interface WizardQuestion {
  id: string;
  step: number;
  label: string;
  description: string;
  type: "select" | "text" | "multiselect";
  options?: Array<{ value: string; label: string; description?: string }>;
  placeholder?: string;
  required: boolean;
}

interface GeneratedConfig {
  angles: string[];
  depth: string;
  model: string;
  scoringRubric: string[];
  exportFormat: string;
  maxIdeasPerAngle: number;
  autoMode: boolean;
}

type WizardAnswers = Record<string, string>;

const STEP_ICONS = ["🎯", "🏢", "⚙️", "👥", "⏱️"];

export default function SessionWizard({
  onComplete,
  onClose,
}: {
  onComplete?: (answers: WizardAnswers, config: GeneratedConfig) => void;
  onClose?: () => void;
}) {
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [config, setConfig] = useState<GeneratedConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/session-templates")
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data.questions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleGenerateConfig();
    }
  };

  const handleBack = () => {
    if (config) {
      setConfig(null);
    } else if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleGenerateConfig = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/session-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-config", answers }),
      });
      const data = await res.json();
      setConfig(data.config);
    } catch {
      // Generation failed — show error state
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!config || !templateName) return;
    try {
      await fetch("/api/session-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          name: templateName,
          description: `Auto-generated from wizard: ${answers.goal?.slice(0, 100)}`,
          answers,
          config,
        }),
      });
      setSaved(true);
    } catch {
      // Save failed — non-critical
    }
  };

  const handleStart = () => {
    if (config) {
      onComplete?.(answers, config);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="animate-pulse text-2xl">🧙</div>
        <p className="text-neutral-500 mt-2">Loading wizard...</p>
      </div>
    );
  }

  const currentQuestion = questions[currentStep];
  const canProceed = currentQuestion
    ? !currentQuestion.required || answers[currentQuestion.id]
    : false;
  const isLastStep = currentStep === questions.length - 1;
  const progress = config ? 100 : ((currentStep + 1) / (questions.length + 1)) * 100;

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">🧙 Innovation Wizard</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={(e) => setAdvancedMode(e.target.checked)}
              className="rounded"
            />
            Advanced Mode
          </label>
          {onClose && (
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className="flex justify-between mb-8">
        {questions.map((q, i) => (
          <div
            key={q.id}
            className={`flex flex-col items-center gap-1 ${
              i <= currentStep || config ? "opacity-100" : "opacity-40"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                i < currentStep || config
                  ? "bg-green-100 dark:bg-green-900/30"
                  : i === currentStep && !config
                    ? "bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500"
                    : "bg-neutral-100 dark:bg-neutral-800"
              }`}
            >
              {i < currentStep || config ? "✓" : STEP_ICONS[i]}
            </div>
            <span className="text-xs text-neutral-500 hidden sm:block">Step {i + 1}</span>
          </div>
        ))}
      </div>

      {/* Config Preview */}
      {config ? (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
            <h3 className="text-lg font-semibold mb-4">✅ Configuration Generated</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500 mb-1">Angles</p>
                <div className="flex flex-wrap gap-1">
                  {config.angles.map((a) => (
                    <span
                      key={a}
                      className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-neutral-500 mb-1">Depth</p>
                <p className="font-medium capitalize">{config.depth}</p>
              </div>
              <div>
                <p className="text-neutral-500 mb-1">Model</p>
                <p className="font-medium font-mono text-xs">{config.model}</p>
              </div>
              <div>
                <p className="text-neutral-500 mb-1">Ideas per Angle</p>
                <p className="font-medium">{config.maxIdeasPerAngle}</p>
              </div>
              <div>
                <p className="text-neutral-500 mb-1">Scoring</p>
                <div className="flex flex-wrap gap-1">
                  {config.scoringRubric.map((r) => (
                    <span
                      key={r}
                      className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-neutral-500 mb-1">Export</p>
                <p className="font-medium capitalize">{config.exportFormat}</p>
              </div>
            </div>
          </div>

          {/* Save as Template */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h4 className="font-medium mb-2">💾 Save as Template</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name..."
                className="flex-1 px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
              />
              <button
                onClick={handleSaveTemplate}
                disabled={!templateName || saved}
                className="px-4 py-2 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded text-sm hover:opacity-90 disabled:opacity-50 transition"
              >
                {saved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
            >
              ← Back
            </button>
            <button
              onClick={handleStart}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              🚀 Start Innovation
            </button>
          </div>
        </div>
      ) : currentQuestion ? (
        /* Question Step */
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">{currentQuestion.label}</h3>
            <p className="text-neutral-500">{currentQuestion.description}</p>
          </div>

          {currentQuestion.type === "text" ? (
            <textarea
              value={answers[currentQuestion.id] ?? ""}
              onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
              placeholder={currentQuestion.placeholder}
              rows={3}
              className="w-full px-4 py-3 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600 resize-none"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQuestion.options?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleAnswer(currentQuestion.id, opt.value)}
                  className={`p-4 rounded-lg border text-left transition ${
                    answers[currentQuestion.id] === opt.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300"
                  }`}
                >
                  <p className="font-medium text-sm">{opt.label}</p>
                  {opt.description && (
                    <p className="text-xs text-neutral-500 mt-1">{opt.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Advanced: Show all questions at once */}
          {advancedMode && currentStep === 0 && (
            <div className="mt-6 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <p className="text-sm text-neutral-500 mb-3">
                ⚡ Advanced Mode: All fields visible. Fill in and click Generate Config.
              </p>
              {questions.slice(1).map((q) => (
                <div key={q.id} className="mb-4">
                  <label className="block text-sm font-medium mb-1">{q.label}</label>
                  {q.type === "text" ? (
                    <input
                      type="text"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => handleAnswer(q.id, e.target.value)}
                      placeholder={q.placeholder}
                      className="w-full px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
                    />
                  ) : (
                    <select
                      value={answers[q.id] ?? ""}
                      onChange={(e) => handleAnswer(q.id, e.target.value)}
                      className="w-full px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
                    >
                      <option value="">Select...</option>
                      {q.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
              >
                ← Back
              </button>
            )}
            <button
              onClick={advancedMode && currentStep === 0 ? handleGenerateConfig : handleNext}
              disabled={!canProceed || generating}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {generating
                ? "Generating..."
                : advancedMode && currentStep === 0
                  ? "Generate Config"
                  : isLastStep
                    ? "Generate Config"
                    : "Next →"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
