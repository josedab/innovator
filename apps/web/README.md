# Innovator Web App

The Next.js 16 web frontend for the Innovator AI-Powered Innovation Engine.

## App Flow

1. **Subject Input** — User enters a topic to innovate on
2. **Investigation** — AI analyzes the subject (key aspects, challenges, opportunities)
3. **Angle Selection** — User picks which innovation angles to apply (or uses Auto Mode for all 8)
4. **Results** — Generated ideas displayed per angle, with optional synthesis

## API Routes

| Route              | Method | Description                                                      |
| ------------------ | ------ | ---------------------------------------------------------------- |
| `/api/investigate` | POST   | Analyze a subject and return structured investigation            |
| `/api/innovate`    | POST   | Generate innovations for selected angles with optional synthesis |
| `/api/auto`        | POST   | Run full pipeline (all angles + synthesis) as an SSE stream      |

### Request Examples

```bash
# Investigate
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"subject": "code review processes"}'

# Innovate with specific angles
curl -X POST http://localhost:3000/api/innovate \
  -H "Content-Type: application/json" \
  -d '{"subject": "code review", "investigation": {...}, "angles": ["scamper"], "synthesize": true}'

# Auto mode (SSE stream)
curl -X POST http://localhost:3000/api/auto \
  -H "Content-Type: application/json" \
  -d '{"subject": "code review processes"}'
```

## Component Tree

```
app/
├── layout.tsx              # Root layout with header/footer
├── page.tsx                # Main page — manages app stage state machine
└── api/
    ├── investigate/route.ts
    ├── innovate/route.ts
    └── auto/route.ts

components/
├── SubjectInput.tsx        # Text input + Investigate/Auto Mode buttons
├── InvestigationView.tsx   # Displays investigation results
├── AngleSelector.tsx       # Grid of selectable innovation angles
├── InnovationResults.tsx   # Angle results + synthesis display
└── AutoModePanel.tsx       # SSE-powered progress UI for auto mode
```

## Local Development

```bash
# From the monorepo root:
npm run dev          # Builds core, then starts Next.js dev server

# Or run just the web app (requires core to be built first):
npm run dev --workspace=apps/web
```

The dev server runs at [http://localhost:3000](http://localhost:3000).

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **React 19** with client/server component separation
- **Tailwind CSS 4** for styling
- **@innovator/core** for types (client) and SDK logic (server API routes)
- **Zod** for request validation in API routes
