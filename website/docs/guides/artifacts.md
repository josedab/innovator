---
id: artifacts
title: Artifacts
sidebar_position: 7
---

# Artifacts

Generate structured documents from your innovation ideas — PRDs, user stories, technical specifications, pitch outlines, and OKRs.

:::caution Production availability
The `/api/artifacts` and `/api/export` examples in this guide are development/experimental. These routes return `404` in the first production profile. The underlying core-package APIs remain available for local library use.
:::

## Overview

The artifacts module transforms raw innovation ideas into actionable, structured documents. Each artifact type has a specialized prompt template that produces sections, metadata, and formatted content ready for export.

## Artifact Types

| Type            | Label                         | Use Case                                       |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `prd`           | Product Requirements Document | Feature specs with user stories and priorities |
| `user-story`    | User Stories                  | Epics with acceptance criteria                 |
| `tech-spec`     | Technical Specification       | Architecture, APIs, data models                |
| `pitch-outline` | Pitch Outline                 | Startup-style pitch with problem/solution      |
| `okr`           | Objectives & Key Results      | Strategic OKRs with measurable key results     |

## Generating Artifacts

### Via the API

```bash
curl -X POST http://localhost:3000/api/artifacts \
  -H "Content-Type: application/json" \
  -d '{
    "idea": {
      "title": "AI-Powered Code Review",
      "description": "Automated code review using LLMs",
      "potentialImpact": "50% reduction in review time",
      "implementationHint": "Use AST parsing + LLM analysis"
    },
    "artifactType": "prd",
    "subject": "developer productivity tools"
  }'
```

### Via the Core Package

```typescript
import { generateArtifact, generateArtifactStream } from "@innovator/core";

// Generate a complete artifact
const artifact = await generateArtifact({
  idea: myIdea,
  artifactType: "prd",
  subject: "developer productivity tools",
  investigation: myInvestigation, // optional
  model: "gpt-4.1", // optional
});

// Stream the artifact as it generates
const artifact = await generateArtifactStream(
  {
    idea: myIdea,
    artifactType: "tech-spec",
    subject: "developer productivity tools",
  },
  (chunk) => process.stdout.write(chunk)
);
```

## Artifact Structure

Every generated artifact follows the same schema:

```typescript
interface Artifact {
  type: ArtifactType; // "prd" | "user-story" | "tech-spec" | "pitch-outline" | "okr"
  title: string; // Generated title
  content: string; // Full text content
  sections: {
    // Up to 30 structured sections
    heading: string;
    body: string;
  }[];
  metadata: Record<string, unknown>;
}
```

## Exporting Artifacts

### To Markdown

```typescript
import { artifactToMarkdown } from "@innovator/core";

const markdown = artifactToMarkdown(artifact);
```

### To GitHub Issue

```typescript
import { artifactToGitHubIssue } from "@innovator/core";

const issue = artifactToGitHubIssue(artifact);
// { title: "...", body: "...", labels: ["innovator", "prd"] }
```

### Via the Export API

```bash
curl -X POST http://localhost:3000/api/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "github-issue",
    "data": {
      "subject": "developer productivity",
      "angleResults": [...],
      "synthesis": {...}
    }
  }'
```

## Utility Functions

| Function                                   | Description                         |
| ------------------------------------------ | ----------------------------------- |
| `generateArtifact(context)`                | Generate a complete artifact        |
| `generateArtifactStream(context, onChunk)` | Stream artifact generation          |
| `artifactToMarkdown(artifact)`             | Convert artifact to markdown        |
| `artifactToGitHubIssue(artifact)`          | Convert to GitHub issue format      |
| `getArtifactTypeLabel(type)`               | Get human-readable label for a type |
