# ==============================================================================
# OmniFin Production Dockerfile
# Node.js LTS (v20) Alpine Image
# ==============================================================================
FROM node:20-alpine

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Define working directory
WORKDIR /app

# Copy package manifests first for optimal layer caching
COPY package*.json ./

# Install production dependencies only using npm ci
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy application source code
COPY public ./public
COPY server ./server
COPY shared ./shared

# Change ownership of the app directory to the unprivileged 'node' user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose internal HTTP port
EXPOSE 3000

# Start application using official npm start script
CMD ["npm", "start"]
