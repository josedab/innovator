/**
 * @module widget
 *
 * Embeddable Innovation Widget — a framework-agnostic web component
 * (<innovator-widget>) that can be embedded with a single script tag.
 *
 * Usage:
 *   <script src="https://cdn.example.com/innovator-widget.js"></script>
 *   <innovator-widget api-endpoint="https://your-app.com/api/embed"></innovator-widget>
 */

/**
 * Generate the embed code for the innovator widget.
 *
 * @param options - Configuration for the embed code
 * @returns HTML string to embed in a page
 */
export function generateEmbedCode(options: {
  apiEndpoint: string;
  apiKey?: string;
  angles?: string[];
  theme?: "light" | "dark" | "auto";
  title?: string;
  maxHeight?: number;
  cdnUrl?: string;
}): string {
  const {
    apiEndpoint,
    apiKey,
    angles,
    theme = "auto",
    title = "💡 Innovator",
    maxHeight = 600,
    cdnUrl = "https://unpkg.com/@innovator/widget@latest/dist/innovator-widget.js",
  } = options;

  const attrs: string[] = [`api-endpoint="${apiEndpoint}"`];
  if (apiKey) attrs.push(`api-key="${apiKey}"`);
  if (angles) attrs.push(`angles="${angles.join(",")}"`);
  if (theme !== "auto") attrs.push(`theme="${theme}"`);
  if (title !== "💡 Innovator") attrs.push(`title="${title}"`);
  if (maxHeight !== 600) attrs.push(`max-height="${maxHeight}"`);

  return `<script src="${cdnUrl}"></script>\n<innovator-widget ${attrs.join(" ")}></innovator-widget>`;
}

/**
 * The web component source code as a string.
 * This can be served as a JS file for CDN distribution.
 */
