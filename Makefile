.PHONY: help setup dev dev-local dev-docker dev-infra dev-node dev-python test test-docker lint build clean stop

# Default target
help:
	@echo "Learning Helper - Development Commands"
	@echo ""
	@echo "Local Development (Fast & Hybrid):"
	@echo "  make dev             - Start apps locally + DBs in Docker (Best for coding)"
	@echo "  make dev-infra       - Start only Postgres + Redis"
	@echo "  make dev-node        - Start Node service locally"
	@echo "  make dev-python      - Start Python service locally"
	@echo ""
	@echo "Full Docker Mode (Consistent & Production-like):"
	@echo "  make dev-docker      - Start EVERYTHING in Docker (Simulate prod)"
	@echo "  make stop            - Stop all containers"
	@echo ""
	@echo "Testing:"
	@echo "  make test            - Run tests locally"
	@echo "  make test-docker     - Run tests INSIDE Docker containers"

# ==========================================
# 1. SETUP & LOCAL DEV (Your original flow)
# ==========================================

setup:
	@echo "Installing Node dependencies..."
	cd apps/api-node && npm install
	@echo "Installing Python dependencies..."
	cd apps/curriculum-python && python -m venv venv && . venv/bin/activate && pip install -r requirements.txt
	@echo "Setup complete!"

dev-infra:
	@echo "Starting infrastructure (Postgres + Redis)..."
	cd infra && docker-compose up -d postgres redis

dev-node:
	@echo "Starting Node service..."
	cd apps/api-node && npm run dev

dev-python:
	@echo "Starting Python service..."
	cd apps/curriculum-python && .venv/bin/uvicorn src.main:app --reload --port 8000

# Refactored: 'make dev' now explicitly calls the local version
dev: dev-local

dev-local: dev-infra
	@echo "Starting all services locally..."
	$(MAKE) -j2 dev-node dev-python

# ==========================================
# 2. DOCKER MODE (NEW SECTION)
# ==========================================

# NEW: Starts the 'full' profile defined in your docker-compose.yml
dev-docker:
	@echo "Starting full stack in Docker..."
	cd infra && docker-compose --profile full up --build

# NEW: Quick way to shut everything down
stop:
	@echo "Stopping all containers..."
	cd infra && docker-compose down

# NEW: Enter the Node container shell (useful for debugging inside the image)
ssh-node:
	cd infra && docker-compose exec api-node /bin/sh

# ==========================================
# 3. UTILITIES (Tests, Lint, Build)
# ==========================================

test-node:
	@echo "Running Node tests locally..."
	cd apps/api-node && npm test

test-python:
	@echo "Running Python tests locally..."
	cd apps/curriculum-python && . venv/bin/activate && pytest

test: test-node test-python

# NEW: Runs tests inside the container. 
# Great for CI/CD checks or verifying the Docker environment.
test-docker:
	@echo "Running tests inside Docker containers..."
	cd infra && docker-compose run --rm api-node npm test
	cd infra && docker-compose run --rm curriculum-python pytest

lint:
	@echo "Linting Node service..."
	cd apps/api-node && npm run lint
	@echo "Linting Python service..."
	cd apps/curriculum-python && . venv/bin/activate && ruff check src/

typecheck:
	@echo "Type checking Node service..."
	cd apps/api-node && npm run typecheck
	@echo "Type checking Python service..."
	cd apps/curriculum-python && . venv/bin/activate && mypy src/

build:
	@echo "Building Node service..."
	cd apps/api-node && npm run build
	@echo "Python service is interpreted, no build needed."

clean:
	@echo "Cleaning build artifacts..."
	rm -rf apps/api-node/dist
	rm -rf apps/curriculum-python/__pycache__
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

db-reset:
	@echo "Resetting database..."
	cd infra && docker-compose down -v
	cd infra && docker-compose up -d postgres redis
	@echo "Waiting for Postgres to be ready..."
	sleep 5
	@echo "Database reset complete!"

generate-schemas:
	@echo "Generating JSON schemas from Pydantic models..."
	cd apps/curriculum-python && . venv/bin/activate && python -m scripts.generate_schemas