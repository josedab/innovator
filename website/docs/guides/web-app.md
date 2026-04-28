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

| Route | Method | Description |
|-------|--------|-------------|
| `/api/investigate` | POST | Investigate a subject |
| `/api/innovate` | POST | Generate ideas for selected angles |
| `/api/auto` | POST | Run full pipeline with SSE streaming |

All routes validate request bodies with Zod and return structured JSON error responses on failure.

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
