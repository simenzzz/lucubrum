# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy only production dependencies and built output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Expose the application port
EXPOSE 3000

# Run as non-root user for security
USER node

# Start the application
CMD ["node", "dist/index.js"]
