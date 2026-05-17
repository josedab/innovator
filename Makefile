.DEFAULT_GOAL := help

.PHONY: help install dev dev-all dev-docs build build-check clean clean-all test test-ci test-coverage check lint lint-fix typecheck format doctor dev-cli test-single test-watch test-changed validate typecheck-core format-check docker-build docker-up docker-down docs-build docs-api

# ── Help ──────────────────────────────────────────────────────────────

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Setup ─────────────────────────────────────────────────────────────

install: ## Install all dependencies
	npm install

doctor: ## Check prerequisites (Node, gh CLI, auth, core build)
	npm run doctor

# ── Development ───────────────────────────────────────────────────────

dev: ## Start web dev server (builds core first)
	npm run dev

dev-all: ## Run core watch + web dev in parallel (labeled output)
	npm run dev:all

dev-docs: ## Start Docusaurus documentation dev server
	npm run dev:docs

dev-cli: ## Run CLI in development mode via tsx
	npm run dev:cli

# ── Build ─────────────────────────────────────────────────────────────

build: ## Build all packages for production
	npm run build

build-check: ## Verify all expected build outputs exist
	npm run build:check

# ── Quality ───────────────────────────────────────────────────────────

check: ## Run all quality gates (lint, typecheck, format, test)
	npm run check

validate: ## Quick validation: typecheck + test (no lint/format)
	npm run validate

lint: ## Run ESLint across all packages
	npm run lint

lint-fix: ## Auto-fix linting and formatting issues
	npm run lint:fix

typecheck: ## Run TypeScript type checking across all packages
	npm run typecheck

typecheck-core: ## Type check only the core package (fast feedback)
	npm run typecheck:core

format: ## Format all files with Prettier
	npm run format

# ── Testing ───────────────────────────────────────────────────────────

test: ## Run all tests
	npm test

test-single: ## Run a single test file (usage: make test-single FILE=packages/core/src/__tests__/my-test.ts)
	npx vitest run $(FILE)

test-watch: ## Run tests in watch mode
	npm run test:watch

test-changed: ## Run tests for changed files only
	npm run test:changed

test-coverage: ## Run tests with coverage report
	npm run test:coverage

test-ci: ## Simulate full CI pipeline (format, lint, typecheck, build, test)
	npm run test:ci

# ── Cleanup ───────────────────────────────────────────────────────────

clean: ## Remove build artifacts and coverage
	npm run clean

clean-all: ## Clean build artifacts and all node_modules
	npm run clean:all

# ── Docker ────────────────────────────────────────────────────────────

docker-build: ## Build Docker image
	npm run docker:build

docker-up: ## Start all services with Docker Compose
	npm run docker:up

docker-down: ## Stop all Docker Compose services
	npm run docker:down

# ── Documentation ────────────────────────────────────────────────────

docs-build: ## Build the Docusaurus documentation website
	npm run docs:build

docs-api: ## Generate TypeDoc API documentation for core
	npm run docs:api

format-check: ## Check formatting without writing changes
	npm run format:check
