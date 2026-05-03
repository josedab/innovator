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
