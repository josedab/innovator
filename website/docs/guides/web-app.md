---
id: web-app
title: Web App Guide
sidebar_position: 1
---

# Web App Guide

The web app is the primary interface for Innovator. It provides a visual, step-by-step flow for investigating subjects and exploring innovation angles.

## Starting the app

```bash
npm run dev
```

> **Note:** `npm run dev` automatically runs prerequisite checks (`npm run doctor`) and builds the core package before starting the Next.js dev server. If either step fails, the dev server will not start — fix the reported errors first.

Open [http://localhost:3000](http://localhost:3000).

## User flow

The app follows a stage-based flow:

```
Input → Investigating → Explored → Innovating → Results
                                      ↑
                              Auto Mode (parallel path)
```

### 1. Subject Input

The landing page presents a text input and two buttons:

- **🔍 Investigate** — starts the guided flow where you choose angles manually
- **🚀 Auto Mode** — runs all 8 angles automatically with a progress dashboard

Enter any subject: a technology ("WebAssembly"), a process ("employee onboarding"), a product ("smart home hubs"), or an abstract concept ("developer productivity").

### 2. Investigation Results

After investigation, you see a structured breakdown:

- **Summary** — a concise overview in a highlighted card
- **Key Aspects** — the main dimensions of the subject
- **Current State** — where things stand today
- **Challenges** — pain points shown with warning styling
- **Opportunities** — areas for innovation shown with success styling

### 3. Angle Selection

Below the investigation, a grid of 8 angle cards lets you toggle which frameworks to apply. Use **Select All** / **Clear** for quick selection.

Click **Generate Innovations** to proceed.

### 4. Innovation Results

Results are displayed in two sections:

**Synthesis Panel** (when available) — shows top-ranked ideas with feasibility badges, cross-cutting themes, and a strategic recommendation. Collapsible for focus.

**Per-Angle Accordions** — each angle expands to show its reasoning and 3-5 ideas with impact and implementation details.

### 5. Auto Mode

The auto mode panel shows real-time progress:

- Current pipeline stage (investigating → generating → synthesizing)
- Progress bar with percentage
- Completed angle badges appearing as each finishes
- Error recovery with retry messaging

When complete, the app automatically transitions to the Results view with full synthesis.

## API routes

The web app exposes the following API endpoints. All routes validate request bodies with Zod and return structured JSON error responses on failure.

### Core Pipeline

| Route               | Method | Description                                                                      |
| ------------------- | ------ | -------------------------------------------------------------------------------- |
| `/api/investigate`  | POST   | Analyze a subject and return structured investigation                            |
| `/api/innovate`     | POST   | Generate innovations for selected angles with optional synthesis                 |
| `/api/auto`         | POST   | Run full pipeline (all angles + synthesis) as an SSE stream                      |
| `/api/pipeline`     | POST   | Parse natural language pipeline description and execute via SSE                  |
| `/api/pipeline-dag` | POST   | Compile plain-English descriptions into executable pipeline DAGs or execute them |

### Ideas & Artifacts

| Route                   | Method            | Description                                                                |
| ----------------------- | ----------------- | -------------------------------------------------------------------------- |
| `/api/artifacts`        | POST              | Generate structured artifacts (PRD, tech spec, user story, etc.)           |
| `/api/validate`         | POST              | Validate ideas against patent, market, and feasibility checks              |
| `/api/refine`           | POST              | Create refinement sessions or send follow-up messages                      |
| `/api/angles`           | GET, POST, DELETE | List all angles, create custom angles, or delete by ID                     |
| `/api/combinatorial`    | POST              | Run combinatorial synthesis on angle results for paired/higher-order ideas |
| `/api/scaffold`         | POST              | Generate implementation scaffolding (code project structure) from an idea  |
| `/api/idea-version`     | POST              | Manage idea versions with log, diff, and create operations                 |
| `/api/dependency-graph` | POST              | Build idea dependency graphs and export as JSON, Markdown, or Mermaid      |
| `/api/rubric`           | GET, POST         | Create, retrieve, list, and score ideas against custom evaluation rubrics  |

### Collaboration & Sharing

| Route                | Method    | Description                                                                   |
| -------------------- | --------- | ----------------------------------------------------------------------------- |
| `/api/collaborate`   | GET, POST | Create/join collaborative sessions, submit ideas, vote, comment               |
| `/api/share`         | GET, POST | Create shareable links or list shared investigations                          |
| `/api/share/[slug]`  | GET, POST | Retrieve shared investigations by slug and fork into new sessions             |
| `/api/export`        | POST      | Export innovation data (markdown, JSON, clipboard, GitHub issue)              |
| `/api/realtime`      | GET, POST | SSE-based real-time collaboration: presence tracking and message broadcasting |
| `/api/social`        | GET, POST | Social network actions: share, like, comment, follow, repost ideas            |
| `/api/idea-exchange` | POST, GET | Publish ideas to marketplace and search listings with filters                 |
| `/api/negotiate`     | POST      | Start or step through multi-action negotiation sessions                       |

### Analysis & Simulation

| Route                     | Method    | Description                                                                    |
| ------------------------- | --------- | ------------------------------------------------------------------------------ |
| `/api/autonomous-agent`   | POST      | Run autonomous innovation agent via SSE that self-directs exploration          |
| `/api/wargaming`          | POST      | Run multi-round adversarial scenarios to test idea resilience                  |
| `/api/patent-scanner`     | POST      | Scan ideas for prior art and patent conflicts across patent databases          |
| `/api/monte-carlo`        | POST      | Run Monte Carlo simulation for idea impact prediction                          |
| `/api/digital-twin`       | POST, GET | Simulate innovation strategies against ecosystem snapshots                     |
| `/api/supply-chain`       | POST      | Map supply chain implications and dependencies for an innovation idea          |
| `/api/process-mining`     | POST      | Run process mining on pipeline events to discover bottlenecks                  |
| `/api/diffusion`          | POST      | Simulate idea adoption/diffusion curves with Monte Carlo analysis              |
| `/api/market-test`        | POST      | Run synthetic market tests on ideas with persona simulations                   |
| `/api/stakeholders`       | POST      | Simulate stakeholder reactions with conflict matrices and readiness scores     |
| `/api/regulatory`         | GET, POST | Simulate regulatory compliance across jurisdictions                            |
| `/api/compare`            | POST      | Run parallel investigations across multiple subjects with competitive analysis |
| `/api/portfolio-optimize` | POST      | Optimize idea portfolio allocation using Monte Carlo and financial models      |
| `/api/inverse-decoder`    | POST      | Analyze products and extract innovation patterns                               |
| `/api/climate`            | POST, GET | Run innovation climate assessments or retrieve survey questions                |

### Dashboards & Analytics

| Route                | Method    | Description                                                          |
| -------------------- | --------- | -------------------------------------------------------------------- |
| `/api/analytics`     | GET, POST | Get analytics summary/insights or track events                       |
| `/api/tracker`       | GET       | Retrieve idea fitness tracker dashboard                              |
| `/api/observatory`   | GET       | Get stats, timeline, or diff of LLM prompt calls for debugging       |
| `/api/portfolio`     | GET       | Return comprehensive portfolio dashboard with analytics              |
| `/api/cost-report`   | GET       | Generate a cost report of API usage                                  |
| `/api/telemetry`     | POST      | Record and analyze metrics: diversity, hallucination, quality trends |
| `/api/github-health` | POST, GET | Analyze repository innovation health scores                          |
| `/api/timing`        | POST      | Analyze implementation timing and scheduling recommendations         |

### AI & Intelligence

| Route                     | Method    | Description                                                       |
| ------------------------- | --------- | ----------------------------------------------------------------- |
| `/api/bias`               | POST, GET | Record cognitive bias activity, analyze biases, build dashboards  |
| `/api/memory`             | POST      | Record outcomes, query performance stats, auto-tune parameters    |
| `/api/adaptive-scaling`   | POST      | Classify complexity and generate adaptive execution plans         |
| `/api/distillation`       | POST, GET | Route requests to premium or distilled models based on quality    |
| `/api/embedding-explorer` | POST      | Build 3D embedding spaces from ideas and cluster them             |
| `/api/nl-visualization`   | POST      | Generate D3.js visualizations from natural language descriptions  |
| `/api/search`             | POST      | Semantic search, indexing, clustering, and connection discovery   |
| `/api/flow-state`         | POST, GET | Assess flow state indicators and get intervention recommendations |

### Team & Organization

| Route                       | Method    | Description                                                        |
| --------------------------- | --------- | ------------------------------------------------------------------ |
| `/api/team-dna`             | POST      | Analyze team composition and organizational DNA for innovation     |
| `/api/meeting-intelligence` | POST, GET | Ingest meeting transcripts and extract innovation signals          |
| `/api/curriculum`           | POST, GET | Generate learning paths, track module progress, issue certificates |

### Content & Automation

| Route             | Method | Description                                                      |
| ----------------- | ------ | ---------------------------------------------------------------- |
| `/api/content`    | POST   | Generate or revise content (blogs, emails, etc.) from ideas      |
| `/api/cinematics` | POST   | Generate cinematic scripts from innovation session data          |
| `/api/automation` | POST   | Create, list, toggle, delete automation rules and preset chains  |
| `/api/webhooks`   | POST   | Register/unregister webhooks, manage delivery logs and templates |

### Session & Configuration

| Route          | Method                   | Description                                            |
| -------------- | ------------------------ | ------------------------------------------------------ |
| `/api/history` | GET, POST, DELETE, PATCH | Query/save/delete sessions or update tags/notes        |
| `/api/presets` | GET                      | List pipeline presets, optionally filtered by category |
| `/api/health`  | GET                      | Health check endpoint returning status and version     |

### Embeddable Widget

| Route         | Method        | Description                                     |
| ------------- | ------------- | ----------------------------------------------- |
| `/api/embed`  | POST, OPTIONS | Embeddable widget endpoint with CORS support    |
| `/api/widget` | GET           | Serve innovator-widget web component JavaScript |

### Mobile & Portal

| Route              | Method    | Description                                                   |
| ------------------ | --------- | ------------------------------------------------------------- |
| `/api/mobile`      | GET, POST | Capture ideas via voice, camera, or text; retrieve and sync   |
| `/api/portal`      | GET, POST | Developer portal: create tenants, manage API keys, view usage |
| `/api/marketplace` | POST, GET | Search, install, publish, and review marketplace plugins      |

### Authenticated API (v1)

These routes require an `X-API-Key` header. See the [V1 API Guide](/docs/guides/v1-api) for details.

| Route                 | Method            | Description                                                  |
| --------------------- | ----------------- | ------------------------------------------------------------ |
| `/api/v1/investigate` | POST              | Programmatic investigation with API key auth + rate limiting |
| `/api/v1/innovate`    | POST              | Generate ideas with API key auth + rate limiting             |
| `/api/v1/auto`        | POST              | Run full pipeline with optional streaming + auth             |
| `/api/v1/keys`        | GET, POST, DELETE | Manage API keys: list, create, or revoke                     |
| `/api/v1/openapi`     | GET               | Serve OpenAPI specification in JSON format                   |
| `/api/v1/plugins`     | GET               | List registered plugins with API key authentication          |

For full request/response schemas, see the [API Reference](/docs/api-reference#web-api-routes).

## PWA Support

The web app includes Progressive Web App (PWA) capabilities via the `usePWA()` hook in `apps/web/src/lib/use-pwa.ts`. This enables install-to-home-screen, offline detection, and service worker registration.

### `usePWA()` Hook

Import and use the hook in any React component:

```tsx
import { usePWA } from "@/lib/use-pwa";

function MyComponent() {
  const { isInstalled, isOnline, canInstall, install, requestNotificationPermission } = usePWA();

  return (
    <div>
      {!isOnline && <p>You are offline</p>}
      {canInstall && <button onClick={install}>Install App</button>}
    </div>
  );
}
```

### Hook Return Values

| Property                          | Type                                    | Description                                                     |
| --------------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `isInstalled`                     | `boolean`                               | `true` if the app is running in standalone/installed mode       |
| `isOnline`                        | `boolean`                               | `true` if the browser has network connectivity                  |
| `canInstall`                      | `boolean`                               | `true` if the browser install prompt is available               |
| `registration`                    | `ServiceWorkerRegistration \| null`     | The active service worker registration, if any                  |
| `install()`                       | `() => Promise<boolean>`                | Triggers the browser install prompt; returns `true` if accepted |
| `requestNotificationPermission()` | `() => Promise<NotificationPermission>` | Requests notification permission from the user                  |

### How It Works

1. **Service Worker** — On mount, the hook registers `/sw.js` as a service worker. You must provide a `public/sw.js` file for caching and offline support.
2. **Install Prompt** — The hook captures the browser's `beforeinstallprompt` event. Call `install()` to show the native install dialog.
3. **Online/Offline Detection** — The hook listens to browser `online` and `offline` events and updates `isOnline` reactively.
4. **Standalone Detection** — Checks `display-mode: standalone` media query and Safari's `navigator.standalone` to detect if the app is already installed.

### Prerequisites

For full PWA support, ensure your deployment includes:

- A `public/manifest.json` (or `manifest.webmanifest`) with app name, icons, and display mode
- A `public/sw.js` service worker for caching strategies
- HTTPS (required for service workers in production)

### Offline Behavior

When the browser loses connectivity, the `usePWA()` hook sets `isOnline` to `false`. The app can display an offline banner and continue working with cached data.

The service worker (`public/sw.js`) controls what is available offline. A typical caching strategy:

- **App shell** — Cache the HTML, CSS, and JS bundles on install for instant offline loading
- **API responses** — Use a network-first strategy so cached results are available when offline
- **Static assets** — Cache images and fonts with a cache-first strategy

```javascript
// Example public/sw.js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("app-shell-v1").then((cache) => cache.addAll(["/", "/offline.html"]))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
```

The service worker lifecycle follows standard patterns: `install` → `activate` → `fetch`. Updates are detected automatically — when a new `sw.js` is deployed, the browser installs it in the background and activates it on the next page load.

### Push Notifications

The `requestNotificationPermission()` method from `usePWA()` requests the browser's notification permission:

```tsx
const { requestNotificationPermission } = usePWA();

async function enableNotifications() {
  const permission = await requestNotificationPermission();
  if (permission === "granted") {
    // Subscribe to push notifications via service worker
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisualContents: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
    // Send subscription to your backend
  }
}
```

Push notification setup requires:

1. Generate VAPID keys for your server
2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in your environment
3. Implement a push subscription endpoint on your backend
4. Handle `push` events in your service worker

### Install to Home Screen

The `canInstall` flag from `usePWA()` is `true` when the browser's install prompt is available. Call `install()` to show the native dialog:

```tsx
const { canInstall, install, isInstalled } = usePWA();

// Show install button only when eligible
{
  canInstall && !isInstalled && <button onClick={install}>Add to Home Screen</button>;
}
```

**Platform requirements:**

| Platform         | Requirements                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **Chrome/Edge**  | Valid manifest with `name`, `icons` (192px + 512px), `start_url`, `display: "standalone"`        |
| **Safari (iOS)** | Add `<meta name="apple-mobile-web-app-capable" content="yes">` and apple-touch-icon links        |
| **Firefox**      | Same as Chrome; install prompt may not be available (use "Add to Home Screen" from browser menu) |

### Manifest Configuration

The PWA manifest (`public/manifest.json`) defines how the app appears when installed:

```json
{
  "name": "Innovator",
  "short_name": "Innovator",
  "description": "AI-Powered Innovation Engine",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Link the manifest in your root layout (`apps/web/src/app/layout.tsx`):

```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#3b82f6" />
```

### Example: Call the investigation API directly

```bash
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"subject": "remote work tools"}'
```

### Example: Call the innovate API

```bash
curl -X POST http://localhost:3000/api/innovate \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "remote work tools",
    "investigation": { ... },
    "angles": ["scamper", "first-principles"],
    "synthesize": true
  }'
```
