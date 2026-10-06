/**
 * Live Stream Assistant bridge
 *
 * The actual streaming engine is the Python worker in services/livestream
 * (Pyrogram + PyTgCalls + yt-dlp). Node cannot stream audio into a Telegram
 * group call, so this module owns the worker process and exposes a small
 * promise-based client for the Express layer.
 *
 * Design notes:
 *  - The worker is optional. If Python or its dependencies are missing the
 *    bridge reports `available: false` instead of pretending, and the admin
 *    panel shows that streaming is not installed.
 *  - Credentials live in the JSON database and can change at any time, so we
 *    push them to the worker whenever they differ from what we last sent.
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const WORKER_DIR = path.join(__dirname, 'livestream');
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py');
const HOST = process.env.LIVESTREAM_WORKER_HOST || '127.0.0.1';
const PORT = parseInt(process.env.LIVESTREAM_WORKER_PORT || '8099', 10);
const STARTUP_TIMEOUT_MS = 15000;

let proc = null;
let starting = null;
let lastProvisioned = '';
let lastWorkerError = '';

function log(...args) {
    console.log('[LIVESTREAM]', ...args);
}

/** POST JSON to the worker. Resolves with the parsed body. */
function workerPost(pathname, body, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body || {});
        const req = http.request({
            host: HOST,
            port: PORT,
            path: pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: timeoutMs,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data || '{}')); }
                catch (e) { reject(new Error('Worker returned invalid JSON: ' + data.slice(0, 200))); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Worker request timed out')));
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/** Start the worker process once, concurrently-safe. */
async function ensureStarted() {
    if (proc && !proc.killed) return true;
    if (starting) return starting;

    starting = (async () => {
        const python = process.env.LIVESTREAM_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
        log('starting worker:', WORKER_SCRIPT);
        try {
            const child = spawn(python, [WORKER_SCRIPT], {
                cwd: WORKER_DIR,
                env: { ...process.env, PYTHONUNBUFFERED: '1' },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child.stdout.on('data', (b) => process.stdout.write('[livestream:py] ' + b));
            child.stderr.on('data', (b) => process.stderr.write('[livestream:py] ' + b));
            child.on('error', (err) => {
                lastWorkerError = err.message;
                log('worker failed to spawn:', err.message);
                proc = null;
            });
            child.on('exit', (code) => {
                log('worker exited with code', code);
                proc = null;
            });
            proc = child;

            // Wait until /health answers.
            const deadline = Date.now() + STARTUP_TIMEOUT_MS;
            while (Date.now() < deadline) {
                if (!proc) throw new Error('worker process died during startup');
                try {
                    const res = await workerPost('/health', {}, 2000);
                    log('worker healthy:', JSON.stringify(res));
                    return true;
                } catch (e) {
                    await new Promise((r) => setTimeout(r, 400));
                }
            }
            throw new Error('worker did not become healthy in time');
        } catch (err) {
            lastWorkerError = err.message;
            log('worker unavailable:', err.message);
            proc = null;
            return false;
        } finally {
            starting = null;
        }
    })();

    return starting;
}

/**
 * Push the saved credentials to the worker when they changed.
 * `settings` is db.data.adminSettings.groupManagement
 */
async function provision(settings) {
    const apiId = (settings?.userbotApiId || '').trim();
    const apiHash = (settings?.userbotApiHash || '').trim();
    const session = (settings?.userbotSessionString || '').trim();

    const fingerprint = `${apiId}|${apiHash}|${session.length}`;
    if (fingerprint === lastProvisioned) return { skipped: true };

    if (!apiId || !apiHash || !session) {
        lastProvisioned = fingerprint;
        try {
            if (await ensureStarted()) {
                await workerPost('/configure', { apiId: '', apiHash: '', sessionString: '' });
            }
        } catch (e) { log('clear failed:', e.message); }
        return { cleared: true };
    }

    const up = await ensureStarted();
    if (!up) return { ok: false, message: 'Live Stream worker is not running.' };

    const res = await workerPost('/configure', {
        apiId, apiHash, sessionString: session,
    });
    lastProvisioned = res && res.ok ? fingerprint : lastProvisioned;
    return res;
}

/** Normalise a chat reference to a plain numeric id. */
function parseChatId(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).trim();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    const m = s.match(/^-?\d+/);
    return m ? parseInt(m[0], 10) : null;
}

/** Call a worker endpoint, provisioning credentials first. */
async function call(endpoint, payload, settings) {
    const up = await ensureStarted();
    if (!up) {
        return {
            ok: false,
            message: 'Live Stream streaming is not installed on this server. '
                + 'Install the worker (services/livestream) and ffmpeg/yt-dlp to enable it.',
        };
    }
    try {
        if (settings) await provision(settings);
        return await workerPost(endpoint, payload);
    } catch (e) {
        lastWorkerError = e.message;
        return { ok: false, message: 'Live Stream worker error: ' + e.message };
    }
}

async function health() {
    const up = await ensureStarted();
    if (!up) return { ok: false, workerUp: false, message: lastWorkerError || 'worker unavailable' };
    try {
        const res = await workerPost('/health', {}, 4000);
        return { ok: true, workerUp: true, ...res };
    } catch (e) {
        return { ok: false, workerUp: true, message: e.message };
    }
}

function shutdown() {
    if (proc && !proc.killed) {
        try { proc.kill('SIGTERM'); } catch (e) { /* ignore */ }
        proc = null;
    }
}

module.exports = {
    call,
    health,
    provision,
    parseChatId,
    ensureStarted,
    shutdown,
    WORKER_SCRIPT,
    PORT,
};
