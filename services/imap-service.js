const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const { extractOTP: robustExtractOTP } = require('./otp-extractor');


/**
 * MOTHER EMAIL IMAP SERVICE (MULTI-ACCOUNT)
 * ─────────────────────────
 * Category/Type (e.g., 'gmail', 'hotmail') অনুযায়ী আলাদা Mother Email connect করে।
 *
 * Hotmail/Outlook NOTE:
 *   Microsoft disabled Basic Auth for IMAP. Two options:
 *   1. App Password — enable 2FA on the account, generate an App Password at
 *      https://account.live.com/proofs/manage and use it as cfg.password.
 *   2. OAuth2 — set cfg.accessToken (a valid OAuth2 access token). The token
 *      is auto-refreshed if cfg.refreshToken + cfg.clientId + cfg.clientSecret
 *      are provided.
 */

// Map of connections: type -> { imapConnection, config, reconnectTimer }
const connections = new Map();

// ==========================================
// OAUTH2 TOKEN REFRESH (Outlook / Hotmail)
// ==========================================

/**
 * Refresh an Outlook OAuth2 access token using the Microsoft identity platform.
 * Requires cfg.refreshToken, cfg.clientId, cfg.clientSecret (and optionally cfg.tenantId).
 */
async function refreshOutlookToken(cfg) {
    const tenantId = cfg.tenantId || 'consumers'; // 'consumers' for personal MSA accounts
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: cfg.refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access'
    });

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Token refresh failed: ${err}`);
    }

    const data = await res.json();
    return data.access_token;
}

// ==========================================
// IMAP CONFIG
// ==========================================

/**
 * Detect whether this email belongs to Microsoft (Hotmail/Outlook/Live).
 */
function isMicrosoftEmail(email) {
    return (
        email.includes('@hotmail.com') ||
        email.includes('@outlook.com') ||
        email.includes('@live.com') ||
        email.includes('@msn.com')
    );
}

async function buildImapConfig(cfg) {
    const host = cfg.host || detectHost(cfg.email);

    // ── OAuth2 path (Outlook / Hotmail) ──────────────────────────────────────
    if (cfg.accessToken || (cfg.refreshToken && cfg.clientId && cfg.clientSecret)) {
        let accessToken = cfg.accessToken;

        // Refresh if expired / missing
        if (!accessToken && cfg.refreshToken) {
            console.log('[IMAP] Refreshing Outlook OAuth2 access token...');
            accessToken = await refreshOutlookToken(cfg);
            cfg.accessToken = accessToken; // cache for reconnects
        }

        return {
            imap: {
                user: cfg.email,
                host,
                port: cfg.port || 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 15000,
                connTimeout: 20000,
                xoauth2: Buffer.from(
                    `user=${cfg.email}\x01auth=Bearer ${accessToken}\x01\x01`
                ).toString('base64')
            }
        };
    }

    // ── Basic Auth / App Password path (all providers) ───────────────────────
    // For Outlook/Hotmail this only works with an App Password (2FA must be on).
    return {
        imap: {
            user: cfg.email,
            password: cfg.password,
            host,
            port: cfg.port || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            connTimeout: 15000,
        }
    };
}

function detectHost(email) {
    if (email.includes('@gmail.com')) return 'imap.gmail.com';
    if (isMicrosoftEmail(email)) return 'imap-mail.outlook.com';
    if (email.includes('@yahoo.com')) return 'imap.mail.yahoo.com';
    return 'imap.gmail.com';
}

// ==========================================
// CONNECT / DISCONNECT
// ==========================================

async function connect(type, cfg) {
    if (!type || !cfg || !cfg.email) return false;

    // Disconnect existing if any for this type
    if (connections.has(type)) {
        disconnect(type);
    }

    try {
        console.log(`[IMAP] Connecting to mother email for [${type}]:`, cfg.email);

        const config = await buildImapConfig(cfg);
        const imapConnection = await imapSimple.connect(config);

        const connData = {
            imapConnection,
            config: cfg,
            reconnectTimer: null
        };

        connections.set(type, connData);

        // Handle unexpected disconnection
        imapConnection.on('error', (err) => {
            console.error(`[IMAP] Connection error for [${type}]:`, err.message);
            handleDisconnect(type);
        });

        imapConnection.on('end', () => {
            console.warn(`[IMAP] Connection ended for [${type}]. Reconnecting...`);
            handleDisconnect(type);
        });

        console.log(`[IMAP] ✅ Connected to mother email for [${type}]:`, cfg.email);
        return true;
    } catch (err) {
        console.error(`[IMAP] ❌ Connection failed for [${type}]:`, err.message);
        if (isMicrosoftEmail(cfg.email) && err.message.includes('AUTHENTICATE')) {
            console.error(
                `[IMAP] 💡 Hotmail/Outlook tip: Microsoft disabled Basic Auth for IMAP.\n` +
                `       Option 1 (easiest): Enable 2FA on the account, generate an App Password at\n` +
                `                           https://account.live.com/proofs/manage\n` +
                `                           and re-save the mother email with the App Password.\n` +
                `       Option 2 (OAuth2):  Provide cfg.refreshToken + cfg.clientId + cfg.clientSecret\n` +
                `                           from your Azure App Registration.`
            );
        }
        return false;
    }
}

