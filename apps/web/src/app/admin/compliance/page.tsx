/**
 * Enterprise Compliance & SSO Admin page.
 * SOC 2 readiness tracker, data residency, DLP policies, and branding.
 */
import type { Metadata } from "next";
import {
  getSOC2Readiness,
  initSOC2Tracker,
} from "@innovator/core";

export const metadata: Metadata = {
  title: "Compliance & Security — Admin — Innovator",
  description: "Enterprise compliance management, SOC 2 tracker, and security policies.",
};

interface SOC2StatusBadgeProps {
  status: string;
}

function SOC2StatusBadge({ status }: SOC2StatusBadgeProps) {
  const colors: Record<string, string> = {
    "not-started": "bg-gray-200 text-gray-700",
    "in-progress": "bg-yellow-100 text-yellow-800",
    implemented: "bg-blue-100 text-blue-800",
    tested: "bg-indigo-100 text-indigo-800",
    verified: "bg-green-100 text-green-800",
    "non-compliant": "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100"}`}
    >
      {status}
    </span>
  );
}

export default function CompliancePage() {
  // Initialize demo readiness for display
  const tenantId = "demo-tenant";
  let readiness = getSOC2Readiness(tenantId);
  if (!readiness) {
    readiness = initSOC2Tracker(tenantId);
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">🔒 Compliance & Security</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Enterprise compliance management, SOC 2 readiness, and security policies.
        </p>
      </header>

      {/* SOC 2 Readiness Overview */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">SOC 2 Readiness</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {Object.entries(readiness.categoryScores).map(([category, score]) => (
            <div
              key={category}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center"
            >
              <div className="text-2xl font-bold">{String(score)}%</div>
              <div className="text-sm text-gray-500 capitalize">
                {category.replace(/-/g, " ")}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Overall Readiness</span>
            <span className="text-2xl font-bold">
              {readiness.overallReadiness}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className="bg-blue-600 rounded-full h-3 transition-all"
              style={{ width: `${readiness.overallReadiness}%` }}
            />
          </div>
        </div>
      </section>

      {/* Controls List */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Controls</h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Control</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {readiness.controls.map((control: { id: string; title: string; description: string; category: string; status: string }) => (
                <tr key={control.id}>
                  <td className="px-4 py-3 font-mono text-xs">{control.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{control.title}</div>
                    <div className="text-xs text-gray-500">{control.description}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-xs">
                    {control.category.replace(/-/g, " ")}
                  </td>
                  <td className="px-4 py-3">
                    <SOC2StatusBadge status={control.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Policy Cards */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Security Policies</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-2">🌍 Data Residency</h3>
            <p className="text-sm text-gray-500">
              Control where your data is stored and processed. Configure primary
              region and cross-border transfer policies.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-2">🛡️ DLP Policies</h3>
            <p className="text-sm text-gray-500">
              Data Loss Prevention rules to detect and block sensitive data in
              innovation inputs and outputs.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-2">🔐 IP Restrictions</h3>
            <p className="text-sm text-gray-500">
              Allow/deny lists for IP addresses. Restrict access to your
              organization&apos;s network ranges.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-2">🔑 SSO Configuration</h3>
            <p className="text-sm text-gray-500">
              SAML 2.0 and OIDC integration with Okta, Azure AD, Google
              Workspace, and custom providers.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-2">📅 Retention Policies</h3>
            <p className="text-sm text-gray-500">
              Configure data retention periods for sessions, audit logs,
              analytics, and deleted data purge schedules.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-2">🎨 Custom Branding</h3>
            <p className="text-sm text-gray-500">
              White-label Innovator with your company logo, colors, and custom
              CSS for a seamless brand experience.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
