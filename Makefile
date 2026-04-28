.DEFAULT_GOAL := help

.PHONY: help install dev dev-all build clean test test-coverage check lint typecheck format doctor

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	npm install

dev: ## Start web dev server (builds core first)
	npm run dev

dev-all: ## Run core watch + web dev in parallel (labeled output)
	npm run dev:all

build: ## Build all packages for production
	npm run build

clean: ## Remove build artifacts
	npm run clean

test: ## Run all tests
	npm test

test-coverage: ## Run tests with coverage report
	npm run test:coverage

check: ## Run all quality gates (lint, typecheck, format, test)
	npm run check

lint: ## Run ESLint across all packages
	npm run lint

typecheck: ## Run TypeScript type checking
	npm run typecheck

format: ## Format all files with Prettier
	npm run format

doctor: ## Check prerequisites (Node, gh CLI, auth, core build)
	npm run doctor
