# ---- Base Node ----
# Use the 'slim' variant for a smaller image with glibc for better native module compatibility
FROM node:23-slim AS base
WORKDIR /usr/src/app
ENV NODE_ENV=development

# ---- Dependencies ----
# Install dependencies first to leverage Docker cache.
# This stage includes build tools needed for native modules like 'canvas'.
FROM base AS deps
WORKDIR /usr/src/app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
# Install only production dependencies in this stage for the final image
RUN npm ci --only=production

# ---- Builder ----
# Build the application
FROM base AS builder
WORKDIR /usr/src/app

# Install all necessary build tools and system libraries again for the builder stage
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests and install *all* dependencies (including dev)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the TypeScript project
RUN npm run build

# ---- Runner ----
# Final stage with only production dependencies and built code
FROM base AS runner
WORKDIR /usr/src/app

# Install only runtime dependencies for canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    && rm -rf /var/lib/apt/lists/*

# Copy production node_modules from the 'deps' stage
COPY --from=deps /usr/src/app/node_modules ./node_modules
# Copy built application from the 'builder' stage
COPY --from=builder /usr/src/app/dist ./dist
# Copy package.json (needed for potential runtime info, like version)
COPY package.json .

# Create a non-root user and switch to it
RUN addgroup --system --gid 1001 appgroup && adduser --system --uid 1001 --ingroup appgroup appuser

# Create and set permissions for the logs directory
RUN mkdir -p /usr/src/app/logs && chown -R appuser:appgroup /usr/src/app/logs

USER appuser

# Expose port if the application runs a server (adjust if needed)
ENV MCP_TRANSPORT_TYPE=http
ENV MCP_HTTP_HOST=0.0.0.0
EXPOSE 3010

# Command to run the application
# Note: We use npx to run the installed package directly.
# The 'bin' script in package.json will be executed.
CMD ["npx", "@cyanheads/pubmed-mcp-server"]
