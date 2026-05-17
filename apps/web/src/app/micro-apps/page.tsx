"use client";

import { useState } from "react";

type MicroAppType =
  | "widget"
  | "slack-app"
  | "notion-block"
  | "browser-extension"
  | "raycast-extension"
  | "custom";

interface MicroAppConfig {
  name: string;
  type: MicroAppType;
  apiEndpoint: string;
  apiKey: string;
  theme: "light" | "dark" | "auto";
  features: {
    investigate: boolean;
    innovate: boolean;
    autoMode: boolean;
    scoring: boolean;
    export: boolean;
  };
  branding: {
    title: string;
    primaryColor: string;
  };
}

const APP_TYPE_INFO: Record<MicroAppType, { label: string; icon: string; description: string }> = {
  widget: { label: "Web Widget", icon: "🌐", description: "Embeddable HTML widget via script tag" },
  "slack-app": {
    label: "Slack App",
    icon: "💬",
    description: "Slash commands and Block Kit UI in Slack",
  },
  "notion-block": {
    label: "Notion Block",
    icon: "📝",
    description: "Embed block for Notion pages",
  },
  "browser-extension": {
    label: "Browser Extension",
    icon: "🔌",
    description: "Right-click 'Innovate This' context menu",
  },
  "raycast-extension": {
    label: "Raycast",
    icon: "⚡",
    description: "Quick innovation from Raycast launcher",
  },
  custom: { label: "Custom", icon: "🔧", description: "Custom API integration" },
};

export default function MicroAppsConfigurator() {
  const [config, setConfig] = useState<MicroAppConfig>({
    name: "My Innovation App",
    type: "widget",
    apiEndpoint: typeof window !== "undefined" ? window.location.origin : "",
    apiKey: "",
    theme: "auto",
    features: {
      investigate: true,
      innovate: true,
      autoMode: false,
      scoring: false,
      export: true,
    },
    branding: {
      title: "Innovator",
      primaryColor: "#3B82F6",
    },
  });

  const [generatedCode, setGeneratedCode] = useState("");
  const [copied, setCopied] = useState(false);

  const generateCode = () => {
    let code = "";
    switch (config.type) {
      case "widget":
        code = `<!-- Innovator Widget -->
<script src="${config.apiEndpoint}/api/widget"></script>
<innovator-widget
  api-endpoint="${config.apiEndpoint}/api/embed"
  ${config.apiKey ? `api-key="${config.apiKey}"` : ""}
  theme="${config.theme}"
  title="${config.branding.title}"
></innovator-widget>`;
        break;

      case "slack-app":
        code = `// Slack App Configuration
// 1. Create a new Slack App at https://api.slack.com/apps
// 2. Use this manifest:
{
  "display_information": {
    "name": "${config.branding.title}"
  },
  "features": {
    "slash_commands": [
      {
        "command": "/innovate",
        "url": "${config.apiEndpoint}/api/slack/commands",
        "description": "Run innovation pipeline"
      }
    ]
  }
}`;
        break;

      case "browser-extension":
        code = `// manifest.json for Chrome/Firefox extension
{
  "manifest_version": 3,
  "name": "${config.branding.title}",
  "version": "1.0.0",
  "description": "Right-click to innovate on any text",
  "permissions": ["contextMenus", "activeTab"],
  "background": { "service_worker": "background.js" }
}

// background.js
chrome.contextMenus.create({
  id: "innovate-this",
  title: "🚀 Innovate This",
  contexts: ["selection"]
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "innovate-this" && info.selectionText) {
    const resp = await fetch("${config.apiEndpoint}/api/v1/auto", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ${config.apiKey ? `"X-API-Key": "${config.apiKey}",` : ""}
      },
      body: JSON.stringify({ subject: info.selectionText, stream: false }),
    });
    const data = await resp.json();
    console.log("Innovation results:", data);
  }
});`;
        break;

      default:
        code = `// API Integration
const response = await fetch("${config.apiEndpoint}/api/v1/auto", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ${config.apiKey ? `"X-API-Key": "${config.apiKey}",` : ""}
  },
  body: JSON.stringify({ subject: "Your topic", stream: false }),
});
const data = await response.json();`;
    }

    setGeneratedCode(code);
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Micro-App Configurator
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Build embeddable innovation micro-apps for any platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <div className="space-y-4">
            {/* App Type Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Platform
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  Object.entries(APP_TYPE_INFO) as [
                    MicroAppType,
                    (typeof APP_TYPE_INFO)[MicroAppType],
                  ][]
                ).map(([type, info]) => (
                  <button
                    key={type}
                    onClick={() => setConfig((c) => ({ ...c, type }))}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      config.type === type
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-lg">{info.icon}</span>
                    <div className="text-sm font-medium mt-1">{info.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{info.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Settings</h2>

              <div>
                <label className="block text-xs text-gray-500 mb-1">App Name</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">API Endpoint</label>
                <input
                  type="text"
                  value={config.apiEndpoint}
                  onChange={(e) => setConfig((c) => ({ ...c, apiEndpoint: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key (optional)</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                  placeholder="inv_pro_..."
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Theme</label>
                <select
                  value={config.theme}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, theme: e.target.value as MicroAppConfig["theme"] }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Title</label>
                <input
                  type="text"
                  value={config.branding.title}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      branding: { ...c.branding, title: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateCode}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Generate Installation Code
            </button>
          </div>

          {/* Preview & Code Panel */}
          <div className="space-y-4">
            {/* Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Preview
              </h2>
              <div
                className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center"
                style={{ borderColor: config.branding.primaryColor }}
              >
                <div className="text-3xl mb-2">{APP_TYPE_INFO[config.type].icon}</div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {config.branding.title}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {APP_TYPE_INFO[config.type].label} — {config.theme} theme
                </div>
                <div className="text-xs text-gray-400 mt-2">{config.apiEndpoint}</div>
              </div>
            </div>

            {/* Generated Code */}
            {generatedCode && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Installation Code
                  </h2>
                  <button
                    onClick={copyToClipboard}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    {copied ? "✅ Copied!" : "📋 Copy"}
                  </button>
                </div>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto max-h-96">
                  <code>{generatedCode}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
