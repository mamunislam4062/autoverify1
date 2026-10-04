const axios = require('axios');
const otpExtractor = require('./otp-extractor');
const config = require('../config');

/**
 * TEMP MAIL PROVIDER CHAIN
 * 
 * Priority order:
 * 0. SmtpLabs (Premium - if API key configured)
 * 0.5. ApiGateway (if DB providers configured)
 * 1. Mail.tm  ← সবচেয়ে reliable, real API আছে
 * 2. 1SecMail ← real API আছে, no auth needed
 * 3. Mail.gw  ← Mail.tm এর alternative
 * 4. GuerrillaMail ← fallback
 * 5+ অন্যান্য fallback providers
 */

const SMTP_API_BASE = 'https://api.smtp.dev';
const SMTP_API_KEY = config.SMTPLABS_API_KEY;

// ==========================================
// LEVEL 0: SmtpLabs (Premium)
// ==========================================
async function trySmtpLabs() {
    if (!SMTP_API_KEY || SMTP_API_KEY.includes('YOUR_')) return null;

    try {
        const randomUser = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const randomPass = `Pass${Date.now()}!`;
        const email = `${randomUser}@smtp.dev`;

        const headers = {
            'X-API-KEY': SMTP_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const res = await axios.post(`${SMTP_API_BASE}/accounts`, {
            address: email,
            password: randomPass
        }, { headers, timeout: 10000 });

        if (res.data && res.data.id) {
            const inbox = res.data.mailboxes?.find(m => m.path === 'INBOX');
            return {
                email: res.data.address,
                password: randomPass,
                accountId: res.data.id,
                mailboxId: inbox ? inbox.id : null,
                token: res.data.id,
                provider: 'smtplabs'
            };
        }
    } catch (e) {
        console.error('SmtpLabs Account Creation Failed:', e.message);
    }
    return null;
}

// ==========================================
// LEVEL 0.5: ApiGateway Failover
// ==========================================
async function tryApiGateway() {
    try {
        const apiGateway = require('./api-gateway');
        const db = require('../db');

        return await apiGateway.executeWithFailover('email', async (provider) => {
            const randomUser = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const randomPass = `Pass${Date.now()}!`;
            const email = `${randomUser}@smtp.dev`;

            const response = await axios.post(`${provider.apiUrl}/accounts`, {
                address: email,
                password: randomPass
            }, {
                headers: {
                    'X-API-KEY': provider.apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.data && response.data.id) {
                const inbox = response.data.mailboxes?.find(m => m.path === 'INBOX');
                return {
                    id: response.data.id,
                    email: response.data.address,
                    password: randomPass,
                    mailboxId: inbox?.id || null,
                    providerId: provider.id,
                    token: response.data.id,
                    provider: 'smtplabs_gateway'
                };
            }
            throw new Error('Invalid Provider Response');
        });
    } catch (e) {
        return null;
    }
}

// ==========================================
// LEVEL 1: Mail.tm (সবচেয়ে reliable)
// API: https://api.mail.tm
// ==========================================
async function tryMailTm() {
    try {
        // Step 1: Get available domain
        const domainRes = await axios.get('https://api.mail.tm/domains', { timeout: 10000 });
        const domain = domainRes.data['hydra:member']?.[0]?.domain;
        if (!domain) throw new Error('No domain available');

        // Step 2: Create account
        const username = Math.random().toString(36).substring(2, 10);
        const password = Math.random().toString(36).substring(2, 10) + 'A1!';
        const email = `${username}@${domain}`;

        await axios.post('https://api.mail.tm/accounts', {
            address: email,
            password: password
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        // Step 3: Get auth token
        const tokenRes = await axios.post('https://api.mail.tm/token', {
            address: email,
            password: password
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (tokenRes.data?.token) {
            return {
                email,
                password,
                token: tokenRes.data.token,
                provider: 'mail.tm'
            };
        }
    } catch (e) {
        // silent fail
    }
    return null;
}

// Mail.tm message fetcher
async function fetchMailTmMessages(token) {
    try {
        const res = await axios.get('https://api.mail.tm/messages', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        // Robust member list parsing
        let messages = [];
        if (res.data) {
            if (Array.isArray(res.data)) {
                messages = res.data;
            } else if (res.data['hydra:member'] && Array.isArray(res.data['hydra:member'])) {
                messages = res.data['hydra:member'];
            } else if (res.data.member && Array.isArray(res.data.member)) {
                messages = res.data.member;
            } else if (res.data.data && Array.isArray(res.data.data)) {
                messages = res.data.data;
            }
        }
        const result = [];

        for (const msg of messages) {
            try {
                // Fetch full message body
                const fullRes = await axios.get(`https://api.mail.tm/messages/${msg.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });
                const full = fullRes.data;
                const body = full.text || full.html || full.intro || '';
                const subject = full.subject || msg.subject || '(No Subject)';
                const extracted = otpExtractor.extractOTP(body, subject);

                result.push({
                    id: msg.id,
                    from: msg.from?.address || msg.from?.name || 'Unknown',
                    subject,
                    body,
                    otp: extracted ? extracted.otp : null,
                    date: msg.createdAt || new Date().toISOString(),
                    snippet: body.substring(0, 100)
                });
            } catch (e) {
                // skip unparseable
            }
        }
        return result;
    } catch (e) {
        if (e.response && e.response.status === 401) {
            throw new Error('UNAUTHORIZED_TOKEN');
        }
        return [];
    }
}

// ==========================================
// LEVEL 2: 1SecMail
// API: https://www.1secmail.com/api/v1/
// ==========================================
async function try1SecMail() {
    try {
        const domains = ['1secmail.com', '1secmail.org', '1secmail.net'];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        const username = Math.random().toString(36).substring(2, 10);
        const email = `${username}@${domain}`;

        return {
            email,
            password: 'No-Password',
            token: email, // login@domain format used for API
            provider: '1secmail'
        };
    } catch (e) {
        // silent
    }
    return null;
}

// 1SecMail message fetcher
async function fetch1SecMailMessages(email) {
    try {
        const [login, domain] = email.split('@');
        if (!login || !domain) return [];

        // Get message list
        const listRes = await axios.get(
            `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`,
            { timeout: 10000 }
        );

        if (!Array.isArray(listRes.data) || listRes.data.length === 0) return [];

        const result = [];
        for (const msg of listRes.data.slice(0, 10)) {
            try {
                // Get full message
                const fullRes = await axios.get(
                    `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msg.id}`,
                    { timeout: 10000 }
                );
                const full = fullRes.data;
                const body = full.textBody || full.htmlBody || full.body || '';
                const subject = full.subject || msg.subject || '(No Subject)';
                const extracted = otpExtractor.extractOTP(body, subject);

                result.push({
                    id: msg.id,
                    from: full.from || msg.from || 'Unknown',
                    subject,
                    body,
                    otp: extracted ? extracted.otp : null,
                    date: full.date || msg.date || new Date().toISOString(),
                    snippet: body.substring(0, 100)
                });
            } catch (e) {
                // skip
            }
        }
        return result;
    } catch (e) {
        return [];
    }
}

// ==========================================
// LEVEL 3: Mail.gw (Mail.tm এর alternative)
// API: https://api.mail.gw
// ==========================================
async function tryMailGw() {
    try {
        const domainRes = await axios.get('https://api.mail.gw/domains', { timeout: 10000 });
        const domain = domainRes.data['hydra:member']?.[0]?.domain;
        if (!domain) throw new Error('No domain');

        const username = Math.random().toString(36).substring(2, 10);
        const password = Math.random().toString(36).substring(2, 10) + 'A1!';
        const email = `${username}@${domain}`;

        await axios.post('https://api.mail.gw/accounts', {
            address: email,
            password: password
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        const tokenRes = await axios.post('https://api.mail.gw/token', {
            address: email,
            password: password
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (tokenRes.data?.token) {
            return {
                email,
                password,
                token: tokenRes.data.token,
                provider: 'mail.gw'
            };
        }
    } catch (e) {
        // silent
    }
    return null;
}

// Mail.gw message fetcher (same API structure as Mail.tm)
async function fetchMailGwMessages(token) {
    try {
        const res = await axios.get('https://api.mail.gw/messages', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        // Robust member list parsing
        let messages = [];
        if (res.data) {
            if (Array.isArray(res.data)) {
                messages = res.data;
            } else if (res.data['hydra:member'] && Array.isArray(res.data['hydra:member'])) {
                messages = res.data['hydra:member'];
            } else if (res.data.member && Array.isArray(res.data.member)) {
                messages = res.data.member;
            } else if (res.data.data && Array.isArray(res.data.data)) {
                messages = res.data.data;
            }
        }
        const result = [];

        for (const msg of messages) {
            try {
                const fullRes = await axios.get(`https://api.mail.gw/messages/${msg.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });
                const full = fullRes.data;
                const body = full.text || full.html || full.intro || '';
                const subject = full.subject || msg.subject || '(No Subject)';
                const extracted = otpExtractor.extractOTP(body, subject);

                result.push({
                    id: msg.id,
                    from: msg.from?.address || msg.from?.name || 'Unknown',
                    subject,
                    body,
                    otp: extracted ? extracted.otp : null,
                    date: msg.createdAt || new Date().toISOString(),
                    snippet: body.substring(0, 100)
                });
            } catch (e) {
                // skip
            }
        }
        return result;
    } catch (e) {
        if (e.response && e.response.status === 401) {
            throw new Error('UNAUTHORIZED_TOKEN');
        }
        return [];
    }
}

// ==========================================
// LEVEL 4: GuerrillaMail (fallback)
// ==========================================
async function tryGuerrilla() {
    try {
        const res = await axios.get(
            'https://api.guerrillamail.com/ajax.php?f=get_email_address',
            { timeout: 10000 }
        );
        if (res.data?.email_addr) {
            return {
                email: res.data.email_addr,
                password: 'No-Password',
                token: res.data.sid_token,
                provider: 'guerrilla'
            };
        }
    } catch (e) {
        // silent
    }
    return null;
}

// GuerrillaMail message fetcher
async function fetchGuerrillaMessages(token) {
    try {
        const res = await axios.get(
            `https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token=${token}`,
            { timeout: 10000 }
        );
        if (!res.data?.list) return [];

        const result = [];
        for (const msg of res.data.list.slice(0, 10)) {
            try {
                // Fetch full mail content
                const fullRes = await axios.get(
                    `https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${msg.mail_id}&sid_token=${token}`,
                    { timeout: 10000 }
                );
                const full = fullRes.data;
                const body = full?.mail_body || msg.mail_body || msg.mail_excerpt || '';
                const subject = full?.mail_subject || msg.mail_subject || '(No Subject)';
                const extracted = otpExtractor.extractOTP(body, subject);
                
                result.push({
                    id: msg.mail_id,
                    from: full?.mail_from || msg.mail_from || 'Unknown',
                    subject,
                    body,
                    otp: extracted ? extracted.otp : null,
                    date: msg.mail_timestamp ? new Date(parseInt(msg.mail_timestamp) * 1000).toISOString() : new Date().toISOString(),
                    snippet: (full?.mail_excerpt || body || '').substring(0, 100)
                });
            } catch (err) {
                // fallback to basic list info if fetch_email fails
                const body = msg.mail_body || msg.mail_excerpt || '';
                const subject = msg.mail_subject || '(No Subject)';
                const extracted = otpExtractor.extractOTP(body, subject);
                result.push({
                    id: msg.mail_id,
                    from: msg.mail_from || 'Unknown',
                    subject,
                    body,
                    otp: extracted ? extracted.otp : null,
                    date: msg.mail_timestamp ? new Date(parseInt(msg.mail_timestamp) * 1000).toISOString() : new Date().toISOString(),
                    snippet: body.substring(0, 100)
                });
            }
        }
        return result;
    } catch (e) {
        return [];
    }
}

// ==========================================
// LEVEL 5: DropMail.me (GraphQL)
// ==========================================
async function tryDropMail() {
    try {
        const res = await axios.get(
            'https://dropmail.me/api/graphql/query?query=mutation%20%7BintroduceSession%20%7Bid%2C%20expiresAt%2C%20addresses%20%7Baddress%7D%7D%7D',
            { timeout: 10000 }
        );
        if (res.data?.data?.introduceSession) {
            const session = res.data.data.introduceSession;
            const email = session.addresses[0]?.address;
            if (email) {
                return {
                    email,
                    password: 'No-Password',
                    token: session.id,
                    provider: 'dropmail'
                };
            }
        }
    } catch (e) {
        // silent
    }
    return null;
}

// DropMail message fetcher
async function fetchDropMailMessages(token) {
    try {
        const query = encodeURIComponent(`{session(id:"${token}"){mails{rawSize,fromAddr,toAddr,downloadUrl,text,headerSubject}}}`);
        const res = await axios.get(
            `https://dropmail.me/api/graphql/query?query=${query}`,
            { timeout: 10000 }
        );
        const mails = res.data?.data?.session?.mails || [];
        return mails.map((m, i) => {
            const body = m.text || '';
            const subject = m.headerSubject || '(No Subject)';
            const extracted = otpExtractor.extractOTP(body, subject);
            return {
                id: `drop_${i}`,
                from: m.fromAddr || 'Unknown',
                subject,
                body,
                otp: extracted ? extracted.otp : null,
                date: new Date().toISOString(),
                snippet: body.substring(0, 100)
            };
        });
    } catch (e) {
        return [];
    }
}

// ==========================================
// LEVEL 6: Yopmail (simple fallback)
// ==========================================
async function tryYopmail() {
    try {
        const username = Math.random().toString(36).substring(2, 10);
        const email = `${username}@yopmail.com`;
        return {
            email,
            password: 'No-Password',
            token: username,
            provider: 'yopmail'
        };
    } catch (e) {
        // silent
    }
    return null;
}

// ==========================================
// LEVEL 7: Mailinator (simple fallback)
// ==========================================
async function tryMailinator() {
    try {
        const username = Math.random().toString(36).substring(2, 10);
        const email = `${username}@mailinator.com`;
        return {
            email,
            password: 'No-Password',
            token: username,
            provider: 'mailinator'
        };
    } catch (e) {
        // silent
    }
    return null;
}

// ==========================================
// MAIN GENERATOR
// ==========================================
async function createAccount() {
    console.log('🔄 Starting Temp Email Generation Chain...');

    // 0. SmtpLabs (Premium)
    let account = await trySmtpLabs();
    if (account) {
        console.log('✅ SmtpLabs provided email:', account.email);
        return account;
    }

    // 0.5. ApiGateway
    const db = require('../db');
    const hasEmailProviders = db.data?.providers &&
        Object.values(db.data.providers).some(p => p.type === 'email' && p.status === 'active');

    if (hasEmailProviders) {
        account = await tryApiGateway();
        if (account) {
            console.log('✅ ApiGateway provided email:', account.email);
            return account;
        }
    }

    // Dynamic, Fair Round-Robin Free Providers List (Filtered to only stable and unblocked APIs)
    const FREE_PROVIDERS = [
        { name: 'mail.tm', fn: tryMailTm },
        { name: 'guerrilla', fn: tryGuerrilla }
    ];

    if (!db.data) db.data = {};
    const lastIndex = db.data.lastTempMailIndex !== undefined ? db.data.lastTempMailIndex : -1;
    const nextStartIndex = (lastIndex + 1) % FREE_PROVIDERS.length;

    console.log(`🔄 Round-Robin Temp Mail Selection: starting search at index ${nextStartIndex} (${FREE_PROVIDERS[nextStartIndex].name})...`);

    let chosenIndex = -1;

    for (let i = 0; i < FREE_PROVIDERS.length; i++) {
        const currentIndex = (nextStartIndex + i) % FREE_PROVIDERS.length;
        const provider = FREE_PROVIDERS[currentIndex];
        console.log(`  → Trying ${provider.name} (Index ${currentIndex})...`);
        try {
            account = await provider.fn();
            if (account) {
                chosenIndex = currentIndex;
                console.log(`✅ ${provider.name} succeeded! Email: ${account.email}`);
                break;
            }
        } catch (err) {
            console.error(`  ❌ Provider ${provider.name} failed:`, err.message);
        }
    }

    if (account && chosenIndex !== -1) {
        db.data.lastTempMailIndex = chosenIndex;
        db.save();
        return account;
    }

    // Try a second pass on the highly stable ones to recover from transient failures
    console.log('🔄 Secondary pass on Mail.tm and Guerrilla to recover transient network issues...');
    try {
        account = await tryMailTm();
        if (account) return account;
    } catch (e) {}
    try {
        account = await tryGuerrilla();
        if (account) return account;
    } catch (e) {}

    console.error('❌ All temp mail providers failed');
    return null;
}

// ==========================================
// TOKEN REFRESH HELPERS (for Mail.tm and Mail.gw)
// ==========================================
async function refreshMailTmToken(email, password, sessionId) {
    try {
        console.log(`[Mail.tm] Attempting to refresh token for ${email}...`);
        const tokenRes = await axios.post('https://api.mail.tm/token', {
            address: email,
            password: password
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        if (tokenRes.data?.token) {
            const newToken = tokenRes.data.token;
            console.log(`[Mail.tm] Token refresh successful for ${email}`);
            
            const db = require('../db');
            if (db.data && db.data.mailSessions && db.data.mailSessions[sessionId]) {
                db.data.mailSessions[sessionId].token = newToken;
                db.save();
            }
            return newToken;
        }
    } catch (err) {
        console.error(`[Mail.tm] Token refresh failed for ${email}:`, err.message);
    }
    return null;
}

async function refreshMailGwToken(email, password, sessionId) {
    try {
        console.log(`[Mail.gw] Attempting to refresh token for ${email}...`);
        const tokenRes = await axios.post('https://api.mail.gw/token', {
            address: email,
            password: password
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        if (tokenRes.data?.token) {
            const newToken = tokenRes.data.token;
            console.log(`[Mail.gw] Token refresh successful for ${email}`);
            
            const db = require('../db');
            if (db.data && db.data.mailSessions && db.data.mailSessions[sessionId]) {
                db.data.mailSessions[sessionId].token = newToken;
                db.save();
            }
            return newToken;
        }
    } catch (err) {
        console.error(`[Mail.gw] Token refresh failed for ${email}:`, err.message);
    }
    return null;
}

// ==========================================
// MAIN MESSAGE FETCHER
// Routes to correct provider based on session
// ==========================================
async function getMessages(token, email, provider, sessionId = null, password = null) {
    if (!token && !email) return [];

    const p = provider || '';

    // SmtpLabs / ApiGateway — handled by bot.js directly via SMTP API
    if (p === 'smtplabs' || p === 'smtplabs_gateway') {
        return []; // handled separately in bot.js
    }

    // Mail.tm
    if (p === 'mail.tm') {
        try {
            return await fetchMailTmMessages(token);
        } catch (err) {
            if (err.message === 'UNAUTHORIZED_TOKEN' && email && password && sessionId) {
                const newToken = await refreshMailTmToken(email, password, sessionId);
                if (newToken) {
                    try {
                        return await fetchMailTmMessages(newToken);
                    } catch (retryErr) {
                        return [];
                    }
                }
            }
            return [];
        }
    }

    // 1SecMail
    if (p === '1secmail') {
        return await fetch1SecMailMessages(email || token);
    }

    // Mail.gw
    if (p === 'mail.gw') {
        try {
            return await fetchMailGwMessages(token);
        } catch (err) {
            if (err.message === 'UNAUTHORIZED_TOKEN' && email && password && sessionId) {
                const newToken = await refreshMailGwToken(email, password, sessionId);
                if (newToken) {
                    try {
                        return await fetchMailGwMessages(newToken);
                    } catch (retryErr) {
                        return [];
                    }
                }
            }
            return [];
        }
    }

    // GuerrillaMail
    if (p === 'guerrilla') {
        return await fetchGuerrillaMessages(token);
    }

    // DropMail
    if (p === 'dropmail') {
        return await fetchDropMailMessages(token);
    }

    // Yopmail / Mailinator — no public API, return empty
    if (p === 'yopmail' || p === 'mailinator') {
        return [];
    }

    // Unknown provider — try by token type
    if (token && token.includes('@')) {
        // Looks like an email address → try 1SecMail format
        return await fetch1SecMailMessages(token);
    }

    // Looks like a JWT/bearer token → try Mail.tm
    if (token && token.length > 20) {
        try {
            return await fetchMailTmMessages(token);
        } catch (err) {
            if (err.message === 'UNAUTHORIZED_TOKEN' && email && password && sessionId) {
                const newToken = await refreshMailTmToken(email, password, sessionId);
                if (newToken) {
                    try {
                        return await fetchMailTmMessages(newToken);
                    } catch (retryErr) {
                        return [];
                    }
                }
            }
            return [];
        }
    }

    return [];
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
    createAccount,
    getMessages,

    // Individual providers (for direct use)
    trySmtpLabs,
    tryMailTm,
    try1SecMail,
    tryMailGw,
    tryGuerrilla,
    tryDropMail,

    // Individual fetchers
    fetchMailTmMessages,
    fetch1SecMailMessages,
    fetchMailGwMessages,
    fetchGuerrillaMessages,
    fetchDropMailMessages
};
