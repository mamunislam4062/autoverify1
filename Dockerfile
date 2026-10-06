# ---------------------------------------------------------------------------
# Auto Verify — production image for Railway / docker-compose
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

# Chromium + fonts (Puppeteer drives this at runtime for automation tasks).
# Installed from Debian so .npmrc's `puppeteer_skip_download=true` can stay on
# and we don't waste build time/bandwidth downloading a second browser.
#
# ffmpeg + python3 are for the Live Stream Assistant worker
# (services/livestream): PyTgCalls pipes audio through ffmpeg and yt-dlp
# resolves the track. Without them the admin panel reports that streaming
# is not installed instead of pretending the stream started.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-noto-cjk \
        ca-certificates \
        ffmpeg \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Live Stream Assistant worker (Pyrogram + PyTgCalls + yt-dlp).
# Its own layer so source-only changes do not reinstall the stack.
COPY services/livestream/requirements.txt /tmp/ls-requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r /tmp/ls-requirements.txt \
    && rm -f /tmp/ls-requirements.txt

# Puppeteer: skip the bundled browser download, point at the system Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    TZ=Asia/Dhaka

WORKDIR /app

# Dependencies first, so source-only changes don't bust the install layer.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

# Application source. Sensitive/local files are excluded via .dockerignore
# (.env, database.json, node_modules, backups, ...).
COPY . .

# The official node image ships a `node` user — drop privileges and make sure
# the writable paths (JSON DB, backups, uploads) belong to it.
RUN mkdir -p /app/backups /app/web/uploads \
    && chown -R node:node /app
USER node

# Railway injects PORT and proxies to it; server.js reads process.env.PORT.
EXPOSE 3000

CMD ["node", "server.js"]
