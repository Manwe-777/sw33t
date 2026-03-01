# Sw33t Relay Server
# Docker image with WebRTC support for P2P connectivity

FROM node:18-bullseye

# Install build dependencies for wrtc
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install node-pre-gyp globally (required by wrtc)
RUN npm install -g @mapbox/node-pre-gyp

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including native wrtc module
RUN npm install --omit=dev

# Copy source
COPY src/ ./src/

# Create data directory
RUN mkdir -p /data

# Environment variables
ENV PORT=8080
ENV DATA_DIR=/data
ENV NODE_ENV=production

# Expose default port (can be overridden)
EXPOSE 8080

# Health check - verify WebSocket server is listening
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "const net = require('net'); const client = new net.Socket(); client.connect(process.env.PORT || 8080, '127.0.0.1', () => { client.destroy(); process.exit(0); }); client.on('error', () => process.exit(1));"

# Run as non-root user for security
RUN useradd -r -s /bin/false sw33t && chown -R sw33t:sw33t /app /data
USER sw33t

# Start the relay
CMD ["node", "src/index.js"]