export const WIDGET_SOURCE = `
(function() {
  class InnovatorWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._result = null;
      this._loading = false;
      this._error = null;
      this._expandedAngle = null;
    }

    static get observedAttributes() {
      return ['api-endpoint', 'api-key', 'angles', 'theme', 'title', 'max-height'];
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    get apiEndpoint() { return this.getAttribute('api-endpoint') || '/api/embed'; }
    get apiKey() { return this.getAttribute('api-key') || ''; }
    get angles() { const a = this.getAttribute('angles'); return a ? a.split(',').map(s => s.trim()) : undefined; }
    get theme() { return this.getAttribute('theme') || 'auto'; }
    get widgetTitle() { return this.getAttribute('title') || '💡 Innovator'; }
    get maxHeight() { return parseInt(this.getAttribute('max-height') || '600', 10); }

    get isDark() {
      if (this.theme === 'dark') return true;
      if (this.theme === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    async handleSubmit(e) {
      e.preventDefault();
      const input = this.shadowRoot.querySelector('#innovator-input');
      const subject = input?.value?.trim();
      if (!subject || this._loading) return;

      this._loading = true;
      this._error = null;
      this._result = null;
      this.render();

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['X-Embed-Key'] = this.apiKey;

        const res = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ subject, angles: this.angles }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(data.error || 'Request failed');
        }

        this._result = await res.json();
      } catch (err) {
        this._error = err.message || 'Something went wrong';
      } finally {
        this._loading = false;
        this.render();
      }
    }

    toggleAngle(angleId) {
      this._expandedAngle = this._expandedAngle === angleId ? null : angleId;
      this.render();
    }

    render() {
      const dark = this.isDark;
      const bg = dark ? '#1a1a2e' : '#ffffff';
      const text = dark ? '#e0e0e0' : '#1a1a1a';
      const border = dark ? '#333' : '#e0e0e0';
      const inputBg = dark ? '#2a2a3e' : '#f5f5f5';
      const accent = '#6366f1';

      let content = '';

      if (this._error) {
        content += '<div style="padding:8px 12px;background:' + (dark ? '#3a1a1a' : '#fff0f0') + ';border-radius:8px;color:#ef4444;font-size:13px;">' + this.escapeHtml(this._error) + '</div>';
      }

      if (this._loading) {
        content += '<div style="text-align:center;padding:24px;color:#888;"><div style="font-size:32px;margin-bottom:8px;">🔍</div><p>Analyzing...</p><p style="font-size:12px;">This may take 30-60 seconds</p></div>';
      }

      if (this._result) {
        const r = this._result;
        if (r.synthesis) {
          content += '<div style="padding:12px;background:' + (dark ? '#2a2040' : '#f5f0ff') + ';border-radius:8px;margin-bottom:12px;"><h4 style="margin:0 0 8px;font-size:15px;">🏆 Top Insights</h4><p style="margin:0;font-size:13px;line-height:1.5;">' + this.escapeHtml(r.synthesis.recommendation) + '</p></div>';
        }
        if (r.angleResults) {
          for (const ar of r.angleResults) {
            const expanded = this._expandedAngle === ar.angleId;
            content += '<div style="border:1px solid ' + border + ';border-radius:8px;margin-bottom:8px;overflow:hidden;">';
            content += '<button onclick="this.getRootNode().host.toggleAngle(\\'' + ar.angleId + '\\')" style="width:100%;padding:10px 12px;background:transparent;border:none;color:' + text + ';cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600;"><span>' + this.escapeHtml(ar.angleName) + ' (' + ar.ideas.length + ' ideas)</span><span>' + (expanded ? '▼' : '▶') + '</span></button>';
            if (expanded) {
              content += '<div style="padding:0 12px 12px;">';
              for (const idea of ar.ideas) {
                content += '<div style="padding:8px;background:' + inputBg + ';border-radius:6px;margin-top:8px;"><strong style="font-size:13px;">' + this.escapeHtml(idea.title) + '</strong><p style="margin:4px 0 0;font-size:12px;line-height:1.4;opacity:0.8;">' + this.escapeHtml(idea.description) + '</p></div>';
              }
              content += '</div>';
            }
            content += '</div>';
          }
        }
        content += '<div style="text-align:center;font-size:11px;color:#888;margin-top:8px;">Powered by Innovator</div>';
      }

      this.shadowRoot.innerHTML = \`
        <div style="font-family:system-ui,-apple-system,sans-serif;background:\${bg};color:\${text};border:1px solid \${border};border-radius:12px;padding:16px;max-height:\${this.maxHeight}px;overflow-y:auto;font-size:14px;">
          <h3 style="margin:0 0 12px;font-size:18px;">\${this.escapeHtml(this.widgetTitle)}</h3>
          <form style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="innovator-input" type="text" placeholder="Enter a subject to explore..." maxlength="500" \${this._loading ? 'disabled' : ''} style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid \${border};background:\${inputBg};color:\${text};outline:none;font-size:14px;" />
            <button type="submit" \${this._loading ? 'disabled' : ''} style="padding:8px 16px;border-radius:8px;border:none;background:\${this._loading ? '#999' : accent};color:#fff;cursor:\${this._loading ? 'wait' : 'pointer'};font-size:14px;font-weight:600;">\${this._loading ? '⏳' : 'Go'}</button>
          </form>
          \${content}
        </div>
      \`;

      const form = this.shadowRoot.querySelector('form');
      if (form) form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    }
  }

  if (!customElements.get('innovator-widget')) {
    customElements.define('innovator-widget', InnovatorWidget);
  }
})();
`;

/**
 * Get the widget source code for serving via API or CDN.
 */
export function getWidgetSource(): string {
  return WIDGET_SOURCE.trim();
}

// ---- Micro-App Configuration System ----

import { z } from "zod";

export const MicroAppTypeSchema = z.enum([
  "widget",
  "slack-app",
  "notion-block",
  "browser-extension",
  "raycast-extension",
  "custom",
]);

export const MicroAppConfigSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  type: MicroAppTypeSchema,
  apiEndpoint: z.string().max(2000),
  apiKey: z.string().max(200).optional(),
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
  angles: z.array(z.string().max(100)).max(20).optional(),
  features: z
    .object({
      investigate: z.boolean().default(true),
      innovate: z.boolean().default(true),
      autoMode: z.boolean().default(false),
      scoring: z.boolean().default(false),
      export: z.boolean().default(true),
    })
    .default({}),
  branding: z
    .object({
      title: z.string().max(200).default("Innovator"),
      logoUrl: z.string().max(2000).optional(),
      primaryColor: z.string().max(20).default("#3B82F6"),
      borderRadius: z.number().default(8),
    })
    .default({}),
  layout: z
    .object({
      maxWidth: z.number().default(480),
      maxHeight: z.number().default(600),
      position: z.enum(["inline", "floating", "sidebar", "modal"]).default("inline"),
    })
    .default({}),
  createdAt: z.string(),
});

export type MicroAppType = z.infer<typeof MicroAppTypeSchema>;
export type MicroAppConfig = z.infer<typeof MicroAppConfigSchema>;

const microApps = new Map<string, MicroAppConfig>();

