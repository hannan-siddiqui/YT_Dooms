FROM node:22-bookworm-slim

# Install system tools, Python3, and FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install yt-dlp and turbo cipher resolver dependencies
RUN pip install --no-cache-dir yt-dlp yt-dlp-ejs pycryptodomex brotli mutagen

WORKDIR /app

# Copy dependency specifications and install
COPY package*.json ./
RUN npm ci

# Copy app source code
COPY . .

# Build Next.js production bundle
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Expose Next.js server port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start Next.js production server
CMD ["npm", "run", "start"]
