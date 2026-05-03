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

The web app exposes three API endpoints:

| Route              | Method | Description                             |
| ------------------ | ------ | --------------------------------------- |
| `/api/health`      | GET    | Health check (returns status + version) |
| `/api/investigate` | POST   | Investigate a subject                   |
| `/api/innovate`    | POST   | Generate ideas for selected angles      |
| `/api/auto`        | POST   | Run full pipeline with SSE streaming    |

All routes validate request bodies with Zod and return structured JSON error responses on failure.

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
