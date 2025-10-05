# Use official Node.js LTS
FROM node:20-slim

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Create app directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json package-lock.json* ./

# Install dependencies (production only)
RUN npm ci --omit=dev --quiet || npm install --omit=dev --quiet

# Copy application files
COPY server.js ./

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs nextjs

# Change ownership of the working directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Start the server
CMD ["node", "server.js"]
