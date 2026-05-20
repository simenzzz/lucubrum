# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files for dependency installation. This Dockerfile expects the
# repository root as its build context so shared contracts can be packaged.
COPY apps/api-node/package*.json ./
RUN npm ci

# Copy source code and build.
COPY apps/api-node/tsconfig.json ./tsconfig.json
COPY apps/api-node/src ./src
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache bash postgresql-client

# Set production environment
ENV NODE_ENV=production
ENV SCHEMAS_DIR=/app/packages/contracts/schemas

# Copy only production dependencies and built output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY packages/contracts/schemas ./packages/contracts/schemas
COPY infra/postgres/init.sql ./infra/postgres/init.sql
COPY infra/scripts/db-migrate.sh ./infra/scripts/db-migrate.sh

# Expose the application port
EXPOSE 3000

# Run as non-root user for security
USER node

# Start the application
CMD ["node", "dist/index.js"]
