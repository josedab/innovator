/**
 * @module scaffolding
 *
 * Idea-to-Code pipeline: generates implementation scaffolding from
 * scored ideas. Produces repo structure, README, LICENSE, architecture
 * diagrams (Mermaid), dependency lists, and issue breakdowns.
 * Optionally creates a GitHub repository via the GitHub API.
 */

import type { InnovationIdea, Synthesis } from "../types.js";

// ---- Types ----

/** A file in the generated scaffold. */
export interface ScaffoldFile {
  path: string;
  content: string;
  description: string;
}

/** A GitHub issue to create. */
export interface ScaffoldIssue {
  title: string;
  body: string;
  labels: string[];
  milestone?: string;
}

/** Full scaffold output for an idea. */
export interface IdeaScaffold {
  idea: {
    title: string;
    description: string;
    potentialImpact: string;
  };
  repoName: string;
  files: ScaffoldFile[];
  issues: ScaffoldIssue[];
  architectureDiagram: string;
  dependencies: Array<{ name: string; purpose: string; version?: string }>;
  techStack: string[];
  generatedAt: string;
}

/** Options for scaffold generation. */
export interface ScaffoldOptions {
  idea: InnovationIdea;
  /** Project name override. Default: derived from idea title. */
  projectName?: string;
  /** License type. Default: MIT. */
  license?: "MIT" | "Apache-2.0" | "GPL-3.0" | "BSD-3-Clause" | "ISC";
  /** Primary language/framework. Default: TypeScript/Node.js. */
  stack?: "typescript" | "python" | "go" | "rust";
  /** GitHub org or user for issue templates. */
  githubOwner?: string;
  /** Additional context from synthesis. */
  synthesis?: Synthesis;
}

// ---- Generator ----

/**
 * Generate implementation scaffolding for an innovation idea.
 */
export function generateScaffold(options: ScaffoldOptions): IdeaScaffold {
  const { idea, license = "MIT", stack = "typescript" } = options;
  const repoName = options.projectName ?? slugify(idea.title);
  const now = new Date().toISOString();

  const files: ScaffoldFile[] = [];
  const techStack = getTechStack(stack);
  const dependencies = getDependencies(stack);

  // README.md
  files.push({
    path: "README.md",
    content: generateReadme(idea, repoName, techStack),
    description: "Project README with overview, setup, and usage",
  });

  // LICENSE
  files.push({
    path: "LICENSE",
    content: getLicenseText(license),
    description: `${license} license file`,
  });

  // .gitignore
  files.push({
    path: ".gitignore",
    content: getGitignore(stack),
    description: "Git ignore rules",
  });

  // GitHub templates
  files.push({
    path: ".github/ISSUE_TEMPLATE/feature.md",
    content: `---\nname: Feature Request\nabout: Suggest a feature for ${repoName}\n---\n\n## Description\n\n## Proposed Solution\n\n## Alternatives Considered\n`,
    description: "GitHub feature request template",
  });

  files.push({
    path: ".github/ISSUE_TEMPLATE/bug.md",
    content: `---\nname: Bug Report\nabout: Report a bug in ${repoName}\n---\n\n## Description\n\n## Steps to Reproduce\n\n## Expected Behavior\n\n## Actual Behavior\n`,
    description: "GitHub bug report template",
  });

  files.push({
    path: ".github/pull_request_template.md",
    content: `## Changes\n\n## Type of change\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n\n## Testing\n- [ ] Unit tests added\n- [ ] Integration tests added\n`,
    description: "PR template",
  });

  files.push({
    path: ".github/workflows/ci.yml",
    content: generateCIWorkflow(stack),
    description: "GitHub Actions CI workflow",
  });

  // Architecture diagram
  const architectureDiagram = generateArchitectureDiagram(idea, repoName);
  files.push({
    path: "docs/architecture.md",
    content: `# Architecture\n\n${architectureDiagram}\n`,
    description: "Architecture diagram (Mermaid)",
  });

  // Stack-specific source files
  files.push(...generateSourceFiles(stack, repoName));

  // Issue breakdown
  const issues = generateIssueBreakdown(idea);

  return {
    idea: {
      title: idea.title,
      description: idea.description,
      potentialImpact: idea.potentialImpact,
    },
    repoName,
    files,
    issues,
    architectureDiagram,
    dependencies,
    techStack,
    generatedAt: now,
  };
}

/**
 * Export scaffold as a flat file map (for ZIP generation or GitHub API push).
 */
export function scaffoldToFileMap(scaffold: IdeaScaffold): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of scaffold.files) {
    map[file.path] = file.content;
  }
  return map;
}

/**
 * Export scaffold summary as Markdown.
 */
