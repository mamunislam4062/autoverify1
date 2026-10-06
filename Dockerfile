# ---------------------------------------------------------------------------
# Auto Verify — production image for Railway / docker-compose
# ---------------------------------------------------------------------------

# ---- Stage 1: build the Live Stream Assistant Python stack ----------------
# tgcrypto and py-tgcalls ship native extensions, so they have to be compiled.
# Building them in a throwaway stage keeps the compiler and the Python
# headers out of the final image, which would otherwise grow by a few hundred
# megabytes.
FROM python:3.12-slim-bookworm AS lsdeps

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        python3-dev \
        libssl-dev \
        libffi-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY services/livestream/requirements.txt /tmp/ls-requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir --prefer-binary --target /opt/lsdeps -r /tmp/ls-requirements.txt

# ---- Final image ----------------------------------------------------------
FROM node:22-bookworm-slim

# Chromium + fonts (Puppeteer drives this at runtime for automation tasks).
# Installed from Debian so .npmrc's puppeteer_skip_download=true can stay and
# we don't waste build time/bandwidth downloading a second browser.
#
# ffmpeg and python3 are runtime needs for the Live Stream Assistant worker:
# PyTgCalls pipes audio through ffmpeg and yt-dlp resolves the track. The
# Python packages themselves come from the lsdeps stage above.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-noto-cjk \
        ca-certificates \
        ffmpeg \
        python3 \
    && rm -rf /var/lib/apt/lists/*

# Prebuilt worker stack (Pyrogram, PyTgCalls, tgcrypto, yt-dlp).
COPY --from=lsdeps /opt/lsdeps /opt/lsdeps

# Expose yt-dlp as a plain command as well, in case the console script path
# differs between install methods.
RUN ln -sf /opt/lsdeps/bin/yt-dlp /usr/local/bin/yt-dlp || true

ENV PYTHONPATH=/opt/lsdeps

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