function handleDisconnect(type) {
    const connData = connections.get(type);
    if (!connData) return;

    if (connData.imapConnection) {
        try { connData.imapConnection.end(); } catch (e) { }
        connData.imapConnection = null;
    }

    if (connData.reconnectTimer) clearTimeout(connData.reconnectTimer);

    // Auto reconnect
    connData.reconnectTimer = setTimeout(async () => {
        console.log(`[IMAP] Attempting reconnect for [${type}]...`);
        const cfg = connData.config;
        connections.delete(type); // clear old state
        await connect(type, cfg);
    }, 15000); // 15 seconds
}

function disconnect(type) {
    const connData = connections.get(type);
    if (connData) {
        if (connData.reconnectTimer) clearTimeout(connData.reconnectTimer);
        if (connData.imapConnection) {
            try { connData.imapConnection.end(); } catch (e) { }
        }
        connections.delete(type);
        console.log(`[IMAP] Disconnected [${type}]`);
    }
}

// ==========================================
// FETCH MESSAGES
// ==========================================

/**
 * Fetch recent messages from INBOX for a specific type
 */
async function fetchMessages(type, limit = 50, sinceMinutes = 60) {
    const connData = connections.get(type);
    if (!connData || !connData.imapConnection) {
        throw new Error(`IMAP not connected for type: ${type}. Please configure Mother Email first.`);
    }

    const { imapConnection } = connData;

    try {
        await imapConnection.openBox('INBOX');

        const since = new Date();
        since.setMinutes(since.getMinutes() - sinceMinutes);

        const searchCriteria = [['SINCE', since]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true
        };

        const messages = await imapConnection.search(searchCriteria, fetchOptions);
        const parsed = [];

        for (const msg of messages.slice(-limit)) {
            try {
                const allParts = imapSimple.getParts(msg.attributes.struct);
                const bodyPart = msg.parts.find(p => p.which === '');
                const raw = bodyPart ? bodyPart.body : '';

                const parsed_mail = await simpleParser(raw);

                const body = parsed_mail.html || parsed_mail.text || '';
                const subject = parsed_mail.subject || '(No Subject)';
                const from = parsed_mail.from?.text || 'Unknown';
                const to = parsed_mail.to?.text || '';
                const date = parsed_mail.date || new Date();

                // Extract OTP using robust extractor
                const extracted = robustExtractOTP(body, subject);

                const otp = extracted ? extracted.otp : null;

                // JS side precise time filter (IMAP SINCE is only accurate to the day)
                const messageAgeMinutes = (new Date() - date) / (1000 * 60);
                if (messageAgeMinutes > sinceMinutes) {
                    continue; // skip this message
                }

                parsed.push({
                    id: msg.attributes.uid,
                    from,
                    to,
                    subject,
                    body: body,
                    otp,
                    date: date.toISOString(),
                    snippet: body.substring(0, 100)
                });
            } catch (parseErr) {
                // Skip unparseable messages
            }
        }

        return parsed.reverse(); // newest first
    } catch (err) {
        console.error(`[IMAP] Fetch error for [${type}]:`, err.message);
        if (err.message.includes('socket') || err.message.includes('connect')) {
            handleDisconnect(type);
        }
        throw err;
    }
}