export function scaffoldToMarkdown(scaffold: IdeaScaffold): string {
  const lines: string[] = [
    `# ${scaffold.repoName}`,
    ``,
    `> ${scaffold.idea.description}`,
    ``,
    `## Tech Stack`,
    scaffold.techStack.map((t) => `- ${t}`).join("\n"),
    ``,
    `## Files (${scaffold.files.length})`,
    scaffold.files.map((f) => `- \`${f.path}\` — ${f.description}`).join("\n"),
    ``,
    `## Architecture`,
    scaffold.architectureDiagram,
    ``,
    `## Dependencies`,
    scaffold.dependencies.map((d) => `- **${d.name}** — ${d.purpose}`).join("\n"),
    ``,
    `## Issue Breakdown (${scaffold.issues.length})`,
    scaffold.issues
      .map((i, idx) => `${idx + 1}. **${i.title}** [${i.labels.join(", ")}]`)
      .join("\n"),
  ];
  return lines.join("\n");
}

// ---- Helpers ----

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function getTechStack(stack: string): string[] {
  switch (stack) {
    case "python":
      return ["Python 3.11+", "FastAPI", "SQLAlchemy", "pytest", "Docker"];
    case "go":
      return ["Go 1.21+", "Gin", "GORM", "Docker"];
    case "rust":
      return ["Rust 1.75+", "Actix-web", "SQLx", "Docker"];
    default:
      return ["TypeScript 5+", "Node.js 20+", "Express", "Prisma", "Vitest", "Docker"];
  }
}

function getDependencies(stack: string): Array<{ name: string; purpose: string }> {
  switch (stack) {
    case "python":
      return [
        { name: "fastapi", purpose: "Web framework" },
        { name: "uvicorn", purpose: "ASGI server" },
        { name: "sqlalchemy", purpose: "ORM / database" },
        { name: "pydantic", purpose: "Data validation" },
        { name: "pytest", purpose: "Testing framework" },
      ];
    case "go":
      return [
        { name: "gin-gonic/gin", purpose: "Web framework" },
        { name: "gorm.io/gorm", purpose: "ORM" },
        { name: "stretchr/testify", purpose: "Testing" },
      ];
    default:
      return [
        { name: "express", purpose: "Web framework" },
        { name: "zod", purpose: "Schema validation" },
        { name: "prisma", purpose: "ORM / database" },
        { name: "vitest", purpose: "Testing framework" },
        { name: "typescript", purpose: "Type safety" },
      ];
  }
}

function generateReadme(idea: InnovationIdea, repoName: string, techStack: string[]): string {
  return `# ${repoName}

${idea.description}

## 🎯 Impact

${idea.potentialImpact}

## 🛠 Tech Stack

${techStack.map((t) => `- ${t}`).join("\n")}

## 🚀 Getting Started

\`\`\`bash
git clone https://github.com/YOUR_ORG/${repoName}.git
cd ${repoName}
npm install
npm run dev
\`\`\`

## 📦 Project Structure

\`\`\`
src/
├── index.ts          # Entry point
├── routes/           # API routes
├── services/         # Business logic
├── models/           # Data models
└── utils/            # Shared utilities
\`\`\`

## 🧪 Testing

\`\`\`bash
npm test
\`\`\`

## 📝 License

${repoName} is licensed under the MIT License.
`;
}