/** Create a micro-app configuration. */
export function createMicroApp(params: {
  name: string;
  type: MicroAppType;
  apiEndpoint: string;
  apiKey?: string;
  theme?: "light" | "dark" | "auto";
  angles?: string[];
  features?: Partial<MicroAppConfig["features"]>;
  branding?: Partial<MicroAppConfig["branding"]>;
  layout?: Partial<MicroAppConfig["layout"]>;
}): MicroAppConfig {
  const id = `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const config: MicroAppConfig = {
    id,
    name: params.name,
    type: params.type,
    apiEndpoint: params.apiEndpoint,
    apiKey: params.apiKey,
    theme: params.theme ?? "auto",
    angles: params.angles,
    features: {
      investigate: true,
      innovate: true,
      autoMode: false,
      scoring: false,
      export: true,
      ...params.features,
    },
    branding: { title: "Innovator", primaryColor: "#3B82F6", borderRadius: 8, ...params.branding },
    layout: { maxWidth: 480, maxHeight: 600, position: "inline", ...params.layout },
    createdAt: new Date().toISOString(),
  };

  microApps.set(id, config);
  return config;
}

/** Get a micro-app config by ID. */
export function getMicroApp(id: string): MicroAppConfig | undefined {
  return microApps.get(id);
}

/** List all micro-app configs. */
export function listMicroApps(): MicroAppConfig[] {
  return Array.from(microApps.values());
}

/** Delete a micro-app config. */
export function deleteMicroApp(id: string): boolean {
  return microApps.delete(id);
}

/** Clear all micro-apps (for testing). */
export function clearMicroApps(): void {
  microApps.clear();
}

// ---- Installation Code Generators ----

/** Generate embed code for a micro-app. */
export function generateInstallCode(config: MicroAppConfig): string {
  switch (config.type) {
    case "widget":
      return generateEmbedCode({
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        angles: config.angles,
        theme: config.theme,
        title: config.branding.title,
        maxHeight: config.layout.maxHeight,
      });

    case "slack-app":
      return generateSlackManifest(config);

    case "notion-block":
      return generateNotionEmbed(config);

    case "browser-extension":
      return generateBrowserExtensionManifest(config);

    case "raycast-extension":
      return generateRaycastCommand(config);

    case "custom":
      return generateEmbedCode({
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        theme: config.theme,
      });
  }
}

/** Generate Slack app manifest with Block Kit UI. */
function generateSlackManifest(config: MicroAppConfig): string {
  return JSON.stringify(
    {
      display_information: {
        name: config.branding.title,
        description: "AI-powered innovation directly in Slack",
        background_color: config.branding.primaryColor,
      },
      features: {
        bot_user: {
          display_name: config.branding.title,
          always_online: false,
        },
        slash_commands: [
          {
            command: "/innovate",
            url: `${config.apiEndpoint}/slack/commands`,
            description: "Run an innovation pipeline on a topic",
            usage_hint: "[topic]",
          },
          {
            command: "/investigate",
            url: `${config.apiEndpoint}/slack/commands`,
            description: "Investigate a topic for innovation opportunities",
            usage_hint: "[topic]",
          },
        ],
      },
      oauth_config: {
        scopes: {
          bot: ["commands", "chat:write", "chat:write.public"],
        },
      },
      settings: {
        interactivity: {
          is_enabled: true,
          request_url: `${config.apiEndpoint}/slack/interactions`,
        },
        event_subscriptions: {
          request_url: `${config.apiEndpoint}/slack/events`,
          bot_events: ["app_mention"],
        },
      },
    },
    null,
    2
  );
}

/** Generate Notion embed block code. */
function generateNotionEmbed(config: MicroAppConfig): string {
  const embedUrl = `${config.apiEndpoint}/embed?key=${config.apiKey ?? ""}&theme=${config.theme}`;
  return `<!-- Notion Embed Block -->
<!-- Add this as an "Embed" block in Notion -->
URL: ${embedUrl}

<!-- Or use the Notion API to create a bookmark block: -->
{
  "type": "embed",
  "embed": {
    "url": "${embedUrl}",
    "caption": [{ "type": "text", "text": { "content": "${config.branding.title}" } }]
  }
}`;
}

/** Generate browser extension manifest.json. */
function generateBrowserExtensionManifest(config: MicroAppConfig): string {
  return JSON.stringify(
    {
      manifest_version: 3,
      name: config.branding.title,
      version: "1.0.0",
      description: "Right-click to innovate on any text or page",
      permissions: ["contextMenus", "activeTab", "storage"],
      action: {
        default_popup: "popup.html",
        default_icon: {
          "16": "icons/icon16.png",
          "48": "icons/icon48.png",
          "128": "icons/icon128.png",
        },
      },
      background: {
        service_worker: "background.js",
      },
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["content.js"],
        },
      ],
      host_permissions: [config.apiEndpoint + "/*"],
    },
    null,
    2
  );
}

/** Generate Raycast extension command. */
function generateRaycastCommand(config: MicroAppConfig): string {
  return `// Raycast Extension — ${config.branding.title}
// Save as src/innovate.tsx

import { Action, ActionPanel, Form, List, showToast, Toast } from "@raycast/api";
import { useState } from "react";

export default function InnovateCommand() {
  const [subject, setSubject] = useState("");
  const [results, setResults] = useState<Array<{ title: string; description: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit() {
    if (!subject.trim()) return;
    setIsLoading(true);
    try {
      const resp = await fetch("${config.apiEndpoint}/api/v1/auto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "${config.apiKey ?? "YOUR_API_KEY"}",
        },
        body: JSON.stringify({ subject, stream: false }),
      });
      const data = await resp.json();
      const ideas = data?.data?.synthesis?.topIdeas ?? [];
      setResults(ideas);
      showToast({ style: Toast.Style.Success, title: \`Generated \${ideas.length} ideas\` });
    } catch (err) {
      showToast({ style: Toast.Style.Failure, title: "Innovation failed" });
    }
    setIsLoading(false);
  }

  if (results.length > 0) {
    return (
      <List isLoading={isLoading}>
        {results.map((idea, i) => (
          <List.Item key={i} title={idea.title} subtitle={idea.description} />
        ))}
      </List>
    );
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Innovate" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="subject" title="Subject" placeholder="What do you want to innovate on?" value={subject} onChange={setSubject} />
    </Form>
  );
}`;
}

// ---- Integration Guide Data ----

export interface IntegrationGuide {
  platform: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  steps: string[];
  codeSnippet: string;
  estimatedMinutes: number;
}

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const VALID_THEMES = new Set(["light", "dark", "auto"]);
const VALID_POSITIONS = new Set(["inline", "floating", "sidebar", "modal"]);
const VALID_MICRO_APP_TYPES = new Set([
  "widget",
  "slack-app",
  "notion-block",
  "browser-extension",
  "raycast-extension",
  "custom",
]);

export function getIntegrationGuides(config: MicroAppConfig): IntegrationGuide[] {
  const embedCode = generateEmbedCode({
    apiEndpoint: config.apiEndpoint,
    apiKey: config.apiKey,
    angles: config.angles,
    theme: config.theme,
    title: config.branding.title,
    maxHeight: config.layout.maxHeight,
  });

  const htmlSnippet = embedCode;
  const reactSnippet = `import { useMemo } from "react";

export function InnovatorWidget() {
  const widgetMarkup = useMemo(
    () => ({
      __html: ${JSON.stringify(embedCode)},
    }),
    []
  );

  return <div dangerouslySetInnerHTML={widgetMarkup} />;
}`;
  const vueSnippet = `<template>
  <div v-html="widgetMarkup" />
</template>

<script setup lang="ts">
const widgetMarkup = ${JSON.stringify(embedCode)};
</script>`;
  const angularSnippet = `import { Component } from "@angular/core";

@Component({
  selector: "app-innovator-widget",
  template: '<div [innerHTML]="widgetMarkup"></div>',
})
export class InnovatorWidgetComponent {
  widgetMarkup = ${JSON.stringify(embedCode)};
}`;
  const wordpressSnippet = `<?php
function innovator_widget_shortcode() {
    return '${embedCode.replace(/'/g, "\\'")}';
}
add_shortcode('innovator_widget', 'innovator_widget_shortcode');`;
  const shopifySnippet = `<script src="https://unpkg.com/@innovator/widget@latest/dist/innovator-widget.js"></script>
<innovator-widget
  api-endpoint="${config.apiEndpoint}"
  ${config.apiKey ? `api-key="${config.apiKey}"` : ""}
  theme="${config.theme}"
  title="${config.branding.title}"
></innovator-widget>`;

  return [
    {
      platform: "html",
      title: "HTML / Script tag",
      difficulty: "beginner",
      steps: [
        "Open the page where you want the widget to appear.",
        "Paste the script tag and <innovator-widget> element into the page body.",
        "Publish the page and verify the widget can reach your API endpoint.",
      ],
      codeSnippet: htmlSnippet,
      estimatedMinutes: 5,
    },
    {
      platform: "react",
      title: "React",
      difficulty: "intermediate",
      steps: [
        "Create a wrapper component for the embed markup.",
        "Render the widget in a client-side component or route.",
        "Confirm the API endpoint is reachable from the browser environment.",
      ],
      codeSnippet: reactSnippet,
      estimatedMinutes: 10,
    },
    {
      platform: "vue",
      title: "Vue",
      difficulty: "intermediate",
      steps: [
        "Add a component that exposes the widget markup.",
        "Render the HTML with v-html in a trusted context.",
        "Mount the component on the page where you want the widget experience.",
      ],
      codeSnippet: vueSnippet,
      estimatedMinutes: 10,
    },
    {
      platform: "angular",
      title: "Angular",
      difficulty: "intermediate",
      steps: [
        "Create an Angular component dedicated to the widget.",
        "Bind the generated markup into the component template.",
        "Add the component to the module or standalone route where it should appear.",
      ],
      codeSnippet: angularSnippet,
      estimatedMinutes: 15,
    },
    {
      platform: "wordpress",
      title: "WordPress",
      difficulty: "beginner",
      steps: [
        "Add the shortcode helper to your theme or a lightweight plugin.",
        "Insert the shortcode into the target page or post.",
        "Preview the page and verify the widget loads correctly.",
      ],
      codeSnippet: wordpressSnippet,
      estimatedMinutes: 12,
    },
    {
      platform: "shopify",
      title: "Shopify",
      difficulty: "advanced",
      steps: [
        "Open the theme editor and locate the target Liquid section.",
        "Paste the widget script and custom element into the section template.",
        "Save the theme and validate the widget inside the storefront.",
      ],
      codeSnippet: shopifySnippet,
      estimatedMinutes: 20,
    },
  ];
}

export function validateWidgetConfig(
  config: Omit<Partial<MicroAppConfig>, "branding" | "layout" | "features"> & {
    branding?: Partial<MicroAppConfig["branding"]>;
    layout?: Partial<MicroAppConfig["layout"]>;
    features?: Partial<MicroAppConfig["features"]>;
  }
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.apiEndpoint) {
    errors.push("apiEndpoint is required");
  } else {
    try {
      new URL(config.apiEndpoint);
    } catch {
      errors.push("apiEndpoint must be a valid URL");
    }
  }

  if (config.type && !VALID_MICRO_APP_TYPES.has(config.type)) {
    errors.push("type must be a supported micro-app type");
  }

  if (config.theme && !VALID_THEMES.has(config.theme)) {
    errors.push("theme must be one of: light, dark, auto");
  }

  if (config.apiKey && config.apiKey.length > 200) {
    errors.push("apiKey must be 200 characters or fewer");
  }

  if (config.angles) {
    if (config.angles.length > 20) {
      errors.push("angles must contain 20 entries or fewer");
    }
    if (config.angles.some((angle) => angle.trim().length === 0 || angle.length > 100)) {
      errors.push("angles must be non-empty strings up to 100 characters");
    }
  }

  if (config.branding) {
    if (config.branding.title && config.branding.title.length > 200) {
      errors.push("branding.title must be 200 characters or fewer");
    }
    if (config.branding.logoUrl) {
      try {
        new URL(config.branding.logoUrl);
      } catch {
        errors.push("branding.logoUrl must be a valid URL");
      }
    }
    if (config.branding.primaryColor && !HEX_COLOR_REGEX.test(config.branding.primaryColor)) {
      errors.push("branding.primaryColor must be a valid hex color");
    }
    if (
      config.branding.borderRadius !== undefined &&
      (!Number.isFinite(config.branding.borderRadius) || config.branding.borderRadius < 0)
    ) {
      errors.push("branding.borderRadius must be a non-negative number");
    }
  }

  if (config.layout) {
    if (
      config.layout.maxWidth !== undefined &&
      (!Number.isFinite(config.layout.maxWidth) || config.layout.maxWidth <= 0)
    ) {
      errors.push("layout.maxWidth must be a positive number");
    }
    if (
      config.layout.maxHeight !== undefined &&
      (!Number.isFinite(config.layout.maxHeight) || config.layout.maxHeight <= 0)
    ) {
      errors.push("layout.maxHeight must be a positive number");
    }
    if (config.layout.position && !VALID_POSITIONS.has(config.layout.position)) {
      errors.push("layout.position must be one of: inline, floating, sidebar, modal");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
