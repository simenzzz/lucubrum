# Stage 1: Export dependencies from Poetry
FROM python:3.11-slim AS builder
WORKDIR /app

# Install Poetry
RUN pip install --no-cache-dir poetry poetry-plugin-export

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Export dependencies to requirements.txt
RUN poetry export -f requirements.txt -o requirements.txt --without-hashes

# Stage 2: Production
FROM python:3.11-slim AS production
WORKDIR /app

# Copy requirements from builder
COPY --from=builder /app/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY src ./src

# Expose the application port
EXPOSE 8000

# Run as non-root user for security
USER nobody

# Start the application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