function getLicenseText(license: string): string {
  const year = new Date().getFullYear();
  if (license === "MIT") {
    return `MIT License

Copyright (c) ${year}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
  }
  return `Licensed under ${license}. See https://opensource.org/licenses/${license} for details.\nCopyright (c) ${year}`;
}

function getGitignore(stack: string): string {
  const common = `# Dependencies\nnode_modules/\n\n# Build\ndist/\nbuild/\n\n# Environment\n.env\n.env.local\n\n# IDE\n.vscode/\n.idea/\n*.swp\n\n# OS\n.DS_Store\nThumbs.db\n`;
  if (stack === "python") return common + `\n# Python\n__pycache__/\n*.pyc\n.venv/\n*.egg-info/\n`;
  if (stack === "go") return common + `\n# Go\n*.exe\nvendor/\n`;
  if (stack === "rust") return common + `\n# Rust\ntarget/\nCargo.lock\n`;
  return common + `\n# TypeScript\n*.tsbuildinfo\ncoverage/\n`;
}

function generateCIWorkflow(stack: string): string {
  if (stack === "python") {
    return `name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: "3.11"\n      - run: pip install -r requirements.txt\n      - run: pytest\n`;
  }
  return `name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm test\n      - run: npm run build\n`;
}

function generateArchitectureDiagram(idea: InnovationIdea, repoName: string): string {
  return `\`\`\`mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[${repoName} Service]
    C --> D[Business Logic]
    D --> E[Data Layer]
    E --> F[(Database)]
    C --> G[External APIs]

    style A fill:#e1f5fe
    style C fill:#f3e5f5
    style F fill:#e8f5e9
\`\`\``;
}

function generateSourceFiles(stack: string, repoName: string): ScaffoldFile[] {
  if (stack === "python") {
    return [
      { path: "src/__init__.py", content: "", description: "Package init" },
      {
        path: "src/main.py",
        content: `"""${repoName} entry point."""\nfrom fastapi import FastAPI\n\napp = FastAPI(title="${repoName}")\n\n@app.get("/health")\ndef health():\n    return {"status": "ok"}\n`,
        description: "FastAPI entry point",
      },
      {
        path: "requirements.txt",
        content: "fastapi>=0.104.0\nuvicorn>=0.24.0\npydantic>=2.5.0\n",
        description: "Python dependencies",
      },
      { path: "tests/__init__.py", content: "", description: "Tests init" },
      {
        path: "tests/test_main.py",
        content: `from fastapi.testclient import TestClient\nfrom src.main import app\n\nclient = TestClient(app)\n\ndef test_health():\n    response = client.get("/health")\n    assert response.status_code == 200\n`,
        description: "Health endpoint test",
      },
    ];
  }

  return [
    {
      path: "src/index.ts",
      content: `import express from "express";\n\nconst app = express();\nconst PORT = process.env.PORT ?? 3000;\n\napp.use(express.json());\n\napp.get("/health", (_req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(PORT, () => {\n  console.log(\`${repoName} running on port \${PORT}\`);\n});\n`,
      description: "Express entry point",
    },
    {
      path: "src/routes/index.ts",
      content: `import { Router } from "express";\n\nexport const router = Router();\n\nrouter.get("/", (_req, res) => {\n  res.json({ message: "Hello from ${repoName}" });\n});\n`,
      description: "API routes",
    },
    { path: "src/services/.gitkeep", content: "", description: "Business logic placeholder" },
    { path: "src/models/.gitkeep", content: "", description: "Data models placeholder" },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: repoName,
          version: "0.1.0",
          type: "module",
          scripts: {
            dev: "tsx watch src/index.ts",
            build: "tsc",
            test: "vitest run",
            start: "node dist/index.js",
          },
          dependencies: { express: "^4.18.0", zod: "^3.23.0" },
          devDependencies: {
            typescript: "^5.6.0",
            tsx: "^4.0.0",
            vitest: "^2.0.0",
            "@types/express": "^5.0.0",
          },
        },
        null,
        2
      ),
      description: "Package manifest",
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            outDir: "./dist",
            rootDir: "./src",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
          },
          include: ["src"],
        },
        null,
        2
      ),
      description: "TypeScript config",
    },
  ];
}

function generateIssueBreakdown(idea: InnovationIdea): ScaffoldIssue[] {
  return [
    {
      title: "Project setup and CI/CD",
      body: `Set up the project scaffold, CI pipeline, and development tooling.\n\n## Tasks\n- [ ] Initialize repository\n- [ ] Configure CI/CD (GitHub Actions)\n- [ ] Set up linting and formatting\n- [ ] Configure testing framework\n- [ ] Add Docker support`,
      labels: ["setup", "infrastructure"],
      milestone: "v0.1.0",
    },
    {
      title: `Core: ${idea.title}`,
      body: `Implement the core functionality:\n\n${idea.description}\n\n## Acceptance Criteria\n- [ ] Core business logic implemented\n- [ ] Unit tests with >80% coverage\n- [ ] API endpoints documented`,
      labels: ["feature", "core"],
      milestone: "v0.1.0",
    },
    {
      title: "API design and documentation",
      body: `Design and document the public API.\n\n## Tasks\n- [ ] Define API schema (OpenAPI/Zod)\n- [ ] Implement input validation\n- [ ] Add error handling middleware\n- [ ] Generate API documentation`,
      labels: ["feature", "api"],
      milestone: "v0.1.0",
    },
    {
      title: "Data persistence layer",
      body: `Set up database schema and data access layer.\n\n## Tasks\n- [ ] Design database schema\n- [ ] Set up ORM/query builder\n- [ ] Write migration scripts\n- [ ] Add seed data for development`,
      labels: ["feature", "database"],
      milestone: "v0.1.0",
    },
    {
      title: "Testing and quality assurance",
      body: `Comprehensive test coverage.\n\n## Tasks\n- [ ] Unit tests for all services\n- [ ] Integration tests for API routes\n- [ ] E2E tests for critical flows\n- [ ] Load testing baseline`,
      labels: ["testing", "quality"],
      milestone: "v0.2.0",
    },
    {
      title: "Documentation and README",
      body: `Complete project documentation.\n\n## Tasks\n- [ ] Usage guide with examples\n- [ ] API reference\n- [ ] Contributing guide\n- [ ] Deployment guide`,
      labels: ["documentation"],
      milestone: "v0.2.0",
    },
  ];
}