/**
 * Fetch messages for a specific email address (pool email) using the correct type's mother email
 */
async function fetchMessagesForEmail(type, targetEmail, sinceMinutes = 120) {
    const connData = connections.get(type);
    if (!connData || !connData.imapConnection) {
        throw new Error(`IMAP not connected for type: ${type}. Please configure Mother Email first.`);
    }

    const { imapConnection } = connData;

    try {
        await imapConnection.openBox('INBOX');

        const since = new Date();
        since.setMinutes(since.getMinutes() - sinceMinutes);

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true
        };

        let messages = [];
        try {
            // Optimize: Search by TO and SINCE directly in IMAP first
            const searchCriteria = [
                ['SINCE', since],
                ['TO', targetEmail]
            ];
            messages = await imapConnection.search(searchCriteria, fetchOptions);
        } catch (searchErr) {
            console.warn(`[IMAP] Direct TO search failed for ${targetEmail}:`, searchErr.message);
        }

        // Fallback: If direct search found nothing or failed, get all recent inbox emails and filter in-memory
        if (!messages || messages.length === 0) {
            console.log(`[IMAP] Direct search yielded 0 results for ${targetEmail}. Fetching last 50 emails as fallback...`);
            try {
                const fallbackCriteria = [['SINCE', since]];
                messages = await imapConnection.search(fallbackCriteria, fetchOptions);
            } catch (fallbackErr) {
                try {
                    messages = await imapConnection.search(['ALL'], fetchOptions);
                } catch (allErr) {
                    console.error('[IMAP] Failed all search methods:', allErr.message);
                    messages = [];
                }
            }
        }

        const parsed = [];
        const targetLower = targetEmail.toLowerCase();

        for (const msg of messages.slice(-100)) { // look up to last 100 messages to be thorough
            try {
                const bodyPart = msg.parts.find(p => p.which === '');
                const raw = bodyPart ? bodyPart.body : '';

                const parsed_mail = await simpleParser(raw);

                const body = parsed_mail.html || parsed_mail.text || '';
                const subject = parsed_mail.subject || '(No Subject)';
                const from = parsed_mail.from?.text || 'Unknown';
                const to = parsed_mail.to?.text || '';
                const date = parsed_mail.date || new Date();

                // Check for match
                const toText = (to || '').toLowerCase();
                const headersText = JSON.stringify(parsed_mail.headers || {}).toLowerCase();

                const isTargetMatch = toText.includes(targetLower) || 
                                      headersText.includes(targetLower) ||
                                      (parsed_mail.html && parsed_mail.html.toLowerCase().includes(targetLower)) ||
                                      (parsed_mail.text && parsed_mail.text.toLowerCase().includes(targetLower));

                if (!isTargetMatch) {
                    continue; // Skip message if it doesn't match our targetEmail
                }

                // Extract OTP using robust extractor
                const extracted = robustExtractOTP(body, subject);
                const otp = extracted ? extracted.otp : null;

                parsed.push({
                    id: msg.attributes.uid,
                    from,
                    to,
                    subject,
                    body: body,
                    otp,
                    date: date.toISOString(),
                    snippet: body.substring(0, 100)
                });
            } catch (parseErr) {
                // Skip unparseable messages
            }
        }

        return parsed.reverse(); // newest first
    } catch (err) {
        console.error(`[IMAP] Fetch error for [${type}] email [${targetEmail}]:`, err.message);
        if (err.message.includes('socket') || err.message.includes('connect')) {
            handleDisconnect(type);
        }
        throw err;
    }
}

// ==========================================
// OTP EXTRACTOR
// ==========================================
// We now use the robust otp-extractor.js service

// ==========================================
// STATUS CHECK
// ==========================================

function getStatus() {
    const status = {};
    for (const [type, data] of connections.entries()) {
        status[type] = {
            connected: !!data.imapConnection,
            email: data.config.email,
            host: data.config.host
        };
    }
    return status;
}

function isConnected(type) {
    const connData = connections.get(type);
    return !!(connData && connData.imapConnection);
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    connect,
    disconnect,
    fetchMessages,
    fetchMessagesForEmail,
    getStatus,
    isConnected
};
