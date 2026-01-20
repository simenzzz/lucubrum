.PHONY: help setup dev dev-infra dev-node dev-python test test-node test-python lint build clean

# Default target
help:
	@echo "Learning Helper - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - Install all dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Start all services (infra + apps)"
	@echo "  make dev-infra      - Start infrastructure only (Postgres + Redis)"
	@echo "  make dev-node       - Start Node service"
	@echo "  make dev-python     - Start Python service"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-node      - Run Node service tests"
	@echo "  make test-python    - Run Python service tests"
	@echo ""
	@echo "Quality:"
	@echo "  make lint           - Run linters on all services"
	@echo "  make typecheck      - Run type checking"
	@echo ""
	@echo "Build:"
	@echo "  make build          - Build all services"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
	@echo "Database:"
	@echo "  make db-reset       - Reset database (destructive)"
	@echo "  make db-migrate     - Run database migrations"
	@echo ""
	@echo "Schemas:"
	@echo "  make generate-schemas - Generate JSON schemas from Pydantic"

# Setup
setup:
	@echo "Installing Node dependencies..."
	cd apps/api-node && npm install
	@echo "Installing Python dependencies..."
	cd apps/curriculum-python && python -m venv venv && . venv/bin/activate && pip install -r requirements.txt
	@echo "Setup complete!"

# Development
dev-infra:
	@echo "Starting infrastructure (Postgres + Redis)..."
	cd infra && docker-compose up -d postgres redis

dev-node:
	@echo "Starting Node service..."
	cd apps/api-node && npm run dev

dev-python:
	@echo "Starting Python service..."
	cd apps/curriculum-python && . venv/bin/activate && uvicorn src.main:app --reload --port 8000

dev: dev-infra
	@echo "Starting all services..."
	$(MAKE) -j2 dev-node dev-python

# Testing
test-node:
	@echo "Running Node tests..."
	cd apps/api-node && npm test

test-python:
	@echo "Running Python tests..."
	cd apps/curriculum-python && . venv/bin/activate && pytest

test: test-node test-python

# Linting
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

# Build
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

# Database
db-reset:
	@echo "Resetting database..."
	cd infra && docker-compose down -v
	cd infra && docker-compose up -d postgres redis
	@echo "Waiting for Postgres to be ready..."
	sleep 5
	@echo "Database reset complete!"

# Schemas
generate-schemas:
	@echo "Generating JSON schemas from Pydantic models..."
	cd apps/curriculum-python && . venv/bin/activate && python -m scripts.generate_schemas
	@echo "Schemas generated in packages/contracts/schemas/"
