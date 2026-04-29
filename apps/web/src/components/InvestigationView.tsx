interface Investigation {
  summary: string;
  keyAspects: { title: string; description: string }[];
  currentState: string;
  challenges: string[];
  opportunities: string[];
}

interface InvestigationViewProps {
  investigation: Investigation;
}

export function InvestigationView({ investigation }: InvestigationViewProps) {
  return (
    <div className="space-y-6">
      <div className="p-5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-lg mb-2">📋 Summary</h3>
        <p className="text-neutral-700 dark:text-neutral-300">
          {investigation.summary}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <h3 className="font-semibold text-lg mb-3">🔑 Key Aspects</h3>
          <ul className="space-y-3">
            {investigation.keyAspects.map((aspect, i) => (
              <li key={i}>
                <p className="font-medium">{aspect.title}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {aspect.description}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold text-lg mb-3">🎯 Current State</h3>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {investigation.currentState}
            </p>
          </div>

          <div className="p-5 rounded-xl border border-orange-200 dark:border-orange-800">
            <h3 className="font-semibold text-lg mb-3">⚠️ Challenges</h3>
            <ul className="space-y-1">
              {investigation.challenges.map((c, i) => (
                <li
                  key={i}
                  className="text-sm text-neutral-700 dark:text-neutral-300 flex gap-2"
                >
                  <span className="text-orange-500">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 rounded-xl border border-green-200 dark:border-green-800">
            <h3 className="font-semibold text-lg mb-3">✨ Opportunities</h3>
            <ul className="space-y-1">
              {investigation.opportunities.map((o, i) => (
                <li
                  key={i}
                  className="text-sm text-neutral-700 dark:text-neutral-300 flex gap-2"
                >
                  <span className="text-green-500">•</span>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
