# =============================================================================
# Multi-stage Dockerfile for Innovator
# Stage 1: Install dependencies + build
# Stage 2: Production runtime (minimal image, non-root user)
# =============================================================================

# --- Stage 1: Build ---
FROM node:22-slim AS builder

WORKDIR /app

# Dependency installation (layer caching: package manifests first)
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/

# Deterministic install from lockfile; skip optional deps to reduce size
RUN npm ci --ignore-scripts

# Copy source and build (core → cli → web)
COPY . .
RUN npm run build

# Remove devDependencies to slim down the production node_modules
RUN npm prune --omit=dev

# --- Stage 2: Production runtime ---
FROM node:22-slim AS runtime

# Install dumb-init for proper PID 1 signal handling and GitHub CLI for
# Copilot SDK authentication. Clean up apt caches to reduce image size.
RUN apt-get update && \
    apt-get install -y --no-install-recommends dumb-init curl ca-certificates && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    apt-get purge -y curl && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for runtime security
RUN groupadd --gid 1001 innovator && \
    useradd --uid 1001 --gid innovator --shell /bin/false --create-home innovator

WORKDIR /app

# Copy only production artifacts from builder
COPY --from=builder --chown=innovator:innovator /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=innovator:innovator /app/node_modules ./node_modules
COPY --from=builder --chown=innovator:innovator /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=innovator:innovator /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=innovator:innovator /app/apps/cli/dist ./apps/cli/dist
COPY --from=builder --chown=innovator:innovator /app/apps/cli/package.json ./apps/cli/
COPY --from=builder --chown=innovator:innovator /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=innovator:innovator /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=innovator:innovator /app/apps/web/package.json ./apps/web/

# Drop to non-root user
USER innovator

# Runtime configuration
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Health check for orchestrators (Docker Compose, ECS, K8s liveness probe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init as PID 1 to handle signals properly (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
