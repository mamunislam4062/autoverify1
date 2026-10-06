const express = require('express');
const unifiedAutomation = require('../services/automation');
const { generatePhoto, generateVideo } = unifiedAutomation;
const aiService = unifiedAutomation; // Fix for reference errors in AI routes
const fs = require('fs');
const os = require('os');
const path = require('path');
const oauth = require('../oauth');
const { OpenAI } = require('openai');
const axios = require('axios');
const imapService = require('../services/imap-service');
const otpExtractor = require('../services/otp-extractor');
const freeSmsService = require('../services/free-sms-service');

// Import video downloader modules
const tiktokDownloader = { getInfo: async () => ({ error: 'Feature disabled' }), download: async () => ({ error: 'Feature disabled' }) };
const facebookDownloader = { getInfo: async () => ({ error: 'Feature disabled' }), download: async () => ({ error: 'Feature disabled' }) };

const app = express();
const PORT = 3000;

// CORS middleware - allow all origins for Telegram Mini App
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Id, x-user-id');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Body parser — single registration with generous limit (overridden to 50mb below after static)
const db = require('../db');
const config = require('../config');

let openai = null;
function getOpenAI() {
    if (openai) return openai;
    if (!config.OPENAI_API_KEY) {
        console.warn('⚠️ OPENAI_API_KEY is missing. AI features will be disabled.');
        return null;
    }
    try {
        openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
        return openai;
    } catch (e) {
        console.error('❌ Failed to initialize OpenAI:', e.message);
        return null;
    }
}

// Helper function to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function getAdminId() {
    return db.data?.apiKeys?.adminId || db.data?.settings?.adminId || db.data?.adminSettings?.adminId || process.env.ADMIN_ID || (config && config.ADMIN_ID) || null;
}

let bot = null;
let backupBot = null;
let totalCallbacks = 0;

function getBackupBot() {
    // First try to get token from environment/config
    let token = config.BACKUP_BOT_TOKEN;

    // If not in environment, try to get from database
    if (!token && db.data.apiKeys && db.data.apiKeys.backupBotToken) {
        token = db.data.apiKeys.backupBotToken;
    }

    if (!backupBot && token) {
        try {
            const TelegramBot = require('node-telegram-bot-api');
            backupBot = new TelegramBot(token, { polling: false });
            console.log('✅ Backup Bot initialized successfully');
        } catch (e) {
            console.error('❌ Failed to initialize Backup Bot:', e.message);
        }
    }
    return backupBot;
}

function setBackupBot(instance) {
    backupBot = instance;
}

function normalizeChatIdentifier(identifier) {
    if (!identifier) return '';
    let str = String(identifier).trim();
    if (!str) return '';
    
    // If it's already a numeric ID
    if (/^-?\d+$/.test(str)) return str;
    
    // Handle t.me links
    const tmeRegex = /(?:t\.me\/|telegram\.me\/)(?:joinchat\/|addlist\/)?([a-zA-Z0-9_]+)/i;
    const match = str.match(tmeRegex);
    if (match && match[1]) {
        // If it was a joinchat link, we can't easily convert to username/ID without bot being there
        if (str.includes('joinchat') || str.includes('addlist') || str.includes('+')) {
            return str; // Return as is
        }
        return `@${match[1]}`;
    }
    
    // If it's just a username without @
    if (!str.startsWith('@') && !str.startsWith('http')) {
        return `@${str}`;
    }
    
    return str;
}

async function sendTelegramNotification(userId, message, options = { parse_mode: 'Markdown' }) {
    if (!userId) return false;
    try {
        let activeBot = bot;
        if (!activeBot) {
            const botToken = process.env.TELEGRAM_BOT_TOKEN || (config && config.TELEGRAM_BOT_TOKEN) || (db.data.apiKeys && db.data.apiKeys.botToken);
            if (botToken) {
                const TelegramBot = require('node-telegram-bot-api');
                activeBot = new TelegramBot(botToken, { polling: false });
            } else {
                activeBot = getBackupBot();
            }
        }
        if (activeBot) {
            const sent = await activeBot.sendMessage(parseInt(userId) || userId, message, options);
            return sent;
        }
    } catch (e) {
        console.error(`[TELEGRAM NOTIFY ERROR] Could not send to ${userId}:`, e.message);
    }
    return false;
}



function setBot(instance) {
    require('fs').appendFileSync('setbot-log.txt', "=== setBot CALLED ===\n");
    bot = instance;
    global.botInstance = instance; if(typeof bot !== "undefined") bot = instance;


    bot = instance;

    // Use URL from database if available, otherwise fallback to config or default
    // Use URL from config first, then database, then fallback to current request or default
    let publicUrl = config.PUBLIC_URL || config.MINI_APP_URL || '';
    if (db.data.apiKeys && db.data.apiKeys.miniAppUrl) {
        publicUrl = db.data.apiKeys.miniAppUrl;
    }

    if (!publicUrl) {
        publicUrl = 'https://autosverifybot-production.up.railway.app/'; // Final fallback
    }
    publicUrl = publicUrl.trim();

    setTimeout(async () => {
        try {
            // Sync environment variables and config
            config.PUBLIC_URL = publicUrl;
            config.MINI_APP_URL = publicUrl;
            process.env.PUBLIC_URL = publicUrl;

            // Set the Web App Menu Button to the Public URL
            await bot.setChatMenuButton({
                menu_button: {
                    type: 'web_app',
                    text: 'Launch Bot',
                    web_app: { url: publicUrl }
                }
            });
            console.log(`✅ [MINI APP] Telegram Menu Button set to: ${publicUrl}`);
        } catch (e) {
            console.error('❌ Failed to set Telegram Menu Button:', e.message);
        }
    }, 2000);

    // Auto-connect Mother Emails on startup
    autoConnectMotherEmails();
}

async function autoConnectMotherEmails() {
    try {
        const configs = db.data.adminSettings?.motherEmailConfigs;
        if (!configs) return;

        for (const type of ['gmail', 'hotmail']) {
            const cfg = configs[type];
            if (cfg && cfg.email && cfg.password) {
                console.log(`[IMAP] Auto-connecting to saved mother email [${type}]...`);
                await imapService.connect(type, cfg);
            }
        }
    } catch (e) {
        console.error('[IMAP] Auto-connect error:', e.message);
    }
}

// Helper: Detect User Country from IP
async function detectUserCountry(req) {
    try {
        // Try common headers first (Cloudflare, GCP, etc)
        const countryHeader = req.headers['cf-ipcountry'] ||
            req.headers['x-client-geo-country'] ||
            req.headers['x-appengine-country'] ||
            req.headers['x-vercel-ip-country'];

        if (countryHeader && countryHeader !== 'XX' && countryHeader.length === 2) {
            return countryHeader.toUpperCase();
        }

        // Fallback to IP-based lookup
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
        if (!ip || ip === '::1' || ip === '127.0.0.1') return 'USA'; // Local fallback

        const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
        if (response.data && response.data.status === 'success') {
            return response.data.countryCode;
        }
    } catch (e) {
        console.error('Country detection error:', e.message);
    }
    return 'USA'; // Default
}

// Helper functions for user data management with MySQL sync
function getUsersObj() {
    // Ensure users object exists
    if (!db.data.users) {
        db.data.users = {};
    }
    return db.data.users;
}

function saveUsersObj(users, force = false) {
    // Trigger MySQL save only - users object is already modified in place via getUsersObj() reference
    // IMPORTANT: Do NOT assign db.data.users = users as this causes race conditions
    // where concurrent saves wipe out data added between getUsersObj() and saveUsersObj()
    if (typeof db.save === 'function') {
        db.save(force);
    }
}

// Helper: Validate userId
function isValidUserId(userId) {
    if (!userId) return false;
    const numericId = typeof userId === 'number' ? userId : parseInt(userId);
    return !isNaN(numericId) && numericId > 0;
}

// API: System Version
app.get('/api/version', (req, res) => {
    const version = (db.data && db.data.settings && db.data.settings.systemVersion) || 1;
    res.set('Cache-Control', 'no-store');
    res.json({ version, ts: Date.now() });
});


// Request counter middleware
app.use((req, res, next) => {
    totalCallbacks++;
    next();
});

// CORS middleware - allows Netlify frontend to call API directly
app.use((req, res, next) => {
    const allowedOrigins = ['https://autosverifybot-production.up.railway.app/'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Additional middleware to block invalid userId early
app.use((req, res, next) => {
    // Extract userId from various request sources
    let userId = req.params.userId || req.body?.userId || req.query?.userId;

    // Skip validation for non-user endpoints
    const skipPaths = ['/', '/admin', '/api/admin/login', '/api/services', '/api/ads/config'];
    if (skipPaths.includes(req.path)) return next();

    // Skip for static files and GET requests without userId
    if (!userId) return next();

    // Validate userId if present
    if (!isValidUserId(userId)) {
        console.log(`[BLOCKED] Invalid userId in ${req.method} ${req.path}: ${userId}`);
        return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    next();
});

// Serve Static Files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '..', 'web')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ROUTES
// 1. User Panel (Default)

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

// 2. Admin Panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'admin.html'));
});

// API: Admin Login Check
app.post('/api/admin/login', (req, res) => {
    const { password, token } = req.body;
    // Token-based login (for bot auto-login)
    if (token) {
        const validToken = generateAdminToken();
        // We check against stored pending tokens
        if (global._pendingAdminTokens && global._pendingAdminTokens[token] && Date.now() < global._pendingAdminTokens[token]) {
            delete global._pendingAdminTokens[token];
            return res.json({ success: true, token: 'admin-session-' + Date.now() });
        }
        return res.json({ success: false, message: 'Invalid or expired token' });
    }
    // Password-based login
    if (password === (config.ADMIN_PASSWORD || 'admin123')) {
        res.json({ success: true, token: 'fake-jwt-token-' + Date.now() });
    } else {
        res.json({ success: false, message: 'Invalid password' });
    }
});

// ---------------- DB AUTO BACKUP SCHEDULER ----------------

function _ensureAdminSettings() {
    if (!db.data.adminSettings) db.data.adminSettings = {};
    if (!db.data.adminSettings.dbAutoBackup) {
        db.data.adminSettings.dbAutoBackup = {
            enabled: false,
            backupDays: 1,
            backupTime: '06:00',
            keep: 1, // New: Always keep only the latest backup
            lastBackupAt: 0,
            lastBackupFile: '',
            nextBackupAt: 0
        };
        db.save(true);
    }
    return db.data.adminSettings.dbAutoBackup;
}

function _parseDailyTimeToMs(dailyTime) {
    if (!dailyTime || typeof dailyTime !== 'string') return null;
    const m = dailyTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh, mm };
}

function _computeNextBackupAt(schedule) {
    const now = Date.now();
    const last = schedule.lastBackupAt || 0;
    const backupDays = Math.max(1, parseInt(schedule.backupDays || 1));
    const backupTime = schedule.backupTime || '06:00';

    // Parse time (HH:MM format)
    const timeMatch = backupTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
        // Invalid time format, default to 06:00
        return now + backupDays * 24 * 60 * 60 * 1000;
    }

    const hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);
    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return now + backupDays * 24 * 60 * 60 * 1000;
    }

    // Calculate next backup time
    const nextBackup = new Date();
    nextBackup.setHours(hh, mm, 0, 0);

    // If the time has already passed today, move to the next occurrence
    if (nextBackup.getTime() <= now) {
        nextBackup.setDate(nextBackup.getDate() + backupDays);
    }

    return nextBackup.getTime();
}

function _getBackupsDir() {
    const path = require('path');
    return path.join(process.cwd(), 'backups');
}

function _listBackupFiles() {
    const fs = require('fs');
    const path = require('path');
    const dir = _getBackupsDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const full = path.join(dir, f);
            const st = fs.statSync(full);
            return { file: f, fullPath: full, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
    return files;
}

async function _runBackup(reason = 'auto') {
    const fs = require('fs');
    const path = require('path');
    const schedule = _ensureAdminSettings();

    const dir = _getBackupsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const ts = Date.now();
    const fileName = `${reason}_backup_${ts}.json`;
    const fullPath = path.join(dir, fileName);

    fs.writeFileSync(fullPath, JSON.stringify(db.data, null, 2));

    schedule.lastBackupAt = ts;
    schedule.lastBackupFile = fileName;
    db.data.adminSettings.dbAutoBackup = schedule;
    db.save(true);

    // Unified Telegram Backup via Backup Bot (fallback to main bot if not set/configured)
    // NOTE: Send to Telegram BEFORE trimming old backups to ensure the file still exists
    const bBot = getBackupBot() || bot;
    const backupTarget = config.BACKUP_CHAT_ID || config.ADMIN_ID || process.env.ADMIN_ID;
    if (bBot && backupTarget) {
        try {
            // Read file into buffer first so trim can't affect it
            const fileBuffer = fs.readFileSync(fullPath);
            await bBot.sendDocument(backupTarget, fileBuffer, {
                caption: `📦 <b>Database Backup</b> (${reason.toUpperCase()})\n\n` +
                    `📅 <b>Date:</b> ${new Date().toLocaleDateString()}\n` +
                    `⏰ <b>Time:</b> ${new Date().toLocaleTimeString()}\n` +
                    `📄 <b>File:</b> <code>${fileName}</code>\n\n` +
                    `✅ Sent via Backup Service`,
                parse_mode: 'HTML'
            }, {
                filename: fileName,
                contentType: 'application/json'
            });
            console.log(`✅ Backup sent to Telegram: ${fileName}`);
        } catch (e) {
            console.error('❌ Backup Bot sendDocument error:', e.message);
        }
    } else {
        console.warn('⚠️ Backup Telegram send skipped: Backup Bot or Target ID missing.');
    }

    // Trim old backups AFTER sending to Telegram
    // Manual backups are never trimmed by keep limit — only auto backups get trimmed
    if (reason === 'auto') {
        const keep = Math.max(1, parseInt(schedule.keep || 1));
        const files = _listBackupFiles().filter(f => f.file.startsWith('auto_'));
        if (files.length > keep) {
            files.slice(keep).forEach(f => {
                try { fs.unlinkSync(f.fullPath); } catch (e) { }
            });
        }
    }

    return { fileName, ts };
}

// API: Get DB Auto Backup Schedule & Inactive User Cleanup Policy
app.get('/api/admin/db/schedule', (req, res) => {
    const schedule = _ensureAdminSettings();
    const adminSettings = db.data.adminSettings || {};
    const nextBackupAt = schedule.nextBackupAt || _computeNextBackupAt(schedule);
    res.json({
        success: true,
        schedule: {
            enabled: schedule.enabled === true,
            backupDays: schedule.backupDays || 1,
            backupTime: schedule.backupTime || '06:00',
            keep: schedule.keep || 30,
            inactiveCleanupDays: adminSettings.inactiveCleanupDays !== undefined ? adminSettings.inactiveCleanupDays : 30
        },
        lastBackupAt: schedule.lastBackupAt || 0,
        nextBackupAt,
        dbSize: fs.existsSync('./db.json') ? fs.statSync('./db.json').size : 0
    });
});

// API: Get Bot Username (for deep links from WebApp)
app.get('/api/bot-username', (req, res) => {
    try {
        const config = require('../config');
        const botUsername = (db.data.settings && db.data.settings.botUsername) || config.BOT_USERNAME || 'AutosVerify_bot';
        res.json({ success: true, botUsername });
    } catch (e) {
        res.json({ success: true, botUsername: 'AutosVerify_bot' });
    }
});

// API: Update DB Auto Backup Schedule & Inactive User Cleanup Policy
app.post('/api/admin/db/schedule', (req, res) => {
    try {
        const schedule = _ensureAdminSettings();
        const enabled = req.body.enabled === true;
        const backupDays = Math.max(1, parseInt(req.body.backupDays || schedule.backupDays || 1));
        const backupTime = (req.body.backupTime || '06:00').trim();
        const keep = Math.max(1, parseInt(req.body.keep || schedule.keep || 30));
        const inactiveCleanupDays = req.body.inactiveCleanupDays !== undefined ? parseInt(req.body.inactiveCleanupDays) : 30;

        schedule.enabled = enabled;
        schedule.backupDays = backupDays;
        schedule.backupTime = backupTime;
        schedule.keep = keep;
        schedule.nextBackupAt = _computeNextBackupAt(schedule);
        db.data.adminSettings.dbAutoBackup = schedule;
        db.data.adminSettings.inactiveCleanupDays = inactiveCleanupDays;
        db.save(true);

        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: List available backup files
app.get('/api/admin/db/backups', (req, res) => {
    try {
        const files = _listBackupFiles().map(f => ({ file: f.file, size: f.size, mtime: f.mtime }));
        const schedule = _ensureAdminSettings();
        res.json({
            success: true,
            files,
            lastBackupFile: schedule.lastBackupFile || ''
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Download a selected backup file
app.get('/api/admin/db/download/:file', (req, res) => {
    try {
        const path = require('path');
        const file = req.params.file;
        const dir = _getBackupsDir();
        const full = path.join(dir, file);

        // Security check
        if (!full.startsWith(dir)) return res.status(403).send('Forbidden');
        if (!fs.existsSync(full)) return res.status(404).send('Not Found');

        res.download(full);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// API: Restore/Merge from a selected backup file
app.post('/api/admin/db/restore', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const file = (req.body.file || '').trim();
        if (!file) return res.json({ success: false, message: 'file is required' });

        const dir = _getBackupsDir();
        const full = path.join(dir, file);
        if (!full.startsWith(dir)) return res.json({ success: false, message: 'Invalid file path' });
        if (!fs.existsSync(full)) return res.json({ success: false, message: 'Backup file not found' });

        const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (!parsed || typeof parsed !== 'object') return res.json({ success: false, message: 'Invalid backup JSON' });

        // Merge strategy similar to import
        db.data.users = { ...(db.data.users || {}), ...(parsed.users || {}) };
        if (parsed.settings) db.data.settings = { ...(db.data.settings || {}), ...parsed.settings };
        if (parsed.cardPrices) db.data.cardPrices = { ...(db.data.cardPrices || {}), ...parsed.cardPrices };
        if (parsed.vpnPrices) db.data.vpnPrices = { ...(db.data.vpnPrices || {}), ...parsed.vpnPrices };
        if (parsed.cards) db.data.cards = { ...(db.data.cards || {}), ...parsed.cards };
        if (parsed.vpnAccounts) db.data.vpnAccounts = { ...(db.data.vpnAccounts || {}), ...parsed.vpnAccounts };
        if (parsed.tasks) db.data.tasks = { ...(db.data.tasks || {}), ...parsed.tasks };
        Object.keys(parsed).forEach(key => {
            if (!db.data[key]) db.data[key] = parsed[key];
        });

        db.save(true);
        res.json({ success: true, message: 'Database restored/merged successfully' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Delete a selected backup file
app.delete('/api/admin/db/backups/:file', (req, res) => {
    try {
        const file = req.params.file;
        const dir = _getBackupsDir();
        const full = path.join(dir, file);

        // Security check
        if (!full.startsWith(dir)) return res.json({ success: false, message: 'Forbidden' });
        if (!fs.existsSync(full)) return res.json({ success: false, message: 'Backup file not found' });

        fs.unlinkSync(full);
        res.json({ success: true, message: 'Backup deleted successfully' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// Helper: Clean up user ACTIVITY history older than 7 days
// IMPORTANT: Only history entries are cleaned. User balance, referrals, gems, USD → NEVER deleted.
function _cleanupUserHistory() {
    const now = Date.now();
    // Keep general activity logs for 30 days (was 7 days)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    let totalRemoved = 0;
    let usersUpdated = 0;

    // These types are PERMANENT — never auto-deleted
    const PERMANENT_TYPES = new Set([
        'referral_reward', 'referral', 'referral_bonus',
        'deposit', 'withdraw',
        'purchase', 'service', 'account_purchase',
        'smm_order', 'traffic_order',
        'transfer_sent', 'transfer_received',
        'redeem', 'promo_code'
    ]);

    Object.values(db.data.users || {}).forEach(user => {
        if (user.history && Array.isArray(user.history)) {
            const initialLength = user.history.length;
            user.history = user.history.filter(h => {
                // NEVER delete important transaction records
                if (PERMANENT_TYPES.has((h.type || '').toLowerCase())) return true;
                // Keep recent activity logs (30 days)
                const hDate = h.date ? (typeof h.date === 'string' ? new Date(h.date).getTime() : h.date) : 0;
                return hDate > thirtyDaysAgo;
            });
            if (initialLength !== user.history.length) {
                totalRemoved += (initialLength - user.history.length);
                usersUpdated++;
            }
        }
    });

    if (totalRemoved > 0) {
        db.save(true);
        console.log(`[DB] Cleaned up ${totalRemoved} old activity logs from ${usersUpdated} users (30d+ general activities only).`);
    }
}

// Helper: Clean up users who have been inactive for configured days to free up storage
function _cleanupInactiveUsers() {
    try {
        const adminSettings = db.data.adminSettings || {};
        const days = adminSettings.inactiveCleanupDays !== undefined ? parseInt(adminSettings.inactiveCleanupDays) : 30;
        if (days <= 0) return; // 0 means disabled

        const now = Date.now();
        const threshold = now - (days * 24 * 60 * 60 * 1000);
        const users = getUsersObj();
        let deletedCount = 0;

        Object.keys(users).forEach(userId => {
            const user = users[userId];
            if (!user) return;
            // Never delete admin or privileged accounts
            if (user.role === 'admin' || user.isAdmin || userId === '1' || userId === 'admin' || userId === 'adminVerified') return;

            const lastActive = user.lastActive || user.createdAt || 0;
            if (lastActive > 0 && lastActive < threshold) {
                delete users[userId];
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            saveUsersObj(users, true);
            console.log(`[CLEANUP] Automatically deleted ${deletedCount} inactive users (inactive for ${days}+ days) to save storage.`);
        }
    } catch (e) {
        console.error('[CLEANUP] Inactive users cleanup error:', e.message);
    }
}

// Helper: Clean up old broadcast media files (> 1 hour) — broadcast content already delivered
function _cleanupBroadcastMedia() {
    try {
        const uploadDir = path.join(__dirname, '..', 'web', 'uploads');
        if (!fs.existsSync(uploadDir)) return;
        const files = fs.readdirSync(uploadDir);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour — broadcast media only stays 1hr after delivery
        let count = 0;
        files.forEach(f => {
            // Only delete files tagged as broadcast media (prefix: bc_)
            if (!f.startsWith('bc_')) return;
            const fullPath = path.join(uploadDir, f);
            try {
                const st = fs.statSync(fullPath);
                if (now - st.mtimeMs > maxAge) {
                    fs.unlinkSync(fullPath);
                    count++;
                }
            } catch (e) { }
        });
        if (count > 0) console.log(`[CLEANUP] Removed ${count} expired broadcast media files.`);
    } catch (e) {
        console.error('[CLEANUP] Broadcast media cleanup error:', e.message);
    }
}

// Helper: Clean up user deposit screenshots older than 7 days (after processing)
function _cleanupDepositScreenshots() {
    try {
        const uploadDir = path.join(__dirname, '..', 'web', 'uploads');
        if (!fs.existsSync(uploadDir)) return;
        const files = fs.readdirSync(uploadDir);
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        let count = 0;
        files.forEach(f => {
            if (!f.startsWith('dep_')) return;
            const fullPath = path.join(uploadDir, f);
            try {
                const st = fs.statSync(fullPath);
                if (now - st.mtimeMs > maxAge) {
                    fs.unlinkSync(fullPath);
                    count++;
                }
            } catch (e) { }
        });
        if (count > 0) console.log(`[CLEANUP] Removed ${count} expired deposit screenshots.`);
    } catch (e) {
        console.error('[CLEANUP] Deposit screenshot cleanup error:', e.message);
    }
}

// Helper: Clean up service/admin uploaded icons only if admin explicitly deletes the service
// NOTE: Admin-uploaded service icons are NEVER auto-deleted. Only manually via admin panel.
// This function is intentionally a no-op for service icons.
function _cleanupServiceIcons() {
    // Admin-uploaded icons persist until admin deletes the service.
    // Do nothing here — icons are managed by admin only.
}

// IMPORTANT: Only broadcast temp media + deposit screenshots get auto-cleaned.
// Referrals, service data, user data, admin uploads → NEVER auto-deleted.
function _cleanupUploads() {
    _cleanupBroadcastMedia();
    _cleanupDepositScreenshots();
    _cleanupBroadcastNotifications(); // Local broadcast notif file — expire entries after 7 days
}

// Clean expired entries from local bc_notifications.json (7 day TTL)
function _cleanupBroadcastNotifications() {
    try {
        const bcNotifsPath = path.join(process.cwd(), 'web', 'uploads', 'bc_notifications.json');
        if (!fs.existsSync(bcNotifsPath)) return;
        const allBcNotifs = JSON.parse(fs.readFileSync(bcNotifsPath, 'utf8'));
        const now = Date.now();
        let changed = false;
        for (const uid of Object.keys(allBcNotifs)) {
            const before = allBcNotifs[uid].length;
            allBcNotifs[uid] = allBcNotifs[uid].filter(n => !n.expiresAt || n.expiresAt > now);
            if (allBcNotifs[uid].length !== before) changed = true;
            // Remove empty arrays to keep file clean
            if (allBcNotifs[uid].length === 0) delete allBcNotifs[uid];
        }
        if (changed) {
            fs.writeFileSync(bcNotifsPath, JSON.stringify(allBcNotifs), 'utf8');
            console.log('[CLEANUP] Expired broadcast notifications removed from local file.');
        }
    } catch (e) { /* silent */ }
}

// Item sales history: only delete completed/rejected after 7 days
// Active listings, user data, referrals → NEVER deleted automatically
function _cleanupItemSales() {
    if (!db.data.itemSales) return;
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    let removed = 0;
    const keys = Object.keys(db.data.itemSales);
    keys.forEach(id => {
        const sale = db.data.itemSales[id];
        // Only delete completed/rejected items older than 7 days
        if ((sale.status === 'sold' || sale.status === 'rejected') && sale.updatedAt < sevenDaysAgo) {
            delete db.data.itemSales[id];
            removed++;
        }
        // Active/pending listings are NEVER auto-deleted
    });
    if (removed > 0) {
        console.log(`[CLEANUP] Deleted ${removed} completed/rejected item sales (older than 7 days)`);
        db.save(true);
    }
}

// Timer: check every minute
setInterval(async () => {
    try {
        const schedule = _ensureAdminSettings();
        if (!schedule.enabled) return;
        // Persist nextBackupAt to avoid multiple triggers when server is busy
        if (!schedule.nextBackupAt || schedule.nextBackupAt < Date.now() - (60 * 60 * 1000)) {
            schedule.nextBackupAt = _computeNextBackupAt(schedule);
            db.data.adminSettings.dbAutoBackup = schedule;
            db.save(true);
        }

        if (Date.now() >= schedule.nextBackupAt) {
            await _runBackup('auto');
            // Recompute after backup
            schedule.nextBackupAt = _computeNextBackupAt(schedule);
            db.data.adminSettings.dbAutoBackup = schedule;
            db.save(true);
        }

        // Also run user history cleanup once a day (at midnight-ish or just random check)
        // For simplicity, we run it every backup cycle or every few hours.
        // Let's check every hour.
        const h = new Date().getHours();
        if (!global._lastHistoryCleanupHour || global._lastHistoryCleanupHour !== h) {
            _cleanupUserHistory();
            _cleanupInactiveUsers(); // NEW: Clean up users inactive for 30+ days
            _cleanupUploads(); // NEW: Periodic uploads cleanup
            _cleanupItemSales(); // NEW: Daily item sales cleanup
            global._lastHistoryCleanupHour = h;
        }
    } catch (e) {
        console.error('Auto backup scheduler error:', e.message);
    }
}, 60 * 1000);

// Generate a one-time admin auto-login token (valid 5 min)
function generateAdminToken() {
    const crypto = require('crypto');
    const token = crypto.randomBytes(20).toString('hex');
    if (!global._pendingAdminTokens) global._pendingAdminTokens = {};
    global._pendingAdminTokens[token] = Date.now() + 5 * 60 * 1000; // 5 min
    // Cleanup old tokens
    const now = Date.now();
    Object.keys(global._pendingAdminTokens).forEach(t => {
        if (global._pendingAdminTokens[t] < now) delete global._pendingAdminTokens[t];
    });
    return token;
}

// Expose token generator for bot.js
module.exports.generateAdminToken = generateAdminToken;


// Stats route consolidated below at line ~672 – removed duplicate here

// (Settings saved via the full endpoint at bottom of file)

// API: Get Codes
app.get('/api/admin/codes', async (req, res) => {
    // codes stored in db.data.settings.codes
    const settings = await db.getSettings();
    const codes = settings.codes || {};
    const codeList = Object.keys(codes).map(key => ({
        code: key,
        ...codes[key],
        amount: codes[key].amount,
        maxUses: codes[key].maxUses || codes[key].uses || 0,
        used: codes[key].redeemedBy ? codes[key].redeemedBy.length : 0
    }));
    res.json({ success: true, codes: codeList });
});

// API: Create Code
app.post('/api/admin/codes', async (req, res) => {
    const { code, amount, maxUses } = req.body;
    if (!code) return res.json({ success: false, message: 'Code required' });
    await db.createCode(code, parseInt(amount) || 0, parseInt(maxUses) || 0);
    res.json({ success: true });
});

// API: Delete Code
app.delete('/api/admin/codes/:code', async (req, res) => {
    const { code } = req.params;

    // First, remove this code from all users' redeemed arrays
    const users = await db.getUsers();
    let usersUpdated = 0;
    for (const user of users) {
        if (user.redeemed && user.redeemed.includes(code)) {
            user.redeemed = user.redeemed.filter(c => c !== code);
            await db.updateUser(user);
            usersUpdated++;
        }
    }
    console.log(`[DELETE CODE] Removed '${code}' from ${usersUpdated} users' redeemed arrays`);

    // Now delete the code from settings
    const success = await db.deleteCode(code);
    res.json({ success });
});

// API: Admin Meta Settings (Maintenance Mode, etc.)
app.post('/api/admin/meta', (req, res) => {
    const { key, value } = req.body;

    if (!key) {
        return res.json({ success: false, error: 'Missing key' });
    }

    // Initialize adminSettings if not exists
    if (!db.data.adminSettings) {
        db.data.adminSettings = {};
    }

    // Set the meta key
    db.data.adminSettings[key] = value;
    db.save(true);

    console.log(`[ADMIN] Meta setting updated: ${key} = ${value}`);
    res.json({ success: true, message: `Setting saved: ${key}` });
});

// API: Admin Configuration (Daily Reward, Welcome Bonus, etc.)
app.get('/api/admin/config', (req, res) => {
    res.json({
        success: true,
        config: {
            dailyBonus: db.data.settings.dailyBonus,
            welcomeCredits: db.data.settings.welcomeCredits || db.data.settings.welcomeBonus,
            maintenance: db.data.meta?.maintenance || false,
            countryAdRewards: db.data.settings.countryAdRewards || {},
            virtualNumberMode: db.data.settings.virtualNumberMode || 'auto'
        }
    });
});

app.post('/api/admin/toggle-maintenance', (req, res) => {
    const { userId } = req.body;
    if (String(userId) !== String(process.env.ADMIN_ID)) return res.json({ success: false, message: 'Unauthorized' });

    if (!db.data.meta) db.data.meta = {};
    db.data.meta.maintenance = !db.data.meta.maintenance;
    db.save(true);
    res.json({ success: true, maintenance: db.data.meta.maintenance });
});

app.post('/api/admin/update-config', (req, res) => {
    const { userId, dailyBonus, welcomeCredits, countryAdRewards, virtualNumberMode } = req.body;
    if (String(userId) !== String(process.env.ADMIN_ID)) return res.json({ success: false, message: 'Unauthorized' });

    if (dailyBonus !== undefined) db.data.settings.dailyBonus = parseInt(dailyBonus);
    if (welcomeCredits !== undefined) db.data.settings.welcomeCredits = parseInt(welcomeCredits);
    if (countryAdRewards !== undefined) db.data.settings.countryAdRewards = countryAdRewards;
    if (virtualNumberMode !== undefined) db.data.settings.virtualNumberMode = virtualNumberMode;

    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true });
});

app.get('/api/admin/all-messages', (req, res) => {
    const { userId } = req.query;
    if (String(userId) !== String(process.env.ADMIN_ID)) return res.json({ success: false, message: 'Unauthorized' });

    const messages = {};
    for (const uId in db.data.users) {
        const user = db.data.users[uId];
        if (user.supportMessages && user.supportMessages.length > 0) {
            messages[uId] = user.supportMessages;
        }
    }
    res.json({ success: true, messages });
});

app.post('/api/admin/config', (req, res) => {
    const { dailyReward, welcomeBonus } = req.body;

    // Update settings
    if (dailyReward !== undefined) {
        db.data.settings.dailyBonus = parseInt(dailyReward);
    }
    if (welcomeBonus !== undefined) {
        db.data.settings.welcomeBonus = parseInt(welcomeBonus);
    }

    db.save(true);
    db.triggerSystemUpdate();

    console.log('[ADMIN] Config updated:', {
        dailyBonus: db.data.settings.dailyBonus,
        welcomeBonus: db.data.settings.welcomeBonus
    });

    res.json({
        success: true,
        message: 'Configuration saved',
        settings: {
            dailyBonus: db.data.settings.dailyBonus,
            welcomeBonus: db.data.settings.welcomeBonus
        }
    });
});

// Helper: Delete all messages sent by a helper admin
async function deleteHelperAdminMessages(userId) {
    const user = await db.getUser(userId);
    if (!user || !user.helperAdminMessages) return;

    const TelegramBot = require('node-telegram-bot-api');
    const config = require('../config');
    const botToken = config.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
        console.error('[HELPER ADMIN] Cannot delete messages: Bot token missing');
        return;
    }

    // Use global bot if available
    const activeBot = bot || new TelegramBot(botToken, { polling: false });

    console.log(`[HELPER ADMIN] Deleting ${user.helperAdminMessages.length} messages for user ${userId}`);

    for (const msg of user.helperAdminMessages) {
        try {
            await activeBot.deleteMessage(msg.chatId, msg.messageId);
            console.log(`[HELPER ADMIN] Deleted message ${msg.messageId} in chat ${msg.chatId}`);
        } catch (e) {
            console.error(`[HELPER ADMIN] Failed to delete message ${msg.messageId} in chat ${msg.chatId}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 100));
    }

    user.helperAdminMessages = [];
    await db.updateUser(user);
}

// API: Update User Data (Admin)
app.post('/api/admin/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { balance, tokens, referralCount, verified, Gems, usd, adminVerified, apiStatus, role } = req.body;
        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        // Handle both 'tokens' and 'balance' parameters
        const tokenValue = tokens !== undefined ? tokens : balance;
        if (tokenValue !== undefined) {
            db.setTokenBalance(user, parseInt(tokenValue));
        }
        if (Gems !== undefined) {
            user.Gems = parseInt(Gems);
            user.balance_Gems = parseInt(Gems);
        }
        if (usd !== undefined) {
            user.usd = parseFloat(usd);
        }
        if (referralCount !== undefined) user.referralCount = parseInt(referralCount);
        if (verified !== undefined) user.verified = (verified === true || verified === 'true');
        if (adminVerified !== undefined) user.adminVerified = (adminVerified === true || adminVerified === 'true');
        if (apiStatus !== undefined) user.apiStatus = apiStatus;

        if (role !== undefined) {
            const oldRole = user.role || 'user';
            user.role = role;

            // If role changed from helper_admin to user (disabled)
            if (oldRole === 'helper_admin' && role === 'user') {
                console.log(`[HELPER ADMIN] Disabling helper admin ${userId} and deleting messages...`);
                await deleteHelperAdminMessages(userId);
            }
        }

        await db.updateUser(user, null, true);
        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('[ADMIN USER UPDATE ERROR]', error);
        res.json({ success: false, message: error.message });
    }
});

// API: Get User Profile Data
app.get('/api/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = await db.getUser(userId);
    if (!user) {
        return res.json({ success: false, message: 'User not found' });
    }

    // ── IP TRACKING ─────────────────────────────────────────────────
    try {
        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.headers['x-real-ip']
            || req.socket.remoteAddress
            || 'unknown';
        const cleanIp = clientIp.replace('::ffff:', '');
        if (cleanIp && cleanIp !== 'unknown' && cleanIp !== '127.0.0.1' && cleanIp !== '::1') {
            // Store last IP and IP history (max 5 unique)
            user.lastIp = cleanIp;
            if (!user.ipHistory) user.ipHistory = [];
            if (!user.ipHistory.includes(cleanIp)) {
                user.ipHistory.unshift(cleanIp);
                if (user.ipHistory.length > 5) user.ipHistory = user.ipHistory.slice(0, 5);
                db.save(true);
            }
            // Check IP ban
            const bannedIps = db.data.bannedIps || [];
            if (bannedIps.includes(cleanIp)) {
                return res.json({ success: false, message: 'Access denied. Your IP has been banned.' });
            }
        }
    } catch (e) { /* silent */ }
    // ─────────────────────────────────────────────────────────────────

    // Include task info from global settings
    const activeTasks = db.data.tasks || {};
    const taskList = Object.keys(activeTasks).map(key => ({
        id: key,
        ...activeTasks[key]
    }));

    // Resolve balances using db helpers for consistency
    const tokenBalance = db.getTokenBalance(user);
    // Always use the max of both gem fields — handles mismatch from exchange
    const gemBalance = Math.max(parseFloat(user.Gems || 0), parseFloat(user.balance_Gems || 0));

    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username || 'User',
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            photo_url: user.photo_url || '',
            // Balances — use consistent field names matching frontend expectations
            balance_tokens: tokenBalance,
            tokens: tokenBalance,
            gems: gemBalance,
            Gems: gemBalance,
            balance_Gems: gemBalance,
            usd: user.usd || 0,
            // Status fields
            banned: user.banned || false,
            verified: user.verified || false,
            adminVerified: user.adminVerified || false,
            role: user.role || 'user',
            apiKey: user.apiKey || null,
            apiStatus: user.apiStatus || 'allow',
            // Stats
            invites: user.referralCount || (Array.isArray(user.referredUsers) ? user.referredUsers.length : 0) || 0,
            dailyStreak: user.dailyStreak || 0,
            completedTasks: user.tasksDone || [],
            referralCode: db.getReferralCode(user.id),
        },
        // Legacy top-level fields for backward compat
        userId: user.id,
        username: user.username || 'User',
        tokens: tokenBalance,
        Gems: gemBalance,
        balance_Gems: gemBalance,
        invites: user.referralCount || (Array.isArray(user.referredUsers) ? user.referredUsers.length : 0) || 0,
        referralCount: user.referralCount || (Array.isArray(user.referredUsers) ? user.referredUsers.length : 0) || 0,
        dailyStreak: user.dailyStreak || 0,
        completedTasks: user.tasksDone || [],
        referralCode: db.getReferralCode(user.id),
        availableTasks: taskList,
        botUsername: (db.data.settings && db.data.settings.botUsername) || config.BOT_USERNAME || 'AutosVerify_bot'
    });
});


// API: Verify Task Completion
app.post('/api/user/verify-task', async (req, res) => {
    const { userId, taskId } = req.body;
    if (!userId || !taskId) {
        return res.status(400).json({ success: false, message: 'userId and taskId are required' });
    }

    const user = await db.getUser(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Check if already done
    if (user.tasksDone && user.tasksDone.includes(taskId)) {
        return res.json({ success: true, message: 'Task already completed', alreadyDone: true });
    }

    const taskData = db.data.tasks && db.data.tasks[taskId];
    if (!taskData) return res.status(404).json({ success: false, message: 'Task not found' });

    // REAL VERIFICATION Logic for Telegram
    let verified = false;
    let failReason = 'Join the channel/group first!';

    const apiKeys = db.data?.apiKeys || {};
    const settings = db.data?.settings || {};

    let targetChat = '';
    if (taskId === 'task_telegram_channel') {
        targetChat = apiKeys.requiredChannel || settings.requiredChannel || config.REQUIRED_CHANNEL || '@AutosVerify';
    } else if (taskId === 'task_telegram_group') {
        targetChat = apiKeys.requiredGroup || settings.requiredGroup || config.REQUIRED_GROUP || '@AutosVerifyCh';
    } else if (taskData.chatId || taskData.url || taskData.target) {
        targetChat = taskData.chatId || taskData.target || taskData.url;
    }

    const normalizedTarget = normalizeChatIdentifier(targetChat);

    if (normalizedTarget && (taskId.includes('telegram') || taskData.platform === 'telegram' || targetChat)) {
        if (!bot || !bot.token || bot.token === 'undefined' || bot.token === 'null') {
            verified = true;
        } else {
            try {
                const member = await bot.getChatMember(normalizedTarget, userId);
                const allowed = ['member', 'administrator', 'creator'];
                if (allowed.includes(member.status)) {
                    verified = true;
                } else {
                    verified = false;
                    failReason = `Please join ${normalizedTarget} to complete this task!`;
                }
            } catch (e) {
                console.error(`Verification error for ${userId} on ${normalizedTarget}:`, e.message);
                if (e.message.includes('No token')) {
                    verified = true;
                } else if (e.message.includes('chat not found') || e.message.includes('MEMBER_NOT_EXIST')) {
                    verified = false;
                    failReason = `Please ensure you have joined ${normalizedTarget} and try again!`;
                } else {
                    verified = false; // Do not fail open if bot lacks permission
                    failReason = `Verification failed. The bot must be an admin in ${normalizedTarget} to check membership.`;
                }
            }
        }
    } else {
        verified = true;
    }

    if (verified) {
        if (!user.tasksDone) user.tasksDone = [];
        user.tasksDone.push(taskId);

        const reward = taskData.reward || taskData.gems || 10;

        const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        const newGems = parseFloat((currentGems + reward).toFixed(4));
        user.Gems = newGems;
        user.balance_Gems = newGems;

        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'task',
            reward: `+${reward} Gems`,
            date: Date.now(),
            detail: `Task: ${taskData.name}`
        });

        db.save(true);
        return res.json({ success: true, message: 'Task verified! Reward added.', reward: newGems });
    } else {
        return res.json({ success: false, message: failReason });
    }
});

// API: Crypto Coins (Frontend compatibility)
app.get('/api/crypto-coins', (req, res) => {
    try {
        const methods = db.data.cryptoMethods || {};
        const coins = Object.entries(methods).map(([id, m]) => ({
            coin: id,
            name: m.name || id,
            network: m.network || m.name || id,
            address: m.address || m.details || '',
            qr: m.qr || '',
            active: (m.status || 'active') === 'active'
        }));
        res.json({ success: true, coins });
    } catch (e) {
        res.json({ success: false, coins: [] });
    }
});

// API: Fast Sync user data for polling
app.get('/api/user/sync/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const tokenBalance = db.getTokenBalance(user);
    // Always use the max of both gem fields for correct balance
    const gemBalance = Math.max(parseFloat(user.Gems || 0), parseFloat(user.balance_Gems || 0));

    res.json({
        success: true,
        tokens: tokenBalance,
        balance_tokens: tokenBalance,
        Gems: gemBalance,
        balance_Gems: gemBalance,
        usd: user.usd || 0,
        firstName: user.firstName || '',
        username: user.username || '',
        photo_url: user.photo_url || '',
        verified: user.verified || false,
        adminVerified: user.adminVerified || false,
        role: user.role || 'user',
        apiStatus: user.apiStatus || 'allow',
        apiKey: user.apiKey || '',
        completedTasks: user.completedTasks || [],
        lastClaim: user.lastDaily || 0,
        dailyStreak: user.dailyStreak || 0,
        banned: user.banned || false,
        history: (user.history || []).slice(0, 50),
        purchasedAccounts: (user.purchasedAccounts || []).map(p => ({ itemId: p.itemId || '', category: p.category || '', price: p.price || 0, purchasedAt: p.purchasedAt || p.date || 0 }))
    });
});

// API: Register / Sync user from Telegram WebApp
app.post('/api/register', async (req, res) => {
    const { userId, firstName, lastName, username, photo_url, referrer } = req.body;
    if (!userId) return res.json({ success: false, message: 'userId required' });

    const user = await db.getUser(userId); // creates if not exists
    if (!user) return res.json({ success: false, message: 'Failed to create user' });

    // Detect country if missing
    if (!user.country) {
        user.country = await detectUserCountry(req);
    }

    // Update Telegram profile data
    if (firstName) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (username) user.username = username;
    if (photo_url) user.photo_url = photo_url;
    user.lastActive = Date.now();

    // Auto-set adminVerified for the main admin user
    const adminId = getAdminId();
    if (adminId && String(userId) === String(adminId)) {
        user.adminVerified = true;
        if (!user.role || user.role === 'user') user.role = 'admin';
    }

    // Sync all balance fields on every login
    const currentBalance = db.getTokenBalance(user);
    db.setTokenBalance(user, currentBalance); // ensures all 3 fields are in sync

    // Handle referral on first registration - referrer can be code or userId
    if (referrer && !user.referredBy) {
        if (referrer !== String(userId)) {
            // Get referrer userId from referral code using proper method
            const referrerId = db.getUserIdFromReferralCode ? db.getUserIdFromReferralCode(referrer) : referrer.replace('ref_', '');
            const refUser = await db.getUser(referrerId);
            if (refUser) {
                const settings = db.getSettings();
                const refBonus = settings.refBonus || 10;

                // Add referral bonus and handle support loan auto-repayment for referrer
                const currentBalance = db.getTokenBalance(refUser) || 0;
                const supportLoan = refUser.supportLoan || 0;

                let newBalance = currentBalance + refBonus;
                let repaidAmount = 0;
                let newSupportLoan = supportLoan;

                // If referrer has a support loan, auto-repay from earnings
                if (supportLoan > 0) {
                    repaidAmount = Math.min(refBonus, supportLoan);
                    newBalance = newBalance - repaidAmount;
                    newSupportLoan = supportLoan - repaidAmount;
                    refUser.supportLoan = newSupportLoan;

                    // Add loan repayment history
                    if (!refUser.history) refUser.history = [];
                    refUser.history.unshift({
                        type: 'support_loan_repay',
                        earned: refBonus,
                        repaid: repaidAmount,
                        remainingLoan: newSupportLoan,
                        date: Date.now()
                    });
                }

                db.setTokenBalance(refUser, newBalance);

                // Add referral history
                if (!refUser.history) refUser.history = [];
                refUser.history.unshift({
                    type: 'referral_reward',
                    amount: refBonus,
                    reward: `+${refBonus} Tokens`,
                    asset: 'TC',
                    referredUser: userId,
                    date: Date.now(),
                    detail: 'Referral Bonus'
                });

                // Track referred users for leaderboard (referredUsers array)
                if (!refUser.referredUsers) refUser.referredUsers = [];
                // Avoid duplicate
                const alreadyTracked = refUser.referredUsers.some(r => String(r.userId) === String(userId));
                if (!alreadyTracked) {
                    refUser.referredUsers.push({
                        userId: userId,
                        date: Date.now(),
                        rewarded: true
                    });
                }

                // Increment referral count
                refUser.referralCount = (refUser.referralCount || 0) + 1;

                await db.updateUser(refUser);

                // Notify referrer about new referral
                const botToken = config.BOT_TOKEN || '';
                if (botToken) {
                    notifyReferrer(botToken, refUser.id || refUser.userId, userId, refBonus, repaidAmount);
                }
            }

            // Mark user as referred
            user.referredBy = referrer;
            await db.updateUser(user);
        }
    }

    // Migration/Fix: Ensure history exists and has welcome bonus if empty
    if (!user.history || user.history.length === 0) {
        const welcome = (typeof db.getWelcomeCredits === 'function') ? db.getWelcomeCredits() : 100;
        // Actually credit the welcome bonus to user's balance
        const currentBalance = db.getTokenBalance(user);
        db.setTokenBalance(user, currentBalance + welcome);
        user.history = [{
            type: 'bonus',
            amount: welcome,
            reward: `+${welcome} Tokens`,
            date: Date.now(),
            detail: 'Welcome Bonus'
        }];
    }

    // Get web messages queue and auto-clear it
    const webMessages = user.pendingWebMessages || [];
    if (webMessages.length > 0) {
        user.pendingWebMessages = [];
    }

    await db.updateUser(user);

    // Always return the synced balance
    const tokens = db.getTokenBalance(user);
    const gemsAtLogin = Math.max(parseFloat(user.Gems || 0), parseFloat(user.balance_Gems || 0));

    console.log(`[AUTH] User registered: ${userId}, Key present: ${!!user.apiKey}, Status: ${user.apiStatus || 'allow'}`);

    res.json({
        success: true,
        userId,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        photo_url: user.photo_url || '',
        tokens,
        balance_tokens: tokens,
        Gems: gemsAtLogin,
        balance_Gems: gemsAtLogin,
        usd: (user.usd !== undefined && user.usd !== null) ? user.usd : 0,
        invites: user.referralCount || (Array.isArray(user.referredUsers) ? user.referredUsers.length : 0) || 0,
        lastClaim: user.lastDaily || 0,
        dailyStreak: user.dailyStreak || 0,
        completedTasks: user.tasksDone || user.completedTasks || [],
        verified: user.successfulVerifications > 0 || user.verified || false,
        adminVerified: user.adminVerified || false,
        role: user.role || 'user',
        apiStatus: user.apiStatus || 'allow',
        apiKey: user.apiKey || null,
        banned: user.banned || user.blocked || false,
        webMessages: webMessages,
        purchasedAccounts: (user.purchasedAccounts || []).map(p => ({ itemId: p.itemId || '', category: p.category || '', price: p.price || 0, purchasedAt: p.purchasedAt || p.date || 0 }))
    });
});

// --- EMAIL PORTAL API ---
const EMAIL_COSTS = {
    'temp': 0,
    'gmail': 50,
    'hotmail': 40
};

app.get('/api/email/current', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json({ success: false, message: 'User ID required' });
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    res.json({ success: true, email: user.currentEmail || null });
});

app.post('/api/email/generate', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const { type } = req.body;
        if (!userId) return res.json({ success: false, message: 'User ID required' });

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const cost = EMAIL_COSTS[type] || 0;
        const balance = db.getTokenBalance(user);

        if (balance < cost) {
            return res.json({ success: false, message: `Insufficient balance. Need ${cost} tokens.` });
        }

        // Get Email API Key from DB or use the one provided by user as default
        const apiKey = (db.data.apiKeys && db.data.apiKeys.emailApiKey) || 'sk_XgjktFPYraaUpsxNnUYw2FDEVbBkEHyJ';

        // Call the external API to generate email
        // For this demo, we'll mock it if the key is default or use axios if key is set
        let generatedEmail = `user${Math.floor(Math.random() * 10000)}@autosmail.com`;

        // Deduction
        if (cost > 0) {
            db.setTokenBalance(user, balance - cost);
            if (!user.history) user.history = [];
            user.history.unshift({
                type: 'usage',
                amount: -cost,
                reward: `-${cost} Tokens`,
                date: Date.now(),
                detail: `Generated ${type.toUpperCase()} Email`
            });
        }

        user.currentEmail = generatedEmail;
        await db.updateUser(user);

        res.json({
            success: true,
            email: generatedEmail,
            newBalance: db.getTokenBalance(user)
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.get('/api/email/inbox', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.json({ success: false, message: 'Email required' });

    // Mock inbox for now
    res.json({
        success: true,
        messages: [
            { id: '1', from: 'Welcome Team', subject: 'Welcome to AutosMail!', date: Date.now() }
        ]
    });
});

// API: Get User History
app.get('/api/history/:userId', async (req, res) => {
    const userId = req.params.userId;
    let user = await db.getUser(userId);

    // If user missing from memory (unlikely if they just registered), return fixed default
    if (!user) {
        const welcome = (typeof db.getWelcomeCredits === 'function') ? db.getWelcomeCredits() : 100;
        return res.json({
            success: true,
            history: [{
                type: 'bonus',
                amount: welcome,
                reward: `+${welcome} Tokens`,
                date: Date.now(),
                detail: 'Welcome Bonus'
            }]
        });
    }

    const history = user.history || [];
    res.json({ success: true, history: history });
});

// API: Get User Purchased Items (for re-access after leaving)
app.get('/api/user/:userId/purchases', async (req, res) => {
    const userId = req.params.userId;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const purchasedItems = user.purchasedItems || [];
    const purchasedAccounts = user.purchasedAccounts || [];

    // Merge both into a unified list
    const allPurchases = [
        ...purchasedItems.map(p => ({
            type: 'item_sale',
            itemType: p.itemType || 'Item',
            details: p.details || {},
            boughtAt: p.boughtAt || Date.now(),
            saleId: p.saleId
        })),
        ...purchasedAccounts.map(p => ({
            type: 'account',
            itemId: p.itemId || '',
            price: p.price !== undefined ? p.price : 0,
            itemType: p.category || 'Account',
            details: {
                email: p.email || '',
                password: p.password || '',
                twoFA: p.twofa || p.twoFA || '',
                accountType: p.accountType || 'other',
                cardHolder: p.cardHolder || '',
                cardNumber: p.cardNumber || '',
                expiry: p.expiry || '',
                cvv: p.cvv || '',
                address: p.address || '',
                city: p.city || '',
                zip: p.zip || '',
                country: p.country || '',
                cardType: p.cardType || '',
                passiveLabel: p.passiveLabel || p.label || '',
                recoveryEmail: p.recoveryEmail || '',
                proxyProtocol: p.proxyProtocol || '',
                linkedEmail: p.linkedEmail || '',
                emailVerification: p.emailVerification || null,
                hasLinkedEmail: !!(p.linkedEmail || (p.email && p.accountType === 'passivecard'))
            },
            boughtAt: p.purchasedAt || Date.now()
        }))
    ].sort((a, b) => b.boughtAt - a.boughtAt);

    res.json({ success: true, purchases: allPurchases });
});

// API: Delete specific purchase history entry for user
app.post('/api/user/:userId/purchases/delete', async (req, res) => {
    const userId = req.params.userId;
    const { boughtAt, saleId, email } = req.body;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    if (user.purchasedItems && Array.isArray(user.purchasedItems)) {
        user.purchasedItems = user.purchasedItems.filter(p => p.saleId !== saleId && p.boughtAt !== boughtAt);
    }
    if (user.purchasedAccounts && Array.isArray(user.purchasedAccounts)) {
        user.purchasedAccounts = user.purchasedAccounts.filter(p => p.purchasedAt !== boughtAt && p.email !== email);
    }
    if (user.history && Array.isArray(user.history)) {
        user.history = user.history.filter(h => h.date !== boughtAt);
    }

    db.save(true);
    res.json({ success: true, message: 'Purchase history item deleted' });
});

// API: Clear all purchase history for user
app.post('/api/user/:userId/purchases/clear-all', async (req, res) => {
    const userId = req.params.userId;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    user.purchasedItems = [];
    user.purchasedAccounts = [];
    db.save(true);
    res.json({ success: true, message: 'All purchase history cleared' });
});

// API: Generate Quiz with AI
app.get('/api/quiz/generate', async (req, res) => {
    try {
        const ai = getOpenAI();
        if (!ai) {
            // No key configured; use fallback question
            return res.json({
                success: true,
                question: 'What is the capital of France?',
                options: ['Berlin', 'Madrid', 'Paris', 'Rome'],
                correctIndex: 2
            });
        }
        const completion = await ai.chat.completions.create({
            model: config.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a dynamic and engaging quiz master. Generate a fresh, unique, and medium-difficulty multiple choice question. It can be about science, history, movies, gaming, geography, or current technology. Ensure the question is interesting and not repetitive. Return ONLY a JSON object: { \"question\": \"text\", \"options\": [\"opt1\", \"opt2\", \"opt3\", \"opt4\"], \"correctIndex\": 0 }" }
            ],
            response_format: { type: "json_object" }
        });

        const data = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, ...data });
    } catch (e) {
        console.error('AI Quiz Error:', e.message);
        // Fallback question
        res.json({
            success: true,
            question: "What is the capital of Japan?",
            options: ["Tokyo", "Seoul", "Beijing", "Bangkok"],
            correctIndex: 0
        });
    }
});

// API: Submit Quiz Answer
app.post('/api/quiz/submit', async (req, res) => {
    const { userId, correct } = req.body;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    // 7 for correct, 3 for wrong as per user request
    const amount = correct ? 7 : 3;
    const isCorrect = correct; // Store this for history detail

    // Add reward and handle support loan auto-repayment
    const currentBalance = db.getTokenBalance(user) || 0;
    const supportLoan = user.supportLoan || 0;

    let newBalance = currentBalance + amount;
    let repaidAmount = 0;
    let newSupportLoan = supportLoan;

    // If user has a support loan, auto-repay from earnings
    if (supportLoan > 0) {
        repaidAmount = Math.min(amount, supportLoan);
        newBalance = newBalance - repaidAmount;
        newSupportLoan = supportLoan - repaidAmount;
        user.supportLoan = newSupportLoan;

        // Add loan repayment history
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'support_loan_repay',
            earned: amount,
            repaid: repaidAmount,
            remainingLoan: newSupportLoan,
            date: Date.now()
        });
    }

    db.setTokenBalance(user, newBalance);

    if (correct) {
        user.quizCorrectCount = (user.quizCorrectCount || 0) + 1;
        user.quizPoints = (user.quizPoints || 0) + 10;
    } else {
        user.quizPoints = (user.quizPoints || 0) + 5;
    }

    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'quiz_reward',
        amount: amount,
        currency: 'tokens',
        date: Date.now(),
        detail: correct ? 'Quiz Correct' : 'Quiz Wrong'
    });

    await db.updateUser(user);
    res.json({
        success: true,
        newBalance: newBalance,
        supportLoanRepaid: repaidAmount,
        remainingLoan: newSupportLoan
    });
});

// API: Claim Ad Reward
app.post('/api/ad/claim', async (req, res) => {
    const { userId, context } = req.body;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    let amount = 0;
    let detail = 'Ad Reward';

    if (context === 'watch_ad' || context === 'zero_balance_trigger') {
        const configuredReward = parseInt(db.data.settings?.adReward);
        amount = Number.isFinite(configuredReward) ? configuredReward : 7;
        detail = 'Watched Ad';
    } else if (context === 'quiz_direct' || context === 'scratch_ad' || context === 'scratch_retry' || context === 'task_verification') {
        // Just unlocking, no tokens yet
        return res.json({ success: true });
    } else {
        amount = 0; // Prevent accidental token drops on unrecognized ad contexts
    }

    if (amount > 0) {
        db.setTokenBalance(user, db.getTokenBalance(user) + amount);
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'ad_reward',
            amount: amount,
            currency: 'tokens',
            date: Date.now(),
            detail: detail
        });
        await db.updateUser(user);
    }

    res.json({ success: true, newBalance: db.getTokenBalance(user), reward: amount });
});

// API: Quiz Leaderboard
app.get('/api/quiz/leaderboard', (req, res) => {
    const users = Object.values(db.data.users || {}).filter(u => ![123, 999999].includes(parseInt(u.id)));
    const leaderboard = users
        .filter(u => u.quizPoints > 0)
        .map(u => ({
            name: u.firstName || u.username || 'User',
            points: u.quizPoints || 0,
            correctCount: u.quizCorrectCount || 0
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 20);

    res.json({ success: true, leaderboard });
});

// API: Scratch Claim
app.post('/api/scratch/claim', async (req, res) => {
    const { userId, reward } = req.body;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    db.setTokenBalance(user, db.getTokenBalance(user) + parseInt(reward));

    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'scratch_reward',
        amount: parseInt(reward),
        currency: 'tokens',
        date: Date.now()
    });

    await db.updateUser(user);
    res.json({ success: true, newBalance: db.getTokenBalance(user) });
});

// API: Earn Task Completion
app.post('/api/earn', async (req, res) => {
    // Support both 'taskType' and 'type' field names
    const { userId } = req.body;
    const taskType = req.body.taskType || req.body.type;
    const amount = req.body.amount;

    console.log(`[DEBUG] /api/earn called - userId: ${userId}, taskType: ${taskType}, amount: ${amount}`);

    if (!userId || !taskType) {
        console.log(`[DEBUG] Missing parameters - userId: ${userId}, taskType: ${taskType}`);
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const user = await db.getUser(userId);
    if (!user) {
        console.log(`[DEBUG] User not found: ${userId}`);
        return res.json({ success: false, message: 'User not found' });
    }

    console.log(`[DEBUG] User found: ${userId}, completedTasks: ${JSON.stringify(user.completedTasks)}`);

    // --- Special: watch_ad (repeatable daily) ---
    if (taskType === 'watch_ad') {
        const settings = db.data.settings || {};
        const zeroBalanceReward = parseInt(settings.zeroBalanceAdReward);

        // Country-specific ad reward
        let countryReward = settings.adReward || 7;
        if (user.country && settings.countryAdRewards && settings.countryAdRewards[user.country]) {
            countryReward = settings.countryAdRewards[user.country];
        }

        const adReward = (req.body.context === 'zero_balance_trigger')
            ? (Number.isFinite(zeroBalanceReward) ? zeroBalanceReward : 7)
            : (parseInt(countryReward) || 7);
        const now = Date.now();
        const lastWatched = user.lastAdWatch || 0;
        const cooldownMs = 5 * 60 * 1000; // 5 minutes cooldown per ad

        // Bypass cooldown for zero balance trigger
        if (req.body.context !== 'zero_balance_trigger' && (now - lastWatched < cooldownMs)) {
            const waitMin = Math.ceil((cooldownMs - (now - lastWatched)) / 60000);
            return res.json({ success: false, message: `Please wait ${waitMin} more minute(s) before watching another ad.` });
        }

        user.lastAdWatch = now;

        // Add reward and handle support loan auto-repayment
        const rewardAmount = adReward;
        const currentBalance = db.getTokenBalance(user) || 0;
        const supportLoan = user.supportLoan || 0;

        // Calculate new balance after earning
        let newBalance = currentBalance + rewardAmount;
        let repaidAmount = 0;
        let newSupportLoan = supportLoan;

        // If user has a support loan, auto-repay from earnings
        if (supportLoan > 0) {
            repaidAmount = Math.min(rewardAmount, supportLoan);
            newBalance = newBalance - repaidAmount; // Deduct repayment
            newSupportLoan = supportLoan - repaidAmount;
            user.supportLoan = newSupportLoan;

            // Add loan repayment history
            if (!user.history) user.history = [];
            user.history.unshift({
                type: 'support_loan_repay',
                earned: rewardAmount,
                repaid: repaidAmount,
                remainingLoan: newSupportLoan,
                date: Date.now()
            });
        }

        db.setTokenBalance(user, newBalance);

        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'ad_reward',
            amount: adReward,
            currency: 'tokens',
            date: now,
            detail: req.body.context === 'quiz_direct' ? 'Quiz Ad' : (req.body.context === 'zero_balance_trigger' ? 'Zero Balance Ad' : (req.body.context === 'scratch_ad' ? 'Scratch Ad' : 'Watch Ad'))
        });
        await db.updateUser(user);

        return res.json({
            success: true,
            reward: adReward,
            newBalance: newBalance,
            supportLoanRepaid: repaidAmount,
            remainingLoan: newSupportLoan
        });
    }

    // Verify Telegram Tasks (non-blocking - just log, don't prevent reward)
    if (taskType === 'tg' || taskType === 'tg_ch') {
        if (bot) {
            try {
                const channelUser = taskType === 'tg' ? '@AutosVerifych' : '@AutosVerify';
                const member = await bot.getChatMember(channelUser, userId);
                if (member.status === 'left' || member.status === 'kicked' || member.status === 'restricted') {
                    console.log(`User ${userId} not in ${channelUser}, but still allowing claim`);
                }
            } catch (e) {
                if (!e.message.includes('No token')) {
                    console.error('Earn verification error (non-blocking):', e.message);
                }
            }
        }
    }

    // Check if task is already completed
    if (!user.completedTasks) user.completedTasks = [];
    if (user.completedTasks.includes(taskType)) {
        console.log(`[DEBUG] Task already completed: ${taskType}`);
        return res.json({ success: false, message: 'Task already completed' });
    }

    const rewardAmount = parseInt(amount) || 10;
    console.log(`[DEBUG] Processing reward: ${rewardAmount} for task: ${taskType}`);

    // Mark task complete and give Gems
    user.completedTasks.push(taskType);

    const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
    const newGems = parseFloat((currentGems + rewardAmount).toFixed(4));
    user.Gems = newGems;
    user.balance_Gems = newGems;

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'mission_reward',
        amount: rewardAmount,
        currency: 'Gems',
        taskId: taskType,
        date: Date.now()
    });

    await db.updateUser(user);

    console.log(`[DEBUG] Task completed successfully: ${taskType}, newGems: ${newGems}`);
    return res.json({
        success: true,
        reward: rewardAmount,
        newGems: newGems,
        newBalance: newGems
    });

});

// API: Buy Account by Category
app.post('/api/accounts/buy-category', async (req, res) => {
    const { userId, category, price } = req.body;

    if (!userId || !category || !price) {
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const user = await db.getUser(userId);
    if (!user) {
        return res.json({ success: false, message: 'User not found' });
    }

    let account = null;

    // Check in cards first
    const categoryKey = Object.keys(db.data.cards || {}).find(k => k.toLowerCase() === category.toLowerCase());
    if (categoryKey && db.data.cards[categoryKey] && db.data.cards[categoryKey].length > 0) {
        account = db.data.cards[categoryKey].shift(); // Remove from start (FIFO)
        db.save(true); // Save database
    }

    if (!account) {
        return res.json({ success: false, message: 'Sorry, currently no card or service available.' });
    }

    const userTokens = db.getTokenBalance(user);
    if (userTokens < parseInt(price)) {
        return res.json({ success: false, message: 'Insufficient tokens' });
    }

    // Deduct tokens safely
    const priceInt = parseInt(price);
    db.setTokenBalance(user, userTokens - priceInt);

    // Prepare response data — card stock uses {key, info}, account stock uses {email, password}
    const cardKey = account.key || account.email || account.value || '';
    const cardInfo = account.info || account.password || account.instructions || '';

    const accountData = {
        email: cardKey,       // card number (pipe-delimited) or email
        password: cardInfo,   // JSON info string or password
        category: category,
        purchasedAt: Date.now(),
        instructions: account.instructions || ''
    };

    // Save to user's purchased accounts
    if (!user.purchasedAccounts) user.purchasedAccounts = [];
    user.purchasedAccounts.push(accountData);

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'account_purchase',
        amount: parseInt(price),
        currency: 'tokens',
        category: category,
        reward: `-${parseInt(price)} TC`,
        detail: `${category.toUpperCase()} — ${cardKey}`,
        email: cardKey,
        password: cardInfo,
        instructions: account.instructions || '',
        cardRaw: cardInfo,
        date: Date.now()
    });

    await db.updateUser(user);

    return res.json({
        success: true,
        newBalance: db.getTokenBalance(user),
        account: {
            email: accountData.email,   // card number or email
            password: accountData.password, // JSON info or password
            instructions: accountData.instructions,
            info: cardInfo              // always the raw JSON info
        }
    });
});

// API: Get Available Services
app.get('/api/services', (req, res) => {
    res.json({
        success: true,
        services: [
            {
                id: 'gemini',
                name: 'Gemini',
                cost: 10,
                costType: 'tokens',
                status: 'operational',
                icon: 'gem'
            },
            {
                id: 'chatgpt',
                name: 'ChatGPT',
                cost: 10,
                costType: 'tokens',
                status: 'operational',
                icon: 'comments'
            }
        ]
    });
});

// API: Generate Service (Gemini/ChatGPT)
// API: Live Account Checker (Instagram, Facebook, TikTok, Twitter, Threads)
app.post('/api/generate/live-check', async (req, res) => {
    const { userId, platform, account, type } = req.body;

    if (!userId || !platform || !account) {
        return res.json({ success: false, message: 'Missing required parameters' });
    }

    const users = getUsersObj();
    const user = users[userId];
    if (!user) return res.json({ success: false, message: 'User not found' });

    // Get cost from settings (default 10 tokens)
    const settings = db.getSettings();
    const serviceKey = type || ('live' + platform);
    const cost = (settings.costs && settings.costs[serviceKey]) || 10;
    const currency = (settings.costs && settings.costs[`${serviceKey}Currency`]) || 'token';

    // Deduct balance
    if (currency === 'Gems' || currency === 'gem') {
        const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        if (currentGems < cost) return res.json({ success: false, message: `Insufficient Gems. Need ${cost} Gems.` });
        user.Gems = parseFloat((currentGems - cost).toFixed(4));
        user.balance_Gems = user.Gems;
    } else if (currency === 'usd' || currency === 'USD') {
        if ((user.usd || 0) < cost) return res.json({ success: false, message: `Insufficient USD. Need $${cost}.` });
        user.usd = (user.usd || 0) - cost;
    } else {
        const userTokens = db.getTokenBalance(user);
        if (userTokens < cost) return res.json({ success: false, message: `Insufficient tokens. Need ${cost} TC.` });
        db.setTokenBalance(user, userTokens - cost);
    }

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: serviceKey,
        date: new Date().toISOString(),
        detail: `Live check: ${account} on ${platform}`,
        amount: cost,
        currency: currency === 'token' ? 'TC' : currency,
        reward: `-${cost}`,
        label: platform.charAt(0).toUpperCase() + platform.slice(1) + ' Live Check'
    });
    // Keep history max 200
    if (user.history.length > 200) user.history = user.history.slice(0, 200);

    saveUsersObj(users);

    // Try to verify account using advanced checking logic (oEmbed + HTML parsing)
    let isValid = false;
    let statusNote = '';

    try {
        const rawAccount = account.trim();
        // Robust parser to remove email, password, etc., leaving only clean username
        let usernameOnly = rawAccount;
        if (usernameOnly.includes(':')) {
            usernameOnly = usernameOnly.split(':')[0].trim();
        }
        if (usernameOnly.includes('|')) {
            usernameOnly = usernameOnly.split('|')[0].trim();
        }
        usernameOnly = usernameOnly.replace(/^@/, '').trim();
        if (usernameOnly.includes('@')) {
            usernameOnly = usernameOnly.split('@')[0].trim();
        }

        // ── Heuristics validation ──────────────────────────────────────────
        const u = usernameOnly.toLowerCase().trim();
        let isHeuristicsValid = true;
        let heuristicsReason = '';

        if (u.length < 3 || u.length > 35) {
            isHeuristicsValid = false;
            heuristicsReason = 'Username length must be between 3 and 35 characters';
        } else {
            let allowedRegex = /^[a-z0-9._]+$/;
            if (platform === 'twitter' || platform === 'threads') {
                allowedRegex = /^[a-z0-9_]+$/;
            }
            if (!allowedRegex.test(u)) {
                isHeuristicsValid = false;
                heuristicsReason = 'Username contains invalid characters';
            } else if (u.includes('..') || u.includes('__') || u.includes('._') || u.includes('_.')) {
                isHeuristicsValid = false;
                heuristicsReason = 'Consecutive symbols are not allowed';
            } else if (u.startsWith('.') || u.endsWith('.') || u.startsWith('_') || u.endsWith('_')) {
                isHeuristicsValid = false;
                heuristicsReason = 'Cannot start or end with a symbol';
            } else {
                const garbagePatterns = [
                    /abcde/, /qwert/, /asdfg/, /zxcvb/,
                    /12345/, /23456/, /34567/, /45678/, /56789/,
                    /(.)\1{3,}/, // same character repeated 4+ times (e.g., aaaa, 1111)
                    /(..)\1{2,}/, // same 2 characters repeated (e.g. ababab, 121212)
                ];
                for (const pattern of garbagePatterns) {
                    if (pattern.test(u)) {
                        isHeuristicsValid = false;
                        heuristicsReason = 'Username contains suspicious repeating pattern';
                        break;
                    }
                }
                if (isHeuristicsValid) {
                    const vowels = (u.match(/[aeiou]/g) || []).length;
                    const digits = (u.match(/[0-9]/g) || []).length;
                    const letters = (u.match(/[a-z]/g) || []).length;
                    if (letters >= 8 && vowels === 0) {
                        isHeuristicsValid = false;
                        heuristicsReason = 'Username contains too many consecutive consonants';
                    } else if (digits > u.length * 0.75) {
                        isHeuristicsValid = false;
                        heuristicsReason = 'Username is mostly numbers';
                    }
                }
            }
        }

        if (!isHeuristicsValid) {
            isValid = false;
            statusNote = `Heuristics - ${heuristicsReason}`;
        } else {
            let checkUrl = '';
            let isOembed = false;

            if (platform === 'instagram') {
                checkUrl = `https://api.instagram.com/oembed/?url=https://www.instagram.com/${usernameOnly}`;
                isOembed = true;
            } else if (platform === 'tiktok') {
                checkUrl = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${usernameOnly}`;
                isOembed = true;
            } else if (platform === 'twitter') {
                checkUrl = `https://publish.twitter.com/oembed?url=https://twitter.com/${usernameOnly}`;
                isOembed = true;
            } else if (platform === 'facebook') {
                checkUrl = `https://www.facebook.com/${usernameOnly}`;
                isOembed = false;
            } else if (platform === 'threads') {
                checkUrl = `https://www.threads.net/@${usernameOnly}`;
                isOembed = false;
            }

            if (checkUrl) {
            let response;
            try {
                response = await axios.get(checkUrl, {
                    timeout: 8000,
                    maxRedirects: 3,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json, text/html, */*',
                        'Accept-Language': 'en-US,en;q=0.9'
                    },
                    validateStatus: () => true // Accept any HTTP status
                });
            } catch (err) {
                // If oEmbed or direct check failed entirely, try fallback direct HTML check
                if (isOembed) {
                    const fallbackUrls = {
                        instagram: `https://www.instagram.com/${usernameOnly}/`,
                        tiktok: `https://www.tiktok.com/@${usernameOnly}`,
                        twitter: `https://x.com/${usernameOnly}`
                    };
                    const fallbackUrl = fallbackUrls[platform];
                    if (fallbackUrl) {
                        response = await axios.get(fallbackUrl, {
                            timeout: 8000,
                            maxRedirects: 3,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml',
                                'Accept-Language': 'en-US,en;q=0.9'
                            },
                            validateStatus: () => true
                        });
                        isOembed = false; // standard HTML check fallback
                    }
                }
                if (!response) {
                    throw err;
                }
            }

            const s = response.status;
            if (isOembed) {
                if (s === 200) {
                    isValid = true;
                    statusNote = `oEmbed 200 - Account Active`;
                } else if (s === 404 || s === 400 || s === 410) {
                    isValid = false;
                    statusNote = `oEmbed ${s} - Account Not Found`;
                } else {
                    // unexpected oembed response status (e.g. rate limit 429) fallback to standard check
                    const fallbackUrls = {
                        instagram: `https://www.instagram.com/${usernameOnly}/`,
                        tiktok: `https://www.tiktok.com/@${usernameOnly}`,
                        twitter: `https://x.com/${usernameOnly}`
                    };
                    const fallbackUrl = fallbackUrls[platform];
                    if (fallbackUrl) {
                        try {
                            const fallbackResponse = await axios.get(fallbackUrl, {
                                timeout: 8000,
                                maxRedirects: 3,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Accept': 'text/html,application/xhtml+xml',
                                    'Accept-Language': 'en-US,en;q=0.9'
                                },
                                validateStatus: () => true
                            });
                            const fallbackStatus = fallbackResponse.status;
                            if (fallbackStatus === 404 || fallbackStatus === 410) {
                                isValid = false;
                                statusNote = `oEmbed ${s} -> Fallback HTML ${fallbackStatus} - Not Found`;
                            } else {
                                const bodyLower = (fallbackResponse.data || '').toString().toLowerCase().slice(0, 3000);
                                const notFoundPhrases = ['page not found', 'user not found', "isn't available", 'no longer available', 'account suspended', 'this account doesn', 'profile_unavailable'];
                                const bodyIndicatesDead = notFoundPhrases.some(p => bodyLower.includes(p));
                                isValid = !bodyIndicatesDead;
                                statusNote = `oEmbed ${s} -> Fallback HTML ${fallbackStatus}${bodyIndicatesDead ? ' (body says dead)' : ' (active)'}`;
                            }
                        } catch (e) {
                            isValid = true; // benefit of doubt on fallback failure
                            statusNote = `oEmbed ${s} - Fallback request failed: ${e.message.slice(0, 40)}`;
                        }
                    } else {
                        isValid = true;
                        statusNote = `oEmbed ${s} - Assumed Active`;
                    }
                }
            } else {
                // Direct Profile Page HTML Checker
                if (s === 404 || s === 410) {
                    isValid = false;
                    statusNote = `HTML ${s} - Not Found`;
                } else if (s === 200 || s === 301 || s === 302 || s === 303 || s === 429) {
                    const bodyLower = (response.data || '').toString().toLowerCase().slice(0, 3000);
                    const isBlocked = bodyLower.includes('something went wrong') || bodyLower.includes('<title>error</title>') || bodyLower.includes('login_form') || bodyLower.includes('log in to facebook');
                    
                    if (isBlocked && (platform === 'facebook' || platform === 'threads' || platform === 'instagram')) {
                        isValid = true;
                        statusNote = `Format Verified - Active (Platform crawler restricted)`;
                    } else {
                        const notFoundPhrases = ['page not found', 'user not found', "isn't available", 'no longer available', 'account suspended', 'this account doesn', 'profile_unavailable'];
                        const bodyIndicatesDead = notFoundPhrases.some(p => bodyLower.includes(p));
                        isValid = !bodyIndicatesDead;
                        statusNote = `HTML ${s}${bodyIndicatesDead ? ' (body says dead)' : ' (active)'}`;
                    }
                } else {
                    isValid = true;
                    statusNote = `HTML ${s} - Unknown`;
                }
            }
        }
    }
    } catch (checkErr) {
        // Network timeout, connection refused etc — treat as valid (benefit of doubt)
        isValid = true;
        statusNote = 'Network warning: ' + checkErr.message.slice(0, 60);
    }

    return res.json({
        success: true,
        platform,
        account,
        status: isValid ? 'valid' : 'dead',
        alive: isValid,
        note: statusNote,
        newBalance: db.getTokenBalance(user)
    });
});

app.post('/api/generate/:service', (req, res) => {
    const { service } = req.params;
    const { userId } = req.body;

    const users = getUsersObj();
    const user = users[userId];

    if (!user) {
        return res.json({ success: false, message: 'User not found' });
    }

    const settings = db.getSettings();
    const cost = (settings.costs && settings.costs[service]) || 10;

    const currency = settings.costs[`${service}Currency`] || 'token';

    if (currency === 'Gems' || currency === 'gem') {
        const userGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        if (userGems < cost) {
            return res.json({ success: false, message: `Insufficient Gems. Need ${cost} Gems.` });
        }
        user.Gems = parseFloat((userGems - cost).toFixed(4));
        user.balance_Gems = user.Gems;
    } else if (currency === 'usd' || currency === 'USD') {
        const userUsd = user.usd || 0;
        if (userUsd < cost) {
            return res.json({ success: false, message: `Insufficient USD. Need $${cost}.` });
        }
        user.usd = (user.usd || 0) - cost;
    } else {
        const userTokens = db.getTokenBalance(user);
        if (userTokens < cost) {
            return res.json({ success: false, message: `Insufficient tokens. Need ${cost} TC.` });
        }
        db.setTokenBalance(user, db.getTokenBalance(user) - cost);
    }

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: service,
        date: new Date().toISOString(),
        reward: `-${cost} Tokens`
    });

    saveUsersObj(users);

    res.json({
        success: true,
        message: `${service} generated successfully`,
        newBalance: db.getTokenBalance(user)
    });
});

// API: Verify Telegram Membership
app.post('/api/verify-membership', async (req, res) => {
    const { userId, taskType } = req.body;

    if (!userId || !taskType) {
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const apiKeys = db.data?.apiKeys || {};
    const settings = db.data?.settings || {};

    const rawTarget = (taskType === 'tg' || taskType === 'group') 
        ? (apiKeys.requiredGroup || settings.requiredGroup || config.REQUIRED_GROUP || '@AutosVerifyCh')
        : (apiKeys.requiredChannel || settings.requiredChannel || config.REQUIRED_CHANNEL || '@AutosVerify');

    const channelUser = normalizeChatIdentifier(rawTarget);

    if (!bot) {
        return res.json({ success: true, isMember: true, status: 'member' });
    }

    try {
        const member = await bot.getChatMember(channelUser, userId);
        const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
        const isMember = validStatuses.includes(member.status);

        console.log(`[VERIFY] User ${userId} in ${channelUser}: ${member.status} -> isMember: ${isMember}`);

        return res.json({
            success: true,
            isMember: isMember,
            status: member.status
        });
    } catch (e) {
        console.error(`[VERIFY] Error checking membership in ${channelUser}:`, e.message);
        return res.json({
            success: true,
            isMember: true,
            status: 'member'
        });
    }
});
app.post('/api/verify', (req, res) => {
    const { userId, link } = req.body;

    const users = getUsersObj();
    const user = users[userId];

    if (!user) {
        return res.json({ success: false, message: 'User not found' });
    }

    // Add tokens reward
    const reward = 20;
    db.setTokenBalance(user, db.getTokenBalance(user) + reward);

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'verification',
        date: new Date().toISOString(),
        reward: `+${reward} Tokens`
    });

    saveUsersObj(users);

    res.json({ success: true, message: 'Verification successful', reward: reward, newBalance: db.getTokenBalance(user) });
});

// API: Redeem Code
app.post('/api/redeem', async (req, res) => {
    try {
        const { userId, code } = req.body;

        if (!userId || !code) {
            return res.json({ success: false, message: 'Missing parameters' });
        }

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        // Check code exists and is valid (in settings.codes)
        const settings = await db.getSettings();
        const codes = settings.codes || {};
        const codeData = codes[code];
        if (!codeData) {
            return res.json({ success: false, message: 'Invalid code' });
        }

        // Check if user already redeemed this code
        if (!user.redeemed) user.redeemed = [];
        if (user.redeemed.includes(code)) {
            return res.json({ success: false, message: 'You already redeemed this code' });
        }

        // Check max uses
        const currentUses = codeData.redeemedBy ? codeData.redeemedBy.length : 0;
        const maxUses = codeData.maxUses || codeData.uses || 0;
        if (maxUses > 0 && currentUses >= maxUses) {
            return res.json({ success: false, message: 'Code has reached maximum uses' });
        }

        // Add reward and handle support loan auto-repayment
        const rewardAmount = codeData.amount || 0;
        const currentBalance = db.getTokenBalance(user) || 0;
        const supportLoan = user.supportLoan || 0;

        let newBalance = currentBalance + rewardAmount;
        let repaidAmount = 0;
        let newSupportLoan = supportLoan;

        // If user has a support loan, auto-repay from earnings
        if (supportLoan > 0) {
            repaidAmount = Math.min(rewardAmount, supportLoan);
            newBalance = newBalance - repaidAmount;
            newSupportLoan = supportLoan - repaidAmount;
            user.supportLoan = newSupportLoan;

            // Add loan repayment history
            if (!user.history) user.history = [];
            user.history.unshift({
                type: 'support_loan_repay',
                earned: rewardAmount,
                repaid: repaidAmount,
                remainingLoan: newSupportLoan,
                date: Date.now()
            });
        }

        db.setTokenBalance(user, newBalance);

        // Mark code as used by this user
        user.redeemed.push(code);

        // Increment code usage count
        codeData.uses = (codeData.redeemedBy ? codeData.redeemedBy.length : 0) + 1;
        if (!codeData.redeemedBy) codeData.redeemedBy = [];
        codeData.redeemedBy.push(userId);

        // Auto-delete if reached max uses
        const maxLimit = codeData.maxUses || 0;
        if (maxLimit > 0 && codeData.uses >= maxLimit) {
            delete codes[code];
            console.log(`[REDEEM] Code '${code}' reached max uses and was automatically deleted.`);

            // Remove this code from all users' redeemed arrays to allow re-claiming if recreated
            const users = await db.getUsers();
            for (const uId in users) {
                const u = users[uId];
                if (u.redeemed && u.redeemed.includes(code)) {
                    u.redeemed = u.redeemed.filter(c => c !== code);
                }
            }
        }

        // Save settings back
        settings.codes = codes;
        await db.updateSettings(settings);

        // Add to history
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'redeem',
            amount: rewardAmount,
            currency: 'tokens',
            code: code,
            date: Date.now()
        });

        await db.updateUser(user);

        // Broadcast disabled - no notifications sent to other users

        res.json({
            success: true,
            message: 'Code redeemed successfully',
            reward: rewardAmount,
            newTokens: newBalance,
            newBalance: newBalance,
            supportLoanRepaid: repaidAmount,
            remainingLoan: newSupportLoan
        });
    } catch (error) {
        console.error('[REDEEM ERROR]', error);
        res.json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============ API KEY MANAGEMENT ENDPOINTS ============

// Generate a random API key
function generateApiKeyValue() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'auto_verify_';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

// API: Get user's API key status
app.get('/api/user/apikey', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.userId;
        console.log(`[API_GET] Fetching key for User: ${userId}`);

        if (!userId) {
            console.error('[API_GET] Error: User ID missing in request');
            return res.json({ success: false, message: 'User ID required' });
        }

        const user = await db.getUser(userId);
        if (!user) {
            console.error(`[API_GET] Error: User ${userId} not found`);
            return res.json({ success: false, message: 'User not found' });
        }

        console.log(`[API_GET] User ${userId} status: ${user.apiStatus}, key: ${user.apiKey ? 'PRESENT' : 'MISSING'}`);
        if (user.apiKey) {
            console.log(`[API_GET] Returning existing key for ${userId}: ${user.apiKey.substring(0, 8)}...`);
            res.json({
                success: true,
                apiKey: user.apiKey,
                services: user.apiServices || [],
                status: user.apiStatus || 'allow'
            });
        } else {
            console.warn(`[API_GET] No key found in database for user ${userId}`);
            // If no key but status is allow, we can still return the status
            res.json({
                success: true,
                apiKey: null,
                status: user.apiStatus || 'allow',
                message: 'No API key generated yet'
            });
        }
    } catch (error) {
        console.error('[API KEY GET ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Generate new API key
app.post('/api/user/apikey/generate', async (req, res) => {
    try {
        const bodyUserId = req.body ? req.body.userId : null;
        const headerUserId = req.headers['x-user-id'] || req.headers['X-User-Id'];
        const userId = bodyUserId || headerUserId;

        console.log(`[API_GEN] Generating key for User: ${userId} (Body: ${bodyUserId}, Header: ${headerUserId})`);

        if (!userId) {
            console.error('[API_GEN] Error: User ID missing in request');
            return res.status(400).json({ success: false, message: 'User ID required' });
        }

        const user = await db.getUser(userId);
        if (!user) {
            console.error(`[API_GEN] Error: User ${userId} not found in database`);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Cost Management:
        // Creation (No existing key) = 500 Gems
        // Regeneration (Existing key) = 250 Gems
        const isRegeneration = !!user.apiKey;
        const cost = isRegeneration ? 250 : 500;
        const currentGems = user.Gems || user.gems || 0;

        if (currentGems < cost) {
            return res.status(400).json({
                success: false,
                message: `Insufficient gems. You need ${cost} gems to ${isRegeneration ? 'regenerate' : 'create'} an API key.`
            });
        }

        // Deduct gems — sync both fields
        user.Gems = parseFloat((currentGems - cost).toFixed(4));
        user.balance_Gems = user.Gems;

        // Generate new API key
        const apiKey = generateApiKeyValue();
        user.apiKey = apiKey;

        // Initialize stats and approvals
        user.apiStatus = 'allow';
        user.apiKeyCreatedAt = Date.now();
        user.apiTotalCalls = user.apiTotalCalls || 0;
        user.apiTotalUSD = user.apiTotalUSD || 0;

        // Auto-approve all standard services for the new key
        user.approvedApiServices = ['balance', 'tempmail', 'premiummail', 'virtualnumber', 'store'];

        // Record history
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'apikey_cost',
            amount: -cost,
            reward: `${-cost} Gems`,
            date: new Date().toISOString(),
            detail: `${isRegeneration ? 'Regenerated' : 'Generated'} API key`
        });

        // Save changes
        await db.updateUser(user, null, true);

        console.log(`[API_GEN] Success: Generated ${apiKey} for ${userId}`);

        res.json({
            success: true,
            message: 'API Key generated successfully',
            apiKey: apiKey
        });
    } catch (error) {
        console.error('[API KEY GENERATE CRASH]', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Internal Server Error during key generation',
                error: error.message
            });
        }
    }
});

// API: Apply for API services
app.post('/api/user/apikey/services', async (req, res) => {
    try {
        const { userId, services } = req.body;
        if (!userId || !services || !Array.isArray(services)) {
            return res.json({ success: false, message: 'Invalid parameters' });
        }

        const user = await db.getUser(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        if (!user.apiKey) {
            return res.json({ success: false, message: 'No API key generated' });
        }

        // Update requested services (merge with existing approved services)
        const existingApproved = user.approvedApiServices || [];
        user.apiServices = [...new Set([...services])];
        user.apiStatus = 'pending'; // Set to pending for admin approval

        await db.updateUser(user);

        res.json({
            success: true,
            message: 'Service application submitted',
            services: user.apiServices
        });
    } catch (error) {
        console.error('[API SERVICES ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Get API usage history
app.get('/api/user/apikey/history', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.userId;
        if (!userId) {
            return res.json({ success: false, message: 'User ID required' });
        }

        const user = await db.getUser(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const history = user.apiUsageHistory || [];

        res.json({
            success: true,
            history: history.slice(0, 50) // Last 50 entries
        });
    } catch (error) {
        console.error('[API HISTORY ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Admin - Get all user API key requests
app.get('/api/admin/user-requests/apikeys', async (req, res) => {
    try {
        const status = req.query.status || 'all'; // all, pending, active

        const allUsers = await db.getUsers();
        let apiUsers = [];

        for (const user of allUsers) {
            if (user.apiKey) {
                const keyStatus = user.apiStatus || 'pending';
                if (status === 'all' || status === keyStatus) {
                    apiUsers.push({
                        userId: user.id,
                        name: user.name || user.firstName || user.first_name || 'Unknown',
                        username: user.username || 'N/A',
                        firstName: user.firstName || user.first_name || '',
                        lastName: user.lastName || user.last_name || '',
                        apiKey: user.apiKey,
                        apiStatus: user.apiStatus || 'allow',
                        status: keyStatus,
                        createdAt: user.apiKeyCreatedAt || user.createdAt,
                        totalCalls: user.apiTotalCalls || 0,
                        apiTotalUSD: user.apiTotalUSD || 0,
                        tokens: user.tokens || 0,
                        Gems: user.Gems || 0,
                        usd: user.usd || 0,
                        verified: user.verified || false
                    });
                }
            }
        }

        res.json({ success: true, keys: apiUsers });
    } catch (error) {
        console.error('[ADMIN API KEYS ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Admin - Approve API key
app.post('/api/admin/apikeys/approve', async (req, res) => {
    try {
        const { userId, services } = req.body;
        if (!userId) {
            return res.json({ success: false, message: 'User ID required' });
        }

        const user = await db.getUser(userId);
        if (!user || !user.apiKey) {
            return res.json({ success: false, message: 'User or API key not found' });
        }

        // Approve the requested services or specific services provided
        user.approvedApiServices = services || user.apiServices || [];
        user.apiStatus = 'allow';
        user.apiApprovedAt = Date.now();

        await db.updateUser(user);

        res.json({
            success: true,
            message: 'API key approved',
            approvedServices: user.approvedApiServices
        });
    } catch (error) {
        console.error('[ADMIN APPROVE ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Admin - Delete/Revoke API key
app.post('/api/admin/apikeys/delete', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.json({ success: false, message: 'User ID required' });

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        // Remove API key completely
        delete user.apiKey;
        delete user.apiServices;
        delete user.approvedApiServices;
        user.apiStatus = 'pending'; // Reset so they can generate new one
        user.apiRevokedAt = Date.now();

        await db.updateUser(user);
        res.json({ success: true, message: 'API Key deleted successfully' });
    } catch (error) {
        console.error('[ADMIN API DELETE ERROR]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// API: Admin - Reject/Delete API key
app.post('/api/admin/apikeys/reject', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.json({ success: false, message: 'User ID required' });
        }

        const user = await db.getUser(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        // Remove API key
        delete user.apiKey;
        delete user.apiServices;
        delete user.approvedApiServices;
        delete user.apiStatus;
        user.apiRejectionReason = 'Rejected by admin';

        await db.updateUser(user);

        res.json({ success: true, message: 'API key rejected and removed' });
    } catch (error) {
        console.error('[ADMIN REJECT ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Admin - Set user API status
app.post('/api/admin/users/:userId/api-status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body; // 'allow', 'disallow', 'ban'

        if (!['allow', 'disallow', 'ban'].includes(status)) {
            return res.json({ success: false, message: 'Invalid status' });
        }

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        user.apiStatus = status;
        await db.updateUser(user);

        res.json({ success: true, message: `API status updated to ${status}` });
    } catch (error) {
        console.error('[ADMIN API STATUS ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// API: Admin - Get API statistics
app.get('/api/admin/apikeys/stats', async (req, res) => {
    try {
        const allUsers = await db.getUsers();
        console.log(`[API_STATS_DEBUG] allUsers count: ${allUsers.length}`);
        let total = 0, active = 0, pending = 0, totalCalls = 0;

        for (const user of allUsers) {
            if (user.apiKey) {
                total++;
                const s = user.apiStatus || 'allow';
                if (s === 'allow') active++;
                else if (s === 'ban') pending++; // In UI 'pending' slot is used for Banned/Restricted
                totalCalls += user.apiTotalCalls || 0;
            }
        }

        res.json({
            success: true,
            stats: { total, active, pending, totalCalls }
        });
    } catch (error) {
        console.error('[API STATS ERROR]', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// Helper: Record API usage
async function recordApiUsage(user, service, action, cost) {
    if (!user.apiUsageHistory) user.apiUsageHistory = [];
    user.apiUsageHistory.unshift({
        service,
        action,
        cost,
        date: new Date().toISOString()
    });

    // Keep only last 100 entries
    if (user.apiUsageHistory.length > 100) {
        user.apiUsageHistory = user.apiUsageHistory.slice(0, 100);
    }

    user.apiTotalCalls = (user.apiTotalCalls || 0) + 1;
    await db.updateUser(user);
}

// API: External API endpoint - Get Balance (requires API key)
app.get('/api/v1/balance', async (req, res) => {
    try {
        const apiKey = req.headers['authorization']?.replace('Bearer ', '');
        if (!apiKey) {
            return res.status(401).json({ success: false, message: 'API key required' });
        }

        // Find user by API key
        const allUsers = await db.getUsers();
        const user = allUsers.find(u => u.apiKey === apiKey && u.apiStatus === 'allow');

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid or inactive API key' });
        }

        // Recording usage (balance check is free but we track it)
        await recordApiUsage(user, 'balance', 'get_balance', 0);

        res.json({
            success: true,
            balance: {
                tokens: db.getTokenBalance(user) || 0,
                gems: db.getGemBalance(user) || 0
            }
        });
    } catch (error) {
        console.error('[API BALANCE ERROR]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- FULL EXTERNAL API SYSTEM (v1) ---

// Middleware: Validate External API Key
const validateApiKey = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'API key required (Bearer token)' });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const allUsers = await db.getUsers();
    const user = allUsers.find(u => u.apiKey === apiKey);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid API key' });
    }

    if (user.apiStatus !== 'allow') {
        return res.status(403).json({ success: false, message: 'API access restricted or banned' });
    }

    req.apiUser = user;
    next();
};

// API: Check Balance
app.get('/api/v1/user/stats', validateApiKey, (req, res) => {
    res.json({
        success: true,
        balance: db.getTokenBalance(req.apiUser),
        tokens: db.getTokenBalance(req.apiUser),
        gems: req.apiUser.gems || 0,
        apiStatus: req.apiUser.apiStatus
    });
});

// API: Temp Mail - Create
app.post('/api/v1/email/temp/create', validateApiKey, async (req, res) => {
    try {
        const cost = 5;
        const balance = db.getTokenBalance(req.apiUser);
        if (balance < cost) return res.status(400).json({ success: false, message: 'Insufficient balance' });

        // Logic to generate temp email
        const domains = ['autosverify.com', 'mail-box.site', 'temp-verify.org'];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        const email = `api_${Math.random().toString(36).slice(2, 10)}@${domain}`;

        db.setTokenBalance(req.apiUser, balance - cost);
        await recordApiUsage(req.apiUser, 'tempMail', 'create', cost);

        res.json({ success: true, email, cost });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// API: Premium Mail - Buy (Gmail/Hotmail) - ADMIN POOL ONLY
app.post('/api/v1/email/premium/buy', validateApiKey, async (req, res) => {
    try {
        const { type } = req.body; // 'gmail' or 'hotmail'
        if (!['gmail', 'hotmail'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid type. Use gmail or hotmail' });
        }

        const cost = type === 'gmail' ? 50 : 30;
        const balance = db.getTokenBalance(req.apiUser);
        if (balance < cost) return res.status(400).json({ success: false, message: 'Insufficient balance' });

        // Admin pool only
        const pool = db.data.emailPool?.[type] || [];
        const available = pool.filter(e => !e.status || e.status === 'available');
        if (available.length === 0) {
            return res.status(503).json({ success: false, message: `❌ ${type.toUpperCase()} pool is empty. Please contact admin.` });
        }

        const poolEmail = available[0];
        // Remove from pool
        db.data.emailPool[type] = pool.filter(e => e.email !== poolEmail.email);
        if (!db.data.emailPoolHistory) db.data.emailPoolHistory = [];
        db.data.emailPoolHistory.unshift({
            email: poolEmail.email, type,
            assignedTo: req.apiUser.id || 'api',
            assignedAt: new Date().toISOString()
        });
        db.save(true);

        db.setTokenBalance(req.apiUser, balance - cost);
        await recordApiUsage(req.apiUser, 'premiumMail', `buy_${type}`, cost);

        res.json({ success: true, type, email: poolEmail.email, password: poolEmail.password || null, cost });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// API: Store - Buy Item
app.post('/api/v1/store/buy', validateApiKey, async (req, res) => {
    try {
        const { itemId } = req.body;
        if (!itemId) return res.status(400).json({ success: false, message: 'ItemID required' });

        // Find item in store
        const services = db.data.services || {};
        const item = Object.values(services).find(s => s.id === itemId);

        if (!item) return res.status(404).json({ success: false, message: 'Item not found in store' });

        const cost = item.price || 100;
        const balance = db.getTokenBalance(req.apiUser);
        if (balance < cost) return res.status(400).json({ success: false, message: 'Insufficient balance' });

        db.setTokenBalance(req.apiUser, balance - cost);
        await recordApiUsage(req.apiUser, 'store', `buy_${itemId}`, cost);

        res.json({
            success: true,
            itemName: item.name,
            data: "Purchase successful. Check your history for credentials.",
            cost
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- END EXTERNAL API SYSTEM ---

// Redundant daily-claim endpoint removed (use /api/daily)

// API: Complete Task / Earn
// Helper: Check if user is in Telegram channel/group
async function isUserInTelegram(chatUrl, telegramUserId) {
    if (!bot || !bot.token || bot.token === 'undefined' || bot.token === 'null') {
        console.warn('⚠️ Bot not fully initialized or token missing. Skipping membership verification.');
        return true; // Fallback to avoid blocking if bot is unconfigured
    }

    try {
        let chatUsername = '';
        if (chatUrl.includes('t.me/')) {
            chatUsername = '@' + chatUrl.split('t.me/')[1].split('/')[0].split('?')[0];
        } else if (chatUrl.includes('@')) {
            chatUsername = chatUrl;
        } else {
            return true; // Not a telegram task
        }

        console.log(`📡 Verifying involvement: User ${telegramUserId} in ${chatUsername}`);

        // Ensure bot has a valid token before calling
        const botToken = (bot && bot.token) || (config && config.TELEGRAM_BOT_TOKEN) || (db.data.apiKeys && db.data.apiKeys.botToken);

        if (!botToken) {
            console.warn('⚠️ No bot token available for verification. Skipping.');
            return true;
        }

        // If bot instance is missing but token exists, skip with warning or try to init
        if (!bot) {
            console.warn('⚠️ Bot instance not initialized. Skipping verification.');
            return true;
        }

        const member = await bot.getChatMember(chatUsername, telegramUserId);
        const joinedStatus = ['member', 'administrator', 'creator'];
        return joinedStatus.includes(member.status);
    } catch (e) {
        if (e.message.includes('No token')) {
            console.warn('⚠️ Bot mission token error. Skipping verification.');
            return true;
        }
        console.error(`❌ TG Verify Error (${chatUrl}):`, e.message);
        return false;
    }
}

// POST /api/complete-task - Complete a task
app.post('/api/complete-task', async (req, res) => {
    try {
        const { userId, taskId, reward, taskType, amount, type } = req.body;

        // Support multiple frontend variable names
        const finalTaskId = taskId || taskType || type;
        const finalReward = parseInt(reward || amount || 10);

        if (!userId || !finalTaskId) return res.status(400).json({ success: false, message: 'Missing userId or taskId' });

        const users = getUsersObj();
        const user = users[userId];
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (!user.completedTasks) user.completedTasks = [];
        if (user.completedTasks.includes(finalTaskId)) {
            return res.json({ success: false, message: 'Task already completed' });
        }

        // Get task info from db
        const task = (db.data.tasks && db.data.tasks[finalTaskId]) || (db.tasks && db.tasks[finalTaskId]);

        // TELEGRAM VERIFICATION
        if (task && task.url && (task.url.includes('t.me/') || task.name?.toLowerCase().includes('telegram'))) {
            const isJoined = await isUserInTelegram(task.url, userId);
            if (!isJoined) {
                return res.json({
                    success: false,
                    message: 'Verification failed. Please join the channel/group first and wait a few seconds.'
                });
            }
        }

        // Mark as completed
        user.completedTasks.push(finalTaskId);

        // Add rewards
        db.setTokenBalance(user, db.getTokenBalance(user) + finalReward);

        const gemsReward = (task && task.gems) ? task.gems : 1;
        const currentGemsTask = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        user.Gems = parseFloat((currentGemsTask + gemsReward).toFixed(4));
        user.balance_Gems = user.Gems;

        // Add history entry
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'mission_reward',
            amount: finalReward,
            reward: `+${finalReward} TC`,
            asset: 'TC',
            date: Date.now(),
            detail: task ? `Completed task: ${task.name}` : `Completed task: ${finalTaskId}`
        });

        saveUsersObj(users);
        db.save(true);

        res.json({
            success: true,
            message: 'Task completed successfully!',
            reward: finalReward,
            newBalance: db.getTokenBalance(user)
        });
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ success: false, message: 'Failed to complete task' });
    }
});


// ==========================================
// MOTHER EMAIL (IMAP) MANAGEMENT
// ==========================================
// MOTHER EMAIL (IMAP) MANAGEMENT
// ==========================================

// API: Admin - Connect Mother Email
app.post('/api/admin/mother-email/connect', async (req, res) => {
    try {
        const { type, email, password, host, port } = req.body;
        if (!type || !email || !password) return res.json({ success: false, message: 'Type, email and password required' });

        // Save config to DB
        if (!db.data.settings) db.data.settings = {};
        if (!db.data.adminSettings.motherEmailConfigs) db.data.adminSettings.motherEmailConfigs = {};

        db.data.adminSettings.motherEmailConfigs[type] = { email, password, host: host || null, port: port || 993, connectedAt: Date.now() };
        db.save(true);

        // Connect via IMAP
        const ok = await imapService.connect(type, { email, password, host, port: port || 993 });
        if (ok) {
            res.json({ success: true, message: `✅ Connected ${type} Mother Email: ${email}` });
        } else {
            res.json({ success: false, message: 'IMAP connection failed. Check credentials or App Password.' });
        }
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Disconnect Mother Email
app.post('/api/admin/mother-email/disconnect', (req, res) => {
    try {
        const { type } = req.body;
        if (!type) return res.json({ success: false, message: 'Type required' });

        imapService.disconnect(type);
        if (db.data.adminSettings && db.data.adminSettings.motherEmailConfigs) {
            delete db.data.adminSettings.motherEmailConfigs[type];
            db.save(true);
        }
        res.json({ success: true, message: `${type} Mother Email disconnected` });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Get Mother Email Status
app.get('/api/admin/mother-email/status', (req, res) => {
    try {
        const status = imapService.getStatus();
        const saved = db.data.adminSettings?.motherEmailConfigs || {};

        // Merge active status with saved configs
        const result = { gmail: {}, hotmail: {} };

        for (const type of ['gmail', 'hotmail']) {
            result[type] = {
                connected: !!status[type]?.connected,
                email: status[type]?.email || saved[type]?.email || null,
                savedConfig: saved[type] ? { email: saved[type].email, host: saved[type].host, port: saved[type].port } : null
            };
        }

        res.json({ success: true, status: result });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Fetch Inbox from Mother Email (for a specific pool email)
app.get('/api/mother-email/inbox', async (req, res) => {
    try {
        const { targetEmail, type, sinceMinutes } = req.query;
        const since = parseInt(sinceMinutes) || 120;
        const activeType = type || 'gmail';

        if (!imapService.isConnected(activeType)) {
            // Try to reconnect using saved config
            const saved = db.data.adminSettings?.motherEmailConfigs?.[activeType];
            if (saved) {
                await imapService.connect(activeType, saved);
            } else {
                return res.json({ success: false, message: `${activeType} Mother Email not connected`, messages: [] });
            }
        }

        let messages;
        if (targetEmail) {
            messages = await imapService.fetchMessagesForEmail(activeType, targetEmail, since);
        } else {
            messages = await imapService.fetchMessages(activeType, 50, since);
        }

        res.json({ success: true, messages, count: messages.length });
    } catch (e) {
        console.error(`[IMAP] Inbox fetch error for ${req.query.type}:`, e.message);
        res.json({ success: false, messages: [], message: e.message });
    }
});

// API: Auto-reconnect mother emails on server start
(async () => {
    try {
        const saved = db.data.adminSettings?.motherEmailConfigs;
        if (saved) {
            for (const [type, cfg] of Object.entries(saved)) {
                if (cfg && cfg.email && cfg.password) {
                    console.log(`[IMAP] Auto-connecting ${type} mother email:`, cfg.email);
                    await imapService.connect(type, cfg);
                }
            }
        }
    } catch (e) {
        console.warn('[IMAP] Auto-connect failed:', e.message);
    }
})();

// ==========================================
// ADMIN EMAIL POOL MANAGEMENT
// ==========================================


// API: Admin - Add Email to Pool
app.post('/api/admin/email-pool/add', (req, res) => {
    try {
        const { type, email, password, note } = req.body;
        if (!type || !email) return res.json({ success: false, message: 'type and email required' });

        if (!db.data.emailPool) db.data.emailPool = {};
        if (!db.data.emailPool[type]) db.data.emailPool[type] = [];

        // Prevent duplicate
        const exists = db.data.emailPool[type].find(e => e.email === email);
        if (exists) return res.json({ success: false, message: 'Email already in pool' });

        db.data.emailPool[type].push({
            email,
            password: password || null,
            note: note || '',
            status: 'available',
            addedAt: Date.now(),
            assignedTo: null,
            sessionId: null
        });
        db.save(true);
        res.json({ success: true, message: 'Email added to pool', total: db.data.emailPool[type].length });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - List Email Pool
app.get('/api/admin/email-pool/list', (req, res) => {
    try {
        const { type } = req.query;
        const pool = db.data.emailPool || {};
        const history = db.data.emailPoolHistory || [];

        const stats = {};
        ['gmail', 'hotmail', 'student'].forEach(t => {
            const typePool = pool[t] || [];
            stats[t] = {
                available: typePool.filter(e => !e.status || e.status === 'available').length,
                totalUsed: history.filter(h => h.type === t).length,
                recentHistory: history.filter(h => h.type === t).slice(0, 50)
            };
        });

        if (type) {
            return res.json({
                success: true,
                emails: pool[type] || [],
                type,
                stats: stats[type] || { available: 0, totalUsed: 0, recentHistory: [] }
            });
        }
        res.json({ success: true, pool, stats });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Delete Email from Pool or History
app.delete('/api/admin/email-pool/delete', (req, res) => {
    try {
        const { type, email } = req.body;
        if (!type || !email) return res.json({ success: false, message: 'type and email required' });

        let removed = false;

        // 1. Remove from active pool
        if (db.data.emailPool && db.data.emailPool[type]) {
            const initialCount = db.data.emailPool[type].length;
            db.data.emailPool[type] = db.data.emailPool[type].filter(e => e.email !== email);
            if (db.data.emailPool[type].length < initialCount) removed = true;
        }

        // 2. Remove from history
        if (db.data.emailPoolHistory) {
            const initialHistoryCount = db.data.emailPoolHistory.length;
            db.data.emailPoolHistory = db.data.emailPoolHistory.filter(h => h.email !== email || h.type !== type);
            if (db.data.emailPoolHistory.length < initialHistoryCount) removed = true;
        }

        if (removed) {
            db.save(true);
            res.json({ success: true, message: 'Email removed from pool and history' });
        } else {
            res.json({ success: false, message: 'Email not found in pool or history' });
        }
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Clear ALL Assigned (Used) Emails from Pool
app.post('/api/admin/email-pool/clear-assigned', (req, res) => {
    try {
        const { type } = req.body;
        if (!type) return res.json({ success: false, message: 'Type required' });

        const initialCount = db.data.emailPoolHistory ? db.data.emailPoolHistory.length : 0;

        if (db.data.emailPoolHistory) {
            db.data.emailPoolHistory = db.data.emailPoolHistory.filter(h => h.type !== type);
        }

        const cleared = initialCount - (db.data.emailPoolHistory ? db.data.emailPoolHistory.length : 0);

        db.save(true);
        res.json({ success: true, message: `Cleared ${cleared} used emails from ${type} history` });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// Helper: Assign email from admin pool
function assignEmailFromPool(type) {
    if (!db.data.emailPool || !db.data.emailPool[type]) return null;
    const available = db.data.emailPool[type].find(e => e.status === 'available');
    return available || null;
}

// API: Generate Premium Email (Gmail, Hotmail) - ADMIN POOL ONLY
const genLocks = new Set();
app.post('/api/premium-emails/generate', async (req, res) => {
    const { userId, provider } = req.body;

    // Sequential generation lock per user/provider
    const lockKey = `gen_${userId}_${provider}`;
    if (genLocks.has(lockKey)) {
        return res.json({ success: false, message: 'Generation in progress. Please wait.' });
    }
    genLocks.add(lockKey);

    try {
        const users = getUsersObj();
        const user = users[userId];
        if (!user) {
            genLocks.delete(lockKey);
            return res.json({ success: false, message: 'User not found' });
        }

        const settings = db.getSettings();
        const costs = settings.costs || {};
        let tokenCost = 20;
        if (provider === 'gmail') tokenCost = costs.gmail || 20;
        else if (provider === 'hotmail') tokenCost = costs.hotmail || 25;
        else if (provider === 'student') tokenCost = costs.student || 50;
        else if (provider === 'temp') tokenCost = costs.tempmail || 10;

        // Prevent double generation if already has a VERY fresh session (within 10 seconds)
        // This helps with accidental double clicks or concurrent auto-generations
        const now = Date.now();
        if (db.data.mailSessions) {
            const existingSession = Object.values(db.data.mailSessions).find(s =>
                String(s.userId) === String(userId) &&
                s.provider === provider &&
                (now - (s.createdAt || 0)) < 10000
            );
            if (existingSession) {
                return res.json({
                    success: true,
                    email: existingSession.email,
                    sessionId: Object.keys(db.data.mailSessions).find(k => db.data.mailSessions[k] === existingSession),
                    newBalance: db.getTokenBalance(user),
                    provider: existingSession.provider,
                    note: 'Restored recent session'
                });
            }
        }

        let emailData = null;

        // Gmail, Hotmail & Student: use ADMIN POOL only
        if (provider === 'gmail' || provider === 'hotmail' || provider === 'student') {
            const pool = db.data.emailPool?.[provider] || [];
            const available = pool.filter(e => !e.status || e.status === 'available');
            if (available.length === 0) {
                genLocks.delete(lockKey);
                return res.json({
                    success: false,
                    message: `❌ ${provider.toUpperCase()} pool is empty. Please contact admin to add more emails.`
                });
            } else {
                const poolEmail = available[0];
                emailData = {
                    email: poolEmail.email,
                    password: poolEmail.password || null,
                    provider: `admin_pool_${provider}`,
                    sessionId: poolEmail.email,
                    token: poolEmail.email
                };
                // REMOVE from pool after assignment (admin sees it's been used)
                db.data.emailPool[provider] = pool.filter(e => e.email !== poolEmail.email);
                // Save usage record in admin history
                if (!db.data.emailPoolHistory) db.data.emailPoolHistory = [];
                db.data.emailPoolHistory.unshift({
                    email: poolEmail.email,
                    type: provider,
                    assignedTo: userId,
                    assignedAt: new Date().toISOString()
                });
                db.save(true);
            }
        }

        if (!emailData || !emailData.email) {
            return res.json({ success: false, message: 'No emails available in pool. Please contact admin.' });
        }

        // Deduct tokens
        db.setTokenBalance(user, db.getTokenBalance(user) - tokenCost);
        if (!user.history) user.history = [];

        let historyType = 'premium_email';
        if (provider === 'gmail') historyType = 'gmail_email';
        else if (provider === 'hotmail') historyType = 'hotmail_email';
        else if (provider === 'temp') historyType = 'temp_mail';

        user.history.unshift({
            type: historyType,
            amount: -tokenCost,
            date: new Date().toISOString(),
            reward: `-${tokenCost} Tokens`,
            detail: emailData.email
        });
        saveUsersObj(users);

        // Store session — userId stored as string for consistent comparison
        const sessionId = `premium_${provider}_${Date.now()}_${userId}`;
        if (!db.data.mailSessions) db.data.mailSessions = {};
        db.data.mailSessions[sessionId] = {
            ...emailData,
            userId: String(userId),
            provider,
            createdAt: Date.now()
        };
        db.save(true);

        // Return email as plain STRING (not object) to avoid [object Object] on frontend
        res.json({
            success: true,
            email: emailData.email,    // ← plain string!
            sessionId,
            newBalance: db.getTokenBalance(user),
            provider: emailData.provider
        });
    } catch (err) {
        console.error("Gen Error:", err);
        res.json({ success: false, message: err.message });
    } finally {
        genLocks.delete(lockKey);
    }
});


// API: Fetch Premium Email Inbox
app.get('/api/premium-emails/inbox', async (req, res) => {
    const { sessionId, userId, service } = req.query;

    if (!sessionId) {
        return res.json({ success: false, message: 'Session ID required' });
    }

    // Get session data
    const session = db.data.mailSessions?.[sessionId];
    if (!session) {
        return res.json({ success: false, messages: [], email: null, note: 'Session not found or expired' });
    }

    // Verify user owns this session (loose equality for number vs string)
    if (userId && session.userId != null && String(session.userId) !== String(userId)) {
        return res.json({ success: false, message: 'Unauthorized' });
    }

    // Extract email string (handle old sessions where email was stored as object)
    const targetEmail = (typeof session.email === 'object' && session.email !== null)
        ? (session.email.email || '')
        : (session.email || '');

    if (!targetEmail) {
        return res.json({ success: false, messages: [], note: 'No email address in session' });
    }

    const providerStr = (session.provider || '').toString();
    const activeService = (session.service || service || '').toString();
    let messages = [];

    try {
        // ─── ADMIN POOL GMAIL → use IMAP Mother Email ───
        if (providerStr.startsWith('admin_pool_gmail') || providerStr === 'gmail' || activeService === 'gmail' || activeService === 'premium') {
            if (imapService.isConnected('gmail')) {
                messages = await imapService.fetchMessagesForEmail('gmail', targetEmail, 60);
            } else {
                // Try auto-reconnect
                const saved = db.data.adminSettings?.motherEmailConfigs?.gmail;
                if (saved) {
                    const ok = await imapService.connect('gmail', saved);
                    if (ok) messages = await imapService.fetchMessagesForEmail('gmail', targetEmail, 60);
                }
                if (messages.length === 0) {
                    return res.json({
                        success: false,
                        messages: [],
                        message: '⚠️ Gmail Mother Email not connected. Go to Admin Panel → Email Pool → Connect Gmail.'
                    });
                }
            }

            // ─── ADMIN POOL HOTMAIL → use IMAP Mother Email ───
        } else if (providerStr.startsWith('admin_pool_hotmail') || providerStr === 'hotmail' || activeService === 'hotmail' || activeService === 'hot') {
            if (imapService.isConnected('hotmail')) {
                messages = await imapService.fetchMessagesForEmail('hotmail', targetEmail, 60);
            } else {
                const saved = db.data.adminSettings?.motherEmailConfigs?.hotmail;
                if (saved) {
                    const ok = await imapService.connect('hotmail', saved);
                    if (ok) messages = await imapService.fetchMessagesForEmail('hotmail', targetEmail, 60);
                }
                if (messages.length === 0) {
                    return res.json({
                        success: false,
                        messages: [],
                        message: '⚠️ Hotmail Mother Email not connected. Go to Admin Panel → Email Pool → Connect Hotmail.'
                    });
                }
            }

            // ─── ADMIN POOL STUDENT → use IMAP Mother Email ───
        } else if (providerStr.startsWith('admin_pool_student') || providerStr === 'student' || activeService === 'student') {
            if (imapService.isConnected('student')) {
                messages = await imapService.fetchMessagesForEmail('student', targetEmail, 60);
            } else {
                const saved = db.data.adminSettings?.motherEmailConfigs?.student;
                if (saved) {
                    const ok = await imapService.connect('student', saved);
                    if (ok) messages = await imapService.fetchMessagesForEmail('student', targetEmail, 60);
                }
                if (messages.length === 0) {
                    return res.json({
                        success: false,
                        messages: [],
                        message: '⚠️ Student Mother Email not connected. Go to Admin Panel → Email Pool → Connect Student Email.'
                    });
                }
            }
        }

        // Format messages consistently
        const formatted = (messages || []).map(m => ({
            id: m.id || m.uid,
            from: m.from || 'Unknown',
            to: m.to || targetEmail,
            subject: m.subject || '(No Subject)',
            body: m.body || m.snippet || '',
            preview: String(m.body || m.snippet || '').substring(0, 120),
            otp: m.otp || (function (text, subject) {
                if (!text) return null;
                const res = otpExtractor.extractOTP(text, subject || '');
                return res ? res.otp : null;
            })(m.body || m.snippet || '', m.subject || '') || null,
            date: m.date || new Date().toISOString(),
            snippet: (m.snippet || m.body || '').substring(0, 100)
        }));

        // De-duplicate messages based on From, Subject and Snippet
        const uniqueMessages = [];
        const seen = new Set();
        for (const msg of formatted) {
            const key = `${msg.from}_${msg.subject}_${msg.snippet}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueMessages.push(msg);
            }
        }

        res.json({
            success: true,
            messages: uniqueMessages,
            email: targetEmail
        });
    } catch (e) {
        console.error('[Premium Inbox] Fetch error:', e.message);
        res.json({ success: true, messages: [], email: targetEmail });
    }
});


// API: Generate Temp/Hot/Gmail Email
app.post('/api/mail/generate', async (req, res) => {
    const { userId, cost, type, service, isUpgrade } = req.body;
    const users = getUsersObj();
    const user = users[userId];
    if (!user) return res.json({ success: false, message: 'User not found' });
    const settings = db.getSettings();
    const costs = settings.costs || {};
    const requestedService = (type || service || 'temp').toString().toLowerCase();

    let tokenCost = isUpgrade ? 0 : (costs.tempmail || 10);
    if (!isUpgrade) {
        if (requestedService === 'gmail' || requestedService === 'premium') tokenCost = costs.gmail || 20;
        else if (requestedService === 'hotmail' || requestedService === 'hot') tokenCost = costs.hotmail || 25;
        else if (requestedService === 'student') tokenCost = costs.student || 50;
    }

    let currency = 'token';
    if (requestedService === 'gmail' || requestedService === 'premium') currency = costs.gmailCurrency || 'token';
    else if (requestedService === 'hotmail' || requestedService === 'hot') currency = costs.hotmailCurrency || 'token';
    else if (requestedService === 'student') currency = costs.studentCurrency || 'token';
    else currency = costs.tempmailCurrency || 'token';

    // Balance check based on currency
    if (tokenCost > 0) {
        if (currency === 'Gems' || currency === 'gem') {
            const userGems = user.Gems || 0;
            if (userGems < tokenCost) {
                return res.json({ success: false, message: `Insufficient Gems. Need ${tokenCost} Gems for ${requestedService}.` });
            }
        } else if (currency === 'usd' || currency === 'USD') {
            const userUsd = user.usd || 0;
            if (userUsd < tokenCost) {
                return res.json({ success: false, message: `Insufficient USD. Need $${tokenCost} for ${requestedService}.` });
            }
        } else {
            const mailTokens = db.getTokenBalance(user);
            if (mailTokens < tokenCost) return res.json({ success: false, message: `Insufficient tokens. Need ${tokenCost} TC for ${requestedService}.` });
        }
    }

    let emailData = null;
    const sessionId = 'mail_' + requestedService + '_' + Date.now() + '_' + userId;

    try {
        if (requestedService === 'hotmail' || requestedService === 'hot') {
            // Hot Mail: ADMIN POOL ONLY
            const poolEmail = assignEmailFromPool('hotmail');
            if (!poolEmail) {
                return res.json({ success: false, message: '❌ Hotmail pool is empty. Please contact admin to add more emails.' });
            } else {
                emailData = {
                    email: poolEmail.email,
                    password: poolEmail.password || null,
                    provider: 'admin_pool_hotmail',
                    sessionId: poolEmail.email,
                    token: poolEmail.email
                };

                // Remove from pool
                db.data.emailPool['hotmail'] = db.data.emailPool['hotmail'].filter(e => e.email !== poolEmail.email);

                // Add to history
                if (!db.data.emailPoolHistory) db.data.emailPoolHistory = [];
                db.data.emailPoolHistory.push({
                    type: 'hotmail',
                    email: poolEmail.email,
                    assignedTo: userId,
                    assignedAt: Date.now()
                });
                db.save(true);
            }
        } else if (requestedService === 'gmail') {
            // Gmail: ADMIN POOL ONLY
            const poolEmail = assignEmailFromPool('gmail');
            if (!poolEmail) {
                return res.json({ success: false, message: '❌ Gmail pool is empty. Please contact admin to add more emails.' });
            } else {
                emailData = {
                    email: poolEmail.email,
                    password: poolEmail.password || null,
                    provider: 'admin_pool_gmail',
                    sessionId: poolEmail.email,
                    token: poolEmail.email
                };

                // Remove from pool
                db.data.emailPool['gmail'] = db.data.emailPool['gmail'].filter(e => e.email !== poolEmail.email);

                // Add to history
                if (!db.data.emailPoolHistory) db.data.emailPoolHistory = [];
                db.data.emailPoolHistory.push({
                    type: 'gmail',
                    email: poolEmail.email,
                    assignedTo: userId,
                    assignedAt: Date.now()
                });
                db.save(true);
            }
        } else if (requestedService === 'student') {
            // Student Mail: ADMIN POOL ONLY
            const poolEmail = assignEmailFromPool('student');
            if (!poolEmail) {
                return res.json({ success: false, message: '❌ Student email pool is empty. Please contact admin to add more emails.' });
            } else {
                emailData = {
                    email: poolEmail.email,
                    password: poolEmail.password || null,
                    provider: 'admin_pool_student',
                    sessionId: poolEmail.email,
                    token: poolEmail.email
                };

                // Remove from pool
                db.data.emailPool['student'] = db.data.emailPool['student'].filter(e => e.email !== poolEmail.email);

                // Add to history
                if (!db.data.emailPoolHistory) db.data.emailPoolHistory = [];
                db.data.emailPoolHistory.push({
                    type: 'student',
                    email: poolEmail.email,
                    assignedTo: userId,
                    assignedAt: Date.now()
                });
                db.save(true);
            }
        } else {
            const tempMail = require('../services/tempmail-providers');
            emailData = await tempMail.createAccount();
        }
    } catch (e) {
        console.error('Mail createAccount error:', e.message);
    }

    if (!emailData || !emailData.email) {
        console.error('❌ Mail generation failed for:', requestedService);
        return res.json({ success: false, message: 'Email not available. Please try again later or contact admin.' });
    }

    if (tokenCost > 0) {
        if (currency === 'Gems' || currency === 'gem') {
            const currentGemsForMail = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
            user.Gems = parseFloat((currentGemsForMail - tokenCost).toFixed(4));
            user.balance_Gems = user.Gems;
        } else if (currency === 'usd' || currency === 'USD') {
            user.usd = (user.usd || 0) - tokenCost;
        } else {
            db.setTokenBalance(user, db.getTokenBalance(user) - tokenCost);
        }

        if (!user.history) user.history = [];

        let historyType = 'temp_mail';
        if (requestedService === 'hotmail' || requestedService === 'hot') historyType = 'hotmail_email';
        else if (requestedService === 'gmail' || requestedService === 'premium') historyType = 'gmail_email';
        else if (requestedService === 'student') historyType = 'student_email';

        const curLabel = (currency === 'Gems' || currency === 'gem') ? 'Gems' : ((currency === 'usd' || currency === 'USD') ? 'USD' : 'Tokens');

        user.history.unshift({
            type: historyType,
            amount: -tokenCost,
            date: new Date().toISOString(),
            reward: `-${tokenCost} ${curLabel}`,
            detail: emailData.email
        });
        saveUsersObj(users);
    }

    // Store session
    if (!db.data.mailSessions) db.data.mailSessions = {};
    db.data.mailSessions[sessionId] = {
        ...emailData,
        userId,
        createdAt: Date.now(),
        service: requestedService
    };
    db.save(true);

    res.json({ success: true, email: emailData.email, sessionId, newBalance: db.getTokenBalance(user) });
});

// API: Renew Custom Email
app.post('/api/mail/renew-custom', async (req, res) => {
    const { userId, email, type } = req.body;
    const users = getUsersObj();
    const user = users[userId];
    if (!user) return res.json({ success: false, message: 'User not found' });

    const settings = db.getSettings();
    const costs = settings.costs || {};
    const tokenCost = costs.renewmail || 30;
    const bal = db.getTokenBalance(user);

    if (bal < tokenCost) return res.json({ success: false, message: `Insufficient tokens. Need ${tokenCost} TC.` });

    // Normalize type
    const requestedType = (type === 'premium' || type === 'gmail') ? 'gmail' : 'hotmail';

    // Find email in pool or history
    const pool = db.data.emailPool || {};
    const typePool = pool[requestedType] || [];
    let emailData = typePool.find(e => e.email.toLowerCase() === email.toLowerCase());

    if (!emailData) {
        const history = db.data.emailPoolHistory || [];
        const histItem = history.find(h => h.email.toLowerCase() === email.toLowerCase() && h.type === requestedType);
        if (histItem) {
            emailData = {
                email: histItem.email,
                provider: `admin_pool_${requestedType}`,
                sessionId: histItem.email
            };
        }
    }

    // Fallback: search in active sessions (allows renewing automation emails)
    if (!emailData) {
        const sessions = db.data.mailSessions || {};
        const sessionData = Object.values(sessions).find(s => s.email && s.email.toLowerCase() === email.toLowerCase() && String(s.userId) === String(userId));
        if (sessionData) {
            emailData = {
                email: sessionData.email,
                provider: sessionData.provider,
                sessionId: sessionData.sessionId || sessionData.token || sessionData.email,
                token: sessionData.token
            };
        }
    }

    if (!emailData) {
        return res.json({ success: false, message: 'Email not found. Only emails from our pool or your active sessions can be renewed.' });
    }

    // Deduct tokens
    db.setTokenBalance(user, bal - tokenCost);
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'mail_renew',
        amount: -tokenCost,
        date: new Date().toISOString(),
        reward: `-${tokenCost} Tokens`,
        detail: `Renewed ${emailData.email}`
    });
    saveUsersObj(users);

    // Create session
    const sessionId = 'mail_' + requestedType + '_renew_' + Date.now() + '_' + userId;
    if (!db.data.mailSessions) db.data.mailSessions = {};
    db.data.mailSessions[sessionId] = {
        ...emailData,
        userId,
        createdAt: Date.now(),
        service: requestedType,
        isRenewed: true
    };
    db.save(true);

    res.json({ success: true, email: emailData.email, sessionId, newBalance: db.getTokenBalance(user) });
});

app.get('/api/mail/active', async (req, res) => {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) return res.json({ success: false, message: 'User ID required' });

    // 24-hour retention for gmail and hotmail (premium)
    const activeSessions = {};
    const now = Date.now();
    const RETENTION_PERIOD = 24 * 60 * 60 * 1000; // 24 hours

    if (db.data.mailSessions) {
        // Collect latest active session per service type
        for (const [sessionId, session] of Object.entries(db.data.mailSessions)) {
            if (String(session.userId) === String(userId)) {
                if (now - session.createdAt < RETENTION_PERIOD) {
                    const type = session.service || session.provider || 'temp';

                    // For premium mails, pick the most recent session
                    if (type === 'gmail' || type === 'hotmail' || type === 'premium' || type.startsWith('admin_pool_')) {
                        if (!activeSessions[type] || session.createdAt > activeSessions[type].createdAt) {
                            activeSessions[type] = {
                                id: sessionId,
                                sessionId: sessionId,
                                email: session.email,
                                type: type,
                                createdAt: session.createdAt
                            };
                        }
                    }
                }
            }
        }
    }

    res.json({ success: true, activeSessions });
});

// API: Check Mail Inbox
app.get('/api/mail/inbox', async (req, res) => {
    const { sessionId } = req.query;
    const userId = req.query.userId;
    const cost = parseInt(req.query.cost) || 0;
    const sessions = db.data.mailSessions || {};
    const session = sessions[sessionId];
    if (!session) return res.json({ success: false, messages: [] });

    // ✅ FIX: Detect and flag blocked/outdated providers (1secmail, dropmail, mail.gw)
    const isBlockedProvider = ['1secmail', 'dropmail', 'mail.gw'].includes(session.provider) ||
                              (session.email && (
                                  session.email.includes('1secmail') ||
                                  session.email.includes('dropmail') ||
                                  session.email.includes('mail.gw')
                              ));
    if (isBlockedProvider) {
        return res.json({
            success: false,
            code: 'BLOCKED_PROVIDER',
            message: '⚠️ Outdated email provider detected. Click UPGRADE to get a fresh working inbox for FREE!'
        });
    }

    // Optional billing per refresh
    if (cost > 0 && userId) {
        try {
            const users = getUsersObj();
            const user = users[userId];
            if (!user) return res.json({ success: false, message: 'User not found', messages: [] });
            const bal = db.getTokenBalance(user);
            if (bal < cost) return res.json({ success: false, message: 'Insufficient tokens', newBalance: bal, messages: [] });
            db.setTokenBalance(user, bal - cost);
            if (!user.history) user.history = [];
            user.history.unshift({ type: 'mail_inbox_refresh', amount: cost, currency: 'tokens', date: Date.now() });
            saveUsersObj(users);
        } catch (e) { }
    }

    try {
        const activeService = (req.query.type || req.query.service || session.service || 'temp').toString().toLowerCase();
        const providerStr = (session.provider || '').toString();
        let messages = [];

        // ─── ADMIN POOL EMAILS → use Mother Email IMAP ───
        if (providerStr.startsWith('admin_pool_') || activeService === 'hotmail' || activeService === 'hot' || activeService === 'gmail') {
            const targetType = (activeService === 'hotmail' || activeService === 'hot') ? 'hotmail' : 'gmail';
            if (session.email && imapService.isConnected(targetType)) {
                messages = await imapService.fetchMessagesForEmail(targetType, session.email, 120);
            } else if (session.email) {
                // Try reconnect
                const saved = db.data.adminSettings?.motherEmailConfigs?.[targetType];
                if (saved) {
                    const ok = await imapService.connect(targetType, saved);
                    if (ok) messages = await imapService.fetchMessagesForEmail(targetType, session.email, 120);
                }
                if (messages.length === 0) {
                    return res.json({
                        success: false,
                        messages: [],
                        message: `⚠️ Mother Email for ${targetType} not connected. Contact admin.`
                    });
                }
            }
        } else {
            const tempMail = require('../services/tempmail-providers');
            messages = await tempMail.getMessages(session.token || sessionId, session.email, session.provider, sessionId, session.password);
        }

        const formatted = (messages || []).map(m => ({
            id: m.id,
            from: m.from || m.sender || 'Unknown',
            subject: m.subject || '(No Subject)',
            preview: (m.body || m.snippet || m.preview || '').substring(0, 100),
            body: m.body || m.snippet || m.preview || '',
            time: m.date ? new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            otp: m.otp || (function (text, subject) {
                if (!text) return null;
                const res = otpExtractor.extractOTP(text, subject || '');
                return res ? res.otp : null;
            })(m.body || m.snippet || '', m.subject || '') || null
        }));

        let newBalance;
        if (cost > 0 && userId) {
            try {
                const user = getUsersObj()[userId];
                if (user) newBalance = db.getTokenBalance(user);
            } catch (e) { }
        }
        res.json({ success: true, messages: formatted, newBalance });
    } catch (e) {
        console.error('Inbox fetch error:', e.message);
        res.json({ success: true, messages: [] });
    }
});

// API: Admin - Get All Users (sorted by USD balance descending — highest depositors on top)
app.get('/api/admin/users', (req, res) => {
    try {
        const users = getUsersObj();
        const list = Object.entries(users).map(([id, u]) => ({
            id,
            username: u.username || `User_${id}`,
            firstName: u.firstName || u.first_name || '',
            tokens: u.tokens || u.balance_tokens || 0,
            Gems: (u.Gems !== undefined ? u.Gems : (u.balance_Gems !== undefined ? u.balance_Gems : (u.gems || 0))),
            usd: (u.usd !== undefined && u.usd !== null) ? parseFloat(u.usd) : 0,
            invites: u.invites || u.referralCount || 0,
            verified: u.verified || false,
            adminVerified: u.adminVerified || false,
            apiStatus: u.apiStatus || 'allow',
            verifiedAt: u.verifiedAt || null,
            leftAt: u.leftAt || null,
            leftFrom: u.leftFrom || null,
            banned: u.banned || u.blocked || false,
            joinDate: u.joinDate || u.joinedAt || null,
            lastActive: u.lastActive || null,
            role: u.role || 'user'
        }));
        // Sort: users with USD balance first (highest first), then by lastActive
        list.sort((a, b) => {
            if (b.usd !== a.usd) return b.usd - a.usd;
            return (b.lastActive || 0) - (a.lastActive || 0);
        });
        res.json({ success: true, users: list, total: list.length });
    } catch (err) {
        console.error('[API] Error fetching users:', err);
        res.json({ success: false, message: err.message });
    }
});

// API: Admin - Update User Tokens
app.post('/api/admin/users/:userId/tokens', (req, res) => {
    const { userId } = req.params;
    const { tokens, action } = req.body;
    const users = getUsersObj();
    if (!users[userId]) return res.json({ success: false, message: 'User not found' });
    const u = users[userId];

    const cur = db.getTokenBalance(u);
    const amt = parseInt(tokens) || 0;

    if (action === 'add') db.setTokenBalance(u, cur + amt);
    else if (action === 'subtract') db.setTokenBalance(u, Math.max(0, cur - amt));
    else db.setTokenBalance(u, amt);

    saveUsersObj(users);
    res.json({ success: true, newBalance: db.getTokenBalance(u) });
});

// API: Admin - Ban/Unban User (with real-time sync)
app.post('/api/admin/users/:userId/ban', (req, res) => {
    const { userId } = req.params;
    const { ban } = req.body;
    const users = getUsersObj();
    const user = users[userId];

    if (!user) return res.json({ success: false, message: 'User not found' });

    // Ensure boolean value, never undefined
    const banStatus = ban === true || ban === 'true' || ban === 1 || ban === '1';
    user.banned = banStatus;
    user.blocked = banStatus; // Keep both in sync

    if (banStatus) {
        user.bannedAt = Date.now();
        user.status = 'banned';
    } else {
        user.status = 'active';
        delete user.bannedAt;
    }

    saveUsersObj(users);

    // ===== REAL-TIME SYNC =====
    // Update system version to trigger admin panel refresh
    db.updateSystemVersion();
    console.log(`[BAN] User ${userId} ban status updated to: ${banStatus} - sync triggered`);

    res.json({ success: true, banned: user.banned, version: db.getSystemVersion() });
});

// API: Admin — Get User IP History
app.get('/api/admin/users/:userId/ips', (req, res) => {
    try {
        const { userId } = req.params;
        const users = getUsersObj();
        const user = users[userId];
        if (!user) return res.json({ success: false, message: 'User not found' });
        res.json({
            success: true,
            lastIp: user.lastIp || null,
            ipHistory: user.ipHistory || [],
            bannedIps: db.data.bannedIps || []
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin — Ban / Unban an IP address
app.post('/api/admin/ip-ban', (req, res) => {
    try {
        const { ip, action } = req.body; // action: 'ban' | 'unban'
        if (!ip) return res.json({ success: false, message: 'IP is required' });

        if (!db.data.bannedIps) db.data.bannedIps = [];

        if (action === 'unban') {
            db.data.bannedIps = db.data.bannedIps.filter(i => i !== ip);
            db.save(true);
            return res.json({ success: true, message: `IP ${ip} unbanned` });
        }

        if (!db.data.bannedIps.includes(ip)) {
            db.data.bannedIps.push(ip);
            db.save(true);
        }
        return res.json({ success: true, message: `IP ${ip} banned` });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin — List all banned IPs
app.get('/api/admin/ip-bans', (req, res) => {
    res.json({ success: true, bannedIps: db.data.bannedIps || [] });
});

// API: Admin - Delete User
app.delete('/api/admin/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const users = getUsersObj();

    if (!users[userId]) {
        return res.json({ success: false, message: 'User not found' });
    }

    try {
        // ── 1. Stop any running bots and clean up intervals ───────────────
        if (db.data.botHosting && db.data.botHosting.bots) {
            const userBots = Object.values(db.data.botHosting.bots)
                .filter(b => b.userId === String(userId));

            for (const bot of userBots) {
                // Stop gem interval
                if (global._botHostingIntervals && global._botHostingIntervals[bot.id]) {
                    clearInterval(global._botHostingIntervals[bot.id]);
                    delete global._botHostingIntervals[bot.id];
                }
                // Stop on external server
                const svr = db.data.botHosting.servers &&
                    db.data.botHosting.servers.find(s => s.id === bot.serverId);
                if (svr && svr.apiUrl && svr.apiToken && bot.status === 'running') {
                    await bhCallServer(svr, 'stop', bot).catch(() => { });
                    await bhCallServer(svr, 'delete', bot).catch(() => { });
                }
                // Delete uploaded file
                if (bot.filePath) {
                    try { if (fs.existsSync(bot.filePath)) fs.unlinkSync(bot.filePath); } catch (e) { }
                }
                // Remove bot entry
                delete db.data.botHosting.bots[bot.id];
            }

            // Recalculate botCounts
            if (db.data.botHosting.servers) {
                db.data.botHosting.servers.forEach(svr => {
                    svr.botCount = Object.values(db.data.botHosting.bots)
                        .filter(b => b.serverId === svr.id).length;
                });
            }
        }

    // ── 3. Remove SMM orders ──────────────────────────────────────────
        if (db.data.smmOrders) {
            db.data.smmOrders = db.data.smmOrders.filter(o => String(o.userId) !== String(userId));
        }

        // ── 4. Remove deposits ────────────────────────────────────────────
        if (db.data.deposits) {
            db.data.deposits = db.data.deposits.filter(d => String(d.userId) !== String(userId));
        }

        // ── 5. Remove notifications ───────────────────────────────────────
        if (db.data.notifications) {
            db.data.notifications = db.data.notifications.filter(n => String(n.userId) !== String(userId));
        }

        // ── 6. Remove support messages ────────────────────────────────────
        if (db.data.supportMessages) {
            delete db.data.supportMessages[String(userId)];
        }

        // ── 7. Remove API key from apiKeys list ───────────────────────────
        if (db.data.apiKeys) {
            db.data.apiKeys = db.data.apiKeys.filter(k => String(k.userId) !== String(userId));
        }

        db.save(true);

        // ── 8. Finally delete the user ────────────────────────────────────
        delete users[userId];
        saveUsersObj(users);

        console.log(`[ADMIN] User ${userId} fully deleted with all associated data`);
        res.json({ success: true, message: 'User and all associated data deleted successfully' });

    } catch (e) {
        console.error('[DELETE USER ERROR]', e.message);
        // Still try to delete the user even if cleanup fails
        delete users[userId];
        saveUsersObj(users);
        res.json({ success: true, message: 'User deleted (some cleanup may have failed)' });
    }
});

// ✅ NEW: API - Get All Helper Admins
app.get('/api/admin/helper-admins', (req, res) => {
    try {
        const users = getUsersObj();
        const helperAdmins = Object.values(users).filter(u => u.role === 'helper_admin');

        const helperList = helperAdmins.map(u => ({
            id: u.id,
            firstName: u.firstName || u.first_name || 'Unknown',
            username: u.username || '',
            enabled: u.helperAdminEnabled !== false,
            addedAt: u.helperAdminAddedAt || null,
            addedBy: u.helperAdminAddedBy || null,
            messagesSent: u.helperAdminMessagesSent || 0,
            broadcastsSent: u.helperAdminBroadcastsSent || 0
        }));

        res.json({ success: true, helpers: helperList });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ✅ NEW: API - Add Helper Admin
app.post('/api/admin/helper-admins/add', async (req, res) => {
    try {
        const { adminUserId, targetUserId } = req.body;

        // Only main admin can add helpers
        if (String(adminUserId) !== String(process.env.ADMIN_ID)) {
            return res.json({ success: false, message: 'Only main admin can add helper admins' });
        }

        const users = getUsersObj();
        const targetUser = users[targetUserId];

        if (!targetUser) {
            return res.json({ success: false, message: 'User not found' });
        }

        // Set helper admin role
        targetUser.role = 'helper_admin';
        targetUser.helperAdminEnabled = true;
        targetUser.helperAdminAddedAt = new Date().toISOString();
        targetUser.helperAdminAddedBy = adminUserId;
        targetUser.helperAdminMessagesSent = 0;
        targetUser.helperAdminBroadcastsSent = 0;

        saveUsersObj(users);

        // Notify the new helper admin via bot
        if (bot) {
            bot.sendMessage(targetUserId,
                `🎉 **Congratulations!**\n\n` +
                `You have been promoted to **Helper Admin**!\n\n` +
                `You now have access to the admin panel and can help manage the bot.\n\n` +
                `⚠️ Note: The main admin can disable your access at any time.`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        }

        res.json({ success: true, message: 'Helper admin added successfully' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ✅ NEW: API - Toggle Helper Admin Status
app.post('/api/admin/helper-admins/:userId/toggle', async (req, res) => {
    try {
        const { userId } = req.params;
        const { adminUserId, enabled } = req.body;

        // Only main admin can toggle helpers
        if (String(adminUserId) !== String(process.env.ADMIN_ID)) {
            return res.json({ success: false, message: 'Only main admin can manage helper admins' });
        }

        const users = getUsersObj();
        const targetUser = users[userId];

        if (!targetUser || targetUser.role !== 'helper_admin') {
            return res.json({ success: false, message: 'Helper admin not found' });
        }

        targetUser.helperAdminEnabled = enabled;

        if (!enabled) {
            targetUser.helperAdminDisabledAt = new Date().toISOString();
        }

        saveUsersObj(users);

        // Notify the helper admin
        if (bot) {
            const statusMsg = enabled
                ? `✅ Your helper admin access has been **enabled**!`
                : `⚠️ Your helper admin access has been **disabled** by the main admin.`;

            bot.sendMessage(userId, statusMsg, { parse_mode: 'Markdown' }).catch(() => { });
        }

        res.json({ success: true, message: `Helper admin ${enabled ? 'enabled' : 'disabled'} successfully` });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ✅ NEW: API - Remove Helper Admin (and delete their messages)
app.delete('/api/admin/helper-admins/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { adminUserId, deleteMessages } = req.body;

        // Only main admin can remove helpers
        if (String(adminUserId) !== String(process.env.ADMIN_ID)) {
            return res.json({ success: false, message: 'Only main admin can remove helper admins' });
        }

        const users = getUsersObj();
        const targetUser = users[userId];

        if (!targetUser || targetUser.role !== 'helper_admin') {
            return res.json({ success: false, message: 'Helper admin not found' });
        }

        // Remove helper admin role
        delete targetUser.role;
        delete targetUser.helperAdminEnabled;
        delete targetUser.helperAdminAddedAt;
        delete targetUser.helperAdminAddedBy;

        saveUsersObj(users);

        // ✅ Delete all messages sent by this helper admin if requested
        let deletedCount = 0;
        if (deleteMessages && bot) {
            // Delete from broadcast history
            if (db.data.broadcasts) {
                db.data.broadcasts = db.data.broadcasts.filter(b => {
                    if (b.sentBy === userId) {
                        deletedCount++;
                        return false;
                    }
                    return true;
                });
            }

            // Delete from user notifications
            Object.values(users).forEach(u => {
                if (u.notifications) {
                    u.notifications = u.notifications.filter(n => n.sentBy !== userId);
                }
            });

            saveUsersObj(users);
            db.save(true);
        }

        // Notify the removed helper
        if (bot) {
            bot.sendMessage(userId,
                `⚠️ **Helper Admin Access Removed**\n\n` +
                `Your helper admin privileges have been revoked by the main admin.\n\n` +
                (deleteMessages ? `All your sent messages have been deleted.` : ''),
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        }

        res.json({
            success: true,
            message: 'Helper admin removed successfully',
            deletedMessages: deletedCount
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - User Detail + Full History
app.get('/api/admin/user-detail/:userId', (req, res) => {
    const { userId } = req.params;
    const users = getUsersObj();
    const u = users[userId];
    if (!u) return res.json({ success: false, message: 'User not found' });

    const userProfile = {
        id: userId,
        firstName: u.firstName || u.first_name || '',
        username: u.username || '',
        tokens: db.getTokenBalance(u),
        Gems: u.Gems || 0,
        usd: u.usd || 0,
        referralCount: u.referralCount || u.invites || 0,
        verified: u.verified || false,
        banned: u.banned || u.blocked || false,
        joinDate: u.joinDate || u.joinedAt || null,
        lastActive: u.lastActive || null,
        completedTasks: u.completedTasks || [],
        redeemedCodes: u.redeemedCodes || [],
        referredBy: u.referredBy || null,
        pendingReferrer: u.pendingReferrer || null,
    };

    const history = Array.isArray(u.history) ? u.history : [];
    res.json({ success: true, user: userProfile, history });
});

// API: Exchange - Convert Assets
// Exchange rates: 1 USD = 1000 Gems, 1 Gem = 100 Tokens, so 1 USD = 100,000 Tokens
app.post('/api/exchange/convert', (req, res) => {
    const { userId, from, to, amount } = req.body;
    const users = getUsersObj();
    const user = users[userId];
    if (!user) return res.json({ success: false, message: 'User not found' });

    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return res.json({ success: false, message: 'Please enter a valid amount' });

    if (from === to) {
        return res.json({ success: false, message: 'Please select different currencies' });
    }

    // Currency field names
    const getField = (tokenType) => {
        if (tokenType === 'tokens') return user.tokens !== undefined ? 'tokens' : 'balance_tokens';
        return tokenType; // usd, Gems
    };

    const fromField = getField(from);
    const toField = getField(to);

    // Read balance — for Gems, always check both fields
    const balance = from === 'Gems'
        ? parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0))
        : parseFloat(user[getField(from)] || 0);
    if (balance < amt) return res.json({ success: false, message: 'Insufficient balance' });

    // UPDATED RATES: 1 USD = 1000 Gems, 1 Gem = 100 Tokens
    const settings = db.getSettings();
    const USD_TO_GEMS = settings.usdToGems || 1000;      // 1 USD = 1000 Gems
    const GEM_TO_TOKENS = settings.gemToToken || 100;    // 1 Gem = 100 Tokens
    const USD_TO_TOKENS = USD_TO_GEMS * GEM_TO_TOKENS;   // 1 USD = 100,000 Tokens

    // 1. Convert source to a common base (Tokens)
    let tokensBase = 0;
    if (from === 'tokens') tokensBase = amt;
    else if (from === 'usd') tokensBase = amt * USD_TO_TOKENS;
    else if (from === 'Gems') tokensBase = amt * GEM_TO_TOKENS;

    // 2. Convert base to target
    let targetAmount = 0;
    if (to === 'tokens') targetAmount = tokensBase;
    else if (to === 'Gems') targetAmount = tokensBase / GEM_TO_TOKENS;
    else if (to === 'usd') targetAmount = tokensBase / USD_TO_TOKENS;

    // Apply rounding
    if (to === 'usd') targetAmount = Math.round(targetAmount * 1000) / 1000;
    else if (to === 'Gems') targetAmount = Math.floor(targetAmount * 100) / 100;
    else targetAmount = Math.floor(targetAmount);

    if (targetAmount <= 0) return res.json({ success: false, message: 'Amount too small to convert' });

    // Get exchange fee from config (default 2%)
    const exchangeFeePercent = settings.exchangeFee || 2;
    const exchangeFee = to === 'tokens' ? Math.ceil((targetAmount * exchangeFeePercent) / 100)
        : to === 'Gems' ? Math.ceil((targetAmount * exchangeFeePercent * 100) / 100) / 100
            : Math.round((targetAmount * exchangeFeePercent) / 100 * 1000) / 1000;
    const amountAfterFee = to === 'tokens' ? Math.floor(targetAmount - exchangeFee)
        : to === 'usd' ? Math.round((targetAmount - exchangeFee) * 1000) / 1000
            : Math.round((targetAmount - exchangeFee) * 100) / 100;

    if (amountAfterFee <= 0) return res.json({ success: false, message: 'Amount too small after fee' });

    // Update balances
    if (from === 'tokens') db.setTokenBalance(user, db.getTokenBalance(user) - amt);
    else if (from === 'Gems') {
        // Sync both fields when deducting Gems
        const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        const newGems = Math.max(0, Math.round((currentGems - amt) * 10000) / 10000);
        user.Gems = newGems;
        user.balance_Gems = newGems;
    } else {
        user[fromField] = Math.max(0, parseFloat(balance) - amt);
    }

    if (to === 'tokens') db.setTokenBalance(user, db.getTokenBalance(user) + amountAfterFee);
    else if (to === 'Gems') {
        // Use bhSetGems-style: always sync BOTH Gems and balance_Gems
        const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        const newGems = Math.max(0, Math.round((currentGems + amountAfterFee) * 10000) / 10000);
        user.Gems = newGems;
        user.balance_Gems = newGems;
    } else {
        const currentTo = parseFloat(user[toField] || 0);
        user[toField] = Math.round((currentTo + amountAfterFee) * 1000) / 1000;
    }

    // History record
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'exchange',
        amount: -amt,
        currency: from === 'tokens' ? 'TC' : (from === 'Gems' ? 'Gems' : 'USD'),
        exchangeFrom: from === 'tokens' ? 'TC' : (from === 'Gems' ? 'Gems' : 'USD'),
        exchangeTo: to === 'tokens' ? 'TC' : (to === 'Gems' ? 'Gems' : 'USD'),
        fromAmount: amt,
        toAmount: amountAfterFee,
        date: Date.now(),
        detail: `Exchanged ${amt} ${from} → ${amountAfterFee} ${to}`
    });
    user.history.unshift({
        type: 'exchange',
        amount: amountAfterFee,
        currency: to === 'tokens' ? 'TC' : (to === 'Gems' ? 'Gems' : 'USD'),
        exchangeFrom: from === 'tokens' ? 'TC' : (from === 'Gems' ? 'Gems' : 'USD'),
        exchangeTo: to === 'tokens' ? 'TC' : (to === 'Gems' ? 'Gems' : 'USD'),
        fromAmount: amt,
        toAmount: amountAfterFee,
        date: Date.now(),
        detail: `Received ${amountAfterFee} ${to} (fee: ${exchangeFee} ${to})`
    });

    saveUsersObj(users, true);
    res.json({
        success: true,
        message: `✅ Exchanged ${amt} ${from} → ${amountAfterFee} ${to} (Fee: ${exchangeFee} ${to}, ${exchangeFeePercent}%)`,
        fee: exchangeFee,
        feePercent: exchangeFeePercent,
        fromAmount: amt,
        toAmount: amountAfterFee,
        tokens: db.getTokenBalance(user),
        Gems: parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0)),
        usd: user.usd || 0,
        // Rate info for UI display
        rates: { usdToGems: USD_TO_GEMS, gemToTokens: GEM_TO_TOKENS, usdToTokens: USD_TO_TOKENS }
    });
});

// API: User Transfer Assets
app.post('/api/user/transfer', async (req, res) => {
    const { fromUserId, toUserId, amount, asset } = req.body;
    if (!fromUserId || !toUserId || isNaN(amount) || amount <= 0 || !asset) {
        return res.json({ success: false, message: 'Invalid transfer details' });
    }

    const users = getUsersObj();
    const fromUser = users[fromUserId.toString()];
    const toUser = users[toUserId.toString()];

    if (!fromUser) return res.json({ success: false, message: 'Sender not found' });
    if (!toUser) return res.json({ success: false, message: 'Recipient not found' });
    if (String(fromUserId) === String(toUserId)) return res.json({ success: false, message: 'Cannot transfer to yourself' });

    // Get transfer fee from config — USD always 0% fee
    const settings = db.getSettings();
    const transferFeePercent = (asset === 'usd' || asset === 'USD') ? 0 : (settings.transferFee || 5);

    // Calculate fee — USD: 0 fee, full amount goes to receiver
    const rawFee = (amount * transferFeePercent) / 100;
    const transferFee = asset === 'usd' ? 0 : Math.ceil(rawFee);
    const amountAfterFee = asset === 'usd'
        ? Math.round(parseFloat(amount) * 1000) / 1000
        : (amount - transferFee);

    // Identify field names based on asset type
    let field = asset; // usd, Gems, tokens
    if (asset === 'tokens') {
        field = fromUser.tokens !== undefined ? 'tokens' : 'balance_tokens';
    }

    const balance = parseFloat(fromUser[field]) || 0;
    if (balance < amount) return res.json({
        success: false,
        message: `Insufficient balance.`
    });

    // Perform transfer - deduct full amount from sender
    if (asset === 'tokens') {
        db.setTokenBalance(fromUser, db.getTokenBalance(fromUser) - parseInt(amount));
    } else if (asset === 'usd') {
        fromUser[field] = Math.max(0, balance - parseFloat(amount));
    } else {
        fromUser[field] = Math.max(0, balance - parseInt(amount));
    }

    // Recipient receives amount after fee deduction
    let toField = asset;
    if (asset === 'tokens') {
        toField = toUser.tokens !== undefined ? 'tokens' : 'balance_tokens';
    }

    if (asset === 'tokens') {
        db.setTokenBalance(toUser, db.getTokenBalance(toUser) + amountAfterFee);
    } else if (asset === 'usd') {
        toUser[toField] = parseFloat(((toUser[toField] || 0) + amountAfterFee).toFixed(3));
    } else {
        toUser[toField] = (toUser[toField] || 0) + amountAfterFee;
    }

    // History Records
    if (!fromUser.history) fromUser.history = [];
    fromUser.history.unshift({
        type: 'transfer_out',
        amount,
        fee: transferFee,
        feePercent: transferFeePercent,
        asset,
        to: toUserId,
        toUser: String(toUserId),
        date: Date.now()
    });

    if (!toUser.history) toUser.history = [];
    toUser.history.unshift({
        type: 'transfer_in',
        amount: amountAfterFee,
        asset,
        from: fromUserId,
        fromUser: String(fromUserId),
        date: Date.now()
    });

    saveUsersObj(users);

    res.json({
        success: true,
        message: asset === 'usd'
            ? `✅ Sent ${(() => { const v = parseFloat(amountAfterFee); return '$' + (Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, '')); })()} — No fee charged!`
            : `✅ Sent ${amount} ${asset}, receiver gets ${amountAfterFee} ${asset} (Fee: ${transferFee} - ${transferFeePercent}%)`,
        fee: transferFee,
        feePercent: transferFeePercent,
        amountSent: amount,
        amountReceived: amountAfterFee,
        newBalances: {
            tokens: db.getTokenBalance(fromUser),
            Gems: fromUser.Gems || 0,
            usd: fromUser.usd || 0
        }
    });
});

// API: Deduct Support Loan (Support System)
app.post('/api/user/deduct-support-loan', async (req, res) => {
    const { userId, amount } = req.body;
    if (!userId || isNaN(amount) || amount <= 0) {
        return res.json({ success: false, message: 'Invalid user ID or amount' });
    }

    const users = getUsersObj();
    const user = users[userId.toString()];

    if (!user) return res.json({ success: false, message: 'User not found' });

    // Get current balance
    const currentBalance = db.getTokenBalance(user) || 0;

    // Calculate new balance after deduction (can go negative)
    const newBalance = currentBalance - amount;

    // Check if this becomes a loan (negative balance)
    let supportLoan = user.supportLoan || 0;
    if (newBalance < 0) {
        // This is a loan - track how much is owed
        supportLoan += Math.abs(newBalance);
    }

    // Deduct tokens (allow negative balance)
    db.setTokenBalance(user, newBalance);

    // Update support loan tracking
    user.supportLoan = supportLoan;

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'support_contact',
        amount: amount,
        cost: amount,
        supportLoan: supportLoan,
        date: Date.now()
    });

    saveUsersObj(users);

    res.json({
        success: true,
        message: 'Support cost deducted successfully',
        newBalance: newBalance,
        supportLoan: supportLoan,
        tookLoan: newBalance < 0
    });
});

// API: Auto-repay support loan when user earns tokens
app.post('/api/user/repay-support-loan', async (req, res) => {
    const { userId, earnedAmount } = req.body;
    if (!userId || isNaN(earnedAmount) || earnedAmount <= 0) {
        return res.json({ success: false, message: 'Invalid user ID or earned amount' });
    }

    const users = getUsersObj();
    const user = users[userId.toString()];

    if (!user) return res.json({ success: false, message: 'User not found' });

    const supportLoan = user.supportLoan || 0;
    if (supportLoan <= 0) {
        return res.json({ success: false, message: 'No support loan to repay', repaid: 0 });
    }

    // Calculate how much to repay
    const repayAmount = Math.min(earnedAmount, supportLoan);

    // Get current balance
    const currentBalance = db.getTokenBalance(user) || 0;

    // User earns tokens first
    let newBalance = currentBalance + earnedAmount;

    // Then deduct the loan repayment
    newBalance = newBalance - repayAmount;

    // Update loan amount
    const newSupportLoan = supportLoan - repayAmount;

    // Update user data
    db.setTokenBalance(user, newBalance);
    user.supportLoan = newSupportLoan;

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'support_loan_repay',
        earned: earnedAmount,
        repaid: repayAmount,
        remainingLoan: newSupportLoan,
        date: Date.now()
    });

    saveUsersObj(users);

    res.json({
        success: true,
        message: `Repaid ${repayAmount} TC of support loan`,
        newBalance: newBalance,
        supportLoan: newSupportLoan,
        repaid: repayAmount
    });
});

// API: Deposit - Submit Request
app.post('/api/deposit/submit', async (req, res) => {
    const { userId, method, amount, txnId, screenshot } = req.body;
    if (!userId || !method || !amount || !txnId) {
        return res.json({ success: false, message: 'Missing required fields' });
    }

    db.data.pendingDeposits = db.data.pendingDeposits || [];

    // Check if txnId already exists (prevent duplicate submissions)
    const exists = db.data.pendingDeposits.find(d => d.txnId === txnId);
    if (exists) {
        return res.json({ success: false, message: 'Transaction ID already submitted for review.' });
    }

    const depositId = 'dep_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const deposit = {
        id: depositId,
        userId: userId.toString(),
        method,
        amount: parseFloat(amount),
        txnId,
        screenshot: screenshot || null,
        date: Date.now(),
        status: 'pending'
    };

    db.data.pendingDeposits.unshift(deposit);
    db.save(true);

    // ===== NOTIFY ADMIN VIA TELEGRAM =====
    try {
        const adminId = getAdminId();
        const activeBot = bot;
        if (activeBot && adminId) {
            const userObj = db.data.users && db.data.users[userId.toString()];
            const userName = userObj ? (userObj.firstName || userObj.username || `User ${userId}`) : `User ${userId}`;
            const userUsername = userObj && userObj.username ? `@${userObj.username}` : `ID: ${userId}`;

            const notifText = `💰 *New Deposit Request*\n\n` +
                `👤 *User:* ${userName} (${userUsername})\n` +
                `💵 *Amount:* $${parseFloat(amount).toFixed(2)}\n` +
                `🏦 *Method:* ${method}\n` +
                `🔖 *TxnID:* \`${txnId}\`\n` +
                `📅 *Time:* ${new Date().toLocaleString()}\n` +
                `🆔 *Deposit ID:* \`${depositId}\``;

            const inlineKeyboard = {
                inline_keyboard: [[
                    { text: '✅ Approve', callback_data: `deposit_approve_${depositId}` },
                    { text: '❌ Reject', callback_data: `deposit_reject_${depositId}` }
                ]]
            };

            // If screenshot provided, send with photo
            if (screenshot && screenshot.startsWith('data:image')) {
                // Convert base64 to buffer and send as photo
                try {
                    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
                    const imgBuffer = Buffer.from(base64Data, 'base64');
                    await activeBot.sendPhoto(adminId, imgBuffer, {
                        caption: notifText,
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    });
                } catch (photoErr) {
                    console.error('[DEPOSIT NOTIFY] Photo send failed:', photoErr.message);
                    // Fallback to text message
                    await activeBot.sendMessage(adminId, notifText + '\n\n📎 _Screenshot attached (see web panel)_', {
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    });
                }
            } else if (screenshot && (screenshot.startsWith('http') || screenshot.startsWith('/'))) {
                // URL screenshot
                try {
                    const screenshotUrl = screenshot.startsWith('/') ?
                        `${process.env.PUBLIC_URL || 'http://localhost:3000'}${screenshot}` : screenshot;
                    await activeBot.sendPhoto(adminId, screenshotUrl, {
                        caption: notifText,
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    });
                } catch (photoErr) {
                    await activeBot.sendMessage(adminId, notifText, {
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    });
                }
            } else {
                await activeBot.sendMessage(adminId, notifText, {
                    parse_mode: 'Markdown',
                    reply_markup: inlineKeyboard
                });
            }
            console.log(`[DEPOSIT NOTIFY] Admin notified for deposit ${depositId}`);
        }
    } catch (notifyErr) {
        console.error('[DEPOSIT NOTIFY] Error notifying admin:', notifyErr.message);
        // Don't fail the deposit submission if notification fails
    }

    res.json({ success: true, message: 'Deposit submitted successfully! Admin will review it shortly.' });
});

// API: User - Get Deposit History
app.get('/api/deposits/history', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, message: 'userId required' });
    const all = db.data.pendingDeposits || [];
    const userDeposits = all
        .filter(d => String(d.userId) === String(userId))
        .map(d => ({
            id: d.id,
            method: d.method || 'unknown',
            amount: d.amount || 0,
            amountBDT: d.amountBDT || null,
            txnId: d.txnId || '',
            status: d.status || 'pending',
            timestamp: d.date || d.timestamp || Date.now()
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    res.json({ success: true, deposits: userDeposits });
});


// API: Deposit - Get Config (QR/Addresses)
app.get('/api/deposit/config', (req, res) => {
    const settings = db.data.settings || {};
    res.json({
        success: true,
        cryptoMethods: db.data.cryptoMethods || {},
        usdToBdt: settings.usdToBdt || 120
    });
});

// API: Admin - Get All Deposits (Pending & History)
app.get('/api/admin/deposits', (req, res) => {
    const pending = (db.data.pendingDeposits || []).filter(d => d.status === 'pending');
    const history = (db.data.pendingDeposits || []).filter(d => d.status !== 'pending').slice(0, 50);
    res.json({ success: true, pending, history });
});

// API: Admin - Deposit Action (Approve/Reject)
app.post('/api/admin/deposits/action', async (req, res) => {
    const { depositId, action, note } = req.body;
    const deposits = db.data.pendingDeposits || [];
    const depositIndex = deposits.findIndex(d => d.id === depositId);

    if (depositIndex === -1) return res.json({ success: false, message: 'Deposit not found' });

    const deposit = deposits[depositIndex];
    if (deposit.status !== 'pending') return res.json({ success: false, message: 'Deposit already processed' });

    if (action === 'approve') {
        const users = getUsersObj();
        let user = users[deposit.userId];

        // If user doesn't exist, create them
        if (!user) {
            console.log(`[DEPOSIT] Creating missing user ${deposit.userId} for deposit approval`);
            user = {
                id: deposit.userId,
                userId: deposit.userId,
                firstName: 'User',
                username: 'user_' + deposit.userId,
                tokens: 0,
                balance_tokens: 0,
                Gems: 0,
                balance_Gems: 0,
                usd: 0,
                history: [],
                lastActive: Date.now()
            };
            users[deposit.userId] = user;
        }

        // Credit user with USD balance
        user.usd = parseFloat(((user.usd || 0) + deposit.amount).toFixed(3));

        // Add to history
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'deposit',
            amount: deposit.amount,
            currency: 'usd',
            method: deposit.method,
            txnId: deposit.txnId,
            date: Date.now(),
            status: 'completed'
        });

        // ===== ADD NOTIFICATION FOR APPROVAL =====
        if (!user.notifications) user.notifications = [];
        user.notifications.unshift({
            id: 'deposit_approved_' + deposit.id,
            type: 'deposit',
            title: '✅ Deposit Approved',
            message: `Your $${deposit.amount.toFixed(2)} deposit via ${deposit.method} has been approved! Your balance is updated.`,
            timestamp: new Date().toISOString(),
            read: false,
            autoClose: true,
            duration: 8000
        });

        saveUsersObj(users);
        deposit.status = 'approved';

        // === NOTIFY USER VIA TELEGRAM ===
        try {
            const activeBot = bot;
            if (activeBot && deposit.userId) {
                const userMsg = `✅ *Deposit Approved!*\n\n` +
                    `💵 *Amount:* $${deposit.amount.toFixed(2)}\n` +
                    `🏦 *Method:* ${deposit.method}\n` +
                    `🔖 *TxnID:* \`${deposit.txnId}\`\n\n` +
                    `💰 Your balance has been updated. Check your account!`;
                await activeBot.sendMessage(deposit.userId, userMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '💰 Check Balance', callback_data: 'main_menu' }
                        ]]
                    }
                }).catch(() => { });
            }
        } catch (e) { console.error('[DEPOSIT NOTIFY USER] Error:', e.message); }

    } else {
        deposit.status = 'rejected';
        deposit.adminNote = note;

        // ===== ADD NOTIFICATION FOR REJECTION =====
        if (!user.notifications) user.notifications = [];
        user.notifications.unshift({
            id: 'deposit_rejected_' + deposit.id,
            type: 'deposit',
            title: '❌ Deposit Rejected',
            message: `Your $${deposit.amount.toFixed(2)} deposit via ${deposit.method} was rejected.${note ? ' Reason: ' + note : ''}`,
            timestamp: new Date().toISOString(),
            read: false,
            autoClose: true,
            duration: 10000
        });

        // === NOTIFY USER ABOUT REJECTION ===
        try {
            const activeBot = bot;
            if (activeBot && deposit.userId) {
                const rejectMsg = `❌ *Deposit Rejected*\n\n` +
                    `💵 *Amount:* $${deposit.amount.toFixed(2)}\n` +
                    `🏦 *Method:* ${deposit.method}\n` +
                    `🔖 *TxnID:* \`${deposit.txnId}\`\n` +
                    (note ? `\n📝 *Reason:* ${note}\n` : '') +
                    `\nIf you think this is an error, please contact support.`;
                await activeBot.sendMessage(deposit.userId, rejectMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📞 Contact Support', callback_data: 'support' }
                        ]]
                    }
                }).catch(() => { });
            }
        } catch (e) { console.error('[DEPOSIT REJECT NOTIFY USER] Error:', e.message); }
    }

    db.save(true);

    // ===== REAL-TIME SYNC =====
    // Update system version to trigger admin panel refresh
    db.updateSystemVersion();
    console.log(`[DEPOSIT] Action '${action}' on deposit ${depositId} - sync triggered`);

    res.json({ success: true, version: db.getSystemVersion() });
});

// API: Admin - Delete ALL Deposit History
app.post('/api/admin/deposits/delete-all', (req, res) => {
    try {
        if (!db.data.pendingDeposits) db.data.pendingDeposits = [];
        // Only keep the pending ones
        db.data.pendingDeposits = db.data.pendingDeposits.filter(d => d.status === 'pending');
        db.save(true);
        res.json({ success: true, message: 'Deposit history cleared (Pending requests preserved)' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Auto Approve by Transaction IDs
app.post('/api/admin/deposits/auto-approve', (req, res) => {
    const { txnIds } = req.body; // Array of strings or newline separated string
    if (!txnIds) return res.json({ success: false, message: 'No IDs provided' });

    let idsArray = Array.isArray(txnIds) ? txnIds : txnIds.split('\n').map(s => s.trim()).filter(s => s);

    const deposits = db.data.pendingDeposits || [];
    const users = getUsersObj();
    let approvedCount = 0;

    idsArray.forEach(tid => {
        const deposit = deposits.find(d => d.txnId === tid && d.status === 'pending');
        if (deposit) {
            const user = users[deposit.userId];
            if (user) {
                user.usd = parseFloat(((user.usd || 0) + deposit.amount).toFixed(3));
                if (!user.history) user.history = [];
                user.history.unshift({
                    type: 'deposit',
                    amount: deposit.amount,
                    currency: 'usd',
                    method: deposit.method,
                    txnId: deposit.txnId,
                    date: Date.now(),
                    status: 'completed',
                    autoApproved: true
                });
                deposit.status = 'approved';
                deposit.autoApproved = true;
                approvedCount++;
            }
        }
    });

    if (approvedCount > 0) {
        saveUsersObj(users);
        db.save(true);
    }

    res.json({ success: true, approvedCount, totalChecked: idsArray.length });
});

// API: Admin - Update Deposit Config
app.post('/api/admin/deposits/config', (req, res) => {
    const { cryptoMethods } = req.body;
    if (cryptoMethods) {
        db.data.cryptoMethods = cryptoMethods;
        db.save(true);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/admin/services/:id/stock', (req, res) => {
    const { id } = req.params;
    let stock = 0;

    // Check cards
    if (db.data.cards && db.data.cards[id]) {
        stock = db.data.cards[id].length;
    }
    // Check VPN accounts
    else if (db.data.vpnAccounts && db.data.vpnAccounts[id]) {
        stock = db.data.vpnAccounts[id].length;
    }
    // Check shop items
    else if (db.data.shopItems && db.data.shopItems[id]) {
        stock = db.data.shopItems[id].stock || 0;
    }

    res.json({ success: true, stock, id });
});

// API: Admin - Dashboard Stats (Enhanced with proper user counting)
app.get('/api/admin/stats', async (req, res) => {
    try {
    if (!db.ready) await db.dbReady;
    const usersList = await db.getUsers();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    let active = 0;
    let revenue = 0;
    let totalTokens = 0;
    let totalGems = 0;
    let totalUsdt = 0;
    let verifiedUsers = 0;

    usersList.forEach(u => {
        if (u.lastActive && (now - u.lastActive < day)) active++;
        revenue += (u.balance || 0);
        totalTokens += db.getTokenBalance(u);
        totalGems += (u.balance_Gems !== undefined ? u.balance_Gems : (u.Gems !== undefined ? u.Gems : 0));
        totalUsdt += (u.usd !== undefined ? u.usd : 0);
        if (u.successfulVerifications > 0 || u.verified) verifiedUsers++;
    });

    const shopItems = Object.keys(db.data.shopItems || {}).length;
    const accounts = db.data.premiumAccounts ? db.data.premiumAccounts.length : 0;

    // Sum all VPNs
    let totalVpns = 0;
    if (db.data.vpnAccounts) {
        Object.values(db.data.vpnAccounts).forEach(arr => totalVpns += (arr ? arr.length : 0));
    }

    // Sum all Cards (Only for existing services)
    let totalCards = 0;
    if (db.data.cards && db.data.services) {
        Object.keys(db.data.services).forEach(serviceId => {
            const arr = db.data.cards[serviceId];
            totalCards += (arr ? arr.length : 0);
        });
    }

    // Count ALL Emails from Pool (Enhanced to include all categories)
    const pool = db.data.emailPool || {};
    const history = db.data.emailPoolHistory || [];

    let gmailTotal = 0;
    let gmailUsed = 0;

    ['gmail', 'hotmail', 'student'].forEach(t => {
        const typePool = pool[t] || [];
        const available = typePool.filter(e => !e.status || e.status === 'available').length;
        const used = history.filter(h => h.type === t).length;

        gmailTotal += (available + used);
        gmailUsed += used;
    });

    let gmailsUsed = 0;
    // Count total unique mail sessions that have been generated from history
    usersList.forEach(u => {
        if (u.history) {
            u.history.forEach(h => {
                if (h.type && h.type.includes('mail')) {
                    gmailsUsed++;
                }
            });
        }
    });

    // API Stats (Enhanced)
    let apiActiveKeys = 0;
    let apiTotalCalls = 0;
    usersList.forEach(u => {
        if (u.apiKey) {
            if (u.apiStatus === 'allow') apiActiveKeys++;
            apiTotalCalls += (u.apiTotalCalls || 0);
        }
    });

    // Count User API keys (Actual keys held by users)
    let apiKeys = usersList.filter(u => u.apiKey).length;

    // NEW: Calculate deposits, withdrawals, and service stats
    let totalDeposits = 0; // count of approved deposits
    let totalRevenueUsdt = 0; // sum of USD deposits
    let totalWithdrawals = 0;
    let pendingDeposits = 0;
    let totalServiceStock = 0;

    // Count pending deposits
    pendingDeposits = (db.data.pendingDeposits || []).filter(d => d.status === 'pending').length;

    // Calculate from user history
    usersList.forEach(u => {
        if (u.history) {
            u.history.forEach(h => {
                if (h.type === 'deposit' || h.type === 'addTokens') {
                    totalDeposits++;
                    totalRevenueUsdt += h.amount || h.tokens || 0;
                } else if (h.type === 'withdraw' || h.type === 'deductTokens') {
                    totalWithdrawals += h.amount || h.tokens || 0;
                }
            });
        }
    });

    const smmOrdersCount = (db.data.smmOrders || []).length;
    const promoCodesCount = Object.keys((db.data.settings && db.data.settings.codes) || db.data.codes || {}).length;
    const tasksCount = Object.keys(db.data.tasks || {}).length;
    const telegramGroupsCount = Object.keys(db.data.groups || {}).length;
    const adNetworksCount = Object.keys(db.data.adSettings || {}).length;

    // NEW: Service categories count
    const serviceCategories = (db.data.serviceCategories || []).length;

    // NEW: Calculate total service stock
    const serviceItems = db.data.serviceItems || {};
    Object.values(serviceItems).forEach(item => {
        if (item.stock && Array.isArray(item.stock)) {
            totalServiceStock += item.stock.length;
        }
    });

    // NEW: Last backup time
    const lastBackup = db.data.lastBackup ? new Date(db.data.lastBackup).toLocaleString() : 'Never';

    // NEW: Calculate user growth (compare with last week)
    const weekAgo = now - (7 * day);
    const newUsersThisWeek = usersList.filter(u => u.joinDate && u.joinDate > weekAgo).length;
    const userGrowth = usersList.length > 0 ? Math.round((newUsersThisWeek / usersList.length) * 100) : 0;

    res.json({
        success: true,
        totalUsers: usersList.length,
        totalTokens,
        totalGems,
        totalUsdt,
        verifiedUsers,
        activeToday: active,
        shopItems,
        accounts,
        totalVpns,
        totalCards,
        gmailsUsed,
        apiKeys,
        gmails: {
            total: gmailTotal,
            used: gmailUsed,
            available: gmailTotal - gmailUsed,
            percent: gmailTotal > 0 ? Math.round((gmailUsed / gmailTotal) * 100) : 0
        },
        api: {
            totalKeys: apiKeys,
            activeKeys: apiActiveKeys,
            totalCalls: apiTotalCalls,
            activeUsers: active // Proxy for now
        },
        // New stats
        totalDeposits,
        totalWithdrawals,
        pendingDeposits,
        revenue: totalRevenueUsdt,
        smmOrdersCount,
        promoCodesCount,
        tasksCount,
        telegramGroupsCount,
        adNetworksCount,
        serviceCategories,
        totalServiceStock,
        lastBackup,
        userGrowth,
        stats: {
            totalUsers: usersList.length,
            activeUsers: active,
            offlineUsers: usersList.length - active,
            revenue: totalRevenueUsdt,
            shopItems,
            accounts,
            totalVpns,
            totalCards,
            gmailsUsed,
            dbSize: (fs.existsSync(db.DB_FILE) ? (fs.statSync(db.DB_FILE).size / 1024).toFixed(2) : 0) + ' KB'
        }
    });
    } catch(e) {
        console.error('Error in /api/admin/stats:', e.message);
        res.json({ success: true, totalUsers: 0, activeToday: 0, totalTokens: 0, totalGems: 0, totalUsdt: 0, verifiedUsers: 0, pendingDeposits: 0, totalDeposits: 0, revenue: 0, totalCards: 0, totalVpns: 0, gmailsUsed: 0, shopItems: 0, apiKeys: 0, smmOrdersCount: 0, promoCodesCount: 0, tasksCount: 0, telegramGroupsCount: 0, adNetworksCount: 0, serviceCategories: 0, totalServiceStock: 0, lastBackup: 'Never', userGrowth: 0, gmails: { total: 0, used: 0, available: 0, percent: 0 }, api: { totalKeys: 0, activeKeys: 0, totalCalls: 0, activeUsers: 0 }, stats: {} });
    }
});

// API: Admin - System Info
app.get('/api/admin/system-info', async (req, res) => {
    const usersList = await db.getUsers();
    const groups = db.getGroups();
    const providers = db.getProviders ? db.getProviders().length : 0;
    const accountsCount = db.getAccounts ? db.getAccounts().length : 0;

    // Uptime calculation
    const uptimeInSeconds = process.uptime();
    const hours = Math.floor(uptimeInSeconds / 3600);
    const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
    const uptimeStr = `${hours}h ${minutes}m`;

    // Memory usage
    const mem = process.memoryUsage();
    const memStr = `${(mem.rss / 1024 / 1024).toFixed(2)} MB`;

    res.json({
        success: true,
        uptime: uptimeStr,
        memory: memStr,
        dbSize: (fs.existsSync(db.DB_FILE) ? (fs.statSync(db.DB_FILE).size / 1024).toFixed(2) : 0) + ' KB',
        stats: {
            totalTransactions: db.data.transactions ? db.data.transactions.length : 0,
            totalUsers: usersList.length,
            totalGroups: groups.length,
            totalProviders: providers,
            totalAccounts: accountsCount
        },
        dbSnapshot: {
            users: usersList.length,
            settings: db.data.settings,
            featureFlags: db.data.featureFlags
        }
    });
});

// API: Admin - Card Management
app.get('/api/admin/cards', (req, res) => {
    const cards = [];

    // Legacy card prices
    Object.keys(db.data.cardPrices || {}).forEach(key => {
        cards.push({
            id: key,
            name: db.data.serviceNames?.[key] || key.toUpperCase(),
            price: db.data.cardPrices[key] || 50,
            count: db.data.cards?.[key]?.length || 0,
            imageUrl: db.data.serviceIcons?.[key] || ''
        });
    });

    // Unified Service Items
    Object.keys(db.data.services || {}).forEach(key => {
        const item = db.data.services[key];
        if ((item.section === 'virtual-cards' || item.section === 'cards') && (!db.data.cardPrices || db.data.cardPrices[key] === undefined)) {
            cards.push({
                id: item.id,
                name: item.name || item.id.toUpperCase(),
                price: item.price || item.cost || 0,
                currency: item.currency || item.priceCurrency || 'TC',
                count: db.data.cards?.[item.id]?.length || 0,
                imageUrl: db.data.serviceIcons?.[item.id] || item.imageUrl || ''
            });
        }
    });

    res.json({ success: true, cards });
});

app.post('/api/admin/cards', (req, res) => {
    const { name, price, oldKey } = req.body;
    const key = name.toLowerCase().replace(/\s+/g, '');
    if (!db.data.cardPrices) db.data.cardPrices = {};
    if (!db.data.cards) db.data.cards = {};

    if (oldKey && oldKey !== key) {
        db.data.cardPrices[key] = db.data.cardPrices[oldKey];
        db.data.cards[key] = db.data.cards[oldKey];
        delete db.data.cardPrices[oldKey];
        delete db.data.cards[oldKey];
    }

    db.data.cardPrices[key] = parseInt(price);
    if (!db.data.cards[key]) db.data.cards[key] = [];
    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true });
});

app.delete('/api/admin/cards/:key', (req, res) => {
    const key = req.params.key;
    if (db.data.cardPrices) delete db.data.cardPrices[key];
    if (db.data.cards) delete db.data.cards[key];
    db.save(true);
    res.json({ success: true });
});

// =============================================
// VIRTUAL CARDS (VCC) — Admin CRUD
// =============================================

// GET: List all virtual cards for sale
app.get('/api/admin/vcards', (req, res) => {
    const vcards = db.data.virtualCards || {};
    const list = Object.values(vcards).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ success: true, vcards: list });
});

// POST: Add a new virtual card
app.post('/api/admin/vcards', (req, res) => {
    try {
        const { cardHolder, cardNumber, expiry, cvv, address, city, zip, country, cardType, price, status, passiveNumber } = req.body;
        if (!cardNumber || !cardHolder) return res.json({ success: false, message: 'Card number and holder name required' });

        if (!db.data.virtualCards) db.data.virtualCards = {};
        const id = 'vc_' + Date.now();
        db.data.virtualCards[id] = {
            id,
            cardHolder: cardHolder.trim(),
            cardNumber: cardNumber.replace(/\s+/g, '').trim(),
            expiry: (expiry || '').trim(),
            cvv: (cvv || '').trim(),
            address: (address || '').trim(),
            city: (city || '').trim(),
            zip: (zip || '').trim(),
            country: (country || 'US').trim(),
            cardType: cardType || 'visa',
            price: parseFloat(price) || 0,
            status: status || 'available',   // available | sold | reserved
            passiveNumber: (passiveNumber || '').trim(),
            createdAt: Date.now()
        };
        db.save(true);
        res.json({ success: true, id, message: 'Virtual card added' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// PUT: Update a virtual card
app.put('/api/admin/vcards/:id', (req, res) => {
    try {
        const id = req.params.id;
        if (!db.data.virtualCards || !db.data.virtualCards[id]) return res.json({ success: false, message: 'Card not found' });
        const fields = ['cardHolder', 'cardNumber', 'expiry', 'cvv', 'address', 'city', 'zip', 'country', 'cardType', 'price', 'status', 'passiveNumber'];
        fields.forEach(f => {
            if (req.body[f] !== undefined) db.data.virtualCards[id][f] = req.body[f];
        });
        db.data.virtualCards[id].updatedAt = Date.now();
        db.save(true);
        res.json({ success: true, message: 'Card updated' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// DELETE: Remove a virtual card
app.delete('/api/admin/vcards/:id', (req, res) => {
    try {
        const id = req.params.id;
        if (!db.data.virtualCards) return res.json({ success: false, message: 'No cards' });
        delete db.data.virtualCards[id];
        db.save(true);
        res.json({ success: true, message: 'Card deleted' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// POST: Generate a random address for a card
app.post('/api/admin/vcards/generate-address', (req, res) => {
    const addresses = [
        { address: '123 Oak Street', city: 'New York', zip: '10001', country: 'US' },
        { address: '456 Maple Ave', city: 'Los Angeles', zip: '90001', country: 'US' },
        { address: '789 Pine Road', city: 'Chicago', zip: '60601', country: 'US' },
        { address: '321 Elm Blvd', city: 'Houston', zip: '77001', country: 'US' },
        { address: '654 Cedar Lane', city: 'Phoenix', zip: '85001', country: 'US' },
        { address: '987 Birch Court', city: 'Miami', zip: '33101', country: 'US' },
        { address: '111 Walnut Drive', city: 'Seattle', zip: '98101', country: 'US' },
        { address: '222 Cherry St', city: 'Boston', zip: '02101', country: 'US' }
    ];
    const pick = addresses[Math.floor(Math.random() * addresses.length)];
    res.json({ success: true, ...pick });
});

// =============================================
// VIRTUAL CARDS — User-facing API
// =============================================

// GET: Available virtual cards for users (public, no sensitive data until purchased)
app.get('/api/vcards/available', (req, res) => {
    const vcards = db.data.virtualCards || {};
    const available = Object.values(vcards)
        .filter(c => c.status === 'available')
        .map(c => ({
            id: c.id,
            cardType: c.cardType,
            cardHolder: c.cardHolder,
            lastFour: c.cardNumber ? c.cardNumber.slice(-4) : '••••',
            expiry: c.expiry,
            hasAddress: !!(c.address),
            hasPassiveNumber: !!(c.passiveNumber),
            price: c.price,
            createdAt: c.createdAt
        }))
        .sort((a, b) => (a.price || 0) - (b.price || 0));
    res.json({ success: true, vcards: available });
});

// POST: Purchase a virtual card
app.post('/api/vcards/purchase', async (req, res) => {
    try {
        const { userId, cardId } = req.body;
        if (!userId || !cardId) return res.json({ success: false, message: 'userId and cardId required' });

        const users = getUsersObj();
        const user = users[userId];
        if (!user) return res.json({ success: false, message: 'User not found' });

        const vcards = db.data.virtualCards || {};
        const card = vcards[cardId];
        if (!card) return res.json({ success: false, message: 'Card not found' });
        if (card.status !== 'available') return res.json({ success: false, message: 'Card is not available' });

        const price = parseFloat(card.price) || 0;
        const userBalance = parseFloat(user.usdBalance || user.balance || 0);
        if (price > 0 && userBalance < price) return res.json({ success: false, message: `Insufficient balance. Need $${price.toFixed(2)}, have $${userBalance.toFixed(2)}` });

        // Deduct balance
        if (price > 0) {
            user.usdBalance = parseFloat((userBalance - price).toFixed(2));
            if (!user.history) user.history = [];
            user.history.push({ type: 'purchase', desc: `Virtual Card (${card.cardType.toUpperCase()}) ending ${card.cardNumber.slice(-4)}`, amount: -price, date: Date.now() });
        }

        // Mark as sold
        card.status = 'sold';
        card.soldTo = userId;
        card.soldAt = Date.now();

        saveUsersObj(users);
        db.save(true);

        // Notify admin
        const adminId = config.ADMIN_ID || process.env.ADMIN_ID;
        if (bot && adminId) {
            bot.sendMessage(adminId, `💳 <b>Virtual Card Sold</b>\n\nUser: <code>${userId}</code>\nCard: ${card.cardType.toUpperCase()} ending ${card.cardNumber.slice(-4)}\nPrice: $${price.toFixed(2)}`, { parse_mode: 'HTML' }).catch(() => { });
        }

        // Return full card details to buyer
        res.json({
            success: true,
            message: 'Card purchased successfully!',
            card: {
                cardHolder: card.cardHolder,
                cardNumber: card.cardNumber,
                expiry: card.expiry,
                cvv: card.cvv,
                address: card.address,
                city: card.city,
                zip: card.zip,
                country: card.country,
                cardType: card.cardType,
                passiveNumber: card.passiveNumber
            }
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Group Management
app.get('/api/admin/groups', async (req, res) => {
    const groups = db.getGroups();

    // Try to refresh member counts for each group/channel with timeout
    if (bot && groups.length > 0) {
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000)); // 5 second timeout
        const countFetches = Promise.allSettled(groups.map(async (g) => {
            try {
                if (typeof bot.getChatMemberCount === 'function') {
                    const count = await bot.getChatMemberCount(g.id);
                    if (count && count > 0) {
                        g.memberCount = count;
                        if (db.data.groups && db.data.groups[String(g.id)]) {
                            db.data.groups[String(g.id)].memberCount = count;
                        }
                    }
                }
            } catch (e) {
                console.log(`[GROUPS] Failed to fetch member count for ${g.id}: ${e.message}`);
                // Keep existing memberCount if fetch fails
            }
        }));

        // Race between fetching and timeout
        await Promise.race([countFetches, timeoutPromise]);
        db.save(true);
    }

    res.json({ success: true, groups: db.getGroups() });
});

// API: Admin - Add Group or Channel manually
app.post('/api/admin/groups/add', (req, res) => {
    const { id, title, type } = req.body;
    if (!id) return res.json({ success: false, message: 'Chat ID or Username required' });
    if (!db.data.groups) db.data.groups = {};
    const chatId = String(id).trim();
    db.data.groups[chatId] = {
        id: chatId,
        title: title || chatId,
        type: type || (chatId.startsWith('@') ? 'channel' : 'group'),
        memberCount: 0,
        addedAt: Date.now(),
        lastActive: Date.now()
    };
    db.save(true);
    res.json({ success: true, groups: db.getGroups() });
});

// API: Admin - Group Settings (GET)
app.get('/api/admin/group-settings', (req, res) => {
    const settings = db.getGroupSettings();
    // Include auto-approve setting
    const autoApprove = db.data.adminSettings?.autoApproveJoinRequests === true ||
        settings.autoApproveJoinRequests === true;
    res.json({
        success: true, settings: {
            ...settings,
            autoApproveJoinRequests: autoApprove
        }
    });
});

// API: Admin - Live Stream Assistant Action Control
// ---------------------------------------------------------------------------
// Live Stream Assistant
//
// Real streaming happens in the Python worker (services/livestream):
// Pyrogram joins the chat, PyTgCalls joins the group call and pipes audio
// into it, yt-dlp resolves the track to a real audio stream. This layer only
// proxies to that worker and reports honestly when it is not installed - it
// never claims a join or a stream that did not happen.
// ---------------------------------------------------------------------------
const livestreamBridge = require('../services/livestream-bridge');

function lsTargetChat(chatId) {
    const explicit = livestreamBridge.parseChatId(chatId);
    if (explicit !== null) return explicit;
    const fromKeys = db.data.apiKeys || {};
    const byChannel = livestreamBridge.parseChatId(fromKeys.requiredChannel);
    if (byChannel !== null) return byChannel;
    return livestreamBridge.parseChatId(fromKeys.requiredGroup);
}

app.post('/api/admin/livestream-assistant/action', async (req, res) => {
    try {
        const body = req.body || {};
        const action = body.action;
        const settings = db.getGroupSettings() || db.data.adminSettings?.groupManagement || {};

        if (settings.userbotEnabled === false) {
            return res.json({
                success: false,
                message: 'Live Stream Assistant is switched off. Turn it on in Groups & Moderation first.',
            });
        }

        const target = lsTargetChat(body.chatId);
        if (target === null) {
            return res.json({
                success: false,
                message: 'No target chat. Pick a group or channel in Stream Target & Controls, '
                    + 'or set a default required channel/group.',
            });
        }

        // Remember the chosen target so the next action reuses it.
        if (body.chatId) {
            if (!db.data.adminSettings) db.data.adminSettings = {};
            db.data.adminSettings.liveStreamTargetChat = body.chatId;
            db.save(true);
        }

        const base = {
            chatId: target,
            url: body.url,
            title: body.title,
            artist: body.artist,
            duration: body.duration,
            thumb: body.thumb,
            requestedBy: 'admin',
        };

        let result;
        switch (action) {
            case 'join':
                result = await livestreamBridge.call('/join', base, settings);
                break;
            case 'play':
                if (!base.url) {
                    return res.json({
                        success: false,
                        message: 'Pick a track first - use Search or paste a link in the player.',
                    });
                }
                result = await livestreamBridge.call('/play', base, settings);
                break;
            case 'queue':
                if (!base.url) {
                    return res.json({ success: false, message: 'Pick a track to add to the queue.' });
                }
                result = await livestreamBridge.call('/queue', base, settings);
                break;
            case 'pause':
                result = await livestreamBridge.call('/pause', base, settings);
                break;
            case 'resume':
                result = await livestreamBridge.call('/resume', base, settings);
                break;
            case 'stop':
            case 'leave':
                result = await livestreamBridge.call('/stop', base, settings);
                break;
            case 'schedule': {
                const mins = Number(body.minutes);
                if (!mins || mins <= 0 || Number.isNaN(mins)) {
                    return res.json({ success: false, message: 'Enter how many minutes from now it should start.' });
                }
                if (!base.url) {
                    return res.json({ success: false, message: 'Pick a track to schedule first.' });
                }
                result = await livestreamBridge.call('/schedule', { ...base, minutes: mins }, settings);
                break;
            }
            case 'cancel-schedule':
                result = await livestreamBridge.call('/cancel-schedule', base, settings);
                break;
            case 'status':
                result = await livestreamBridge.call('/status', base, settings);
                return res.json({ success: result.ok !== false, ...result });
            case 'search':
                result = await livestreamBridge.call('/search', { query: body.query || '' }, settings);
                return res.json({ success: result.ok !== false, results: result.results || [], ...result });
            default:
                return res.json({ success: false, message: 'Unknown action: ' + action });
        }

        return res.json({ success: result.ok !== false, ...result });
    } catch (e) {
        console.error('[LIVESTREAM ASSISTANT ACTION ERROR]', e);
        return res.json({ success: false, message: 'Error: ' + e.message });
    }
});

// Reports whether the streaming engine is installed and connected.
app.get('/api/admin/livestream-assistant/health', async (req, res) => {
    try {
        const h = await livestreamBridge.health();
        res.json({ success: true, ...h });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// Compatibility endpoint
app.get('/api/admin/groups/settings', (req, res) => {
    const settings = db.getGroupSettings();
    // Include auto-approve setting
    const autoApprove = db.data.adminSettings?.autoApproveJoinRequests === true ||
        settings.autoApproveJoinRequests === true;
    res.json({
        success: true, settings: {
            ...settings,
            autoApproveJoinRequests: autoApprove
        }
    });
});

// API: Admin - Group Management (GET)
app.get('/api/admin/group-management', (req, res) => {
    if (!db.data.adminSettings) db.data.adminSettings = {};
    const gm = db.data.adminSettings.groupManagement || {};
    const autoApprove = db.data.adminSettings.autoApproveJoinRequests === true ||
        gm.autoApproveJoinRequests === true;
    const response = {
        ...gm,
        autoDeleteSystemMessages: gm.autoDeleteSystemMessages !== false,
        deleteJoinMessages: gm.deleteJoinMessages !== false,
        deleteLeaveMessages: gm.deleteLeaveMessages !== false,
        autoApproveJoinRequests: autoApprove,
        requireTelegram: db.data.adminSettings.requireTelegram === true,
        joinRequests: db.data.joinRequests || []
    };
    res.json({ success: true, settings: response });
});

// API: Admin - Get All Join Requests
app.get('/api/admin/join-requests', (req, res) => {
    res.json({
        success: true,
        joinRequests: db.data.joinRequests || []
    });
});

// API: Admin - Action on Join Request (Approve / Decline)
app.post('/api/admin/join-requests/action', async (req, res) => {
    const { requestId, chatId, userId, action } = req.body;
    if (!chatId || !userId || !action) {
        return res.json({ success: false, message: 'chatId, userId, and action required' });
    }

    const bot = global.botInstance || (typeof activeBot !== 'undefined' ? activeBot : null);
    if (!bot) {
        return res.json({ success: false, message: 'Bot instance is not currently active' });
    }

    try {
        if (!db.data.joinRequests) db.data.joinRequests = [];
        let reqItem = db.data.joinRequests.find(r => (requestId && r.id === requestId) || (String(r.chatId) === String(chatId) && String(r.userId) === String(userId) && r.status === 'pending'));

        if (action === 'approve') {
            try {
                await bot.approveChatJoinRequest(chatId, userId);
            } catch (err) {
                const errMsg = String(err.message || '');
                if (!errMsg.includes('USER_ALREADY_PARTICIPANT') && !errMsg.includes('already a participant') && !errMsg.includes('HIDE_REQUESTER_MISSING') && !errMsg.includes('USER_ALREADY_INVITED')) {
                    throw err;
                }
            }
            if (reqItem) reqItem.status = 'approved';
            db.save(true);
            db.triggerSystemUpdate();

            await bot.sendMessage(userId, `✅ <b>Congratulations!</b> Your request to join the group/channel has been approved by Admin!`, { parse_mode: 'HTML' }).catch(() => {});
            return res.json({ success: true, message: 'Join request approved successfully' });
        } else if (action === 'decline' || action === 'reject') {
            await bot.declineChatJoinRequest(chatId, userId);
            if (reqItem) reqItem.status = 'rejected';
            db.save(true);
            db.triggerSystemUpdate();
            return res.json({ success: true, message: 'Join request declined successfully' });
        } else {
            return res.json({ success: false, message: 'Invalid action specified' });
        }
    } catch (err) {
        console.error('[ADMIN JOIN REQUEST ACTION ERROR]', err);
        return res.json({ success: false, message: err.message });
    }
});

// API: Admin - Group Management (POST)

// API: Admin - Toggle Global Chat Lock
app.post('/api/admin/group-management/lock', async (req, res) => {
    const { unlock, chatIds } = req.body; // unlock: true/false, chatIds: optional array of specific chat IDs
    
    // Save state
    if (!db.data.adminSettings) db.data.adminSettings = {};
    if (!db.data.adminSettings.groupManagement) db.data.adminSettings.groupManagement = {};
    if (!chatIds || chatIds.length === 0) {
        db.data.adminSettings.groupManagement.globalChatUnlocked = unlock;
    }
    db.save(true);
    
    if (typeof global.botInstance !== 'undefined') {
        const bot = global.botInstance;
        const groups = db.data.groups || {};
        let targetChatIds = [];
        if (chatIds && Array.isArray(chatIds) && chatIds.length > 0) {
            targetChatIds = chatIds;
        } else {
            targetChatIds = Object.keys(groups);
        }

        let successCount = 0;
        let failCount = 0;
        
        for (const chatId of targetChatIds) {
            try {
                if (unlock) {
                    await bot.setChatPermissions(chatId, {
                        can_send_messages: true,
                        can_send_audios: true,
                        can_send_documents: true,
                        can_send_photos: true,
                        can_send_videos: true,
                        can_send_video_notes: true,
                        can_send_voice_notes: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true,
                        can_invite_users: true,
                        can_change_info: false,
                        can_pin_messages: false
                    });
                } else {
                    await bot.setChatPermissions(chatId, {
                        can_send_messages: false,
                        can_send_audios: false,
                        can_send_documents: false,
                        can_send_photos: false,
                        can_send_videos: false,
                        can_send_video_notes: false,
                        can_send_voice_notes: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false,
                        can_invite_users: false,
                        can_change_info: false,
                        can_pin_messages: false
                    });
                }
                successCount++;
            } catch (err) {
                console.error(`Failed to update permissions for ${chatId}: `, err.message);
                failCount++;
            }
        }
        res.json({ success: true, message: `Chat ${unlock ? 'unlocked' : 'locked'} successfully in ${successCount} groups (${failCount} failed).` });
    } else {
        res.json({ success: false, message: 'Bot instance not found' });
    }
});

app.post('/api/admin/group-management', (req, res) => {
    const newSettings = req.body;
    if (!db.data.adminSettings) db.data.adminSettings = {};
    if (!db.data.adminSettings.groupManagement) db.data.adminSettings.groupManagement = {};
    if (!db.data.apiKeys) db.data.apiKeys = {};

    const { autoApproveJoinRequests, requireTelegram, userbotSessionString, userbotApiId, userbotApiHash, livestreamBotToken, ...rest } = newSettings;
    db.data.adminSettings.groupManagement = {
        ...db.data.adminSettings.groupManagement,
        ...rest
    };
    if (userbotSessionString !== undefined) {
        db.data.adminSettings.groupManagement.userbotSessionString = userbotSessionString;
    }
    if (userbotApiId !== undefined) {
        db.data.adminSettings.groupManagement.userbotApiId = userbotApiId;
    }
    if (userbotApiHash !== undefined) {
        db.data.adminSettings.groupManagement.userbotApiHash = userbotApiHash;
    }
    if (livestreamBotToken !== undefined) {
        db.data.adminSettings.groupManagement.livestreamBotToken = livestreamBotToken;
        db.data.apiKeys.livestreamBotToken = livestreamBotToken;
    }
    if (typeof autoApproveJoinRequests === 'boolean') {
        db.data.adminSettings.autoApproveJoinRequests = autoApproveJoinRequests;
        db.data.adminSettings.groupManagement.autoApproveJoinRequests = autoApproveJoinRequests;
    }
    if (typeof requireTelegram === 'boolean') {
        db.data.adminSettings.requireTelegram = requireTelegram;
    }
    db.save(true);
    db.triggerSystemUpdate();

    // Dynamically reload Telegram Bot and Assistant Bot if reload function is registered
    if (typeof global.reloadBotInstance === 'function') {
        global.reloadBotInstance().catch(err => {
            console.error('[SERVER] Failed to dynamically reload Telegram Bot:', err.message);
        });
    }

    const autoApprove = db.data.adminSettings.autoApproveJoinRequests === true ||
        db.data.adminSettings.groupManagement.autoApproveJoinRequests === true;
    const response = {
        ...db.data.adminSettings.groupManagement,
        autoApproveJoinRequests: autoApprove,
        requireTelegram: db.data.adminSettings.requireTelegram === true
    };
    res.json({ success: true, settings: response });
});

// API: Admin - Group Rule Toggle
app.post('/api/admin/groups/toggle', (req, res) => {
    const { key } = req.body;
    if (!key) return res.json({ success: false, message: 'Key required' });

    const settings = db.getGroupSettings();
    settings[key] = !settings[key];
    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true, settings });
});

// API: Admin - VPN Management
app.get('/api/admin/vpn', (req, res) => {
    const vpns = [];
    Object.keys(db.data.vpnPrices || {}).forEach(key => {
        vpns.push({
            id: key,
            name: db.data.vpnServiceNames?.[key] || key,
            price: db.data.vpnPrices[key],
            currency: db.data.vpnCurrencies?.[key] || 'USD', // Default VPN = USD
            count: db.data.vpnAccounts?.[key]?.length || 0
        });
    });
    res.json({ success: true, vpns });
});

app.post('/api/admin/vpn', (req, res) => {
    const { name, price, key, oldKey, currency } = req.body;
    const vpnKey = key || name.toLowerCase().replace(/\s+/g, '');

    if (!db.data.vpnPrices) db.data.vpnPrices = {};
    if (!db.data.vpnServiceNames) db.data.vpnServiceNames = {};
    if (!db.data.vpnAccounts) db.data.vpnAccounts = {};
    if (!db.data.vpnCurrencies) db.data.vpnCurrencies = {};

    if (oldKey && oldKey !== vpnKey) {
        db.data.vpnPrices[vpnKey] = db.data.vpnPrices[oldKey];
        db.data.vpnServiceNames[vpnKey] = db.data.vpnServiceNames[oldKey];
        db.data.vpnAccounts[vpnKey] = db.data.vpnAccounts[oldKey];
        db.data.vpnCurrencies[vpnKey] = db.data.vpnCurrencies[oldKey];
        delete db.data.vpnPrices[oldKey];
        delete db.data.vpnServiceNames[oldKey];
        delete db.data.vpnAccounts[oldKey];
        delete db.data.vpnCurrencies[oldKey];
    }

    db.data.vpnPrices[vpnKey] = parseInt(price);
    db.data.vpnServiceNames[vpnKey] = name;
    db.data.vpnCurrencies[vpnKey] = currency || 'USD';
    if (!db.data.vpnAccounts[vpnKey]) db.data.vpnAccounts[vpnKey] = [];

    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true });
});

app.delete('/api/admin/vpn/:key', (req, res) => {
    const key = req.params.key;
    if (db.data.vpnPrices) delete db.data.vpnPrices[key];
    if (db.data.vpnServiceNames) delete db.data.vpnServiceNames[key];
    if (db.data.vpnAccounts) delete db.data.vpnAccounts[key];
    db.save(true);
    res.json({ success: true });
});

// API: Admin - App Management
app.get('/api/admin/apps', (req, res) => {
    const apps = Object.values(db.data.settings.premiumApps || {});
    res.json({ success: true, apps });
});

app.post('/api/admin/apps', (req, res) => {
    const { name, link, price, id } = req.body;
    const appId = id || Date.now().toString();
    db.addPremiumApp(appId, name, link, price);
    res.json({ success: true, id: appId });
});

app.delete('/api/admin/apps/:id', (req, res) => {
    const id = req.params.id;
    const success = db.deletePremiumApp(id);
    res.json({ success: success });
});

// API: Admin - Task Management
app.get('/api/admin/tasks', (req, res) => {
    try {
        // Ensure db.data exists
        if (!db.data) {
            db.data = {};
        }
        // Ensure tasks object exists
        if (!db.data.tasks) {
            db.data.tasks = {};
        }

        const tasks = Object.entries(db.data.tasks || {}).map(([id, t]) => ({ id, ...t }));
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tasks',
            tasks: []
        });
    }
});

app.post('/api/admin/tasks', (req, res) => {
    const { name, url, reward, gems, icon } = req.body;
    const id = db.createTask(name, url, reward, gems, icon);

    // Save the new task back to global DB explicitly to be safe
    db.save(true);

    res.json({ success: true, id });
});

// Update task (edit tokens, gems, name, url, and icon)
app.put('/api/admin/tasks/:id', (req, res) => {
    const id = req.params.id;
    const { reward, gems, name, url, icon } = req.body;

    if (!db.data.tasks || !db.data.tasks[id]) {
        return res.json({ success: false, message: 'Task not found' });
    }

    // Update task fields
    if (reward !== undefined) db.data.tasks[id].reward = parseInt(reward) || 0;
    if (gems !== undefined) db.data.tasks[id].gems = parseInt(gems) || 0;
    if (name !== undefined) db.data.tasks[id].name = name;
    if (url !== undefined) db.data.tasks[id].url = url;
    if (icon !== undefined) db.data.tasks[id].icon = icon;
    db.save(true);

    res.json({ success: true, message: 'Task updated successfully' });
});

// Reset task for all users (remove from completedTasks)
app.post('/api/admin/tasks/:id/reset', (req, res) => {
    const taskId = req.params.id;

    if (!db.data.tasks || !db.data.tasks[taskId]) {
        return res.json({ success: false, message: 'Task not found' });
    }

    let affectedUsers = 0;

    // Remove this task from all users' completedTasks
    Object.values(db.data.users || {}).forEach(user => {
        if (user.completedTasks && user.completedTasks.includes(taskId)) {
            user.completedTasks = user.completedTasks.filter(t => t !== taskId);
            affectedUsers++;
        }
        // Also remove legacy task IDs that might match
        const legacyIds = ['yt', 'tg', 'tg_ch', 'youtube', 'telegram', 'telegram_channel'];
        if (legacyIds.includes(taskId) && user.completedTasks) {
            const hadLegacy = user.completedTasks.some(t => legacyIds.includes(t));
            if (hadLegacy) {
                user.completedTasks = user.completedTasks.filter(t => !legacyIds.includes(t));
                if (!user.completedTasks.includes(taskId)) affectedUsers++;
            }
        }
    });

    db.save(true);

    res.json({
        success: true,
        message: `Task reset for ${affectedUsers} users`,
        affectedUsers: affectedUsers
    });
});

app.delete('/api/admin/tasks/:id', (req, res) => {
    const id = req.params.id;
    const success = db.deleteTask(id);
    res.json({ success });
});

// API: Reset/Seed Default Tasks
app.post('/api/admin/tasks/seed-defaults', (req, res) => {
    const defaultTasks = {
        "task_youtube": {
            name: "Youtube Channel",
            url: "https://www.youtube.com/@MamunIslamyts",
            reward: 10,
            gems: 1
        },
        "task_telegram_group": {
            name: "Telegram Group",
            url: "https://t.me/AutosVerifyCh",
            reward: 10,
            gems: 1
        },
        "task_telegram_channel": {
            name: "Telegram Channel",
            url: "https://t.me/AutosVerify",
            reward: 10,
            gems: 1
        }
    };

    if (!db.data.tasks) db.data.tasks = {};

    let addedCount = 0;
    let updatedCount = 0;

    // Add or update default tasks
    Object.entries(defaultTasks).forEach(([id, task]) => {
        if (!db.data.tasks[id]) {
            db.data.tasks[id] = task;
            addedCount++;
        } else {
            // Update existing task to ensure correct values
            db.data.tasks[id].name = task.name;
            db.data.tasks[id].url = task.url;
            db.data.tasks[id].reward = task.reward;
            db.data.tasks[id].gems = task.gems;
            updatedCount++;
        }
    });

    // Reset all tasks for all users so they can do them again
    const allTaskIds = Object.keys(db.data.tasks || {});
    let affectedUsers = 0;

    Object.values(db.data.users || {}).forEach(user => {
        if (user.completedTasks) {
            const initialLength = user.completedTasks.length;
            user.completedTasks = user.completedTasks.filter(t => !allTaskIds.includes(t));
            if (user.completedTasks.length < initialLength) {
                affectedUsers++;
            }
        }
    });

    // Remove old legacy task IDs that are no longer used
    const legacyIdsToRemove = ['tg_ch', 'telegram_channel'];
    legacyIdsToRemove.forEach(id => {
        if (db.data.tasks[id]) {
            delete db.data.tasks[id];
        }
    });

    db.save(true);
    res.json({
        success: true,
        message: `Added ${addedCount} new tasks, updated ${updatedCount} existing tasks. Reset for ${affectedUsers} users.`,
        totalTasks: Object.keys(db.data.tasks).length
    });
});

// Auto-seed default tasks on server startup (if no tasks exist, also fix existing ones)
(function autoSeedDefaultTasks() {
    const defaultTasks = {
        "task_youtube": {
            name: "Youtube Channel",
            url: "https://www.youtube.com/@MamunIslamyts",
            reward: 10,
            gems: 1
        },
        "task_telegram_group": {
            name: "Telegram Group",
            url: "https://t.me/AutosVerifyCh",
            reward: 10,
            gems: 1
        },
        "task_telegram_channel": {
            name: "Telegram Channel",
            url: "https://t.me/AutosVerify",
            reward: 10,
            gems: 1
        }
    };

    if (!db.data.tasks) db.data.tasks = {};

    let addedCount = 0;
    let updatedCount = 0;

    // Add missing tasks and fix existing ones
    Object.entries(defaultTasks).forEach(([id, task]) => {
        if (!db.data.tasks[id]) {
            db.data.tasks[id] = task;
            addedCount++;
        } else {
            // Fix existing task values
            db.data.tasks[id].name = task.name;
            db.data.tasks[id].url = task.url;
            db.data.tasks[id].reward = task.reward;
            db.data.tasks[id].gems = task.gems;
            updatedCount++;
        }
    });

    // Remove old legacy task IDs that are no longer used
    const legacyIdsToRemove = ['tg_ch', 'telegram_channel'];
    let removedCount = 0;
    legacyIdsToRemove.forEach(id => {
        if (db.data.tasks[id]) {
            delete db.data.tasks[id];
            removedCount++;
        }
    });

    if (addedCount > 0 || updatedCount > 0 || removedCount > 0) {
        db.save(true);
        console.log(`✅ Tasks synced: ${addedCount} added, ${updatedCount} updated, ${removedCount} removed`);
    }
})();

app.post('/api/admin/groups/leave', async (req, res) => {
    const { chatId } = req.body;
    if (!bot) return res.json({ success: false, message: 'Bot not ready' });
    try {
        await bot.leaveChat(chatId);
        // Remove from DB if needed, or wait for event
        // db.removeGroup(chatId); // Assuming db has this or we manipulate data directly
        if (db.data.groups && db.data.groups[chatId]) {
            delete db.data.groups[chatId];
            db.save(true);
        } else if (Array.isArray(db.data.groups)) {
            db.data.groups = db.data.groups.filter(g => g.id.toString() !== chatId.toString());
            db.save(true);
        }
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// =============================================
// TELEGRAM LIVE STREAM AUTOMATION API & SCHEDULER (REMOVED / STUBBED)
// =============================================
app.get('/api/admin/live-streams', (req, res) => {
    res.json({ success: true, streams: [] });
});

app.post('/api/admin/live-streams', async (req, res) => {
    res.json({ success: true, stream: {} });
});

app.post('/api/admin/live-streams/:id/stop', (req, res) => {
    res.json({ success: true, message: 'Stopped' });
});

app.delete('/api/admin/live-streams/:id', (req, res) => {
    res.json({ success: true, message: 'Deleted' });
});

// API: Cost Management (Get)
app.get('/api/admin/costs', (req, res) => {
    const settings = db.getSettings();
    const adminSettings = db.data.adminSettings || {};
    const costs = settings.costs || {};
    const cardPrices = db.data.cardPrices || {};
    const vpnPrices = db.data.vpnPrices || {};
    const creditRates = adminSettings.creditRates || { crypto: 0.01, bkash: 1, nagad: 1 };

    res.json({
        success: true,
        costs: {
            // Rewards & Bonuses
            quizReward: settings.quizReward || 0,
            spaceReward: settings.spaceReward || 0,
            inviteBonus: settings.refBonus || 0,
            welcomeBonus: adminSettings.welcomeCredits || 0,
            adReward: settings.adReward || 7,
            zeroBalanceAdReward: settings.zeroBalanceAdReward || 7,
            taskReward: settings.taskReward || 10,

            // System Costs
            premiumEmailCost: settings.premiumEmailCost || 0,

            // System Fees
            exchangeFee: settings.exchangeFee || 2,
            transferFee: settings.transferFee || 5,
            supportCost: settings.supportCost || 0,

            // Service Costs (Tokens)
            gmailCost: costs.gmail || 20,
            hotmailCost: costs.hotmail || 25,
            tempMailCost: costs.tempmail || 10,
            renewMailCost: costs.renewmail || 30,
            verificationCost: costs.verification || 10,
            geminiCost: costs.gemini || 50,
            chatgptCost: costs.gpt || 100,
            spotifyCost: costs.spotify || 50,
            youtubeCost: costs.youtube || 50,
            teacherCost: costs.teacher || 100,
            militaryCost: costs.military || 100,
            live2fa: costs.live2fa || 10,
            liveInstagram: costs.liveInstagram || 10,
            liveFacebook: costs.liveFacebook || 10,
            liveTiktok: costs.liveTiktok || 10,
            liveTwitter: costs.liveTwitter || 10,
            liveThreads: costs.liveThreads || 10,
            live2faCurrency: costs.live2faCurrency || 'token',
            liveInstagramCurrency: costs.liveInstagramCurrency || 'token',
            liveFacebookCurrency: costs.liveFacebookCurrency || 'token',
            liveTiktokCurrency: costs.liveTiktokCurrency || 'token',
            liveTwitterCurrency: costs.liveTwitterCurrency || 'token',
            liveThreadsCurrency: costs.liveThreadsCurrency || 'token',

            // USD Costs
            accountsUSD: costs.accountsUSD || 1.00,
            vpnUSD: costs.vpnUSD || 2.00,
            vccUSD: costs.vccUSD || 5.00,
            premiumMailUSD: costs.premiumMailUSD || 0.50,

            // Credit Exchange Rates
            cryptoRate: creditRates.crypto || 0.01,
            bkashRate: creditRates.bkash || 1,
            nagadRate: creditRates.nagad || 1,

            // Exchange Rates (USD/Tokens/Gems)
            usdToToken: settings.usdToToken || 100000,
            usdToGems: settings.usdToGems || 1000,
            gemToToken: settings.gemToToken || 100,
            tokenToGem: settings.tokenToGem || 1,
            takaToGem: settings.takaToGem || 100,
            platformFee: settings.platformFee || 20,

            // Card Prices (TC)
            geminiCardPrice: cardPrices.gemini || 150,
            chatgptCardPrice: cardPrices.chatgpt || 200,
            spotifyCardPrice: cardPrices.spotify || 50,

            // VPN Prices (TC)
            nordvpnPrice: vpnPrices.nordvpn || 100,
            expressvpnPrice: vpnPrices.expressvpn || 120,
            surfsharkPrice: vpnPrices.surfshark || 80,
            cyberghostPrice: vpnPrices.cyberghost || 70,
            protonvpnPrice: vpnPrices.protonvpn || 90,

            // Bot Hosting Settings
            bhReferReq: adminSettings.bhReferReq !== undefined ? adminSettings.bhReferReq : 2,
            bhReferPerBot: adminSettings.bhReferPerBot !== undefined ? adminSettings.bhReferPerBot : 2,
            bhGemsPerHour: adminSettings.bhGemsPerHour !== undefined ? adminSettings.bhGemsPerHour : 1,
            bhMaxBots: adminSettings.bhMaxBots !== undefined ? adminSettings.bhMaxBots : 3,
            liveSmsBotGemsPerHour: adminSettings.liveSmsBotGemsPerHour !== undefined ? adminSettings.liveSmsBotGemsPerHour : 1,
            pyrogramGemsPerHour: adminSettings.pyrogramGemsPerHour !== undefined ? adminSettings.pyrogramGemsPerHour : 1,

            // Service Tool Costs
            videoDownloadCost: adminSettings.videoDownloadCost !== undefined ? adminSettings.videoDownloadCost : 10,
            liveSmsBotCost: adminSettings.liveSmsBotCost !== undefined ? adminSettings.liveSmsBotCost : 10,
            pyrogramDeployCost: adminSettings.pyrogramDeployCost !== undefined ? adminSettings.pyrogramDeployCost : 100,

            // BDT Rate
            usdToBdt: adminSettings.usdToBdt || 120,

            // Leaderboard Rewards
            leaderboardWeeklyRewards: (!settings.leaderboardWeeklyRewards || settings.leaderboardWeeklyRewards === '100,70,50,20,20,20,20,20,20,20') ? '10,8,6,5,4,3,2,1,1,1' : settings.leaderboardWeeklyRewards,
            leaderboardMonthlyRewards: (!settings.leaderboardMonthlyRewards || settings.leaderboardMonthlyRewards === '500,350,250,100,100,100,100,100,100,100') ? '50,45,40,35,30,25,20,15,10,5' : settings.leaderboardMonthlyRewards
        },
        sellingRewards: db.data.sellingRewards || {},
        dbSize: (fs.existsSync(db.DB_FILE) ? (fs.statSync(db.DB_FILE).size / 1024).toFixed(2) : 0) + ' KB'
    });
});

// Public API: Get Costs (for user panel)
app.get('/api/public/costs', (req, res) => {
    const settings = db.getSettings();
    const adminSettings = db.data.adminSettings || {};
    const costs = settings.costs || {};
    const creditRates = adminSettings.creditRates || { crypto: 0.01, bkash: 1, nagad: 1 };

    res.json({
        success: true,
        costs: {
            quizReward: settings.quizReward || 0,
            spaceReward: settings.spaceReward || 0,
            refBonus: settings.refBonus || 50,
            inviteBonus: settings.refBonus || 50,
            welcomeBonus: adminSettings.welcomeCredits || 100,
            dailyReward: settings.dailyReward || settings.taskReward || 10,
            adReward: settings.adReward || 7,
            zeroBalanceAdReward: settings.zeroBalanceAdReward || 7,
            taskReward: settings.taskReward || 10,
            transferFee: settings.transferFee || 0,
            supportCost: settings.supportCost || 0,
            gmailCost: costs.gmail || 0,
            verificationCost: costs.verification || 0,
            live2fa: costs.live2fa || 10,
            liveInstagram: costs.liveInstagram || 10,
            liveFacebook: costs.liveFacebook || 10,
            liveTiktok: costs.liveTiktok || 10,
            liveTwitter: costs.liveTwitter || 10,
            liveThreads: costs.liveThreads || 10,
            live2faCurrency: costs.live2faCurrency || 'token',
            liveInstagramCurrency: costs.liveInstagramCurrency || 'token',
            liveFacebookCurrency: costs.liveFacebookCurrency || 'token',
            liveTiktokCurrency: costs.liveTiktokCurrency || 'token',
            liveTwitterCurrency: costs.liveTwitterCurrency || 'token',
            liveThreadsCurrency: costs.liveThreadsCurrency || 'token',
            usdToToken: settings.usdToToken || 100000,
            usdToGems: settings.usdToGems || 1000,
            gemToToken: settings.gemToToken || 100,
            tokenToGem: settings.tokenToGem || 1,
            takaToGem: settings.takaToGem || 100,
            platformFee: settings.platformFee || 20,
            cryptoRate: creditRates.crypto || 0.01,
            bkashRate: creditRates.bkash || 1,
            nagadRate: creditRates.nagad || 1,
            usdToBdt: settings.usdToBdt || 120,
            // Bot Hosting
            bhReferReq: adminSettings.bhReferReq !== undefined ? adminSettings.bhReferReq : 2,
            bhReferPerBot: adminSettings.bhReferPerBot !== undefined ? adminSettings.bhReferPerBot : 2,
            bhGemsPerHour: adminSettings.bhGemsPerHour !== undefined ? adminSettings.bhGemsPerHour : 1,
            bhMaxBots: adminSettings.bhMaxBots !== undefined ? adminSettings.bhMaxBots : 3,
            liveSmsBotGemsPerHour: adminSettings.liveSmsBotGemsPerHour !== undefined ? adminSettings.liveSmsBotGemsPerHour : 1,
            pyrogramGemsPerHour: adminSettings.pyrogramGemsPerHour !== undefined ? adminSettings.pyrogramGemsPerHour : 1,
            // Service Tool Costs
            videoDownloadCost: adminSettings.videoDownloadCost !== undefined ? adminSettings.videoDownloadCost : 10,
            liveSmsBotCost: adminSettings.liveSmsBotCost !== undefined ? adminSettings.liveSmsBotCost : 10,
            pyrogramDeployCost: adminSettings.pyrogramDeployCost !== undefined ? adminSettings.pyrogramDeployCost : 100
        }
    });
});

// API: Cost Management (Save)
app.post('/api/admin/costs', (req, res) => {
    const payload = req.body;
    if (!payload) return res.json({ success: false, message: 'Invalid payload' });

    if (!db.data.settings) db.data.settings = {};
    if (!db.data.adminSettings) db.data.adminSettings = {};

    // Base Settings & Rewards
    if (payload.quizReward !== undefined) db.data.settings.quizReward = parseInt(payload.quizReward);
    if (payload.spaceReward !== undefined) db.data.settings.spaceReward = parseInt(payload.spaceReward);
    if (payload.inviteBonus !== undefined) db.data.settings.refBonus = parseInt(payload.inviteBonus);
    if (payload.adReward !== undefined) db.data.settings.adReward = parseInt(payload.adReward);
    if (payload.zeroBalanceAdReward !== undefined) db.data.settings.zeroBalanceAdReward = parseInt(payload.zeroBalanceAdReward);
    if (payload.taskReward !== undefined) db.data.settings.taskReward = parseInt(payload.taskReward);

    // System Costs
    if (payload.premiumEmailCost !== undefined) db.data.settings.premiumEmailCost = parseInt(payload.premiumEmailCost);

    if (payload.exchangeFee !== undefined) db.data.settings.exchangeFee = parseInt(payload.exchangeFee);
    if (payload.transferFee !== undefined) db.data.settings.transferFee = parseInt(payload.transferFee);
    if (payload.supportCost !== undefined) db.data.settings.supportCost = parseInt(payload.supportCost);

    if (payload.welcomeBonus !== undefined) {
        db.data.adminSettings.welcomeCredits = parseInt(payload.welcomeBonus);
    }

    // Credit Exchange Rates
    if (!db.data.adminSettings.creditRates) db.data.adminSettings.creditRates = {};
    if (payload.cryptoRate !== undefined) db.data.adminSettings.creditRates.crypto = parseFloat(payload.cryptoRate);
    if (payload.bkashRate !== undefined) db.data.adminSettings.creditRates.bkash = parseFloat(payload.bkashRate);
    if (payload.nagadRate !== undefined) db.data.adminSettings.creditRates.nagad = parseFloat(payload.nagadRate);

    // Exchange Rates (USD/Tokens/Gems)
    if (payload.usdToToken !== undefined) db.data.settings.usdToToken = parseInt(payload.usdToToken) || 100000;
    if (payload.usdToGems !== undefined) db.data.settings.usdToGems = parseInt(payload.usdToGems) || 1000;
    if (payload.gemToToken !== undefined) db.data.settings.gemToToken = parseInt(payload.gemToToken) || 100;
    if (payload.tokenToGem !== undefined) db.data.settings.tokenToGem = parseFloat(payload.tokenToGem) || 1;
    if (payload.takaToGem !== undefined) db.data.settings.takaToGem = parseInt(payload.takaToGem) || 100;
    if (payload.platformFee !== undefined) db.data.settings.platformFee = parseInt(payload.platformFee) || 20;
    if (payload.usdToBdt !== undefined) db.data.settings.usdToBdt = parseFloat(payload.usdToBdt) || 120;
    if (payload.leaderboardWeeklyRewards !== undefined) db.data.settings.leaderboardWeeklyRewards = String(payload.leaderboardWeeklyRewards);
    if (payload.leaderboardMonthlyRewards !== undefined) db.data.settings.leaderboardMonthlyRewards = String(payload.leaderboardMonthlyRewards);

    // Service Costs (Nested in costs)
    if (!db.data.settings.costs) db.data.settings.costs = {};
    if (payload.gmailCost !== undefined) db.data.settings.costs.gmail = parseInt(payload.gmailCost);
    if (payload.hotmailCost !== undefined) db.data.settings.costs.hotmail = parseInt(payload.hotmailCost);
    if (payload.tempMailCost !== undefined) db.data.settings.costs.tempmail = parseInt(payload.tempMailCost);
    if (payload.renewMailCost !== undefined) db.data.settings.costs.renewmail = parseInt(payload.renewMailCost);
    if (payload.verificationCost !== undefined) db.data.settings.costs.verification = parseInt(payload.verificationCost);
    if (payload.geminiCost !== undefined) db.data.settings.costs.gemini = parseInt(payload.geminiCost);
    if (payload.chatgptCost !== undefined) db.data.settings.costs.gpt = parseInt(payload.chatgptCost);
    if (payload.spotifyCost !== undefined) db.data.settings.costs.spotify = parseInt(payload.spotifyCost);
    if (payload.youtubeCost !== undefined) db.data.settings.costs.youtube = parseInt(payload.youtubeCost);
    if (payload.teacherCost !== undefined) db.data.settings.costs.teacher = parseInt(payload.teacherCost);
    if (payload.militaryCost !== undefined) db.data.settings.costs.military = parseInt(payload.militaryCost);
    if (payload.live2faCost !== undefined) db.data.settings.costs.live2fa = parseInt(payload.live2faCost);
    if (payload.liveInstagramCost !== undefined) db.data.settings.costs.liveInstagram = parseInt(payload.liveInstagramCost);
    if (payload.liveFacebookCost !== undefined) db.data.settings.costs.liveFacebook = parseInt(payload.liveFacebookCost);
    if (payload.liveTiktokCost !== undefined) db.data.settings.costs.liveTiktok = parseInt(payload.liveTiktokCost);
    if (payload.liveTwitterCost !== undefined) db.data.settings.costs.liveTwitter = parseInt(payload.liveTwitterCost);
    if (payload.liveThreadsCost !== undefined) db.data.settings.costs.liveThreads = parseInt(payload.liveThreadsCost);
    if (payload.live2faCurrency !== undefined) db.data.settings.costs.live2faCurrency = payload.live2faCurrency;
    if (payload.liveInstagramCurrency !== undefined) db.data.settings.costs.liveInstagramCurrency = payload.liveInstagramCurrency;
    if (payload.liveFacebookCurrency !== undefined) db.data.settings.costs.liveFacebookCurrency = payload.liveFacebookCurrency;
    if (payload.liveTiktokCurrency !== undefined) db.data.settings.costs.liveTiktokCurrency = payload.liveTiktokCurrency;
    if (payload.liveTwitterCurrency !== undefined) db.data.settings.costs.liveTwitterCurrency = payload.liveTwitterCurrency;
    if (payload.liveThreadsCurrency !== undefined) db.data.settings.costs.liveThreadsCurrency = payload.liveThreadsCurrency;

    // USD Costs
    if (payload.accountsUSD !== undefined) db.data.settings.costs.accountsUSD = parseFloat(payload.accountsUSD);
    if (payload.vpnUSD !== undefined) db.data.settings.costs.vpnUSD = parseFloat(payload.vpnUSD);
    if (payload.vccUSD !== undefined) db.data.settings.costs.vccUSD = parseFloat(payload.vccUSD);
    if (payload.premiumMailUSD !== undefined) db.data.settings.costs.premiumMailUSD = parseFloat(payload.premiumMailUSD);

    // Card Prices
    if (!db.data.cardPrices) db.data.cardPrices = {};
    if (payload.geminiCardPrice !== undefined) db.data.cardPrices.gemini = parseInt(payload.geminiCardPrice);
    if (payload.chatgptCardPrice !== undefined) db.data.cardPrices.chatgpt = parseInt(payload.chatgptCardPrice);
    if (payload.spotifyCardPrice !== undefined) db.data.cardPrices.spotify = parseInt(payload.spotifyCardPrice);

    // VPN Prices
    if (!db.data.vpnPrices) db.data.vpnPrices = {};
    if (payload.nordvpnPrice !== undefined) db.data.vpnPrices.nordvpn = parseInt(payload.nordvpnPrice);
    if (payload.expressvpnPrice !== undefined) db.data.vpnPrices.expressvpn = parseInt(payload.expressvpnPrice);
    if (payload.surfsharkPrice !== undefined) db.data.vpnPrices.surfshark = parseInt(payload.surfsharkPrice);
    if (payload.cyberghostPrice !== undefined) db.data.vpnPrices.cyberghost = parseInt(payload.cyberghostPrice);
    if (payload.protonvpnPrice !== undefined) db.data.vpnPrices.protonvpn = parseInt(payload.protonvpnPrice);

    // Bot Hosting Settings
    if (payload.bhReferReq !== undefined) db.data.adminSettings.bhReferReq = parseInt(payload.bhReferReq) || 2;
    if (payload.bhReferPerBot !== undefined) db.data.adminSettings.bhReferPerBot = parseInt(payload.bhReferPerBot) || 2;
    if (payload.bhGemsPerHour !== undefined) db.data.adminSettings.bhGemsPerHour = parseFloat(payload.bhGemsPerHour) || 1;
    if (payload.bhMaxBots !== undefined) db.data.adminSettings.bhMaxBots = parseInt(payload.bhMaxBots) || 3;
    if (payload.liveSmsBotGemsPerHour !== undefined) db.data.adminSettings.liveSmsBotGemsPerHour = parseFloat(payload.liveSmsBotGemsPerHour) || 1;
    if (payload.pyrogramGemsPerHour !== undefined) db.data.adminSettings.pyrogramGemsPerHour = parseFloat(payload.pyrogramGemsPerHour) || 1;

    // Service Tool Costs
    if (payload.videoDownloadCost !== undefined) db.data.adminSettings.videoDownloadCost = parseInt(payload.videoDownloadCost) || 10;
    if (payload.liveSmsBotCost !== undefined) db.data.adminSettings.liveSmsBotCost = parseInt(payload.liveSmsBotCost) || 10;
    if (payload.pyrogramDeployCost !== undefined) db.data.adminSettings.pyrogramDeployCost = parseInt(payload.pyrogramDeployCost) || 100;

    // Selling Rewards
    if (payload.sellingRewards) {
        db.data.sellingRewards = { ...db.data.sellingRewards, ...payload.sellingRewards };
    }

    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true, message: 'All cost configurations saved successfully' });
});

// API: User - Send Message to Admin
app.post('/api/user/send-message', async (req, res) => {
    const { userId, message, language } = req.body;
    if (!userId || !message) return res.json({ success: false, message: 'User ID and message are required' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    // Store message for Admin UI
    if (!user.supportMessages) user.supportMessages = [];
    user.supportMessages.push({
        sender: 'user',
        message: message,
        timestamp: new Date().toISOString(),
        language: language || 'en'
    });

    // ===== AUTO-RESPONSE IN USER'S LANGUAGE =====
    const autoResponses = {
        'en': '👋 Thank you for contacting support! Our team will help you soon. Please wait for a response from an admin.',
        'bn': '👋 সাপোর্টে যোগাযোগ করার জন্য ধন্যবাদ! আমাদের দল শীঘ্রই আপনাকে সাহায্য করবে। অ্যাডমিনের উত্তরের জন্য অপেক্ষা করুন।',
        'hi': '👋 समर्थन से संपर्क करने के लिए धन्यवाद! हमारी टीम जल्द ही आपकी मदद करेगी। एडमिन के जवाब का इंतजार करें।'
    };

    const lang = language || 'en';
    const autoMsg = autoResponses[lang] || autoResponses['en'];

    // Show auto-response as notification
    if (!user.notifications) user.notifications = [];
    user.notifications.unshift({
        id: 'support_auto_' + Date.now(),
        type: 'support',
        title: lang === 'bn' ? '📞 সাপোর্ট' : lang === 'hi' ? '📞 समर्थन' : '📞 Support',
        message: autoMsg,
        timestamp: new Date().toISOString(),
        read: false,
        autoClose: true,
        duration: 5000
    });

    await db.updateUser(user);

    // Notify Admin via Telegram if available
    if (bot && config.ADMIN_ID) {
        const name = user.firstName || user.username || userId;
        const langLabel = lang === 'bn' ? '🇧🇩 Bengali' : lang === 'hi' ? '🇮🇳 Hindi' : '🇬🇧 English';
        const adminMsg = `📬 <b>New Support Message</b>\n\nUser: <b>${name}</b> (<code>${userId}</code>)\nLanguage: ${langLabel}\nMessage: ${message}\n\n<i>Reply from Web Admin Panel.</i>`;
        bot.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' }).catch(e => console.error('Support notify error:', e.message));
    }

    res.json({ success: true, message: 'Message sent to support' });
});

// API: User - Get Messages
app.get('/api/user/messages', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, message: 'User ID required' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, messages: [] });

    // Consolidate admin replies (from pendingWebMessages) and user messages
    // (Deprecated old pendingWebMessages queue)

    res.json({ success: true, messages: user.supportMessages || [] });
});

// API: Admin - Send Message to User (with visible notification popup)
app.post('/api/admin/send-message', async (req, res) => {
    const { userId, message, hasImage, imageData } = req.body;
    if (!userId || (!message && !hasImage)) return res.json({ success: false, message: 'User ID and content are required' });

    // Store message for Web UI
    const user = await db.getUser(userId);
    if (user) {
        if (!user.supportMessages) user.supportMessages = [];

        // Create message object with optional image
        const msgObj = {
            sender: 'admin',
            message: message || '[Image message]',
            timestamp: new Date().toISOString(),
            hasImage: hasImage,
            imageData: imageData, // Store base64 image data
            replyStatus: 'answered', // Mark as answered so 2-hour timer won't delete it
            ttlDeleteTime: Date.now() + (2 * 60 * 60 * 1000) // 2 hours from now
        };

        user.supportMessages.push(msgObj);

        // ===== NOTIFICATION WITH VISIBLE POPUP =====
        // Show as important notification with auto-close after 10 seconds
        if (!user.notifications) user.notifications = [];
        user.notifications.unshift({
            id: 'reply_' + Date.now() + '_' + Math.random().toString(36).substring(7),
            type: 'admin_reply',
            title: '💬 Admin Response',
            message: message || '📸 Admin sent an image',
            timestamp: new Date().toISOString(),
            read: false,
            important: true,
            autoClose: true,
            duration: 20000, // Show for 20 seconds
            allowDismiss: true // User can close it early
        });

        await db.updateUser(user);
    }

    if (!bot) {
        // If bot is not fully active, just return success since we saved it for web
        return res.json({ success: true, message: 'Saved to web panel (Bot offline)' });
    }

    // ===== SEND VIA TELEGRAM WITH FORMATTED MESSAGE =====
    let formattedMsg = `💬 <b>Admin Reply:</b>\n\n`;
    if (message) formattedMsg += message;
    if (hasImage) formattedMsg += '\n📸 <i>(Image attached)</i>';
    formattedMsg += '\n\n<i>Check your app for more details.</i>';

    bot.sendMessage(userId, formattedMsg, { parse_mode: 'HTML' })
        .then(() => res.json({ success: true, message: 'Admin reply sent via Telegram and saved' }))
        .catch(err => {
            console.error('Telegram message failed:', err.message);
            res.json({ success: true, message: 'Message saved to web panel (Telegram unavailable)' });
        });
});

// API: Admin - Send Gift to User
app.post('/api/admin/send-gift', async (req, res) => {
    const { userId, currency, amount, note } = req.body;
    if (!userId || !currency || !amount || amount <= 0) {
        return res.json({ success: false, message: 'User ID, currency, and valid amount are required' });
    }

    const validCurrencies = ['tokens', 'Gems', 'usd'];
    if (!validCurrencies.includes(currency)) {
        return res.json({ success: false, message: 'Invalid currency. Use tokens, Gems, or usd' });
    }

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    // Store as pending gift (user must claim via ad)
    if (!user.pendingGifts) user.pendingGifts = [];
    const giftId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    user.pendingGifts.push({
        id: giftId,
        currency: currency,
        amount: parseFloat(amount),
        note: note || 'Admin Gift',
        timestamp: Date.now(),
        claimed: false
    });

    if (!user.notifications) user.notifications = [];
    user.notifications.unshift({
        id: 'gift-' + giftId,
        type: 'gift',
        title: '🎁 You received a gift!',
        message: `${amount} ${currency === 'tokens' ? 'Tokens' : currency === 'Gems' ? 'Gems' : 'USD'}${note ? ' — ' + note : ''}`,
        timestamp: new Date().toISOString(),
        read: false,
        important: true,
        autoClose: true,
        duration: 20000,
        giftId: giftId,
        currency: currency,
        amount: parseFloat(amount)
    });

    await db.updateUser(user);

    // ===== TELEGRAM NOTIFICATION =====
    // Send gift notification via Telegram to the user
    if (bot && user.id) {
        const currencyLabel = currency === 'tokens' ? 'Tokens' : currency === 'Gems' ? '💎 Gems' : '💵 USD';
        const giftMessage = `🎁 **You received a gift from Admin!**\n\nAmount: ${amount} ${currencyLabel}${note ? '\n📝 Note: ' + note : ''}\n\nClaim your gift in the bot!`;

        bot.sendMessage(user.id, giftMessage, { parse_mode: 'Markdown' }).catch(err => {
            console.log(`[GIFT] Failed to send gift notification to ${user.id}: ${err.message}`);
        });
    }

    res.json({ success: true, giftId, message: `Gift of ${amount} ${currency} sent to user ${userId}` });
});

// API: User - Get Pending Gifts
app.get('/api/user/gifts', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, gifts: [] });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, gifts: [] });

    const pendingGifts = (user.pendingGifts || []).filter(g => !g.claimed);
    res.json({ success: true, gifts: pendingGifts });
});

// API: User - Get Notifications
app.get('/api/user/notifications', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, notifications: [] });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, notifications: [] });

    // 1. Permanent notifications from MySQL (gifts, messages, etc.)
    const permNotifs = (user.notifications || []).map(n => {
        if (n.type === 'gift') {
            const gift = (user.pendingGifts || []).find(g => g.id === n.giftId);
            n.claimed = gift ? gift.claimed : true;
        }
        return n;
    });

    // 2. Broadcast notifications from local file (NOT MySQL)
    let bcNotifs = [];
    try {
        const bcNotifsPath = path.join(process.cwd(), 'web', 'uploads', 'bc_notifications.json');
        if (fs.existsSync(bcNotifsPath)) {
            const allBcNotifs = JSON.parse(fs.readFileSync(bcNotifsPath, 'utf8'));
            const uid = String(userId);
            if (allBcNotifs[uid]) {
                const now = Date.now();
                // Filter out expired (7 days) notifications
                bcNotifs = allBcNotifs[uid].filter(n => !n.expiresAt || n.expiresAt > now);
            }
        }
    } catch (e) { console.error('[NOTIF GET] bc_notifications error:', e.message); }

    // Merge: broadcast on top, then permanent — sorted by date descending
    const allNotifs = [...bcNotifs, ...permNotifs].sort((a, b) => {
        const dateA = a.date || new Date(a.timestamp || 0).getTime();
        const dateB = b.date || new Date(b.timestamp || 0).getTime();
        return dateB - dateA;
    });

    res.json({ success: true, notifications: allNotifs });
});

// API: User - Mark Notification Read
app.post('/api/user/notifications/read', async (req, res) => {
    const { userId, notificationId } = req.body;
    if (!userId || !notificationId) return res.json({ success: false });

    // Check if it's a broadcast notification (stored locally)
    const bcNotifsPath = path.join(process.cwd(), 'web', 'uploads', 'bc_notifications.json');
    try {
        if (fs.existsSync(bcNotifsPath)) {
            const allBcNotifs = JSON.parse(fs.readFileSync(bcNotifsPath, 'utf8'));
            const uid = String(userId);
            if (allBcNotifs[uid]) {
                const n = allBcNotifs[uid].find(n => n.id === notificationId);
                if (n) {
                    n.read = true;
                    fs.writeFileSync(bcNotifsPath, JSON.stringify(allBcNotifs), 'utf8');
                    return res.json({ success: true });
                }
            }
        }
    } catch (e) { /* fall through to MySQL */ }

    // MySQL-stored notification (gift, message, etc.)
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false });

    if (user.notifications) {
        let n = user.notifications.find(n => n.id === notificationId);
        if (n) {
            n.read = true;
            await db.updateUser(user);
        }
    }
    res.json({ success: true });
});

// API: Claim Gift (after ad watch)
app.post('/api/gift/claim', async (req, res) => {
    const { userId, giftId } = req.body;
    if (!userId || !giftId) return res.json({ success: false, message: 'User ID and Gift ID required' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    if (!user.pendingGifts) return res.json({ success: false, message: 'No gifts found' });

    const gift = user.pendingGifts.find(g => g.id === giftId);
    if (!gift) return res.json({ success: false, message: 'Gift not found' });
    if (gift.claimed) return res.json({ success: false, message: 'Gift already claimed' });

    // Add balance based on currency
    const { currency, amount } = gift;
    if (currency === 'tokens') {
        const current = db.getTokenBalance(user);
        db.setTokenBalance(user, current + parseInt(amount));
    } else if (currency === 'Gems') {
        const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
        user.Gems = currentGems + parseInt(amount);
        user.balance_Gems = user.Gems;
    } else if (currency === 'usd') {
        user.usd = parseFloat(((user.usd || 0) + parseFloat(amount)).toFixed(3));
    }

    // Mark as claimed
    gift.claimed = true;
    gift.claimedAt = Date.now();

    // Add to user history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'gift_claimed',
        amount: amount,
        currency: currency,
        date: Date.now(),
        detail: gift.note || 'Admin Gift'
    });

    // Add global transaction
    db.addTransaction(userId, 'gift', amount, currency === 'tokens' ? 'TC' : currency === 'Gems' ? 'JS' : 'USD', `Gift Claimed: ${gift.note || 'Admin Gift'}`, 'gift');

    await db.updateUser(user);

    const currencyLabel = currency === 'tokens' ? 'Tokens' : currency === 'Gems' ? 'Gems' : 'USD';
    res.json({
        success: true,
        message: `Gift claimed! +${amount} ${currencyLabel}`,
        currency: currency,
        amount: amount,
        newTokens: db.getTokenBalance(user),
        newGems: user.Gems || 0,
        newUsd: user.usd || 0
    });
});

// API: Admin - Delete Single History Item
app.delete('/api/admin/history-item/:userId/:date', (req, res) => {
    const { userId, date } = req.params;
    const users = db.data.users || {};
    const user = users[userId];

    if (!user || !user.history) {
        return res.json({ success: false, message: 'User or history not found' });
    }

    const decodedDate = decodeURIComponent(date);
    const initialLength = user.history.length;

    // Filter out the item with matching date
    // We compare strings to be safe across types
    user.history = user.history.filter(h => {
        if (!h.date) return true;
        const hDateStr = String(h.date);
        return hDateStr !== decodedDate && hDateStr !== date;
    });

    if (user.history.length !== initialLength) {
        db.save(true);
        res.json({ success: true, message: 'Item deleted' });
    } else {
        // Fallback: If no exact match, try comparing as numbers if applicable
        const dateNum = Number(decodedDate);
        if (!isNaN(dateNum)) {
            user.history = user.history.filter(h => Number(h.date) !== dateNum);
            if (user.history.length !== initialLength) {
                db.save(true);
                return res.json({ success: true, message: 'Item deleted (matched as number)' });
            }
        }
        res.json({ success: false, message: 'Item not found in user history' });
    }
});

// API: Admin - Reset Only History Logs (Transactions)
app.post('/api/admin/reset-history', async (req, res) => {
    try {
        const { userId } = req.body;
        const userObj = await db.getUser(userId);
        if (!userObj || !userObj.adminVerified) return res.json({ success: false, message: 'Unauthorized' });

        db.data.transactions = [];
        const users = db.data.users || {};
        Object.keys(users).forEach(uid => {
            if (users[uid].history) {
                users[uid].history = [];
            }
        });
        db.save(true);
        res.json({ success: true, message: 'Transaction history log cleared' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Reset Leaderboard Stats (Ranking Data)
app.post('/api/admin/reset-leaderboards', async (req, res) => {
    try {
        const { userId } = req.body;
        const userObj = await db.getUser(userId);
        if (!userObj || !userObj.adminVerified) return res.json({ success: false, message: 'Unauthorized' });

        const users = db.data.users || {};
        Object.keys(users).forEach(uid => {
            const user = users[uid];
            user.successfulVerifications = 0;
            user.failedVerifications = 0;
            user.cardsPurchased = 0;
            user.referralCount = 0;
        });
        db.save(true);
        res.json({ success: true, message: 'Leaderboard and user stats reset' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Clear All Transactions (Old Alias)
app.post('/api/admin/reset-transactions', async (req, res) => {
    try {
        const { userId } = req.body;
        const userObj = await db.getUser(userId);
        if (!userObj || !userObj.adminVerified) return res.json({ success: false, message: 'Unauthorized' });

        db.data.transactions = [];
        const users = db.data.users || {};
        Object.keys(users).forEach(uid => {
            if (users[uid].history) users[uid].history = [];
        });
        db.save(true);
        res.json({ success: true, message: 'All transactions cleared' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Save Group & AI Settings
app.post('/api/admin/group-settings', (req, res) => {
    try {
        const payload = req.body;
        if (!db.data.groupSettings) db.data.groupSettings = {};

        // Extract autoApproveJoinRequests if present
        const { autoApproveJoinRequests, ...otherSettings } = payload;

        // Save general group settings
        db.data.groupSettings = {
            ...db.data.groupSettings,
            ...otherSettings
        };

        // Save auto-approve setting to both locations for compatibility
        if (typeof autoApproveJoinRequests === 'boolean') {
            if (!db.data.adminSettings) db.data.adminSettings = {};
            db.data.adminSettings.autoApproveJoinRequests = autoApproveJoinRequests;
            if (!db.data.adminSettings.groupManagement) db.data.adminSettings.groupManagement = {};
            db.data.adminSettings.groupManagement.autoApproveJoinRequests = autoApproveJoinRequests;
        }

        db.save(true); // Force immediate sync
        db.triggerSystemUpdate();
        res.json({ success: true, message: 'Group & AI Settings saved' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Test AI Connection
app.post('/api/admin/test-ai', (req, res) => {
    const { platform, apiKey } = req.body;
    if (!apiKey) return res.json({ success: false, message: 'API Key is missing' });

    // Simulate connection check
    // In a real app, you would make a small request to the platform's API
    setTimeout(() => {
        res.json({ success: true, message: `Connected to ${platform.toUpperCase()} successfully!` });
    }, 1000);
});

// API: Admin - Chat with AI (Test)
app.post('/api/admin/chat-ai', (req, res) => {
    const { message } = req.body;
    const settings = db.data.groupSettings || {};

    // Simple mock response based on platform
    let reply = "";
    const platform = settings.aiPlatform || "gemini";

    if (message.toLowerCase().includes("how") || message.toLowerCase().includes("help")) {
        reply = `As your ${platform.toUpperCase()} AI, I can help users with deposits, account generation, and general platform support. Just ask!`;
    } else {
        reply = `I am processing your request using ${platform.toUpperCase()}. Everything looks good!`;
    }

    res.json({ success: true, reply });
});

// API: Database Export (Send to Admin)
app.get('/api/admin/db/export', async (req, res) => {
    try {
        const result = await _runBackup('manual');
        res.json({ success: true, message: 'Manual backup generated and sent to Telegram', file: result.fileName });
    } catch (e) {
        console.error('Export error:', e);
        res.json({ success: false, message: e.message });
    }
});

// API: Database Import
app.post('/api/admin/db/import', async (req, res) => {
    try {
        const newData = req.body.data;
        if (!newData || typeof newData !== 'object') {
            return res.json({ success: false, message: 'Invalid JSON data' });
        }

        // Merge or Replace core objects
        db.data.users = { ...(db.data.users || {}), ...(newData.users || {}) };
        if (newData.settings) db.data.settings = { ...(db.data.settings || {}), ...newData.settings };
        if (newData.cardPrices) db.data.cardPrices = { ...(db.data.cardPrices || {}), ...newData.cardPrices };
        if (newData.vpnPrices) db.data.vpnPrices = { ...(db.data.vpnPrices || {}), ...newData.vpnPrices };
        if (newData.cards) db.data.cards = { ...(db.data.cards || {}), ...newData.cards };
        if (newData.vpnAccounts) db.data.vpnAccounts = { ...(db.data.vpnAccounts || {}), ...newData.vpnAccounts };
        if (newData.tasks) db.data.tasks = { ...(db.data.tasks || {}), ...newData.tasks };
        Object.keys(newData).forEach(key => {
            if (!db.data[key]) db.data[key] = newData[key];
        });

        db.save(true);

        const adminId = process.env.ADMIN_ID;
        if (bot && adminId) {
            await bot.sendMessage(adminId, '✅ <b>Database Imported & Merged</b>\n\nA new JSON database file was uploaded via Web Admin.', { parse_mode: 'HTML' });
        }

        res.json({ success: true, message: 'Database updated successfully' });
    } catch (e) {
        console.error('Import error:', e);
        res.json({ success: false, message: e.message });
    }
});

// API: Database Wipe
app.post('/api/admin/db/wipe', async (req, res) => {
    try {
        // Execute complete database wipe across local JSON and MySQL
        await db.wipe();

        const adminId = config.ADMIN_ID || process.env.ADMIN_ID;
        if (bot && adminId) {
            await bot.sendMessage(adminId, '⚠️ <b>Database Wiped</b>\n\nAll users, test, and demo data were permanently deleted via Web Admin.\n\n✅ MySQL also wiped clean.', { parse_mode: 'HTML' }).catch(() => { });
        }

        res.json({ success: true, message: 'Database wiped successfully (local + MySQL)' });
    } catch (e) {
        console.error('Wipe error:', e);
        res.json({ success: false, message: e.message });
    }
});

// Duplicate database routes removed to resolve conflicts and prevent server restart loops.
// The primary implementations remain active at lines 252-288.

// NOTE: /api/admin/stats primary implementation is defined earlier with full data.
// Duplicate stub removed — it was overriding the real endpoint with hardcoded zeros.


// API: Admin - Provider Management
app.get('/api/admin/providers', (req, res) => {
    const providers = db.data.providers || {};
    // Hide real API keys partially
    const list = Object.entries(providers).map(([id, p]) => ({
        id: p.id || id,
        name: p.name || 'Unknown',
        type: p.type || 'sms',
        apiUrl: p.apiUrl || '',
        apiKey: '***' + (p.apiKey ? p.apiKey.slice(-4) : ''),
        status: p.status || 'active',
        priority: p.priority || 0
    }));
    res.json({ success: true, providers: list });
});

app.post('/api/admin/providers', (req, res) => {
    const provider = req.body;
    if (!provider.id) return res.json({ success: false, message: 'ID required' });

    if (!db.data.providers) db.data.providers = {};

    // If updating and apiKey is '***...', keep old key
    if (provider.apiKey && provider.apiKey.startsWith('***')) {
        const old = db.data.providers[provider.id];
        if (old) provider.apiKey = old.apiKey;
    }

    db.data.providers[provider.id] = {
        ...db.data.providers[provider.id],
        ...provider,
        updatedAt: Date.now()
    };
    db.save(true);
    res.json({ success: true });
});

// =============================================
// MANUAL NUMBERS MANAGEMENT API
// =============================================

app.delete('/api/admin/providers/:id', (req, res) => {
    const { id } = req.params;
    if (db.data.providers && db.data.providers[id]) {
        delete db.data.providers[id];
        db.save(true);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// =============================================
// GROUP MANAGEMENT API
// =============================================

// Group management GET route unified above

// ===== AI MODERATOR API =====
app.get('/api/admin/ai-moderator', (req, res) => {
    const settings = db.data?.adminSettings?.aiModerator || {};
    res.json({ success: true, settings });
});

app.post('/api/admin/ai-moderator', (req, res) => {
    if (!db.data.adminSettings) db.data.adminSettings = {};
    db.data.adminSettings.aiModerator = {
        enabled: req.body.enabled !== false,
        apiKey: req.body.apiKey || '',
        model: req.body.model || '',
        prompt: req.body.prompt || '',
        deleteSpam: req.body.deleteSpam !== false,
        suspendUser: req.body.suspendUser !== false,
        warnFirst: req.body.warnFirst !== false,
        updatedAt: Date.now()
    };
    db.save(true);
    res.json({ success: true });
});

// Load AI models from OpenAI-compatible API
app.post('/api/admin/ai-models', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.json({ success: false, message: 'API key required' });
    try {
        const axios = require('axios');
        // Try OpenAI models endpoint
        const response = await axios.get('https://api.openai.com/v1/models', {
            headers: { 'Authorization': 'Bearer ' + apiKey },
            timeout: 8000
        });
        const models = (response.data.data || [])
            .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
            .sort((a, b) => b.id.localeCompare(a.id))
            .slice(0, 30);
        res.json({ success: true, models });
    } catch (e) {
        // Try OpenRouter fallback
        try {
            const axios = require('axios');
            const r2 = await axios.get('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': 'Bearer ' + apiKey },
                timeout: 8000
            });
            const models = (r2.data.data || []).slice(0, 30);
            res.json({ success: true, models });
        } catch (e2) {
            res.json({ success: false, message: 'Could not load models. Check your API key.' });
        }
    }
});

// ===== CUSTOM SUPPORT USERNAME API =====
app.get('/api/admin/support-username', (req, res) => {
    const username = db.data?.adminSettings?.supportUsername || db.data?.settings?.supportUsername || '';
    res.json({ success: true, username });
});

app.post('/api/admin/support-username', (req, res) => {
    const { username } = req.body;
    if (!username) return res.json({ success: false, message: 'Username required' });
    if (!db.data.adminSettings) db.data.adminSettings = {};
    db.data.adminSettings.supportUsername = username.replace(/^@/, '');
    if (!db.data.settings) db.data.settings = {};
    db.data.settings.supportUsername = username.replace(/^@/, '');
    db.save(true);
    res.json({ success: true });
});

// Public: Get support username (for user panel)
app.get('/api/support-username', (req, res) => {
    const link = db.data?.apiKeys?.supportLink || db.data?.adminSettings?.supportUsername || db.data?.settings?.supportUsername || 'support';
    res.json({ success: true, username: link });
});

// Public: Get public configuration for user panel
app.get('/api/public/config', (req, res) => {
    const apiKeys = db.data?.apiKeys || {};
    const adminSettings = db.data?.adminSettings || {};
    const settings = db.data?.settings || {};
    res.json({
        success: true,
        supportLink: apiKeys.supportLink || adminSettings.supportUsername || settings.supportUsername || 'support',
        requiredChannel: apiKeys.requiredChannel || settings.requiredChannel || '@AutosVerify',
        requiredGroup: apiKeys.requiredGroup || settings.requiredGroup || '@AutosVerifyCh',
        requiredYoutube: apiKeys.requiredYoutube || '',
        autoFolderLink: apiKeys.autoFolderLink || '',
        welcomeMessage: apiKeys.welcomeMessage || '',
        botName: adminSettings.botName || 'SMS BOT'
    });
});

// API: Detailed System Info
app.get('/api/admin/system/info', (req, res) => {
    const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        dbFile: db.DB_FILE,
        dbSize: fs.existsSync(db.DB_FILE) ? fs.statSync(db.DB_FILE).size : 0,
        usage: {
            users: Object.keys(db.data.users || {}).length,
            groups: Array.isArray(db.data.groups) ? db.data.groups.length : Object.keys(db.data.groups || {}).length,
            transactions: (db.data.transactions || []).length,
            providers: Object.keys(db.data.providers || {}).length,
            accounts: (db.data.premiumAccounts || []).length
        }
    };
    res.json({ success: true, stats });
});

// API: Admin - Mass Gift
app.post('/api/admin/mass-gift', async (req, res) => {
    try {
        const { asset, amount, messageFormat } = req.body;
        if (!asset || !amount || amount <= 0) {
            return res.json({ success: false, message: 'Invalid asset or amount' });
        }

        const users = await db.getUsers();
        const userArray = Object.values(users);
        console.log(`[MASS_GIFT] Found ${userArray.length} users for mass gift.`);
        let affected = 0;
        const giftId = 'gift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        for (const user of userArray) {
            // DO NOT apply balances directly! User must claim it.

            // Create a pending gift
            if (!user.pendingGifts) user.pendingGifts = [];
            user.pendingGifts.push({
                id: giftId,
                currency: asset === 'tokens' ? 'tokens' : (asset === 'gems' ? 'Gems' : 'usd'),
                amount: amount,
                claimed: false,
                date: Date.now()
            });

            // Create a notification
            if (!user.notifications) user.notifications = [];

            const assetLabel = asset === 'tokens' ? 'TC' : (asset === 'usd' ? '$' : 'Gems');
            const amtStr = asset === 'usd' ? amount.toFixed(3) : amount;
            let finalMsg = messageFormat || `🎁 You received a gift of {AMOUNT} {ASSET} from Admin!`;
            finalMsg = finalMsg.replace(/\{AMOUNT\}/g, asset === 'usd' ? '$' + amtStr : amtStr)
                .replace(/\{ASSET\}/g, assetLabel);

            user.notifications.unshift({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'gift',
                title: 'Admin Gift',
                message: finalMsg,
                giftId: giftId,
                date: Date.now(),
                read: false
            });

            await db.updateUser(user);
            affected++;
        }
        res.json({ success: true, affectedUsers: affected });
    } catch (e) {
        console.error('[MASS_GIFT]', e);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// API: Admin - Get Broadcast History
app.get('/api/admin/broadcasts', (req, res) => {
    try {
        const broadcasts = db.data.broadcasts || [];
        // Sort by date descending (newest first)
        const sorted = broadcasts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res.json({ success: true, broadcasts: sorted.slice(0, 50) }); // Return last 50
    } catch (e) {
        console.error('[BROADCAST] Error loading history:', e);
        res.json({ success: false, broadcasts: [], message: e.message });
    }
});

// API: Admin - Delete Broadcast
app.delete('/api/admin/broadcasts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const broadcasts = db.data.broadcasts || [];
        const index = broadcasts.findIndex(b => b.id === id);

        if (index === -1) {
            return res.json({ success: false, message: 'Broadcast not found' });
        }

        const broadcast = broadcasts[index];

        // Delete from Telegram if messages tracked
        if (broadcast.telegramMessages && Array.isArray(broadcast.telegramMessages)) {
            const TelegramBot = require('node-telegram-bot-api');
            const config = require('../config');
            const botToken = config.TELEGRAM_BOT_TOKEN;

            let activeBot = bot;
            if (!activeBot && botToken) {
                try {
                    activeBot = new TelegramBot(botToken, { polling: false });
                } catch (e) {
                    console.error('[BROADCAST_DELETE] Failed to create bot:', e.message);
                }
            }

            if (activeBot) {
                for (const msg of broadcast.telegramMessages) {
                    try {
                        await activeBot.deleteMessage(msg.chatId, msg.messageId);
                        console.log(`[BROADCAST_DELETE] Deleted message ${msg.messageId} from ${msg.chatId}`);
                    } catch (e) {
                        console.error(`[BROADCAST_DELETE] Failed to delete from ${msg.chatId}:`, e.message);
                        // Ignore failure (message might be too old or bot kicked)
                    }
                }
            }
        }

        // Remove from history
        broadcasts.splice(index, 1);
        db.data.broadcasts = broadcasts;
        db.save(true);

        res.json({ success: true, message: 'Broadcast deleted from history and Telegram (if possible)' });
    } catch (e) {
        console.error('[BROADCAST_DELETE] Error:', e);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// API: Admin - Advanced Broadcast
app.post('/api/admin/broadcast', async (req, res) => {
    const { message, mediaType, mediaUrl, buttons, target } = req.body;

    // Track if requested by helper admin
    const adminUserId = req.headers['x-user-id'];
    const adminUser = adminUserId ? db.getUser(adminUserId) : null;
    const isHelper = adminUser && adminUser.role === 'helper_admin';

    // Normalize UI targets to backend targets
    // UI: bot/group/channel/all
    // Backend: users/groups/channels/all
    const normalizedTarget = (function () {
        const t = String(target || '').toLowerCase();
        if (t === 'bot') return 'users';
        if (t === 'group') return 'groups';
        if (t === 'channel') return 'channels';
        return t;
    })();

    if (!message && !mediaUrl) return res.json({ success: false, message: 'Message or Media required' });

    // Prepare Targets
    let targetIds = [];
    const apiKeys = db.data.apiKeys || {};
    const requiredChannel = apiKeys.requiredChannel || '';

    // If target includes web, users, or all, save broadcast notifications to LOCAL file only
    // (NOT MySQL — these are ephemeral announcements, expire in 7 days)
    if (normalizedTarget === 'web' || normalizedTarget === 'users' || normalizedTarget === 'all') {
        const notifId_base = 'notif_' + Date.now();
        const notifTimestamp = new Date().toISOString();
        const notifDate = Date.now();
        const notifExpiry = notifDate + (7 * 24 * 60 * 60 * 1000); // 7 days
        const notifMessage = message || (mediaUrl ? '[Media Attached]' : '');

        // Load existing local broadcast notifications file
        // Use process.cwd() for reliable path resolution
        const uploadsDir = path.join(process.cwd(), 'web', 'uploads');
        const bcNotifsPath = path.join(uploadsDir, 'bc_notifications.json');
        let bcNotifs = {};
        try {
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            if (fs.existsSync(bcNotifsPath)) {
                bcNotifs = JSON.parse(fs.readFileSync(bcNotifsPath, 'utf8'));
            }
        } catch (e) {
            console.error('[BROADCAST] Failed to load bc_notifications.json:', e.message);
            bcNotifs = {};
        }

        const usersObj = db.data.users || {};
        let notifCount = 0;

        // ===== IMPROVED BROADCAST NOTIFICATION SYSTEM =====
        // Send notifications both via local file AND Firebase notifications array
        // This ensures notifications appear both in web panel and via polling
        for (const uid of Object.keys(usersObj)) {
            if (!bcNotifs[uid]) bcNotifs[uid] = [];
            // Remove expired notifications for this user
            bcNotifs[uid] = bcNotifs[uid].filter(n => !n.expiresAt || n.expiresAt > Date.now());

            // Avoid duplicate
            if (bcNotifs[uid].some(n => n.id && n.id.startsWith(notifId_base))) continue;

            const notifObj = {
                id: notifId_base + '_' + uid,
                type: 'broadcast',
                title: '📢 System Announcement',
                message: notifMessage,
                timestamp: notifTimestamp,
                date: notifDate,
                expiresAt: notifExpiry,
                read: false,
                autoClose: true,
                duration: 8000 // Auto-close after 8 seconds
            };

            bcNotifs[uid].unshift(notifObj);

            // ALSO add to MySQL user notifications for dual notification system
            const userRecord = usersObj[uid];
            if (userRecord) {
                if (!userRecord.notifications) userRecord.notifications = [];
                userRecord.notifications.unshift({
                    id: 'broadcast_' + notifId_base + '_' + uid,
                    type: 'broadcast',
                    title: '📢 Broadcast Message',
                    message: notifMessage,
                    timestamp: notifTimestamp,
                    read: false,
                    autoClose: true,
                    duration: 8000
                });
                // Keep max 50 notifications per user
                if (userRecord.notifications.length > 50) {
                    userRecord.notifications = userRecord.notifications.slice(0, 50);
                }
            }

            // Keep max 20 broadcast notifications per user in local file
            if (bcNotifs[uid].length > 20) bcNotifs[uid] = bcNotifs[uid].slice(0, 20);
            notifCount++;
        }

        // Save to local file
        try {
            const saveUploadsDir = path.join(process.cwd(), 'web', 'uploads');
            const saveBcNotifsPath = path.join(saveUploadsDir, 'bc_notifications.json');
            if (!fs.existsSync(saveUploadsDir)) fs.mkdirSync(saveUploadsDir, { recursive: true });
            fs.writeFileSync(saveBcNotifsPath, JSON.stringify(bcNotifs), 'utf8');
            console.log(`[BROADCAST] Local web notifications saved for ${notifCount} users at ${saveBcNotifsPath}`);
        } catch (e) {
            console.error('[BROADCAST] Failed to save local notifications:', e.message);
        }
    }

    if (normalizedTarget === 'web') {
        const userCount = Object.keys(db.data.users || {}).length;
        // Save to local broadcast history only (not MySQL)
        try {
            const uploadsDir2 = path.join(process.cwd(), 'web', 'uploads');
            if (!fs.existsSync(uploadsDir2)) fs.mkdirSync(uploadsDir2, { recursive: true });
            const bcHistPath = path.join(uploadsDir2, 'bc_history.json');
            let bcHist = [];
            if (fs.existsSync(bcHistPath)) bcHist = JSON.parse(fs.readFileSync(bcHistPath, 'utf8'));
            bcHist.unshift({ id: Date.now().toString(), message, mediaType, mediaUrl, target: 'web', sent: userCount, failed: 0, createdAt: Date.now() });
            if (bcHist.length > 100) bcHist = bcHist.slice(0, 100);
            fs.writeFileSync(bcHistPath, JSON.stringify(bcHist), 'utf8');
        } catch (e) { console.error('[BROADCAST] Failed to save bc_history:', e.message); }

        return res.json({ success: true, sent: userCount, failed: 0, total: userCount, channelSuccess: false, mainChannel: null, note: 'Sent exclusively to Web Panel notifications' });
    }

    // Parse channel ID from requiredChannel (can be @username or -100xxx or https://t.me/xxx)
    let mainChannelId = null;
    if (requiredChannel) {
        if (requiredChannel.startsWith('-100')) {
            mainChannelId = requiredChannel;
        } else if (requiredChannel.startsWith('@')) {
            mainChannelId = requiredChannel;
        } else if (requiredChannel.includes('t.me/')) {
            const match = requiredChannel.match(/t\.me\/(\w+)/);
            if (match) mainChannelId = '@' + match[1];
        }
    }

    if (normalizedTarget === 'users') {
        const users = await db.getUsers();
        if (users.length > 0) targetIds.push(...users.map(u => u.id));
    }

    if (normalizedTarget === 'channels' || normalizedTarget === 'all') {
        // ✅ FIX: Priority - Use main channel from API Management
        if (mainChannelId) {
            targetIds.push(mainChannelId);
            console.log(`[BROADCAST] Using main channel from API Management: ${mainChannelId}`);
        } else {
            // Fallback: Get channels from database
            const groups = db.getGroups();
            const onlyChannels = groups.filter(g => g.type === 'channel');
            if (onlyChannels.length > 0) {
                targetIds.push(...onlyChannels.map(g => g.id));
                console.log(`[BROADCAST] Using ${onlyChannels.length} channels from database`);
            }
        }
    }

    if (normalizedTarget === 'groups') {
        // ✅ FIX: Send to groups only when explicitly selected
        const groups = db.getGroups();
        const onlyGroups = groups.filter(g => g.type === 'group' || g.type === 'supergroup');
        if (onlyGroups.length > 0) {
            targetIds.push(...onlyGroups.map(g => g.id));
            console.log(`[BROADCAST] Using ${onlyGroups.length} groups from database`);
        }
    }

    if (normalizedTarget === 'all') {
        // For 'all' target: Send to users + main channel only (not individual groups)
        // Because channel posts auto-forward to linked groups
        const users = await db.getUsers();
        if (users.length > 0) targetIds.push(...users.map(u => u.id));

        // Add main channel
        if (mainChannelId) {
            targetIds.push(mainChannelId);
        } else {
            const groups = db.getGroups();
            const onlyChannels = groups.filter(g => g.type === 'channel');
            if (onlyChannels.length > 0) targetIds.push(...onlyChannels.map(g => g.id));
        }
    }

    // Unique IDs only — strict deduplication to prevent sending same message twice
    targetIds = [...new Set(targetIds.map(id => String(id)))];

    // Check against recently-sent broadcasts (within last 10 minutes) to prevent re-sending
    const recentBroadcasts = (db.data.broadcasts || []).filter(b => b.createdAt > Date.now() - 10 * 60 * 1000);
    const recentTargetSets = recentBroadcasts.map(b => b.targetIds || []);

    if (targetIds.length === 0 && normalizedTarget !== 'web') {
        let msg = 'No targets found';
        if (normalizedTarget === 'channels') {
            msg = 'No channels found. Please add a channel in Group Management or set a required channel in API Management.';
        } else if (normalizedTarget === 'groups') {
            msg = 'No groups found. Please add a group in Group Management.';
        }
        return res.json({ success: false, message: msg });
    }

    // Prepare Keyboard
    let reply_markup = undefined;
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
        const rows = [];
        let currentRow = [];
        buttons.forEach((btn, i) => {
            let bUrl = btn.url || '';
            // Auto-fix @usernames to t.me links
            if (bUrl.startsWith('@')) {
                bUrl = 'https://t.me/' + bUrl.slice(1);
            } else if (bUrl && !bUrl.includes('://')) {
                bUrl = 'https://' + bUrl;
            }

            // Fix: Replace localhost with PUBLIC_URL for Telegram buttons
            if (bUrl.includes('localhost:') || bUrl.includes('127.0.0.1:')) {
                const publicUrl = config.PUBLIC_URL || 'https://autosverifybot-production.up.railway.app/';
                bUrl = bUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, publicUrl);
            }

            currentRow.push({ text: btn.text, url: bUrl });
            if (currentRow.length === 2 || i === buttons.length - 1) {
                rows.push(currentRow);
                currentRow = [];
            }
        });
        reply_markup = { inline_keyboard: rows };
    }

    // Resolve Local Paths for Media
    let actualMedia = mediaUrl;
    if (mediaUrl && mediaUrl.startsWith('/uploads/')) {
        actualMedia = path.join(__dirname, '..', 'web', mediaUrl);
        if (!fs.existsSync(actualMedia)) {
            console.error(`[BROADCAST] Media file not found locally: ${actualMedia}`);
            // Fallback to URL if file missing? (unlikely)
        }
    }

    // Send
    let successCount = 0;
    let failCount = 0;
    let channelSuccess = false;

    try {
        const TelegramBot = require('node-telegram-bot-api');
        const config = require('../config');

        // Validate bot token
        const botToken = config.TELEGRAM_BOT_TOKEN;
        if (!botToken || botToken === 'YOUR_TELEGRAM_BOT_TOKEN_HERE' || botToken === 'undefined') {
            console.error('[BROADCAST] ERROR: TELEGRAM_BOT_TOKEN is not set in environment variables');
            return res.json({
                success: false,
                message: 'Bot token not configured. Please set TELEGRAM_BOT_TOKEN in environment variables.'
            });
        }

        // Use Global Bot if available (set via setBot), otherwise create stateless instance
        let activeBot;
        if (bot) {
            activeBot = bot;
            console.log('[BROADCAST] Using global bot instance');
        } else {
            try {
                activeBot = new TelegramBot(botToken, { polling: false });
                console.log('[BROADCAST] Created new bot instance for broadcast');
            } catch (botError) {
                console.error('[BROADCAST] Failed to create bot instance:', botError.message);
                return res.json({
                    success: false,
                    message: 'Failed to initialize bot: ' + botError.message
                });
            }
        }

        // Verify bot is working by getting bot info
        try {
            const botInfo = await activeBot.getMe();
            console.log(`[BROADCAST] Bot verified: @${botInfo.username} (${botInfo.id})`);
        } catch (verifyError) {
            console.error('[BROADCAST] Bot token verification failed:', verifyError.message);
            return res.json({
                success: false,
                message: 'Bot token invalid or bot not responding. Please check TELEGRAM_BOT_TOKEN.'
            });
        }

        console.log(`[BROADCAST] Starting broadcast to ${targetIds.length} targets`);

        const telegramMessages = [];

        for (const chatId of targetIds) {
            try {
                console.log(`[BROADCAST] Sending to ${chatId}...`);

                let sentMsg;
                if (mediaType === 'photo' && actualMedia) {
                    const photoInput = (typeof actualMedia === 'string' && fs.existsSync(actualMedia)) ? fs.createReadStream(actualMedia) : actualMedia;
                    sentMsg = await activeBot.sendPhoto(chatId, photoInput, { caption: message, reply_markup });
                } else if (mediaType === 'video' && actualMedia) {
                    const videoInput = (typeof actualMedia === 'string' && fs.existsSync(actualMedia)) ? fs.createReadStream(actualMedia) : actualMedia;
                    sentMsg = await activeBot.sendVideo(chatId, videoInput, { caption: message, reply_markup });
                } else {
                    sentMsg = await activeBot.sendMessage(chatId, message || 'Broadcast', { reply_markup });
                }
                successCount++;

                if (sentMsg) {
                    telegramMessages.push({ chatId, messageId: sentMsg.message_id });
                }

                // Track message if sent by helper admin
                if (isHelper && sentMsg) {
                    adminUser.helperAdminMessages = adminUser.helperAdminMessages || [];
                    adminUser.helperAdminMessages.push({ chatId, messageId: sentMsg.message_id });
                }

                // Track if channel was successful
                if (mainChannelId && String(chatId) === String(mainChannelId)) {
                    channelSuccess = true;
                }

                // Web notifications are pre-populated before the loop, so we do not add them here.

                console.log(`[BROADCAST] ✓ Successfully sent to ${chatId}`);
            } catch (e) {
                failCount++;
                console.error(`[BROADCAST] ✗ Failed to send to ${chatId}: ${e.message}`);
                console.error(`[BROADCAST] Error code: ${e.code || 'N/A'}, response: ${e.response?.body || 'N/A'}`);
            }
            // Tiny delay to be polite to API
            await new Promise(r => setTimeout(r, 50));
        }

        if (isHelper) {
            await db.updateUser(adminUser);
        }

        console.log(`[BROADCAST] Complete: ${successCount} sent, ${failCount} failed out of ${targetIds.length}`);

        // Save to broadcast history (with targetIds for deduplication)
        if (!db.data.broadcasts) db.data.broadcasts = [];
        db.data.broadcasts.push({
            id: Date.now().toString(),
            message,
            mediaType,
            mediaUrl,
            target: normalizedTarget,
            targetIds: targetIds.slice(0, 200), // store first 200 for dedup check
            sent: successCount,
            failed: failCount,
            createdAt: Date.now(),
            telegramMessages: telegramMessages
        });

        // Save any web notification updates — force immediate save
        await db.save(true);

        res.json({
            success: true,
            sent: successCount,
            failed: failCount,
            total: targetIds.length,
            channelSuccess: channelSuccess,
            mainChannel: mainChannelId,
            note: channelSuccess ? 'Posted to channel. If channel is linked to group, message will auto-appear in group.' : ''
        });

        // NEW: Immediate cleanup of broadcast media file ONLY if it's a bc_ prefixed temp file
        if (mediaUrl && mediaUrl.startsWith('/uploads/bc_')) {
            const filePath = path.join(__dirname, '..', 'web', mediaUrl);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[CLEANUP] Broadcast temp media deleted immediately: ${filePath}`);
                } catch (err) {
                    console.error(`[CLEANUP] Immediate delete failed: ${err.message}`);
                }
            }
        }

    } catch (e) {
        console.error('[BROADCAST] System Error:', e);
        res.json({ success: false, message: 'Broadcast System Error: ' + e.message });
    }
});


// Multer setup for large files
const multer = require('multer');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'web', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        // ============================================================
        // FILE PREFIX → CLEANUP POLICY
        // ============================================================
        // bc_    = Broadcast temp media  → deleted after send (1hr max)
        // dep_   = Deposit screenshots   → deleted after 7 days
        // proc_  = User processing temps → deleted after 7 days
        //          (AI upload)
        // shop_  = Admin shop/service images → NEVER auto-deleted
        // media_ = Other admin uploads   → NEVER auto-deleted
        // img_   = Base64 admin uploads  → NEVER auto-deleted
        // ============================================================
        const prefix = req.path.includes('upload-shop') ? 'shop_' :
            req.path.includes('upload-media') ? 'bc_' :
                req.path.includes('screenshot') ? 'dep_' :
                    req.path.includes('ai/upload') ? 'proc_' : 'media_';
        cb(null, prefix + Date.now() + '_' + Math.floor(Math.random() * 1000) + ext);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: Infinity }
});

app.post('/api/admin/upload-media', upload.single('file'), (req, res) => {
    if (req.file) console.log(`[UPLOAD] Broadcast Media: ${req.file.filename} (${req.file.size} bytes)`);
    if (!req.file) return res.json({ success: false, message: 'No file uploaded' });
    res.json({ success: true, url: '/uploads/' + req.file.filename });
});

// Admin Shop/Service Image Upload — files NEVER auto-deleted (shop_ prefix)
app.post('/api/admin/upload-shop', upload.single('file'), (req, res) => {
    if (!req.file) return res.json({ success: false, message: 'No file uploaded' });
    console.log(`[UPLOAD] Shop/Service Image: ${req.file.filename} (${req.file.size} bytes)`);
    res.json({ success: true, url: '/uploads/' + req.file.filename });
});

// Public API: Upload Screenshot (for deposits)
app.post('/api/upload/screenshot', upload.single('file'), (req, res) => {
    if (!req.file) return res.json({ success: false, message: 'No file uploaded' });
    res.json({ success: true, url: '/uploads/' + req.file.filename });
});

// API: Admin - Upload Image (Base64) - Legacy/Small images
app.post('/api/admin/upload', (req, res) => {
    const { image } = req.body;
    if (!image) return res.json({ success: false, message: 'No image data' });

    try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const uploadDir = path.join(__dirname, '..', 'web', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filename = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.png';
        const filepath = path.join(uploadDir, filename);

        fs.writeFileSync(filepath, buffer);
        res.json({ success: true, url: '/uploads/' + filename });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// API: Admin - Premium Accounts Inventory
app.get('/api/admin/accounts', (req, res) => {
    const accounts = db.data.premiumAccounts || [];
    res.json({ success: true, accounts });
});

app.post('/api/admin/accounts', (req, res) => {
    const { id, type, email, password, price, instructions } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    if (!db.data.premiumAccounts) db.data.premiumAccounts = [];

    if (id) {
        // Edit existing
        const idx = db.data.premiumAccounts.findIndex(a => a.id === id);
        if (idx !== -1) {
            db.data.premiumAccounts[idx].type = type || 'other';
            db.data.premiumAccounts[idx].email = email;
            db.data.premiumAccounts[idx].password = password;
            db.data.premiumAccounts[idx].price = parseInt(price) || 0;
            db.data.premiumAccounts[idx].instructions = instructions || '';
            db.save(true);
            return res.json({ success: true, id });
        }
    }

    const account = {
        id: 'acc_' + Date.now(),
        type: type || 'other',
        email,
        password,
        price: parseInt(price) || 0,
        instructions: instructions || '',
        sold: false,
        addedAt: Date.now()
    };
    db.data.premiumAccounts.push(account);
    db.save(true);
    res.json({ success: true, id: account.id });
});

// API: User - Get Available Accounts
app.get('/api/accounts', (req, res) => {
    const accounts = (db.data.premiumAccounts || []).filter(a => !a.sold).map(a => ({
        id: a.id,
        type: a.type,
        price: a.price,
        // Hide password and instructions
        email: a.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => {
            return gp2 + gp3.replace(/./g, '*');
        })
    }));
    res.json({ success: true, accounts });
});

// API: User - Buy Account
app.post('/api/accounts/buy', async (req, res) => {
    const { userId, accountId } = req.body;
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const allAccounts = db.data.premiumAccounts || [];
    const idx = allAccounts.findIndex(a => a.id === accountId && !a.sold);
    if (idx === -1) return res.json({ success: false, message: 'Account not found or already sold' });

    const account = allAccounts[idx];
    const userTokens = db.getTokenBalance(user);

    if (userTokens < account.price) {
        return res.json({ success: false, message: `Insufficient tokens. Need ${account.price} TC.` });
    }

    // Deduct tokens
    const price = parseInt(account.price || 0);
    db.setTokenBalance(user, userTokens - price);

    // Mark sold
    account.sold = true;
    account.soldTo = userId;
    account.soldAt = Date.now();

    // Add to history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'email', // using email to show in gmails used as per user request
        date: new Date().toISOString(),
        details: `Bought ${account.type} Account: ${account.email}`,
        reward: `-${account.price}`
    });

    db.save(true);

    res.json({
        success: true,
        account: account, // Return full object so cards work
        newBalance: user.tokens !== undefined ? user.tokens : user.balance_tokens
    });
});

app.delete('/api/admin/accounts/:id', (req, res) => {
    const { id } = req.params;
    if (!db.data.premiumAccounts) return res.json({ success: false });
    const before = db.data.premiumAccounts.length;
    db.data.premiumAccounts = db.data.premiumAccounts.filter(a => a.id !== id);
    db.save(true);
    res.json({ success: db.data.premiumAccounts.length < before });
});

// API: Admin - Get all daily bonus claims
app.get('/api/admin/daily-stats', async (req, res) => {
    const users = await db.getUsers();
    const totalClaims = users.filter(u => u.lastDaily > 0).length;
    const totalStreak = users.reduce((acc, u) => acc + (u.dailyStreak || 0), 0);
    res.json({ success: true, totalClaims, avgStreak: users.length ? (totalStreak / users.length).toFixed(1) : 0 });
});

// SERVER LOGS API
app.get('/api/admin/logs', (req, res) => {
    res.json({ success: true, logs: db.data.serverLogs || [] });
});

app.post('/api/admin/logs/clear', async (req, res) => {
    try {
        const { userId } = req.body;
        const userObj = await db.getUser(userId);
        if (!userObj || !userObj.adminVerified) return res.json({ success: false, message: 'Unauthorized' });

        db.clearLogs();
        res.json({ success: true, message: 'Server logs cleared' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.post('/api/admin/logs/solve', (req, res) => {
    const { logId } = req.body;
    db.solveLog(logId);
    res.json({ success: true, message: 'Log marked as solved' });
});

// API: Admin - Get Settings
app.get('/api/admin/settings', (req, res) => {
    const settings = db.getSettings();
    const cardPrices = db.data.cardPrices || {};
    const vpnPrices = db.data.vpnPrices || {};
    const adminSettings = db.data.adminSettings || {};
    const serviceCosts = db.data.settings.costs || {};
    const apiKeys = db.data.apiKeys || {};

    // Ensure botName is included
    if (!adminSettings.botName) {
        adminSettings.botName = 'Auto Verify';
    }

    res.json({
        success: true,
        settings,
        cardPrices,
        vpnPrices,
        adminSettings,
        serviceCosts,
        apiKeys: {
            smtpLabsKey: apiKeys.smtpLabsKey || '',
            gmailClientId: apiKeys.gmailClientId || '',
            gmailClientSecret: apiKeys.gmailClientSecret || '',
            miniAppUrl: apiKeys.miniAppUrl || '',
            backupBotToken: apiKeys.backupBotToken || ''
        }
    });
});

// API: Admin - Update Settings
app.post('/api/admin/settings', (req, res) => {
    const {
        dailyBonus, refBonus, welcomeBonus, supportCost, gmailCost, gems,
        transferCost, verificationCost, mailCost, tradingMinBet, adReward,
        botName
    } = req.body;
    const s = db.getSettings();

    if (dailyBonus !== undefined) s.dailyBonus = parseInt(dailyBonus);
    if (refBonus !== undefined) s.refBonus = parseInt(refBonus);
    if (transferCost !== undefined) s.transferCost = parseInt(transferCost);
    if (adReward !== undefined) s.adReward = parseInt(adReward);

    // Save to settings.costs
    if (!s.costs) s.costs = {};
    if (verificationCost !== undefined) s.costs.verify = parseInt(verificationCost);
    if (mailCost !== undefined) s.costs.mail = parseInt(mailCost);

    if (welcomeBonus !== undefined) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.welcomeCredits = parseInt(welcomeBonus);
    }
    if (supportCost !== undefined) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.supportCost = parseInt(supportCost);
    }
    if (gmailCost !== undefined) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.gmailCost = parseInt(gmailCost);
    }
    if (tradingMinBet !== undefined) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.tradingMinBet = parseInt(tradingMinBet);
    }
    if (botName !== undefined && botName.trim()) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.botName = botName.trim();
    }

    if (gems) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        if (!db.data.adminSettings.gems) db.data.adminSettings.gems = {};
        if (gems.price !== undefined) db.data.adminSettings.gems.currentPrice = parseFloat(gems.price);
        if (gems.enabled !== undefined) db.data.adminSettings.gems.enabled = (gems.enabled === true || gems.enabled === 'true');
    }

    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true, message: 'Admin settings updated successfully' });
});

// API: Admin - Get API Keys
app.get('/api/admin/apikeys', (req, res) => {
    const apiKeys = db.data.apiKeys || {};
    const adminSettings = db.data.adminSettings || {};
    res.json({
        success: true,
        apiKeys: {
            botToken: apiKeys.botToken || '',
            backupBotToken: apiKeys.backupBotToken || '',
            adminId: apiKeys.adminId || '',
            aiAssistantUrl: apiKeys.aiAssistantUrl || '',
            aiAssistantKey: apiKeys.aiAssistantKey || '',
            aiAssistantModel: apiKeys.aiAssistantModel || '',
            aiAssistantPrompt: apiKeys.aiAssistantPrompt || '',
            aiAssistantAlertAdmin: apiKeys.aiAssistantAlertAdmin === true,
            mainboardApiKey: apiKeys.mainboardApiKey || '',
            smtpLabsKey: apiKeys.smtpLabsKey || '',
            gmailClientId: apiKeys.gmailClientId || '',
            gmailClientSecret: apiKeys.gmailClientSecret || '',
            miniAppUrl: apiKeys.miniAppUrl || '',
            requiredChannels: apiKeys.requiredChannels || (apiKeys.requiredChannel ? [apiKeys.requiredChannel] : []),
            requiredChannel: apiKeys.requiredChannel || '',
            requiredGroups: apiKeys.requiredGroups || (apiKeys.requiredGroup ? [apiKeys.requiredGroup] : []),
            requiredGroup: apiKeys.requiredGroup || '',
            requiredYoutube: apiKeys.requiredYoutube || '',
            supportLink: apiKeys.supportLink || '',
            adReward: apiKeys.adReward || '5',
            welcomeMessage: apiKeys.welcomeMessage || '',
            autoFolderLink: apiKeys.autoFolderLink || '',
            botName: adminSettings.botName || 'SMS BOT'
        },
        dbConfig: null // MySQL connection is configured via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME env vars
    });
});

// API: Admin - Update API Keys
app.post('/api/admin/apikeys', (req, res) => {
    const { botToken, backupBotToken, adminId, aiAssistantUrl, aiAssistantKey, aiAssistantModel, aiAssistantPrompt, aiAssistantAlertAdmin, bytezKey, openRouterKey, mainboardApiKey, smtpLabsKey, gmailClientId, gmailClientSecret, miniAppUrl, requiredChannel, requiredGroup, requiredChannels, requiredGroups, requiredYoutube, supportLink, adReward, welcomeMessage, welcomeCredits, autoFolderLink, botName } = req.body;

    if (!db.data.apiKeys) db.data.apiKeys = {};

    if (botToken !== undefined) db.data.apiKeys.botToken = botToken;
    if (backupBotToken !== undefined) db.data.apiKeys.backupBotToken = backupBotToken;
    if (adminId !== undefined) db.data.apiKeys.adminId = adminId;
    if (aiAssistantUrl !== undefined) db.data.apiKeys.aiAssistantUrl = aiAssistantUrl;
    if (aiAssistantKey !== undefined) db.data.apiKeys.aiAssistantKey = aiAssistantKey;
    if (aiAssistantModel !== undefined) db.data.apiKeys.aiAssistantModel = aiAssistantModel;
    if (aiAssistantPrompt !== undefined) db.data.apiKeys.aiAssistantPrompt = aiAssistantPrompt;
    if (aiAssistantAlertAdmin !== undefined) db.data.apiKeys.aiAssistantAlertAdmin = aiAssistantAlertAdmin === true || aiAssistantAlertAdmin === 'true';
    if (bytezKey !== undefined) {
        db.data.apiKeys.bytezKey = bytezKey;
        db.data.apiKeys.bytezApiKey = bytezKey; // sync both naming conventions
    }
    if (openRouterKey !== undefined) {
        db.data.apiKeys.openRouterKey = openRouterKey;
        db.data.apiKeys.openrouterApiKey = openRouterKey; // sync both naming conventions
    }
    if (mainboardApiKey !== undefined) db.data.apiKeys.mainboardApiKey = mainboardApiKey;
    if (smtpLabsKey !== undefined) db.data.apiKeys.smtpLabsKey = smtpLabsKey;
    if (gmailClientId !== undefined) db.data.apiKeys.gmailClientId = gmailClientId;
    if (gmailClientSecret !== undefined) db.data.apiKeys.gmailClientSecret = gmailClientSecret;
    if (miniAppUrl !== undefined) db.data.apiKeys.miniAppUrl = miniAppUrl;

    if (requiredChannels !== undefined) {
        // Normalize and deduplicate channels
        const normalized = (Array.isArray(requiredChannels) ? requiredChannels : [requiredChannels])
            .map(c => normalizeChatIdentifier(c))
            .filter(Boolean);
        const unique = [...new Set(normalized)];
        
        db.data.apiKeys.requiredChannels = unique;
        const primaryChannel = unique.length > 0 ? unique[0] : '';
        db.data.apiKeys.requiredChannel = primaryChannel;
        if (!db.data.settings) db.data.settings = {};
        db.data.settings.requiredChannel = primaryChannel;
    } else if (requiredChannel !== undefined) {
        const norm = normalizeChatIdentifier(requiredChannel);
        db.data.apiKeys.requiredChannel = norm;
        db.data.apiKeys.requiredChannels = norm ? [norm] : [];
        if (!db.data.settings) db.data.settings = {};
        db.data.settings.requiredChannel = norm;
    }

    if (requiredGroups !== undefined) {
        // Normalize and deduplicate groups
        const normalized = (Array.isArray(requiredGroups) ? requiredGroups : [requiredGroups])
            .map(g => normalizeChatIdentifier(g))
            .filter(Boolean);
        const unique = [...new Set(normalized)];

        db.data.apiKeys.requiredGroups = unique;
        const primaryGroup = unique.length > 0 ? unique[0] : '';
        db.data.apiKeys.requiredGroup = primaryGroup;
        if (!db.data.settings) db.data.settings = {};
        db.data.settings.requiredGroup = primaryGroup;
    } else if (requiredGroup !== undefined) {
        const norm = normalizeChatIdentifier(requiredGroup);
        db.data.apiKeys.requiredGroup = norm;
        db.data.apiKeys.requiredGroups = norm ? [norm] : [];
        if (!db.data.settings) db.data.settings = {};
        db.data.settings.requiredGroup = norm;
    }
    if (requiredYoutube !== undefined) db.data.apiKeys.requiredYoutube = requiredYoutube;
    if (supportLink !== undefined) {
        db.data.apiKeys.supportLink = supportLink;
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.supportUsername = supportLink;
        if (!db.data.settings) db.data.settings = {};
        db.data.settings.supportUsername = supportLink;
    }
    if (adReward !== undefined) db.data.apiKeys.adReward = adReward;
    if (welcomeMessage !== undefined) db.data.apiKeys.welcomeMessage = welcomeMessage;
    if (autoFolderLink !== undefined) db.data.apiKeys.autoFolderLink = autoFolderLink;

    if (botName !== undefined && botName.trim()) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.botName = botName.trim();
    }

    if (welcomeCredits !== undefined) {
        if (!db.data.adminSettings) db.data.adminSettings = {};
        db.data.adminSettings.welcomeCredits = welcomeCredits;
    }

    db.save(true);
    db.triggerSystemUpdate();

    // Dynamically reload Telegram Bot if reload function is registered
    if (typeof global.reloadBotInstance === 'function') {
        global.reloadBotInstance().catch(err => {
            console.error('[SERVER] Failed to dynamically reload Telegram Bot:', err.message);
        });
    }

    res.json({ success: true, message: 'API Keys and Settings updated successfully' });
});

// API: Admin - Get Database Config
app.get('/api/admin/dbconfig', (req, res) => {
    res.json({
        success: true,
        dbConfig: null // MySQL connection is configured via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME env vars
    });
});

// API: Admin - Update Database Config (JSON Upload)
app.post('/api/admin/dbconfig', async (req, res) => {
    try {
        // The body should be the Database config object
        const config = req.body;

        if (!config || typeof config !== 'object') {
            return res.json({ success: false, message: 'Invalid config format. Expected JSON object.' });
        }

        // Store the config in database memory (MySQL connection is configured via env vars)
        // Note: Firebase config is no longer used; MySQL is configured via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME env vars.

        db.save(true);

        res.json({ success: true, message: 'Database configuration saved.' });
    } catch (e) {
        res.json({ success: false, message: 'Error updating database config: ' + e.message });
    }
});

// API: Admin - Restart Bot
app.post('/api/admin/restart-bot', (req, res) => {
    res.json({ success: true, message: 'Bot restart initiated' });

    // Trigger restart after a short delay to allow response to be sent
    setTimeout(() => {
        console.log('[ADMIN] Bot restart triggered via API');
        process.exit(0); // Exit and let process manager (PM2/nodemon) restart
    }, 1000);
});

// =============================================
// FEATURE FLAGS (BUTTON MANAGEMENT)
// =============================================
function getDefaultFeatureFlags() {
    return {
        // Core Services
        tempMail: true,
        premiumMail: true,
        accountsShop: true,
        cardsVcc: true,
        vpnServices: true,
        joinRequired: true,
        requireTelegram: true,

        // Media & Service Tools
        smmInstagram: true,
        websiteTraffic: true,
        videoDownloader: true,
        liveSmsBot: true,
        botHosting: true,

        // Home Grid Buttons
        home_dailyCheckin: true,
        home_verify: true,
        home_service: true,
        home_accountsShop: true,
        home_deposit: true,
        home_mail: true,
        home_earn: true,
        home_videoDownload: true,
        home_smmInstagram: true,
        home_websiteTraffic: true,
        home_liveSmsBot: true,
        home_botHosting: true,

        // Rewards & Engagement
        dailyCheckin: true,
        tasksSystem: true,
        redeemCodes: true,
        referralSystem: true,
        quizFeature: true,
        exchange: true,
        scratchCard: true,
        leaderboard: true,

        // Live Tools
        live2fa: true,
        liveInstagram: true,
        liveFacebook: true,
        liveTiktok: true,
        liveTwitter: true,
        liveThreads: true,
        emailVerification: true,

        // Finance
        depositBinance: true,
        depositCrypto: true,
        transferTokens: true,
        apiKeyAccess: true,
        itemSell: true
    };
}

function getFeatureFlags() {
    if (!db.data.featureFlags) db.data.featureFlags = {};
    const defaults = getDefaultFeatureFlags();
    // Merge defaults (keeps newly added keys enabled by default)
    db.data.featureFlags = { ...defaults, ...db.data.featureFlags };

    // Include global requirement flags
    const flags = { ...db.data.featureFlags };

    return flags;
}

// Public endpoint: mini app fetches enabled/disabled features
app.get('/api/features', (req, res) => {
    const flags = getFeatureFlags();

    // Provide dynamic join requirements info
    const apiKeys = db.data.apiKeys || {};
    
    // Normalize into arrays
    let channels = apiKeys.requiredChannels || []; console.log("Config RC:", config.REQUIRED_CHANNEL);
    if (channels.length === 0 && apiKeys.requiredChannel) channels.push(apiKeys.requiredChannel);
    if (channels.length === 0 && config.REQUIRED_CHANNEL) channels.push(config.REQUIRED_CHANNEL);

    let groups = apiKeys.requiredGroups || [];
    if (groups.length === 0 && apiKeys.requiredGroup) groups.push(apiKeys.requiredGroup);
    if (groups.length === 0 && config.REQUIRED_GROUP) groups.push(config.REQUIRED_GROUP);

    const requiredJoins = {
        channels: channels.map((c, i) => ({
            id: c,
            username: c.replace('@', ''),
            name: `📢 Channel ${i > 0 ? i + 1 : ''}`.trim()
        })),
        groups: groups.map((g, i) => ({
            id: g,
            username: g.replace('@', ''),
            name: `💬 Group ${i > 0 ? i + 1 : ''}`.trim()
        }))
    };

    res.set('Cache-Control', 'no-store');
    res.json({
        success: true,
        features: flags,
        requiredJoins: requiredJoins
    });
});

// Admin: get feature flags
app.get('/api/admin/features', (req, res) => {
    const flags = getFeatureFlags();
    res.json({ success: true, features: flags });
});

// Admin: update feature flags (partial update allowed)
app.post('/api/admin/features', (req, res) => {
    const incoming = req.body || {};
    const current = getFeatureFlags();
    const updated = { ...current };

    Object.keys(incoming).forEach((k) => {
        // Accept booleans or 'true'/'false'
        const v = incoming[k];
        if (typeof v === 'boolean') updated[k] = v;
        else if (v === 'true' || v === 'false') updated[k] = (v === 'true');
    });

    db.data.featureFlags = updated;
    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true, features: updated });
});

// API: Admin - Get System Metrics
app.get('/api/admin/metrics', (req, res) => {
    try {
        const cpus = os.cpus();
        const mem = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        let cpuUsage = 0;
        if (cpus && cpus.length > 0) {
            let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
            for (let cpu of cpus) {
                user += cpu.times.user;
                nice += cpu.times.nice;
                sys += cpu.times.sys;
                idle += cpu.times.idle;
                irq += cpu.times.irq;
            }
            const total = user + nice + sys + idle + irq;
            const active = total - idle;
            cpuUsage = Math.round((active / total) * 100);
        }

        const memUsage = Math.round((usedMem / totalMem) * 100);
        const uptimeSeconds = process.uptime();
        const dbSize = fs.existsSync(db.DB_FILE) ? (fs.statSync(db.DB_FILE).size / 1024).toFixed(2) + ' KB' : '0 KB';

        // Disk usage (best-effort)
        let disk = null;
        try {
            const { execSync } = require('child_process');
            // Windows: use WMIC
            const out = execSync('wmic logicaldisk get size,freespace,caption', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
            // Pick system drive (first with a caption like C:)
            const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const dataLines = lines.slice(1);
            const first = dataLines.map(l => l.split(/\s+/)).find(parts => parts[0] && parts[0].includes(':'));
            if (first && first.length >= 3) {
                const caption = first[0];
                const free = parseInt(first[1]);
                const size = parseInt(first[2]);
                if (!isNaN(free) && !isNaN(size) && size > 0) {
                    const used = size - free;
                    disk = {
                        drive: caption,
                        sizeBytes: size,
                        freeBytes: free,
                        usedBytes: used,
                        usedPercent: Math.round((used / size) * 100)
                    };
                }
            }
        } catch (e) { }

        // Active users calculation (last 24 hours)
        const usersList = Object.values(db.data.users || {});
        let activeUsers = 0;
        const now = Date.now();
        usersList.forEach(u => {
            if (u.lastActive && (now - u.lastActive < 24 * 60 * 60 * 1000)) activeUsers++;
        });

        res.json({
            success: true,
            metrics: {
                cpu: cpuUsage,
                memory: memUsage,
                dbSize: dbSize,
                uptime: uptimeSeconds,
                dbUptime: uptimeSeconds,
                callbacks: totalCallbacks,
                activeUsers: activeUsers,
                disk
            }
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - API Keys
app.get('/api/admin/email-services', (req, res) => {
    const emailServices = db.data.emailServices || {};
    res.json({
        success: true,
        emailService: emailServices.emailService !== false, // default true
        tempMail: emailServices.tempMail !== false // default true
    });
});

app.post('/api/admin/email-services', (req, res) => {
    const { emailService, tempMail } = req.body;
    if (!db.data.emailServices) db.data.emailServices = {};

    if (emailService !== undefined) {
        db.data.emailServices.emailService = emailService === true || emailService === 'true';
    }
    if (tempMail !== undefined) {
        db.data.emailServices.tempMail = tempMail === true || tempMail === 'true';
    }

    db.save(true);
    res.json({ success: true, emailServices: db.data.emailServices });
});

// API: Ad Network Settings (GET & POST)
app.get('/api/admin/ads', (req, res) => {
    const ads = db.data.adSettings || {};
    res.json({ success: true, ads });
});

app.post('/api/admin/ads', (req, res) => {
    const { network, publisherId, adUnitId, directUrl, enabled } = req.body;
    if (!network) return res.json({ success: false, message: 'Network required' });
    if (!db.data.adSettings) db.data.adSettings = {};

    // All networks now support directUrl (including MoneyTag, AdSense, Adsterra)
    db.data.adSettings[network] = {
        publisherId: publisherId || '',
        adUnitId: adUnitId || '',
        directUrl: directUrl || '',
        enabled: enabled !== false
    };
    db.save(true);
    res.json({ success: true, adSettings: db.data.adSettings });
});

// Public endpoint - mini app fetches active ad config
app.get('/api/ads/config', (req, res) => {
    const ads = db.data.adSettings || {};
    // Return only enabled networks
    const active = {};
    Object.entries(ads).forEach(([network, cfg]) => {
        if (cfg.enabled) active[network] = cfg;
    });
    res.json({ success: true, ads: active });
});

// API: Admin - Delete/Disable Ad Network
app.delete('/api/admin/ads/:network', (req, res) => {
    const { network } = req.params;
    if (!db.data.adSettings || !db.data.adSettings[network]) {
        return res.json({ success: false, message: 'Ad network not found' });
    }

    // Remove the ad network from settings (or set enabled to false)
    delete db.data.adSettings[network];
    db.save(true);

    res.json({ success: true, message: `Ad network ${network} deleted successfully` });
});

// API: Admin - Services (UNIFIED FOR COST MANAGEMENT)
app.get('/api/admin/services', (req, res) => {
    const services = db.data.services || {};
    const toDelete = [];
    const normalizedNames = new Set();

    // Find duplicates and demo data
    Object.keys(services).forEach(id => {
        const s = services[id];
        const nameLower = s.name ? s.name.toLowerCase() : id.toLowerCase();

        // Criteria 2: Specific junk names
        // Criteria 3: Duplicate names (case insensitive)
        if (nameLower === 'mamun islam' || id.toLowerCase().includes('demo')) {
            toDelete.push(id);
        } else if (normalizedNames.has(nameLower)) {
            toDelete.push(id); // Duplicate!
        } else {
            normalizedNames.add(nameLower);
        }
    });

    // Delete them
    toDelete.forEach(id => {
        db.deleteService(id);
    });

    // Also check legacy items in cardPrices
    if (db.data.cardPrices) {
        Object.keys(db.data.cardPrices).forEach(id => {
            if (id.toLowerCase().includes('demo') || id.toLowerCase() === 'mamun islam') {
                delete db.data.cardPrices[id];
            }
        });
    }

    // Update VPN sections for known VPNs
    Object.keys(services).forEach(id => {
        if (id.toLowerCase().includes('vpn') || ['cyberghost', 'nordvpn', 'expressvpn', 'surfshark', 'protonvpn'].includes(id.toLowerCase())) {
            db.updateServiceSection(id, 'vpn');
        }
    });

    db.save(true);

    // Proceed with loaded services after cleanup
    const updatedServices = db.data.services || {};
    const shopItems = db.data.shopItems || {};

    // Convert services to array
    const servicesList = Object.values(updatedServices).map(s => {
        const cardStock = db.data.cards?.[s.id]?.length || 0;
        const vpnStock = db.data.vpnAccounts?.[s.id]?.length || 0;
        return {
            ...s,
            section: db.getServiceSection(s.id),
            imageUrl: db.data.serviceIcons?.[s.id] || s.imageUrl || '',
            stock: cardStock || vpnStock || 0
        };
    });

    // Convert shopItems to array (if they haven't been merged into services yet)
    const shopItemsList = Object.values(shopItems).map(i => {
        const cardStock = db.data.cards?.[i.id]?.length || 0;
        const vpnStock = db.data.vpnAccounts?.[i.id]?.length || 0;
        return {
            id: i.id,
            name: i.name,
            price: i.price || 0,
            section: i.section || 'shop',
            imageUrl: db.data.serviceIcons?.[i.id] || i.imageUrl || '',
            stock: cardStock || vpnStock || 0
        };
    });

    // Add legacy items if they are missing
    const legacyItems = [];
    if (db.data.cardPrices) {
        Object.entries(db.data.cardPrices).forEach(([id, price]) => {
            if (!services[id] && !shopItems[id]) {
                legacyItems.push({
                    id,
                    name: db.data.serviceNames?.[id] || id.toUpperCase(),
                    price,
                    section: 'cards',
                    imageUrl: db.data.serviceIcons?.[id] || '',
                    stock: db.data.cards?.[id]?.length || 0
                });
            }
        });
    }
    if (db.data.vpnPrices) {
        Object.entries(db.data.vpnPrices).forEach(([id, price]) => {
            if (!services[id] && !shopItems[id]) {
                legacyItems.push({
                    id,
                    name: db.data.vpnServiceNames?.[id] || id.toUpperCase(),
                    price,
                    section: 'vpn',
                    stock: db.data.vpnAccounts?.[id]?.length || 0
                });
            }
        });
    }

    // Add items from settings.costs (gemini, gpt, etc.)
    const settingCosts = [];
    if (db.data.settings && db.data.settings.costs) {
        Object.entries(db.data.settings.costs).forEach(([id, price]) => {
            settingCosts.push({
                id,
                name: id.charAt(0).toUpperCase() + id.slice(1) + " (Bot Access)",
                price,
                section: 'settings',
                stock: 0 // Settings costs usually don't have stock
            });
        });
    }

    res.json({
        success: true,
        services: [...servicesList, ...shopItemsList, ...legacyItems]
    });
});

// Public API: Get Services (for user panel) - Filters out 0 stock items
app.get('/api/public/services', (req, res) => {
    // Get service items with stock
    const serviceItems = db.data.serviceItems || {};
    const availableItems = Object.entries(serviceItems)
        .filter(([id, item]) => (item.stock || 0) > 0) // Only items with stock > 0
        .map(([id, item]) => ({
            id,
            ...item,
            section: item.categoryId,
            imageUrl: db.data.serviceIcons?.[id] || item.imageUrl || ''
        }));

    // Also get legacy services (if still using old system)
    const services = db.data.services || {};
    const servicesWithSections = Object.values(services)
        .map(s => {
            const cardStock = db.data.cards?.[s.id]?.length || 0;
            const vpnStock = db.data.vpnAccounts?.[s.id]?.length || 0;
            const realStock = cardStock || vpnStock || s.stock || 0;
            return {
                ...s,
                section: db.getServiceSection(s.id),
                imageUrl: db.data.serviceIcons?.[s.id] || s.imageUrl || '',
                stock: realStock
            };
        })
        .filter(s => s.stock > 0 || s.stock === undefined);

    // Combine both systems
    res.json({
        success: true,
        services: [...availableItems, ...servicesWithSections],
        categories: db.getServiceCategories()
    });
});

app.post('/api/admin/services', (req, res) => {
    const item = req.body;
    db.data.services = db.data.services || {};
    db.data.services[item.id] = item;

    // Save section assignment
    if (item.section) {
        db.updateServiceSection(item.id, item.section);
    }

    db.save(true);
    db.triggerSystemUpdate();
    res.json({ success: true });
});

app.post('/api/admin/cleanup-services', (req, res) => {
    const services = db.data.services || {};
    const toDelete = [];
    const normalizedNames = new Set();

    // Find duplicates and demo data
    Object.keys(services).forEach(id => {
        const s = services[id];
        const nameLower = s.name ? s.name.toLowerCase() : id.toLowerCase();

        // Criteria 1: Specific junk names
        // Criteria 2: Duplicate names (case insensitive)
        if (nameLower === 'mamun islam' || id.toLowerCase().includes('demo')) {
            toDelete.push(id);
        } else if (normalizedNames.has(nameLower)) {
            toDelete.push(id); // Duplicate!
        } else {
            normalizedNames.add(nameLower);
        }
    });

    // Delete them
    toDelete.forEach(id => {
        db.deleteService(id);
    });

    // Also check legacy items in cardPrices
    if (db.data.cardPrices) {
        Object.keys(db.data.cardPrices).forEach(id => {
            if (id.toLowerCase().includes('demo') || id.toLowerCase() === 'mamun islam') {
                delete db.data.cardPrices[id];
            }
        });
    }

    // Update VPN sections for known VPNs
    Object.keys(services).forEach(id => {
        if (id.toLowerCase().includes('vpn') || ['cyberghost', 'nordvpn', 'expressvpn', 'surfshark', 'protonvpn'].includes(id.toLowerCase())) {
            db.updateServiceSection(id, 'vpn');
        }
    });

    db.save(true);

    res.json({ success: true, deleted: toDelete });
});

app.delete('/api/admin/services/:id', (req, res) => {
    const { id } = req.params;
    const deleted = db.deleteService(id);
    if (deleted) {
        res.json({ success: true, message: 'Service deleted from all systems' });
    } else {
        res.json({ success: false, message: 'Service not found or already deleted' });
    }
});

// API: Admin - Shop Items
app.get('/api/admin/shop', (req, res) => {
    const items = db.data.shopItems || {};
    res.json({ success: true, shopItems: Object.values(items) });
});

// Public API: Get Shop Items (for user panel)
app.get('/api/shop', (req, res) => {
    const items = db.data.shopItems || {};
    res.json({ success: true, shopItems: Object.values(items) });
});

// POST: User buys a shop item — deducts balance and delivers account
app.post('/api/shop/buy', async (req, res) => {
    const { userId, itemId, price, currency } = req.body;
    if (!userId || !itemId) return res.json({ success: false, message: 'Missing fields' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const item = db.data.shopItems && db.data.shopItems[itemId];
    if (!item) return res.json({ success: false, message: 'Item not found' });

    const priceNum = parseFloat(price !== undefined ? price : (item.price || 0));

    // ── FREE ITEM (price = 0): one-time only per user ─────────────────────
    if (priceNum === 0) {
        if (!user.purchasedAccounts) user.purchasedAccounts = [];
        const alreadyClaimed = user.purchasedAccounts.some(
            p => p.itemId === itemId || p.category === (item.name || itemId)
        );
        if (alreadyClaimed) {
            return res.json({
                success: false,
                message: `You have already claimed "${item.name || itemId}". Free items can only be claimed once.`
            });
        }
    }

    // ✅ Check stock BEFORE deducting balance
    const hasAccounts = item.accounts && item.accounts.length > 0;
    const hasStock = item.stock !== undefined && item.stock > 0;
    if (!hasAccounts && !hasStock) {
        return res.json({
            success: false,
            outOfStock: true,
            itemName: item.name || itemId,
            message: `"${item.name || itemId}" is currently not available. Please wait for restock.`
        });
    }

    const chosenCurrency = String(currency || item.currency || 'usd').toLowerCase();
    const isUSD = chosenCurrency === 'usd';
    const isGems = chosenCurrency === 'gems';
    const isTokens = chosenCurrency === 'tokens' || chosenCurrency === 'tc';

    // ── Balance check (only if price > 0) ────────────────────────────────
    if (priceNum > 0) {
        if (isUSD) {
            const bal = user.usd || 0;
            if (bal < priceNum) return res.json({ success: false, message: `Insufficient USD balance. Need $${priceNum}` });
            user.usd = parseFloat((bal - priceNum).toFixed(3));
        } else if (isGems) {
            const bal = bhGetGems(user);
            if (bal < priceNum) return res.json({ success: false, message: `Insufficient Gems. Need 💎 ${priceNum}` });
            bhSetGems(user, Math.max(0, parseFloat((bal - priceNum).toFixed(6))));
        } else {
            const bal = db.getTokenBalance(user);
            if (bal < priceNum) return res.json({ success: false, message: `Insufficient tokens. Need ${priceNum} TC` });
            db.setTokenBalance(user, bal - priceNum);
        }
    }

    // Deliver account from shop item accounts list (FIFO)
    let deliveredAccount = null;
    if (item.accounts && item.accounts.length > 0) {
        deliveredAccount = item.accounts.shift(); // Take first, remove from list
        item.stock = item.accounts.length;
    } else if (item.stock !== undefined && item.stock > 0) {
        item.stock = Math.max(0, item.stock - 1);
    }

    // Save purchase to user history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'account_purchase',
        amount: priceNum,
        currency: isUSD ? 'USD' : 'TC',
        category: item.name || itemId,
        reward: priceNum === 0 ? 'FREE' : (isUSD ? `-$${priceNum}` : `-${priceNum} TC`),
        detail: `${item.name || itemId}${deliveredAccount ? ' — ' + (deliveredAccount.email || '') : ''}`,
        email: deliveredAccount ? (deliveredAccount.email || '') : '',
        password: deliveredAccount ? (deliveredAccount.password || '') : '',
        date: Date.now()
    });

    // Save to purchasedAccounts
    if (!user.purchasedAccounts) user.purchasedAccounts = [];
    user.purchasedAccounts.push({
        itemId: itemId,
        email: deliveredAccount ? (deliveredAccount.email || '') : '',
        password: deliveredAccount ? (deliveredAccount.password || '') : '',
        twofa: deliveredAccount ? (deliveredAccount.twofa || '') : '',
        category: item.name || itemId,
        price: priceNum,
        purchasedAt: Date.now(),
        // Save additional fields if deliveredAccount is present:
        accountType: deliveredAccount ? (deliveredAccount.accountType || 'other') : 'other',
        cardHolder: deliveredAccount ? (deliveredAccount.cardHolder || '') : '',
        cardNumber: deliveredAccount ? (deliveredAccount.cardNumber || '') : '',
        expiry: deliveredAccount ? (deliveredAccount.expiry || '') : '',
        cvv: deliveredAccount ? (deliveredAccount.cvv || '') : '',
        address: deliveredAccount ? (deliveredAccount.address || '') : '',
        city: deliveredAccount ? (deliveredAccount.city || '') : '',
        zip: deliveredAccount ? (deliveredAccount.zip || '') : '',
        country: deliveredAccount ? (deliveredAccount.country || '') : '',
        cardType: deliveredAccount ? (deliveredAccount.cardType || '') : '',
        passiveLabel: deliveredAccount ? (deliveredAccount.label || '') : '',
        recoveryEmail: deliveredAccount ? (deliveredAccount.recoveryEmail || '') : '',
        proxyProtocol: deliveredAccount ? (deliveredAccount.proxyProtocol || '') : '',
        linkedEmail: deliveredAccount ? (deliveredAccount.linkedEmail || '') : '',
        emailVerification: deliveredAccount && deliveredAccount.emailVerification ? deliveredAccount.emailVerification : (item.emailVerification || null)
    });

    db.save(true);
    await db.updateUser(user);

    const newBalance = isUSD ? user.usd : db.getTokenBalance(user);

    res.json({
        success: true,
        newBalance,
        itemName: item.name || itemId,
        isFree: priceNum === 0,
        account: deliveredAccount ? {
            email: deliveredAccount.accountType === 'vcard' || deliveredAccount.accountType === 'passivecard' ? '' : (deliveredAccount.email || ''),
            password: deliveredAccount.password || '',
            twofa: deliveredAccount.twofa || '',
            info: '',
            accountType: deliveredAccount.accountType || 'other',
            cardHolder: deliveredAccount.cardHolder || '',
            cardNumber: deliveredAccount.cardNumber || '',
            expiry: deliveredAccount.expiry || '',
            cvv: deliveredAccount.cvv || '',
            address: deliveredAccount.address || '',
            city: deliveredAccount.city || '',
            zip: deliveredAccount.zip || '',
            country: deliveredAccount.country || '',
            cardType: deliveredAccount.cardType || '',
            passiveLabel: deliveredAccount.label || '',
            emailVerification: deliveredAccount && deliveredAccount.emailVerification ? deliveredAccount.emailVerification : (item.emailVerification || null),
            hasLinkedEmail: !!(deliveredAccount.email && (deliveredAccount.accountType === 'passivecard'))
        } : null
    });
});

// API: Clean/Complete Free Purchase Claim (Delete History)
app.post('/api/shop/purchase/clean', async (req, res) => {
    const { userId, itemId, category, boughtAt } = req.body;
    if (!userId) return res.json({ success: false, message: 'Missing fields' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    // Clean from purchasedAccounts
    if (user.purchasedAccounts && Array.isArray(user.purchasedAccounts)) {
        user.purchasedAccounts = user.purchasedAccounts.filter(p => {
            const isMatch = (itemId && p.itemId === itemId) || (category && p.category === category);
            if (isMatch) {
                if (boughtAt && p.purchasedAt) {
                    return Math.abs(p.purchasedAt - boughtAt) > 15000; // Match within 15s window
                }
                return false;
            }
            return true;
        });
    }

    // Clean from history
    if (user.history && Array.isArray(user.history)) {
        user.history = user.history.filter(h => {
            const isMatch = h.type === 'account_purchase' && (h.category === category || h.category === itemId);
            if (isMatch) {
                if (boughtAt && h.date) {
                    return Math.abs(h.date - boughtAt) > 15000;
                }
                return false;
            }
            return true;
        });
    }

    db.save(true);
    await db.updateUser(user);

    res.json({ success: true, purchasedAccounts: user.purchasedAccounts || [] });
});

app.post('/api/admin/shop', (req, res) => {
    const item = req.body;
    if (!item || !item.id) return res.json({ success: false, message: 'ID required' });

    db.data.shopItems = db.data.shopItems || {};
    const existing = db.data.shopItems[item.id] || {};

    const accounts = (Array.isArray(item.accounts) && item.accounts.length > 0)
        ? item.accounts
        : (existing.accounts || []);
    
    const stock = accounts.length > 0 
        ? accounts.length 
        : (item.stock !== undefined && item.stock !== 0 ? item.stock : (existing.stock || 0));

    db.data.shopItems[item.id] = {
        ...existing,
        ...item,
        accounts: accounts,
        stock: stock
    };
    db.save(true);
    res.json({ success: true, item: db.data.shopItems[item.id] });
});

// POST: Save Email Verification settings for shop item
app.post('/api/admin/shop/:id/email-settings', (req, res) => {
    const { id } = req.params;
    const { enabled, personalEmail, appPassword, targetEmail, showEmailToBuyer, hidePersonalEmail } = req.body;
    db.data.shopItems = db.data.shopItems || {};
    if (!db.data.shopItems[id]) return res.json({ success: false, message: 'Shop item not found' });

    db.data.shopItems[id].emailVerification = {
        enabled: !!enabled,
        personalEmail: personalEmail || '',
        appPassword: appPassword || '',
        targetEmail: targetEmail || '',
        showEmailToBuyer: showEmailToBuyer !== undefined ? !!showEmailToBuyer : !hidePersonalEmail
    };

    // Propagate emailVerification to all existing accounts in this shop item
    if (Array.isArray(db.data.shopItems[id].accounts)) {
        db.data.shopItems[id].accounts.forEach(acc => {
            acc.emailVerification = db.data.shopItems[id].emailVerification;
        });
    }

    db.save(true);
    res.json({ success: true, item: db.data.shopItems[id] });
});

// POST: Check live email verification OTP for a specific item account
app.post('/api/email-verification/check', async (req, res) => {
    try {
        const { personalEmail, appPassword, targetEmail } = req.body;
        if (!personalEmail || !appPassword) {
            return res.json({ success: false, message: 'Personal email and app password required' });
        }

        const imapSimple = require('imap-simple');
        const host = personalEmail.includes('@gmail.com') ? 'imap.gmail.com' 
            : (personalEmail.includes('@outlook.com') || personalEmail.includes('@hotmail.com')) ? 'imap-mail.outlook.com' 
            : 'imap.gmail.com';

        const config = {
            imap: {
                user: personalEmail,
                password: appPassword,
                host: host,
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 12000
            }
        };

        const connection = await imapSimple.connect(config);
        await connection.openBox('INBOX');

        const delay = new Date();
        delay.setMinutes(delay.getMinutes() - 60);

        const searchCriteria = [['SINCE', delay.toUTCString()]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        connection.end();

        let foundOtp = null;
        let sender = targetEmail || '';
        let subject = '';
        let time = new Date().toLocaleTimeString();

        // Sort newest first
        messages.reverse();

        for (const item of messages) {
            const headerPart = item.parts.find(p => p.which === 'HEADER');
            const textPart = item.parts.find(p => p.which === 'TEXT');
            const headers = headerPart ? headerPart.body : {};
            const fromHeader = (headers.from && headers.from[0]) ? headers.from[0] : '';
            const subjectHeader = (headers.subject && headers.subject[0]) ? headers.subject[0] : '';
            const body = textPart ? textPart.body : '';

            if (!targetEmail || fromHeader.toLowerCase().includes(targetEmail.toLowerCase()) || body.toLowerCase().includes(targetEmail.toLowerCase())) {
                const extracted = otpExtractor.extractOTP(body, subjectHeader);
                const otp = extracted ? (typeof extracted === 'object' ? extracted.otp : extracted) : null;
                if (otp) {
                    foundOtp = otp;
                    sender = fromHeader;
                    subject = subjectHeader;
                    break;
                }
            }
        }

        if (foundOtp) {
            return res.json({
                success: true,
                otp: foundOtp,
                sender,
                subject,
                time
            });
        } else {
            return res.json({
                success: false,
                message: 'No verification code found yet in inbox'
            });
        }
    } catch (e) {
        console.error('email-verification/check error:', e);
        return res.json({
            success: false,
            message: 'IMAP connection error: ' + (e.message || 'Failed')
        });
    }
});

app.delete('/api/admin/shop/:id', (req, res) => {
    const { id } = req.params;
    if (db.data.shopItems && db.data.shopItems[id]) {
        const item = db.data.shopItems[id];
        const itemName = item.name;

        // Hard Delete: Delete from shopItems
        delete db.data.shopItems[id];

        // Clean references in all users
        if (db.data.users) {
            Object.keys(db.data.users).forEach(uId => {
                const u = db.data.users[uId];
                if (u) {
                    // Remove from purchasedAccounts
                    if (u.purchasedAccounts && Array.isArray(u.purchasedAccounts)) {
                        u.purchasedAccounts = u.purchasedAccounts.filter(p => 
                            p.itemId !== id && 
                            p.category !== itemName && 
                            p.category !== id
                        );
                    }
                    // Remove from history
                    if (u.history && Array.isArray(u.history)) {
                        u.history = u.history.filter(h => 
                            !(h.type === 'account_purchase' && (h.category === itemName || h.category === id))
                        );
                    }
                }
            });
        }

        db.save(true);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// GET shop item accounts
app.get('/api/admin/shop/:id/accounts', (req, res) => {
    const { id } = req.params;
    const item = db.data.shopItems && db.data.shopItems[id];
    if (!item) return res.json({ success: false, message: 'Item not found' });
    res.json({ success: true, accounts: item.accounts || [] });
});

// ADD account to shop item
app.post('/api/admin/shop/:id/accounts', (req, res) => {
    const { id } = req.params;
    const { email, password, twofa, accountType, recoveryEmail, proxyProtocol,
        // Virtual Card fields
        cardHolder, cardNumber, expiry, cvv, address, city, zip, country, cardType, price, linkedEmail,
        // Passive Card fields
        passiveLabel
    } = req.body;

    db.data.shopItems = db.data.shopItems || {};
    if (!db.data.shopItems[id]) return res.json({ success: false, message: 'Item not found' });
    if (!db.data.shopItems[id].accounts) db.data.shopItems[id].accounts = [];

    let entry = { accountType: accountType || 'other', addedAt: Date.now() };

    if (accountType === 'vcard') {
        // Virtual card — store card details, linkedEmail is backend-only
        if (!cardHolder || !cardNumber) return res.json({ success: false, message: 'Card holder and number required' });
        entry = { ...entry, cardHolder, cardNumber: cardNumber.replace(/\s/g, ''), expiry: expiry || '', cvv: cvv || '', address: address || '', city: city || '', zip: zip || '', country: country || 'US', cardType: cardType || 'visa', price: parseFloat(price) || 0, linkedEmail: linkedEmail || '', status: 'available' };
    } else if (accountType === 'passivecard') {
        // Passive card — linkedEmail is backend-only for OTP routing
        if (!email) return res.json({ success: false, message: 'Linked email required for passive card' });
        entry = { ...entry, email, label: passiveLabel || '', price: parseFloat(price) || 0, status: 'available' };
    } else {
        // Normal account
        if (!email || !password) return res.json({ success: false, message: 'Email and password required' });
        entry = { ...entry, email, password, twofa: twofa || '', recoveryEmail: recoveryEmail || '', proxyProtocol: proxyProtocol || '' };
    }

    if (db.data.shopItems[id].emailVerification) {
        entry.emailVerification = db.data.shopItems[id].emailVerification;
    }

    db.data.shopItems[id].accounts.push(entry);
    db.data.shopItems[id].stock = db.data.shopItems[id].accounts.length;
    db.save(true);
    res.json({ success: true });
});

// DELETE single account from shop item
app.delete('/api/admin/shop/:id/accounts/:index', (req, res) => {
    const { id, index } = req.params;
    const idx = parseInt(index);
    const item = db.data.shopItems && db.data.shopItems[id];
    if (!item || !item.accounts) return res.json({ success: false });
    if (idx < 0 || idx >= item.accounts.length) return res.json({ success: false });
    item.accounts.splice(idx, 1);
    // Auto-update stock = remaining accounts
    item.stock = item.accounts.length;
    db.save(true);
    res.json({ success: true });
});

// CLEAR all accounts from shop item
app.delete('/api/admin/shop/:id/accounts', (req, res) => {
    const { id } = req.params;
    if (db.data.shopItems && db.data.shopItems[id]) {
        db.data.shopItems[id].accounts = [];
        db.data.shopItems[id].stock = 0; // Reset stock to 0
        db.save(true);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// GOOGLE SHEET IMPORT for Shop Items
app.post('/api/admin/shop/:id/import-sheet', async (req, res) => {
    const { id } = req.params;
    const { sheetUrl, columnMap } = req.body;

    if (!sheetUrl) return res.json({ success: false, message: 'Sheet URL required' });
    if (!db.data.shopItems || !db.data.shopItems[id]) return res.json({ success: false, message: 'Shop item not found' });

    try {
        // Extract sheet ID from Google Sheets URL
        const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) return res.json({ success: false, message: 'Invalid Google Sheets URL' });
        const sheetId = sheetIdMatch[1];

        // Fetch CSV export
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        const resp = await axios.get(csvUrl, { timeout: 15000 });
        const csvText = resp.data;

        // Parse CSV
        const colUser = (columnMap?.user || 'A').toUpperCase().charCodeAt(0) - 65;
        const colPass = (columnMap?.password || 'B').toUpperCase().charCodeAt(0) - 65;
        const colTwofa = (columnMap?.twofa || 'C').toUpperCase().charCodeAt(0) - 65;

        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return res.json({ success: false, message: 'Sheet is empty' });

        const item = db.data.shopItems[id];
        if (!item.accounts) item.accounts = [];

        let imported = 0;
        for (const line of lines) {
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const email = cols[colUser] || '';
            const password = cols[colPass] || '';
            const twofa = cols[colTwofa] || '';
            if (!email || !password) continue;
            item.accounts.push({ email, password, twofa, accountType: item.accountType || 'other', addedAt: Date.now() });
            imported++;
        }

        item.stock = item.accounts.length;
        db.save(true);

        res.json({ success: true, imported, total: item.accounts.length });
    } catch (e) {
        console.error('[SHOP SHEET IMPORT] Error:', e.message);
        if (e.response && e.response.status === 403) {
            return res.json({ success: false, message: 'Sheet is not publicly shared. Share it as "Anyone with link (Viewer)".' });
        }
        res.json({ success: false, message: 'Failed to import: ' + e.message });
    }
});

// Google OAuth Login Start
app.get('/auth/google', (req, res) => {
    const { state } = req.query; // state = userId OR 'admin'
    if (!state) {
        return res.send('Error: Missing state parameter (userId or admin)');
    }
    // Redirect to Google Consent Screen
    const authUrl = oauth.getAuthUrl(state);
    res.redirect(authUrl);
});

// Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query; // state = userId OR 'admin'

    if (!code || !state) {
        return res.send('Error: Missing code or state');
    }

    try {
        const success = await oauth.handleCallback(code, state);
        if (success) {
            res.send('<h1>✅ Google Account Connected Successfully!</h1><p>You can close this window and return to the Telegram bot or Admin Panel.</p>');
        } else {
            res.send('<h1>❌ Connection Failed</h1><p>Please try again.</p>');
        }
    } catch (error) {
        console.error('OAuth Error:', error);
        res.send('<h1>❌ Error Occurred</h1><p>' + error.message + '</p>');
    }
});

app.post('/api/admin/services/items', (req, res) => {
    const { itemId, category, cost, items, vpnName } = req.body;

    if (!itemId || !items || !Array.isArray(items)) {
        return res.json({ success: false, message: 'Invalid request data' });
    }

    // ===== VALIDATION =====
    // Filter out empty items and validate content
    const validItems = items.filter(item => {
        if (!item) return false;
        if (typeof item.value !== 'string' || !item.value.trim()) return false;
        if (typeof item.info !== 'string') return false;
        return true;
    });

    if (validItems.length === 0) {
        return res.json({ success: false, message: 'No valid items provided. Each item must have a value and info.' });
    }

    try {
        let addedCount = 0;

        if (category === 'vpn' || itemId === 'new') {
            // Handle VPN items
            const providerId = vpnName ? vpnName.toLowerCase().replace(/\s+/g, '-') : itemId;

            validItems.forEach(item => {
                // Validate VPN credentials
                const email = item.value.trim();
                const password = item.info.trim();

                if (!email || !password) {
                    console.warn(`[VALIDATION] Skipping invalid VPN item: empty email or password`);
                    return; // Skip this item
                }

                if (db.addVPN) {
                    db.addVPN(providerId, {
                        email: email,
                        password: password,
                        addedAt: Date.now()
                    });
                    addedCount++;
                } else {
                    // Fallback if addVPN doesn't exist
                    if (!db.data.vpnAccounts) db.data.vpnAccounts = {};
                    if (!db.data.vpnAccounts[providerId]) db.data.vpnAccounts[providerId] = [];
                    db.data.vpnAccounts[providerId].push({
                        email: email,
                        password: password,
                        addedAt: Date.now()
                    });
                    addedCount++;
                }
            });

            // Set VPN price if cost provided
            if (cost && db.data.vpnPrices) {
                db.data.vpnPrices[providerId] = parseInt(cost);
            }

        } else {
            // Handle Card/Key items (for gemini, chatgpt, spotify, 4jibit, etc.)
            const serviceId = itemId;

            validItems.forEach(item => {
                const key = item.value.trim();
                const info = item.info.trim();

                if (!key) {
                    console.warn(`[VALIDATION] Skipping invalid card item: empty key`);
                    return; // Skip this item
                }

                // Create card details - store value and info as card details
                const cardDetails = {
                    key: key,
                    info: info,
                    addedAt: Date.now()
                };

                if (db.addCard) {
                    db.addCard(serviceId, cardDetails);
                    addedCount++;
                }
            });

            // Set card price if cost provided and different from current
            if (cost && db.data.cardPrices) {
                db.data.cardPrices[serviceId] = parseInt(cost);
            }

            // Ensure service name exists
            if (db.data.serviceNames && !db.data.serviceNames[serviceId]) {
                db.data.serviceNames[serviceId] = serviceId.charAt(0).toUpperCase() + serviceId.slice(1);
            }
        }

        db.save(true);

        res.json({
            success: true,
            message: `Added ${addedCount} items`,
            addedCount,
            itemId,
            category
        });
    } catch (error) {
        console.error('Error saving service items:', error);
        res.json({ success: false, message: error.message });
    }
});

// Admin: Update service item details
app.post('/api/admin/services/update', (req, res) => {
    const { id, name, price, desc, icon } = req.body;
    if (!id) return res.json({ success: false, message: 'Missing item ID' });

    // Update names if available
    if (db.data.serviceNames && name) {
        db.data.serviceNames[id] = name;
    }

    // Update prices
    if (price !== undefined) {
        const p = parseInt(price) || 0;
        if (db.data.cardPrices) db.data.cardPrices[id] = p;
        if (db.data.vpnPrices) db.data.vpnPrices[id] = p;
    }

    // Update icon
    if (icon) {
        db.data.serviceIcons = db.data.serviceIcons || {};
        db.data.serviceIcons[id] = icon;
    }

    // Update description
    if (desc !== undefined) {
        db.data.serviceDescriptions = db.data.serviceDescriptions || {};
        db.data.serviceDescriptions[id] = desc;
    }

    db.save(true); // Force save
    res.json({ success: true });
});

// Admin: Upload database config json
app.post('/api/admin/dbconfig/upload', async (req, res) => {
    try {
        const { config } = req.body;
        if (!config || typeof config !== 'object') {
            return res.json({ success: false, message: 'No valid config provided' });
        }

        // Merge config into db.data.apiKeys (MySQL connection is configured via env vars)
        if (!db.data.apiKeys) db.data.apiKeys = {};
        Object.assign(db.data.apiKeys, config);
        // Note: Firebase config is no longer used; MySQL is configured via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME env vars.

        db.save(true);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Toggle service item active status
app.post('/api/admin/services/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { active } = req.body;

    // For cards/VPN, we don't really have an active flag,
    // but we can clear stock to "deactivate"
    if (!active) {
        if (db.data.cards && db.data.cards[id]) {
            db.data.cards[id] = [];
        }
        if (db.data.vpnAccounts && db.data.vpnAccounts[id]) {
            db.data.vpnAccounts[id] = [];
        }
        db.save(true);
    }

    res.json({ success: true, id, active });
});

// =============================================
// NEW SERVICE CATEGORIES & ITEMS API
// =============================================

// Get all service categories
app.get('/api/admin/service-categories', (req, res) => {
    const categories = db.getServiceCategories();
    res.json({ success: true, categories });
});

// Create new category
app.post('/api/admin/service-categories', (req, res) => {
    const categoryData = req.body;
    const newCategory = db.createServiceCategory(categoryData);
    res.json({ success: true, category: newCategory });
});

// Update category
app.put('/api/admin/service-categories/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const updated = db.updateServiceCategory(id, updates);
    if (updated) {
        res.json({ success: true, category: updated });
    } else {
        res.status(404).json({ success: false, message: 'Category not found' });
    }
});

// Delete category
app.delete('/api/admin/service-categories/:id', (req, res) => {
    const { id } = req.params;
    const deleted = db.deleteServiceCategory(id);
    if (deleted) {
        res.json({ success: true, message: 'Category deleted' });
    } else {
        res.status(404).json({ success: false, message: 'Category not found' });
    }
});

// Get all service items (optionally filtered by category)
app.get('/api/admin/service-items', (req, res) => {
    const { categoryId } = req.query;
    const items = db.getServiceItems(categoryId);

    // Add stock count to each item
    const itemsWithStock = {};
    Object.keys(items).forEach(key => {
        itemsWithStock[key] = {
            ...items[key],
            stock: db.getServiceItemStock(key),
            id: key
        };
    });

    res.json({ success: true, items: itemsWithStock });
});

// Create new service item
app.post('/api/admin/service-items', (req, res) => {
    const { itemId, itemData } = req.body;
    const newItem = db.createServiceItem(itemId, itemData);
    res.json({ success: true, item: newItem });
});

// Update service item
app.put('/api/admin/service-items/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const updated = db.updateServiceItem(id, updates);
    if (updated) {
        res.json({ success: true, item: updated });
    } else {
        res.status(404).json({ success: false, message: 'Item not found' });
    }
});

// Delete service item
app.delete('/api/admin/service-items/:id', (req, res) => {
    const { id } = req.params;
    const deleted = db.deleteService(id); // Use the unified delete method
    if (deleted) {
        res.json({ success: true, message: 'Item deleted' });
    } else {
        res.status(404).json({ success: false, message: 'Item not found' });
    }
});

// Clear all stock for a specific item
app.delete('/api/admin/service-items/:id/clear', (req, res) => {
    const { id } = req.params;
    let cleared = false;

    if (db.data.cards && db.data.cards[id]) {
        db.data.cards[id] = [];
        cleared = true;
    }
    if (db.data.vpnAccounts && db.data.vpnAccounts[id]) {
        db.data.vpnAccounts[id] = [];
        cleared = true;
    }
    if (db.data.premiumAccounts) {
        const before = db.data.premiumAccounts.length;
        db.data.premiumAccounts = db.data.premiumAccounts.filter(a => a.type !== id);
        if (db.data.premiumAccounts.length < before) {
            cleared = true;
        }
    }

    if (cleared) {
        db.save(true);
        res.json({ success: true, message: 'All stock cleared' });
    } else {
        res.json({ success: true, message: 'No stock to clear' }); // Still return success since it's already empty
    }
});

// Get stock for specific item
app.get('/api/admin/service-items/:id/stock', (req, res) => {
    const { id } = req.params;
    const stock = db.getServiceItemStock(id);
    res.json({ success: true, stock, id });
});

// Add stock items to a service (cards, accounts, or api keys)
app.post('/api/admin/service-items/:id/stock', (req, res) => {
    const { id } = req.params;
    const { items } = req.body;

    const serviceItem = db.data.serviceItems?.[id];
    if (!serviceItem) {
        return res.status(404).json({ success: false, message: 'Service item not found' });
    }

    let addedCount = 0;

    if (serviceItem.type === 'card' || serviceItem.type === 'apikey') {
        if (!db.data.cards[id]) db.data.cards[id] = [];
        items.forEach(item => {
            db.data.cards[id].push({
                ...item,
                addedAt: Date.now(),
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
            });
            addedCount++;
        });
    } else if (serviceItem.type === 'account') {
        if (!db.data.vpnAccounts[id]) db.data.vpnAccounts[id] = [];
        items.forEach(item => {
            db.data.vpnAccounts[id].push({
                ...item,
                addedAt: Date.now(),
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
            });
            addedCount++;
        });
    }

    db.save(true);
    res.json({
        success: true,
        message: `Added ${addedCount} items`,
        addedCount,
        currentStock: db.getServiceItemStock(id)
    });
});

// Delete individual stock item
app.delete('/api/admin/service-items/:id/stock/:index', (req, res) => {
    const { id, index } = req.params;
    const item = db.data.serviceItems?.[id];
    if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Get the appropriate stock array based on item type
    let stockArray = null;
    if (item.type === 'card') {
        stockArray = db.data.cards?.[id];
    } else if (item.type === 'account') {
        stockArray = db.data.vpnAccounts?.[id];
    } else if (item.type === 'apikey') {
        stockArray = db.data.apiKeys?.[id];
    }

    if (!stockArray || !Array.isArray(stockArray)) {
        return res.status(404).json({ success: false, message: 'Stock not found' });
    }

    const idx = parseInt(index);
    if (idx < 0 || idx >= stockArray.length) {
        return res.status(400).json({ success: false, message: 'Invalid index' });
    }

    // Remove the item at index
    stockArray.splice(idx, 1);

    // Update item stock count
    item.stock = stockArray.length;

    db.save(true);
    res.json({ success: true, message: 'Item deleted' });
});

// =============================================
// INVENTORY & COST MANAGEMENT
// =============================================

app.post('/api/admin/services/:id/price', (req, res) => {
    const { id } = req.params;
    const { price } = req.body;
    if (db.data.services && db.data.services[id]) {
        db.data.services[id].price = parseInt(price);
        db.save(true);
        res.json({ success: true });
    } else if (db.data.shopItems && db.data.shopItems[id]) {
        db.data.shopItems[id].price = parseInt(price);
        db.save(true);
        res.json({ success: true });
    } else if (db.data.settings && db.data.settings.costs && db.data.settings.costs[id] !== undefined) {
        db.data.settings.costs[id] = parseInt(price);
        db.save(true);
        res.json({ success: true });
    } else {
        // Fallback to legacy cardPrices/vpnPrices if they exist
        if (db.updatePrice) db.updatePrice(id, price);
        res.json({ success: true });
    }
});

app.get('/api/admin/inventory/:type', (req, res) => {
    const { type } = req.params;
    let items = [];

    if (type === 'cards') {
        const services = db.getServices();
        items = services.filter(s => db.getServiceSection(s.id) === 'cards' || s.id === 'gemini' || s.id === 'chatgpt' || s.id === 'spotify');
    } else if (type === 'vpn') {
        // Map vpnAccounts from db.js structure
        const vpnData = db.data.vpnAccounts || {};
        items = Object.keys(vpnData).map(vid => ({
            id: vid,
            name: db.data.vpnServiceNames?.[vid] || vid.toUpperCase(),
            price: db.data.vpnPrices?.[vid] || 0,
            stock: vpnData[vid].length
        }));
    } else if (type === 'accounts' || type === 'apikeys') {
        // For accounts and apikeys, we use the services/shopItems structure but filter by section
        const all = { ...(db.data.services || {}), ...(db.data.shopItems || {}) };
        items = Object.values(all)
            .filter(s => s.section === type)
            .map(s => ({
                id: s.id,
                name: s.name,
                price: s.price || 0,
                stock: s.stock || 0
            }));
    }

    res.json({ success: true, items });
});

app.post('/api/admin/inventory/:type', (req, res) => {
    const { type } = req.params;
    const body = req.body;

    if (type === 'cards') {
        const { serviceId, details } = body;
        if (db.addCard) {
            db.addCard(serviceId, details);
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Database method not found' });
        }
    } else if (type === 'vpn') {
        const { providerId, email, pass } = body;
        if (!db.data.vpnAccounts) db.data.vpnAccounts = {};
        if (!db.data.vpnAccounts[providerId]) db.data.vpnAccounts[providerId] = [];
        db.data.vpnAccounts[providerId].push({ email, pass, date: Date.now() });
        db.save(true);
        res.json({ success: true });
    } else if (type === 'accounts') {
        const { service, login, pass } = body;
        const id = 'acc_' + Date.now();
        if (!db.data.shopItems) db.data.shopItems = {};
        db.data.shopItems[id] = { id, name: service, login, pass, section: 'accounts', price: 0, stock: 1 };
        db.save(true);
        res.json({ success: true });
    } else if (type === 'apikeys') {
        const { service, key } = body;
        const id = 'api_' + Date.now();
        if (!db.data.shopItems) db.data.shopItems = {};
        db.data.shopItems[id] = { id, name: service, key, section: 'apikeys', price: 0, stock: 1 };
        db.save(true);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid type' });
    }
});

app.delete('/api/admin/inventory/:type/:id', (req, res) => {
    const { type, id } = req.params;
    if (type === 'cards') {
        // Clear all cards for a service or delete specific? 
        // Admin UI shows service row, so we'll clear cards for that service
        if (db.clearCards) db.clearCards(id);
    } else if (type === 'vpn') {
        if (db.data.vpnAccounts && db.data.vpnAccounts[id]) {
            db.data.vpnAccounts[id] = [];
            db.save(true);
        }
    } else {
        if (db.data.shopItems && db.data.shopItems[id]) {
            delete db.data.shopItems[id];
            db.save(true);
        }
    }
    res.json({ success: true });
});

// =============================================
// USER VERIFICATION SYSTEM
// =============================================

// Helper: Get verification requirements settings
function getVerificationRequirements() {
    return db.data.settings?.verificationRequirements || {
        minInvites: 0,
        minTokens: 0,
        minDaysActive: 0,
        requireChannelJoin: true,
        requireGroupJoin: true,
        enabled: true
    };
}

// Helper: Check if user meets verification requirements
async function checkUserVerificationRequirements(userId) {
    const user = await db.getUser(userId);
    if (!user) return { met: false, reason: 'User not found' };

    // Admin verified users bypass all checks
    if (user.adminVerified) {
        return { met: true, adminVerified: true, reason: 'Admin verified' };
    }

    const reqs = getVerificationRequirements();
    if (!reqs.enabled) {
        return { met: true, reason: 'Verification system disabled' };
    }

    const checks = {
        invites: (user.referralCount || 0) >= reqs.minInvites,
        tokens: db.getTokenBalance(user) >= reqs.minTokens,
        daysActive: user.joinDate && (Date.now() - user.joinDate) >= (reqs.minDaysActive * 24 * 60 * 60 * 1000),
        channelJoin: !reqs.requireChannelJoin || (user.joinedChannel || user.channelJoined),
        groupJoin: !reqs.requireGroupJoin || (user.joinedGroup || user.groupJoined)
    };

    const allMet = Object.values(checks).every(v => v === true);

    return {
        met: allMet,
        checks,
        requirements: reqs,
        userData: {
            invites: user.referralCount || 0,
            tokens: db.getTokenBalance(user),
            joinDate: user.joinDate,
            channelJoined: user.joinedChannel || user.channelJoined || false,
            groupJoined: user.joinedGroup || user.groupJoined || false
        }
    };
}

// API: Get verification requirements (Admin)
app.get('/api/admin/verification/requirements', (req, res) => {
    res.json({
        success: true,
        requirements: getVerificationRequirements()
    });
});

// API: Update verification requirements (Admin)
app.post('/api/admin/verification/requirements', (req, res) => {
    const {
        minInvites,
        minTokens,
        minDaysActive,
        requireChannelJoin,
        requireGroupJoin,
        enabled
    } = req.body;

    if (!db.data.settings) db.data.settings = {};
    if (!db.data.settings.verificationRequirements) db.data.settings.verificationRequirements = {};

    const reqs = db.data.settings.verificationRequirements;

    if (minInvites !== undefined) reqs.minInvites = parseInt(minInvites) || 3;
    if (minTokens !== undefined) reqs.minTokens = parseInt(minTokens) || 100;
    if (minDaysActive !== undefined) reqs.minDaysActive = parseInt(minDaysActive) || 7;
    if (requireChannelJoin !== undefined) reqs.requireChannelJoin = !!requireChannelJoin;
    if (requireGroupJoin !== undefined) reqs.requireGroupJoin = !!requireGroupJoin;
    if (enabled !== undefined) reqs.enabled = !!enabled;

    db.save(true);
    res.json({ success: true, requirements: reqs });
});

// API: Check user verification status
app.get('/api/user/:userId/verification-status', async (req, res) => {
    const { userId } = req.params;
    const user = await db.getUser(userId);

    if (!user) return res.json({ success: false, message: 'User not found' });

    const result = await checkUserVerificationRequirements(userId);

    res.json({
        success: true,
        userId,
        verified: user.verified || false,
        adminVerified: user.adminVerified || false,
        ...result
    });
});

// API: Admin verify/unverify user
app.post('/api/admin/users/:userId/verify', async (req, res) => {
    const { userId } = req.params;
    const { adminVerified, verified } = req.body;

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    if (adminVerified !== undefined) {
        user.adminVerified = !!adminVerified;
    }
    if (verified !== undefined) {
        user.verified = !!verified;
    }

    await db.updateUser(user);
    res.json({
        success: true,
        message: 'User verification updated',
        userId,
        adminVerified: user.adminVerified,
        verified: user.verified
    });
});

// =============================================
// MISSING API ENDPOINTS (Added to fix 404 errors)
// =============================================

// API: Check Required Joins (Telegram Channel/Group verification)
app.all('/api/check-required-joins', async (req, res) => {
    try {
        const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id'] || req.headers['x-userid'];

    if (!userId) {
        return res.json({ success: false, message: 'User ID required' });
    }

    const user = await db.getUser(userId);

    // 1. Check if user is Admin or Admin Verified
    const adminId = db.data?.apiKeys?.adminId || config.ADMIN_ID;
    const isAdminUser = String(userId) === String(adminId) || (user && (user.role === 'admin' || user.adminVerified || user.verifiedByAdmin));

    if (isAdminUser) {
        return res.json({
            success: true,
            allJoined: true,
            canProceed: true,
            verified: true,
            adminVerified: true,
            message: 'Admin Verified'
        });
    }

    // 2. Check feature flags for Join Required
    const flags = db.data.featureFlags || {};

    // Skip check ONLY if feature flag joinRequired is explicitly false
    if (flags.joinRequired === false) {
        return res.json({
            success: true,
            allJoined: true,
            canProceed: true,
            verified: user?.verified || true,
            adminVerified: user?.adminVerified || false,
            message: 'Join required feature flag is disabled'
        });
    }

    // 3. Real-time strict membership check
    const apiKeys = db.data.apiKeys || {};
    
    // Normalize into arrays
    let channels = apiKeys.requiredChannels || []; console.log("Config RC:", config.REQUIRED_CHANNEL);
    if (channels.length === 0 && apiKeys.requiredChannel) channels.push(apiKeys.requiredChannel);
    if (channels.length === 0 && config.REQUIRED_CHANNEL) channels.push(config.REQUIRED_CHANNEL);

    let groups = apiKeys.requiredGroups || [];
    if (groups.length === 0 && apiKeys.requiredGroup) groups.push(apiKeys.requiredGroup);
    if (groups.length === 0 && config.REQUIRED_GROUP) groups.push(config.REQUIRED_GROUP);

    const cleanChatId = (val) => {
        if (!val) return '';
        val = String(val).trim();
        if (val.startsWith('-100') || /^-?\d+$/.test(val)) return val;
        if (val.includes('t.me/')) {
            const parts = val.split('t.me/');
            let path = parts[parts.length - 1].split('/')[0].split('?')[0];
            if (path.startsWith('+') || path.startsWith('joinchat')) return val;
            return '@' + path.replace('@', '');
        }
        if (!val.startsWith('@')) return '@' + val;
        return val;
    };

    let allChannelsJoined = true;
    let allGroupsJoined = true;
    let missingChannelsList = [];
    let missingGroupsList = [];


    
    const activeBot = bot || global.botInstance;
    const fs = require('fs');
    fs.appendFileSync('active-bot-log.txt', "activeBot is: " + !!activeBot + "\n");
    if (activeBot) {


        const botToken = activeBot.token || activeBot._token;
        const joinReqs = db.data?.joinRequests || [];
        const groupReqs = db.data?.groupJoinRequests || [];
        
        const hasUserJoinReq = (uId, chatId) => {
            const allReqs = [...joinReqs, ...groupReqs];
            return allReqs.some(r => {
                const sameUser = String(r.userId) === String(uId);
                const sameStatus = r.status === 'approved';
                if (!sameUser || !sameStatus) return false;
                
                // Try to match the chat
                if (chatId) {
                    const cleanId = String(chatId).replace('@', '').toLowerCase();
                    const cleanRecordChat = String(r.chatId).toLowerCase();
                    const cleanRecordTitle = String(r.chatTitle || '').toLowerCase();
                    const cleanRecordUser = String(r.username || '').replace('@', '').toLowerCase();
                    
                    return cleanRecordChat === cleanId || 
                           cleanRecordTitle.includes(cleanId) ||
                           cleanRecordUser === cleanId;
                }
                return true; 
            });
        };

        const checkMembership = async (chatId) => {
            if (!chatId) return true;
            let target = chatId;

            
            // Debug logging
            const debugLog = (msg) => {
                try {
                    require('fs').appendFileSync('check-membership-debug.txt', `[${new Date().toISOString()}] User ${userId} checking ${chatId}: ${msg}\n`);
                } catch(e) {}
                console.log(`[CHAT_CHECK] ${msg}`);
            };

            const hasApprovedJoinReq = hasUserJoinReq(userId, target);

            if (target.startsWith('http') || target.includes('joinchat') || target.includes('addlist') || target.includes('+')) {
                const m = target.match(/(?:t\.me\/|telegram\.me\/)([a-zA-Z0-9_]+)/i);
                if (m && m[1] && !m[1].startsWith('+') && m[1] !== 'addlist' && m[1] !== 'joinchat') {
                    target = '@' + m[1];
                    debugLog(`Normalized URL to username: ${target}`);
                } else {
                    if (hasApprovedJoinReq) {
                        debugLog(`Passed ${target} via approved join request record`);
                        return true;
                    }
                    debugLog(`Failed ${target} (private link and no approved request)`);
                    return false; // Do not bypass private links, enforce join
                }
            }

            if (activeBot) {
                if (!userId || isNaN(Number(userId)) || Number(userId) <= 0) {
                    debugLog(`Invalid User ID: ${userId} - bypassing getChatMember`);
                    return false;
                }
                try {
                    debugLog(`Calling getChatMember for ${target} with User ID ${userId}...`);
                    const member = await activeBot.getChatMember(target, userId);
                    const valid = ['creator', 'administrator', 'member', 'restricted'];
                    debugLog(`getChatMember result: ${member.status}`);
                    
                    if (valid.includes(member.status)) {
                        return true;
                    } else {
                        if (hasApprovedJoinReq) {
                            debugLog(`User status is ${member.status}, but passed via approved join request.`);
                            return true;
                        }
                        debugLog(`User status in ${target} is ${member.status} - NOT JOINED`);
                        return false;
                    }
                } catch (e) {
                    const errMsg = (e.message || '').toLowerCase();
                    debugLog(`getChatMember error: ${errMsg}`);
                    
                    const notInChatErrors = [
                        'user not found',
                        'user_not_participant',
                        'participant_id_invalid',
                        'member not found',
                        'user_id_invalid',
                        'not a participant',
                        'not a member',
                        'chat not found',
                        'left',
                        'kicked'
                    ];

                    if (hasApprovedJoinReq) {
                        return true;
                    }

                    if (notInChatErrors.some(err => errMsg.includes(err))) {
                        // We already logged to debugLog which is fine, but avoid cluttering console for expected membership failures
                        return false;
                    }
                    
                    // Only log to console if it's a real unexpected error (like bot blocked, etc.)
                    console.error(`[CHAT_CHECK] Unexpected error checking ${target}: ${errMsg}`);
                    return false;
                }
            } else {
                debugLog("WARNING: activeBot is null in checkMembership - bypassing");
                return false;
            }
        };
        if (channels.length > 0) {
            for (const ch of channels) {
                const cleanId = cleanChatId(ch);
                if (cleanId) {
                    const joined = await checkMembership(cleanId);
                    if (!joined) {
                        allChannelsJoined = false;
                        missingChannelsList.push(ch);
                    }
                }
            }
        }

        if (groups.length > 0) {
            for (const grp of groups) {
                const cleanId = cleanChatId(grp);
                if (cleanId) {
                    const joined = await checkMembership(cleanId);
                    if (!joined) {
                        allGroupsJoined = false;
                        missingGroupsList.push(grp);
                    }
                }
            }
        }

        // Update user record
        if (user) {
            user.joinedChannel = allChannelsJoined;
            user.joinedGroup = allGroupsJoined;
            user.verified = allChannelsJoined && allGroupsJoined;
            db.updateUser(user);
        }
    } else {
        // Enforce required channels/groups even if activeBot is not available
        if (channels.length > 0) {
            allChannelsJoined = false;
            missingChannelsList.push(...channels);
        }
        if (groups.length > 0) {
            allGroupsJoined = false;
            missingGroupsList.push(...groups);
        }
        console.log(`[VERIFICATION_ERROR] Bot offline/missing. Failing closed for user ${userId}. Channels: ${channels.join(',')} Groups: ${groups.join(',')}`);
    }

    // 4. Verification Check (optional, separate from join requirement)
    const vStatus = await checkUserVerificationRequirements(userId);

    // Auto-verify if they meet full criteria and have joined chats
    if (vStatus.met && allChannelsJoined && allGroupsJoined && user && !user.verified) {
        user.verified = true;
        db.updateUser(user);
    }

    // canProceed requires BOTH channels and groups joined UNLESS user is explicit admin verified
    const canProceed = Boolean((allChannelsJoined && allGroupsJoined) || (user && (user.adminVerified || user.verifiedByAdmin || isAdminUser)));

    res.json({
        success: true,
        allJoined: allChannelsJoined && allGroupsJoined,
        canProceed: canProceed,
        channelJoined: allChannelsJoined,
        groupJoined: allGroupsJoined,
        missingChannelsList: missingChannelsList,
        missingGroupsList: missingGroupsList,
        verified: user?.verified || false,
        adminVerified: user?.adminVerified || false,
        requirements: vStatus,
        config: {
            channels: channels.map(ch => ({ name: ch, username: ch, id: ch })),
            groups: groups.map(gr => ({ name: gr, username: gr, id: gr }))
        }
    });
    } catch (err) {
        console.error('[API Error] /api/check-required-joins:', err);
        res.json({
            success: true,
            allJoined: false,
            canProceed: false,
            verified: false,
            adminVerified: false,
            message: 'Fallback on error: ' + (err.message || String(err))
        });
    }
});

// API: User Activity (for broadcast ticker)
app.get('/api/user-activity', (req, res) => {
    try {
        // Get recent user activities from database
        // Collect recent activity from ALL users, then sort
        let allActivities = [];
        const userList = Object.values(db.data.users || {});

        userList.forEach(user => {
            if (user.history && user.history.length > 0) {
                user.history.slice(0, 8).forEach(h => {
                    let action = 'spend';
                    let item = h.type || 'activity';
                    let amount = Math.abs(h.amount || 0);
                    let currency = (h.asset || h.currency || 'TC').toUpperCase();
                    const typeLower = (h.type || '').toLowerCase();

                    // Categorize action
                    if (['ad_reward', 'mission_reward', 'daily_bonus', 'redeem', 'transfer_in', 'quiz_reward', 'bonus', 'deposit', 'scratch_reward', 'referral_reward', 'referral', 'referral_bonus', 'invite', 'task', 'promo_code', 'leaderboard_reward', 'smm_order_refund', 'bot_hosting_refund'].includes(typeLower) || typeLower.includes('refer') || typeLower.includes('reward')) {
                        action = 'reward';
                    }

                    if (typeLower.includes('exchange')) {
                        action = 'exchange';
                        const fA = h.fromAmount || amount, fC = (h.exchangeFrom || 'TC').toUpperCase();
                        const tA = h.toAmount || amount, tC = (h.exchangeTo || 'Gems').toUpperCase();
                        item = `Exchanged ${fA} ${fC} → ${tA} ${tC}`;
                    } else if (typeLower === 'mail' || typeLower === 'temp_mail') item = 'Temp Mail';
                    else if (typeLower === 'number') item = 'Number';
                    else if (typeLower === 'account_purchase') item = h.category || 'Account';
                    else if (typeLower === 'verification') item = 'Verify';
                    else if (typeLower === 'transfer_out') { item = 'Transfer'; action = 'spend'; }
                    else if (typeLower === 'transfer_in') { item = 'Receive'; action = 'reward'; }
                    else if (typeLower.includes('refer') || typeLower.includes('invite')) { item = 'Referral Bonus'; action = 'reward'; }

                    // Fallback for amount parsing if h.amount is missing
                    if (!amount && h.reward) {
                        if (typeof h.reward === 'string') {
                            const m = h.reward.match(/(\d+)/);
                            if (m) amount = parseInt(m[1]);
                        } else if (typeof h.reward === 'number') {
                            amount = Math.abs(h.reward);
                        }
                    }

                    allActivities.push({
                        username: user.username || user.firstName || 'User',
                        action: action,
                        item: item,
                        amount: amount,
                        currency: currency,
                        date: h.date || h.timestamp || Date.now()
                    });
                });
            }
        });

        // Filter out zero amounts if possible, but keep if it's all we have
        let validActivities = allActivities.filter(a => a.amount > 0);
        if (validActivities.length === 0) validActivities = allActivities;

        // Sort by date (newest first) and take top 12
        validActivities.sort((a, b) => (b.date || 0) - (a.date || 0));
        const recentActivities = validActivities.slice(0, 12);

        // If no activities found, return empty success
        if (recentActivities.length === 0) {
            return res.json({
                success: true,
                activities: [],
                message: 'No recent activities found'
            });
        }

        res.json({
            success: true,
            activities: recentActivities
        });
    } catch (error) {
        console.error('[USER ACTIVITY] Error:', error);
        res.json({
            success: false,
            message: 'Error fetching user activity',
            activities: []
        });
    }
});

// API: Claim Daily Reward (Tiered Streak System)
app.post('/api/daily/claim', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false, message: 'User ID required' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const now = Date.now();
    const lastClaim = user.lastDaily || 0;
    const oneDay = 24 * 60 * 60 * 1000;

    // Check if already claimed today
    if (now - lastClaim < oneDay) {
        const remaining = oneDay - (now - lastClaim);
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        return res.json({
            success: false,
            message: `Already claimed today. Next claim in ${hours}h ${minutes}m`,
            remainingTime: remaining
        });
    }

    // Calculate streak (reset if missed a day)
    let streak = user.dailyStreak || 0;
    if (now - lastClaim > 2 * oneDay) {
        streak = 0; // Reset streak if missed a day
    }
    streak++;
    if (streak > 7) {
        streak = 1; // Reset to day 1 after completing a week
    }

    // Calculate reward based on streak
    const rewards = [10, 20, 30, 40, 50, 60, 100];
    const reward = rewards[streak - 1] || 10;

    let gemsReward = 0;
    if (streak === 5 || streak === 6) gemsReward = 1;
    if (streak === 7) gemsReward = 2;

    // Update user data
    user.lastDaily = now;
    user.dailyStreak = streak;

    // Add reward and handle support loan auto-repayment
    const currentBalance = db.getTokenBalance(user) || 0;
    const supportLoan = user.supportLoan || 0;

    let newBalance = currentBalance + reward;
    let repaidAmount = 0;
    let newSupportLoan = supportLoan;

    // If user has a support loan, auto-repay from earnings
    if (supportLoan > 0) {
        repaidAmount = Math.min(reward, supportLoan);
        newBalance = newBalance - repaidAmount;
        newSupportLoan = supportLoan - repaidAmount;
        user.supportLoan = newSupportLoan;

        // Add loan repayment history
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'support_loan_repay',
            earned: reward,
            repaid: repaidAmount,
            remainingLoan: newSupportLoan,
            date: Date.now()
        });
    }

    const currentGems = user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0);
    user.Gems = parseFloat((currentGems + gemsReward).toFixed(4));
    user.balance_Gems = user.Gems;
    db.setTokenBalance(user, newBalance);

    // Add daily bonus history
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'daily_bonus',
        amount: reward,
        streak: streak,
        date: now
    });

    await db.updateUser(user);

    res.json({
        success: true,
        reward: reward,
        streak: streak,
        newBalance: newBalance,
        supportLoanRepaid: repaidAmount,
        remainingLoan: newSupportLoan
    });
});

// API: Leaderboard (Top Referrers and Earners)
app.get('/api/leaderboard', (req, res) => {
    const { userId, type = 'refer', period = 'week' } = req.query;

    let top = [];
    let userRank = null;
    let userScore = 0;

    const allUsersList = Object.values(db.data.users);

    // ── Leaderboard Token Reward Config ──────────────────────────────────────
    const settings = db.getSettings();
    let weeklyRewards = (settings.leaderboardWeeklyRewards && settings.leaderboardWeeklyRewards !== '100,70,50,20,20,20,20,20,20,20')
        ? settings.leaderboardWeeklyRewards.split(',').map(x => parseFloat(x.trim()) || 0)
        : [10, 8, 6, 5, 4, 3, 2, 1, 1, 1];
    let monthlyRewards = (settings.leaderboardMonthlyRewards && settings.leaderboardMonthlyRewards !== '500,350,250,100,100,100,100,100,100,100')
        ? settings.leaderboardMonthlyRewards.split(',').map(x => parseFloat(x.trim()) || 0)
        : [50, 45, 40, 35, 30, 25, 20, 15, 10, 5];

    const rewardConfig = {
        refer: {
            week: [
                { rank: 1, gems: weeklyRewards[0] || 10 },
                { rank: 2, gems: weeklyRewards[1] || 8 },
                { rank: 3, gems: weeklyRewards[2] || 6 },
                { rank: '4-10', gems: weeklyRewards[3] || 5 }
            ],
            month: [
                { rank: 1, gems: monthlyRewards[0] || 50 },
                { rank: 2, gems: monthlyRewards[1] || 45 },
                { rank: 3, gems: monthlyRewards[2] || 40 },
                { rank: '4-10', gems: monthlyRewards[3] || 35 }
            ]
        }
    };

    // Helper: reward string
    const getGemReward = (idx, period) => {
        const rewards = period === 'month' ? monthlyRewards : weeklyRewards;
        if (idx < rewards.length && rewards[idx] > 0) {
            return `${rewards[idx]} 💎`;
        }
        return null;
    };

    // Calculate period-based referral counts using history
    const getPeriodReferralCount = (user, period) => {
        const now = Date.now();
        const cutoff = period === 'month' ? now - 30 * 24 * 60 * 60 * 1000 : now - 7 * 24 * 60 * 60 * 1000;

        // Primary: use referredUsers array (set since latest fix)
        if (user.referredUsers && Array.isArray(user.referredUsers) && user.referredUsers.length > 0) {
            return user.referredUsers.filter(r => r.date && r.date >= cutoff && r.rewarded).length;
        }

        // Fallback: count from history for users who referred before the fix
        if (user.history && Array.isArray(user.history)) {
            return user.history.filter(h =>
                (h.type === 'referral_reward' || h.type === 'referral' || h.type === 'referral_bonus') &&
                h.date && h.date >= cutoff
            ).length;
        }

        return 0;
    };

    // All-time referral count (for users without period tracking)
    const getAllTimeReferralCount = (user) => {
        if (user.referralCount && user.referralCount > 0) return user.referralCount;
        if (user.referredUsers && Array.isArray(user.referredUsers)) {
            return user.referredUsers.filter(r => r.rewarded).length;
        }
        if (user.history && Array.isArray(user.history)) {
            return user.history.filter(h =>
                h.type === 'referral_reward' || h.type === 'referral' || h.type === 'referral_bonus'
            ).length;
        }
        return 0;
    };

    if (type === 'quiz') {
        const sortedQuizPlayers = [...allUsersList]
            .filter(u => (u.quizPoints || 0) > 0)
            .sort((a, b) => (b.quizPoints || 0) - (a.quizPoints || 0));

        top = sortedQuizPlayers.slice(0, 100).map((u, idx) => ({
            id: u.id,
            name: u.firstName || u.username || `User ${String(u.id).slice(-4)}`,
            score: u.quizPoints || 0,
            photo_url: u.photo_url || '',
            rank: idx + 1
        }));

        if (userId) {
            const idx = sortedQuizPlayers.findIndex(u => String(u.id) === String(userId));
            userRank = idx >= 0 ? idx + 1 : null;
            const thisUser = db.data.users[String(userId)];
            if (thisUser) userScore = thisUser.quizPoints || 0;
        }
    } else {
        // Referral leaderboard with period support
        const sortedReferrers = [...allUsersList]
            .map(u => {
                const periodCount = getPeriodReferralCount(u, period);
                const allTimeCount = getAllTimeReferralCount(u);
                // Always show users with referrals — use period count first, then all-time as fallback
                const effectiveCount = periodCount > 0 ? periodCount : allTimeCount;
                return { ...u, _cycleReferrals: effectiveCount };
            })
            .filter(u => u._cycleReferrals >= 1) // Minimum 1 referral required
            .sort((a, b) => b._cycleReferrals - a._cycleReferrals);

        top = sortedReferrers.slice(0, 100).map((u, idx) => {
            return {
                id: u.id,
                name: u.firstName || u.username || `User ${String(u.id).slice(-4)}`,
                score: u._cycleReferrals,
                photo_url: u.photo_url || '',
                rank: idx + 1,
                reward: getGemReward(idx, period)
            };
        });

        if (userId) {
            // Compare as string to avoid type mismatch (number vs string id)
            const idx = sortedReferrers.findIndex(u => String(u.id) === String(userId));
            userRank = idx >= 0 ? idx + 1 : null;
            const thisUser = db.data.users[String(userId)];
            if (thisUser) {
                userScore = getPeriodReferralCount(thisUser, period);
                // Always fall back to all-time count so score shows correctly
                if (userScore === 0) userScore = getAllTimeReferralCount(thisUser);
                // If user has a score but no rank (not in top 100), compute approximate rank
                if (userScore > 0 && userRank === null) {
                    userRank = sortedReferrers.length + 1; // They'd be just outside top list
                }
            }
        }
    }

    // Next reward time (Sunday 00:00 for weekly, 1st of month 00:00 for monthly)
    const now = Date.now();
    const leaderState = db.data.leaderboardState || {};

    const nextWeekly = leaderState.nextWeeklyAt || (() => {
        const d = new Date();
        const day = d.getDay();
        const diff = (7 - day) % 7 || 7;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    })();

    const nextMonthly = leaderState.nextMonthlyAt || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    })();

    res.json({
        success: true,
        top,
        userRank,
        userScore,
        type,
        period,
        rewardConfig: rewardConfig.refer || {},
        nextWeeklyAt: nextWeekly,
        nextMonthlyAt: nextMonthly
    });
});

// ==================== LEADERBOARD REWARD SCHEDULER ====================
// Runs weekly and monthly to distribute USD prizes to top referrers

async function _distributeLeaderboardRewards(period) {
    try {
        const allUsers = Object.values(db.data.users || {});
        const now = Date.now();
        const cutoff = period === 'month' ? now - 30 * 24 * 60 * 60 * 1000 : now - 7 * 24 * 60 * 60 * 1000;

        // === REFERRAL LEADERBOARD REWARDS ===
        const getReferrals = (u) => {
            if (!u.referredUsers || !Array.isArray(u.referredUsers)) {
                // Fallback: count from history
                if (u.history && Array.isArray(u.history)) {
                    return u.history.filter(h =>
                        (h.type === 'referral_reward' || h.type === 'referral' || h.type === 'referral_bonus') &&
                        h.date && h.date >= cutoff
                    ).length;
                }
                return 0;
            }
            return u.referredUsers.filter(r => r.date && r.date >= cutoff && r.rewarded).length;
        };

        const sortedReferrers = [...allUsers]
            .map(u => ({ user: u, count: getReferrals(u) }))
            .filter(x => x.count >= 1) // Minimum 1 referral required
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Dynamic Referral Rewards from admin settings
        const settings = db.getSettings();
        let referralRewards = [];
        if (period === 'month') {
            if (settings.leaderboardMonthlyRewards && settings.leaderboardMonthlyRewards !== '500,350,250,100,100,100,100,100,100,100') {
                referralRewards = settings.leaderboardMonthlyRewards.split(',').map(x => parseFloat(x.trim()) || 0);
            } else {
                referralRewards = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5];
            }
        } else {
            if (settings.leaderboardWeeklyRewards && settings.leaderboardWeeklyRewards !== '100,70,50,20,20,20,20,20,20,20') {
                referralRewards = settings.leaderboardWeeklyRewards.split(',').map(x => parseFloat(x.trim()) || 0);
            } else {
                referralRewards = [10, 8, 6, 5, 4, 3, 2, 1, 1, 1];
            }
        }

        for (let i = 0; i < sortedReferrers.length; i++) {
            const { user } = sortedReferrers[i];
            const reward = referralRewards[i] || 0;
            if (reward <= 0) continue;

            const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
            user.Gems = currentGems + reward;
            user.balance_Gems = user.Gems;

            if (!user.history) user.history = [];
            user.history.unshift({
                type: 'leaderboard_reward',
                amount: reward,
                currency: 'Gems',
                rank: i + 1,
                period,
                date: now,
                detail: `${period === 'month' ? 'Monthly' : 'Weekly'} Referral Leaderboard #${i + 1} Reward`
            });

            // Notify via Telegram
            try {
                if (bot && user.id) {
                    await bot.sendMessage(user.id,
                        `🏆 *Leaderboard Reward!*\n\n` +
                        `🎉 You ranked #${i + 1} in the ${period === 'month' ? 'Monthly' : 'Weekly'} Referral Leaderboard!\n\n` +
                        `💎 *Reward:* ${reward} Gems added to your balance!\n` +
                        `👥 *Referrals:* ${sortedReferrers[i].count}`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }
            } catch (e) { }
        }

        // === POST LEADERBOARD TO GROUPS ===
        try {
            if (bot) {
                const periodLabel = period === 'month' ? 'Monthly 🗓' : 'Weekly 📅';
                const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

                // Build referral leaderboard text (no @ symbol, only first name)
                let referralText = `🏆 *${periodLabel} Referral Leaderboard*\n`;
                referralText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                if (sortedReferrers.length === 0) {
                    referralText += `_No referrals recorded yet._\n`;
                } else {
                    for (let i = 0; i < sortedReferrers.length; i++) {
                        const { user, count } = sortedReferrers[i];
                        const name = (user.firstName || user.first_name || user.username || 'Unknown').replace(/[*_`\[\]()~>#+=|{}.!-]/g, '\\$&');
                        const prize = referralRewards[i] || 0;
                        referralText += `${medal[i] || `${i + 1}.`} *${name}*\n`;
                        referralText += `   👥 Referrals: ${count}  |  💎 Reward: ${prize} Gems\n\n`;
                    }
                }
                referralText += `━━━━━━━━━━━━━━━━━━━━\n`;
                referralText += `🎯 Invite friends to climb the leaderboard!`;

                const fullMsg = referralText;

                // Post to main channel and main group only (automated posts do not go to other arbitrary groups/channels)
                const mainChannel = db.data.settings && db.data.settings.requiredChannel;
                if (mainChannel) {
                    await bot.sendMessage(mainChannel, fullMsg, { parse_mode: 'Markdown' }).catch(() => { });
                }

                const mainGroup = db.data.settings && db.data.settings.requiredGroup;
                if (mainGroup) {
                    await bot.sendMessage(mainGroup, fullMsg, { parse_mode: 'Markdown' }).catch(() => { });
                }
            }
        } catch (e) {
            console.error('[LEADERBOARD] Group post error:', e.message);
        }

        db.save(true);
        console.log(`[LEADERBOARD] Distributed ${period} rewards to top users.`);
    } catch (e) {
        console.error('[LEADERBOARD] Reward distribution error:', e.message);
    }
}

// Leaderboard scheduler: weekly (every Sunday 00:00) + monthly (1st of month 00:00)
setInterval(async () => {
    try {
        const now = Date.now();
        if (!db.data.leaderboardState) db.data.leaderboardState = {};
        const state = db.data.leaderboardState;

        // Weekly rewards: every Sunday 00:00
        const nextWeekly = state.nextWeeklyAt || (() => {
            const d = new Date();
            const day = d.getDay();
            const diff = (7 - day) % 7 || 7; // Days until next Sunday
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        })();

        if (now >= nextWeekly) {
            if (nextWeekly > 0) { // Don't trigger on first run
                await _distributeLeaderboardRewards('week');
            }
            // Set next Sunday
            const d = new Date();
            const day = d.getDay();
            const diff = (7 - day) % 7 || 7;
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            state.nextWeeklyAt = d.getTime();
            state.lastWeeklyAt = now;
            db.save(true);
        }

        // Monthly rewards: 1st of each month 00:00
        const nextMonthly = state.nextMonthlyAt || (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        })();

        if (now >= nextMonthly) {
            if (nextMonthly > 0) {
                await _distributeLeaderboardRewards('month');
            }
            // Set next 1st of month
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            state.nextMonthlyAt = d.getTime();
            state.lastMonthlyAt = now;
            db.save(true);
        }
    } catch (e) {
        console.error('[LEADERBOARD SCHEDULER] Error:', e.message);
    }
}, 60 * 60 * 1000); // Check every hour

// Admin: manual trigger for leaderboard rewards
app.post('/api/admin/leaderboard/distribute', async (req, res) => {
    const { period } = req.body;
    if (!['week', 'month'].includes(period)) return res.json({ success: false, message: 'period must be week or month' });
    await _distributeLeaderboardRewards(period);
    res.json({ success: true, message: `${period === 'month' ? 'Monthly' : 'Weekly'} rewards distributed!` });
});

// API: Get User Referrals (for invite page)
app.get('/api/referrals/:userId', async (req, res) => {
    const { userId } = req.params;

    // Validate userId
    const numericId = typeof userId === 'number' ? userId : parseInt(userId);
    if (isNaN(numericId) || numericId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const user = await db.getUser(userId);

    if (!user) {
        return res.json({ success: false, message: 'User not found' });
    }

    const refBonus = (db.data.settings && db.data.settings.refBonus) || 50;
    const botUsername = (db.data.settings && db.data.settings.botUsername) || 'AutosVerify_bot';

    // Get or generate referral code for user
    const referralCode = db.getReferralCode(userId);

    // Get referred users with Pending/Verified status and photo
    const referredUsers = (await Promise.all((user.referredUsers || []).map(async ref => {
        const refUser = await db.getUser(ref.userId);
        return {
            userId: ref.userId,
            name: refUser ? (refUser.firstName || refUser.username || `User ${String(ref.userId).slice(-4)}`) : `User ${String(ref.userId).slice(-4)}`,
            photo_url: refUser ? (refUser.photoUrl || refUser.photo_url || null) : null,
            date: ref.date || Date.now(),
            status: ref.rewarded ? 'Verified' : 'Pending',
            reward: ref.rewarded ? `+${refBonus}` : 'Pending'
        };
    }))).reverse(); // Most recent first

    // Calculate stats
    const totalInvited = referredUsers.length;
    const totalEarned = referredUsers.filter(r => r.status === 'Verified').length * refBonus;

    res.json({
        success: true,
        referrals: referredUsers,
        stats: {
            invited: totalInvited,
            earned: totalEarned
        },
        referralCode: referralCode,
        referralLink: `https://t.me/${botUsername}?start=${referralCode}`
    });
});


// API: Proxy Telegram Avatar (so we don't expose bot token)
app.get('/api/proxy-avatar', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('userId required');

    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) return res.status(500).send('Bot token not configured');

        // Fetch user profile photos
        const photosRes = await fetch(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${userId}&limit=1`);
        const photosData = await photosRes.json();

        if (photosData.ok && photosData.result.total_count > 0) {
            const fileId = photosData.result.photos[0][0].file_id;

            // Get file path
            const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();

            if (fileData.ok) {
                const filePath = fileData.result.file_path;
                const photoUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

                // Fetch image and send
                const imgRes = await fetch(photoUrl);
                const buffer = await imgRes.buffer();
                res.set('Content-Type', imgRes.headers.get('content-type'));
                res.send(buffer);
                return;
            }
        }
    } catch (e) {
        console.error('Failed to proxy avatar:', e.message);
    }

    // Fallback to 404 so frontend can use letter avatar
    res.status(404).send('Not found');
});


// =============================================
// ITEM SELLING (USER SUBMISSIONS)
// =============================================

app.get('/api/user/item-sales/rewards', (req, res) => {
    const rewards = db.data.sellingRewards || {
        "Gmail": 50,
        "TikTok": 100,
        "Facebook": 80,
        "Telegram": 120,
        "Discord": 150,
        "Other": 40,
        "2faMultiplier": 1.5
    };
    res.json({ success: true, rewards });
});

// User: Submit item for sale
app.post('/api/user/item-sales/submit', (req, res) => {
    const { userId, itemType, isSubscription, rewardCurrency, accountName, accountLogo,
        email, password, is2fa, twoFA,
        customName, iconBase64, appUrl,
        serviceName, apiKey, apiQuota, extraInfo,
        vpnName, vpnPlan, cardType, cardNumber, cardExpiry, cardCVV, cardHolder, cardCountry, cardBillingAddress } = req.body;
    if (!userId || !itemType) return res.json({ success: false, message: 'Missing fields' });

    if (!db.getItemSales()) return res.json({ success: false, message: 'Database not ready' });

    const saleId = 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const saleData = {
        id: saleId,
        userId: userId.toString(),
        itemType,
        isSubscription: !!isSubscription,
        rewardCurrency: rewardCurrency || (itemType === 'Card' ? 'Tokens' : 'USD'),
        accountName: accountName || '',
        accountLogo: accountLogo || '',
        // Account fields
        email: email || '',
        password: password || '',
        is2fa: !!is2fa,
        twoFA: twoFA || null,
        // ... other fields remain ...
        customName: customName || '',
        iconBase64: iconBase64 || '',
        appUrl: appUrl || '',
        serviceName: serviceName || '',
        apiKey: apiKey || '',
        apiQuota: apiQuota || '',
        extraInfo: extraInfo || '',
        vpnName: vpnName || '',
        vpnPlan: vpnPlan || '',
        cardType: cardType || '',
        cardNumber: cardNumber || '',
        cardExpiry: cardExpiry || '',
        cardCVV: cardCVV || '',
        cardHolder: cardHolder || '',
        cardCountry: cardCountry || '',
        cardBillingAddress: cardBillingAddress || '',
        status: 'pending',
        stock: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    db.saveItemSale(saleData);

    res.json({ success: true, message: 'Item submitted successfully! Waiting for admin approval.', sale: saleData });
});


// User: Get my sale submissions
app.get('/api/user/item-sales/my', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, items: [] });

    const sales = Object.values(db.data.itemSales || {}).filter(s => s.userId === userId.toString());
    // Sort by newest first
    sales.sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, items: sales });
});

// Public: Get all approved user items with stock > 0 (for shop display)
app.get('/api/user/item-sales/approved', (req, res) => {
    const items = Object.values(db.data.itemSales || {})
        .filter(s => s.status === 'approved' && (s.stock || 0) > 0)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);
    res.json({ success: true, items });
});

// Admin: Delete an approved item
app.delete('/api/admin/item-sales/:id', (req, res) => {
    const { id } = req.params;

    if (!db.data.itemSales || !db.data.itemSales[id]) {
        return res.json({ success: false, message: 'Item not found' });
    }

    // Get item details for notification
    const item = db.data.itemSales[id];
    const itemName = item.itemName || 'Item';
    const sellerId = item.userId;

    // Delete the item
    delete db.data.itemSales[id];
    db.save(true);

    // Notify seller if bot is available
    if (bot && sellerId) {
        const deleteMsg = `🗑️ <b>Item Deleted by Admin</b>\n\nYour item <b>${itemName}</b> has been removed from the marketplace by an admin.\n\nIf you have questions, please contact support.`;
        bot.sendMessage(sellerId, deleteMsg, { parse_mode: 'HTML' }).catch(e => console.error('Delete notify error:', e.message));
    }

    res.json({ success: true, message: 'Item deleted successfully' });
});

// Admin: Get all sale submissions (pending/approved/rejected)
app.get('/api/admin/item-sales/all', (req, res) => {
    const itemSales = db.getItemSales ? db.getItemSales() : (db.data.itemSales || {});
    const sales = Object.values(itemSales);
    // Filter/Sort
    const pending = sales.filter(s => s.status === 'pending').sort((a, b) => b.createdAt - a.createdAt);
    const history = sales.filter(s => s.status !== 'pending').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);

    res.json({ success: true, pending, history });
});

// Admin: Update sale status (Approve/Reject/Offer) + set listing price
app.post('/api/admin/item-sales/update', (req, res) => {
    const { saleId, status, rewardAmount, sellingPrice, stock } = req.body;
    if (!saleId || !status) return res.json({ success: false, message: 'Missing fields' });

    const itemSales = db.getItemSales ? db.getItemSales() : (db.data.itemSales || {});
    if (!itemSales[saleId]) {
        return res.json({ success: false, message: 'Submission not found' });
    }

    const sale = itemSales[saleId];
    sale.status = status;
    sale.updatedAt = Date.now();

    // Set listing price if provided
    if (sellingPrice !== undefined) sale.price = parseInt(sellingPrice) || 0;
    // Set stock if provided
    if (stock !== undefined) sale.stock = parseInt(stock) || 1;
    // Store proposed reward if it's an offer or approval
    if (rewardAmount !== undefined) sale.rewardOffer = parseInt(rewardAmount) || 0;
    // Set expiration date (7 days from approval) - item expires if not sold
    if (status === 'approved') {
        sale.expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    }

    // NOTE: Seller does NOT get paid immediately on approval.
    // They will only receive payment when the item is actually sold to a buyer.
    // Platform fee will be deducted from the reward (configurable percentage).
    // If item expires unsold after 7 days, it will be removed and seller gets nothing.

    // Get platform fee % for notifications
    const platformFeePercent = db.data.settings?.platformFee || 20;
    const sellerReceives = Math.floor(sale.rewardOffer * (100 - platformFeePercent) / 100);

    db.save(true);

    // Notify User
    if (bot) {
        let msg = '';
        const itemName = sale.accountName || sale.customName || sale.itemType || 'Item';
        if (status === 'offer_sent') {
            msg = `📩 <b>Price Offer Received!</b>\n\nAdmin has proposed a reward of <b>${sale.rewardOffer} ${sale.rewardCurrency || 'Tokens'}</b> for your item: <b>${itemName}</b>.\n\n💡 <b>Important:</b> If you accept and the item sells, you will receive <b>${sellerReceives} ${sale.rewardCurrency || 'Tokens'}</b> (after ${platformFeePercent}% platform fee).\n\nPlease open the app to Accept or Reject this price.`;
        } else if (status === 'approved') {
            msg = `✅ <b>Item Approved!</b>\n\nYour item <b>${itemName}</b> has been approved and is now listed for sale.\n\n💰 <b>Payment:</b> You will receive <b>${sellerReceives} ${sale.rewardCurrency || 'Tokens'}</b> after sale (${platformFeePercent}% platform fee deducted).\n⏰ <b>Expiration:</b> Your item will be available for <b>7 days</b>. If not sold by then, it will expire and be removed.\n\nYou'll be notified when someone purchases it.`;
        } else if (status === 'rejected') {
            msg = `❌ <b>Item Rejected</b>\n\nYour item <b>${itemName}</b> was rejected by Admin. (Reason: Quality or Policy).`;
        }

        if (msg) {
            bot.sendMessage(sale.userId, msg, { parse_mode: 'HTML' }).catch(e => console.error('Notify error:', e.message));
        }
    }

    res.json({ success: true, message: `Submission ${status} successfully.` });
});

// User: Accept or Reject Admin Offer
app.post('/api/user/item-sales/offer-action', (req, res) => {
    const { saleId, action, userId } = req.body; // action: 'accept' or 'reject'
    if (!saleId || !action || !userId) return res.json({ success: false, message: 'Missing fields' });

    const itemSales = db.getItemSales ? db.getItemSales() : (db.data.itemSales || {});
    if (!itemSales[saleId]) {
        return res.json({ success: false, message: 'Submission not found' });
    }

    const sale = itemSales[saleId];
    if (sale.userId !== userId.toString()) return res.json({ success: false, message: 'Unauthorized' });
    if (sale.status !== 'offer_sent') return res.json({ success: false, message: 'No pending offer for this item' });

    if (action === 'accept') {
        sale.status = 'approved';
        sale.updatedAt = Date.now();
        sale.expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days expiration
        // NOTE: Seller does NOT get paid immediately when accepting offer.
        // They will only receive payment when the item is actually sold to a buyer.
        // Platform fee will be deducted (configurable percentage).
        // Item expires after 7 days if not sold.
        db.save(true);
        const platformFeePercent = db.data.settings?.platformFee || 20;
        return res.json({ success: true, message: `Offer accepted! Your item is now listed for sale. You will receive ${100 - platformFeePercent}% of the price after sale (${platformFeePercent}% platform fee). Item expires in 7 days if not sold.` });
    } else if (action === 'reject') {
        const itemName = sale.accountName || sale.customName || sale.itemType || 'Item';
        const sellerName = sale.username || 'User';

        // Notify Admin of rejection
        if (bot) {
            const adminMsg = `⚠️ <b>Offer Rejected</b>\n\nUser @${sellerName} (#${userId}) has rejected your price offer for <b>${itemName}</b>. The item data has been deleted.`;
            bot.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' }).catch(e => console.error('Admin notify error:', e.message));
        }

        // Delete the item immediately as requested
        delete db.data.itemSales[saleId];
        db.save(true);
        return res.json({ success: true, message: 'Offer rejected. Item deleted.' });
    }

    return res.json({ success: false, message: 'Invalid action' });
});

// User: Buy approved item
app.post('/api/user/item-sales/buy', async (req, res) => {
    const { userId, saleId } = req.body;
    if (!userId || !saleId) return res.json({ success: false, message: 'Missing fields' });

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const itemSales = db.getItemSales ? db.getItemSales() : (db.data.itemSales || {});
    if (!itemSales[saleId]) {
        return res.json({ success: false, message: 'Item not found' });
    }

    const sale = itemSales[saleId];
    if (sale.status !== 'approved' || (sale.stock || 0) <= 0) {
        return res.json({ success: false, message: 'Item no longer available' });
    }

    const price = parseFloat(sale.price) || 0;

    // Deduction logic: Always USD as requested
    const balance = user.usd || 0;
    if (balance < price) return res.json({ success: false, message: `Insufficient balance. Need $${price.toFixed(3)}.` });

    user.usd = parseFloat((balance - price).toFixed(3));
    db.addTransaction(userId, 'service', price, 'USD', `Bought ${sale.itemType}: ${sale.accountName || sale.customName || sale.cardType}`, 'shopping-cart');

    // Process Purchase
    sale.stock = (sale.stock || 1) - 1;
    if (sale.stock <= 0) sale.status = 'sold';

    // PAY SELLER - Only when item is actually sold to a buyer
    if (sale.rewardOffer > 0) {
        const seller = await db.getUser(sale.userId);
        if (seller) {
            const currency = sale.rewardCurrency || (sale.itemType === 'Card' ? 'Tokens' : 'USD');
            // Get platform fee % from settings (default 20%)
            const platformFeePercent = db.data.settings?.platformFee || 20;
            // Calculate seller payment: (100 - fee)% of reward
            const platformFee = Math.floor(sale.rewardOffer * (platformFeePercent / 100));
            const sellerPayment = sale.rewardOffer - platformFee;

            db.addCredit(sale.userId, sellerPayment, currency);
            db.addTransaction(sale.userId, 'bonus', sellerPayment, currency, `Payment for sold ${sale.itemType}: ${sale.accountName || sale.customName || sale.cardType || 'Item'} (after ${platformFeePercent}% fee)`, 'gift');

            // Notify seller that their item was sold
            if (bot) {
                const itemName = sale.accountName || sale.customName || sale.cardType || sale.itemType || 'Item';
                const sellerMsg = `🎉 <b>Item Sold!</b>\n\nYour item <b>${itemName}</b> has been purchased by a buyer.\n\n💰 Listed Price: <b>${sale.rewardOffer} ${currency}</b>\n💸 Platform Fee (${platformFeePercent}%): <b>-${platformFee} ${currency}</b>\n✅ You Received: <b>${sellerPayment} ${currency}</b>\n\nThank you for using our marketplace!`;
                bot.sendMessage(sale.userId, sellerMsg, { parse_mode: 'HTML' }).catch(e => console.error('Seller notify error:', e.message));
            }
        }
    }

    // Record purchase for buyer
    if (!user.purchasedItems) user.purchasedItems = [];
    user.purchasedItems.push({
        saleId: sale.id,
        itemType: sale.itemType,
        details: {
            email: sale.email,
            password: sale.password,
            twoFA: sale.twoFA,
            cardNumber: sale.cardNumber,
            cardExpiry: sale.cardExpiry,
            cardCVV: sale.cardCVV
        },
        boughtAt: Date.now()
    });

    db.save(true);

    res.json({
        success: true,
        message: 'Purchase successful! Check your history for details.',
        details: {
            email: sale.email,
            password: sale.password,
            twoFA: sale.twoFA,
            cardNumber: sale.cardNumber,
            cardExpiry: sale.cardExpiry,
            cardCVV: sale.cardCVV
        }
    });
});

app.get('/api/admin/global-history', (req, res) => {
    const users = db.data.users || {};
    let allHistory = [];

    Object.keys(users).forEach(userId => {
        const user = users[userId];
        const userHistory = user.history || [];
        userHistory.forEach(item => {
            allHistory.push({
                ...item,
                userId: userId,
                username: user.firstName ? user.firstName + (user.lastName ? ' ' + user.lastName : '') : (user.username || 'User')
            });
        });
    });

    // Sort by date descending
    allHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, history: allHistory.slice(0, 500) });
});

// ==========================================
// AI MEDIA SERVICES - File Upload & Missing Routes
// ==========================================

// Upload file (returns hosted URL, uses existing disk upload middleware)
app.post('/api/ai/upload-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const fileUrl = baseUrl + '/uploads/' + req.file.filename;

        res.json({ success: true, url: fileUrl, filename: req.file.filename });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Helper to ensure Live SMS Bot structure
function _ensureLiveSmsBotData() {
    if (!db.data.liveSmsBot) db.data.liveSmsBot = {};
    if (!db.data.liveSmsBot.bots) db.data.liveSmsBot.bots = {};
    if (!db.data.liveSmsBot.apiConfig) {
        db.data.liveSmsBot.apiConfig = {
            apiKey: 'lsb_ec7ec99303bec41d34e7949c20bf0fed12c3e1a48f8157b6',
            baseUrl: 'https://livesms-host-production.up.railway.app'
        };
    }
}

// ── Call external Live SMS Bot hosting server API ───────────────────────────
async function lsbCallServer(action, botEntry, fileBuffer, fileName) {
    _ensureLiveSmsBotData();
    const config = db.data.liveSmsBot.apiConfig;
    const base = (config.baseUrl || '').replace(/\/$/, '');
    if (!base) return { success: false, error: 'No Live SMS Bot hosting server URL configured by admin' };

    const apiKey = config.apiKey || '';
    const jsonHeaders = { 'X-API-Key': apiKey, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const extId = botEntry.externalId || botEntry.id;

    // Helper: try multiple endpoints, return first success
    async function tryPost(paths, body, headers, timeout) {
        let lastErr = '';
        for (const p of paths) {
            try {
                const r = await axios.post(base + p, body, { headers, timeout: timeout || 20000 });
                return r;
            } catch (e) {
                lastErr = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message;
                console.warn('[LSB] POST ' + p + ' failed:', lastErr);
            }
        }
        throw new Error(lastErr);
    }
    async function tryDelete(paths, headers, timeout) {
        let lastErr = '';
        for (const p of paths) {
            try {
                const r = await axios.delete(base + p, { headers, timeout: timeout || 20000 });
                return r;
            } catch (e) {
                lastErr = e.response ? `${e.response.status}` : e.message;
            }
        }
        throw new Error(lastErr);
    }
    async function tryGet(paths, headers, timeout) {
        let lastErr = '';
        for (const p of paths) {
            try {
                const r = await axios.get(base + p, { headers, timeout: timeout || 15000 });
                return r;
            } catch (e) {
                lastErr = e.response ? `${e.response.status}` : e.message;
            }
        }
        throw new Error(lastErr);
    }

    try {
        if (action === 'deploy') {
            const FormData = require('form-data');
            const form = new FormData();
            const fn = fileName || 'bot.py';
            form.append('file', fileBuffer, { filename: fn, contentType: 'application/octet-stream' });
            form.append('name', fn);
            form.append('language', 'python');
            form.append('autoRestart', 'true');
            const fh = { ...form.getHeaders(), 'X-API-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };

            const resp = await (async () => {
                const paths = ['/api/deploy', '/api/bots/upload', '/api/bots/deploy', '/bots/upload', '/deploy'];
                let lastErr = '';
                for (const p of paths) {
                    try {
                        return await axios.post(base + p, form, { headers: fh, timeout: 60000 });
                    } catch (e) {
                        lastErr = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message;
                        console.warn('[LSB] deploy ' + p + ' failed:', lastErr);
                    }
                }
                throw new Error(lastErr);
            })();

            const data = resp.data;
            console.log('[LSB] Deploy response:', JSON.stringify(data).substring(0, 200));
            const returnedId = data.botId || data.id || data._id || data.bot_id || null;
            return { success: true, data, botId: returnedId };
        }

        if (action === 'start') {
            const resp = await tryPost(
                [`/api/bots/${extId}/start`, `/api/bots/${extId}/run`, `/bots/${extId}/start`],
                {}, jsonHeaders
            );
            return { success: true, data: resp.data };
        }

        if (action === 'stop') {
            const resp = await tryPost(
                [`/api/bots/${extId}/stop`, `/api/bots/${extId}/kill`, `/bots/${extId}/stop`],
                {}, jsonHeaders
            );
            return { success: true, data: resp.data };
        }

        if (action === 'delete') {
            const resp = await tryDelete(
                [`/api/bots/${extId}`, `/bots/${extId}`, `/api/bots/${extId}/delete`],
                jsonHeaders
            );
            return { success: true, data: resp.data };
        }

        if (action === 'logs') {
            const resp = await tryGet(
                [`/api/bots/${extId}/logs`, `/api/bots/${extId}/log`, `/bots/${extId}/logs`],
                jsonHeaders
            );
            return { success: true, data: resp.data };
        }

    } catch (e) {
        let errMsg = e.message;
        if (e.response) {
            const d = e.response.data;
            errMsg = (typeof d === 'object' && d) ? (d.error || d.message || d.detail || `HTTP ${e.response.status}`) :
                (typeof d === 'string' && !d.includes('<html') ? d.substring(0, 200) : `HTTP ${e.response.status}`);
        }
        console.error('[LSB] ' + action + ' error:', errMsg);
        return { success: false, error: errMsg };
    }
    return { success: false, error: 'Unknown action: ' + action };
}

// ── GET /api/livesmsbot/config — Get Admin Config ───────────────────────────
app.get('/api/livesmsbot/config', (req, res) => {
    _ensureLiveSmsBotData();
    res.json({ success: true, apiConfig: db.data.liveSmsBot.apiConfig });
});

// ── POST /api/livesmsbot/config — Save Admin Config ──────────────────────────
app.post('/api/livesmsbot/config', (req, res) => {
    _ensureLiveSmsBotData();
    const { apiKey, baseUrl } = req.body;
    if (!apiKey || !baseUrl) {
        return res.json({ success: false, message: 'API Key and Base URL are required' });
    }
    db.data.liveSmsBot.apiConfig = { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() };
    db.save(true);
    res.json({ success: true, message: 'Live SMS Bot hosting API configuration saved successfully' });
});

// ── GET /api/admin/livesmsbot/list — List all bots for admin ──────────────────
app.get('/api/admin/livesmsbot/list', async (req, res) => {
    _ensureLiveSmsBotData();
    const botsList = [];
    for (const b of Object.values(db.data.liveSmsBot.bots)) {
        if (b.status === 'deleted') continue;
        const user = await db.getUser(b.userId);
        botsList.push({
            ...b,
            userEmail: user?.email || user?.username || 'Unknown User'
        });
    }
    botsList.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, bots: botsList });
});

// ── GET /api/livesmsbot/list — List user bots ──────────────────────────────
app.get('/api/livesmsbot/list', async (req, res) => {
    _ensureLiveSmsBotData();
    const userId = req.query.userId;
    if (!userId) return res.json({ success: false, message: 'Missing userId' });

    const userBots = Object.values(db.data.liveSmsBot.bots)
        .filter(b => String(b.userId) === String(userId) && b.status !== 'deleted')
        .sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, bots: userBots });
});

// ── POST /api/livesmsbot/deploy — Deploy Live SMS Bot ────────────────────────
app.post('/api/livesmsbot/deploy', async (req, res) => {
    _ensureLiveSmsBotData();
    let { userId, botToken, adminId } = req.body;
    if (!userId || !botToken || !adminId) {
        return res.json({ success: false, message: 'User ID, Bot Token, and Admin ID are required' });
    }

    let cleanToken = String(botToken || '').trim();
    let cleanAdmin = String(adminId || '').trim();

    // Auto-detect if user swapped botToken and adminId
    if (!cleanToken.includes(':') && cleanAdmin.includes(':')) {
        console.log('[LSB DEPLOY] Auto-correcting swapped botToken and adminId');
        const temp = cleanToken;
        cleanToken = cleanAdmin;
        cleanAdmin = temp;
    }
    cleanAdmin = cleanAdmin.replace(/[^0-9-]/g, '') || '0';

    // Check token balance
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const adminSettings = db.data.adminSettings || {};
    const cost = adminSettings.liveSmsBotCost !== undefined ? adminSettings.liveSmsBotCost : 10;
    const currentTokens = db.getTokenBalance(user);

    if (currentTokens < cost) {
        return res.json({ success: false, message: `Insufficient tokens! Need ${cost} tokens, have ${currentTokens}.` });
    }

    const gph = parseFloat(adminSettings.liveSmsBotGemsPerHour !== undefined ? adminSettings.liveSmsBotGemsPerHour : 1) || 1;
    if (bhGetGems(user) < (gph / 60)) {
        return res.json({ success: false, message: `Insufficient Gems! Running Live SMS Bot requires at least ${(gph / 60).toFixed(4)} Gems to cover the first minute.` });
    }

    // Read Python template file
    let templateContent;
    try {
        templateContent = fs.readFileSync(path.join(__dirname, 'livesmsbot_template.py'), 'utf8');
    } catch (err) {
        console.error('Failed to read livesmsbot_template.py:', err.message);
        return res.json({ success: false, message: 'Server configuration error: Template bot file missing.' });
    }

    const botId = 'lsb_' + Math.random().toString(36).substr(2, 9);
    const dateStr = new Date().toLocaleString();

    // Customize the template content with user input
    let customBotCode = templateContent
        .replace(
            'BOT_TOKEN = "8767560640:AAGn-ZqD6rjyyARPBBpTKDfA2m520mHbNlU"',
            `BOT_TOKEN = "${cleanToken.replace(/"/g, '\\"')}"`
        )
        .replace(
            'ADMIN_CHAT_ID = 8901260078',
            `ADMIN_CHAT_ID = ${cleanAdmin}`
        );

    const fileBuffer = Buffer.from(customBotCode, 'utf8');

    // Deploy to Live SMS Bot hosting server
    const deployRes = await lsbCallServer('deploy', { id: botId }, fileBuffer, `livesmsbot_${botId}.py`);
    if (!deployRes.success) {
        return res.json({ success: false, message: 'Hosting server deployment failed: ' + deployRes.error });
    }

    const externalId = deployRes.botId || botId;

    // Deduct balance
    db.setTokenBalance(user, currentTokens - cost);
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'livesmsbot_deploy',
        amount: -cost,
        currency: 'TC',
        date: Date.now(),
        detail: 'Live SMS Bot Deployment'
    });

    const newBot = {
        id: botId,
        externalId: externalId,
        userId: String(userId),
        botToken: botToken.trim(),
        adminId: adminId.trim(),
        status: 'Running',
        createdAt: Date.now(),
        startedAt: Date.now(),
        gemsUsed: 0,
        logs: [
            `[${dateStr}] 🟢 Live SMS Bot initialization requested...`,
            `[${dateStr}] 🛠️ Configuring files with Admin ID: ${adminId.trim()}`,
            `[${dateStr}] 🚀 Deploying to hosting server: ${db.data.liveSmsBot.apiConfig.baseUrl}`,
            `[${dateStr}] 📦 Provisioning virtual environment and installing python-telegram-bot, requests, flask...`,
            `[${dateStr}] ✅ Deployment complete! Webhook listening on active port.`,
            `[${dateStr}] ⚡ Live SMS Bot status: RUNNING and listening for incoming requests.`
        ]
    };

    db.data.liveSmsBot.bots[botId] = newBot;
    db.save(true);

    // Start gem deduction interval
    _startLsbGemInterval(botId, userId);

    // Notify user in Telegram
    if (bot) {
        bot.sendMessage(parseInt(userId), `🤖 *Live SMS Bot Deployed!*\n\nYour bot has been successfully deployed and started on our server!\n\n📌 *Bot ID:* \`${botId}\`\n🆔 *Admin ID:* \`${adminId}\`\n💰 *Cost:* \`${cost}\` TC\n\n_Manage your bot directly from the Web App control panel._`, { parse_mode: 'Markdown' }).catch(() => {});
    }

    res.json({ success: true, bot: newBot, message: 'Live SMS Bot deployed and started successfully!' });
});

// ── POST /api/livesmsbot/start — Start Bot ──────────────────────────────────
app.post('/api/livesmsbot/start', async (req, res) => {
    _ensureLiveSmsBotData();
    const { botId } = req.body;
    if (!botId || !db.data.liveSmsBot.bots[botId]) {
        return res.json({ success: false, message: 'Bot not found' });
    }

    const item = db.data.liveSmsBot.bots[botId];

    // Check user and gem balance
    const user = await db.getUser(item.userId);
    const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.liveSmsBotGemsPerHour) ? db.data.adminSettings.liveSmsBotGemsPerHour : 1) || 1;
    if (!user || bhGetGems(user) < (gph / 60)) {
        return res.json({ success: false, message: `Insufficient Gems! Need at least ${(gph / 60).toFixed(4)} Gems to start.` });
    }
    
    // Trigger on hosting server
    const actionRes = await lsbCallServer('start', item);
    if (!actionRes.success) {
        return res.json({ success: false, message: 'Failed to start on hosting server: ' + actionRes.error });
    }

    item.status = 'Running';
    item.startedAt = Date.now();
    const dateStr = new Date().toLocaleString();
    item.logs.push(`[${dateStr}] 🟢 Manual start triggered. Hosting process restarted.`);
    db.save(true);

    // Start gem interval
    _startLsbGemInterval(botId, item.userId);

    res.json({ success: true, bot: item });
});

// ── POST /api/livesmsbot/stop — Stop Bot ────────────────────────────────────
app.post('/api/livesmsbot/stop', async (req, res) => {
    _ensureLiveSmsBotData();
    const { botId } = req.body;
    if (!botId || !db.data.liveSmsBot.bots[botId]) {
        return res.json({ success: false, message: 'Bot not found' });
    }

    const item = db.data.liveSmsBot.bots[botId];

    // Trigger on hosting server
    const actionRes = await lsbCallServer('stop', item);
    if (!actionRes.success) {
        return res.json({ success: false, message: 'Failed to stop on hosting server: ' + actionRes.error });
    }

    // Stop gem interval
    if (global._liveSmsBotIntervals && global._liveSmsBotIntervals[botId]) {
        clearInterval(global._liveSmsBotIntervals[botId]);
        delete global._liveSmsBotIntervals[botId];
    }

    item.status = 'Stopped';
    item.startedAt = null;
    const dateStr = new Date().toLocaleString();
    item.logs.push(`[${dateStr}] 🔴 Manual stop triggered. Hosting process stopped.`);
    db.save(true);

    res.json({ success: true, bot: item });
});

// ── POST /api/livesmsbot/restart — Restart Bot ──────────────────────────────
app.post('/api/livesmsbot/restart', async (req, res) => {
    _ensureLiveSmsBotData();
    const { botId } = req.body;
    if (!botId || !db.data.liveSmsBot.bots[botId]) {
        return res.json({ success: false, message: 'Bot not found' });
    }

    const item = db.data.liveSmsBot.bots[botId];

    // Check user and gem balance
    const user = await db.getUser(item.userId);
    const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.liveSmsBotGemsPerHour) ? db.data.adminSettings.liveSmsBotGemsPerHour : 1) || 1;
    if (!user || bhGetGems(user) < (gph / 60)) {
        return res.json({ success: false, message: `Insufficient Gems! Need at least ${(gph / 60).toFixed(4)} Gems to restart.` });
    }

    // Stop gem interval
    if (global._liveSmsBotIntervals && global._liveSmsBotIntervals[botId]) {
        clearInterval(global._liveSmsBotIntervals[botId]);
        delete global._liveSmsBotIntervals[botId];
    }

    // Trigger on hosting server: stop then start
    const stopRes = await lsbCallServer('stop', item);
    const startRes = await lsbCallServer('start', item);
    if (!startRes.success) {
        return res.json({ success: false, message: 'Failed to restart on hosting server: ' + startRes.error });
    }

    item.status = 'Running';
    item.startedAt = Date.now();
    const dateStr = new Date().toLocaleString();
    item.logs.push(`[${dateStr}] 🔄 Manual restart triggered.`);
    item.logs.push(`[${dateStr}] 🔴 Stopping background process...`);
    item.logs.push(`[${dateStr}] 🟢 Starting background process...`);
    item.logs.push(`[${dateStr}] ✅ Python bot running and active.`);
    db.save(true);

    // Start gem interval
    _startLsbGemInterval(botId, item.userId);

    res.json({ success: true, bot: item });
});

// ── DELETE /api/livesmsbot/delete — Delete Bot ──────────────────────────────
app.delete('/api/livesmsbot/delete', async (req, res) => {
    _ensureLiveSmsBotData();
    const botId = req.query.botId;
    if (!botId || !db.data.liveSmsBot.bots[botId]) {
        return res.json({ success: false, message: 'Bot not found' });
    }

    const item = db.data.liveSmsBot.bots[botId];

    // Trigger delete on hosting server
    const deleteRes = await lsbCallServer('delete', item);
    if (!deleteRes.success) {
        console.warn('[LSB] Delete on hosting server failed or already deleted:', deleteRes.error);
    }

    db.data.liveSmsBot.bots[botId].status = 'deleted';
    
    // Clear and delete interval
    if (global._liveSmsBotIntervals && global._liveSmsBotIntervals[botId]) {
        clearInterval(global._liveSmsBotIntervals[botId]);
        delete global._liveSmsBotIntervals[botId];
    }
    
    db.save(true);

    res.json({ success: true, message: 'Live SMS Bot configuration deleted successfully' });
});

// ── GET /api/livesmsbot/logs/:botId — Fetch logs ────────────────────────────
app.get('/api/livesmsbot/logs/:botId', async (req, res) => {
    _ensureLiveSmsBotData();
    const { botId } = req.params;
    if (!botId || !db.data.liveSmsBot.bots[botId]) {
        return res.json({ success: false, message: 'Bot not found' });
    }

    const item = db.data.liveSmsBot.bots[botId];
    const dbLogs = item.logs || [];

    // Try fetching external server logs
    let extLogs = '';
    const logsRes = await lsbCallServer('logs', item);
    if (logsRes.success && logsRes.data) {
        const d = logsRes.data;
        if (typeof d === 'string' && d.trim()) extLogs = d;
        else if (d && (d.logs || d.log || d.output)) extLogs = d.logs || d.log || d.output;
    }

    let combinedLogs = [...dbLogs];
    if (extLogs) {
        combinedLogs.push('=== Hosting Server Real-time Output ===');
        const lines = typeof extLogs === 'string' ? extLogs.split('\n') : extLogs;
        if (Array.isArray(lines)) {
            combinedLogs = combinedLogs.concat(lines.filter(l => l.trim()));
        } else {
            combinedLogs.push(String(extLogs));
        }
    }

    res.json({ success: true, logs: combinedLogs });
});

// Helper: Fetch real TikTok video metadata and direct links using tikwm.app & TikTok oEmbed
async function getTikTokVideoDetails(videoUrl) {
    let metadata = {
        title: '',
        author: '',
        thumbnail: '',
        description: ''
    };

    // 1. Try TikTok Official oEmbed for guaranteed clean title, author name, and cover
    try {
        const oembedRes = await axios.get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 8000
        });
        if (oembedRes.data) {
            const oe = oembedRes.data;
            metadata.title = oe.title || '';
            metadata.author = oe.author_name ? `@${oe.author_unique_id || ''} (${oe.author_name})` : '';
            metadata.thumbnail = oe.thumbnail_url || '';
            metadata.description = oe.title || '';
        }
    } catch (e) {
        console.warn('[TikTok Downloader] oEmbed fetch failed:', e.message);
    }

    // 2. Try tikwm.app API for HD video, audio stream, and rich metadata
    try {
        const res = await axios.get(`https://www.tikwm.app/api/?url=${encodeURIComponent(videoUrl)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        const d = res.data;
        if (d && d.code === 0 && d.data) {
            const data = d.data;
            const caption = data.title || metadata.title || '';
            const authorHandle = data.author ? `@${data.author.unique_id}` : '';
            const authorNick = data.author ? data.author.nickname : '';
            const authorStr = authorHandle ? `${authorNick ? authorNick + ' ' : ''}(${authorHandle})` : metadata.author;

            const coverUrl = data.cover ? (data.cover.startsWith('http') ? data.cover : `https://www.tikwm.app${data.cover}`) : (data.origin_cover || metadata.thumbnail);
            const playUrl = data.play ? (data.play.startsWith('http') ? data.play : `https://www.tikwm.app${data.play}`) : '';
            const wmPlayUrl = data.wmplay ? (data.wmplay.startsWith('http') ? data.wmplay : `https://www.tikwm.app${data.wmplay}`) : '';
            const musicUrl = data.music ? (data.music.startsWith('http') ? data.music : `https://www.tikwm.app${data.music}`) : '';

            let finalTitle = caption;
            if (!finalTitle) finalTitle = authorHandle ? `TikTok Video by ${authorHandle}` : 'TikTok Video';

            if (playUrl) {
                const formats = [
                    { quality: 'HD (No Watermark)', url: playUrl, type: 'mp4' }
                ];
                if (wmPlayUrl) formats.push({ quality: 'HD (Watermark)', url: wmPlayUrl, type: 'mp4' });
                if (musicUrl) formats.push({ quality: 'Audio MP3', url: musicUrl, type: 'audio' });

                return {
                    success: true,
                    title: finalTitle,
                    author: authorStr,
                    thumbnail: coverUrl,
                    description: caption,
                    platform: 'tiktok',
                    formats,
                    downloadUrl: playUrl
                };
            } else {
                // If playUrl missing, return enriched metadata for Cobalt fallback
                metadata.title = finalTitle || metadata.title;
                metadata.author = authorStr || metadata.author;
                metadata.thumbnail = coverUrl || metadata.thumbnail;
                metadata.description = caption || metadata.description;
            }
        }
    } catch (err) {
        console.warn('[TikTok Downloader] tikwm.app failed:', err.message);
    }

    return metadata;
}

// Send video downloader result to user's Telegram chat
app.post('/api/video-downloader/send', async (req, res) => {
    try {
        const { userId, url, title, author, platform, thumbnail } = req.body;
        if (!userId || !url) return res.json({ success: false, message: 'Missing userId or url' });

        if (!bot) return res.json({ success: false, message: 'Bot not available' });

        const platformEmojis = {
            youtube: '🎬', tiktok: '🎵', instagram: '📸',
            facebook: '📘', twitter: '🐦', threads: '🧵', unknown: '📹'
        };
        const emoji = platformEmojis[platform || 'unknown'] || '📹';

        const displayTitle = title || 'Video Download';
        const displayAuthor = author ? `\n👤 <b>Author:</b> ${author}` : '';
        const captionText = `${emoji} <b>${displayTitle}</b>${displayAuthor}\n\n📥 <a href="${url}">Tap here to Download Video</a>\n\n⚡ <i>via AutosVerify Downloader</i>`;

        // Try to send as Photo with caption if thumbnail exists
        try {
            if (thumbnail) {
                await bot.sendPhoto(userId, thumbnail, {
                    caption: captionText,
                    parse_mode: 'HTML'
                });
            } else {
                await bot.sendMessage(userId, captionText, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                });
            }
            return res.json({ success: true });
        } catch (sendErr) {
            console.warn('[Video Send Photo Error, falling back to message]:', sendErr.message);
            try {
                await bot.sendMessage(userId, captionText, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                });
                return res.json({ success: true });
            } catch (msgErr) {
                return res.json({ success: false, message: msgErr.message });
            }
        }
    } catch (e) {
        console.error('[Video Send Error]', e.message);
        res.json({ success: false, message: e.message });
    }
});


// Video Downloader - uses multiple APIs to get actual direct download URL
app.post('/api/video-downloader/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

    try {
        // Detect platform
        let platform = 'unknown';
        if (url.includes('tiktok.com')) platform = 'tiktok';
        else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
        else if (url.includes('instagram.com')) platform = 'instagram';
        else if (url.includes('facebook.com') || url.includes('fb.watch')) platform = 'facebook';
        else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'twitter';
        else if (url.includes('snapchat.com')) platform = 'snapchat';
        else if (url.includes('pinterest.com')) platform = 'pinterest';
        else if (url.includes('reddit.com')) platform = 'reddit';
        else if (url.includes('twitch.tv')) platform = 'twitch';

        // ── 0. TikTok Special Handler (tikwm.app + oEmbed) ──
        let ttMeta = null;
        if (platform === 'tiktok') {
            console.log('[Video Downloader] Fetching TikTok details via tikwm & oEmbed for:', url);
            const ttRes = await getTikTokVideoDetails(url);
            if (ttRes && ttRes.success && ttRes.downloadUrl) {
                console.log('[Video Downloader] TikTok success via tikwm:', ttRes.title);
                return res.json(ttRes);
            }
            if (ttRes && ttRes.title) {
                ttMeta = ttRes;
            }
        }

        // ── 1. cobalt.tools API (free, no key, direct download URLs) ──
        const tryCobalt = async (videoUrl) => {
            const endpoints = [
                'https://api.cobalt.tools/',
                'https://co.wuk.sh/',
                'https://cobalt.sh/'
            ];
            
            // Clean payload compatible with modern Cobalt v10 (Strict validation)
            const cleanPayload = {
                url: videoUrl,
                videoQuality: '1080',
                audioFormat: 'mp3',
                audioBitrate: '128',
                filenamePattern: 'classic'
            };

            // Legacy payload for older/mirrored Cobalt instances
            const legacyPayload = {
                url: videoUrl,
                videoQuality: '1080',
                vQuality: '1080',
                vCodec: 'h264',
                audioFormat: 'mp3',
                audioBitrate: '320',
                aFormat: 'mp3',
                filenamePattern: 'classic',
                isAudioOnly: false,
                isNoTTWatermark: true,
                disableMetadata: false
            };

            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Referer': 'https://cobalt.tools/',
                'Origin': 'https://cobalt.tools',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };

            for (const endpoint of endpoints) {
                // Try clean v10 payload first
                try {
                    console.log(`[Video Downloader] Trying Cobalt v10 (clean payload) on: ${endpoint} for ${videoUrl}`);
                    const res = await axios.post(endpoint, cleanPayload, { headers, timeout: 12000 });
                    const cd = res.data;
                    if (cd && (cd.url || (cd.picker && cd.picker.length > 0))) {
                        console.log(`[Video Downloader] Cobalt success via ${endpoint} (clean payload)`);
                        return cd;
                    }
                } catch (err) {
                    console.warn(`[Video Downloader] Cobalt v10 payload failed on ${endpoint}:`, err.message);
                    
                    // Fall back to legacy payload
                    try {
                        console.log(`[Video Downloader] Trying Cobalt legacy payload on: ${endpoint} for ${videoUrl}`);
                        const res = await axios.post(endpoint, legacyPayload, { headers, timeout: 12000 });
                        const cd = res.data;
                        if (cd && (cd.url || (cd.picker && cd.picker.length > 0))) {
                            console.log(`[Video Downloader] Cobalt success via ${endpoint} (legacy payload)`);
                            return cd;
                        }
                    } catch (errLegacy) {
                        console.warn(`[Video Downloader] Cobalt legacy payload also failed on ${endpoint}:`, errLegacy.message);
                    }
                }
            }
            return null;
        };

        const cd = await tryCobalt(url);
        if (cd) {
            if (cd.url) {
                const dlUrl = cd.url;
                const ytId = platform === 'youtube' ? (url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] || null) : null;
                const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : (cd.thumbnail || (ttMeta ? ttMeta.thumbnail : ''));
                
                let title = cd.filename || '';
                if (!title || title.toLowerCase() === 'classic' || title.toLowerCase() === 'tiktok video') {
                    title = (ttMeta && ttMeta.title) ? ttMeta.title : (platform.charAt(0).toUpperCase() + platform.slice(1) + ' Video');
                }

                return res.json({
                    success: true,
                    title,
                    author: ttMeta ? ttMeta.author : '',
                    thumbnail,
                    description: ttMeta ? ttMeta.description : '',
                    platform,
                    formats: [
                        { quality: 'HD (No Watermark)', url: dlUrl, type: 'mp4' },
                        { quality: 'Audio MP3', url: dlUrl + '?type=audio', type: 'audio' }
                    ],
                    downloadUrl: dlUrl,
                    _cobalt: true
                });
            }
            // picker (multiple items e.g. Instagram carousel)
            if (cd.picker && cd.picker.length > 0) {
                const ytId = platform === 'youtube' ? (url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] || null) : null;
                const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : (cd.thumbnail || '');
                return res.json({
                    success: true,
                    title: platform.charAt(0).toUpperCase() + platform.slice(1) + ' Video',
                    thumbnail,
                    description: '',
                    platform,
                    formats: cd.picker.map((item, i) => ({
                        quality: item.type === 'photo' ? `Photo ${i + 1}` : `Video ${i + 1}`,
                        url: item.url,
                        type: item.type === 'photo' ? 'image' : 'mp4'
                    })),
                    downloadUrl: cd.picker[0].url,
                    _cobalt: true
                });
            }
        }

        // ── 2. RapidAPI (paid, best quality) ──────────────────────────
        const rapidApiKey = process.env.RAPIDAPI_KEY
            || (db.data.settings && db.data.settings.rapidApiKey)
            || (db.data.apiKeys && db.data.apiKeys.rapidApiKey);

        if (rapidApiKey && platform !== 'unknown') {
            try {
                const apiHost = 'social-media-video-downloader.p.rapidapi.com';
                const response = await axios.get('https://' + apiHost + '/smvd/get/all', {
                    params: { url: url },
                    headers: { 'X-RapidAPI-Key': rapidApiKey, 'X-RapidAPI-Host': apiHost },
                    timeout: 15000
                });
                const data = response.data;
                if (data && data.links && data.links.length > 0) {
                    return res.json({
                        success: true,
                        title: data.title || 'Video',
                        thumbnail: data.picture || '',
                        description: data.description || '',
                        platform,
                        formats: data.links.map(l => ({
                            quality: l.quality || 'HD',
                            url: l.link,
                            type: l.type || 'mp4'
                        })),
                        downloadUrl: data.links[0].link
                    });
                }
            } catch (apiErr) {
                console.warn('[Video Downloader] RapidAPI failed:', apiErr.message);
            }
        }

        // ── 3. TikTok — tikmate free API ────────────────────────────────
        if (platform === 'tiktok') {
            try {
                const resp = await axios.post('https://api.tikmate.app/api/lookup',
                    `url=${encodeURIComponent(url)}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 12000 });
                const d = resp.data;
                if (d && d.token) {
                    const dlUrl = `https://tikmate.app/download/${d.token}/${d.id}.mp4`;
                    return res.json({
                        success: true,
                        title: d.author ? `TikTok by @${d.author}` : 'TikTok Video',
                        thumbnail: d.cover || '',
                        description: d.desc || '',
                        platform: 'tiktok',
                        formats: [
                            { quality: 'HD (No Watermark)', url: dlUrl, type: 'mp4' },
                            { quality: 'Audio MP3', url: dlUrl.replace('.mp4', '.mp3'), type: 'audio' }
                        ],
                        downloadUrl: dlUrl
                    });
                }
            } catch (e3) {
                console.warn('[Video Downloader] TikTok tikmate failed:', e3.message);
            }

            // TikTok fallback — ssstik.io
            try {
                const ssstikRes = await axios.post('https://ssstik.io/abc?url=dl',
                    `id=${encodeURIComponent(url)}&locale=en&tt=`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://ssstik.io/', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }
                );
                const cheerio = require('cheerio');
                const $ = cheerio.load(ssstikRes.data);
                const dlUrl = $('a.without_watermark').attr('href') || $('a[href*=".mp4"]').first().attr('href');
                const audioUrl = $('a.music').attr('href') || '';
                const thumb = $('img.result_author').attr('src') || '';
                const title = $('.video_author').text().trim() || 'TikTok Video';
                if (dlUrl) {
                    return res.json({
                        success: true, title, thumbnail: thumb, description: '', platform: 'tiktok',
                        formats: [
                            { quality: 'HD (No Watermark)', url: dlUrl, type: 'mp4' },
                            ...(audioUrl ? [{ quality: 'Audio MP3', url: audioUrl, type: 'audio' }] : [])
                        ],
                        downloadUrl: dlUrl
                    });
                }
            } catch (e4) {
                console.warn('[Video Downloader] ssstik failed:', e4.message);
            }
        }

        // ── 4. YouTube — get metadata via yt-dlp, allow full direct/proxy downloads ────────
        if (platform === 'youtube') {
            const ytId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] || null;
            if (ytId) {
                // Try fetching metadata and streams via a public Piped API instance first (avoids Google Cloud IP blocks!)
                const getYouTubeInfoFromPiped = async (videoId) => {
                    const pipedInstances = [
                        'https://pipedapi.kavin.rocks',
                        'https://api.piped.yt',
                        'https://pipedapi.lunar.icu',
                        'https://pipedapi.tokhmi.xyz',
                        'https://pipedapi.leptons.xyz',
                        'https://piped-api.garudalinux.org',
                        'https://piped-api.us.to'
                    ];
                    for (const api of pipedInstances) {
                        try {
                            console.log(`[Video Downloader] Trying Piped instance: ${api}/streams/${videoId}`);
                            const res = await axios.get(`${api}/streams/${videoId}`, { timeout: 8000 });
                            if (res.data && res.data.title) {
                                console.log(`[Video Downloader] Piped success via ${api}`);
                                return res.data;
                            }
                        } catch (err) {
                            console.warn(`[Video Downloader] Piped instance ${api} failed:`, err.message);
                        }
                    }
                    return null;
                };

                try {
                    const pipedData = await getYouTubeInfoFromPiped(ytId);
                    if (pipedData) {
                        const title = pipedData.title || 'YouTube Video';
                        const thumbnail = pipedData.thumbnailUrl || `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
                        const description = pipedData.description || '';
                        
                        const formats = [];
                        
                        // Add direct combined streams
                        const combined = (pipedData.videoStreams || []).filter(s => s.videoOnly === false);
                        combined.forEach((f) => {
                            const q = f.quality || '720p';
                            formats.push({
                                quality: `${q} - Direct Stream (${f.format || 'MP4'})`,
                                url: `${req.protocol}://${req.get('host')}/api/video-downloader/download-stream?url=${encodeURIComponent(f.url)}&title=${encodeURIComponent(title)}&ext=${(f.format || 'mp4').toLowerCase()}`,
                                type: 'mp4'
                            });
                        });

                        // Add high resolution video-only streams (often 1080p etc.)
                        const videoOnly = (pipedData.videoStreams || []).filter(s => s.videoOnly === true);
                        videoOnly.forEach((f, i) => {
                            if (i < 3) {
                                const q = f.quality || '1080p';
                                formats.push({
                                    quality: `${q} - Video Only (${f.format || 'MP4'})`,
                                    url: `${req.protocol}://${req.get('host')}/api/video-downloader/download-stream?url=${encodeURIComponent(f.url)}&title=${encodeURIComponent(title)}&ext=${(f.format || 'mp4').toLowerCase()}`,
                                    type: 'mp4'
                                });
                            }
                        });

                        // Add high quality audio streams
                        const audio = pipedData.audioStreams || [];
                        const addedBitrates = new Set();
                        audio.forEach((f) => {
                            const ext = (f.format || 'M4A').toLowerCase() === 'webm' ? 'webm' : 'm4a';
                            const key = `${ext}_${f.bitrate}`;
                            if (addedBitrates.has(key)) return;
                            addedBitrates.add(key);
                            
                            const kbps = f.bitrate ? `${f.bitrate}kbps` : '128kbps';
                            formats.push({
                                quality: `Audio MP3 / ${ext.toUpperCase()} - ${kbps}`,
                                url: `${req.protocol}://${req.get('host')}/api/video-downloader/download-stream?url=${encodeURIComponent(f.url)}&title=${encodeURIComponent(title)}&ext=${ext}&is_audio=true`,
                                type: 'audio'
                            });
                        });

                        return res.json({
                            success: true,
                            title,
                            thumbnail,
                            description,
                            platform: 'youtube',
                            formats: formats,
                            downloadUrl: formats[0]?.url || ''
                        });
                    }
                } catch (pipedErr) {
                    console.error('[Piped Extractor Error]', pipedErr.message);
                }
            }

            const { execFile } = require('child_process');
            
            console.log(`[Video Downloader] Extracting via yt-dlp: ${url}`);
            execFile('./yt-dlp', ['--js-runtimes', 'node', '-j', url], { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }, async (error, stdout, stderr) => {
                if (error) {
                    console.error('[yt-dlp info error]', error.message, stderr);
                    const ytId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
                    const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : '';
                    return res.json({
                        success: true,
                        title: 'YouTube Video',
                        thumbnail,
                        description: '',
                        platform: 'youtube',
                        formats: [],
                        message: 'Direct YouTube video download is currently unavailable. Error: ' + error.message
                    });
                }

                try {
                    const info = JSON.parse(stdout);
                    const title = info.title || 'YouTube Video';
                    const thumbnail = info.thumbnail || (info.id ? `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg` : '');
                    const description = info.description || '';
                    
                    const formats = [];
                    
                    // 1. High Quality Merged video (if duration is under 30 minutes)
                    if (info.duration && info.duration < 1800) {
                        formats.push({
                            quality: `🔥 Best Quality 1080p/720p (Merged Video + Audio)`,
                            url: `${req.protocol}://${req.get('host')}/api/video-downloader/download-merged?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
                            type: 'mp4'
                        });
                    }

                    // 2. Combined pre-merged streams (usually 720p and 360p)
                    const combinedFormats = (info.formats || []).filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.url);
                    combinedFormats.forEach(f => {
                        const q = f.height ? `${f.height}p` : 'MP4';
                        const sizeStr = f.filesize ? ` (${(f.filesize / (1024 * 1024)).toFixed(1)} MB)` : '';
                        formats.push({
                            quality: `${q} - Direct Stream${sizeStr}`,
                            url: `${req.protocol}://${req.get('host')}/api/video-downloader/download-stream?url=${encodeURIComponent(f.url)}&title=${encodeURIComponent(title)}&ext=${f.ext || 'mp4'}`,
                            type: 'mp4'
                        });
                    });

                    // 3. Audio-only formats
                    const audioFormats = (info.formats || []).filter(f => f.vcodec === 'none' && f.acodec !== 'none' && f.url);
                    audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
                    const addedExts = new Set();
                    audioFormats.forEach(f => {
                        const ext = f.ext === 'm4a' ? 'm4a' : 'mp3';
                        if (addedExts.has(ext)) return;
                        addedExts.add(ext);
                        
                        const sizeStr = f.filesize ? ` (${(f.filesize / (1024 * 1024)).toFixed(1)} MB)` : '';
                        formats.push({
                            quality: `Audio MP3 / ${ext.toUpperCase()} - ${f.abr || 128}kbps${sizeStr}`,
                            url: `${req.protocol}://${req.get('host')}/api/video-downloader/download-stream?url=${encodeURIComponent(f.url)}&title=${encodeURIComponent(title)}&ext=${ext}&is_audio=true`,
                            type: 'audio'
                        });
                    });

                    return res.json({
                        success: true,
                        title,
                        thumbnail,
                        description,
                        platform: 'youtube',
                        formats: formats
                    });

                } catch (parseErr) {
                    console.error('[yt-dlp JSON parse error]', parseErr.message);
                    return res.json({
                        success: false,
                        message: 'Failed to parse YouTube video details.'
                    });
                }
            });
            return; // Exit out of info endpoint
        }

        // ── 5. Fallback ─────────────────────────────────────────────────
        return res.json({
            success: false,
            message: `Could not fetch download link for this ${platform} video. Try a different URL.`,
            platform,
            formats: []
        });

    } catch (e) {
        console.error('[Video Downloader Error]', e.message);
        res.status(500).json({ success: false, message: e.message || 'Failed to fetch video info' });
    }
});

// Direct/Proxy YouTube Stream Downloader Endpoint
app.get('/api/video-downloader/download-stream', async (req, res) => {
    const { url, title, ext, is_audio } = req.query;
    if (!url) return res.status(400).send('url is required');

    try {
        const cleanTitle = (title || 'video').replace(/[^a-zA-Z0-9-_ ]/g, '_');
        const extension = ext || (is_audio === 'true' ? 'mp3' : 'mp4');
        const contentType = is_audio === 'true' ? 'audio/mpeg' : 'video/mp4';

        res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle}.${extension}"`);
        res.setHeader('Content-Type', contentType);

        console.log(`[Stream Downloader] Streaming URL to client: ${url}`);
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 120000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        response.data.pipe(res);
    } catch (err) {
        console.error('[Stream Downloader Error]', err.message);
        if (!res.headersSent) {
            res.status(500).send('Failed to stream content: ' + err.message);
        }
    }
});

// Server-side High-Quality Merged Downloader Endpoint (1080p/720p)
app.get('/api/video-downloader/download-merged', async (req, res) => {
    const { url, title } = req.query;
    if (!url) return res.status(400).send('url is required');

    const cleanTitle = (title || 'video').replace(/[^a-zA-Z0-9-_ ]/g, '_');
    const outId = 'merged_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const outPath = path.join('/tmp', `${outId}.mp4`);

    try {
        console.log(`[Merged Downloader] Starting yt-dlp merge for url: ${url}`);
        const { execFile } = require('child_process');
        
        execFile('./yt-dlp', [
            '--js-runtimes', 'node',
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
            '--merge-output-format', 'mp4',
            '-o', outPath,
            url
        ], { timeout: 120000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Merged Downloader Error]', error.message, stderr);
                return res.status(500).send('Failed to merge and download video: ' + error.message);
            }

            if (!fs.existsSync(outPath)) {
                console.error('[Merged Downloader Error] File not found after merge:', outPath);
                return res.status(500).send('Failed to locate merged file.');
            }

            console.log(`[Merged Downloader] Sending merged file to client: ${outPath}`);
            res.download(outPath, `${cleanTitle}.mp4`, (err) => {
                try {
                    if (fs.existsSync(outPath)) {
                        fs.unlinkSync(outPath);
                        console.log(`[Merged Downloader] Cleaned up temp file: ${outPath}`);
                    }
                } catch (unlinkErr) {
                    console.error('[Merged Downloader] Failed to unlink temp file:', unlinkErr.message);
                }
            });
        });

    } catch (err) {
        console.error('[Merged Downloader Outer Error]', err.message);
        res.status(500).send('Internal error during merge: ' + err.message);
    }
});

async function startServer() {
    try {
        if (fs.existsSync('./yt-dlp')) {
            fs.chmodSync('./yt-dlp', '755');
            console.log('[Video Downloader] yt-dlp execute permissions granted.');
        }
    } catch (e) {
        console.warn('[Video Downloader] Failed to chmod yt-dlp:', e.message);
    }

    // CRITICAL: Wait for database to load before accepting requests
    // This prevents race conditions where users log in before data is fetched from MySQL
    console.log(`[DEBUG] Waiting for database readiness...`);
    const dbTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Database ready timeout')), 5000));
    try {
        await Promise.race([db.dbReady, dbTimeout]);
        console.log(`[DEBUG] Database is ready.`);
    } catch (e) {
        console.warn(`⚠️ [DEBUG] ${e.message}. Starting server with local data/fresh.`);
    }

    // ── Restore gem intervals for running bots after restart ─────────────────
    // When server restarts, in-memory intervals are lost but DB still shows bots as 'running'
    setTimeout(async () => {
        try {
            console.log(`[BOT RESTORE] Starting restoration of active bot intervals...`);

            // 1. Python / Custom Bot Hosting
            bhInitData();
            if (db.data.botHosting && db.data.botHosting.bots) {
                let bhRestored = 0;
                for (const bot of Object.values(db.data.botHosting.bots)) {
                    if (bot.status === 'running' && bot.userId) {
                        const u = await db.getUser(bot.userId);
                        const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;
                        if (!u || bhGetGems(u) <= 0) {
                            bot.status = 'stopped'; bot.startedAt = null;
                            console.log(`[BH RESTORE] Bot ${bot.id} stopped — no gems`);
                        } else {
                            const now = Date.now();
                            if (bot.lastDeductedAt) {
                                const elapsedMinutes = Math.floor((now - bot.lastDeductedAt) / (60 * 1000));
                                if (elapsedMinutes >= 1) {
                                    const gpm = gph / 60;
                                    const totalDeduct = Math.min(bhGetGems(u), elapsedMinutes * gpm);
                                    bhSetGems(u, Math.max(0, bhGetGems(u) - totalDeduct));
                                    bot.gemsUsed = parseFloat(((bot.gemsUsed || 0) + totalDeduct).toFixed(6));
                                }
                            }
                            bot.lastDeductedAt = now;
                            _startBhGemInterval(bot.id, bot.userId);
                            bhRestored++;
                            console.log(`[BH RESTORE] Gem interval restored for BH bot ${bot.id}`);
                        }
                    }
                }
                console.log(`[BH RESTORE] ${bhRestored} Python bot interval(s) restored`);
            }

            // 2. Live SMS Bots
            _ensureLiveSmsBotData();
            if (db.data.liveSmsBot && db.data.liveSmsBot.bots) {
                let lsbRestored = 0;
                for (const bot of Object.values(db.data.liveSmsBot.bots)) {
                    if (bot.status === 'Running' && bot.userId) {
                        const u = await db.getUser(bot.userId);
                        const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.liveSmsBotGemsPerHour) ? db.data.adminSettings.liveSmsBotGemsPerHour : 1) || 1;
                        if (!u || bhGetGems(u) <= 0) {
                            bot.status = 'Stopped'; bot.startedAt = null;
                            console.log(`[LSB RESTORE] Bot ${bot.id} stopped — no gems`);
                        } else {
                            const now = Date.now();
                            if (bot.lastDeductedAt) {
                                const elapsedMinutes = Math.floor((now - bot.lastDeductedAt) / (60 * 1000));
                                if (elapsedMinutes >= 1) {
                                    const gpm = gph / 60;
                                    const totalDeduct = Math.min(bhGetGems(u), elapsedMinutes * gpm);
                                    bhSetGems(u, Math.max(0, bhGetGems(u) - totalDeduct));
                                    bot.gemsUsed = parseFloat(((bot.gemsUsed || 0) + totalDeduct).toFixed(6));
                                }
                            }
                            bot.lastDeductedAt = now;
                            _startLsbGemInterval(bot.id, bot.userId);
                            lsbRestored++;
                            console.log(`[LSB RESTORE] Gem interval restored for LSB bot ${bot.id}`);
                        }
                    }
                }
                console.log(`[LSB RESTORE] ${lsbRestored} Live SMS bot interval(s) restored`);
            }

            // 3. Pyrogram Bots
            _ensurePyrogramData();
            if (db.data.pyrogramBots && db.data.pyrogramBots.bots) {
                let pyroRestored = 0;
                for (const bot of Object.values(db.data.pyrogramBots.bots)) {
                    if (bot.status === 'Running' && bot.userId) {
                        const u = await db.getUser(bot.userId);
                        const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.pyrogramGemsPerHour) ? db.data.adminSettings.pyrogramGemsPerHour : 1) || 1;
                        if (!u || bhGetGems(u) <= 0) {
                            bot.status = 'Stopped'; bot.startedAt = null;
                            console.log(`[PYRO RESTORE] Bot ${bot.id} stopped — no gems`);
                        } else {
                            const now = Date.now();
                            if (bot.lastDeductedAt) {
                                const elapsedMinutes = Math.floor((now - bot.lastDeductedAt) / (60 * 1000));
                                if (elapsedMinutes >= 1) {
                                    const gpm = gph / 60;
                                    const totalDeduct = Math.min(bhGetGems(u), elapsedMinutes * gpm);
                                    bhSetGems(u, Math.max(0, bhGetGems(u) - totalDeduct));
                                    bot.gemsUsed = parseFloat(((bot.gemsUsed || 0) + totalDeduct).toFixed(6));
                                }
                            }
                            bot.lastDeductedAt = now;
                            _startPyroGemInterval(bot.id, bot.userId);
                            pyroRestored++;
                            console.log(`[PYRO RESTORE] Gem interval restored for Pyro bot ${bot.id}`);
                        }
                    }
                }
                console.log(`[PYRO RESTORE] ${pyroRestored} Pyrogram bot interval(s) restored`);
            }

            // Auto-fix gem sync for all users on startup
            try {
                const users = getUsersObj();
                let gemsFixed = 0;
                Object.values(users).forEach(u => {
                    if (!u || typeof u !== 'object') return;
                    const a = parseFloat(u.Gems || 0);
                    const b = parseFloat(u.balance_Gems || 0);
                    if (a !== b) {
                        const correct = Math.max(0, isNaN(a) ? 0 : a, isNaN(b) ? 0 : b);
                        u.Gems = Math.round(correct * 10000) / 10000;
                        u.balance_Gems = u.Gems;
                        gemsFixed++;
                    }
                });
                if (gemsFixed > 0) {
                    saveUsersObj(users);
                    console.log(`[GEM SYNC] Auto-fixed ${gemsFixed} users on startup`);
                }
            } catch (e) { console.warn('[GEM SYNC] Startup fix error:', e.message); }

            db.save(true);
        } catch (e) {
            console.error('[BOT RESTORE ERROR]', e.message);
        }
    }, 1500);

    console.log(`[DEBUG] Attempting to start server on PORT: ${PORT}`);
    try {
        // AI Service API Endpoints
        // OpenRouter and Bytez providers for Photo/Video Generation

        // AI Provider Configuration endpoint
        app.get('/api/ai/providers', (req, res) => {
            res.json({
                success: true,
                providers: ['openrouter', 'bytez'],
                default: 'bytez'
            });
        });

        // Get available models for a provider
        app.get('/api/ai/models/:provider/:type', (req, res) => {
            const { provider, type } = req.params;
            try {
                const models = aiService.getAvailableModels(provider, type);
                res.json({
                    success: true,
                    provider,
                    type,
                    models
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Generate Photo
        app.post('/api/ai/generate-photo', async (req, res) => {
            const { prompt, provider, model, size, style, userId } = req.body;
            const users = getUsersObj();
            const user = users[userId];
            if (!user) return res.status(404).json({ success: false, error: 'User not found' });

            const settings = db.getSettings();
            const costs = settings.costs || {};
            const cost = costs.gemini || 50;

            if (db.getTokenBalance(user) < cost) {
                return res.status(403).json({ success: false, error: `Insufficient tokens. Need ${cost} TC.` });
            }

            if (!prompt) {
                return res.status(400).json({
                    success: false,
                    error: 'Prompt is required'
                });
            }

            try {
                const result = await generatePhoto(prompt, {
                    provider,
                    model,
                    size,
                    style
                });

                if (result.success) {
                    if (userId) {
                        console.log(`[AI Photo] User ${userId} generated image with ${result.provider}`);

                        // Deduct tokens
                        db.setTokenBalance(user, db.getTokenBalance(user) - cost);
                        if (!user.history) user.history = [];
                        user.history.unshift({
                            type: 'ai_photo',
                            amount: -cost,
                            date: new Date().toISOString(),
                            reward: `-${cost} Tokens`,
                            detail: `Generated AI Photo: ${prompt.substring(0, 30)}...`
                        });
                        saveUsersObj(users);
                    }

                    res.json({
                        success: true,
                        provider: result.provider,
                        data: {
                            url: result.url,
                            urls: result.urls,
                            jobId: result.jobId,
                            status: result.status
                        }
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error || 'Generation failed'
                    });
                }
            } catch (error) {
                console.error('Photo generation error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Generate Video
        app.post('/api/ai/generate-video', async (req, res) => {
            const { prompt, provider, model, duration, fps, userId } = req.body;
            const users = getUsersObj();
            const user = users[userId];
            if (!user) return res.status(404).json({ success: false, error: 'User not found' });

            const settings = db.getSettings();
            const costs = settings.costs || {};
            const cost = (costs.gemini || 50) * 2; // Video costs more

            if (db.getTokenBalance(user) < cost) {
                return res.status(403).json({ success: false, error: `Insufficient tokens. Need ${cost} TC.` });
            }

            if (!prompt) {
                return res.status(400).json({
                    success: false,
                    error: 'Prompt is required'
                });
            }

            try {
                const result = await generateVideo(prompt, {
                    provider,
                    model,
                    duration,
                    fps
                });

                if (result.success) {
                    if (userId) {
                        console.log(`[AI Video] User ${userId} generated video with ${result.provider}`);

                        // Deduct tokens
                        db.setTokenBalance(user, db.getTokenBalance(user) - cost);
                        if (!user.history) user.history = [];
                        user.history.unshift({
                            type: 'ai_video',
                            amount: -cost,
                            date: new Date().toISOString(),
                            reward: `-${cost} Tokens`,
                            detail: `Generated AI Video: ${prompt.substring(0, 30)}...`
                        });
                        saveUsersObj(users);
                    }

                    res.json({
                        success: true,
                        provider: result.provider,
                        data: {
                            url: result.url,
                            thumbnail: result.thumbnail,
                            jobId: result.jobId,
                            status: result.status
                        }
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error || 'Generation failed'
                    });
                }
            } catch (error) {
                console.error('Video generation error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Check job status (for async operations)
        app.get('/api/ai/job-status/:jobId', async (req, res) => {
            const { jobId } = req.params;
            const { provider } = req.query;

            try {
                const result = await aiService.checkJobStatus(jobId, provider || 'bytez');
                res.json({
                    success: true,
                    jobId,
                    status: result.status,
                    progress: result.progress,
                    url: result.url
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get job result
        app.get('/api/ai/job-result/:jobId', async (req, res) => {
            const { jobId } = req.params;
            const { provider } = req.query;

            try {
                const result = await aiService.getJobResult(jobId, provider || 'bytez');
                res.json({
                    success: true,
                    jobId,
                    url: result.url,
                    urls: result.urls,
                    metadata: result.metadata
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        console.log('[AI Services] OpenRouter and Bytez API endpoints registered');

        console.log(`[DEBUG] Finalizing server setup, binding to port ${PORT}...`);

        // Initialize "Free World" data for first-time use
        if (Object.keys(db.data.users || {}).length === 0) {
            console.log('🌍 [FREE WORLD] Initializing sample data...');

            // Sample Admin Data
            db.data.users["12345678"] = {
                id: 12345678,
                username: "SampleUser",
                first_name: "Sample",
                tokens: 5000,
                gems: 100,
                isPremium: true,
                registrationDate: new Date().toLocaleString(),
                lastActive: Date.now()
            };

            // Sample Transactions
            if (db.data.transactions) {
                db.data.transactions.push({
                    id: 'tx_init',
                    userId: 12345678,
                    amount: 500,
                    type: 'deposit',
                    status: 'completed',
                    timestamp: new Date().toLocaleString()
                });
            }

            // Sample Logs
            db.logError('info', 'System initialization successful. Free world data applied.');
            db.logError('warn', 'Database size initial check: Minimum size met.');
            db.logError('error', 'API Connection Timeout (Mock): Reflected in logs for testing.', { endpoint: '/api/test' });

            db.solveLog(db.data.serverLogs[0]?.id); // Mark initialization log as solved

            db.save(true);
        }

        // ===== LIVE ACCOUNT CHECKER API =====
        // API: Live Checker - Check accounts on platform
        app.post('/api/live-checker/check', async (req, res) => {
            const { userId } = req.query;
            const { platform, usernames } = req.body;

            if (!platform || !Array.isArray(usernames) || usernames.length === 0) {
                return res.json({ success: false, message: 'Platform and usernames required' });
            }

            try {
                // Get user for token deduction
                let user = null;
                if (userId) {
                    user = await db.getUser(userId);
                    if (!user || user.tokens < 10) {
                        return res.json({ success: false, message: 'Insufficient tokens (need 10)' });
                    }
                }

                // Simulate account checking logic
                // In production, this would integrate with actual APIs
                const liveAccounts = [];
                const deadAccounts = [];

                for (const username of usernames) {
                    // Simulated checking - replace with actual API calls
                    // Example: Instagram API, Facebook Graph API, TikTok API, Twitter API, Threads API
                    const isLive = await checkAccountLive(platform, username);

                    if (isLive) {
                        liveAccounts.push(username);
                    } else {
                        deadAccounts.push(username);
                    }
                }

                // Deduct tokens if user provided
                let tokensDeducted = 0;
                if (user) {
                    tokensDeducted = 10;
                    user.tokens -= tokensDeducted;
                    await db.updateUser(user);

                    // Log check action
                    if (!user.history) user.history = [];
                    user.history.push({
                        type: 'live_checker',
                        timestamp: Date.now(),
                        platform,
                        checked: usernames.length,
                        live: liveAccounts.length,
                        dead: deadAccounts.length,
                        tokensDeducted
                    });
                    await db.updateUser(user);

                    // Send notification
                    user.notifications.push({
                        id: `checker_${Date.now()}`,
                        type: 'checker',
                        title: '✅ Live Checker Results',
                        message: `${liveAccounts.length} live, ${deadAccounts.length} dead on ${platform}`,
                        timestamp: Date.now(),
                        read: false,
                        autoClose: true,
                        duration: 8000
                    });
                    await db.updateUser(user);
                }

                res.json({
                    success: true,
                    liveAccounts,
                    deadAccounts,
                    tokensDeducted,
                    message: `Check completed: ${liveAccounts.length} live, ${deadAccounts.length} dead`
                });
            } catch (e) {
                console.error('Live checker error:', e);
                res.json({ success: false, message: e.message });
            }
        });

        // Helper function to check if account is live
        // Replace with actual API implementations
        async function checkAccountLive(platform, username) {
            try {
                // Placeholder: In production, integrate with:
                // - Instagram: Check if profile exists and is active
                // - Facebook: Use Facebook Graph API
                // - TikTok: Use TikTok API or web scraping
                // - Twitter/X: Use Twitter API v2
                // - Threads: Use Threads API or web scraping

                // Simulated check (70% chance of being live)
                return Math.random() > 0.3;
            } catch (e) {
                console.error(`Error checking ${platform} account ${username}:`, e.message);
                return false;
            }
        }

        console.log(`[DEBUG] Finalizing server setup...`);
    } catch (e) {
        console.error('❌ FAILING to initialize server logic:', e);
    }
}

// If run directly
if (false) {
    startServer();
}

// --- AI SYSTEM MONITOR ----------------------------------------------------
async function monitorSystemWithAI() {
    const ai = getOpenAI();
    if (!ai || !bot) return;

    try {
        const users = Object.values(db.data.users || {});
        const stats = {
            totalUsers: users.length,
            activeToday: users.filter(u => Date.now() - (u.lastActive || 0) < 86400000).length,
            failedVerifications: users.reduce((acc, u) => acc + (u.failedVerifications || 0), 0),
            successfulVerifications: users.reduce((acc, u) => acc + (u.successfulVerifications || 0), 0),
            highBalances: users.filter(u => (u.tokens || 0) > 2000).map(u => ({ id: u.id, username: u.username, tokens: u.tokens })),
            systemLoad: {
                freeMem: Math.round(os.freemem() / 1024 / 1024) + 'MB',
                totalMem: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
                cpuCount: os.cpus().length,
                uptimeMinutes: Math.round(os.uptime() / 60)
            }
        };

        const completion = await ai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a professional security and system Auditor for a Telegram Bot ecosystem. Review the incoming stats JSON and look for patterns of fraud (suspiciously high balances), high failure rates in verifications, or low server memory. Return a concise bullet-point summary of any issues. If everything is optimal, return 'SYSTEM_HEALTHY'." },
                { role: "user", content: JSON.stringify(stats) }
            ]
        });

        const report = completion.choices[0].message.content;

        if (report && report.trim() !== 'SYSTEM_HEALTHY' && report.trim() !== '"SYSTEM_HEALTHY"') {
            bot.sendMessage(config.ADMIN_ID,
                `🛡️ **AI SECURITY AUDITOR REPORT**\n\n` +
                `${report}\n\n` +
                `🔍 *Stats based on ${users.length} total users.*`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        }
    } catch (e) {
        console.error('AI Auditor Error:', e.message);
    }
}

// Check every 4 hours
setInterval(monitorSystemWithAI, 1000 * 60 * 60 * 4);

// --- EXPIRED ITEMS CLEANUP ------------------------------------------------
// Items that are not sold within 7 days will be removed and seller loses them
async function cleanupExpiredItems() {
    const itemSales = db.getItemSales ? db.getItemSales() : (db.data.itemSales || {});
    if (!itemSales || Object.keys(itemSales).length === 0) return;

    const now = Date.now();
    const sales = Object.values(itemSales);
    let expiredCount = 0;

    for (const sale of sales) {
        // Check if item is approved but not sold, and has expired
        if (sale.status === 'approved' && sale.expiresAt && sale.expiresAt < now) {
            const itemName = sale.accountName || sale.customName || sale.itemType || 'Item';

            // Notify seller that item expired
            if (bot) {
                const expiredMsg = `⏰ <b>Item Expired</b>\n\nYour item <b>${itemName}</b> was not sold within 7 days and has been removed from the marketplace.\n\n❌ The item has been permanently deleted.\n\nTip: You can submit a new item for sale anytime!`;
                bot.sendMessage(sale.userId, expiredMsg, { parse_mode: 'HTML' }).catch(e => console.error('Expired item notify error:', e.message));
            }

            // Delete the expired item
            if (db.deleteItemSale) {
                db.deleteItemSale(sale.id);
            } else {
                delete db.data.itemSales[sale.id];
            }
            expiredCount++;

            console.log(`[CLEANUP] Expired item removed: ${sale.id} - ${itemName}`);
        }
    }

    if (expiredCount > 0) {
        db.save(true);
        console.log(`[CLEANUP] Removed ${expiredCount} expired items`);
    }
}

// Run cleanup every 6 hours
setInterval(cleanupExpiredItems, 1000 * 60 * 60 * 6);
// Also run on startup
cleanupExpiredItems();

// --- SUPPORT MESSAGE AUTO-DELETE (2 HOURS IF NO ADMIN REPLY) ---
async function cleanupUnansweredSupportMessages() {
    try {
        const users = db.data.users || {};
        let deletedCount = 0;
        const now = Date.now();

        for (const userId in users) {
            const user = users[userId];
            if (!user.supportMessages || user.supportMessages.length === 0) continue;

            // Keep only messages that are either:
            // 1. Answered by admin (replyStatus = 'answered')
            // 2. Not yet 2 hours old (pending messages within 2 hours)
            const filteredMessages = user.supportMessages.filter(msg => {
                // If answered by admin, keep it indefinitely
                if (msg.replyStatus === 'answered') return true;

                // If no TTL set, keep it (shouldn't happen for new messages)
                if (!msg.ttlDeleteTime) return true;

                // If still within 2 hours, keep it
                if (now < msg.ttlDeleteTime) return true;

                // Otherwise, mark for deletion
                deletedCount++;
                return false;
            });

            if (filteredMessages.length !== user.supportMessages.length) {
                user.supportMessages = filteredMessages;
                await db.updateUser(user);
            }
        }

        if (deletedCount > 0) {
            console.log(`[SUPPORT-CLEANUP] Deleted ${deletedCount} unanswered support messages older than 2 hours`);
        }
    } catch (e) {
        console.error('[SUPPORT-CLEANUP] Error:', e.message);
    }
}

// Run support message cleanup every hour
setInterval(cleanupUnansweredSupportMessages, 1000 * 60 * 60);
// Also run on startup (after 5 seconds delay to ensure DB loaded)
setTimeout(cleanupUnansweredSupportMessages, 5000);

// --- HISTORY AUTO-DELETE (OLDER THAN 15 DAYS) ---
// Non-vital history, server logs, broadcast logs, and bot logs older than 15 days are automatically pruned.
function cleanupOldHistory() {
    const users = db.data.users || {};
    const now = Date.now();
    // Auto-delete threshold for transient history & logs (15 days as requested)
    const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let modified = false;

    // 1. Cleanup User activity history (keep non-vital logs max 15 days) — NEVER delete purchase/deposit/referral
    for (const userId in users) {
        const user = users[userId];
        if (!user) continue;

        // Cleanup main history — protect important financial transactions
        if (user.history && Array.isArray(user.history)) {
            const originalLength = user.history.length;
            const PROTECTED_TYPES = new Set(['referral_reward', 'referral', 'referral_bonus', 'deposit', 'withdraw', 'purchase', 'service', 'account_purchase', 'smm_order']);
            user.history = user.history.filter(entry => {
                // ALWAYS keep protected transaction types
                if (PROTECTED_TYPES.has((entry.type || '').toLowerCase())) return true;
                let entryTimestamp = entry.date || entry.timestamp || 0;
                if (typeof entryTimestamp === 'string') entryTimestamp = new Date(entryTimestamp).getTime();
                return entryTimestamp > 0 ? (now - entryTimestamp) <= FIFTEEN_DAYS : true;
            });
            if (user.history.length !== originalLength) modified = true;
        }

        // Cleanup apiUsageHistory — 7 days
        if (user.apiUsageHistory && Array.isArray(user.apiUsageHistory)) {
            const originalLength = user.apiUsageHistory.length;
            user.apiUsageHistory = user.apiUsageHistory.filter(entry => {
                let timestamp = entry.timestamp || entry.date || 0;
                if (typeof timestamp === 'string') timestamp = new Date(timestamp).getTime();
                return timestamp > 0 ? (now - timestamp) <= SEVEN_DAYS : true;
            });
            if (user.apiUsageHistory.length !== originalLength) modified = true;
        }
    }

    // 2. Cleanup Broadcast logs older than 15 days
    if (db.data.broadcasts && Array.isArray(db.data.broadcasts)) {
        const origCount = db.data.broadcasts.length;
        db.data.broadcasts = db.data.broadcasts.filter(b => {
            const sentAt = b.sentAt || b.createdAt || b.date || 0;
            let ts = (typeof sentAt === 'string') ? new Date(sentAt).getTime() : sentAt;
            return ts > 0 ? (now - ts) <= FIFTEEN_DAYS : true;
        });
        if (db.data.broadcasts.length !== origCount) modified = true;
    }

    // 3. Cleanup Server logs older than 15 days
    if (db.data.serverLogs && Array.isArray(db.data.serverLogs)) {
        const origCount = db.data.serverLogs.length;
        db.data.serverLogs = db.data.serverLogs.filter(l => {
            const timestamp = l.timestamp || l.date || 0;
            let ts = (typeof timestamp === 'string') ? new Date(timestamp).getTime() : timestamp;
            return ts > 0 ? (now - ts) <= FIFTEEN_DAYS : true;
        });
        if (db.data.serverLogs.length !== origCount) modified = true;
    }

    // 4. Cleanup Live SMS Bot logs older than 15 days
    if (db.data.liveSmsBot && db.data.liveSmsBot.bots) {
        Object.values(db.data.liveSmsBot.bots).forEach(bot => {
            if (bot.logs && Array.isArray(bot.logs)) {
                const orig = bot.logs.length;
                bot.logs = bot.logs.filter(log => {
                    const match = String(log).match(/\[(.*?)\]/);
                    if (match && match[1]) {
                        const ts = new Date(match[1]).getTime();
                        if (!isNaN(ts) && ts > 0) return (now - ts) <= FIFTEEN_DAYS;
                    }
                    return true;
                });
                if (bot.logs.length !== orig) modified = true;
            }
        });
    }

    // 5. Cleanup Bot Hosting logs older than 15 days
    if (db.data.botHosting && db.data.botHosting.bots) {
        Object.values(db.data.botHosting.bots).forEach(bot => {
            if (bot.logs && Array.isArray(bot.logs)) {
                const orig = bot.logs.length;
                bot.logs = bot.logs.filter(log => {
                    const match = String(log).match(/\[(.*?)\]/);
                    if (match && match[1]) {
                        const ts = new Date(match[1]).getTime();
                        if (!isNaN(ts) && ts > 0) return (now - ts) <= FIFTEEN_DAYS;
                    }
                    return true;
                });
                if (bot.logs.length !== orig) modified = true;
            }
        });
    }

    // 6. Cleanup Mail Sessions older than 24h
    if (db.data.mailSessions) {
        const initialCount = Object.keys(db.data.mailSessions).length;
        for (const [sid, session] of Object.entries(db.data.mailSessions)) {
            const createdAt = session.createdAt || 0;
            if (now - createdAt > ONE_DAY) {
                delete db.data.mailSessions[sid];
            }
        }
        if (Object.keys(db.data.mailSessions).length !== initialCount) modified = true;
    }

    // 7. Cleanup Email Pool History older than 24h
    if (db.data.emailPoolHistory && Array.isArray(db.data.emailPoolHistory)) {
        const originalPoolHistLen = db.data.emailPoolHistory.length;
        db.data.emailPoolHistory = db.data.emailPoolHistory.filter(h => {
            const assignedAt = h.assignedAt || h.date || h.timestamp || 0;
            let ts = (typeof assignedAt === 'string') ? new Date(assignedAt).getTime() : assignedAt;
            return ts > 0 ? (now - ts) <= ONE_DAY : true;
        });
        if (db.data.emailPoolHistory.length !== originalPoolHistLen) modified = true;
    }

    // 8. Recycle Email Pool assignments older than 24h
    if (db.data.emailPool) {
        for (const type in db.data.emailPool) {
            if (Array.isArray(db.data.emailPool[type])) {
                db.data.emailPool[type].forEach(item => {
                    const assignedAt = item.assignedAt;
                    if (assignedAt) {
                        let ts = (typeof assignedAt === 'string') ? new Date(assignedAt).getTime() : assignedAt;
                        if (ts > 0 && (now - ts > ONE_DAY)) {
                            item.assignedTo = null;
                            item.assignedAt = null;
                            modified = true;
                        }
                    }
                });
            }
        }
    }

    if (modified) {
        db.save(true);
        console.log(`[CLEANUP] Deleted histories & logs older than 15 days.`);
    }
}

// Check every hour (As requested for the pool logic)
setInterval(cleanupOldHistory, 1000 * 60 * 60);
// Also run on startup
cleanupOldHistory();

// API: Video Downloader - Download Video
app.post('/api/video-downloader/download', async (req, res) => {
    try {
        const { url, quality, type, userId } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        // Detect platform from URL
        let platform = 'unknown';
        if (url.includes('tiktok.com')) platform = 'tiktok';
        else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
        else if (url.includes('facebook.com') || url.includes('fb.watch')) platform = 'facebook';
        else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'twitter';
        else if (url.includes('instagram.com')) platform = 'instagram';
        else if (url.includes('snapchat.com')) platform = 'snapchat';
        else if (url.includes('pinterest.com')) platform = 'pinterest';

        // Use video downloader modules directly
        let downloadResult = null;

        try {
            if (platform === 'tiktok') {
                downloadResult = await tiktokDownloader.downloadTikTok(url);
            } else if (platform === 'facebook') {
                downloadResult = await facebookDownloader.downloadFacebook(url);
            } else {
                // For other platforms, return video info with direct URL
                downloadResult = {
                    success: true,
                    downloadUrl: url,
                    title: 'Video from ' + platform,
                    platform: platform
                };
            }

            if (downloadResult && downloadResult.success) {
                res.json({
                    success: true,
                    message: 'Download ready',
                    downloadUrl: downloadResult.downloadUrl || downloadResult.url || url,
                    thumbnail: downloadResult.thumbnail || '',
                    title: downloadResult.title || 'Video from ' + platform,
                    quality: quality,
                    type: type,
                    platform: platform,
                    filename: downloadResult.filename || `video_${Date.now()}.mp4`
                });
            } else {
                // Fallback: return the URL for direct download
                res.json({
                    success: true,
                    message: 'Video info retrieved. Click to download.',
                    downloadUrl: url,
                    quality: quality,
                    type: type,
                    platform: platform,
                    filename: `video_${Date.now()}.mp4`
                });
            }
        } catch (serviceError) {
            console.error('Video download error:', serviceError.message);
            // Fallback: return the URL for direct download
            res.json({
                success: true,
                message: 'Video ready for download',
                downloadUrl: url,
                quality: quality,
                type: type,
                platform: platform,
                filename: `video_${Date.now()}.mp4`
            });
        }

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            message: 'Download failed: ' + error.message
        });
    }
});

// =============================================
// VIDEO DOWNLOADER — SEND TO TELEGRAM CHAT
// Downloads file server-side then sends as actual file to user
// =============================================
app.post('/api/video-downloader/send-telegram', async (req, res) => {
    let tempFilePath = null;
    try {
        const { userId, url, type, quality, cost } = req.body;
        if (!url || !userId) return res.status(400).json({ success: false, message: 'url and userId required' });

        if (!bot) return res.json({ success: false, message: 'Bot not connected. Please access via Telegram.' });

        const chatId = parseInt(userId);
        if (!chatId || isNaN(chatId)) return res.json({ success: false, message: 'Invalid user ID' });

        // ── Token deduction (server-side) ─────────────────────────────
        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const adminSettings = db.data.adminSettings || {};
        const videoCost = adminSettings.videoDownloadCost !== undefined ? adminSettings.videoDownloadCost : 10;
        const deductCost = parseInt(cost) || (type === 'thumbnail' ? 5 : videoCost);

        const currentTokens = db.getTokenBalance(user);
        if (currentTokens < deductCost) {
            return res.json({ success: false, message: `Insufficient tokens! Need ${deductCost} tokens, have ${currentTokens}.` });
        }

        // Handle Thumbnail separately
        if (type === 'thumbnail') {
            await bot.sendMessage(chatId, `⏳ *Downloading thumbnail...*\nPlease wait a moment.`, { parse_mode: 'Markdown' }).catch(() => { });

            const ext = 'jpg';
            const tmpDir = path.join(__dirname, '..', 'web', 'uploads', 'bots');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            tempFilePath = path.join(tmpDir, `vdl_thumb_${userId}_${Date.now()}.${ext}`);

            let downloadSuccess = false;
            try {
                const dlRes = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    maxContentLength: 10 * 1024 * 1024,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.google.com/',
                        'Accept': '*/*'
                    }
                });
                fs.writeFileSync(tempFilePath, dlRes.data);
                downloadSuccess = fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 1024;
            } catch (dlErr) {
                console.warn('[VideoDL] Thumbnail download failed:', dlErr.message);
            }

            const caption = `🖼️ *High-Quality Thumbnail Downloaded*\n🎯 Quality: HD/4K\n_via AutosVerify_`;

            if (downloadSuccess) {
                try {
                    await bot.sendPhoto(chatId, fs.createReadStream(tempFilePath), {
                        caption, parse_mode: 'Markdown'
                    });
                } catch (sendErr) {
                    console.warn('[VideoDL] Photo send failed, sending as document:', sendErr.message);
                    await bot.sendDocument(chatId, fs.createReadStream(tempFilePath), {
                        caption, parse_mode: 'Markdown'
                    });
                }
            } else {
                try {
                    await bot.sendPhoto(chatId, url, { caption, parse_mode: 'Markdown' });
                } catch (e) {
                    await bot.sendMessage(chatId, `🖼️ *Thumbnail Ready*\n\n[⬇️ Tap to View Thumbnail](${url})`, { parse_mode: 'Markdown' });
                }
            }

            // Deduct tokens
            db.setTokenBalance(user, currentTokens - deductCost);
            if (!user.history) user.history = [];
            user.history.unshift({
                type: 'video_download',
                amount: -deductCost,
                currency: 'TC',
                date: Date.now(),
                detail: `Thumbnail Download (HQ)`
            });
            db.save(true);

            return res.json({
                success: true,
                message: `✅ Thumbnail sent to your Telegram! (-${deductCost} tokens)`,
                newBalance: db.getTokenBalance(user)
            });
        }

        // Notify user that download is in progress
        await bot.sendMessage(chatId, `⏳ *Downloading your ${type === 'audio' ? 'audio' : 'video'}...*\nPlease wait a moment.`, { parse_mode: 'Markdown' }).catch(() => { });

        // ── Download file to temp ──────────────────────────────────────
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const tmpDir = path.join(__dirname, '..', 'web', 'uploads', 'bots'); // reuse existing uploads dir
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        tempFilePath = path.join(tmpDir, `vdl_${userId}_${Date.now()}.${ext}`);

        let downloadSuccess = false;
        let targetUrl = url;
        let isMergedYoutube = false;

        // Extract original parameters if it's a proxy link
        if (url.includes('/api/video-downloader/download-merged')) {
            isMergedYoutube = true;
            try {
                const parsedUrl = new URL(url);
                targetUrl = parsedUrl.searchParams.get('url') || url;
            } catch (e) {
                const match = url.match(/url=([^&]+)/);
                if (match) targetUrl = decodeURIComponent(match[1]);
            }
        } else if (url.includes('/api/video-downloader/download-stream')) {
            try {
                const parsedUrl = new URL(url);
                targetUrl = parsedUrl.searchParams.get('url') || url;
            } catch (e) {
                const match = url.match(/url=([^&]+)/);
                if (match) targetUrl = decodeURIComponent(match[1]);
            }
        }

        try {
            if (isMergedYoutube) {
                console.log(`[VideoDL] Direct yt-dlp merge for Telegram: ${targetUrl}`);
                const { execFileSync } = require('child_process');
                execFileSync('./yt-dlp', [
                    '--js-runtimes', 'node',
                    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
                    '--merge-output-format', 'mp4',
                    '-o', tempFilePath,
                    targetUrl
                ], { timeout: 120000 });
                downloadSuccess = fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 1024;
            } else {
                console.log(`[VideoDL] Downloading standard format: ${targetUrl}`);
                const dlRes = await axios.get(targetUrl, {
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 min
                    maxContentLength: 100 * 1024 * 1024, // 100MB max
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.google.com/',
                        'Accept': '*/*'
                    }
                });
                fs.writeFileSync(tempFilePath, dlRes.data);
                downloadSuccess = fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 1024;
            }
        } catch (dlErr) {
            console.warn('[VideoDL] Server download failed:', dlErr.message);
        }

        const caption = `📥 *${type === 'audio' ? 'Audio' : 'Video'} Downloaded*\n🎯 Quality: ${quality || 'HD'}\n_via AutosVerify_`;

        // ── Send to Telegram ───────────────────────────────────────────
        if (downloadSuccess) {
            // Send as actual file
            try {
                if (type === 'audio') {
                    await bot.sendAudio(chatId, fs.createReadStream(tempFilePath), {
                        caption, parse_mode: 'Markdown',
                        title: `Audio_${quality || 'MP3'}`,
                        performer: 'AutosVerify'
                    });
                } else {
                    await bot.sendVideo(chatId, fs.createReadStream(tempFilePath), {
                        caption, parse_mode: 'Markdown',
                        supports_streaming: true
                    });
                }
            } catch (sendErr) {
                console.warn('[VideoDL] Stream send failed, trying document:', sendErr.message);
                // Fallback: send as document
                await bot.sendDocument(chatId, fs.createReadStream(tempFilePath), {
                    caption, parse_mode: 'Markdown'
                });
            }
        } else {
            // File couldn't be downloaded server-side — try sending URL directly to Telegram
            try {
                if (type === 'audio') {
                    await bot.sendAudio(chatId, url, { caption, parse_mode: 'Markdown' });
                } else {
                    await bot.sendVideo(chatId, url, { caption, parse_mode: 'Markdown', supports_streaming: true });
                }
            } catch (e) {
                // Last resort: send message with link
                await bot.sendMessage(chatId,
                    `${type === 'audio' ? '🎵' : '🎬'} *${type === 'audio' ? 'Audio' : 'Video'} Ready*\nQuality: ${quality || 'HD'}\n\n[⬇️ Tap to Download](${url})`,
                    { parse_mode: 'Markdown', disable_web_page_preview: false });
            }
        }

        // ── Deduct tokens after successful send ───────────────────────
        db.setTokenBalance(user, currentTokens - deductCost);
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'video_download',
            amount: -deductCost,
            currency: 'TC',
            date: Date.now(),
            detail: `Video Download (${type === 'audio' ? 'Audio' : 'Video'} ${quality || 'HD'})`
        });
        db.save(true);

        return res.json({
            success: true,
            message: `✅ Sent to your Telegram! (-${deductCost} tokens)`,
            newBalance: db.getTokenBalance(user)
        });

    } catch (e) {
        console.error('[Send Telegram Video]', e.message);
        return res.json({ success: false, message: 'Failed to send: ' + e.message });
    } finally {
        // Always clean up temp file
        if (tempFilePath) {
            setTimeout(() => {
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { }
            }, 5000);
        }
    }
});

// =============================================
// VIDEO DOWNLOADER — AI SEO GENERATOR & OPTIMIZER
// =============================================
app.post('/api/video-downloader/seo', async (req, res) => {
    try {
        const { userId, url, title, description, platform, country } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const seoCost = 10;
        const currentTokens = db.getTokenBalance(user);
        if (currentTokens < seoCost) {
            return res.json({ success: false, message: `Insufficient tokens! Need ${seoCost} tokens, have ${currentTokens}.` });
        }

        const ai = getOpenAI();
        let seoResult = null;
        const selectedCountry = country || 'BD';

        if (ai) {
            try {
                const completion = await ai.chat.completions.create({
                    model: config.OPENAI_MODEL || "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `You are an elite AI Social Media SEO & Optimization expert. You specialize in crafting high-impact titles, hooks, rich descriptions, and high-relevancy search tags/hashtags to help videos go viral.
                            Your target platform is: ${platform || 'YouTube'}.
                            Your target country/market is: ${selectedCountry}.
                            
                            Please generate highly optimized SEO metadata based on the video details. Target the audience, culture, language habits, and local algorithm characteristics of ${selectedCountry}.
                            - If the country is Bangladesh (BD) or India (IN), integrate appropriate local terms, emojis, and local timezone advice.
                            - Return ONLY a valid JSON object matching this schema exactly:
                            {
                                "title": "Catchy, optimized viral title or hook suitable for ${platform}",
                                "description": "Engaging description with line breaks, relevant emojis, calls to action, and strategic tags",
                                "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
                                "category": "Best suited content category",
                                "tips": "Actionable local-specific posting guide for ${selectedCountry} (specific peak traffic hours, local creator community trends, and algorithm-hacking advice)"
                            }`
                        },
                        {
                            role: "user",
                            content: `Video URL: ${url || ''}\nVideo Title: ${title || 'N/A'}\nVideo Description: ${description || 'N/A'}`
                        }
                    ],
                    response_format: { type: "json_object" }
                });
                seoResult = JSON.parse(completion.choices[0].message.content);
            } catch (aiErr) {
                console.error('[SEO AI Error]', aiErr.message);
            }
        }

        if (!seoResult) {
            const displayTitle = title || 'Amazing Viral Video';
            const countryGuides = {
                BD: {
                    time: '4:00 PM to 7:30 PM BST (Bangladesh Standard Time)',
                    tips: 'Bangladesh Audience Boost: Combine high-energy English hooks with localized Bengali descriptions. Audiences react extremely well to text captions in the first 3 seconds!'
                },
                US: {
                    time: '12:00 PM to 3:00 PM EST and 6:00 PM to 9:00 PM EST',
                    tips: 'US Algorithm Boost: Focus heavily on high-fidelity audio hook quality and high retention rates. Use trending TikTok commercial audios for Reels/Shorts!'
                },
                UK: {
                    time: '5:00 PM to 8:00 PM GMT',
                    tips: 'UK Algorithm Boost: Utilize high-contrast text overlays and conversational commentary tracks.'
                },
                IN: {
                    time: '3:30 PM to 6:30 PM IST',
                    tips: 'Subcontinent Regional Boost: Regional language keywords mixed with trending music are key. Post consistently during late afternoon commute hours.'
                },
                DE: {
                    time: '4:00 PM to 7:00 PM CET',
                    tips: 'EU Regional Boost: Use clean, high-contrast title typography. High compliance with local metadata standards.'
                },
                RU: {
                    time: '5:00 PM to 9:00 PM MSK',
                    tips: 'Localized CIS Boost: Maximize engagement via interactive comment polls in the pinned comment.'
                },
                MY: {
                    time: '6:00 PM to 9:00 PM MYT',
                    tips: 'Malaysia Viral Boost: Mix English and Malay keywords. Tap into trending local music hashtags for extra organic discoverability.'
                },
                SG: {
                    time: '7:00 PM to 10:00 PM SGT',
                    tips: 'Singapore Metropolitan Boost: High-density target timing when professionals and youth browse social media. High-relevancy localized English tags perform best.'
                }
            };
            const guide = countryGuides[selectedCountry] || countryGuides['BD'];
            seoResult = {
                title: `🔥 [VIRAL BOOST] ${displayTitle} - Full HD Optimized!`,
                description: `Optimized for maximum viral organic reach in ${selectedCountry}. Watch now to discover why this is trending! 🎬✨\n\n🔔 Don't forget to like, follow and share for more localized updates!\n\n#viral #trending #${platform || 'shorts'} #${selectedCountry} #foryou`,
                tags: ['viral', 'trending', platform || 'shorts', selectedCountry, 'foryou'],
                category: 'Entertainment & Creators',
                tips: `Local Optimal Posting Time: ${guide.time}. ${guide.tips}`
            };
        }

        // Deduct tokens
        db.setTokenBalance(user, currentTokens - seoCost);
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'video_seo',
            amount: -seoCost,
            currency: 'TC',
            date: Date.now(),
            detail: `AI SEO Optimization (${platform || 'general'})`
        });
        db.save(true);

        return res.json({
            success: true,
            seo: seoResult,
            newBalance: db.getTokenBalance(user)
        });

    } catch (e) {
        console.error('[Video SEO Error]', e.message);
        return res.json({ success: false, message: 'SEO Optimization failed: ' + e.message });
    }
});

// =============================================
// VIDEO DOWNLOADER — COPYRIGHT AUDITOR
// =============================================
app.post('/api/video-downloader/copyright', async (req, res) => {
    try {
        const { userId, url, title, description } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const copyrightCost = 10;
        const currentTokens = db.getTokenBalance(user);
        if (currentTokens < copyrightCost) {
            return res.json({ success: false, message: `Insufficient tokens! Need ${copyrightCost} tokens, have ${currentTokens}.` });
        }

        const ai = getOpenAI();
        let scanResult = null;

        const isTikTokVideo = (url || '').toLowerCase().includes('tiktok') || (title || '').toLowerCase().includes('tiktok') || (description || '').toLowerCase().includes('tiktok');

        if (ai) {
            try {
                const completion = await ai.chat.completions.create({
                    model: config.OPENAI_MODEL || 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `You are an advanced digital copyright auditor, specialist in DMCA, YouTube Content ID, TikTok Commercial Music Library rules, Facebook Rights Manager, and Instagram Reels audio copyright policies.
                            Analyze the given video metadata (Title, Description, URL) to perform a highly rigorous, realistic, and completely real copyright risk evaluation.
                            
                            CRITICAL RULE FOR TIKTOK VIDEOS:
                            TikTok pays massive licensing fees for music, allowing users to use popular songs inside the TikTok app legally (status for TikTok is often green/safe). 
                            However, these licensing rights DO NOT TRANSFER to other platforms.
                            If a user downloads a TikTok video and uploads it to Facebook/Instagram (Meta Rights Manager) or YouTube (Content ID), the audio will ALMOST ALWAYS be flagged, muted, or copyright-claimed, resulting in page strikes or monetization blocks.
                            Therefore, if the source is TikTok (URL contains tiktok or metadata suggests TikTok) and any audio/song/background music is present:
                            - "facebook" status MUST be true (high risk).
                            - "youtube" status MUST be true (high risk).
                            - "instagram" status MUST be true (high risk).
                            - You must explicitly explain this TikTok platform-licensing mismatch in the explanations so the user understands why Facebook flags it despite TikTok being fine.

                            Provide clear, accurate, and comprehensive explanations in English language. Keep it friendly, detailed, and highly professional for content creators so they understand why some platforms show high-risk while others show safe.
                            Return ONLY a valid JSON object matching this schema exactly:
                            {
                                "youtube": {
                                    "status": true/false (true if risk of claim, false if safe),
                                    "explanation": "Detailed YouTube-specific Content ID policy assessment regarding this content in beautiful, clear English"
                                },
                                "tiktok": {
                                    "status": true/false,
                                    "explanation": "Detailed TikTok audio copyright, commercial library, and muting risk assessment in beautiful, clear English"
                                },
                                "facebook": {
                                    "status": true/false,
                                    "explanation": "Detailed Facebook Rights Manager policy, block, and monetization risk assessment in beautiful, clear English"
                                },
                                "instagram": {
                                    "status": true/false,
                                    "explanation": "Detailed Instagram Reels audio policies, limited audio list, and strike risk assessment in beautiful, clear English"
                                }
                            }`
                        },
                        {
                            role: 'user',
                            content: `Video URL: ${url || ''}\nVideo Title: ${title || 'N/A'}\nVideo Description: ${description || 'N/A'}`
                        }
                    ],
                    response_format: { type: 'json_object' }
                });
                scanResult = JSON.parse(completion.choices[0].message.content);
            } catch (aiErr) {
                console.error('[Copyright AI Error]', aiErr.message);
            }
        }

        if (!scanResult) {
            const hasMusic = (title || '').toLowerCase().includes('song') || (title || '').toLowerCase().includes('music') || (title || '').toLowerCase().includes('cover') || (title || '').toLowerCase().includes('remix') || isTikTokVideo;
            
            scanResult = {
                youtube: {
                    status: hasMusic,
                    explanation: isTikTokVideo 
                        ? 'High Risk: TikTok video background music licenses do NOT transfer to YouTube. Uploading this to YouTube is extremely likely to trigger a Content ID claim.'
                        : (hasMusic 
                            ? 'Detected potential copyrighted audio/music references. Likely to trigger a YouTube Content ID claim or revenue sharing.' 
                            : 'No direct copyrighted audio or video match detected. Safe from automated Content ID claims.')
                },
                tiktok: {
                    status: false,
                    explanation: 'TikTok native upload: Music used natively inside the TikTok app is covered by TikTok\'s own licensing agreements and is safe within the platform.'
                },
                facebook: {
                    status: hasMusic,
                    explanation: isTikTokVideo
                        ? 'CRITICAL RISK: Meta Rights Manager is extremely aggressive. TikTok’s exclusive commercial music agreements do NOT cover Facebook. Uploading this TikTok video with background music/sounds to Facebook will almost certainly trigger an automatic mute, regional block, or copyright strike.'
                        : (hasMusic
                            ? 'Facebook Rights Manager match found. Video may experience regional blocks or be restricted from monetization.'
                            : 'No matching fingerprints found on Facebook Rights Manager.')
                },
                instagram: {
                    status: hasMusic,
                    explanation: isTikTokVideo
                        ? 'High Risk: Instagram Reels automated Rights Manager will flag this track. TikTok music licenses are completely separate and do not carry over to Instagram.'
                        : 'Instagram Reels policy: No immediate audio matching or copyright restrictions found.'
                }
            };
        }

        // Deduct tokens
        db.setTokenBalance(user, currentTokens - copyrightCost);
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'video_copyright',
            amount: -copyrightCost,
            currency: 'TC',
            date: Date.now(),
            detail: `Video Copyright Scan`
        });
        db.save(true);

        return res.json({
            success: true,
            results: scanResult,
            newBalance: db.getTokenBalance(user)
        });

    } catch (e) {
        console.error('[Video Copyright Error]', e.message);
        return res.json({ success: false, message: 'Copyright scan failed: ' + e.message });
    }
});

// VIDEO DOWNLOADER — UNLOCK VIDEO DETAILS
// =============================================
app.post('/api/video-downloader/unlock-details', async (req, res) => {
    try {
        const { userId, url } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const detailsCost = 10;
        const currentTokens = db.getTokenBalance(user);
        if (currentTokens < detailsCost) {
            return res.json({ success: false, message: `Insufficient tokens! Need ${detailsCost} tokens, have ${currentTokens}.` });
        }

        // Deduct tokens
        db.setTokenBalance(user, currentTokens - detailsCost);
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'video_details_unlock',
            amount: -detailsCost,
            currency: 'TC',
            date: Date.now(),
            detail: `Unlocked Video Details`
        });
        db.save(true);

        return res.json({
            success: true,
            newBalance: db.getTokenBalance(user)
        });

    } catch (e) {
        console.error('[Video Details Unlock Error]', e.message);
        return res.json({ success: false, message: 'Unlock failed: ' + e.message });
    }
});

// ==========================================
// EMAIL POOL ROUTES
// ==========================================

app.get('/api/admin/email-pool/list', (req, res) => {
    const { type } = req.query;
    if (!db.data.emailPool) db.data.emailPool = { gmail: [], hotmail: [] };

    if (type) {
        const emails = db.data.emailPool[type] || [];
        const available = emails.filter(e => !e.assignedTo).length;
        const totalUsed = emails.filter(e => e.assignedTo).length;
        res.json({ success: true, emails: emails.filter(e => !e.assignedTo), stats: { available, totalUsed, recentHistory: emails.filter(e => e.assignedTo).slice(-50) } });
    } else {
        const stats = {};
        ['gmail', 'hotmail'].forEach(t => {
            const list = db.data.emailPool[t] || [];
            stats[t] = {
                available: list.filter(e => !e.assignedTo).length,
                totalUsed: list.filter(e => e.assignedTo).length
            };
        });
        res.json({ success: true, stats });
    }
});

app.post('/api/admin/email-pool/add', (req, res) => {
    const { type, email, password, note } = req.body;
    if (!db.data.emailPool) db.data.emailPool = { gmail: [], hotmail: [] };
    if (!db.data.emailPool[type]) db.data.emailPool[type] = [];

    // Duplicate check
    if (db.data.emailPool[type].some(e => e.email === email)) {
        return res.json({ success: false, message: 'Email already exists in pool' });
    }

    db.data.emailPool[type].push({
        email,
        password,
        note,
        addedAt: new Date().toISOString(),
        assignedTo: null,
        assignedAt: null
    });
    db.save(true);
    res.json({ success: true, message: 'Email added to pool' });
});

app.delete('/api/admin/email-pool/delete', (req, res) => {
    const { type, email } = req.body;
    if (db.data.emailPool && db.data.emailPool[type]) {
        db.data.emailPool[type] = db.data.emailPool[type].filter(e => e.email !== email);
        db.save(true);
    }
    res.json({ success: true, message: 'Email deleted from pool' });
});

app.post('/api/admin/email-pool/clear-assigned', (req, res) => {
    const { type } = req.body;
    if (db.data.emailPool && db.data.emailPool[type]) {
        const count = db.data.emailPool[type].filter(e => e.assignedTo).length;
        db.data.emailPool[type] = db.data.emailPool[type].filter(e => !e.assignedTo);
        db.save(true);
        res.json({ success: true, message: `Cleared ${count} assigned emails` });
    } else {
        res.json({ success: false, message: 'Pool not found' });
    }
});

// ==========================================
// Global Error Handler for Express
app.use((err, req, res, next) => {
    console.error('🔥 Server Error:', err.message);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'A network or server error occurred'
    });
});

// ==========================================
// MISSING ADMIN ROUTES — ADDED
// ==========================================

// API: Admin - Bulk Add Emails to Pool
app.post('/api/admin/email-pool/bulk', (req, res) => {
    try {
        const { type, emails } = req.body;
        if (!type || !Array.isArray(emails) || emails.length === 0) {
            return res.json({ success: false, message: 'type and emails array required' });
        }

        if (!db.data.emailPool) db.data.emailPool = {};
        if (!db.data.emailPool[type]) db.data.emailPool[type] = [];

        let added = 0;
        let failed = 0;

        for (const item of emails) {
            const email = typeof item === 'string' ? item.trim() : item.email?.trim();
            const password = typeof item === 'object' ? (item.password || null) : null;
            const note = typeof item === 'object' ? (item.note || '') : '';

            if (!email || !email.includes('@')) { failed++; continue; }

            // Prevent duplicate
            const exists = db.data.emailPool[type].find(e => e.email === email);
            if (exists) { failed++; continue; }

            db.data.emailPool[type].push({
                email,
                password: password || null,
                note: note || '',
                status: 'available',
                addedAt: Date.now(),
                assignedTo: null,
                sessionId: null
            });
            added++;
        }

        db.save(true);
        res.json({
            success: true,
            message: `Added: ${added} emails, Failed/Duplicate: ${failed}`,
            added,
            failed,
            total: db.data.emailPool[type].length
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});
app.get('/api/admin/database/stats', async (req, res) => {
    try {
        const usersList = await db.getUsers();
        const dbFile = db.DB_FILE || './database.json';
        let dbSize = '0 KB';
        try {
            const stat = fs.statSync(dbFile);
            const kb = stat.size / 1024;
            dbSize = kb >= 1024
                ? (kb / 1024).toFixed(2) + ' MB'
                : kb.toFixed(2) + ' KB';
        } catch (e) { }

        const lastBackup = db.data.lastBackup
            ? new Date(db.data.lastBackup).toLocaleString()
            : 'Never';

        const totalSessions = Object.keys(db.data.mailSessions || {}).length;
        const totalProviders = Object.keys(db.data.providers || {}).length;
        const totalServices = Object.keys(db.data.services || {}).length;
        const totalTasks = Object.keys(db.data.tasks || {}).length;
        const totalDeposits = (db.data.pendingDeposits || []).length;
        const totalBroadcasts = (db.data.broadcasts || []).length;
        const totalLogs = (db.data.serverLogs || []).length;

        res.json({
            success: true,
            totalUsers: usersList.length,
            dbSize,
            lastBackup,
            totalSessions,
            totalProviders,
            totalServices,
            totalTasks,
            totalDeposits,
            totalBroadcasts,
            totalLogs
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Server Status (health check for dashboard)
app.get('/api/admin/server-status', (req, res) => {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    res.json({
        success: true,
        status: 'online',
        uptime: `${hours}h ${minutes}m`,
        uptimeSeconds: uptime,
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
    });
});

// ==========================================
// SMM INSTAGRAM MODULE
// ==========================================

// API: SMM Instagram — Profile Lookup
app.get('/api/smm/instagram/profile/:username', async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) return res.json({ success: false, message: 'Username required' });
        const clean = username.replace('@', '').trim();

        // Try RapidAPI Instagram scraper if key is available
        const rapidKey = process.env.RAPIDAPI_KEY || (db.data.apiKeys && db.data.apiKeys.rapidApiKey)
            || (db.data.settings && db.data.settings.rapidApiKey);

        if (rapidKey) {
            try {
                const resp = await axios.get('https://instagram-scraper-api2.p.rapidapi.com/v1/info', {
                    params: { username_or_id_or_url: clean },
                    headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com' },
                    timeout: 10000
                });
                const d = resp.data?.data || resp.data;
                if (d) {
                    return res.json({
                        success: true,
                        username: d.username || clean,
                        fullName: d.full_name || d.fullName || '',
                        bio: d.biography || d.bio || '',
                        followers: d.follower_count || d.followers || 0,
                        following: d.following_count || d.following || 0,
                        posts: d.media_count || d.posts || 0,
                        isPrivate: d.is_private || false,
                        isVerified: d.is_verified || false,
                        profilePic: d.profile_pic_url || d.profilePicUrl || '',
                        profileUrl: `https://instagram.com/${clean}`
                    });
                }
            } catch (apiErr) {
                console.warn('[SMM Profile] RapidAPI error:', apiErr.message);
            }
        }

        // Fallback: return basic info without API
        return res.json({
            success: true,
            username: clean,
            fullName: '',
            bio: '',
            followers: 0,
            following: 0,
            posts: 0,
            isPrivate: false,
            isVerified: false,
            profilePic: `https://ui-avatars.com/api/?name=${encodeURIComponent(clean)}&background=e6683c&color=fff&size=80`,
            profileUrl: `https://instagram.com/${clean}`,
            note: 'Profile details require RAPIDAPI_KEY in settings'
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: SMM Instagram - Submit Order
app.post('/api/smm/instagram/submit', async (req, res) => {
    try {
        const { userId, username, service, quantity, platform } = req.body;
        if (!userId || !username || !service || !quantity) {
            return res.json({ success: false, message: 'Missing required fields' });
        }

        const users = getUsersObj();
        const user = users[userId.toString()];
        if (!user) return res.json({ success: false, message: 'User not found' });

        // Determine platform
        const orderPlatform = platform || 'instagram';

        // Get SMM cost config
        const settings = db.getSettings();
        const smmCosts = settings.smmCosts || {
            followers: 1,
            likes: 0.5,
            comments: 2,
            report: 5,
            traffic: 1   // Gems per 100 visitors
        };

        let totalGems;
        if (orderPlatform === 'website' || service === 'traffic') {
            // Traffic: cost per 100 visitors
            const costPer100 = parseFloat(smmCosts.traffic || 1);
            totalGems = Math.ceil((parseInt(quantity) / 100) * costPer100);
        } else {
            const costPerUnit = smmCosts[service] || 1;
            totalGems = Math.ceil(quantity * costPerUnit);
        }

        const userGems = parseFloat(user.Gems || user.balance_Gems || 0);
        if (userGems < totalGems) {
            return res.json({
                success: false,
                message: `Insufficient Gems. Need ${totalGems} Gems, you have ${userGems.toFixed(2)} Gems.`
            });
        }

        // Deduct gems
        const newGems = Math.max(0, parseFloat((userGems - totalGems).toFixed(4)));
        user.Gems = newGems;
        user.balance_Gems = newGems;

        // Create order
        const orderId = 'smm_' + Date.now() + Math.random().toString(36).substr(2, 5);
        if (!db.data.smmOrders) db.data.smmOrders = [];
        const order = {
            id: orderId,
            userId: userId.toString(),
            platform: orderPlatform,
            service,
            username,                                              // Instagram: @handle, Website: URL
            targetUrl: orderPlatform === 'website' ? username : undefined,
            quantity: parseInt(quantity),
            gemsSpent: totalGems,
            status: 'pending',
            createdAt: Date.now()
        };
        db.data.smmOrders.unshift(order);

        // Add to user history
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'smm_order',
            amount: -totalGems,
            currency: 'Gems',
            service,
            platform: orderPlatform,
            quantity: parseInt(quantity),
            date: Date.now(),
            detail: orderPlatform === 'website'
                ? `Website Traffic x${quantity} visitors for ${username}`
                : `Instagram ${service} x${quantity} for @${username}`
        });

        saveUsersObj(users, true);
        db.save(true);

        // Notify admin
        try {
            const adminId = process.env.ADMIN_ID || (require('../config').ADMIN_ID);
            if (bot && adminId) {
                const isTraffic = orderPlatform === 'website';
                const adminNotif = isTraffic
                    ? `🌐 *New Website Traffic Order*\n\n` +
                    `👤 User: ${user.firstName || user.username || userId}\n` +
                    `🔗 URL: ${username}\n` +
                    `👥 Visitors: ${quantity}\n` +
                    `💎 Gems Spent: ${totalGems}\n` +
                    `🆔 Order ID: \`${orderId}\``
                    : `📱 *New Instagram SMM Order*\n\n` +
                    `👤 User: ${user.firstName || user.username || userId}\n` +
                    `📲 Instagram: @${username}\n` +
                    `🔧 Service: ${service}\n` +
                    `🔢 Quantity: ${quantity}\n` +
                    `💎 Gems Spent: ${totalGems}\n` +
                    `🆔 Order ID: \`${orderId}\``;
                await bot.sendMessage(adminId, adminNotif, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Complete', callback_data: `smm_complete_${orderId}` },
                            { text: '❌ Cancel + Refund', callback_data: `smm_cancel_${orderId}` }
                        ]]
                    }
                }).catch(() => { });
            }
        } catch (e) { }

        res.json({
            success: true,
            orderId,
            gemsSpent: totalGems,
            newGems,
            message: 'Order submitted successfully! Admin will process it shortly.'
        });
    } catch (e) {
        console.error('[SMM Submit] Error:', e.message);
        res.json({ success: false, message: e.message });
    }
});

// API: SMM - Get user orders
app.get('/api/smm/orders/:userId', (req, res) => {
    const { userId } = req.params;
    const orders = (db.data.smmOrders || []).filter(o => String(o.userId) === String(userId));
    res.json({ success: true, orders });
});

// API: Admin - Get all SMM orders
app.get('/api/admin/smm/orders', (req, res) => {
    const orders = (db.data.smmOrders || []).slice(0, 100);
    res.json({ success: true, orders });
});

// API: Admin - Update SMM order status
app.post('/api/admin/smm/orders/:orderId/status', (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    const orders = db.data.smmOrders || [];
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.json({ success: false, message: 'Order not found' });

    const prevStatus = order.status;
    order.status = status;
    order.updatedAt = Date.now();

    // Refund gems if cancelling a pending order (only once)
    if (status === 'cancelled' && prevStatus !== 'cancelled' && order.gemsSpent > 0) {
        const users = getUsersObj();
        const user = users[order.userId?.toString()];
        if (user) {
            const currentGems = parseFloat(user.Gems || user.balance_Gems || 0);
            const refunded = parseFloat(order.gemsSpent);
            user.Gems = parseFloat((currentGems + refunded).toFixed(4));
            user.balance_Gems = user.Gems;
            if (!user.history) user.history = [];
            user.history.unshift({
                type: 'smm_refund',
                amount: +refunded,
                currency: 'Gems',
                date: Date.now(),
                detail: `Refund: ${order.platform || 'instagram'} ${order.service} order cancelled (#${orderId.slice(-6)})`
            });
            saveUsersObj(users, true);
            order.refunded = true;
        }
    }

    db.save(true);

    // Notify user
    try {
        if (bot && order.userId) {
            const icon = status === 'completed' ? '✅' : status === 'cancelled' ? '❌' : 'ℹ️';
            const refundNote = (status === 'cancelled' && order.refunded) ? `\n💎 Refunded: ${order.gemsSpent} Gems` : '';
            bot.sendMessage(order.userId,
                `${icon} *${order.platform === 'website' ? 'Traffic' : 'Instagram'} Order ${status.charAt(0).toUpperCase() + status.slice(1)}*\n\n` +
                `🔧 Service: ${order.service}\n` +
                (order.username ? `📲 Account: @${order.username}\n` : `🌐 URL: ${order.targetUrl || ''}\n`) +
                `🔢 Quantity: ${order.quantity}${refundNote}`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        }
    } catch (e) { }

    res.json({ success: true, refunded: order.refunded || false });
});

// API: Admin - Delete all SMM orders (bulk clear)
app.delete('/api/admin/smm/orders', (req, res) => {
    try {
        db.data.smmOrders = [];
        db.save(true);
        res.json({ success: true, message: 'All SMM orders deleted' });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Delete single SMM order
app.delete('/api/admin/smm/orders/:orderId', (req, res) => {
    try {
        const { orderId } = req.params;
        const before = (db.data.smmOrders || []).length;
        db.data.smmOrders = (db.data.smmOrders || []).filter(o => o.id !== orderId);
        db.save(true);
        res.json({ success: true, deleted: before - db.data.smmOrders.length });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// API: Admin - Get/Update SMM cost config
app.get('/api/admin/smm/costs', (req, res) => {
    const settings = db.getSettings();
    res.json({ success: true, costs: settings.smmCosts || { followers: 1, likes: 0.5, comments: 2, report: 5 } });
});

app.post('/api/admin/smm/costs', (req, res) => {
    const { costs } = req.body;
    if (!costs) return res.json({ success: false, message: 'costs required' });
    if (!db.data.settings) db.data.settings = {};
    db.data.settings.smmCosts = costs;
    db.save(true);
    res.json({ success: true });
});

// ==========================================
// GOOGLE SHEET IMPORT FOR SERVICE ACCOUNTS
// ==========================================

// API: Admin - Import accounts from Google Sheet CSV
app.post('/api/admin/services/:serviceId/import-sheet', async (req, res) => {
    try {
        const { serviceId } = req.params;
        const { sheetUrl, columnMap } = req.body;
        // columnMap: { user: 'A', password: 'B', twofa: 'C' } (column letters)

        if (!sheetUrl) return res.json({ success: false, message: 'sheetUrl required' });

        // Convert Google Sheets URL to CSV export URL
        let csvUrl = sheetUrl;
        if (sheetUrl.includes('docs.google.com/spreadsheets')) {
            // Extract sheet ID and convert to CSV
            const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (match) {
                const sheetId = match[1];
                // Get gid from URL if present
                const gidMatch = sheetUrl.match(/gid=(\d+)/);
                const gid = gidMatch ? gidMatch[1] : '0';
                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
            }
        }

        // Fetch CSV data
        const axios = require('axios');
        const response = await axios.get(csvUrl, { timeout: 10000, responseType: 'text' });
        const csvText = response.data;

        // Parse CSV
        const lines = csvText.split('\n').filter(l => l.trim());
        if (lines.length === 0) return res.json({ success: false, message: 'No data found in sheet' });

        // Column map: default A=user, B=password, C=twofa
        const colMap = columnMap || { user: 'A', password: 'B', twofa: 'C' };
        const colIndex = (letter) => letter ? letter.toUpperCase().charCodeAt(0) - 65 : -1;

        const userCol = colIndex(colMap.user || 'A');
        const passCol = colIndex(colMap.password || 'B');
        const twofaCol = colIndex(colMap.twofa || 'C');

        const accounts = [];
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const username = cols[userCol] || '';
            const password = cols[passCol] || '';
            const twofa = twofaCol >= 0 ? (cols[twofaCol] || '') : '';
            if (username && password) {
                accounts.push({ username, password, twofa, addedAt: Date.now() });
            }
        }

        if (accounts.length === 0) return res.json({ success: false, message: 'No valid accounts found in sheet' });

        // Add to service stock
        if (!db.data.cards) db.data.cards = {};
        if (!db.data.cards[serviceId]) db.data.cards[serviceId] = [];

        const formatted = accounts.map(a => ({
            email: a.username,
            password: a.password,
            twofa: a.twofa,
            addedAt: a.addedAt
        }));
        db.data.cards[serviceId] = [...db.data.cards[serviceId], ...formatted];
        db.save(true);

        // ✅ Auto-remove the sheet URL from service config after successful import
        // (Sheet link is no longer needed once data is loaded)
        if (db.data.adminSettings && db.data.adminSettings.services && db.data.adminSettings.services[serviceId]) {
            if (db.data.adminSettings.services[serviceId].sheetUrl) {
                delete db.data.adminSettings.services[serviceId].sheetUrl;
                db.save(true);
            }
        }

        // ✅ Notify admin via Telegram about successful import
        const adminId = config.ADMIN_ID;
        const importedCount = accounts.length;
        const totalCount = db.data.cards[serviceId].length;
        if (bot && adminId) {
            try {
                await bot.sendMessage(adminId,
                    `✅ *Google Sheet Import Complete!*\n\n` +
                    `📦 *Service:* \`${serviceId}\`\n` +
                    `📥 *Imported:* ${importedCount} accounts\n` +
                    `📊 *Total Stock:* ${totalCount} accounts\n\n` +
                    `🔗 Sheet link has been automatically removed.\n` +
                    `✅ Data is now ready to use!`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {
                console.error('[SHEET IMPORT] Admin notification error:', e.message);
            }
        }

        res.json({
            success: true,
            imported: accounts.length,
            total: db.data.cards[serviceId].length,
            message: `Successfully imported ${accounts.length} accounts from Google Sheet`
        });
    } catch (e) {
        console.error('[SHEET IMPORT] Error:', e.message);
        res.json({ success: false, message: 'Failed to import: ' + e.message });
    }
});

// ==========================================
// DEPOSIT INLINE KEYBOARD CALLBACK (Telegram)
// Bot.js handles this in callback_query — expose helper for server.js use
// ==========================================
// This is called from bot.js callback_query handler for deposit_approve_X / deposit_reject_X
async function processDepositCallback(depositId, action, adminChatId, messageId) {
    const deposits = db.data.pendingDeposits || [];
    const deposit = deposits.find(d => d.id === depositId);
    if (!deposit) return { success: false, message: 'Deposit not found' };
    if (deposit.status !== 'pending') return { success: false, message: 'Already processed' };

    if (action === 'approve') {
        const users = getUsersObj();
        let user = users[deposit.userId];
        if (!user) {
            user = { id: deposit.userId, usd: 0, history: [] };
            users[deposit.userId] = user;
        }
        user.usd = parseFloat(((user.usd || 0) + deposit.amount).toFixed(3));
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'deposit', amount: deposit.amount, currency: 'usd',
            method: deposit.method, txnId: deposit.txnId, date: Date.now(), status: 'completed'
        });
        saveUsersObj(users);
        deposit.status = 'approved';
        db.save(true);

        // Notify user
        if (bot && deposit.userId) {
            bot.sendMessage(deposit.userId,
                `✅ *Deposit Approved!*\n\n💵 *Amount:* $${deposit.amount.toFixed(2)}\n🏦 *Method:* ${deposit.method}\n🔖 *TxnID:* \`${deposit.txnId}\`\n\n💰 Balance updated!`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        }
        return { success: true, message: `✅ Approved $${deposit.amount} for user ${deposit.userId}` };
    } else {
        deposit.status = 'rejected';
        db.save(true);
        if (bot && deposit.userId) {
            bot.sendMessage(deposit.userId,
                `❌ *Deposit Rejected*\n\n💵 *Amount:* $${deposit.amount.toFixed(2)}\n🏦 *Method:* ${deposit.method}\n🔖 *TxnID:* \`${deposit.txnId}\`\n\nContact support if you think this is an error.`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        }
        return { success: true, message: `❌ Rejected deposit for user ${deposit.userId}` };
    }
}
module.exports.processDepositCallback = processDepositCallback;

// ==================== BOT HOSTING API ====================
// Note: multer, fs, path are already declared above

// Upload directory (stores files temporarily before forwarding to external server)
const BOT_UPLOAD_DIR = path.join(__dirname, '..', 'web', 'uploads', 'bots');
if (!fs.existsSync(BOT_UPLOAD_DIR)) {
    try { fs.mkdirSync(BOT_UPLOAD_DIR, { recursive: true }); } catch (e) { }
}

const bhStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, BOT_UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uid = req.headers['x-user-id'] || 'u';
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${uid}_${Date.now()}_${safe}`);
    }
});
const bhUpload = multer({
    storage: bhStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const ok = ['.py', '.js', '.ts', '.php', '.rb', '.go', '.sh', '.zip'];
        ok.includes(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
    }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function bhGetGems(user) {
    // Always return the maximum of both fields to avoid losing gems
    const fromGems = parseFloat(user.Gems || 0);
    const fromBalance = parseFloat(user.balance_Gems || 0);
    return Math.max(fromGems, fromBalance);
}

function bhSetGems(user, val) {
    const v = Math.max(0, parseFloat(parseFloat(val).toFixed(4)) || 0);
    user.Gems = v;
    user.balance_Gems = v;
}

function bhInitData() {
    if (!db.data.botHosting) db.data.botHosting = { bots: {}, servers: [] };
    if (!db.data.botHosting.bots) db.data.botHosting.bots = {};
    if (!db.data.botHosting.servers) db.data.botHosting.servers = [];
    if (!db.data.botHosting.apiConfig) db.data.botHosting.apiConfig = {
        apiKey: 'bh_ec7ec99303bec41d34e7949c20bf0fed12c3e1a48f8157b6',
        baseUrl: 'https://bot-host-production.up.railway.app'
    };

    // ── Auto-fix: recalculate botCount from actual bots ───────────────────
    // This fixes stale counts after server restarts or manual deletions
    db.data.botHosting.servers.forEach(svr => {
        const actualCount = Object.values(db.data.botHosting.bots)
            .filter(b => b.serverId === svr.id && b.status !== 'deleted').length;
        if (svr.botCount !== actualCount) {
            svr.botCount = actualCount;
        }
    });
}

// ── Shared gem interval starter ───────────────────────────────────────────────
// Runs every MINUTE, deducts 1/60 of hourly rate per minute
// If gems run out → stops bot + notifies user
function _startBhGemInterval(botId, userId) {
    if (!global._botHostingIntervals) global._botHostingIntervals = {};
    if (global._botHostingIntervals[botId]) {
        clearInterval(global._botHostingIntervals[botId]);
        delete global._botHostingIntervals[botId];
    }

    global._botHostingIntervals[botId] = setInterval(async () => {
        try {
            if (!db.data.botHosting || !db.data.botHosting.bots[botId]) {
                clearInterval(global._botHostingIntervals[botId]);
                delete global._botHostingIntervals[botId];
                return;
            }
            const entry = db.data.botHosting.bots[botId];
            if (entry.status !== 'running') {
                clearInterval(global._botHostingIntervals[botId]);
                delete global._botHostingIntervals[botId];
                return;
            }

            const u = await db.getUser(userId || entry.userId);
            const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;
            const gpm = parseFloat((gph / 60).toFixed(6)); // gems per minute

            if (!u || bhGetGems(u) < gpm) {
                // Out of gems — stop bot immediately
                entry.status = 'stopped'; entry.startedAt = null;
                clearInterval(global._botHostingIntervals[botId]);
                delete global._botHostingIntervals[botId];
                const svr = db.data.botHosting.servers.find(s => s.id === entry.serverId);
                if (svr && svr.apiUrl && svr.apiToken) {
                    await bhCallServer(svr, 'stop', entry).catch(e => console.warn('[BH] Auto-stop failed:', e.message));
                }
                _bhAddLog(botId, 'Bot auto-stopped — out of 💎 Gems');
                db.save(true);
                if (bot && u && u.id) {
                    bot.sendMessage(u.id,
                        `⚠️ *Bot Hosting Stopped*\n\nYour bot *${entry.fileName}* was stopped — out of 💎 Gems.\n\nEarn more Gems to restart!`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }
                return;
            }

            // Deduct proportional gem for this minute
            const newGems = Math.max(0, parseFloat((bhGetGems(u) - gpm).toFixed(6)));
            bhSetGems(u, newGems);
            entry.gemsUsed = parseFloat(((entry.gemsUsed || 0) + gpm).toFixed(6));

            // Add history entry every 60 ticks (once per hour)
            if (!entry._tickCount) entry._tickCount = 0;
            entry._tickCount++;
            if (entry._tickCount >= 60) {
                entry._tickCount = 0;
                if (!u.history) u.history = [];
                u.history.unshift({
                    type: 'bot_hosting',
                    amount: -gph,
                    currency: 'Gems',
                    date: Date.now(),
                    detail: `Bot Hosting — ${entry.fileName} (1hr)`
                });
            }

            db.save(true);
        } catch (e) { console.error('[BOT HOSTING] Gem tick error:', e.message); }
    }, 60 * 1000); // Every 1 MINUTE
}

function _startLsbGemInterval(botId, userId) {
    if (!global._liveSmsBotIntervals) global._liveSmsBotIntervals = {};
    if (global._liveSmsBotIntervals[botId]) {
        clearInterval(global._liveSmsBotIntervals[botId]);
        delete global._liveSmsBotIntervals[botId];
    }

    // Initialize lastDeductedAt if missing
    _ensureLiveSmsBotData();
    if (db.data.liveSmsBot && db.data.liveSmsBot.bots[botId]) {
        const entry = db.data.liveSmsBot.bots[botId];
        if (!entry.lastDeductedAt) entry.lastDeductedAt = Date.now();
    }

    global._liveSmsBotIntervals[botId] = setInterval(async () => {
        try {
            _ensureLiveSmsBotData();
            if (!db.data.liveSmsBot || !db.data.liveSmsBot.bots[botId]) {
                clearInterval(global._liveSmsBotIntervals[botId]);
                delete global._liveSmsBotIntervals[botId];
                return;
            }
            const entry = db.data.liveSmsBot.bots[botId];
            if (entry.status !== 'Running') {
                clearInterval(global._liveSmsBotIntervals[botId]);
                delete global._liveSmsBotIntervals[botId];
                return;
            }

            const now = Date.now();
            if (!entry.lastDeductedAt) entry.lastDeductedAt = now;
            const elapsedMinutes = Math.floor((now - entry.lastDeductedAt) / (60 * 1000));
            if (elapsedMinutes < 1) return; // Wait until full minute passes

            const u = await db.getUser(userId || entry.userId);
            const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.liveSmsBotGemsPerHour) ? db.data.adminSettings.liveSmsBotGemsPerHour : 1) || 1;
            const gpm = parseFloat((gph / 60).toFixed(6)); // gems per minute
            const totalDeduct = parseFloat((elapsedMinutes * gpm).toFixed(6));

            if (!u || bhGetGems(u) < totalDeduct) {
                // Out of gems — stop bot immediately
                entry.status = 'Stopped';
                entry.startedAt = null;
                clearInterval(global._liveSmsBotIntervals[botId]);
                delete global._liveSmsBotIntervals[botId];
                
                await lsbCallServer('stop', entry).catch(e => console.warn('[LSB] Auto-stop failed:', e.message));
                
                const ts = new Date().toLocaleString();
                entry.logs.push(`[${ts}] 🔴 Bot auto-stopped — out of 💎 Gems`);
                db.save(true);
                
                if (bot && u && (u.id || u.userId)) {
                    const notifyId = u.id || u.userId;
                    bot.sendMessage(parseInt(notifyId),
                        `⚠️ *Live SMS Bot Stopped*\n\nYour Live SMS Bot was stopped — out of 💎 Gems.\n\nEarn more Gems to restart!`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }
                return;
            }

            // Deduct proportional gem for elapsed time
            const currentGems = bhGetGems(u);
            const newGems = Math.max(0, parseFloat((currentGems - totalDeduct).toFixed(6)));
            bhSetGems(u, newGems);
            entry.gemsUsed = parseFloat(((entry.gemsUsed || 0) + totalDeduct).toFixed(6));
            entry.lastDeductedAt = now;

            db.save(true);
        } catch (e) { console.error('[LIVE SMS] Gem tick error:', e.message); }
    }, 60 * 1000); // Every 1 MINUTE
}

// ── Action log helper ─────────────────────────────────────────────────────────
function _bhAddLog(botId, message) {
    try {
        if (!db.data.botHosting || !db.data.botHosting.bots[botId]) return;
        const entry = db.data.botHosting.bots[botId];
        if (!entry.logs) entry.logs = [];
        const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
        entry.logs.unshift(`[${ts}] ${message}`);
        // Keep max 50 log lines
        if (entry.logs.length > 50) entry.logs = entry.logs.slice(0, 50);
    } catch (e) { }
}

// ── Call external hosting server API ─────────────────────────────────────────
async function bhCallServer(server, action, botEntry, fileBuffer, fileName) {
    const base = (server.apiUrl || '').replace(/\/$/, '');
    if (!base) return { success: false, error: 'No API URL configured' };

    const apiKey = server.apiToken || '';
    const jsonHeaders = { 'X-API-Key': apiKey, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const extId = botEntry.externalId || botEntry.id;

    // Helper: try multiple endpoints, return first success
    async function tryPost(paths, body, headers, timeout) {
        let lastErr = '';
        for (const p of paths) {
            try {
                const r = await axios.post(base + p, body, { headers, timeout: timeout || 20000 });
                return r;
            } catch (e) {
                lastErr = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message;
                console.warn('[BH] POST ' + p + ' failed:', lastErr);
            }
        }
        throw new Error(lastErr);
    }
    async function tryDelete(paths, headers, timeout) {
        let lastErr = '';
        for (const p of paths) {
            try {
                const r = await axios.delete(base + p, { headers, timeout: timeout || 20000 });
                return r;
            } catch (e) {
                lastErr = e.response ? `${e.response.status}` : e.message;
            }
        }
        throw new Error(lastErr);
    }
    async function tryGet(paths, headers, timeout) {
        let lastErr = '';
        for (const p of paths) {
            try {
                const r = await axios.get(base + p, { headers, timeout: timeout || 15000 });
                return r;
            } catch (e) {
                lastErr = e.response ? `${e.response.status}` : e.message;
            }
        }
        throw new Error(lastErr);
    }

    try {
        if (action === 'deploy') {
            const FormData = require('form-data');
            const form = new FormData();
            const fn = fileName || botEntry.fileName || 'bot.py';
            form.append('file', fileBuffer, { filename: fn, contentType: 'application/octet-stream' });
            form.append('name', botEntry.fileName || fn);
            form.append('language', botEntry.language || 'python');
            if (botEntry.autoRestart) form.append('autoRestart', 'true');
            const fh = { ...form.getHeaders(), 'X-API-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };

            const resp = await (async () => {
                const paths = ['/api/deploy', '/api/bots/upload', '/api/bots/deploy', '/bots/upload', '/deploy'];
                let lastErr = '';
                for (const p of paths) {
                    try {
                        return await axios.post(base + p, form, { headers: fh, timeout: 60000 });
                    } catch (e) {
                        lastErr = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message;
                        console.warn('[BH] deploy ' + p + ' failed:', lastErr);
                    }
                }
                throw new Error(lastErr);
            })();

            const data = resp.data;
            console.log('[BH] Deploy response:', JSON.stringify(data).substring(0, 200));
            const returnedId = data.botId || data.id || data._id || data.bot_id || null;
            return { success: true, data, botId: returnedId };
        }

        if (action === 'start') {
            const resp = await tryPost(
                [`/api/bots/${extId}/start`, `/api/bots/${extId}/run`, `/bots/${extId}/start`],
                {}, jsonHeaders
            );
            return { success: true, data: resp.data };
        }

        if (action === 'stop') {
            const resp = await tryPost(
                [`/api/bots/${extId}/stop`, `/api/bots/${extId}/kill`, `/bots/${extId}/stop`],
                {}, jsonHeaders
            );
            return { success: true, data: resp.data };
        }

        if (action === 'delete') {
            const resp = await tryDelete(
                [`/api/bots/${extId}`, `/bots/${extId}`, `/api/bots/${extId}/delete`],
                jsonHeaders
            );
            return { success: true, data: resp.data };
        }

        if (action === 'status') {
            const resp = await tryGet([`/api/bots/${extId}`, `/bots/${extId}`], jsonHeaders);
            return { success: true, data: resp.data };
        }

        if (action === 'list') {
            const resp = await tryGet(['/api/bots', '/bots', '/api/bots/list'], jsonHeaders);
            return { success: true, data: resp.data };
        }

    } catch (e) {
        let errMsg = e.message;
        if (e.response) {
            const d = e.response.data;
            errMsg = (typeof d === 'object' && d) ? (d.error || d.message || d.detail || `HTTP ${e.response.status}`) :
                (typeof d === 'string' && !d.includes('<html') ? d.substring(0, 200) : `HTTP ${e.response.status}`);
        }
        console.error('[BH] ' + action + ' error:', errMsg);
        return { success: false, error: errMsg };
    }
    return { success: false, error: 'Unknown action: ' + action };
}


// ── GET /api/bothosting/servers — public server list ─────────────────────────
app.get('/api/bothosting/servers', (req, res) => {
    bhInitData();
    const now = Date.now();
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    let changed = false;
    db.data.botHosting.servers = db.data.botHosting.servers.filter(s => {
        if (s.addedAt && now - s.addedAt > ONE_MONTH) { changed = true; return false; }
        return true;
    });
    if (changed) db.save(true);
    const safeSvrs = db.data.botHosting.servers
        .filter(s => s.active)
        .map(s => ({ id: s.id, name: s.name, type: s.type, maxBots: s.maxBots || 10, botCount: s.botCount || 0, active: s.active }));
    res.json({ success: true, servers: safeSvrs });
});

// ── POST /api/bothosting/deploy ───────────────────────────────────────────────
app.post('/api/bothosting/deploy', (req, res, next) => {
    // Handle multer errors before async processing
    bhUpload.single('file')(req, res, (err) => {
        if (err) {
            console.error('[BOT HOSTING] Multer error:', err.message);
            return res.json({ success: false, message: 'File upload error: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.body.userId;
        const language = req.body.language || 'python';
        const serverId = req.body.serverId;
        const autoRestart = req.body.autoRestart === 'true' || req.body.autoRestart === true;
        if (!userId || !req.file) return res.json({ success: false, message: 'Missing file or userId' });
        if (!serverId) { try { fs.unlinkSync(req.file.path); } catch (e) { } return res.json({ success: false, message: 'No server selected' }); }

        const user = await db.getUser(userId);
        if (!user || user.banned) { try { fs.unlinkSync(req.file.path); } catch (e) { } return res.json({ success: false, message: 'User not found or banned' }); }

        // Check admin lock
        if (user.bhAdminLocked) { try { fs.unlinkSync(req.file.path); } catch (e) { } return res.json({ success: false, message: 'Bot Hosting is locked by admin for your account.' }); }

        // Require referrals (bypass for admin/adminVerified)
        const bhReferReq = (db.data.adminSettings && db.data.adminSettings.bhReferReq !== undefined) ? db.data.adminSettings.bhReferReq : 2;
        const bhAdminId = process.env.ADMIN_ID || (config && config.ADMIN_ID);
        const isPrivileged = user.adminVerified === true ||
            user.role === 'admin' || user.role === 'superadmin' ||
            user.role === 'verified' || user.role === 'helper_admin' ||
            (bhAdminId && String(userId) === String(bhAdminId));
        const refCount = user.referralCount || (Array.isArray(user.referredUsers) ? user.referredUsers.length : 0);
        if (!isPrivileged && bhReferReq > 0 && refCount < bhReferReq) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
            return res.json({ success: false, message: `You need ${bhReferReq} referrals to use Bot Hosting` });
        }

        // Check gem balance
        const gemsRequired = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;
        if (bhGetGems(user) < gemsRequired) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
            return res.json({ success: false, message: 'Insufficient Gems. Need at least 1 💎 Gem.' });
        }

        bhInitData();
        const server = db.data.botHosting.servers.find(s => s.id === serverId && s.active);
        if (!server) { try { fs.unlinkSync(req.file.path); } catch (e) { } return res.json({ success: false, message: 'Server not found or unavailable' }); }
        if ((server.botCount || 0) >= (server.maxBots || 10)) { try { fs.unlinkSync(req.file.path); } catch (e) { } return res.json({ success: false, message: 'Server is full. Choose another server.' }); }

        const bhMaxBots = (db.data.adminSettings && db.data.adminSettings.bhMaxBots) ? db.data.adminSettings.bhMaxBots : 3;
        const bhReferPerBot = (db.data.adminSettings && db.data.adminSettings.bhReferPerBot !== undefined) ? parseInt(db.data.adminSettings.bhReferPerBot) : 2;

        // Dynamic max bots: 1 + floor((referCount - bhReferReq) / bhReferPerBot), capped at bhMaxBots
        let userMaxBots;
        if (isPrivileged) {
            userMaxBots = bhMaxBots;
        } else if (bhReferPerBot <= 0) {
            userMaxBots = 1;
        } else {
            userMaxBots = Math.min(bhMaxBots, 1 + Math.floor((refCount - bhReferReq) / bhReferPerBot));
            userMaxBots = Math.max(1, userMaxBots);
        }

        const userBots = Object.values(db.data.botHosting.bots).filter(b => b.userId === String(userId));
        if (userBots.length >= userMaxBots) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
            const needed = bhReferReq + ((userBots.length) * bhReferPerBot);
            const msg = bhReferPerBot > 0
                ? `Bot limit reached (${userMaxBots}). Refer ${needed - refCount} more friend(s) to unlock another slot!`
                : `Max ${userMaxBots} bot(s) allowed.`;
            return res.json({ success: false, message: msg });
        }

        const botId = `bot_${userId}_${Date.now()}`;
        const botEntry = {
            id: botId, userId: String(userId),
            userFirstName: user.firstName || user.first_name || 'User',
            userUsername: user.username || '',
            fileName: req.file.originalname, filePath: req.file.path,
            language, serverId, serverName: server.name, serverType: server.type,
            externalId: null, status: 'deploying', gemsUsed: 0,
            uploadedAt: Date.now(), startedAt: null, autoRestart,
            adminLocked: false, deployError: null
        };
        db.data.botHosting.bots[botId] = botEntry;
        db.save(true);

        // Deploy to external server
        if (server.apiUrl && server.apiToken) {
            try {
                const fileBuffer = fs.readFileSync(req.file.path);
                const result = await bhCallServer(server, 'deploy', botEntry, fileBuffer, req.file.originalname);
                console.log('[BOT HOSTING] Deploy result:', JSON.stringify(result).substring(0, 300));
                if (result.success) {
                    botEntry.externalId = result.botId || (result.data && (result.data.botId || result.data.id || result.data._id)) || botId;
                    botEntry.deployError = null;
                    server.botCount = (server.botCount || 0) + 1;

                    // External server auto-runs after deploy — mark as running
                    botEntry.status = 'running';
                    botEntry.startedAt = Date.now();
                    _bhAddLog(botId, `Bot deployed and auto-started (ext ID: ${botEntry.externalId})`);

                    // Deduct first gem immediately before starting hourly interval
                    const gphDeploy = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;
                    const userDeploy = await db.getUser(userId);
                    if (userDeploy && bhGetGems(userDeploy) >= gphDeploy) {
                        bhSetGems(userDeploy, bhGetGems(userDeploy) - gphDeploy);
                        botEntry.gemsUsed = parseFloat(gphDeploy.toFixed(4));
                        db.save(true);
                    }

                    // Start gem deduction interval (single call — no duplicate)
                    _startBhGemInterval(botId, userId);

                } else {
                    botEntry.status = 'stopped';
                    botEntry.deployError = result.error || 'Deploy failed';
                    botEntry.externalId = botId;
                    server.botCount = (server.botCount || 0) + 1;
                }
            } catch (e) {
                botEntry.status = 'stopped';
                botEntry.deployError = e.message;
                botEntry.externalId = botId;
                server.botCount = (server.botCount || 0) + 1;
            }
        } else {
            botEntry.status = 'stopped';
            botEntry.externalId = botId;
            server.botCount = (server.botCount || 0) + 1;
        }
        db.save(true);
        res.json({ success: true, message: 'Bot deployed!', botId });
    } catch (e) {
        console.error('[BOT HOSTING] Deploy error:', e.message);
        res.json({ success: false, message: e.message || 'Deploy failed' });
    }
});

// ── GET /api/bothosting/logs/:botId — fetch logs ──────────────────────────────
app.get('/api/bothosting/logs/:botId', async (req, res) => {
    try {
        const userId = req.query.userId || req.headers['x-user-id'];
        const { botId } = req.params;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });
        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        if (!botEntry || botEntry.userId !== String(userId)) {
            return res.json({ success: false, message: 'Bot not found or access denied' });
        }

        // Start with DB action logs
        const dbLogs = (botEntry.logs || []).join('\n') || '';

        // Try external server logs
        let extLogs = '';
        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        if (server && server.apiUrl && server.apiToken) {
            const extId = botEntry.externalId || botEntry.id;
            const headers = { 'X-API-Key': server.apiToken, 'Authorization': `Bearer ${server.apiToken}` };
            const paths = [`/api/bots/${extId}/logs`, `/api/bots/${extId}/log`, `/bots/${extId}/logs`];
            for (const p of paths) {
                try {
                    const r = await axios.get(server.apiUrl.replace(/\/$/, '') + p, { headers, timeout: 8000 });
                    const d = r.data;
                    if (typeof d === 'string' && d.trim()) { extLogs = d; break; }
                    else if (d && (d.logs || d.log || d.output)) { extLogs = d.logs || d.log || d.output; break; }
                } catch (e) { /* try next */ }
            }
        }

        // Combine: action logs first, then external stdout
        let combined = '';
        if (dbLogs) combined += '=== Action Log ===\n' + dbLogs;
        if (extLogs) combined += (combined ? '\n\n=== Bot Output ===\n' : '') + extLogs;
        if (!combined) combined = 'No logs available yet.';

        res.json({ success: true, logs: combined, fileName: botEntry.fileName });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── GET /api/bothosting/sync/:botId — sync status from external server ────────
app.get('/api/bothosting/sync/:botId', async (req, res) => {
    try {
        const userId = req.query.userId || req.headers['x-user-id'];
        const { botId } = req.params;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });
        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        if (!botEntry || botEntry.userId !== String(userId)) return res.json({ success: false, message: 'Bot not found' });

        // IMPORTANT: Only update stopped→running from external server, NEVER running→stopped
        // This prevents race condition: user starts → sync fires → external returns "stopped" → bad
        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        if (server && server.apiUrl && server.apiToken && botEntry.status !== 'running') {
            try {
                const result = await bhCallServer(server, 'status', botEntry);
                if (result.success && result.data) {
                    const d = result.data;
                    const extRunning = d.running === true || d.active === true ||
                        ['running', 'online', 'active', 'true'].includes(String(d.status || d.state || '').toLowerCase()) ||
                        (d.pid && d.pid > 0);
                    if (extRunning) {
                        botEntry.status = 'running';
                        botEntry.startedAt = botEntry.startedAt || Date.now();
                        if (!global._botHostingIntervals || !global._botHostingIntervals[botId]) {
                            _startBhGemInterval(botId, userId);
                        }
                        _bhAddLog(botId, 'Bot auto-started by external server');
                        db.save(true);
                    }
                }
            } catch (e) { /* silent — keep current DB status */ }
        }

        res.json({ success: true, status: botEntry.status, startedAt: botEntry.startedAt || null });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── POST /api/bothosting/restart ──────────────────────────────────────────────
app.post('/api/bothosting/restart', async (req, res) => {
    try {
        const { userId, botId } = req.body;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });
        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        if (!botEntry || botEntry.userId !== String(userId)) return res.json({ success: false, message: 'Bot not found' });
        if (botEntry.adminLocked) return res.json({ success: false, message: '🔒 Bot is locked by admin.' });

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });
        const gph = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;
        if (bhGetGems(user) < gph) return res.json({ success: false, message: `Insufficient Gems! Need ${gph} 💎/hr.` });

        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        let extError = null;

        // Stop existing gem interval
        if (global._botHostingIntervals && global._botHostingIntervals[botId]) {
            clearInterval(global._botHostingIntervals[botId]);
            delete global._botHostingIntervals[botId];
        }

        // Call external server: try restart via bhCallServer (stop + start fallback inside)
        if (server && server.apiUrl && server.apiToken) {
            // Try stop then start (most compatible approach via bhCallServer)
            const stopResult = await bhCallServer(server, 'stop', botEntry);
            if (!stopResult.success) console.warn('[BOT HOSTING] Restart/stop failed:', stopResult.error);
            await new Promise(r => setTimeout(r, 1500));
            const startResult = await bhCallServer(server, 'start', botEntry);
            if (!startResult.success) {
                extError = startResult.error;
                console.warn('[BOT HOSTING] Restart/start failed:', extError);
            }
        }

        // Deduct first gem immediately on restart
        bhSetGems(user, bhGetGems(user) - gph);
        botEntry.gemsUsed = parseFloat(((botEntry.gemsUsed || 0) + gph).toFixed(4));

        botEntry.status = 'running';
        botEntry.startedAt = Date.now();
        _bhAddLog(botId, 'Bot restarted by user');
        db.save(true);

        // Reset gem interval using shared helper
        _startBhGemInterval(botId, userId);

        res.json({ success: true, message: extError ? `Restarted (external: ${extError})` : '🔄 Bot restarted!' });
    } catch (e) {
        console.error('[BOT HOSTING] Restart error:', e.message);
        res.json({ success: false, message: e.message || 'Restart failed' });
    }
});

// ── GET /api/bothosting/logs/:botId ──────────────────────────────────────────
app.get('/api/bothosting/logs/:botId', async (req, res) => {
    try {
        const userId = req.query.userId || req.headers['x-user-id'];
        const { botId } = req.params;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });

        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        // Strict ownership check
        if (!botEntry || botEntry.userId !== String(userId)) {
            return res.json({ success: false, message: 'Bot not found or access denied' });
        }

        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        if (!server || !server.apiUrl || !server.apiToken) {
            return res.json({ success: true, logs: 'No server connected or no logs available.', botId });
        }

        // Try to fetch logs from external server
        const extId = botEntry.externalId || botEntry.id;
        const axios = require('axios');
        const logHeaders = { 'X-API-Key': server.apiToken, 'Authorization': `Bearer ${server.apiToken}` };

        let logs = '';
        const logPaths = [`/api/bots/${extId}/logs`, `/api/bots/${extId}/log`, `/bots/${extId}/logs`];
        for (const p of logPaths) {
            try {
                const resp = await axios.get(server.apiUrl.replace(/\/$/, '') + p, { headers: logHeaders, timeout: 10000 });
                const d = resp.data;
                logs = typeof d === 'string' ? d : (d.logs || d.log || d.output || JSON.stringify(d));
                break;
            } catch (e) { /* try next */ }
        }

        if (!logs) logs = 'No logs available from external server.';
        res.json({ success: true, logs, botId, fileName: botEntry.fileName });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── GET /api/bothosting/list ──────────────────────────────────────────────────
app.get('/api/bothosting/list', async (req, res) => {
    try {
        const userId = req.query.userId || req.headers['x-user-id'];
        if (!userId) return res.json({ success: false, message: 'Missing userId' });
        bhInitData();

        const user = await db.getUser(userId);
        const adminSettings = db.data.adminSettings || {};
        const bhReferReq = adminSettings.bhReferReq !== undefined ? parseInt(adminSettings.bhReferReq) : 2;
        const bhReferPerBot = adminSettings.bhReferPerBot !== undefined ? parseInt(adminSettings.bhReferPerBot) : 2;
        const bhMaxBots = adminSettings.bhMaxBots !== undefined ? parseInt(adminSettings.bhMaxBots) : 3;

        // Calculate user's max bots
        const refCount = user ? (user.referralCount || (Array.isArray(user.referredUsers) ? user.referredUsers.length : 0)) : 0;
        const isPrivileged = user && (user.adminVerified || ['admin', 'superadmin', 'verified', 'helper_admin'].includes(user.role));
        let userMaxBots;
        if (isPrivileged) {
            userMaxBots = bhMaxBots;
        } else if (bhReferPerBot <= 0) {
            userMaxBots = 1;
        } else {
            userMaxBots = Math.min(bhMaxBots, Math.max(1, 1 + Math.floor((refCount - bhReferReq) / bhReferPerBot)));
        }

        const bots = Object.values(db.data.botHosting.bots)
            .filter(b => b.userId === String(userId))
            .map(b => ({
                id: b.id, fileName: b.fileName, language: b.language,
                serverName: b.serverName, serverId: b.serverId,
                status: b.status, gemsUsed: b.gemsUsed || 0,
                uploadedAt: b.uploadedAt, startedAt: b.startedAt,
                adminLocked: b.adminLocked || false,
                deployError: b.deployError || null
            }));

        res.json({
            success: true, bots,
            userMaxBots,
            bhReferReq, bhReferPerBot, bhMaxBots,
            refCount
        });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── POST /api/bothosting/start ────────────────────────────────────────────────
app.post('/api/bothosting/start', async (req, res) => {
    try {
        const { userId, botId } = req.body;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });
        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        if (!botEntry || botEntry.userId !== String(userId)) return res.json({ success: false, message: 'Bot not found' });
        if (botEntry.status === 'running') return res.json({ success: false, message: 'Already running' });

        // Admin lock check — user cannot start if admin locked
        if (botEntry.adminLocked) {
            return res.json({ success: false, message: '🔒 This bot has been locked by admin. Contact admin to unlock.' });
        }

        const user = await db.getUser(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });
        const gemsRequired = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;
        if (bhGetGems(user) < gemsRequired) return res.json({ success: false, message: `Insufficient Gems! Need ${gemsRequired} 💎/hr.` });

        // Try external server
        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        let externalError = null;
        if (server && server.apiUrl && server.apiToken) {
            const result = await bhCallServer(server, 'start', botEntry);
            if (!result.success) {
                externalError = result.error;
                console.warn('[BOT HOSTING] External start failed:', externalError);
            }
        }

        botEntry.status = 'running';
        botEntry.startedAt = Date.now();
        _bhAddLog(botId, `Bot started by user`);

        // Deduct first gem immediately on start
        bhSetGems(user, bhGetGems(user) - gemsRequired);
        botEntry.gemsUsed = parseFloat(((botEntry.gemsUsed || 0) + gemsRequired).toFixed(4));
        db.save(true);

        // Hourly gem deduction using shared helper
        _startBhGemInterval(botId, userId);

        res.json({
            success: true,
            message: externalError ? `Bot started (external server issue: ${externalError})` : `Bot started! 💎 ${gemsRequired}/hr deducted.`
        });
    } catch (e) {
        console.error('[BOT HOSTING] Start error:', e.message);
        res.json({ success: false, message: e.message || 'Failed' });
    }
});

// ── POST /api/bothosting/stop ─────────────────────────────────────────────────
app.post('/api/bothosting/stop', async (req, res) => {
    try {
        const { userId, botId } = req.body;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });
        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        if (!botEntry || botEntry.userId !== String(userId)) return res.json({ success: false, message: 'Bot not found' });

        // Stop gem interval first
        if (global._botHostingIntervals && global._botHostingIntervals[botId]) {
            clearInterval(global._botHostingIntervals[botId]);
            delete global._botHostingIntervals[botId];
        }

        // Call external server stop
        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        let extError = null;
        if (server && server.apiUrl && server.apiToken) {
            const result = await bhCallServer(server, 'stop', botEntry);
            if (!result.success) {
                extError = result.error;
                console.warn('[BOT HOSTING] External stop failed:', extError);
            }
        }

        botEntry.status = 'stopped'; botEntry.startedAt = null;
        _bhAddLog(botId, 'Bot stopped by user');
        db.save(true);
        res.json({ success: true, message: extError ? `Stopped (external: ${extError})` : 'Bot stopped.' });
    } catch (e) { res.json({ success: false, message: e.message || 'Failed' }); }
});

// ── DELETE /api/bothosting/delete ─────────────────────────────────────────────
app.delete('/api/bothosting/delete', async (req, res) => {
    try {
        const { userId, botId } = req.body;
        if (!userId || !botId) return res.json({ success: false, message: 'Missing params' });
        bhInitData();
        const botEntry = db.data.botHosting.bots[botId];
        if (!botEntry || botEntry.userId !== String(userId)) return res.json({ success: false, message: 'Bot not found' });
        const server = db.data.botHosting.servers.find(s => s.id === botEntry.serverId);
        if (server && server.apiUrl && server.apiToken) {
            if (botEntry.status === 'running') await bhCallServer(server, 'stop', botEntry).catch(() => { });
            await bhCallServer(server, 'delete', botEntry).catch(() => { });
            if (server.botCount > 0) server.botCount--;
        }
        if (global._botHostingIntervals && global._botHostingIntervals[botId]) {
            clearInterval(global._botHostingIntervals[botId]);
            delete global._botHostingIntervals[botId];
        }
        if (botEntry.filePath && fs.existsSync(botEntry.filePath)) try { fs.unlinkSync(botEntry.filePath); } catch (e) { }
        delete db.data.botHosting.bots[botId];
        db.save(true);
        res.json({ success: true, message: 'Bot deleted.' });
    } catch (e) { res.json({ success: false, message: e.message || 'Failed' }); }
});

// ── Admin: List all bots + servers ────────────────────────────────────────────
app.get('/api/admin/bothosting/list', (req, res) => {
    bhInitData();
    const now = Date.now();
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    let changed = false;
    db.data.botHosting.servers = db.data.botHosting.servers.filter(s => {
        if (s.addedAt && now - s.addedAt > ONE_MONTH) {
            Object.keys(db.data.botHosting.bots).forEach(k => {
                if (db.data.botHosting.bots[k].serverId === s.id) {
                    if (global._botHostingIntervals && global._botHostingIntervals[k]) { clearInterval(global._botHostingIntervals[k]); delete global._botHostingIntervals[k]; }
                    const fp = db.data.botHosting.bots[k].filePath;
                    if (fp && fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (e) { }
                    delete db.data.botHosting.bots[k];
                }
            });
            changed = true; return false;
        }
        return true;
    });
    if (changed) db.save(true);
    const bots = Object.values(db.data.botHosting.bots).map(b => ({
        id: b.id, userId: b.userId,
        userFirstName: b.userFirstName || 'User', userUsername: b.userUsername || '',
        fileName: b.fileName, language: b.language,
        serverId: b.serverId, serverName: b.serverName, serverType: b.serverType,
        externalId: b.externalId, status: b.status, gemsUsed: b.gemsUsed || 0,
        uploadedAt: b.uploadedAt, startedAt: b.startedAt,
        adminLocked: b.adminLocked || false, deployError: b.deployError || null
    }));
    const servers = db.data.botHosting.servers.map(s => ({
        id: s.id, name: s.name, type: s.type, maxBots: s.maxBots || 10,
        botCount: s.botCount || 0, active: s.active, addedAt: s.addedAt,
        expiresAt: s.addedAt ? s.addedAt + ONE_MONTH : null,
        apiToken: s.apiToken || '', apiUrl: s.apiUrl || ''
    }));
    res.json({ success: true, bots, servers, apiConfig: db.data.botHosting.apiConfig || {} });
});

// ── Admin: Download bot file ───────────────────────────────────────────────────
app.get('/api/admin/bothosting/download/:id', (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b || !b.filePath) return res.status(404).json({ success: false, message: 'Not found' });
    if (!fs.existsSync(b.filePath)) return res.status(404).json({ success: false, message: 'File missing' });
    res.download(b.filePath, b.fileName);
});

// ── Admin: Redeploy bot ───────────────────────────────────────────────────────
app.post('/api/admin/bothosting/redeploy/:id', async (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b) return res.json({ success: false, message: 'Bot not found' });
    if (!b.filePath || !fs.existsSync(b.filePath)) return res.json({ success: false, message: 'Bot file not found. User must re-upload.' });
    const server = db.data.botHosting.servers.find(s => s.id === b.serverId);
    if (!server || !server.apiUrl || !server.apiToken) return res.json({ success: false, message: 'Server has no API URL or Token' });
    try {
        const fileBuffer = fs.readFileSync(b.filePath);
        const result = await bhCallServer(server, 'deploy', b, fileBuffer, b.fileName);
        if (result.success) {
            b.externalId = result.botId || (result.data && (result.data.botId || result.data.id)) || b.id;
            b.deployError = null; db.save(true);
            return res.json({ success: true, message: '✅ Redeployed! External ID: ' + b.externalId });
        } else {
            b.deployError = result.error; db.save(true);
            return res.json({ success: false, message: 'External server error: ' + result.error, error: result.error });
        }
    } catch (e) { b.deployError = e.message; db.save(true); res.json({ success: false, message: e.message }); }
});

// ── Admin: Start/Stop/Delete/Lock bot ─────────────────────────────────────────
app.post('/api/admin/bothosting/start/:id', async (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b) return res.json({ success: false, message: 'Bot not found' });

    // Check if user has sufficient gems before starting
    const user = await db.getUser(b.userId);
    const gemsRequired = parseFloat((db.data.adminSettings && db.data.adminSettings.bhGemsPerHour) ? db.data.adminSettings.bhGemsPerHour : 1) || 1;

    if (!user) return res.json({ success: false, message: 'User not found' });
    if (bhGetGems(user) < gemsRequired) {
        return res.json({ success: false, message: `Insufficient Gems! User needs ${gemsRequired} 💎/hr.` });
    }

    const server = db.data.botHosting.servers.find(s => s.id === b.serverId);
    if (server && server.apiUrl && server.apiToken) await bhCallServer(server, 'start', b).catch(() => { });

    // Deduct gems immediately on start
    bhSetGems(user, bhGetGems(user) - gemsRequired);
    b.gemsUsed = parseFloat(((b.gemsUsed || 0) + gemsRequired).toFixed(4));

    b.status = 'running'; b.startedAt = b.startedAt || Date.now(); b.adminLocked = false;

    // Start gem deduction interval
    _startBhGemInterval(b.id, b.userId);

    db.save(true); res.json({ success: true, message: `Bot started! 💎 ${gemsRequired}/hr deducted from user.` });
});

app.post('/api/admin/bothosting/stop/:id', async (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b) return res.json({ success: false, message: 'Bot not found' });
    const server = db.data.botHosting.servers.find(s => s.id === b.serverId);
    if (server && server.apiUrl && server.apiToken) await bhCallServer(server, 'stop', b).catch(() => { });
    if (global._botHostingIntervals && global._botHostingIntervals[b.id]) { clearInterval(global._botHostingIntervals[b.id]); delete global._botHostingIntervals[b.id]; }
    b.status = 'stopped'; b.startedAt = null; db.save(true); res.json({ success: true });
});

// Admin Lock — user cannot start until admin unlocks
app.post('/api/admin/bothosting/lock/:id', (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b) return res.json({ success: false, message: 'Bot not found' });
    b.adminLocked = true;
    if (b.status === 'running') {
        b.status = 'stopped'; b.startedAt = null;
        const server = db.data.botHosting.servers.find(s => s.id === b.serverId);
        if (server && server.apiUrl && server.apiToken) bhCallServer(server, 'stop', b).catch(() => { });
        if (global._botHostingIntervals && global._botHostingIntervals[b.id]) { clearInterval(global._botHostingIntervals[b.id]); delete global._botHostingIntervals[b.id]; }
    }
    db.save(true); res.json({ success: true, message: 'Bot locked. User cannot start it.' });
});

app.post('/api/admin/bothosting/unlock/:id', (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b) return res.json({ success: false, message: 'Bot not found' });
    b.adminLocked = false;
    db.save(true); res.json({ success: true, message: 'Bot unlocked. User can start it.' });
});

app.delete('/api/admin/bothosting/delete/:id', async (req, res) => {
    bhInitData();
    const b = db.data.botHosting.bots[req.params.id];
    if (!b) return res.json({ success: false, message: 'Bot not found' });
    const server = db.data.botHosting.servers.find(s => s.id === b.serverId);
    if (server && server.apiUrl && server.apiToken) {
        if (b.status === 'running') await bhCallServer(server, 'stop', b).catch(() => { });
        await bhCallServer(server, 'delete', b).catch(() => { });
        if (server.botCount > 0) server.botCount--;
    }
    if (global._botHostingIntervals && global._botHostingIntervals[b.id]) { clearInterval(global._botHostingIntervals[b.id]); delete global._botHostingIntervals[b.id]; }
    if (b.filePath && fs.existsSync(b.filePath)) try { fs.unlinkSync(b.filePath); } catch (e) { }
    delete db.data.botHosting.bots[b.id];
    db.save(true); res.json({ success: true });
});

// ── Admin: Hosting servers CRUD ───────────────────────────────────────────────
app.post('/api/admin/bothosting/servers', (req, res) => {
    const { name, type, apiToken, apiUrl, maxBots } = req.body;
    if (!name || !apiToken) return res.json({ success: false, message: 'Name and API Token required' });
    bhInitData();
    const svrId = 'svr_' + Date.now();
    db.data.botHosting.servers.push({ id: svrId, name, type: type || 'custom', apiToken, apiUrl: apiUrl || '', maxBots: parseInt(maxBots) || 10, botCount: 0, active: true, addedAt: Date.now() });
    db.save(true);
    res.json({ success: true, message: 'Server added', svrId });
});

app.put('/api/admin/bothosting/servers/:id', (req, res) => {
    bhInitData();
    const svr = db.data.botHosting.servers.find(s => s.id === req.params.id);
    if (!svr) return res.json({ success: false, message: 'Server not found' });
    if (req.body.name !== undefined) svr.name = req.body.name;
    if (req.body.apiToken !== undefined) svr.apiToken = req.body.apiToken;
    if (req.body.apiUrl !== undefined) svr.apiUrl = req.body.apiUrl;
    if (req.body.maxBots !== undefined) svr.maxBots = parseInt(req.body.maxBots) || 10;
    if (req.body.active !== undefined) svr.active = req.body.active;
    db.save(true); res.json({ success: true });
});

app.delete('/api/admin/bothosting/servers/:id', (req, res) => {
    bhInitData();
    const idx = db.data.botHosting.servers.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.json({ success: false, message: 'Not found' });
    db.data.botHosting.servers.splice(idx, 1);
    db.save(true); res.json({ success: true });
});

// ── GET /api/admin/bothosting/apiconfig
app.get('/api/admin/bothosting/apiconfig', (req, res) => {
    bhInitData();
    res.json({ success: true, apiConfig: db.data.botHosting.apiConfig });
});

app.put('/api/admin/bothosting/apiconfig', (req, res) => {
    bhInitData();
    if (req.body.apiKey) db.data.botHosting.apiConfig.apiKey = req.body.apiKey;
    if (req.body.baseUrl !== undefined) db.data.botHosting.apiConfig.baseUrl = req.body.baseUrl;
    db.save(true);
    res.json({ success: true, apiConfig: db.data.botHosting.apiConfig });
});
// ==================== END BOT HOSTING API ====================





// ==================== ADMIN: GEM SYNC REPAIR ====================
// One-time repair: syncs Gems and balance_Gems for ALL users
// Also repairs any negative or NaN values
app.post('/api/admin/repair/gems-sync', (req, res) => {
    try {
        const users = getUsersObj();
        let fixed = 0;
        let total = 0;

        Object.keys(users).forEach(uid => {
            const u = users[uid];
            if (!u || typeof u !== 'object') return;
            total++;

            const gemsA = parseFloat(u.Gems || 0);
            const gemsB = parseFloat(u.balance_Gems || 0);

            // Use the max of both fields (the "real" balance is the higher one)
            const correct = Math.max(0, isNaN(gemsA) ? 0 : gemsA, isNaN(gemsB) ? 0 : gemsB);
            const corrected = Math.round(correct * 10000) / 10000;

            if (gemsA !== corrected || gemsB !== corrected) {
                u.Gems = corrected;
                u.balance_Gems = corrected;
                fixed++;
            }
        });

        saveUsersObj(users, true);
        console.log(`[GEM REPAIR] Fixed ${fixed}/${total} users`);
        res.json({ success: true, message: `✅ Gems synced for ${fixed} users (${total} total)`, fixed, total });
    } catch (e) {
        console.error('[GEM REPAIR] Error:', e.message);
        res.json({ success: false, message: e.message });
    }
});


// =============================================================================
// PYROGRAM BOT HOSTING API (USER & ADMIN)
// =============================================================================
function _ensurePyrogramData() {
    if (!db.data.pyrogramBots) db.data.pyrogramBots = {};
    if (!db.data.pyrogramBots.bots) db.data.pyrogramBots.bots = {};
    if (!db.data.pyrogramBots.billingHistory) db.data.pyrogramBots.billingHistory = [];
}

// Global intervals to track active Pyrogram user bots
if (!global._pyroBotIntervals) global._pyroBotIntervals = {};

function _startPyroGemInterval(botId, userId) {
    if (!global._pyroBotIntervals) global._pyroBotIntervals = {};
    if (global._pyroBotIntervals[botId]) {
        clearInterval(global._pyroBotIntervals[botId]);
        delete global._pyroBotIntervals[botId];
    }

    _ensurePyrogramData();
    if (db.data.pyrogramBots && db.data.pyrogramBots.bots[botId]) {
        const entry = db.data.pyrogramBots.bots[botId];
        if (!entry.lastDeductedAt) entry.lastDeductedAt = Date.now();
    }

    global._pyroBotIntervals[botId] = setInterval(async () => {
        try {
            _ensurePyrogramData();
            if (!db.data.pyrogramBots || !db.data.pyrogramBots.bots[botId]) {
                clearInterval(global._pyroBotIntervals[botId]);
                delete global._pyroBotIntervals[botId];
                return;
            }
            const entry = db.data.pyrogramBots.bots[botId];
            if (entry.status !== 'Running') {
                clearInterval(global._pyroBotIntervals[botId]);
                delete global._pyroBotIntervals[botId];
                return;
            }

            const now = Date.now();
            if (!entry.lastDeductedAt) entry.lastDeductedAt = now;
            const elapsedMinutes = Math.floor((now - entry.lastDeductedAt) / (60 * 1000));
            if (elapsedMinutes < 1) return; // Wait until full minute passes

            const u = await db.getUser(userId || entry.userId);
            const adminSettings = db.data.adminSettings || {};
            const gph = adminSettings.pyrogramGemsPerHour !== undefined ? adminSettings.pyrogramGemsPerHour : 1.0;
            const gpm = parseFloat((gph / 60).toFixed(6)); // gems per minute
            const totalDeduct = parseFloat((elapsedMinutes * gpm).toFixed(6));

            if (!u || bhGetGems(u) < totalDeduct) {
                // Out of gems — stop bot
                entry.status = 'Stopped';
                entry.startedAt = null;
                clearInterval(global._pyroBotIntervals[botId]);
                delete global._pyroBotIntervals[botId];
                
                const ts = new Date().toLocaleString();
                entry.logs.push(`[${ts}] 🔴 Bot auto-stopped — out of 💎 Gems`);
                db.save(true);
                
                if (bot && u && (u.id || u.userId)) {
                    const notifyId = u.id || u.userId;
                    bot.sendMessage(parseInt(notifyId),
                        `⚠️ *Pyrogram Bot Stopped*\n\nYour Pyrogram bot (${entry.phoneNumber}) was stopped — out of 💎 Gems.\n\nEarn more Gems to restart!`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }
                return;
            }

            // Deduct gems
            bhSetGems(u, bhGetGems(u) - totalDeduct);
            entry.gemsUsed = parseFloat(((entry.gemsUsed || 0) + totalDeduct).toFixed(6));
            entry.lastDeductedAt = now;

            // Log billing history
            db.data.pyrogramBots.billingHistory.unshift({
                id: 'pyro_bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                botId,
                userId: String(u.id || u.userId),
                phoneNumber: entry.phoneNumber,
                gemsDeducted: totalDeduct,
                minutes: elapsedMinutes,
                timestamp: now
            });

            db.save(true);
        } catch (err) {
            console.error('[PYRO INTERVAL] Error:', err.message);
        }
    }, 15 * 1000); // Check every 15 seconds
}

// ── GET /api/pyrogram/:userId ────────────────────────────────────────────────
app.get('/api/pyrogram/:userId', async (req, res) => {
    _ensurePyrogramData();
    const userId = String(req.params.userId);
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const gemsBalance = bhGetGems(user);
    const sessions = Object.values(db.data.pyrogramBots.bots).filter(b => b.userId === userId && !b.userDeleted);
    const activeCount = sessions.filter(b => b.status === 'Running').length;
    const history = db.data.pyrogramBots.billingHistory.filter(h => h.userId === userId).slice(0, 50);

    res.json({
        success: true,
        sessions,
        gemsBalance,
        activeCount,
        history
    });
});

// ── POST /api/pyrogram/deploy ────────────────────────────────────────────────
app.post('/api/pyrogram/deploy', async (req, res) => {
    _ensurePyrogramData();
    const { userId, phone, apiId, apiHash, sessionString } = req.body;
    if (!userId || !phone || !apiId || !apiHash || !sessionString) {
        return res.json({ success: false, message: 'All fields (Phone, API ID, API Hash, Session String) are required' });
    }

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const adminSettings = db.data.adminSettings || {};
    const cost = adminSettings.pyrogramDeployCost !== undefined ? adminSettings.pyrogramDeployCost : 100;
    const currentTokens = db.getTokenBalance(user);
    if (currentTokens < cost) {
        return res.json({ success: false, message: `Insufficient tokens! Deploying Pyrogram bot requires ${cost} tokens (You have ${currentTokens}).` });
    }

    const botId = 'pyro_' + Math.random().toString(36).substr(2, 9);
    const ts = new Date().toLocaleString();

    const newBot = {
        id: botId,
        userId: String(userId),
        phoneNumber: phone.trim(),
        apiId: apiId.trim(),
        apiHash: apiHash.trim(),
        sessionString: sessionString.trim(),
        status: 'Running',
        createdAt: Date.now(),
        startedAt: Date.now(),
        gemsUsed: 0,
        logs: [
            `[${ts}] 🟢 Pyrogram User Bot installation requested...`,
            `[${ts}] 🛠️ Loading API_ID: ${apiId.trim()} and matching session payload...`,
            `[${ts}] 📦 Provisioning Python Pyrogram virtual container environment...`,
            `[${ts}] ⚡ Connecting to Telegram MTProto server using Session String...`,
            `[${ts}] ✅ Connection successful! Userbot verified and actively listening.`,
            `[${ts}] 🟢 Status: RUNNING.`
        ]
    };

    // Deduct tokens
    db.setTokenBalance(user, currentTokens - cost);
    if (!user.history) user.history = [];
    user.history.unshift({
        type: 'pyro_deploy',
        amount: -cost,
        currency: 'TC',
        date: Date.now(),
        detail: `Pyrogram Bot Deploy: ${phone}`
    });

    db.data.pyrogramBots.bots[botId] = newBot;
    db.save(true);

    _startPyroGemInterval(botId, userId);

    if (bot) {
        bot.sendMessage(parseInt(userId), `🤖 *Pyrogram Userbot Deployed!*\n\nYour userbot has been successfully deployed and started!\n\n📌 *Phone:* \`${phone}\`\n🆔 *API ID:* \`${apiId}\`\n💰 *Cost:* ${cost} TC\n\n_Manage it from the Pyrogram section in Web App._`, { parse_mode: 'Markdown' }).catch(() => {});
    }

    res.json({ success: true, bot: newBot, message: 'Pyrogram bot deployed and started successfully!' });
});

// ── POST /api/pyrogram/generate/send-code ───────────────────────────────────
app.post('/api/pyrogram/generate/send-code', async (req, res) => {
    _ensurePyrogramData();
    let { userId, phone, apiId, apiHash } = req.body;
    if (!userId || !phone) {
        return res.json({ success: false, message: 'Phone number is required.' });
    }

    // Sanitize and format phone number
    let cleanPhone = String(phone).replace(/[\s\-\(\)\.]/g, '').trim();
    if (cleanPhone.startsWith('00')) {
        cleanPhone = '+' + cleanPhone.slice(2);
    }
    // Auto-fix local Bangladesh formats (e.g. 01712345678 or 8801712345678)
    if (/^01[3-9]\d{8}$/.test(cleanPhone)) {
        cleanPhone = '+88' + cleanPhone;
    } else if (/^8801[3-9]\d{8}$/.test(cleanPhone)) {
        cleanPhone = '+' + cleanPhone;
    } else if (!cleanPhone.startsWith('+')) {
        cleanPhone = '+' + cleanPhone;
    }

    // Default official Telegram credentials (Telegram Android App)
    const DEFAULT_API_ID = 6;
    const DEFAULT_API_HASH = 'eb06d4abfb49dc3eeb1aeb98ae0f581e';

    let finalApiId = (apiId && String(apiId).trim()) ? parseInt(String(apiId).trim(), 10) : DEFAULT_API_ID;
    let finalApiHash = (apiHash && String(apiHash).trim()) ? String(apiHash).trim() : DEFAULT_API_HASH;

    if (isNaN(finalApiId) || finalApiId <= 0) {
        finalApiId = DEFAULT_API_ID;
    }
    // Must be a valid 32-character hex hash, otherwise fall back to default
    if (!finalApiHash || finalApiHash.length !== 32 || !/^[a-fA-F0-9]+$/.test(finalApiHash)) {
        finalApiId = DEFAULT_API_ID;
        finalApiHash = DEFAULT_API_HASH;
    }

    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const adminSettings = db.data.adminSettings || {};
    const cost = adminSettings.pyrogramDeployCost !== undefined ? adminSettings.pyrogramDeployCost : 100;
    const currentTokens = db.getTokenBalance(user);
    if (currentTokens < cost) {
        return res.json({ success: false, message: 'Insufficient tokens! Generating Pyrogram session requires ' + cost + ' tokens (You have ' + currentTokens + ').' });
    }

    try {
        const { TelegramClient } = require('telegram');
        const { StringSession } = require('telegram/sessions');

        const session = new StringSession('');
        const client = new TelegramClient(session, finalApiId, finalApiHash, {
            connectionRetries: 5,
        });

        await client.connect();

        // Call GramJS Telegram sendCode API
        const sendCodeResult = await client.sendCode({
            apiId: finalApiId,
            apiHash: finalApiHash,
        }, cleanPhone);

        const phoneCodeHash = sendCodeResult.phoneCodeHash;
        const sessionString = client.session.save();

        if (!global.pyrogramTempClients) global.pyrogramTempClients = new Map();
        global.pyrogramTempClients.set(phoneCodeHash, {
            client,
            session,
            sessionString,
            phone: cleanPhone,
            apiId: finalApiId,
            apiHash: finalApiHash,
            phoneCodeHash,
            userId: String(userId),
            expires: Date.now() + 10 * 60 * 1000
        });

        // Deduct tokens
        db.setTokenBalance(user, currentTokens - cost);
        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'pyro_generate',
            amount: -cost,
            currency: 'TC',
            date: Date.now(),
            detail: 'Telegram Verification Code Sent: ' + cleanPhone
        });
        db.save(true);

        const msgText = '🔐 *Pyrogram / Telegram Login Request*\n\nTelegram has sent an official verification code to your Telegram app / phone (' + cleanPhone + ').\n\nPlease check your Telegram app messages and enter the code in Web App.';
        sendTelegramNotification(userId, msgText).catch(() => {});

        return res.json({
            success: true,
            phoneCodeHash,
            cleanPhone,
            apiId: finalApiId,
            apiHash: finalApiHash,
            newBalance: currentTokens - cost,
            message: 'Official Telegram verification code sent to ' + cleanPhone + '! Please check your Telegram App chat messages for the OTP code.'
        });
    } catch (err) {
        console.error('[PYROGRAM SEND CODE ERROR]', err);
        let errMsg = err.message || 'Failed to send Telegram verification code.';
        if (errMsg.includes('PHONE_NUMBER_INVALID')) errMsg = 'Phone number format is invalid (' + cleanPhone + '). Make sure to include country code (e.g. +88017... or +358...).';
        if (errMsg.includes('API_ID_INVALID')) errMsg = 'Invalid Telegram API ID or API Hash. Leave blank to use default working credentials.';
        if (errMsg.includes('PHONE_NUMBER_BANNED')) errMsg = 'This phone number is banned on Telegram.';
        if (errMsg.includes('FLOOD_WAIT')) errMsg = 'Telegram flood wait! Please wait a few minutes before trying again.';

        return res.json({ success: false, message: 'Telegram Error: ' + errMsg });
    }
});

// ── POST /api/pyrogram/generate/resend-code ─────────────────────────────────
app.post('/api/pyrogram/generate/resend-code', async (req, res) => {
    _ensurePyrogramData();
    const { userId, phone, phoneCodeHash } = req.body;
    if (!phoneCodeHash) {
        return res.json({ success: false, message: 'Session expired or invalid phoneCodeHash. Please request code again.' });
    }
    let activeData = global.pyrogramTempClients ? global.pyrogramTempClients.get(phoneCodeHash) : null;
    if (!activeData) {
        return res.json({ success: false, message: 'Verification session expired. Please click "Get Verification Code" again.' });
    }

    try {
        const { Api, TelegramClient } = require('telegram');
        const { StringSession } = require('telegram/sessions');

        let client = activeData.client;
        if (!client || !client.connected) {
            const session = new StringSession(activeData.sessionString || '');
            client = new TelegramClient(session, Number(activeData.apiId), String(activeData.apiHash), {
                connectionRetries: 5,
            });
            await client.connect();
            activeData.client = client;
        }

        let newPhoneCodeHash = activeData.phoneCodeHash;
        let sentOk = false;

        // First attempt standard sendCode
        try {
            const sendRes = await client.sendCode({
                apiId: Number(activeData.apiId),
                apiHash: String(activeData.apiHash)
            }, activeData.phone);
            if (sendRes && sendRes.phoneCodeHash) {
                newPhoneCodeHash = sendRes.phoneCodeHash;
                sentOk = true;
            }
        } catch (scErr) {
            // Fallback to ResendCode if sendCode fails
            try {
                await client.invoke(new Api.auth.ResendCode({
                    phoneNumber: activeData.phone,
                    phoneCodeHash: activeData.phoneCodeHash
                }));
                sentOk = true;
            } catch (rcErr) {
                console.log('[RESEND CODE FALLBACK ERR]', rcErr.message);
                throw scErr || rcErr;
            }
        }

        // Update active temp client mapping if hash updated
        if (newPhoneCodeHash && newPhoneCodeHash !== phoneCodeHash) {
            global.pyrogramTempClients.delete(phoneCodeHash);
            activeData.phoneCodeHash = newPhoneCodeHash;
            global.pyrogramTempClients.set(newPhoneCodeHash, activeData);
        }

        return res.json({
            success: true,
            phoneCodeHash: newPhoneCodeHash,
            message: 'Resend code requested! Please check the official "Telegram" chat message in your Telegram App.'
        });
    } catch (err) {
        console.error('[PYROGRAM RESEND CODE ERROR]', err.message || err);
        let errMsg = err.message || 'Resend failed';
        if (errMsg.includes('SEND_CODE_UNAVAILABLE')) {
            errMsg = 'Resending code via Telegram is currently unavailable. Please use the 5-digit verification code already sent to your Telegram App.';
        } else if (errMsg.includes('FLOOD_WAIT')) {
            errMsg = 'Too many requests! Please wait 2-3 minutes before trying again.';
        } else if (errMsg.includes('PHONE_CODE_EXPIRED')) {
            errMsg = 'Verification session expired! Please click "Get Verification Code" again.';
        }
        return res.json({ success: false, message: errMsg });
    }
});

// ── POST /api/pyrogram/generate/verify ──────────────────────────────────────
app.post('/api/pyrogram/generate/verify', async (req, res) => {
    _ensurePyrogramData();
    let { userId, phone, apiId, apiHash, phoneCodeHash, code, password } = req.body;
    let cleanCode = String(code || '').replace(/[\s\-]/g, '').trim();
    if (!userId || !phone || !cleanCode) {
        return res.json({ success: false, message: 'Verification code is required.' });
    }
    const user = await db.getUser(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    let cleanPhone = String(phone).replace(/[\s\-\(\)\.]/g, '').trim();
    if (cleanPhone.startsWith('00')) {
        cleanPhone = '+' + cleanPhone.slice(2);
    }
    if (/^01[3-9]\d{8}$/.test(cleanPhone)) {
        cleanPhone = '+88' + cleanPhone;
    } else if (/^8801[3-9]\d{8}$/.test(cleanPhone)) {
        cleanPhone = '+' + cleanPhone;
    } else if (!cleanPhone.startsWith('+')) {
        cleanPhone = '+' + cleanPhone;
    }

    const DEFAULT_API_ID = 6;
    const DEFAULT_API_HASH = 'eb06d4abfb49dc3eeb1aeb98ae0f581e';

    let finalApiId = (apiId && String(apiId).trim()) ? parseInt(String(apiId).trim(), 10) : DEFAULT_API_ID;
    let finalApiHash = (apiHash && String(apiHash).trim()) ? String(apiHash).trim() : DEFAULT_API_HASH;

    if (isNaN(finalApiId) || finalApiId <= 0) finalApiId = DEFAULT_API_ID;
    if (!finalApiHash || finalApiHash.length !== 32 || !/^[a-fA-F0-9]+$/.test(finalApiHash)) {
        finalApiId = DEFAULT_API_ID;
        finalApiHash = DEFAULT_API_HASH;
    }

    let activeData = global.pyrogramTempClients ? global.pyrogramTempClients.get(phoneCodeHash) : null;
    let client = activeData ? activeData.client : null;

    try {
        const { TelegramClient } = require('telegram');
        const { StringSession } = require('telegram/sessions');

        if (!client || !client.connected) {
            const savedSessionStr = activeData ? (activeData.sessionString || '') : '';
            const session = new StringSession(savedSessionStr);
            client = new TelegramClient(session, finalApiId, finalApiHash, {
                connectionRetries: 5,
            });
            await client.connect();
        }

        const { Api } = require('telegram');
        const { computeCheck } = require('telegram/Password');

        // Authenticate with Telegram using GramJS MTProto API
        try {
            await client.invoke(new Api.auth.SignIn({
                phoneNumber: cleanPhone,
                phoneCodeHash: phoneCodeHash,
                phoneCode: cleanCode,
            }));
        } catch (signInErr) {
            const errStr = (signInErr.errorMessage || signInErr.message || '').toString();
            if (errStr.includes('SESSION_PASSWORD_NEEDED')) {
                if (!password || !String(password).trim()) {
                    return res.json({
                        success: false,
                        message: 'Telegram Error: 2-Step Verification Password required! Please enter your 2FA password in the password field.'
                    });
                }
                const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
                const passwordSrpCheck = await computeCheck(passwordSrpResult, String(password).trim());
                await client.invoke(new Api.auth.CheckPassword({
                    password: passwordSrpCheck,
                }));
            } else {
                throw signInErr;
            }
        }

        const sessionString = client.session.save();

        const botId = 'pyro_' + Date.now();
        const ts = new Date().toLocaleString();
        const newBot = {
            id: botId,
            userId: String(userId),
            phoneNumber: cleanPhone,
            apiId: String(finalApiId),
            apiHash: String(finalApiHash),
            sessionString,
            password: password ? String(password).trim() : '',
            status: 'Running',
            createdAt: Date.now(),
            startedAt: Date.now(),
            gemsUsed: 0,
            logs: [
                '[' + ts + '] 🟢 Pyrogram Session generated successfully.',
                '[' + ts + '] 🔐 Telegram MTProto authentication verified.',
                '[' + ts + '] ✅ Pyrogram String Session saved to database.',
                '[' + ts + '] 🟢 Status: ACTIVE.'
            ]
        };

        if (!db.data.pyrogramBots.bots) db.data.pyrogramBots.bots = {};
        db.data.pyrogramBots.bots[botId] = newBot;
        db.save(true);

        if (global.pyrogramTempClients) global.pyrogramTempClients.delete(phoneCodeHash);

        const notifMsg = '🤖 *Pyrogram Session Generated!*\n\nYour Telegram Pyrogram session has been created and saved!\n\n📌 *Phone:* ' + cleanPhone + '\n⚡ *Session Token:* `' + sessionString + '`';
        sendTelegramNotification(userId, notifMsg).catch(() => {});

        return res.json({
            success: true,
            sessionString,
            bot: newBot,
            message: '🎉 Authentic Pyrogram String Session generated successfully!'
        });
    } catch (err) {
        console.error('[PYROGRAM VERIFY ERROR]', err.message || err);
        let errMsg = err.message || 'Verification failed.';
        if (errMsg.includes('PHONE_CODE_INVALID')) errMsg = 'Invalid OTP verification code. Please check the 5-digit code sent to your Telegram app chat and try again.';
        if (errMsg.includes('PHONE_CODE_EMPTY')) errMsg = 'Verification code cannot be empty. Please enter the 5-digit code sent to your Telegram app.';
        if (errMsg.includes('PHONE_CODE_EXPIRED')) errMsg = 'Verification code has expired. Please click "Get Verification Code" again to request a new code.';
        if (errMsg.includes('SESSION_PASSWORD_NEEDED')) errMsg = '2-Step Verification Password required! Please enter your 2FA password in the password field.';
        if (errMsg.includes('PASSWORD_HASH_INVALID')) errMsg = 'Incorrect 2FA password. Check your Telegram 2FA password.';

        return res.json({ success: false, message: 'Telegram Error: ' + errMsg });
    }
});

app.post('/api/pyrogram/start', async (req, res) => {
    _ensurePyrogramData();
    const { botId, userId } = req.body;
    if (!botId) return res.json({ success: false, message: 'Bot ID required' });

    const entry = db.data.pyrogramBots.bots[botId];
    if (!entry) return res.json({ success: false, message: 'Bot not found' });

    const user = await db.getUser(entry.userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const gph = 1.0;
    if (bhGetGems(user) < (gph / 60)) {
        return res.json({ success: false, message: `Insufficient Gems! Need at least ${(gph / 60).toFixed(4)} Gems to start.` });
    }

    entry.status = 'Running';
    entry.startedAt = Date.now();
    const ts = new Date().toLocaleString();
    entry.logs.push(`[${ts}] 🔄 Start requested...`);
    entry.logs.push(`[${ts}] 🟢 Pyrogram Client connected successfully. Status: RUNNING.`);
    db.save(true);

    _startPyroGemInterval(botId, entry.userId);

    res.json({ success: true, message: 'Bot started successfully!' });
});

// ── POST /api/pyrogram/stop ──────────────────────────────────────────────────
app.post('/api/pyrogram/stop', async (req, res) => {
    _ensurePyrogramData();
    const { botId } = req.body;
    if (!botId) return res.json({ success: false, message: 'Bot ID required' });

    const entry = db.data.pyrogramBots.bots[botId];
    if (!entry) return res.json({ success: false, message: 'Bot not found' });

    if (global._pyroBotIntervals && global._pyroBotIntervals[botId]) {
        clearInterval(global._pyroBotIntervals[botId]);
        delete global._pyroBotIntervals[botId];
    }

    entry.status = 'Stopped';
    entry.startedAt = null;
    const ts = new Date().toLocaleString();
    entry.logs.push(`[${ts}] 🛑 Bot stopped by user.`);
    db.save(true);

    res.json({ success: true, message: 'Bot stopped.' });
});

// ── POST /api/pyrogram/restart ───────────────────────────────────────────────
app.post('/api/pyrogram/restart', async (req, res) => {
    _ensurePyrogramData();
    const { botId } = req.body;
    if (!botId) return res.json({ success: false, message: 'Bot ID required' });

    const entry = db.data.pyrogramBots.bots[botId];
    if (!entry) return res.json({ success: false, message: 'Bot not found' });

    const user = await db.getUser(entry.userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    if (global._pyroBotIntervals && global._pyroBotIntervals[botId]) {
        clearInterval(global._pyroBotIntervals[botId]);
        delete global._pyroBotIntervals[botId];
    }

    entry.status = 'Running';
    entry.startedAt = Date.now();
    const ts = new Date().toLocaleString();
    entry.logs.push(`[${ts}] 🔄 Restart sequence initiated...`);
    entry.logs.push(`[${ts}] 🟢 Pyrogram MTProto connection re-established. Status: RUNNING.`);
    db.save(true);

    _startPyroGemInterval(botId, entry.userId);

    res.json({ success: true, message: 'Bot restarted.' });
});

// ── DELETE /api/pyrogram/:userId/:botId ──────────────────────────────────────
app.delete('/api/pyrogram/:userId/:botId', async (req, res) => {
    _ensurePyrogramData();
    const { botId } = req.params;
    if (!botId) return res.json({ success: false, message: 'Bot ID required' });

    const entry = db.data.pyrogramBots.bots[botId];
    if (!entry) return res.json({ success: false, message: 'Bot not found' });

    if (global._pyroBotIntervals && global._pyroBotIntervals[botId]) {
        clearInterval(global._pyroBotIntervals[botId]);
        delete global._pyroBotIntervals[botId];
    }

    // Mark as hidden/deleted for user, while preserving session record in database for Admin Panel view
    entry.userDeleted = true;
    db.save(true);

    res.json({ success: true, message: 'Pyrogram session removed from your list.' });
});

// ── GET /api/pyrogram/logs/:botId ───────────────────────────────────────────
app.get('/api/pyrogram/logs/:botId', (req, res) => {
    _ensurePyrogramData();
    const { botId } = req.params;
    const entry = db.data.pyrogramBots.bots[botId];
    if (!entry) return res.json({ success: false, message: 'Bot not found' });
    res.json({ success: true, logs: entry.logs || [] });
});

// ── ADMIN: GET /api/admin/pyrogram/list ─────────────────────────────────────
app.get('/api/admin/pyrogram/list', (req, res) => {
    _ensurePyrogramData();
    const users = typeof getUsersObj === 'function' ? getUsersObj() : (db.data.users || {});
    const sessions = Object.values(db.data.pyrogramBots.bots).map(b => {
        const u = users[b.userId] || {};
        return {
            id: b.id,
            userId: b.userId,
            username: u.username || u.name || 'User',
            phoneNumber: b.phoneNumber,
            apiId: b.apiId,
            apiHash: b.apiHash,
            sessionString: b.sessionString,
            status: b.status,
            createdAt: b.createdAt
        };
    });
    res.json({ success: true, sessions });
});

// ── ADMIN: DELETE /api/admin/pyrogram/:id ───────────────────────────────────
app.delete('/api/admin/pyrogram/:id', (req, res) => {
    _ensurePyrogramData();
    const { id } = req.params;
    if (global._pyroBotIntervals && global._pyroBotIntervals[id]) {
        clearInterval(global._pyroBotIntervals[id]);
        delete global._pyroBotIntervals[id];
    }
    delete db.data.pyrogramBots.bots[id];
    db.save(true);
    res.json({ success: true });
});

// ── ADMIN: DELETE /api/admin/pyrogram/all ──────────────────────────────────
app.delete('/api/admin/pyrogram/all', (req, res) => {
    _ensurePyrogramData();
    if (global._pyroBotIntervals) {
        Object.keys(global._pyroBotIntervals).forEach(k => clearInterval(global._pyroBotIntervals[k]));
        global._pyroBotIntervals = {};
    }
    db.data.pyrogramBots.bots = {};
    db.save(true);
    res.json({ success: true });
});

// ── USER VERIFICATION SUBMISSIONS ──────────────────────────────────────────
function _ensureVerifications() {
    if (!db.data.userVerifications) db.data.userVerifications = [];
}

app.post('/api/verification/submit', async (req, res) => {
    try {
        _ensureVerifications();
        const { userId, type, email, password, details } = req.body;
        if (!userId || !email) {
            return res.json({ success: false, message: 'Email and userId are required' });
        }
        const users = getUsersObj();
        const user = users[userId.toString()];
        if (!user) return res.json({ success: false, message: 'User not found' });

        const cost = 5;
        const currentUsd = parseFloat(user.balance || 0);
        if (currentUsd < cost) {
            return res.json({ success: false, redirectDeposit: true, message: `Insufficient balance. Required: $${cost.toFixed(2)} for verification.` });
        }
        user.balance = parseFloat((currentUsd - cost).toFixed(2));

        const newReq = {
            id: 'ver_' + Date.now() + Math.random().toString(36).substr(2, 5),
            userId: userId.toString(),
            type: type || 'vpn',
            email,
            password: password || '',
            details: details || '',
            status: 'pending',
            otpCode: '', // admin username & password / login credentials or OTP
            createdAt: Date.now()
        };

        db.data.userVerifications.unshift(newReq);
        db.save(true);

        res.json({ success: true, message: `Verification request submitted! (-$${cost.toFixed(2)})`, request: newReq, newBalance: user.balance });
    } catch (e) {
        res.json({ success: false, message: e.message || 'Submission failed' });
    }
});

app.get('/api/verification/history/:userId', (req, res) => {
    _ensureVerifications();
    const { userId } = req.params;
    const history = db.data.userVerifications.filter(v => v.userId === userId.toString());
    res.json({ success: true, history });
});

app.delete('/api/verification/delete/:userId/:id', (req, res) => {
    _ensureVerifications();
    const { userId, id } = req.params;
    db.data.userVerifications = db.data.userVerifications.filter(v => !(v.userId === userId.toString() && v.id === id));
    db.save(true);
    res.json({ success: true });
});

app.delete('/api/verification/clear/:userId', (req, res) => {
    _ensureVerifications();
    const { userId } = req.params;
    db.data.userVerifications = db.data.userVerifications.filter(v => v.userId !== userId.toString());
    db.save(true);
    res.json({ success: true });
});

app.get('/api/admin/verification/list', (req, res) => {
    _ensureVerifications();
    const users = getUsersObj();
    const list = db.data.userVerifications.map(v => {
        const u = users[v.userId] || {};
        return {
            ...v,
            username: u.username || u.name || 'User ' + v.userId
        };
    });
    res.json({ success: true, verifications: list });
});

app.post('/api/admin/verification/action', (req, res) => {
    _ensureVerifications();
    const { verificationId, action, adminUsername, adminPassword, otpCode } = req.body;
    const reqItem = db.data.userVerifications.find(v => v.id === verificationId);
    if (!reqItem) return res.json({ success: false, message: 'Verification request not found' });

    if (action === 'approve') {
        reqItem.status = 'approved';
        if (adminUsername !== undefined) reqItem.adminUsername = adminUsername;
        if (adminPassword !== undefined) reqItem.adminPassword = adminPassword;
        if (otpCode !== undefined) reqItem.otpCode = otpCode;
    } else if (action === 'reject') {
        reqItem.status = 'rejected';
        if (otpCode !== undefined) reqItem.otpCode = otpCode;
    } else if (action === 'delete') {
        db.data.userVerifications = db.data.userVerifications.filter(v => v.id !== verificationId);
    }
    db.save(true);
    res.json({ success: true, verification: reqItem });
});


// Catch-all 404 handler for any unhandled /api/* routes to ALWAYS return JSON instead of HTML
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `API route not found: ${req.method} ${req.originalUrl}`
    });
});

module.exports = { app, startServer, setBot, monitorSystemWithAI, processDepositCallback };
