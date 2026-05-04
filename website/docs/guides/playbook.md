---
id: playbook
title: Playbooks & Decision Packets
sidebar_position: 14
---

# Playbooks & Decision Packets

After running an innovation pipeline, you can package the results into polished, stakeholder-ready documents using two complementary modules: **playbooks** and **decision packets**.

## Innovation Playbooks

A playbook is a comprehensive innovation document that transforms raw pipeline output into a presentation-ready artifact.

### What's Included

Each playbook contains four sections:

| Section               | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| **Executive Summary** | High-level overview of the subject, findings, and top ideas |
| **Roadmap**           | Phased implementation plan with activities and deliverables |
| **Risk Assessment**   | Identified risks with likelihood, impact, and mitigations   |
| **Next Steps**        | Immediate action items to move forward                      |

### Generating a Playbook

#### From Pipeline Results

```typescript
import { investigate, generateForAngle, runAutoPipeline, generatePlaybook } from "@innovator/core";

// After running a pipeline, generate a playbook:
const playbook = await generatePlaybook(
  "sustainable packaging",
  investigation,
  angleResults,
  synthesis,
  "markdown" // or "html"
);

console.log(playbook.sections.executiveSummary);
console.log(playbook.sections.roadmap);
```

#### From PipelineProgress Directly

```typescript
import { generatePlaybookFromPipeline } from "@innovator/core";

// If you have a PipelineProgress object from runAutoPipeline:
const playbook = await generatePlaybookFromPipeline(progress, "html");
```

### CLI Usage

Use the `--playbook` flag with the `auto` command:

```bash
# Markdown playbook (default)
npx tsx apps/cli/src/index.ts auto "sustainable packaging" --playbook

# HTML playbook with professional styling
npx tsx apps/cli/src/index.ts auto "sustainable packaging" --playbook html
```

### Output Formats

- **Markdown** — clean, portable document suitable for GitHub, Notion, or any Markdown viewer.
- **HTML** — styled document with professional formatting, ready to share via email or embed in a web page.

## Decision Packets

A decision packet distills pipeline results into an executive-ready document designed for leadership review and decision-making.

### What's Included

Each decision packet contains:

| Component            | Contents                                                            |
| -------------------- | ------------------------------------------------------------------- |
| **Options Matrix**   | Ranked alternatives with pros, cons, and confidence scores          |
| **Risk Assessment**  | Risks per option with likelihood, impact, and mitigation strategies |
| **Resource Asks**    | Estimated resources, timeline, and budget for each option           |
| **Success Criteria** | Measurable outcomes for tracking progress                           |
| **Recommendation**   | The synthesized recommendation with supporting rationale            |

### Generating a Decision Packet

```typescript
import { generateDecisionPacket } from "@innovator/core";

const packet = await generateDecisionPacket(synthesis, investigation, "sustainable packaging", {
  model: "gpt-4.1",
});

console.log(packet.options); // Ranked options with pros/cons
console.log(packet.risks); // Risk assessment
console.log(packet.resourceAsks); // Resource requirements
```

### Export Formats

#### Markdown

```typescript
import { decisionPacketToMarkdown } from "@innovator/core";

const md = decisionPacketToMarkdown(packet, {
  companyName: "Acme Corp",
  logo: "https://example.com/logo.png",
});
```

#### Google Slides JSON

```typescript
import { decisionPacketToSlidesJson } from "@innovator/core";

const slides = decisionPacketToSlidesJson(packet);
// Use with Google Slides API to create a presentation
```

### CLI Usage

Use the `--decision-packet` flag with the `auto` command:

```bash
npx tsx apps/cli/src/index.ts auto "AI-powered customer support" --decision-packet
```

## Combining Both

For maximum impact, generate both artifacts from the same pipeline run:

```bash
npx tsx apps/cli/src/index.ts auto "sustainable packaging" \
  --playbook markdown \
  --decision-packet
```

This produces:

- A **playbook** for the broader team (roadmap, risks, next steps).
- A **decision packet** for executives (options matrix, resource asks, success criteria).
