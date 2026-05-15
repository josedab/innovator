# --- Stage 1: Base image ---
# Use node:20-slim (Debian-based) instead of Alpine for compatibility with
# native npm packages. The -slim variant excludes docs and dev tools (~180MB vs ~350MB).
FROM node:20-slim

# Install GitHub CLI (required for Copilot SDK authentication at runtime).
# The Copilot SDK uses `gh` to obtain short-lived tokens for LLM API access.
# Cleanup apt lists after install to reduce image size (~30MB saved).
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependency installation (layer caching optimization) ---
# Copy only package manifests first so that `npm ci` is cached as long as
# dependencies don't change, even when source code does.
# Each workspace package.json must be copied to preserve the monorepo structure.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/

# Use `npm ci` (not `npm install`) for deterministic, reproducible installs
# from the lockfile. This also skips writing to package-lock.json.
RUN npm ci

# --- Build stage ---
# Copy full source after deps are installed to maximize layer cache hits.
# Build order is enforced by the root build script: core → cli → web.
COPY . .
RUN npm run build

# --- Runtime configuration ---
# Default port for the Next.js web server. Override with -e PORT=<n> at runtime.
ENV PORT=3000
EXPOSE 3000

# Start the Next.js production server via the root npm start script.
# For alternative providers (non-Copilot), set OPENAI_API_KEY or ANTHROPIC_API_KEY
# at runtime. For Copilot auth, either run `gh auth login` in the container
# or set GH_TOKEN as an environment variable.
CMD ["npm", "start"]
