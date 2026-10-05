// Helper: Check if userId is valid before making API calls
function isValidUserId(userId) {
    if (!userId) return false;
    const numericId = typeof userId === 'number' ? userId : parseInt(userId);
    return !isNaN(numericId) && numericId > 0;
}

// Global bot name (loaded from server)
let globalBotName = 'Auto Verify';

// Load bot name from server
async function loadBotName() {
    try {
        const response = await apiFetch('/api/admin/settings');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.adminSettings && data.adminSettings.botName) {
                globalBotName = data.adminSettings.botName;
                // Update any displayed bot name
                updateAllBotNames();
            }
        }
    } catch (e) {
        console.log('[Bot Name] Using default name');
    }
}

// Update all bot names in the page
function updateAllBotNames() {
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle && headerTitle.querySelector('.cb-text')) {
        headerTitle.querySelector('.cb-text').textContent = globalBotName;
    }
}

// Success modal for code redemption
function showRedeemSuccessModal(rewardAmount) {
    // Create modal if doesn't exist
    let modal = document.getElementById('redeem-success-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'redeem-success-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        modal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 2px solid #22c55e;
                border-radius: 20px;
                padding: 40px 30px;
                text-align: center;
                transform: scale(0.8);
                transition: transform 0.3s ease;
                max-width: 280px;
                width: 90%;
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    animation: checkmarkPop 0.5s ease;
                ">
                    <i class="fas fa-check" style="font-size: 40px; color: white;"></i>
                </div>
                <h3 style="color: #22c55e; font-size: 24px; margin: 0 0 10px 0; font-weight: 700;">Successful!</h3>
                <p style="color: #fff; font-size: 16px; margin: 0 0 8px 0;">You received</p>
                <p style="color: #22c55e; font-size: 32px; margin: 0 0 20px 0; font-weight: 800;">+${typeof formatCompact === 'function' ? formatCompact(rewardAmount) : rewardAmount} Tokens</p>
                <button onclick="closeRedeemModal()" style="
                    background: #22c55e;
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    width: 100%;
                ">OK</button>
            </div>
        `;
        document.body.appendChild(modal);

        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes checkmarkPop {
                0% { transform: scale(0); }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    // Update reward amount
    const rewardEl = modal.querySelector('p:nth-of-type(2)');
    if (rewardEl) rewardEl.textContent = `+${rewardAmount} Tokens`;

    // Show modal
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.querySelector('div').style.transform = 'scale(1)';
    }, 10);

    // Auto close after 3 seconds
    setTimeout(() => {
        closeRedeemModal();
    }, 3000);
}

function closeRedeemModal() {
    const modal = document.getElementById('redeem-success-modal');
    if (modal) {
        modal.style.opacity = '0';
        modal.querySelector('div').style.transform = 'scale(0.8)';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

function openPremiumGmailDirect() {
    openPremiumMailDirect();
}

// ===== POPUP NOTIFICATION SYSTEM =====
// Shows important notifications as dismissible popups that auto-close
let _shownPopupIds = new Set(); // track already-shown popups this session

function showNotificationPopup(notification) {
    if (!notification) return;
    // Don't show the same notification popup twice in same session
    if (notification.id && _shownPopupIds.has(notification.id)) return;
    if (notification.id) _shownPopupIds.add(notification.id);

    // Remove any existing popup first (don't stack)
    const existingPopup = document.querySelector('[data-popup="true"]');
    if (existingPopup) existingPopup.remove();

    // Create overlay if needed
    let overlay = document.getElementById('notification-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'notification-popup-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 8999;
            opacity: 0; transition: opacity 0.3s; pointer-events: none;
        `;
        document.body.appendChild(overlay);
    }

    // Add animation styles once
    if (!document.getElementById('popup-style')) {
        const style = document.createElement('style');
        style.id = 'popup-style';
        style.textContent = `
            @keyframes slideInPopup {
                from { opacity:0; transform:translate(-50%,-60%) scale(0.85); }
                to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
            }
            @keyframes slideOutPopup {
                to { opacity:0; transform:translate(-50%,-40%) scale(0.85); }
            }
        `;
        document.head.appendChild(style);
    }

    // Icon + color by type
    const typeMap = {
        admin_reply: { icon: 'fa-comment-alt', color: '#38bdf8', label: 'MESSAGE' },
        gift: { icon: 'fa-gift', color: '#f59e0b', label: 'GIFT' },
        broadcast: { icon: 'fa-bullhorn', color: '#ec4899', label: 'BROADCAST' },
        support: { icon: 'fa-headset', color: '#10b981', label: 'SUPPORT' },
        deposit: { icon: 'fa-landmark', color: '#06b6d4', label: 'DEPOSIT' },
    };
    const tm = typeMap[notification.type] || { icon: 'fa-bell', color: '#a78bfa', label: 'NOTICE' };

    // Duration: admin message = 20s, gift = 20s, broadcast = 12s, others = 10s
    const duration = notification.duration ||
        (notification.type === 'admin_reply' ? 20000 :
            notification.type === 'gift' ? 20000 :
                notification.type === 'broadcast' ? 12000 : 10000);

    const popup = document.createElement('div');
    popup.setAttribute('data-popup', 'true');
    popup.style.cssText = `
        position:fixed; top:50%; left:50%;
        transform:translate(-50%,-50%) scale(1);
        background:linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,41,59,0.97));
        border:1px solid rgba(255,255,255,0.12); border-radius:20px;
        padding:20px; max-width:92%; width:340px;
        z-index:9000; box-shadow:0 24px 64px rgba(0,0,0,0.6);
        backdrop-filter:blur(16px);
        animation:slideInPopup 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
    `;

    // Progress bar for auto-close countdown
    popup.innerHTML = `
        <!-- Type badge + close -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <span style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:${tm.color};
                background:${tm.color}22;padding:3px 10px;border-radius:20px;border:1px solid ${tm.color}44;">
                ${tm.label}
            </span>
            <button id="notif-popup-close" style="background:rgba(255,255,255,0.08);border:none;
                color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;
                font-size:13px;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <!-- Icon + Title -->
        <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:12px;">
            <div style="width:46px;height:46px;border-radius:14px;flex-shrink:0;
                background:${tm.color}1a;border:1px solid ${tm.color}33;
                display:flex;align-items:center;justify-content:center;">
                <i class="fas ${tm.icon}" style="color:${tm.color};font-size:20px;"></i>
            </div>
            <div style="flex:1;">
                <div style="color:#fff;font-weight:800;font-size:15px;margin-bottom:4px;">
                    ${notification.title || 'New Notification'}
                </div>
                <div style="color:rgba(255,255,255,0.75);font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;">
                    ${notification.message || ''}
                </div>
                ${notification.mediaUrl ? (notification.mediaType === 'video' ? `<video src="${notification.mediaUrl}" controls style="max-width: 100%; border-radius: 8px; margin-top: 8px; max-height: 120px; display: block;"></video>` : `<img src="${notification.mediaUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px; max-height: 120px; object-fit: contain; display: block;">`) : ''}
            </div>
        </div>
        <!-- Countdown progress bar -->
        <div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-top:4px;">
            <div id="notif-popup-bar" style="height:100%;background:${tm.color};border-radius:2px;
                width:100%;transition:width ${duration}ms linear;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;">
            <span style="font-size:10px;color:rgba(255,255,255,0.3);">
                ${new Date(notification.timestamp || notification.date || Date.now()).toLocaleTimeString()}
            </span>
            <span id="notif-popup-timer" style="font-size:10px;color:${tm.color};font-weight:700;">
                ${Math.round(duration / 1000)}s
            </span>
        </div>
    `;

    document.body.appendChild(popup);

    // Show overlay
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';

    // Start countdown bar animation
    setTimeout(() => {
        const bar = document.getElementById('notif-popup-bar');
        if (bar) bar.style.width = '0%';
    }, 50);

    // Live timer countdown
    let remaining = Math.round(duration / 1000);
    const timerEl = document.getElementById('notif-popup-timer');
    const timerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining + 's';
        if (remaining <= 0) clearInterval(timerInterval);
    }, 1000);

    // Auto-close
    const autoCloseTimer = setTimeout(() => {
        clearInterval(timerInterval);
        _closeNotifPopup(popup, overlay);
    }, duration);

    // Manual close button
    const closeBtn = popup.querySelector('#notif-popup-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            clearTimeout(autoCloseTimer);
            clearInterval(timerInterval);
            _closeNotifPopup(popup, overlay);
        });
    }

    // Mark as read after 1s
    if (notification.id && typeof userData !== 'undefined' && userData && userData.id) {
        setTimeout(() => {
            apiFetch('/api/user/notifications/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userData.id, notificationId: notification.id })
            }).catch(() => { });
        }, 1000);
    }
}

function _closeNotifPopup(popup, overlay) {
    if (!popup || !popup.parentNode) return;
    popup.style.animation = 'slideOutPopup 0.3s ease-in forwards';
    setTimeout(() => {
        if (popup.parentNode) popup.remove();
        if (!document.querySelector('[data-popup="true"]') && overlay) {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
        }
    }, 300);
}

// Keep old name for backward compatibility
function closeNotificationPopup(popup, overlay) { _closeNotifPopup(popup, overlay); }

// Fallback showToast in case it's not defined yet (prevents blank screen errors)
if (typeof window.showToast !== 'function') {
    window.showToast = function (message, duration = 3000) {
        // Create toast element if it doesn't exist
        let toast = document.getElementById('global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.85);
                color: #fff;
                padding: 12px 24px;
                border-radius: 24px;
                font-size: 14px;
                z-index: 9999;
                text-align: center;
                max-width: 80%;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                transition: opacity 0.3s, transform 0.3s;
                opacity: 0;
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
        }, duration);
    };
}

// Wrapper for fetch that blocks invalid userId calls
function apiFetch(url, options = {}) {
    let body = {};
    const isFormData = options.body instanceof FormData;

    try {
        if (options.body && !isFormData) {
            if (typeof options.body === 'string') {
                body = JSON.parse(options.body);
            } else if (typeof options.body === 'object') {
                body = options.body;
                options.body = JSON.stringify(options.body);
            }
        }
    } catch (e) {
        body = {};
    }

    // Ultimate userId discovery
    const userId = body.userId ||
        (isFormData && options.body.get && options.body.get('userId')) ||
        userData.id ||
        (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) ||
        null;

    const isPublicUrl = url.includes('/public/') ||
        url.includes('/check-required-joins') ||
        url.includes('/deposit/config') ||
        url.includes('/features') ||
        url.includes('/bothosting/servers') ||
        url.includes('/config');

    if (!userId && !isPublicUrl) {
        console.warn('[apiFetch] Blocked: No userId discovered for ' + url);
        return Promise.resolve({
            json: () => Promise.resolve({ success: false, message: 'Auth Error: No User ID' }),
            ok: false
        });
    }

    // Auto-inject headers
    options.headers = options.headers || {};
    if (!options.headers['X-User-Id'] && !options.headers['x-user-id']) {
        options.headers['X-User-Id'] = String(userId);
    }

    // Auto-inject Content-Type ONLY for JSON body — NEVER for FormData
    // FormData needs browser to set multipart/boundary automatically
    if (options.body && !isFormData &&
        !options.headers['Content-Type'] && !options.headers['content-type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    return fetch(url, options).catch(err => {
        console.error('Fetch error:', err);
        return {
            json: () => Promise.resolve({ success: false, message: 'Network error. Please check your internet connection.' }),
            ok: false
        };
    });
}
var tg = window.Telegram?.WebApp || {
    initDataUnsafe: { user: null, start_param: '' },
    ready: () => { },
    expand: () => { },
    HapticFeedback: {
        impactOccurred: (s) => { },
        notificationOccurred: (s) => { }
    },
    showAlert: (params, cb) => {
        if (typeof params === 'string') {
            window.showToast(params);
            if (cb) cb(true);
        } else if (params && params.title) {
            const r = true;
            if (cb && r) cb(params.buttons && params.buttons[0] ? params.buttons[0].id : true);
        }
    },
    showConfirm: (msg, cb) => cb((function () { return true; })(msg)),
    BackButton: { show: () => { }, hide: () => { }, onClick: () => { } },
    close: () => { }
};
tg.ready();
tg.expand();

// REAL-TIME UPDATES - Poll for admin-pushed version changes (every 30s)
let currentSystemVersion = 0;
setInterval(async () => {
    try {
        const r = await apiFetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (d.version) {
            if (currentSystemVersion && d.version > currentSystemVersion) {
                console.log('[VERSION] New server version detected, reloading...');
                window.location.reload();
            }
            currentSystemVersion = d.version;
        }
    } catch (e) { }
}, 30000);


if (tg.BackButton && tg.BackButton.onClick) {
    tg.BackButton.onClick(goBack);
}

// ── OFFLINE / NETWORK DETECTION ─────────────────────────────────
function _showOfflineBanner(show) {
    if (typeof document === 'undefined' || !document.body) return;
    var banner = document.getElementById('_offlineBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = '_offlineBanner';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:50%', 'transform:translateX(-50%)',
            'max-width:480px', 'width:100%', 'background:#ef4444',
            'color:#fff', 'text-align:center', 'padding:10px 16px',
            'font-size:13px', 'font-weight:700', 'z-index:9999999',
            'display:none', 'align-items:center', 'justify-content:center',
            'gap:8px', 'box-shadow:0 4px 12px rgba(0,0,0,0.3)'
        ].join(';');
        banner.innerHTML = '<span style="font-size:16px;">📶</span> No internet connection. Please connect and try again.';
        document.body.appendChild(banner);
    }
    banner.style.display = show ? 'flex' : 'none';
}

window.addEventListener('offline', function () { _showOfflineBanner(true); });
window.addEventListener('online', function () {
    _showOfflineBanner(false);
    if (typeof window.showToast === 'function') window.showToast('✅ Back online!');
});

// Global fetch override to handle network errors gracefully
const originalFetch = window.fetch;
window.fetch = function (url, options) {
    // IMPORTANT: Never modify FormData options — browser must set Content-Type+boundary
    if (options && options.body instanceof FormData) {
        return originalFetch.call(this, url, options).catch(err => {
            console.error('Global Fetch error (FormData):', err);
            if (!navigator.onLine || err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
                _showOfflineBanner(true);
            }
            // Determine context-specific message from URL
            const urlStr = typeof url === 'string' ? url : '';
            let msg = 'Upload failed. Please check your connection and try again.';
            if (urlStr.includes('bothosting')) msg = '❌ Bot file upload failed. Check your connection.';
            else if (urlStr.includes('screenshot')) msg = '❌ Image upload failed. Check your connection.';
            return new Response(JSON.stringify({ success: false, error: 'Network error', message: msg }),
                { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/json' } }
            );
        });
    }
    return originalFetch.apply(this, arguments).catch(err => {
        console.error('Global Fetch error:', err);
        if (!navigator.onLine || err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
            _showOfflineBanner(true);
        }
        return new Response(JSON.stringify({
            success: false,
            error: 'Network error',
            message: 'Network error. Please check your internet connection.'
        }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
        });
    });
};

// Extract Telegram user from WebApp
const _rawTgUser = tg.initDataUnsafe?.user || {};
const _tgUser = _rawTgUser.id ? _rawTgUser : { id: '123', first_name: 'Test', username: 'TestUser' };
const _startParam = tg.initDataUnsafe?.start_param || '';

// APP CONFIG
var appConfig = {
    dailyReward: 10,
    dailyGems: 0,
    inviteBonus: 50,
    welcomeBonus: 100
};

// EMAIL SERVICE CONFIG
var emailServiceConfig = {
    emailServiceEnabled: true,
    tempMailEnabled: true
};

const DEMO_MODE = false;
const DEMO_BALANCE = 0;

var currentPage = 'home';
var historyStack = ['home'];
var pageScrollPositions = {};
var userStatus = 'active';

// PAGE PARENT MAP — defines which parent page to return to when using back
// Pages NOT in this map will use historyStack (dynamic tracking)
const PAGE_PARENT_MAP = {
    // ── Home grid → back to Home ──────────────────────────────
    'daily': 'home',
    'earnMenu': 'home',
    'aiPhotoGenerator': 'home',
    'aiVideoGenerator': 'home',
    'liveSmsBot': 'home',
    'videoDownload': 'home',
    'smmInstagram': 'home',
    'websiteTraffic': 'home',
    'scratch': 'home',
    'quiz': 'home',
    // Verify chain: home → verify → sub-page
    'verify': 'home',
    'geminiVerification': 'verify',
    // Live services: verify → live page (also accessible from home grid)
    'live2fa': 'verify',
    'liveInstagram': 'verify',
    'liveFacebook': 'verify',
    'liveTiktok': 'verify',
    'liveTwitter': 'verify',
    'liveThreads': 'verify',
    // Services chain: home → services → sub-page
    'services': 'home',
    'vccCards': 'services',
    'vpnServices': 'services',
    'botHosting': 'home',
    'cardDetail': 'vccCards',
    // Mail: home → mail page
    'mailService': 'home',
    'premiumMail': 'home',
    // ── Profile menu → back to Profile ───────────────────────
    'profile': 'home',   // profile back → home
    'transfer': 'profile',
    'support': 'profile',
    'apiKey': 'profile',
    'language': 'profile',
    'notifications': 'profile',
    // ── Tasks/Invite tabs ─────────────────────────────────────
    'earnedLeaderboard': 'tasks',
    'referralLeaderboard': 'invite',
    // ── Dynamic pages (home OR profile) — set at nav() time ──
    // 'verify', 'redeem', 'history',
    // 'mailService', 'accountsStore' are set dynamically below
};

// GLOBAL USER STATE - populated from Telegram + Server
const isDemoMode = false;

var userData = {
    id: _tgUser.id,
    username: _tgUser.username || _tgUser.first_name || 'User',
    firstName: _tgUser.first_name || 'User',
    lastName: _tgUser.last_name || '',
    photo_url: _tgUser.photo_url || '',
    tokens: 0,
    Gems: 0,
    usd: 0.00,
    verified: false,
    banned: false, // Track banned status
    dailyStreak: 0,
    lastDailyClaim: 0,
    completedTasks: [],
    history: []
};

// FEATURE FLAGS (Button Management)
var featureFlags = null;
function applyFeatureFlagsToHome() {
    if (!featureFlags) return;
    const mappings = [
        { keys: ['dailyCheckin', 'home_dailyCheckin'], selector: '[onclick="nav(\'daily\')"]' },
        { keys: ['home_verify'], selector: '[onclick="nav(\'verify\')"]' },
        { keys: ['home_service', 'home_accountsShop'], selector: '[onclick="nav(\'services\')"]' },
        { keys: ['home_deposit', 'depositBinance'], selector: '[onclick="nav(\'deposit\')"]' },
        { keys: ['home_mail', 'tempMail'], selector: '[onclick="nav(\'emailMenu\')"]' },
        { keys: ['home_earn', 'exchange'], selector: '[onclick="nav(\'earnMenuPage\')"]' },
        { keys: ['home_videoDownload', 'videoDownloader'], selector: '[onclick="nav(\'videoDownload\')"]' },
        { keys: ['home_smmInstagram', 'smmInstagram', 'home_aiPhoto'], selector: '[onclick="nav(\'smmInstagram\')"]' },
        { keys: ['home_websiteTraffic', 'websiteTraffic', 'home_aiVideo'], selector: '[onclick="nav(\'websiteTraffic\')"]' },
        { keys: ['home_liveSmsBot', 'liveSmsBot'], selector: '[onclick="nav(\'liveSmsBot\')"]' },
        { keys: ['home_botHosting', 'botHosting'], selector: '[onclick="nav(\'botHosting\')"]' },
        { keys: ['emailVerification'], selector: '#emailVerificationCard' }
    ];
    mappings.forEach(item => {
        const els = document.querySelectorAll(item.selector);
        // Hidden if ANY associated flag key is explicitly false
        const isHidden = item.keys.some(k => featureFlags[k] === false);
        els.forEach(el => {
            el.style.display = isHidden ? 'none' : '';
        });
    });
}

function loadFeatureFlags() {
    return apiFetch('/api/features')
        .then(r => r.json())
        .then(data => {
            if (data && data.success && data.features) {
                featureFlags = data.features;
                applyFeatureFlagsToHome();
            }
            return featureFlags;
        })
        .catch(() => featureFlags);
}

function ensureFeatureFlagsLoaded() {
    if (featureFlags && (Date.now() - (window._lastFeatureFlagsLoad || 0) < 60000)) return Promise.resolve(featureFlags);
    return loadFeatureFlags();
}

// ==========================================
// END OF LOAD FEATURE FLAGS
// ==========================================

// ==========================================
// EMAIL VERIFICATION & OTP RETRIEVER (MOVED HIGHER)
// ==========================================
function openEmailVerification() {
    if (!checkFeatureOrComingSoon('emailVerification', 'Email Verification & OTP Retriever')) return;
    nav('emailVerification');
}

function toggleEvHideEmail(isHidden) {
    const input = document.getElementById('evPersonalEmail');
    if (!input) return;
    if (isHidden) {
        input.type = 'password';
        showToast('🔒 Personal email hidden / masked for security');
    } else {
        input.type = 'email';
        showToast('👁️ Personal email visible');
    }
}

let _evPollInterval = null;

function runEmailVerificationCheck() {
    const personalEmailInput = document.getElementById('evPersonalEmail');
    const appPasswordInput = document.getElementById('evAppPassword');
    const targetEmailInput = document.getElementById('evTargetEmail');
    
    const personalEmail = personalEmailInput ? personalEmailInput.value.trim() : '';
    const appPassword = appPasswordInput ? appPasswordInput.value.trim() : '';
    const targetEmail = targetEmailInput ? targetEmailInput.value.trim() : '';
    
    const statusEl = document.getElementById('evStatusMsg');
    const codeEl = document.getElementById('evCodeDisplay');
    const btnEl = document.getElementById('evGetOtpBtn');
    const senderEl = document.getElementById('evDetailSender');
    const subjectEl = document.getElementById('evDetailSubject');
    const timeEl = document.getElementById('evDetailTime');

    if (!personalEmail || !appPassword) {
        showToast('⚠️ Please enter your personal email and app password');
        return;
    }
    if (!targetEmail) {
        showToast('⚠️ Please enter target sender email (company)');
        return;
    }

    if (btnEl) {
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking Inbox (1 Min)...';
        btnEl.disabled = true;
    }
    if (statusEl) {
        statusEl.innerHTML = 'Status: Connected to IMAP/Inbox. Listening for verification codes from <strong>' + targetEmail + '</strong>... (Auto-stops in 1 min)';
    }

    let pollCount = 0;
    const maxPolls = 24; // 24 * 2.5s = 60 seconds (1 minute)

    if (_evPollInterval) clearInterval(_evPollInterval);

    _evPollInterval = setInterval(async () => {
        pollCount++;
        try {
            const res = await apiFetch('/api/email-verification/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: window.userData?.id || 'guest',
                    personalEmail,
                    appPassword,
                    targetEmail
                })
            });
            const data = await res.json();
            if (data.success && data.otp) {
                if (codeEl) codeEl.textContent = data.otp;
                if (senderEl) senderEl.textContent = data.sender || targetEmail;
                if (subjectEl) subjectEl.textContent = data.subject || 'Confirmation Code';
                if (timeEl) timeEl.textContent = data.time || new Date().toLocaleTimeString();
                if (statusEl) statusEl.innerHTML = '<span style="color:#10b981; font-weight:700;">✅ Verification code successfully captured!</span>';
                showToast('🎉 OTP Code captured: ' + data.otp);
                
                clearInterval(_evPollInterval);
                _evPollInterval = null;
                if (btnEl) {
                    btnEl.innerHTML = '<i class="fas fa-bolt"></i> GET OTP CODE (AUTO 1-MIN)';
                    btnEl.disabled = false;
                }
                return;
            }
        } catch (e) {
            console.error('EV poll error:', e);
        }

        if (pollCount >= maxPolls) {
            clearInterval(_evPollInterval);
            _evPollInterval = null;
            if (btnEl) {
                btnEl.innerHTML = '<i class="fas fa-bolt"></i> GET OTP CODE (AUTO 1-MIN)';
                btnEl.disabled = false;
            }
            if (statusEl) {
                statusEl.innerHTML = '⏱️ Auto-detection finished (1 min). Click GET OTP anytime to check again.';
            }
            showToast('⏱️ Auto-detection finished (1 min).');
        }
    }, 2500);
}

function copyEvCode() {
    const displayEl = document.getElementById('evCodeDisplay');
    const code = displayEl ? displayEl.textContent.trim() : '';
    if (!code || code === '------') {
        showToast('❌ No OTP code to copy yet');
        return;
    }
    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Copied OTP code: ' + code);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 Copied OTP code: ' + code);
    });
}

window.openEmailVerification = openEmailVerification;
window.toggleEvHideEmail = toggleEvHideEmail;
window.runEmailVerificationCheck = runEmailVerificationCheck;
window.copyEvCode = copyEvCode;

function checkFeatureOrComingSoon(flagKey, title) {
    // Default enabled when flags not loaded
    const enabled = !featureFlags || featureFlags[flagKey] !== false;
    if (enabled) return true;
    // Use showAlert instead of showPopup for v6.0 compatibility
    if (tg && typeof window.showToast === 'function') {
        window.showToast('⏳ Coming soon: ' + (title || 'This feature') + ' is currently disabled by admin.');
    }
    return false;
}

// Show profile photo immediately from Telegram data
function applyProfilePhoto(photoUrl) {
    const isMale = Math.random() > 0.5;
    const boyUrl = 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=200&auto=format&fit=crop';
    const girlUrl = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop';

    // Default high-quality avatars if no photo provided
    const fallback = isMale ? boyUrl : girlUrl;
    const src = (photoUrl && photoUrl.trim()) ? photoUrl : fallback;

    const selectors = ['#home-avatar', '#profile-avatar-img', '.wc-avatar', '.prof-avatar', '.pui-avatar'];
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = src;
                el.onerror = function () { this.src = fallback; };
            } else if (el.style !== undefined) {
                el.style.backgroundImage = `url('${src}')`;
            }
        });
    });
}

// Utility: Upload Deposit Screenshot
async function uploadDepositScreenshot(input, targetId) {
    const file = input.files[0];
    if (!file) return;

    const targetInput = document.getElementById(targetId);
    if (!targetInput) return;
    const originalPlaceholder = targetInput.placeholder;
    targetInput.value = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await apiFetch('/api/upload/screenshot', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            targetInput.value = data.url;
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            if (typeof window.showToast === 'function') window.showToast('Upload failed: ' + data.message);
            targetInput.value = '';
        }
    } catch (e) {
        if (typeof window.showToast === 'function') window.showToast('Upload failed: Network error');
        targetInput.value = '';
    } finally {
        input.value = '';
    }
}

function copyText(text, btnElement) {
    if (!text) return;

    // Copy with fallback
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopyTextToClipboard(text));
    } else {
        fallbackCopyTextToClipboard(text);
    }

    function fallbackCopyTextToClipboard(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "absolute";
        ta.style.left = "-999999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); } catch (err) { }
        document.body.removeChild(ta);
    }

    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }

    if (btnElement) {
        const icon = btnElement.querySelector('i');
        if (icon) {
            const originalClass = icon.className;
            const originalStyle = icon.style.color;
            icon.className = 'fas fa-check';
            icon.style.color = '#22c55e';
            setTimeout(() => {
                icon.className = originalClass;
                icon.style.color = originalStyle;
            }, 2000);
        }
    }
}



// THEME MANAGEMENT
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    updateThemeIcon(newTheme);

    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.sh-btn i.fa-sun, .sh-btn i.fa-moon');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// HEADER INTERACTION
let adminClickCount = 0;
let adminClickTimer;

function handleHeaderClick() {
    // Admin Access Simulation (Tap 5 times on Header)
    adminClickCount++;
    clearTimeout(adminClickTimer);

    if (adminClickCount >= 5) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        window.showToast('Entering Admin Panel...');
        // Directly show admin page
        showPage('admin');
        adminClickCount = 0;
        return;
    }

    adminClickTimer = setTimeout(() => {
        adminClickCount = 0;
    }, 1000);

    // Normal Navigation — use currentPage for reliable home detection
    if (currentPage === 'home') {
        nav('profile');
    } else {
        goBack();
    }
}

// NAVIGATION
function nav(p) {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    // --- START PROGRESS BAR ---
    startLoading();

    // Feature gating (pre-check)
    if (p === 'mailService' && !checkFeatureOrComingSoon('tempMail', 'Temp Mail')) return;
    if (p === 'premiumMail' && !checkFeatureOrComingSoon('premiumMail', 'Premium Mail')) return;
    if (p === 'vccCards' && !checkFeatureOrComingSoon('cardsVcc', 'Cards / VCC')) return;

    // Save current scroll position before navigating away
    try {
        const mainScroll = document.getElementById('mainScroll');
        if (mainScroll && currentPage) {
            pageScrollPositions[currentPage] = mainScroll.scrollTop;
        }
    } catch (e) { }

    // BAN CHECK - Show ban modal if user is banned
    if (checkBanStatus()) {
        return;
    }

    // For pages that can come from multiple places (home or profile),
    // dynamically set parent based on where the user currently is
    const dynamicParentPages = ['mailService', 'premiumMail', 'redeem', 'history', 'accountsStore',
        'live2fa', 'liveInstagram', 'liveFacebook', 'liveTiktok', 'liveTwitter', 'liveThreads'];
    if (dynamicParentPages.includes(p)) {
        const mainTabs = ['home', 'tasks', 'shop', 'invite', 'profile'];
        // If coming from home or a main tab, update parent
        if (mainTabs.includes(currentPage)) {
            PAGE_PARENT_MAP[p] = currentPage;
        } else if (currentPage === 'verify' && ['live2fa', 'liveInstagram', 'liveFacebook', 'liveTiktok', 'liveTwitter', 'liveThreads'].includes(p)) {
            PAGE_PARENT_MAP[p] = 'verify';
        }
    }

    // Push to history stack only if it's different from current
    if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== p) {
        historyStack.push(p);
    }

    // All navigation now goes through showPage
    showPage(p);
}

const PAGE_TITLES = {
    'cardDetail': 'CARD DETAILS',
    'chatgpt': 'CHATGPT DETAILS',
    'home': 'AUTOVERIFY',
    'tasks': 'TASKS',
    'earn': 'EARN REWARDS',
    'earnMenu': 'EARN REWARDS',
    'invite': 'INVITE',
    'profile': 'PROFILE',
    'shop': 'SHOP',
    'services': 'SERVICES',
    'mailService': 'TEMP EMAIL',
    'premiumMail': 'PREMIUM EMAIL',
    'emailMenu': 'EMAIL',
    'emailMessage': 'MESSAGE',
    'emailService': 'EMAIL SERVICE',
    'vccCards': 'VCC CARDS',
    'vpnServices': 'VPN SERVICES',
    'botHosting': 'BOT HOSTING',
    'admin': 'ADMIN PANEL',
    'history': 'HISTORY',
    'notifications': 'NOTIFICATIONS',
    'leaderboard': 'LEADERBOARD',
    'earnedLeaderboard': 'LEADERBOARD',
    'referralLeaderboard': 'LEADERBOARD',
    'daily': 'DAILY BONUS',
    'verify': 'VERIFICATION',
    'geminiVerification': 'GEMINI VERIFY',
    'deposit': 'DEPOSIT',
    'exchange': 'EXCHANGE',
    'binancePay': 'BINANCE PAY',
    'faucetPay': 'FAUCETPAY',
    'serviceGenerate': 'SERVICE',
    'geminiProduct': 'GEMINI',
    'chatgptProduct': 'CHATGPT',
    'redeem': 'REDEEM CODE',
    'transfer': 'TRANSFER',
    'accountsStore': 'PREMIUM ACCOUNTS',
    'accountDetail': 'ACCOUNT DETAILS',
    'support': 'SUPPORT',
    'messages': 'MESSAGES',
    'cryptoMethods': 'CRYPTO DEPOSIT',
    'cryptoPayment': 'PAYMENT DETAILS',
    'smmInstagram': 'SMM INSTAGRAM',
    'websiteTraffic': 'WEBSITE TRAFFIC',
    'itemSell': 'SELL ITEMS',
    'quiz': 'DAILY QUIZ',
    'quizLeaderboard': 'QUIZ KINGS',
    'scratch': 'LUCKY SCRATCH',
    'liveSmsBot': 'LIVE SMS BOT',
    'videoDownload': 'VIDEO DOWNLOADER',
    'aiPhotoGenerator': 'AI PHOTO GENERATOR',
    'aiVideoGenerator': 'AI VIDEO GENERATOR',
    'live2fa': 'LIVE 2FA',
    'liveInstagram': 'LIVE CHECKER',
    'liveFacebook': 'LIVE CHECKER',
    'liveTiktok': 'LIVE CHECKER',
    'liveTwitter': 'LIVE CHECKER',
    'liveThreads': 'LIVE CHECKER',
    'apiKey': 'API MANAGEMENT',
    'apiKeyPage': 'API MANAGEMENT',
    'pyrogram': 'PYROGRAM TOKEN'
};

function showPage(targetId) {
    console.log('[DEBUG] showPage called with:', targetId);
    if (!targetId) return;

    // Trigger non-blocking user data sync from server on page change to guarantee balance accuracy
    if (typeof registerAndFetchUser === 'function') {
        registerAndFetchUser().catch(() => {});
    }

    // --- TELEGRAM REQUIREMENT CHECK ---
    const isNonTgVisitor = !_tgUser?.id && !window.Telegram?.WebApp?.initDataUnsafe?.user?.id && (!userData.id || userData.id === 0 || String(userData.id).length < 5);
    if (featureFlags?.requireTelegram === true && isNonTgVisitor) {
        showRequireTelegramModal();
        return;
    }

    // Ensure flags are loaded once (non-blocking)
    ensureFeatureFlagsLoaded().then(() => {
        // If user is already on a disabled page, bounce them to home
        if (currentPage === 'mailService' && featureFlags && featureFlags.tempMail === false) nav('home');
    });

    // Normalize calls that pass DOM page ids (e.g. 'mailServicePage') into logical ids
    if (typeof targetId === 'string' && targetId.endsWith('Page')) {
        targetId = targetId.slice(0, -4);
    }
    if (targetId === 'earn') targetId = 'earnMenu';

    const mainTabs = [
        'home', 'tasks', 'shop', 'invite', 'profile',
        // Feature pages that should always show navbar
        'notifications', 'services', 'smmInstagram', 'videoDownload',
        'websiteTraffic', 'verify', 'history', 'redeem', 'transfer',
        'live2fa', 'liveInstagram', 'liveFacebook', 'liveTiktok', 'liveTwitter', 'liveThreads',
        'mailService', 'premiumMail', 'vccCards', 'vpnServices',
        'support', 'earnMenu', 'daily'
    ];
    // Handle back button visibility & Bottom Navigation bar
    if (targetId === 'home') {
        if (tg.BackButton && tg.BackButton.hide) tg.BackButton.hide();
    } else {
        if (tg.BackButton && tg.BackButton.show) tg.BackButton.show();
    }

    const bottomNav = document.querySelector('.bottom-nav') || document.getElementById('bottomNavBar');
    const mainScroll = document.getElementById('mainScroll');
    if (bottomNav) {
        // Show bottom navigation on all pages except admin panel
        if (targetId !== 'admin') {
            bottomNav.style.display = 'flex';
        } else {
            bottomNav.style.display = 'none';
        }
    }

    // Hide ALL pages including home
    document.querySelectorAll('.page').forEach(e => {
        e.classList.remove('active');
        e.style.display = 'none';
    });

    // Explicitly hide home page when not on home
    const homePage = document.getElementById('homePage');
    if (homePage && targetId !== 'home') {
        homePage.style.display = 'none';
        homePage.classList.remove('active');
    }

    // Explicitly hide mail pages when not on mail pages
    if (targetId !== 'mailService' && targetId !== 'premiumMail') {
        const mailPages = ['mailServicePage', 'premiumMailPage'];
        mailPages.forEach(id => {
            const page = document.getElementById(id);
            if (page) page.style.display = 'none';
        });
    }

    // Email Service availability check - after hide all pages
    if (targetId === 'emailService') {
        targetId = 'mailService'; // Use same page for now with different provider
    }

    // Enforce gating (authoritative)
    if (targetId === 'mailService' && !checkFeatureOrComingSoon('tempMail', 'Temp Mail')) {
        targetId = 'home';
    }
    if (targetId === 'premiumMail' && !checkFeatureOrComingSoon('premiumMail', 'Premium Mail')) {
        targetId = 'home';
    }
    // if (targetId === 'accountsStore' && !checkFeatureOrComingSoon('accountsShop', 'Accounts Shop')) {
    //     targetId = 'home';
    // }
    if (targetId === 'vccCards' && !checkFeatureOrComingSoon('cardsVcc', 'Cards / VCC')) {
        targetId = 'home';
    }

    // Show target page
    const targetPage = document.getElementById(targetId + 'Page') || document.getElementById(targetId) || document.getElementById('page-' + targetId);
    if (targetPage) {
        // Check if page has flex-direction in inline style - use display:flex for those pages
        const inlineStyle = targetPage.getAttribute('style') || '';
        if (inlineStyle.includes('flex-direction')) {
            targetPage.style.display = 'flex';
        } else {
            targetPage.style.display = 'block';
        }
        targetPage.classList.add('active');

        // Restore scroll position (so Back keeps you at the same place)
        const mainScroll = document.getElementById('mainScroll');
        const savedTop = (targetId === 'home') ? 0 : (pageScrollPositions[targetId] ?? 0);
        if (mainScroll) {
            setTimeout(() => {
                mainScroll.scrollTop = savedTop;
            }, 0);
        }
    } else {
        console.error('Page not found:', targetId);
        // Fallback to home if page not found
        if (targetId !== 'home') {
            nav('home');
            return;
        }
    }

    // Initialize specific page content
    if (targetId === 'quiz') loadQuiz();
    if (targetId === 'referralLeaderboard') renderReferralLeaderboard();
    if (targetId === 'quizLeaderboard') renderReferralLeaderboard();
    if (targetId === 'smmInstagram') { if (typeof loadSmmPage === 'function') loadSmmPage(); }
    if (targetId === 'websiteTraffic') {
        if (typeof loadWebsiteTrafficPage === 'function') loadWebsiteTrafficPage();
    }
    if (targetId === 'apiKey') loadApiKey();
    if (targetId === 'notifications') loadNotifications();

    // ✅ NEW: Initialize deposit page
    if (targetId === 'deposit') {
        loadBdtRate();
        loadRecentDeposits();
    }
    if (targetId === 'localPayment') {
        loadBdtRate();
    }

    // Reset card pages to initial state when shown
    if (targetId === 'chatgpt') {
        const chatgptSecuredArea = document.getElementById('chatgptSecuredArea');
        if (chatgptSecuredArea) chatgptSecuredArea.style.display = 'none';
        const chatgptGenBtn = document.getElementById('chatgptGeneratorBtn');
        if (chatgptGenBtn) {
            chatgptGenBtn.innerHTML = 'GENERATE NOW <i class="fas fa-bolt"></i>';
            chatgptGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        }
    }
    if (targetId === 'gemini') {
        const geminiSecuredArea = document.getElementById('geminiSecuredArea');
        if (geminiSecuredArea) geminiSecuredArea.style.display = 'none';
        const geminiGenBtn = document.getElementById('geminiGeneratorBtn');
        if (geminiGenBtn) {
            geminiGenBtn.innerHTML = 'GENERATE NOW <i class="fas fa-bolt"></i>';
            geminiGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        }
    }
    if (targetId === 'cardDetail') {
        const securedArea = document.getElementById('securedArea');
        if (securedArea) securedArea.style.display = 'none';
        const genBtn = document.getElementById('generatorBtn');
        if (genBtn) {
            genBtn.innerHTML = 'GENERATE NOW <i class="fas fa-bolt"></i>';
            genBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        }
    }

    if (targetId === 'profile') {
        const apiKeyItem = document.getElementById('profileApiKeyItem');
        if (apiKeyItem) {
            apiKeyItem.style.display = (userData.apiStatus === 'disallow') ? 'none' : 'flex';
        }
    }

    // Force refresh service data on navigation for better user experience
    if (targetId === 'vpnServices') {
        apiFetch('/api/admin/vpn').then(r => r.json()).then(data => {
            if (data.success) {
                localStorage.setItem('adminVPNs', JSON.stringify(data.vpns));
                renderVPN();
            }
        });
    }
    if (targetId === 'vccCards') {
        apiFetch('/api/admin/cards').then(r => r.json()).then(data => {
            if (data.success) {
                localStorage.setItem('adminCards', JSON.stringify(data.cards));
                renderCards();
            }
        });
    }

    if (targetId === 'botHosting') {
        bhLoadMyBots();
    }
    if (targetId === 'liveSmsBot') {
        lsbLoadMyBots();
    }
    if (targetId === 'pyrogram') {
        loadPyrogramSessions();
    }

    // Update service cost badges dynamically
    if (['videoDownload', 'liveSmsBot'].includes(targetId)) {
        apiFetch('/api/public/costs').then(r => r.json()).then(costData => {
            if (!costData || !costData.costs) return;
            const c = costData.costs;
            const vBadge = document.getElementById('videoDownloadCostBadge');
            const lsbBadge = document.getElementById('lsbTokenCost');
            if (vBadge) vBadge.textContent = (c.videoDownloadCost || 10);
            if (lsbBadge) lsbBadge.textContent = (c.liveSmsBotCost || 10) + ' TC';
            
            // Update cost description with dynamic gems/hour
            const lsbDesc = document.getElementById('lsbCostDescription');
            if (lsbDesc) {
                const gph = c.liveSmsBotGemsPerHour !== undefined ? c.liveSmsBotGemsPerHour : 1;
                lsbDesc.textContent = `Deploy your Live SMS Forwarder Bot — ${gph} 💎/hr`;
            }
            
            // Also update balance info
            const balSpan = document.getElementById('videoTokenBalance');
            if (balSpan && userData) balSpan.textContent = userData.balance_tokens || userData.tokens || 0;
            const lsbBalSpan = document.getElementById('lsbUserBalance');
            if (lsbBalSpan && userData) lsbBalSpan.textContent = (userData.balance_tokens || userData.tokens || 0) + ' TC';
            const lsbGemBalSpan = document.getElementById('lsbGemBalance');
            if (lsbGemBalSpan && userData) lsbGemBalSpan.textContent = (userData.Gems || userData.balance_Gems || 0) + ' 💎';
        }).catch(() => { });
    }

    // Service button states initialization
    if (['videoDownload', 'aiPhoto', 'aiVideo'].includes(targetId)) {
        validateServiceInput(targetId);
    }
    // Initialize live checker pages — update count badge and stop any running check
    const livePlatforms = ['instagram', 'facebook', 'tiktok', 'twitter', 'threads'];
    const livePlatformPageMap = {
        'liveInstagram': 'instagram', 'liveFacebook': 'facebook',
        'liveTiktok': 'tiktok', 'liveTwitter': 'twitter', 'liveThreads': 'threads'
    };
    if (livePlatformPageMap[targetId]) {
        const plt = livePlatformPageMap[targetId];
        updateLiveCount(plt);
        // Reset button if a previous check was stopped mid-way
        const cfg = LIVE_PLATFORM_CONFIG && LIVE_PLATFORM_CONFIG[plt];
        if (cfg && _liveCheckRunning && _liveCheckRunning[plt]) {
            _liveCheckRunning[plt] = false;
            const btn = document.getElementById('live' + plt.charAt(0).toUpperCase() + plt.slice(1) + 'Btn');
            if (btn) { btn.innerHTML = '<i class="fas fa-play-circle"></i> START LIVE CHECK'; btn.style.background = cfg.gradient; }
        }
    }

    if (targetId === 'scratch') {
        // Cleanup any previous scratch handlers before reinitializing
        if (window._scratchCleanup) window._scratchCleanup();
        // Setup scroll blocker (only for scratch page)
        if (!window._scratchScrollBlocker) {
            window._scratchScrollBlocker = function (e) {
                try {
                    if (currentPage === 'scratch') {
                        if (e && typeof e.preventDefault === 'function') e.preventDefault();
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        return false;
                    }
                } catch (_) { }
            };
        }

        const canvas = document.getElementById('scratchCanvas');
        if (canvas) canvas.style.display = 'block';
        if (canvas) canvas.style.opacity = '1';
        initScratchCard();
        // Disable scrolling on scratch page to prevent accidental scroll/pull-to-refresh
        const mainScroll = document.getElementById('mainScroll');
        if (mainScroll) {
            mainScroll.style.overflow = 'hidden';
            mainScroll.style.touchAction = 'none';
            // Force scroll position to top on scratch page
            mainScroll.scrollTop = 0;
        }
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';

        // Block wheel/touchmove scrolling (some devices still scroll even with overflow hidden)
        try {
            document.addEventListener('wheel', window._scratchScrollBlocker, { passive: false });
            document.addEventListener('touchmove', window._scratchScrollBlocker, { passive: false });
        } catch (e) {
            // Fallback for older browsers
            document.addEventListener('wheel', window._scratchScrollBlocker);
            document.addEventListener('touchmove', window._scratchScrollBlocker);
        }
    } else {
        // Re-enable scrolling when leaving scratch page
        const mainScroll = document.getElementById('mainScroll');
        if (mainScroll) {
            mainScroll.style.overflow = '';
            mainScroll.style.touchAction = '';
        }
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        // Cleanup scratch handlers when leaving scratch page
        if (window._scratchCleanup) window._scratchCleanup();
        // Remove scroll blockers when leaving scratch page
        if (window._scratchScrollBlocker) {
            try {
                document.removeEventListener('wheel', window._scratchScrollBlocker, { passive: false });
                document.removeEventListener('touchmove', window._scratchScrollBlocker, { passive: false });
            } catch (e) {
                document.removeEventListener('wheel', window._scratchScrollBlocker);
                document.removeEventListener('touchmove', window._scratchScrollBlocker);
            }
        }
    }

    // Update current page tracker
    currentPage = targetId;

    // --- END PROGRESS BAR ---
    endLoading();

    // Trigger sync on navigation to ensure fresh data
    smartSync();

    if (targetId === 'home') loadRecentActivity();

    // Auto-update mail balances and start/stop polling
    stopInboxPolling();
    if (targetId === 'mailService') {
        window._currentMailType = 'temp';
        updateMailBalance('temp');
        startInboxPolling('temp');
    } else if (targetId === 'premiumMail') {
        window._currentMailType = 'premium';
        updateMailBalance('premium');
        startInboxPolling('premium');
    } else {
        const title = PAGE_TITLES[targetId] || 'AUTOVERIFY';
        const ht = document.getElementById('headerTitle');
        if (ht) ht.textContent = title;
    }

    // Refresh Daily Rewards UI when entering daily page
    if (targetId === 'daily') {
        renderDailyGrid();
        startDailyCountdown();
    }
    // Load accounts when entering accounts store page
    if (targetId === 'accountsStore') {
        renderAccounts();
    }
    // Load messages when entering messages page
    if (targetId === 'messages' || targetId === 'support') {
        loadUserMessages();
    }
    // Update balances when entering service pages with balance displays
    if (targetId === 'mailService' || targetId === 'premiumMail' || targetId === 'accountsStore' ||
        targetId === 'vpnServices' || targetId === 'vccCards') {
        renderBalances();
    }

    // Refresh API Key UI when entering API key page
    if (targetId === 'apiKeyPage') {
        const pageNoKey = document.getElementById('apiKeyNoKey');
        const pageActive = document.getElementById('apiKeyActive');
        const pageDisplay = document.getElementById('userApiKeyDisplay');

        if (userData && userData.apiKey) {
            if (pageActive) pageActive.style.display = 'block';
            if (pageNoKey) pageNoKey.style.display = 'none';
            if (pageDisplay) pageDisplay.value = userData.apiKey;
        }
        loadApiKey();
    }

    if (targetId === 'home') {
        try {
            pageScrollPositions.home = 0;
        } catch (e) { }
    }

    // Immediate render from cache for VCC and VPN
    if (targetId === 'vccCards') renderCards();
    if (targetId === 'vpnServices') renderVPN();
    if (targetId === 'shop') {
        renderShopItems(); // Render from cache immediately
    }

    // Background sync administrative data for future visits
    if (['vccCards', 'vpnServices', 'shop', 'services'].includes(targetId)) {
        // Sync and re-render after fresh data arrives
        apiFetch('/api/shop')
            .then(r => r.json())
            .then(data => {
                if (data.success && data.shopItems) {
                    localStorage.setItem('adminShopItems', JSON.stringify(data.shopItems));
                    if (targetId === 'shop') renderShopItems();
                }
            })
            .catch(() => { });
        syncAdminData();
    }
    // Refresh History when entering history page
    if (targetId === 'history') {
        smartSync(true);          // Force fresh balance from server
        loadRecentActivity(true); // Fresh history from server (force)
        loadMyPurchases();        // Load purchased items
        switchHistTab('transactions'); // Default to transactions tab
        renderFullHistory();      // Render full history immediately if cached
    }
    // Refresh Notifications when entering notifications page
    if (targetId === 'notifications') {
        loadNotifications();
    }
    // Refresh Item Sales when entering item sell page
    if (targetId === 'itemSell') {
        loadMySales();
        resetSellCategory();
        setSellItemType('subscription'); // Ensure cards are shown
    }
    // Refresh Exchange UI when entering exchange page
    if (targetId === 'exchange') {
        initExchangeUI();
    }
    // Load Deposit Config when entering deposit pages
    if (targetId === 'deposit' || targetId === 'cryptoMethods') {
        fetchCryptoConfig();
    }
    // Update Header Style based on page type
    const headerContainer = document.querySelector('.sticky-header-container');
    const mainHeader = document.getElementById('mainHeader');
    const avatar = document.getElementById('headerAvatar');
    const headerBack = document.getElementById('headerBack');
    const headerTitle = document.getElementById('headerTitle');
    const headerLeft = document.getElementById('headerLeft');
    const headerStatus = document.getElementById('headerStatus');

    // Define service pages that need simple header
    const servicePages = ['profile', 'notifications', 'services', 'mailService', 'premiumMail', 'emailMenu',
        'emailService', 'vccCards', 'vpnServices', 'accountsStore', 'serviceGenerate',
        'geminiProduct', 'chatgptProduct', 'checkout', 'deposit', 'shop', 'itemSell',
        'exchange', 'binancePay', 'faucetPay', 'history', 'redeem',
        'invite', 'tasks', 'earn', 'earnMenu', 'daily', 'verify', 'admin',
        'geminiVerification', 'leaderboard', 'support', 'emailMessage',
        'cryptoMethods', 'cryptoPayment', 'apiKeyPage', 'apiKey',
        'smmInstagram', 'websiteTraffic', 'liveSmsBot', 'videoDownload',
        'aiPhotoGenerator', 'aiVideoGenerator', 'quiz', 'scratch',
        'referralLeaderboard', 'quizLeaderboard',
        'live2fa', 'liveInstagram', 'liveFacebook', 'liveTiktok', 'liveTwitter', 'liveThreads',
        'accountDetail', 'transfer', 'localPayment', 'messages'];

    if (targetId === 'home') {
        // Home style: Avatar + Auto Verify + bolt + settings
        if (avatar) avatar.style.display = 'flex';
        if (headerBack) headerBack.style.display = 'none';
        if (headerTitle) {
            headerTitle.innerHTML = '<span class="cb-text">' + globalBotName + '</span>';
            headerTitle.style.fontSize = '';
            headerTitle.style.fontWeight = '';
            headerTitle.style.letterSpacing = '';
            headerTitle.style.color = '';
        }
        if (headerLeft) headerLeft.onclick = handleHeaderClick;
        if (headerStatus) headerStatus.style.display = 'flex';

        if (headerContainer) {
            headerContainer.style.background = '';
            headerContainer.style.borderRadius = '';
            headerContainer.style.margin = '';
            headerContainer.style.position = '';
            headerContainer.style.display = 'block';
        }
    } else if (targetId === 'mailService' || targetId === 'premiumMail' || targetId === 'emailMenu' || targetId.includes('emailMessage')) {
        if (headerContainer) headerContainer.style.display = 'block';
        if (avatar) avatar.style.display = 'none';
        if (headerBack) {
            headerBack.style.display = 'flex';
            headerBack.innerHTML = '<i class="fas fa-arrow-left" style="color:#fff; font-size:16px;"></i>';
        }
        if (headerTitle) {
            const normalizedId = targetId.includes('emailMessage') ? 'emailMessage' : targetId;
            headerTitle.textContent = PAGE_TITLES[normalizedId] || targetId.toUpperCase();
            headerTitle.style.fontSize = '14px';
            headerTitle.style.fontWeight = '700';
            headerTitle.style.letterSpacing = '1px';
            headerTitle.style.color = '';
        }
        if (headerLeft) headerLeft.onclick = goBack;
        if (headerStatus) headerStatus.style.display = 'none';

        if (targetId === 'emailMenu') {
            handleEmailMenuNavigation();
        }
    } else if (servicePages.includes(targetId)) {
        // Service style: Back button + Title
        const pageTitle = PAGE_TITLES[targetId] || targetId.toUpperCase();
        if (headerContainer) headerContainer.style.display = 'block';
        if (avatar) avatar.style.display = 'none';
        if (headerBack) {
            headerBack.style.display = 'flex';
            headerBack.innerHTML = '<i class="fas fa-arrow-left" style="color:#fff; font-size:16px;"></i>';
        }
        if (headerTitle) {
            headerTitle.textContent = pageTitle;
            headerTitle.style.fontSize = '14px';
            headerTitle.style.fontWeight = '700';
            headerTitle.style.letterSpacing = '1px';
            headerTitle.style.color = '';
        }
        if (headerLeft) headerLeft.onclick = goBack;
        if (headerStatus) headerStatus.style.display = 'none';
    } else {
        // Default style
        if (avatar) avatar.style.display = 'none';
        if (headerBack) headerBack.style.display = 'flex';
        if (headerTitle) {
            headerTitle.textContent = PAGE_TITLES[targetId] || targetId.toUpperCase();
            headerTitle.style.color = '';
        }
        if (headerLeft) headerLeft.onclick = goBack;
        if (headerStatus) headerStatus.style.display = 'flex';
    }

    // Bottom Nav Active State Logic using data-page for reliability
    let activeNavGroup = 'home';
    if (['home'].includes(targetId)) activeNavGroup = 'home';
    else if (['tasks', 'earn', 'earnMenu', 'daily', 'quiz', 'scratch'].includes(targetId)) activeNavGroup = 'tasks';
    else if (['shop', 'exchange', 'deposit', 'binancePay', 'faucetPay', 'geminiProduct', 'chatgptProduct',
        'services', 'mailService', 'emailMenu', 'emailService', 'vccCards', 'vpnServices',
        'accountsStore', 'accountDetail', 'serviceGenerate', 'checkout', 'premiumMail',
        'smmInstagram', 'websiteTraffic', 'liveSmsBot', 'videoDownload',
        'aiPhotoGenerator', 'aiVideoGenerator'].includes(targetId)) activeNavGroup = 'shop';
    else if (['invite', 'leaderboard', 'referralLeaderboard'].includes(targetId)) activeNavGroup = 'invite';
    else if (['profile', 'history', 'notifications', 'redeem', 'transfer', 'support',
        'verify', 'geminiVerification', 'admin', 'quizLeaderboard', 'apiKey', 'apiKeyPage',
        'live2fa', 'liveInstagram', 'liveFacebook', 'liveTiktok', 'liveTwitter', 'liveThreads'].includes(targetId)) activeNavGroup = 'profile';

    const bottomNavEl = document.querySelector('.bottom-nav') || document.getElementById('bottomNavBar');
    if (bottomNavEl) {
        bottomNavEl.querySelectorAll('.nav-item, .nav-center').forEach(n => n.classList.remove('active'));
        const activeItem = bottomNavEl.querySelector(`[data-page="${activeNavGroup}"]`);
        if (activeItem) activeItem.classList.add('active');
    }

    // --- SIDE EFFECTS MERGED FROM WRAPPER ---
    if (targetId === 'invite') {
        // Only load if userId is valid
        if (!isValidUserId(userData.id)) {
            console.log('[INVITE] Waiting for valid userId...');
            // Try again after a short delay
            setTimeout(() => {
                if (isValidUserId(userData.id)) {
                    renderReferralHistory();
                    loadInviteStats();
                }
            }, 1000);
        } else {
            renderReferralHistory();
            loadInviteStats();
        }
    }
    if (targetId === 'tasks') {
        // Load tasks dynamically from API
        loadUserTasks();
    }
    if (targetId === 'admin') {
        loadAdminConfig();
        loadAdminMessages();
    }
    // Fix card overflow on specific pages
    if (['redeem', 'transfer', 'itemSell', 'accountsStore'].includes(targetId)) {
        setTimeout(() => {
            const page = document.getElementById(targetId + 'Page');
            if (page) {
                page.style.padding = '8px';
                const cards = page.querySelectorAll('.gv-card, .content-body');
                cards.forEach(card => {
                    card.style.width = 'calc(100% - 16px)';
                    card.style.maxWidth = 'calc(100% - 16px)';
                    card.style.margin = '0 auto';
                    card.style.boxSizing = 'border-box';
                });
            }
        }, 50);
    }
}

function startLoading() {
    const bar = document.getElementById('nav-loading-bar');
    if (bar) {
        bar.style.width = '30%';
        bar.style.opacity = '1';
    }
}

function endLoading() {
    const bar = document.getElementById('nav-loading-bar');
    if (bar) {
        bar.style.width = '100%';
        setTimeout(() => {
            bar.style.opacity = '0';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }, 300);
    }
}

let lastBackTime = 0;
function goBack() {
    const now = Date.now();
    if (now - lastBackTime < 300) {
        console.warn('[NAVIGATION] Ignored rapid goBack call');
        return;
    }
    lastBackTime = now;

    // First check: does current page have a defined parent?
    const definedParent = PAGE_PARENT_MAP[currentPage];
    if (definedParent) {
        // Remove current from stack
        if (historyStack.length > 1) historyStack.pop();
        showPage(definedParent);
        return;
    }
    // Otherwise use stack-based navigation
    if (historyStack.length > 1) {
        historyStack.pop(); // Remove current page from stack
        const prev = historyStack[historyStack.length - 1]; // Peek previous
        showPage(prev); // Navigate directly without re-pushing to stack
    } else {
        showPage('home');
    }
}
// EXCHANGE SYSTEM
function exchangeTokens() {
    const fromSel = document.getElementById('exFromCurrency');
    const toSel = document.getElementById('exToCurrency');
    const fromAmtEl = document.getElementById('exFromAmount');
    if (!fromSel || !toSel || !fromAmtEl) return;

    const fromCur = fromSel.value;
    const toCur = toSel.value;
    const amt = parseFloat(fromAmtEl.value);

    if (!isFinite(amt) || amt <= 0) {
        window.showToast('Please enter a valid amount.');
        return;
    }

    if (!hasSufficientBalance(fromCur, amt)) {
        window.showToast('Insufficient balance for exchange.');
        return;
    }

    const preview = calculateExchange(fromCur, toCur, amt);
    if (!preview.success) {
        window.showToast(preview.message);
        return;
    }

    const overlay = document.createElement('div');
    overlay.style = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML = `
        <div style="background:#1a100a;border:1px solid rgba(245,158,11,0.3);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center;">
            <div style="color:#ef4444;font-size:36px;margin-bottom:16px;"><i class="fas fa-exclamation-triangle"></i></div>
            <h3 style="color:#fff;margin:0 0 12px 0;font-size:20px;">Confirm Exchange</h3>
            <p style="color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:24px;line-height:1.5;">Exchange of ${formatCurrencyAmount(amt, fromCur)} to ${formatCurrencyAmount(preview.toAmount, toCur)}?</p>
            <div style="display:flex;gap:10px;">
                <button id="cancelExBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:rgba(255,255,255,0.1);color:#fff;font-weight:bold;cursor:pointer;">CANCEL</button>
                <button id="confirmExBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:#22c55e;color:#fff;font-weight:bold;cursor:pointer;">CONFIRM</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('cancelExBtn').onclick = () => overlay.remove();
    document.getElementById('confirmExBtn').onclick = () => {
        overlay.remove();
        apiFetch('/api/exchange/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, from: fromCur, to: toCur, amount: amt })
        })
            .then(r => r.json())
            .then(res => {
                if (!res.success) {
                    window.showToast(res.message || 'Exchange failed.');
                    return;
                }

                // Sync balances from response
                if (typeof res.tokens === 'number') userData.tokens = Math.max(0, res.tokens);
                if (typeof res.Gems === 'number') userData.Gems = Math.max(0, res.Gems);
                userData.usd = (res.usd !== undefined && res.usd !== null) ? res.usd : 0;
                renderBalances();
                loadRecentActivity(); // Refresh history after exchange
                updateExchangeBalances();
                updateExchangePreview();

                // Save to history locally
                saveExchangeHistory(fromCur, toCur, amt, res.toAmount ?? preview.toAmount);

                window.showToast('✅ EXCHANGE SUCCESSFUL\n\n' + formatCurrencyAmount(amt, fromCur) + ' ➔ ' + formatCurrencyAmount(res.toAmount ?? preview.toAmount, toCur));
            })
            .catch(() => {
                window.showToast('Network error. Please try again.');
            });
    };
}

function saveExchangeHistory(from, to, fAmt, tAmt) {
    let history = JSON.parse(localStorage.getItem('exHistory') || '[]');
    history.unshift({
        from, to, fAmt, tAmt, date: new Date().toISOString()
    });
    // Keep last 10
    if (history.length > 10) history = history.slice(0, 10);
    localStorage.setItem('exHistory', JSON.stringify(history));
    renderExchangeHistory();
}

function renderExchangeHistory() {
    const container = document.getElementById('exchangeHistoryList');
    if (!container) return;
    const history = JSON.parse(localStorage.getItem('exHistory') || '[]');
    if (history.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-sub); font-size:12px; padding:20px;">No recent exchanges.</div>';
        return;
    }

    container.innerHTML = history.map(h => {
        const dateStr = new Date(h.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
        return `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:14px; border-radius:16px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:12px; font-weight:900; color:#fff; display:flex; align-items:center; gap:6px;">
                    ${formatCurrencyAmount(h.fAmt, h.from)} 
                    <i class="fas fa-arrow-right" style="font-size:10px; color:#10b981;"></i> 
                    ${formatCurrencyAmount(h.tAmt, h.to)}
                </div>
                <div style="font-size:9px; color:var(--text-sub); margin-top:4px; font-weight:700; text-transform:uppercase;">${dateStr}</div>
            </div>
            <div style="width:32px; height:32px; background:rgba(16,185,129,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center;">
                <i class="fas fa-check" style="color:#10b981; font-size:12px;"></i>
            </div>
        </div>
        `;
    }).join('');
}

// ==========================================
// CENTRAL USD FORMATTER — used everywhere
// $0 → "$0", $1 → "$1", $1.50 → "$1.50", $1.56 → "$1.56"
// No trailing zeros: $1.00 → "$1", $0.50 → "$0.50"
// ==========================================
function formatUsd(amount) {
    const n = parseFloat(amount) || 0;
    if (n === 0) return '$0';
    if (n >= 1000) return '$' + formatCompact(n);
    // Remove trailing zeros after decimal
    // e.g. 1.00 → "1", 1.50 → "1.50", 0.10 → "0.10"
    const str = n.toFixed(2);
    const trimmed = parseFloat(str).toString();
    // Keep at least one decimal if it has cents
    if (trimmed.indexOf('.') === -1) return '$' + trimmed;
    // Ensure at most 2 decimal places
    const parts = trimmed.split('.');
    const cents = parts[1].padEnd(2, '0').slice(0, 2);
    return '$' + parts[0] + '.' + cents;
}

const exchangeRates = {
    usd_to_tokens: 100000,   // 1 USD = 100,000 Tokens
    usd_to_gems: 1000,       // 1 USD = 1000 Gems
    Gems_to_tokens: 100      // 1 Gem = 100 Tokens
};

function tokensToUsd(tokens) {
    return tokens / exchangeRates.usd_to_tokens;
}

function usdToTokens(usd) {
    return usd * exchangeRates.usd_to_tokens;
}

function tokensToGems(tokens) {
    return tokens / exchangeRates.Gems_to_tokens;
}

function GemsToTokens(Gems) {
    return Gems * exchangeRates.Gems_to_tokens;
}

function usdToGems(usd) {
    return usd * exchangeRates.usd_to_gems;
}

function gemsToUsd(gems) {
    return gems / exchangeRates.usd_to_gems;
}

function calculateExchange(from, to, amount) {
    let toAmount = 0;
    let rateText = '-';

    // Convert from -> tokens base
    let tokensBase = 0;
    if (from === 'tokens') tokensBase = amount;
    else if (from === 'usd') tokensBase = usdToTokens(amount);
    else if (from === 'Gems') tokensBase = GemsToTokens(amount);
    else return { success: false, message: 'Invalid source currency' };

    // Restriction: Removed Cannot convert Tokens/Gems back to USD restriction
    // if (to === 'usd' && from !== 'usd') {
    //    return { success: false, message: 'Convert back to USD is not allowed.' };
    // }

    // Convert tokens base -> to
    if (to === 'tokens') {
        toAmount = tokensBase;
        rateText = '1 Token = 1 Token';
    } else if (to === 'usd') {
        toAmount = tokensToUsd(tokensBase);
        rateText = `1 USD = ${exchangeRates.usd_to_tokens.toLocaleString()} Tokens`;
    } else if (to === 'Gems') {
        toAmount = tokensToGems(tokensBase);
        rateText = `1 Gem = ${exchangeRates.Gems_to_tokens} Tokens`;
    } else {
        return { success: false, message: 'Invalid target currency' };
    }

    // Display rounding rules
    if (to === 'usd') toAmount = Math.round(toAmount * 100) / 100;
    else toAmount = Math.floor(toAmount * 10000) / 10000;

    return { success: true, toAmount, rateText };
}

function formatCurrencyAmount(amount, cur) {
    if (cur === 'usd') {
        const val = Math.round(amount * 100) / 100;
        return val === 0 ? '$0' : `$${val.toFixed(2)}`;
    }
    if (cur === 'tokens') return `${Math.floor(amount)} TOKENS`;
    if (cur === 'Gems') return `${Math.floor(amount * 10000) / 10000} Gems`;
    return `${amount}`;
}

function hasSufficientBalance(cur, amount) {
    if (cur === 'tokens' || cur === 'TC') return (userData.tokens || 0) >= amount;
    if (cur === 'Gems' || cur === 'gems') return (userData.Gems || 0) >= amount;
    if (cur === 'usd' || cur === 'USD') return (userData.usd || 0) >= amount;
    return false;
}

function updateExchangeBalances() {
    const t = document.getElementById('exBalTokens');
    const j = document.getElementById('exBalGems');
    const u = document.getElementById('exBalUsd');
    if (t) t.textContent = formatCompact(userData.tokens || 0);
    if (j) j.textContent = formatCompact(userData.Gems || 0);
    if (u) u.textContent = formatUsd(userData.usd || 0);
}

function updateExchangePreview() {
    const fromCur = document.getElementById('exFromCurrency')?.value;
    let toCur = document.getElementById('exToCurrency')?.value;
    const amt = parseFloat(document.getElementById('exFromAmount')?.value || '0');

    const toEl = document.getElementById('exToAmount');
    const rateEl = document.getElementById('exRateHint');
    const fromHint = document.getElementById('exFromHint');
    const feeEl = document.getElementById('exFeeHint');

    if (!fromCur || !toCur || !toEl || !rateEl) return;

    if (fromCur === toCur) {
        // Since To only has Tokens and Gems now, if From is one of them, switch To to the other.
        if (fromCur === 'tokens') document.getElementById('exToCurrency').value = 'Gems';
        else if (fromCur === 'Gems') document.getElementById('exToCurrency').value = 'tokens';

        // Refresh toCur after potential change
        toCur = document.getElementById('exToCurrency').value;
    }

    // Disable the same currency in To dropdown
    const toOptions = document.getElementById('exToCurrency').querySelectorAll('option');
    toOptions.forEach(opt => {
        opt.disabled = (opt.value === fromCur);
    });

    const maxVal = fromCur === 'tokens' ? (userData.tokens || 0) : fromCur === 'Gems' ? (userData.Gems || 0) : (userData.usd || 0);
    if (fromHint) fromHint.textContent = `MAX: ${fromCur === 'usd' ? formatUsd(maxVal) : formatCompact(maxVal)}`;

    const preview = calculateExchange(fromCur, toCur, isFinite(amt) ? amt : 0);
    if (!preview.success) {
        toEl.value = '0';
        rateEl.textContent = 'RATE: -';
        if (feeEl) {
            feeEl.textContent = preview.message || '';
            feeEl.style.color = '#ef4444';
        }
        return;
    }

    toEl.value = preview.toAmount;
    rateEl.textContent = `RATE: ${preview.rateText}`;
    if (feeEl) feeEl.textContent = '';
}

function initExchangeUI() {
    const fromSel = document.getElementById('exFromCurrency');
    const toSel = document.getElementById('exToCurrency');
    const fromAmt = document.getElementById('exFromAmount');
    if (!fromSel || !toSel || !fromAmt) return;

    updateExchangeBalances();
    updateExchangePreview();

    fromSel.addEventListener('change', () => updateExchangePreview());
    toSel.addEventListener('change', () => updateExchangePreview());
    fromAmt.addEventListener('input', () => updateExchangePreview());

    renderExchangeHistory();
}

// Swap FROM and TO currencies
function swapExchangeCurrencies() {
    const fromSel = document.getElementById('exFromCurrency');
    const toSel = document.getElementById('exToCurrency');
    const fromAmt = document.getElementById('exFromAmount');

    if (!fromSel || !toSel) return;

    // Special logic for USD as requested: 
    // USD always stays at top. If USD is selected, clicking swap toggles the target.
    if (fromSel.value === 'usd') {
        toSel.value = (toSel.value === 'Gems') ? 'tokens' : 'Gems';
    } else {
        // Normal swap for Tokens/Gems
        const temp = fromSel.value;
        const currentTo = toSel.value;

        fromSel.value = currentTo;
        toSel.value = temp;
    }

    // Clear amount
    if (fromAmt) fromAmt.value = '';

    // Update preview
    updateExchangePreview();

    // Haptic feedback
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}
window.swapExchangeCurrencies = swapExchangeCurrencies;

// Set max amount (all tokens)
function setMaxExchangeAmount() {
    const fromSel = document.getElementById('exFromCurrency');
    const fromAmt = document.getElementById('exFromAmount');

    if (!fromSel || !fromAmt) return;

    const fromCur = fromSel.value;
    let maxVal = 0;

    if (fromCur === 'tokens') maxVal = userData.tokens || 0;
    else if (fromCur === 'Gems') maxVal = userData.Gems || 0;
    else if (fromCur === 'usd') maxVal = userData.usd || 0;

    fromAmt.value = maxVal;
    updateExchangePreview();

    // Haptic feedback
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}
window.setMaxExchangeAmount = setMaxExchangeAmount;

// CHECKOUT LOGIC
let checkoutQty = 1;
const checkoutUnitPrice = 3.00;

function changeQty(delta) {
    checkoutQty = Math.max(1, checkoutQty + delta);
    const qtyEl = document.getElementById('checkoutQty');
    const totalEl = document.getElementById('checkoutTotal');
    if (qtyEl) qtyEl.textContent = checkoutQty;
    if (totalEl) totalEl.textContent = formatUsd(checkoutQty * checkoutUnitPrice);
}

function selectPayMethod(method) {
    if (method === 'faucet') {
        nav('localPayment');
    }
}

let cryptoConfig = null;
let currentCryptoMethod = null;

async function fetchCryptoConfig() {
    const cryptoContainer = document.getElementById('cryptoMethodsList');
    // Show loading state immediately
    if (cryptoContainer) {
        cryptoContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:12px;display:block;"></i><div style="font-size:13px;">Loading payment methods...</div></div>';
    }
    try {
        const res = await apiFetch('/api/deposit/config');
        const data = await res.json();
        if (data.success) {
            cryptoConfig = data.cryptoMethods;
            renderCryptoMethods();
        } else {
            if (cryptoContainer) cryptoContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;font-size:13px;">⚠️ Failed to load payment methods. Please try again.</div>';
        }
    } catch (e) {
        console.error('Error fetching crypto config:', e);
        if (cryptoContainer) cryptoContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;font-size:13px;">⚠️ Network error. Please check connection.</div>';
    }
}

function renderCryptoMethods() {
    window.cryptoConfig = cryptoConfig; // Export to window for inline scripts to use

    const cryptoContainer = document.getElementById('cryptoMethodsList');
    const localContainer = document.getElementById('localPaymentMethodsGrid');

    if (cryptoContainer) cryptoContainer.innerHTML = '';
    if (localContainer) localContainer.innerHTML = '';

    if (!cryptoConfig) {
        if (cryptoContainer) cryptoContainer.innerHTML = '<div style="text-align:center;padding:40px 20px;"><div style="font-size:40px;margin-bottom:12px;">💳</div><div style="color:#6b7280;font-size:13px;font-weight:600;">No payment methods configured yet.<br>Please contact admin.</div></div>';
        return;
    }

    const icons = {
        binance: { bg: '#FCD535', icon: '<span style="font-size:20px; font-weight:900; color:#000;">B</span>' },
        bitget: { bg: '#00f0ff', icon: '<i class="fas fa-bolt" style="color:#000;"></i>' },
        gateio: { bg: '#f23e5c', icon: '<i class="fas fa-g" style="color:#fff; font-weight:900;"></i>' },
        usdt: { bg: '#26A17B', icon: '<i class="fas fa-t" style="color:#fff; font-weight:900;"></i>' },
        bitcoin: { bg: '#f7931a', icon: '<i class="fab fa-bitcoin" style="color:#fff;"></i>' },
        web3: { bg: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)', icon: '<i class="fas fa-link" style="color:#fff;"></i>' }
    };

    let hasCryptoMethods = false;

    Object.entries(cryptoConfig).forEach(([id, meta]) => {
        if (meta.status !== 'active') return;

        const isLocal = meta.type === 'local';

        if (isLocal && localContainer) {
            let color = '#22c55e';
            let shortName = meta.name.substring(0, 1).toUpperCase();
            const lcName = meta.name.toLowerCase();
            if (lcName.includes('bkash')) { color = '#dc2626'; shortName = 'bKash'; }
            if (lcName.includes('nagad')) { color = '#eab308'; shortName = 'Nagad'; }
            if (lcName.includes('rocket')) { color = '#3b82f6'; shortName = 'Rocket'; }
            if (lcName.includes('upay')) { color = '#a855f7'; shortName = 'Upay'; }

            const card = document.createElement('button');
            card.onclick = () => window.showPaymentDetails(id);
            card.style.cssText = `
                display:flex; flex-direction:column; align-items:center; gap:8px;
                padding:20px 12px;
                border-radius:16px;
                border:1.5px solid ${color}4d;
                cursor:pointer;
                transition:all 0.22s ease;
                background:${color}14;
                text-align:center;
                width:100%;
            `;
            card.innerHTML = `
                <div style="width:56px; height:56px; border-radius:16px; background:${color}33; display:flex; align-items:center; justify-content:center;">
                    <span style="color:${color}; font-size:14px; font-weight:800;">${shortName}</span>
                </div>
                <div style="font-size:13px; font-weight:700; color:var(--text-main,#fff);">${meta.name}</div>
                <div style="font-size:10px; color:var(--text-sub,#888);">Send Money</div>
            `;
            localContainer.appendChild(card);

        } else if (!isLocal && cryptoContainer) {
            const style = icons[id] || { bg: '#444', icon: '<i class="fas fa-wallet"></i>' };

            const card = document.createElement('div');
            card.className = 'pm-card';
            card.onclick = () => openCryptoPayment(id);
            card.innerHTML = `
                <div class="pm-icon" style="background:${style.bg};">${style.icon}</div>
                <div class="pm-info">
                    <div class="pm-title">${meta.name}</div>
                    <div class="pm-desc">${id === 'web3' ? 'USDT TRC20/ERC20' : 'Exchange Deposit'}</div>
                </div>
                <div class="pm-arrow"><i class="fas fa-chevron-right"></i></div>
            `;
            cryptoContainer.appendChild(card);
            hasCryptoMethods = true;
        }
    });

    // Show empty state if no crypto methods configured
    if (!hasCryptoMethods && cryptoContainer && cryptoContainer.children.length === 0) {
        cryptoContainer.innerHTML = '<div style="text-align:center;padding:40px 20px;"><div style="font-size:40px;margin-bottom:12px;">💳</div><div style="color:#6b7280;font-size:13px;font-weight:600;">No crypto payment methods are active yet.<br>Please contact admin to enable them.</div></div>';
    }
}

function openCryptoPayment(methodId) {
    currentCryptoMethod = methodId;
    const meta = cryptoConfig[methodId];
    if (!meta) return;

    document.getElementById('cpMethodName').textContent = meta.name;

    // QR
    const qrBox = document.getElementById('cpQrBox');
    const qrImg = document.getElementById('cpQrImg');
    if (meta.qr) {
        qrImg.src = meta.qr;
        qrBox.style.display = 'block';
    } else {
        qrBox.style.display = 'none';
    }

    // Reset screenshot
    document.getElementById('cpScreenshotUrl').value = '';

    // ID
    const idBox = document.getElementById('cpIdBox');
    const idVal = document.getElementById('cpIdVal');
    const idLabel = document.getElementById('cpIdLabel');
    if (meta.details) {
        idVal.textContent = meta.details;
        const lowerName = meta.name.toLowerCase();
        let label = 'UID / ID';
        if (lowerName.includes('binance')) label = 'BINANCE PAY ID';
        else if (lowerName.includes('bitget')) label = 'BITGET UID';
        else if (lowerName.includes('gate')) label = 'GATE.IO UID';
        else if (lowerName.includes('web3') || lowerName.includes('usdt') || lowerName.includes('address') || lowerName.includes('wallet')) label = 'WALLET ADDRESS';

        idLabel.textContent = label;
        idBox.style.display = 'flex';
        document.getElementById('cpIdCopy').onclick = (e) => {
            copyText(meta.details, e.currentTarget);
        };
    } else {
        idBox.style.display = 'none';
    }

    // Email
    const emailBox = document.getElementById('cpEmailBox');
    const emailVal = document.getElementById('cpEmailVal');
    if (meta.email) {
        emailVal.textContent = meta.email;
        emailBox.style.display = 'flex';
        document.getElementById('cpEmailCopy').onclick = (e) => {
            copyText(meta.email, e.currentTarget);
        };
    } else {
        emailBox.style.display = 'none';
    }

    nav('cryptoPayment');
}

async function submitCryptoDeposit() {
    const amount = document.getElementById('cpAmountInput').value;
    const txnId = document.getElementById('cpTxnIdInput').value;

    if (!amount || amount <= 0) return window.showToast('Please enter a valid amount.');
    if (!txnId || txnId.length < 5) return window.showToast('Please enter a valid Transaction ID / Hash.');

    try {
        const res = await apiFetch('/api/deposit/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                method: currentCryptoMethod,
                amount: amount,
                txnId: txnId,
                screenshot: document.getElementById('cpScreenshotUrl').value
            })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast(data.message);
            nav('deposit');
            // Clear inputs
            document.getElementById('cpAmountInput').value = '';
            document.getElementById('cpTxnIdInput').value = '';
            document.getElementById('cpScreenshotUrl').value = '';
        } else {
            window.showToast(data.message || 'Error submitting deposit.');
        }
    } catch (e) {
        window.showToast('Network error. Please try again.');
    }
}

let activeLocalPayMethod = 'bkash';

function selectLocalMethod(method) {
    activeLocalPayMethod = method;
    const btnBkash = document.getElementById('btnBkash');
    const btnNagad = document.getElementById('btnNagad');
    const nameLabel = document.getElementById('localPaymentMethodName');
    const numberLabel = document.getElementById('localPaymentNumber');
    const submitBtn = document.getElementById('btnLocalSubmit');

    // Find the number from cache
    let foundNumber = 'Not Configured';
    for (const key in depositMethodsCache) {
        const p = depositMethodsCache[key];
        if (p.type === 'local' && p.name.toLowerCase().includes(method.toLowerCase()) && p.status === 'active') {
            foundNumber = p.details || 'No number provided';
            break;
        }
    }

    if (method === 'bkash') {
        btnBkash.style.background = '#e1147e';
        btnBkash.style.opacity = '1';
        btnBkash.style.border = 'none';

        btnNagad.style.background = 'rgba(255,255,255,0.05)';
        btnNagad.style.opacity = '0.6';
        btnNagad.style.border = '1px solid rgba(255,255,255,0.1)';

        nameLabel.innerText = 'BKASH NUMBER (PERSONAL)';
        numberLabel.innerText = foundNumber;
        if (submitBtn) submitBtn.style.background = 'linear-gradient(135deg,#e1147e,#f7931e)';
    } else {
        btnNagad.style.background = '#f7931e';
        btnNagad.style.opacity = '1';
        btnNagad.style.border = 'none';

        btnBkash.style.background = 'rgba(255,255,255,0.05)';
        btnBkash.style.opacity = '0.6';
        btnBkash.style.border = '1px solid rgba(255,255,255,0.1)';

        nameLabel.innerText = 'NAGAD NUMBER (PERSONAL)';
        numberLabel.innerText = foundNumber;
        if (submitBtn) submitBtn.style.background = 'linear-gradient(135deg,#f7931e,#e1147e)';
    }
}

async function submitFaucetDeposit() {
    const amountBDT = document.getElementById('fpAmountInputBDT').value;
    const txnId = document.getElementById('fpTxnIdInput').value;

    if (!amountBDT || amountBDT <= 0) return window.showToast('Please enter a valid BDT amount.');
    if (!txnId) return window.showToast(`Please enter your ${activeLocalPayMethod.toUpperCase()} Transaction ID.`);

    // Get USD amount from conversion display
    const usdAmount = document.getElementById('usdConversionDisplay').textContent.replace('$', '').replace(' USD', '').trim();

    try {
        const res = await apiFetch('/api/deposit/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                method: activeLocalPayMethod,
                amount: parseFloat(usdAmount), // Send USD amount
                amountBDT: parseFloat(amountBDT), // Also send BDT for reference
                txnId: txnId,
                screenshot: document.getElementById('fpScreenshotUrl').value
            })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast(data.message || '✅ Deposit submitted! Pending admin approval.');
            nav('deposit');
            document.getElementById('fpAmountInputBDT').value = '';
            document.getElementById('fpTxnIdInput').value = '';
            document.getElementById('fpScreenshotUrl').value = '';
            document.getElementById('usdConversionDisplay').textContent = '$0 USD';

            // Reload deposit history
            loadRecentDeposits();
            // Auto refresh every 30 seconds while on this page
            if (window._depositRefreshInterval) clearInterval(window._depositRefreshInterval);
            window._depositRefreshInterval = setInterval(() => {
                if (activePage === 'deposit') loadRecentDeposits();
                else clearInterval(window._depositRefreshInterval);
            }, 30000);

            nav('deposit');
        } else {
            window.showToast(data.message || 'Error submitting deposit.');
        }
    } catch (e) {
        window.showToast('Network error.');
    }
}

// ✅ NEW: Convert BDT to USD
let bdtToUsdRate = 120; // Default rate, will be loaded from server

async function convertBdtToUsd() {
    const bdtInput = document.getElementById('fpAmountInputBDT');
    const usdDisplay = document.getElementById('usdConversionDisplay');

    if (!bdtInput || !usdDisplay) return;

    const bdtAmount = parseFloat(bdtInput.value) || 0;
    const usdVal = bdtAmount / bdtToUsdRate;
    usdDisplay.textContent = formatUsd(usdVal) + ' USD';
}

// ✅ Load BDT rate and Local Payment Config from server
let depositMethodsCache = {};
async function loadBdtRate() {
    try {
        const res = await apiFetch('/api/deposit/config');
        const data = await res.json();
        if (data.success) {
            bdtToUsdRate = data.usdToBdt || 120;
            depositMethodsCache = data.cryptoMethods || {};

            const rateDisplay = document.getElementById('bdtRateDisplay');
            if (rateDisplay) {
                rateDisplay.textContent = bdtToUsdRate;
            }

            // Auto-update the active method's number
            selectLocalMethod(activeLocalPayMethod);

            // Trigger conversion update if input has value
            convertBdtToUsd();
        }
    } catch (e) {
        console.error('Failed to load BDT rate:', e);
    }
}
window.loadBdtRate = loadBdtRate;

// ✅ NEW: Load recent deposits with status
async function loadRecentDeposits() {
    const container = document.getElementById('recentDepositsContainer');
    if (!container || !userData || !userData.id) return;

    try {
        const res = await apiFetch(`/api/deposits/history?userId=${userData.id}`);
        const data = await res.json();

        if (!data.success || !data.deposits || data.deposits.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px; background:rgba(255,255,255,0.03); border-radius:20px; border:1px solid rgba(255,255,255,0.1);">
                    <div style="font-size:40px; color:#666; margin-bottom:12px;">
                        <i class="fas fa-hourglass-half"></i>
                    </div>
                    <div style="font-size:16px; color:#666; font-weight:600;">No deposits yet</div>
                </div>`;
            return;
        }

        // Render deposits
        container.innerHTML = data.deposits.slice(0, 5).map(dep => {
            const statusColor = dep.status === 'approved' ? '#22c55e' : (dep.status === 'rejected' ? '#ef4444' : '#f59e0b');
            const statusIcon = dep.status === 'approved' ? 'fa-check-circle' : (dep.status === 'rejected' ? 'fa-times-circle' : 'fa-clock');
            const statusText = dep.status === 'approved' ? 'Approved' : (dep.status === 'rejected' ? 'Rejected' : 'Pending');

            return `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
                        <div>
                            <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">${formatUsd(parseFloat(dep.amount || 0))}</div>
                            <div style="font-size:11px; color:#888;">${dep.method.toUpperCase()} • ${new Date(dep.timestamp).toLocaleDateString()}</div>
                            ${dep.amountBDT ? `<div style="font-size:10px; color:#666; margin-top:2px;">${dep.amountBDT} BDT</div>` : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(${statusColor === '#22c55e' ? '34,197,94' : (statusColor === '#ef4444' ? '239,68,68' : '245,158,11')},0.1); border:1px solid rgba(${statusColor === '#22c55e' ? '34,197,94' : (statusColor === '#ef4444' ? '239,68,68' : '245,158,11')},0.3); border-radius:8px;">
                            <i class="fas ${statusIcon}" style="color:${statusColor}; font-size:12px;"></i>
                            <span style="font-size:11px; font-weight:700; color:${statusColor};">${statusText}</span>
                        </div>
                    </div>
                    ${dep.txnId ? `<div style="font-size:10px; color:#666;">TXN: ${dep.txnId}</div>` : ''}
                </div>`;
        }).join('');

    } catch (e) {
        console.error('Failed to load deposits:', e);
    }
}
window.loadRecentDeposits = loadRecentDeposits;

function submitPayment() {
    const txnId = document.getElementById('txnIdInput')?.value || document.getElementById('fpTxnIdInput')?.value;
    if (!txnId || txnId.trim() === '') {
        window.showToast('Please enter your Transaction ID to confirm payment.');
        return;
    }
    window.showToast('Payment Submitted!\n\nYour payment has been submitted for review.\n\nTransaction ID: ' + txnId + '\n\nWe will verify and credit your account within 24 hours.');
}

// TASK LOGIC
const IN_PROGRESS_TASKS = {};

// Fetch and render tasks from API
async function loadUserTasks(silent = false) {
    const container = document.getElementById('tasksListContainer');
    if (!container) return;

    // Fast feedback: show skeleton or "Loading..." instantly only if not silent
    if (!silent) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
                <div class="skeleton-task" style="height:80px; background:rgba(255,255,255,0.05); border-radius:15px; animation:pulse 1.5s infinite;"></div>
                <div class="skeleton-task" style="height:80px; background:rgba(255,255,255,0.05); border-radius:15px; animation:pulse 1.5s infinite; animation-delay:0.2s;"></div>
                <div class="skeleton-task" style="height:80px; background:rgba(255,255,255,0.05); border-radius:15px; animation:pulse 1.5s infinite; animation-delay:0.4s;"></div>
            </div>`;
    }

    try {
        const res = await apiFetch('/api/admin/tasks');
        const data = await res.json();

        if (!data.success || !data.tasks || data.tasks.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:#666;">
                    <i class="fas fa-inbox" style="font-size:32px; margin-bottom:10px;"></i>
                    <p>No tasks available</p>
                </div>`;
            return;
        }

        // Render tasks
        const completedSet = new Set(userData.completedTasks || []);

        container.innerHTML = data.tasks.map(task => {
            const isDone = completedSet.has(task.id);
            const inProgress = IN_PROGRESS_TASKS[task.id];
            const icon = getTaskIcon(task.name, task.icon);
            const bg = getTaskBg(task.name);
            const border = getTaskBorder(task.name);
            const rewardVal = task.reward || task.gems || 10;

            return `
            <div class="task-card-new ${isDone ? 'task-done' : ''}" data-task-id="${task.id}" style="${isDone ? 'opacity: 0.6; pointer-events:none;' : ''}">
                <div class="tcn-left">
                    <div class="tcn-icon" style="background:${bg}; border:1px solid ${border}; padding:0; overflow:hidden;">
                        ${isDone ? '<i class="fas fa-check-circle" style="color:#22c55e; font-size:24px;"></i>' : icon}
                    </div>
                    <div class="tcn-info">
                        <h4 style="${isDone ? 'text-decoration: line-through;' : ''}">${task.name}</h4>
                        <div class="tcn-rewards">
                            <div class="tcn-badge" style="color:#a78bfa; display:flex; align-items:center; gap:5px; font-weight:800;">
                                <i class="fas fa-gem" style="color:#a78bfa;"></i> +${rewardVal} Gems
                            </div>
                        </div>
                    </div>
                </div>
                ${isDone ?
                    '<button class="tcn-btn" style="background:#22c55e; color:white;"><i class="fas fa-check"></i></button>' :
                    (inProgress === 'VERIFY' ?
                        `<button class="tcn-btn" style="background:#22c55e; color:white;" onclick="completeTask('${task.id}', ${rewardVal}, this, '${task.url}')">VERIFY</button>` :
                        `<button class="tcn-btn" onclick="startTask(this, '${task.id}', '${task.url}', ${rewardVal})">START</button>`
                    )
                }
            </div>`;
        }).join('');

    } catch (e) {
        console.error('Error loading tasks:', e);
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#666;">
                <i class="fas fa-exclamation-triangle" style="font-size:24px; margin-bottom:10px;"></i>
                <p>Failed to load tasks</p>
            </div>`;
    }
}

// Helper function to get task icon
function getTaskIcon(name, customIcon = null) {
    // If custom icon is provided, use it
    if (customIcon) {
        return `<img src="${customIcon}" alt="icon" style="width:40px; height:40px; object-fit:contain; border-radius:8px;" onerror="this.parentElement.innerHTML='<i class=\'fas fa-tasks\' style=\'color:#f59e0b; font-size:20px;\'></i>'">`;
    }

    const lower = name.toLowerCase();
    if (lower.includes('youtube')) {
        return `<img src="https://img.icons8.com/color/48/youtube-play.png" alt="YT" style="width:28px; height:28px; object-fit:contain;" onerror="this.parentElement.innerHTML='<i class=\'fab fa-youtube\' style=\'color:#ff0000; font-size:22px\'></i>'">`;
    } else if (lower.includes('telegram')) {
        return `<img src="https://img.icons8.com/color/48/telegram-app.png" alt="TG" style="width:28px; height:28px; object-fit:contain;" onerror="this.parentElement.innerHTML='<i class=\'fab fa-telegram\' style=\'color:#229ed9; font-size:22px\'></i>'">`;
    } else {
        return `<i class="fas fa-tasks" style="color:#f59e0b; font-size:20px;"></i>`;
    }
}

// Helper function to get task background color
function getTaskBg(name) {
    const lower = name.toLowerCase();
    if (lower.includes('youtube')) return '#1a0000';
    if (lower.includes('telegram')) return '#003a4a';
    return '#1a1a2e';
}

// Helper function to get task border color
function getTaskBorder(name) {
    const lower = name.toLowerCase();
    if (lower.includes('youtube')) return '#ff0000';
    if (lower.includes('telegram')) return '#229ed9';
    return '#333';
}

let activeTaskButton = null;
let activeTaskData = null;

// Start task - open URL and track
function startTask(button, taskId, url, reward) {
    if (!url) {
        showToast('Task URL not configured');
        return;
    }

    activeTaskButton = button;
    if (button) {
        button.dataset.originalText = button.innerHTML;
    }
    activeTaskData = { taskId, url, reward };

    // Run Ad first as requested by user
    showAdAndEarn('task_verification');
}

// Complete task and claim reward
async function completeTask(taskId, reward, button, url) {
    try {
        if (!button) return;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const res = await apiFetch('/api/complete-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData?.id,
                taskId: taskId,
                reward: reward
            })
        });

        const data = await res.json();

        if (data.success) {
            button.textContent = 'DONE';
            button.style.background = '#666';
            button.disabled = true;

            delete IN_PROGRESS_TASKS[taskId];

            if (data.newBalance !== undefined) {
                userData.tokens = data.newBalance;
            } else {
                userData.tokens += parseInt(reward) || 0;
            }

            showToast(`✅ Task completed! +${reward} tokens`);
            renderBalances();

            if (!userData.completedTasks) userData.completedTasks = [];
            if (!userData.completedTasks.includes(taskId)) {
                userData.completedTasks.push(taskId);
            }
            localStorage.setItem(`userData_${userData.id}`, JSON.stringify(userData));

            if (window.confetti) confetti({ particleCount: 50, spread: 60 });
        } else if (data.message === 'Task already completed') {
            button.textContent = 'DONE';
            button.style.background = '#666';
            button.disabled = true;
            showToast('Task already completed');

            if (!userData.completedTasks) userData.completedTasks = [];
            if (!userData.completedTasks.includes(taskId)) {
                userData.completedTasks.push(taskId);
            }
        } else {
            showToast(data.message || 'Verification failed');
            button.disabled = false;
            button.textContent = 'VERIFY';
            button.style.background = '#22c55e';
        }
    } catch (e) {
        console.error('Error completing task:', e);
        if (button) {
            button.disabled = false;
            button.textContent = 'START';
            button.style.background = ''; // reset to default
            button.onclick = function () {
                startTask(button, taskId, url, reward);
            };
        }
        showToast('Network error verifying task');
    }
}

function earn(buttonElement, type, amount) {
    console.log(`[DEBUG] earn() called - type: ${type}, state: ${IN_PROGRESS_TASKS[type]}, userId: ${userData.id}`);

    if (IN_PROGRESS_TASKS[type] === 'completed') {
        window.showToast('You have already completed this task!');
        return;
    }

    if (IN_PROGRESS_TASKS[type] === 'checking') {
        console.log(`[DEBUG] Already checking ${type}`);
        return;
    }

    // For Telegram tasks (tg and tg_ch), verify membership
    if (type === 'tg' || type === 'tg_ch') {
        const checkUrl = type === 'tg' ? 'https://t.me/AutosVerifych' : 'https://t.me/AutosVerify';

        // Open the link first
        window.open(checkUrl);

        // Show checking state
        IN_PROGRESS_TASKS[type] = 'checking';
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CHECKING...';
        buttonElement.style.pointerEvents = 'none';
        buttonElement.style.background = '#333';

        // Check membership after 15 seconds (give user time to join)
        setTimeout(() => {
            verifyAndComplete(type, buttonElement, amount);
        }, 15000);

        return;
    }

    // YouTube task - countdown then auto-complete (NO CLAIM BUTTON)
    if (type === 'yt') {
        window.open('https://www.youtube.com/@MamunIslamyts', '_blank');

        IN_PROGRESS_TASKS[type] = 'waiting';
        buttonElement.style.pointerEvents = 'none';
        buttonElement.style.background = '#333';
        buttonElement.style.color = '#aaa';

        let timeLeft = 30;
        buttonElement.innerHTML = `${timeLeft}s...`;

        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                // Auto-complete after countdown (NO CLAIM)
                verifyAndComplete(type, buttonElement, amount);
            } else {
                buttonElement.innerHTML = `${timeLeft}s...`;
            }
        }, 1000);
    }
}

// Verify membership and auto-complete task
function verifyAndComplete(type, buttonElement, amount) {
    console.log(`[DEBUG] Verifying and completing ${type}`);

    // Update button to show verifying
    buttonElement.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> VERIFYING...';
    buttonElement.style.pointerEvents = 'none';

    // For Telegram tasks, verify membership first
    if (type === 'tg' || type === 'tg_ch') {
        apiFetch('/api/verify-membership', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                taskType: type
            })
        })
            .then(res => res.json())
            .then(data => {
                console.log(`[DEBUG] Membership check:`, data);

                if (data.success && data.isMember) {
                    // User joined - complete task
                    completeTaskReward(type, buttonElement, amount);
                } else {
                    // Not joined - reset to START
                    IN_PROGRESS_TASKS[type] = null;
                    buttonElement.innerHTML = 'START';
                    buttonElement.style.pointerEvents = 'auto';
                    buttonElement.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';

                    const channel = (type === 'tg' || type === 'group') 
                        ? (window.appCostConfig?.requiredGroup || '@AutosVerifyCh') 
                        : (window.appCostConfig?.requiredChannel || '@AutosVerify');
                    window.showToast(`❌ Verification failed.\nPlease join ${channel} then click START again.`);
                }
            })
            .catch(err => {
                console.error('Verify error:', err);
                IN_PROGRESS_TASKS[type] = null;
                buttonElement.innerHTML = 'START';
                buttonElement.style.pointerEvents = 'auto';
                buttonElement.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                window.showToast('⚠️ Network Error. Please ensure bot connection is active.');
            });
    } else {
        // Other tasks (YouTube, etc) - direct complete
        completeTaskReward(type, buttonElement, amount);
    }
}

// Give reward and mark complete
function completeTaskReward(type, buttonElement, amount) {
    buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CLAIMING...';

    apiFetch('/api/earn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userData.id,
            type: type,
            amount: amount
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Success
                buttonElement.innerHTML = '<i class="fas fa-check"></i>';
                buttonElement.style.background = '#22c55e';
                buttonElement.style.color = 'white';
                buttonElement.style.pointerEvents = 'none';

                // Add to completed set
                if (!userData.completedTasks) userData.completedTasks = [];
                if (!userData.completedTasks.includes(type)) {
                    userData.completedTasks.push(type);
                }

                userData.tokens = data.newBalance;
                renderBalances();

                // Update local in-progress state for checkAllTasksCompleted
                IN_PROGRESS_TASKS[type] = 'completed';

                window.showToast(`🎉 Task Completed! +${amount} Tokens`);

                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                checkAllTasksCompleted();

                // Refresh task list after a delay
                setTimeout(loadUserTasks, 1500);
            } else {
                window.showToast(data.message || 'Error claiming reward');
                IN_PROGRESS_TASKS[type] = null;
                buttonElement.innerHTML = 'START';
                buttonElement.style.pointerEvents = 'auto';
            }
        })
        .catch(err => {
            console.error('Earn error:', err);
            window.showToast('Network error claiming reward');
            IN_PROGRESS_TASKS[type] = null;
            buttonElement.innerHTML = 'START';
            buttonElement.style.pointerEvents = 'auto';
        });
}

// Check if all 3 tasks are completed and show overlay
function checkAllTasksCompleted() {
    const requiredTasks = ['yt', 'tg', 'tg_ch'];
    const allCompleted = requiredTasks.every(task => IN_PROGRESS_TASKS[task] === 'completed');

    if (allCompleted) {
        // Create overlay if it doesn't exist
        let overlay = document.getElementById('allTasksCompletedOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'allTasksCompletedOverlay';
            overlay.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.95); z-index:99999; justify-content:center; align-items:center; flex-direction:column;';
            overlay.innerHTML = `
                <div style="width:100px; height:100px; background:#22c55e; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:20px; animation:scaleIn 0.5s ease;">
                    <i class="fas fa-check" style="font-size:50px; color:#fff;"></i>
                </div>
                <div style="font-size:22px; font-weight:900; color:#fff; margin-bottom:10px;">All Missions Complete!</div>
                <div style="font-size:14px; color:#888; text-align:center; max-width:260px; line-height:1.5;">You have completed all tasks and earned bonus rewards!</div>
                <button onclick="document.getElementById('allTasksCompletedOverlay').style.display='none'" style="margin-top:28px; padding:14px 28px; background:#f59e0b; border:none; border-radius:25px; color:#000; font-weight:800; font-size:15px; cursor:pointer;">Continue</button>
            `;
            document.body.appendChild(overlay);
        }

        // Show overlay
        overlay.style.display = 'flex';

        // Trigger confetti celebration
        if (typeof confetti !== 'undefined') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#22c55e', '#f59e0b', '#3b82f6'] });
        }
    }
}

// ==========================================
// ==========================================
// AD VIEWER (Watch & Earn)
// ==========================================

let adWatchTimer = null;
let adRewardClaimed = false;
let currentAdContext = 'watch_ad';

function showAdAndEarn(context = 'watch_ad') {
    currentAdContext = context;
    adRewardClaimed = false;

    // Show explicit loading state
    if (window.showToast) {
        window.showToast('🚀 Fetching Reward Ad...');
    }

    // Ensure ad overlay is ready and visible immediately
    let overlay = document.getElementById('ad-watching-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ad-watching-overlay';
        document.body.appendChild(overlay);
    }

    // Clear and show overlay
    overlay.style.cssText = 'display:flex; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.97); z-index:9999999; flex-direction:column; align-items:center; justify-content:center; color:white; font-family:sans-serif; text-align:center;';
    overlay.innerHTML = `
        <div id="ad-content-box" style="padding:30px; width:100%; max-width:320px; transition: all 0.3s ease; z-index: 10000000;">
            <div class="loader-spinner" style="width:40px; height:40px; border:3px solid rgba(255,255,255,0.1); border-top-color:#f59e0b; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 20px;"></div>
            <h2 style="font-size:22px; font-weight:800; margin-bottom:12px;">Loading Ad...</h2>
            <p style="color:#888; font-size:14px; line-height:1.5;">We are connecting to the best ad server to unlock your reward.</p>
            <button onclick="closeAdOverlay(); resetAdButtons();" style="margin-top:30px; color:#555; background:none; border:none; font-size:13px; cursor:pointer; text-decoration:underline;">Cancel</button>
        </div>
    `;
    overlay.style.display = 'flex';

    // Safety Timeout: if nothing happens in 20s, fallback or close
    const safetyTimeout = setTimeout(() => {
        if (overlay.style.display !== 'none' && !adRewardClaimed) {
            const content = document.getElementById('ad-content-box');
            if (content && content.innerHTML.includes('Loading Ad...')) {
                window.showToast('⚠️ Taking too long. Switching to reward...');
                // Attempt auto-reward instead of just closing
                overlay.style.display = 'none';
                claimAdReward();
            }
        }
    }, 20000);

    // Step 1: Fetch Ad Config
    apiFetch('/api/ads/config')
        .then(r => r.json())
        .then(data => {
            clearTimeout(safetyTimeout);
            const ads = data.ads || {};

            // Identify enabled networks
            const enabledAds = Object.entries(ads).filter(([k, c]) => c.enabled);

            // 1. Adsgram (Telegram Native)
            const adsgramCfg = ads['adsgram'] && ads['adsgram'].enabled ? ads['adsgram'] : null;
            const adsgramBlockId = adsgramCfg ? (adsgramCfg.publisherId || adsgramCfg.adUnitId || '') : '';

            // 2. Monetag / MoneyTag
            const monetagCfg = (ads['moneytag'] || ads['monetag']) && (ads['moneytag'] || ads['monetag'])?.enabled
                ? (ads['moneytag'] || ads['monetag']) : null;
            const monetagPublisherId = monetagCfg ? (monetagCfg.publisherId || monetagCfg.adUnitId || '') : '';
            const monetagDirectUrl = monetagCfg ? (monetagCfg.directUrl || '') : '';

            // 3. Adsterra
            const adsterraCfg = ads['adsterra'] && ads['adsterra'].enabled ? ads['adsterra'] : null;
            const adsterraDirectUrl = adsterraCfg ? (adsterraCfg.directUrl || '') : '';
            const adsterraZoneId = adsterraCfg ? (adsterraCfg.adUnitId || adsterraCfg.publisherId || '') : '';

            // 4. Google AdSense
            const adsenseCfg = ads['adsense'] && ads['adsense'].enabled ? ads['adsense'] : null;
            const adsenseDirectUrl = adsenseCfg ? (adsenseCfg.directUrl || '') : '';

            // Any direct URL from any enabled network
            let anyDirectUrl = monetagDirectUrl || adsterraDirectUrl || adsenseDirectUrl || '';
            if (!anyDirectUrl) {
                for (const [, cfg] of enabledAds) {
                    if (cfg.directUrl) { anyDirectUrl = cfg.directUrl; break; }
                }
            }

            function openAdDirectLink(url) {
                if (!url) return;
                try {
                    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
                        window.Telegram.WebApp.openLink(url);
                    } else {
                        window.open(url, '_blank');
                    }
                } catch (e) {
                    window.open(url, '_blank');
                }
            }

            const contentBox = document.getElementById('ad-content-box');
            if (contentBox) {
                contentBox.innerHTML =
                    '<div style="width:80px; height:80px; background:linear-gradient(135deg, #f59e0b, #d97706); border-radius:24px; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; box-shadow:0 12px 24px rgba(245,158,11,0.4);">' +
                    '<i class="fas fa-play text-white text-3xl"></i>' +
                    '</div>' +
                    '<div style="font-size:24px; font-weight:900; margin-bottom:12px;">Ad is Ready!</div>' +
                    '<p style="font-size:15px; color:#aaa; margin-bottom:32px; line-height:1.5;">TAP the button below to watch the ad and earn your tokens instantly.</p>' +
                    '<button id="ad-watch-btn" style="width:100%; padding:18px; background:#f59e0b; color:#000; font-weight:900; border-radius:30px; border:none; cursor:pointer; font-size:17px; box-shadow:0 8px 20px rgba(245,158,11,0.3); outline:none;">TAP TO WATCH AD</button>' +
                    '<button onclick="closeAdOverlay(); resetAdButtons();" style="margin-top:24px; color:#666; background:none; border:none; font-size:13px; cursor:pointer;">Not now</button>';

                const watchBtn = document.getElementById('ad-watch-btn');
                if (watchBtn) {
                    watchBtn.onclick = async () => {
                        watchBtn.disabled = true;
                        watchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading Ad...';

                        function showAdPlayingUI() {
                            const AD_DURATION = 5; // 5 seconds timer

                            contentBox.innerHTML =
                                '<div style="width:70px; height:70px; border:4px solid rgba(245,158,11,0.15); border-top-color:#f59e0b; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 24px;"></div>' +
                                '<div style="font-size:20px; font-weight:800; margin-bottom:6px;">Ad is Playing...</div>' +
                                '<p style="font-size:13px; color:#888; margin-bottom:20px; line-height:1.5;">Watch the ad appearing on screen<br>to earn your reward</p>' +
                                '<div style="width:100%; height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; margin-bottom:16px;">' +
                                '<div id="ad-timer-progress" style="height:100%; width:0%; background:linear-gradient(90deg,#f59e0b,#22c55e); border-radius:4px; transition:width 0.25s linear;"></div>' +
                                '</div>' +
                                '<div id="ad-timer-text" style="font-size:50px; font-weight:900; color:#f59e0b; line-height:1;">' + AD_DURATION + '</div>' +
                                '<p style="font-size:11px; color:#444; margin-top:12px;">seconds remaining</p>';

                            const adStartTime = Date.now();
                            const adEndTime = adStartTime + AD_DURATION * 1000;
                            let adDone = false;

                            function tickAd() {
                                if (adDone) return;
                                const now = Date.now();
                                const remaining = Math.max(0, adEndTime - now);
                                const elapsed = now - adStartTime;
                                const secsLeft = Math.ceil(remaining / 1000);
                                const pct = Math.min(100, (elapsed / (AD_DURATION * 1000)) * 100);
                                const progEl = document.getElementById('ad-timer-progress');
                                const txtEl = document.getElementById('ad-timer-text');
                                if (progEl) progEl.style.width = pct + '%';
                                if (txtEl) txtEl.textContent = secsLeft;
                                if (remaining <= 0) {
                                    adDone = true;
                                    showAdCompletionScreen();
                                    return;
                                }
                                setTimeout(tickAd, 250);
                            }
                            tickAd();
                            setTimeout(() => { if (!adDone) { adDone = true; showAdCompletionScreen(); } }, (AD_DURATION + 3) * 1000);
                        }

                        // ============================================
                        // OPTION 1: Adsgram SDK (Telegram Native)
                        // ============================================
                        if (adsgramBlockId && window.Adsgram) {
                            try {
                                const AdController = window.Adsgram.init({ blockId: String(adsgramBlockId) });
                                let handled = false;
                                await AdController.show()
                                    .then(() => {
                                        handled = true;
                                        showAdCompletionScreen();
                                    })
                                    .catch((result) => {
                                        handled = true;
                                        if (result && result.done) {
                                            showAdCompletionScreen();
                                        } else {
                                            // Fallback to direct link if available, otherwise show timer
                                            if (anyDirectUrl) {
                                                openAdDirectLink(anyDirectUrl);
                                                showAdPlayingUI();
                                            } else {
                                                showAdPlayingUI();
                                            }
                                        }
                                    });
                                if (handled) return;
                            } catch (err) {
                                console.warn('[Adsgram] SDK notice:', err.message || err);
                            }
                        }

                        // ============================================
                        // OPTION 2: Monetag / MoneyTag
                        // ============================================
                        if (monetagPublisherId || monetagDirectUrl) {
                            if (monetagPublisherId) {
                                try {
                                    let scriptEl = document.getElementById('monetag-ad-script');
                                    const sdkFuncName = 'show_' + monetagPublisherId;
                                    
                                    if (!scriptEl) {
                                        scriptEl = document.createElement('script');
                                        scriptEl.id = 'monetag-ad-script';
                                        scriptEl.src = '//libtl.com/sdk.js';
                                        scriptEl.setAttribute('data-zone', monetagPublisherId);
                                        scriptEl.setAttribute('data-sdk', sdkFuncName);
                                        scriptEl.onload = () => {
                                            try {
                                                if (window[sdkFuncName] && typeof window[sdkFuncName] === 'function') {
                                                    window[sdkFuncName]();
                                                } else if (window.show && typeof window.show === 'function') {
                                                    window.show();
                                                }
                                            } catch (e) {}
                                        };
                                        document.body.appendChild(scriptEl);
                                    } else {
                                        if (window[sdkFuncName] && typeof window[sdkFuncName] === 'function') {
                                            window[sdkFuncName]();
                                        } else if (window.show && typeof window.show === 'function') {
                                            window.show();
                                        }
                                    }
                                } catch (e) { }
                            }

                            if (monetagDirectUrl) {
                                openAdDirectLink(monetagDirectUrl);
                            } else if (anyDirectUrl) {
                                openAdDirectLink(anyDirectUrl);
                            }

                            showAdPlayingUI();
                            return;
                        }

                        // ============================================
                        // OPTION 3: Adsterra
                        // ============================================
                        if (adsterraDirectUrl || adsterraZoneId) {
                            if (adsterraZoneId) {
                                try {
                                    if (!document.getElementById('adsterra-zone-script')) {
                                        const adsterraScript = document.createElement('script');
                                        adsterraScript.id = 'adsterra-zone-script';
                                        adsterraScript.async = true;
                                        adsterraScript.src = `//www.highperformanceformat.com/${adsterraZoneId}/invoke.js`;
                                        document.body.appendChild(adsterraScript);
                                    }
                                } catch (e) { }
                            }

                            if (adsterraDirectUrl) {
                                openAdDirectLink(adsterraDirectUrl);
                            } else if (anyDirectUrl) {
                                openAdDirectLink(anyDirectUrl);
                            }

                            showAdPlayingUI();
                            return;
                        }

                        // ============================================
                        // OPTION 4: Google AdSense / Any Direct Link
                        // ============================================
                        if (anyDirectUrl) {
                            openAdDirectLink(anyDirectUrl);
                            showAdPlayingUI();
                            return;
                        }

                        // Default fallback: show timer so user always gets rewarded
                        showAdPlayingUI();
                    }; // end watchBtn.onclick
                } // end if (watchBtn)
            } // end if (contentBox)

            function showAdCompletionScreen() {
                const contentBox = document.getElementById('ad-content-box');
                const overlay = document.getElementById('ad-watching-overlay');
                if (!contentBox) return;

                // ✅ FIX: For quiz and scratch, immediately close overlay and claim reward
                if (currentAdContext === 'quiz_direct' || currentAdContext === 'scratch_ad' || currentAdContext === 'scratch_retry') {
                    if (overlay) {
                        overlay.style.display = 'none';
                        overlay.style.opacity = '0';
                    }
                    claimAdReward();
                    return;
                }

                contentBox.innerHTML =
                    '<div style="width:80px; height:80px; background:linear-gradient(135deg, #22c55e, #16a34a); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; box-shadow:0 12px 32px rgba(34,197,94,0.4);">' +
                    '<i class="fas fa-check" style="font-size:36px; color:#fff;"></i>' +
                    '</div>' +
                    '<div style="font-size:22px; font-weight:900; margin-bottom:8px; color:#22c55e;">Ad Complete!</div>' +
                    '<p style="font-size:14px; color:#aaa; margin-bottom:28px; line-height:1.5;">Your reward is ready. Tap below to claim it now!</p>' +
                    '<button id="ad-claim-btn" style="width:100%; padding:18px; background:linear-gradient(135deg, #22c55e, #16a34a); color:#fff; font-weight:900; border-radius:30px; border:none; cursor:pointer; font-size:17px; box-shadow:0 8px 20px rgba(34,197,94,0.3);">' +
                    '<i class="fas fa-gift" style="margin-right:8px;"></i>CLAIM REWARD' +
                    '</button>' +
                    '<button onclick="closeAdOverlay()" style="margin-top:16px; color:#666; background:none; border:none; font-size:13px; cursor:pointer;">Not now</button>';

                const claimBtn = document.getElementById('ad-claim-btn');
                if (claimBtn) {
                    claimBtn.onclick = () => {
                        closeAdOverlay();
                        claimAdReward();
                    };
                }
            }
        })
        .catch(err => {
            clearTimeout(safetyTimeout);
            console.error('Ad config fetch failed:', err);
            // Show timer anyway so user isn't stuck
            const box = document.getElementById('ad-content-box');
            if (box) {
                box.innerHTML = '<div style="font-size:16px; color:#aaa; margin-bottom:20px;">Loading ad...</div>' +
                    '<div style="width:50px; height:50px; border:4px solid rgba(255,255,255,0.1); border-top-color:#f59e0b; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto;"></div>';
                setTimeout(() => {
                    if (overlay) overlay.style.display = 'none';
                    claimAdReward();
                }, 5000);
            }
        });
}




function resetAdButtons() {
    const dailyBtn = document.getElementById('claimDailyBtn');
    if (dailyBtn && dailyBtn.innerHTML.includes('AD LOADING...')) {
        dailyBtn.innerHTML = '<i class="fas fa-gift"></i> CLAIM DAILY REWARD';
        dailyBtn.style.opacity = '1';
    }

    if (activeTaskButton && activeTaskButton.innerHTML.includes('fa-spinner')) {
        activeTaskButton.disabled = false;
        activeTaskButton.innerHTML = activeTaskButton.dataset.originalText || 'START';
    }
}

function closeAdModal() { }

// ✅ FIX: Helper function to properly close ad overlay
function closeAdOverlay() {
    const overlay = document.getElementById('ad-watching-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        overlay.style.pointerEvents = 'none';
        // Remove backdrop blur from body
        document.body.style.overflow = '';
        document.body.style.filter = '';
        document.body.style.backdropFilter = '';
        document.body.style.webkitBackdropFilter = '';
    }
    // Ensure app container is visible
    const appContainer = document.getElementById('app') || document.querySelector('.app-container') || document.body.firstElementChild;
    if (appContainer) {
        appContainer.style.filter = '';
        appContainer.style.opacity = '1';
        appContainer.style.visibility = 'visible';
    }
    resetAdButtons();
}

async function claimAdReward() {
    // ✅ FIX: Close ad overlay immediately to prevent blur
    closeAdOverlay();

    // Reset buttons first
    resetAdButtons();
    if (adRewardClaimed) return;
    adRewardClaimed = true;

    try {
        const res = await apiFetch('/api/ad/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, context: currentAdContext })
        });
        const data = await res.json();

        if (data.success) {
            if (window.confetti && currentAdContext === 'watch_ad') {
                confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            }

            let msg = `🎉 Reward claimed!`;
            if (currentAdContext === 'watch_ad' || currentAdContext === 'zero_balance_trigger') msg = `📺 +${data.reward || parseInt(window.appCostConfig?.zeroBalanceAdReward) || 5} Tokens rewarded for Watching Ad!`;
            else if (currentAdContext === 'quiz_direct') msg = `🧠 Quiz unlocked! Good luck.`;
            else if (currentAdContext === 'scratch_ad' || currentAdContext === 'scratch_retry') msg = `✨ Scratch card unlocked!`;
            else if (currentAdContext === 'task_verification') msg = `✅ Ad verification complete. Please Verify the task.`;
            else if (currentAdContext === 'gift_claim') msg = `🎁 Gift ad verified! Claiming your gift...`;

            window.showToast(msg);

            if (data.newBalance !== undefined) {
                userData.tokens = data.newBalance;
                updateBalanceUI();
                loadRecentActivity(); // Refresh history after ad reward
            }

            // Navigation
            if (currentAdContext === 'quiz_direct') {
                showPage('quiz');
                loadQuiz();
            } else if (currentAdContext === 'scratch_ad' || currentAdContext === 'scratch_retry') {
                showPage('scratch');
                initScratchCard();
            } else if (currentAdContext === 'task_verification' && activeTaskButton) {
                // Task Ad Completed - Now show VERIFY button on Tasks page
                activeTaskButton.textContent = 'VERIFY';
                activeTaskButton.style.background = '#22c55e';
                activeTaskButton.style.display = 'block';

                if (activeTaskData && activeTaskData.taskId) {
                    IN_PROGRESS_TASKS[activeTaskData.taskId] = 'VERIFY';
                }
                activeTaskButton.disabled = false;

                const currentTaskData = { ...activeTaskData }; // copy data
                const currentBtn = activeTaskButton;

                // Set the click handler for the VERIFY button on Tasks page
                activeTaskButton.onclick = function () {
                    // This will check membership and complete task!
                    completeTask(currentTaskData.taskId, currentTaskData.reward, currentBtn, currentTaskData.url);
                };

                // Open the Task Link immediately when user clicks CLAIM REWARD in ad overlay
                if (window.Telegram?.WebApp?.openLink) {
                    window.Telegram.WebApp.openLink(currentTaskData.url);
                } else {
                    window.open(currentTaskData.url, '_blank');
                }

                // Timer to reset to START after 1 minute if not completed
                setTimeout(() => {
                    if (currentBtn.textContent === 'VERIFY') {
                        currentBtn.textContent = 'START';
                        currentBtn.style.background = ''; // reset to default
                        currentBtn.onclick = function () {
                            startTask(currentBtn, currentTaskData.taskId, currentTaskData.url, currentTaskData.reward);
                        };
                    }
                }, 60000); // 1 minute
            } else if (currentAdContext === 'gift_claim' && pendingGiftId) {
                // Gift Ad Completed - Now claim the gift
                claimGiftReward(pendingGiftId);
            } else if (currentAdContext === 'watch_ad' || currentAdContext === 'zero_balance_trigger') {
                // Always ensure home page is visible after ad reward
                const activePage = document.querySelector('.page.active');
                if (!activePage || activePage.id === 'ad-watching-overlay') {
                    showPage('home');
                } else {
                    // Force re-render current page to prevent blank screen
                    const pageId = activePage.id.replace('page-', '');
                    if (pageId && typeof showPage === 'function') {
                        showPage(pageId);
                    }
                }
                // Telegram WebApp specific: expand and scroll to top
                if (window.Telegram?.WebApp) {
                    try {
                        window.Telegram.WebApp.expand();
                        window.scrollTo(0, 0);
                    } catch (e) { }
                }
            }
        } else {
            window.showToast(data.message || 'Error claiming ad reward');
            adRewardClaimed = false;
        }
    } catch (e) {
        console.error('Ad Claim Error:', e);
        adRewardClaimed = false;
    }
}

// ==========================================
// GIFT POPUP SYSTEM
// ==========================================
let pendingGiftId = null;

async function checkPendingGifts() {
    if (!userData || !userData.id) return;
    try {
        const res = await apiFetch('/api/user/gifts?userId=' + userData.id);
        const data = await res.json();
        if (data.success && data.gifts && data.gifts.length > 0) {
            // Show popup for the first unclaimed gift
            showGiftPopup(data.gifts[0]);
        }
    } catch (e) {
        console.error('Gift check error:', e);
    }
}

function showGiftPopup(gift) {
    const currencyLabel = gift.currency === 'tokens' ? 'Tokens' : gift.currency === 'Gems' ? 'Gems' : 'USD';
    const currencyIcon = gift.currency === 'tokens' ? 'fa-coins' : gift.currency === 'Gems' ? 'fa-gem' : 'fa-dollar-sign';
    const currencyColor = gift.currency === 'tokens' ? '#fbbf24' : gift.currency === 'Gems' ? '#38bdf8' : '#22c55e';

    // Remove existing gift popup if any
    const existing = document.getElementById('giftPopupOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'giftPopupOverlay';
    overlay.style.cssText = 'display:flex; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.92); z-index:9999999; flex-direction:column; align-items:center; justify-content:center; backdrop-filter:blur(15px); color:white; font-family:sans-serif; text-align:center;';

    overlay.innerHTML = `
        <div style="padding:30px; width:100%; max-width:320px;">
            <div style="width:90px; height:90px; background:linear-gradient(135deg,#f59e0b,#d97706); border-radius:28px; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; box-shadow:0 12px 32px rgba(245,158,11,0.4); animation: pulse 2s ease-in-out infinite;">
                <i class="fas fa-gift" style="font-size:40px; color:#fff;"></i>
            </div>
            <div style="font-size:24px; font-weight:900; margin-bottom:8px; color:#f59e0b;">🎁 You Got a Gift!</div>
            <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:20px; margin-bottom:20px;">
                <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:8px;">
                    <i class="fas ${currencyIcon}" style="font-size:28px; color:${currencyColor};"></i>
                    <span style="font-size:32px; font-weight:900; color:${currencyColor};">${gift.amount}</span>
                    <span style="font-size:16px; font-weight:700; color:${currencyColor};">${currencyLabel}</span>
                </div>
                ${gift.note ? `<div style="font-size:13px; color:rgba(255,255,255,0.6); margin-top:8px;">${gift.note}</div>` : ''}
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:24px; line-height:1.5;">Watch a short ad to claim your gift!</p>
            <button id="giftReadingNowBtn" style="width:100%; padding:16px; background:linear-gradient(135deg,#f59e0b,#d97706); color:#000; font-weight:900; border-radius:30px; border:none; cursor:pointer; font-size:16px; box-shadow:0 8px 20px rgba(245,158,11,0.3);">
                <i class="fas fa-play mr-2"></i>Reading Now
            </button>
            <button onclick="document.getElementById('giftPopupOverlay').style.display='none'" style="margin-top:16px; color:#666; background:none; border:none; font-size:13px; cursor:pointer;">Later</button>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('giftReadingNowBtn').onclick = () => {
        overlay.style.display = 'none';
        pendingGiftId = gift.id;
        showAdAndEarn('gift_claim');
    };
}

async function claimGiftReward(giftId) {
    if (!giftId || !userData || !userData.id) return;
    try {
        const res = await apiFetch('/api/gift/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, giftId: giftId })
        });
        const data = await res.json();

        if (data.success) {
            if (window.confetti) {
                confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 }, colors: ['#f59e0b', '#fbbf24', '#22c55e'] });
            }

            // Update local balances
            if (data.newTokens !== undefined) userData.tokens = data.newTokens;
            if (data.newGems !== undefined) userData.Gems = data.newGems;
            if (data.newUsd !== undefined) userData.usd = data.newUsd;
            updateBalanceUI();
            loadRecentActivity();

            window.showToast(`🎁 Gift claimed! +${data.amount} ${data.currency === 'tokens' ? 'Tokens' : data.currency === 'Gems' ? 'Gems' : 'USD'}`);

            // Check for more pending gifts
            pendingGiftId = null;
            setTimeout(checkPendingGifts, 2000);
        } else {
            window.showToast(data.message || 'Failed to claim gift');
            pendingGiftId = null;
        }
    } catch (e) {
        console.error('Gift claim error:', e);
        window.showToast('Network error claiming gift');
        pendingGiftId = null;
    }
}

// ==========================================

function checkZeroBalanceAdTrigger(requiredAmount = 1) {
    const currentTokens = userData.tokens || 0;
    if (currentTokens < requiredAmount) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');

        const needed = requiredAmount - currentTokens;
        const perAd = (window.appCostConfig && Number.isFinite(parseInt(window.appCostConfig.zeroBalanceAdReward)))
            ? parseInt(window.appCostConfig.zeroBalanceAdReward)
            : 5;
        const adsNeeded = Math.ceil(needed / perAd);

        if (adsNeeded > 1) {
            window.showToast(`Insufficient balance! You need ${requiredAmount} tokens. Watch ${adsNeeded} ads to earn tokens.`);
        } else {
            window.showToast(`Insufficient balance! Watch a short ad to get ${perAd} tokens.`);
        }

        setTimeout(() => {
            showAdAndEarn('zero_balance_trigger');
        }, 1500);
        return true;
    }
    return false;
}

window.showAdAndEarn = showAdAndEarn;
window.closeAdModal = closeAdModal;
window.closeAdOverlay = closeAdOverlay;
window.claimAdReward = claimAdReward;

// ==========================================
// DAILY BONUS SYSTEM (PREMIUM)
// ==========================================

function renderDailyGrid() {
    const grid = document.getElementById('dailyRewardsGrid');
    if (!grid) return;

    // Fixed 7-day rewards
    const rewards = [10, 20, 30, 40, 50, 60, 100];
    let userClaimedDay = userData.dailyStreak || 0; // Days completed
    const lastClaim = userData.lastDailyClaim || 0; // Timestamp
    const now = Date.now();
    const canClaim = (now - lastClaim) >= 24 * 60 * 60 * 1000;

    // Reset local view if streak is broken (> 48h) or starting a new week after day 7
    if (lastClaim > 0 && (now - lastClaim > 48 * 60 * 60 * 1000)) {
        userClaimedDay = 0;
    } else if (userClaimedDay === 7 && canClaim) {
        userClaimedDay = 0; // Reset visual cycle to day 1
    }

    let html = '';
    for (let i = 1; i <= 7; i++) {
        const isClaimed = i <= userClaimedDay;
        const isActive = i === userClaimedDay + 1 && canClaim;
        const isDay7 = i === 7;

        // Show green checkmark for claimed days, otherwise show coins/crown
        let iconHtml;
        if (isClaimed) {
            iconHtml = `<i class="fas fa-check-circle" style="color: #22c55e; font-size: 28px;"></i>`; // Green checkmark
        } else if (isDay7) {
            iconHtml = `
                <i class="fas fa-crown" style="color: #fbbf24; font-size: 32px;"></i>
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <span style="font-size:18px; color: #fbbf24;">BIG REWARD</span>
                    <span style="font-size:12px; color: #aaa;">100 Tokens + 2 Gems</span>
                </div>
            `;
        } else {
            iconHtml = `<i class="fas fa-coins" style="color: #fbbf24; font-size: 24px;"></i>`;
        }

        let rewardText = `${rewards[i - 1]} tokens`;

        if (i === 5 || i === 6) {
            rewardText = `${rewards[i - 1]} tokens + <i class="fas fa-gem" style="color:#38bdf8;"></i> 1`;
        } else if (i === 7) {
            rewardText = `2 <i class="fas fa-gem" style="color:#38bdf8;"></i>`;
        }

        // Styling for claimed days
        const claimedStyle = isClaimed ? 'background: rgba(34, 197, 94, 0.1) !important; border-color: #22c55e !important;' : '';
        const claimedLabelStyle = isClaimed ? 'color: #22c55e !important;' : '';
        const claimedRewardStyle = isClaimed ? 'color: #22c55e !important;' : '';

        html += `
        <div class="ds-day ${isClaimed ? 'claimed' : ''} ${isActive ? 'active' : ''} ${isDay7 ? 'day-7' : ''}" style="${claimedStyle}">
            <div class="ds-day-label" style="${claimedLabelStyle}">DAY ${i}</div>
            <div class="ds-day-icon" style="${isDay7 ? 'flex-direction: row; gap: 10px;' : ''}">
                ${iconHtml}
            </div>
            <div class="ds-day-reward" style="${isDay7 ? 'text-align: right;' : ''} ${claimedRewardStyle}">${rewardText}</div>
        </div>`;
    }
    grid.innerHTML = html;

    // Update button text
    const btn = document.getElementById('claimDailyBtn');
    const lbl = document.getElementById('dailyLabel');
    if (btn) {
        if (!canClaim) {
            btn.innerHTML = 'ALREADY CLAIMED';
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.background = '#222';
            btn.style.color = '#555';
            btn.style.boxShadow = 'none';
            if (lbl) {
                lbl.style.background = 'rgba(255,255,255,0.05)';
                lbl.style.border = '1px solid rgba(255,255,255,0.1)';
                lbl.style.color = '#666';
            }
        } else {
            btn.innerHTML = 'CLAIM REWARD';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.background = 'linear-gradient(135deg, #fbbf24, #f59e0b)';
            btn.style.color = '#000';
            btn.style.boxShadow = '0 12px 30px rgba(245, 158, 11, 0.3)';
            if (lbl) {
                lbl.style.background = 'rgba(251, 191, 36, 0.1)';
                lbl.style.border = '1px solid rgba(251, 191, 36, 0.2)';
                lbl.style.color = '#fbbf24';
            }
        }
    }
}
var dailyInterval = null;
function startDailyCountdown() {
    const el = document.getElementById('dailyCountdown');
    if (!el) return;

    if (dailyInterval) clearTimeout(dailyInterval);

    function update() {
        const lastClaim = userData.lastDailyClaim || 0;
        const nextClaim = lastClaim + (24 * 60 * 60 * 1000);
        const now = Date.now();
        const diff = nextClaim - now;

        if (diff <= 0) {
            el.textContent = 'READY';
            const textEl = document.getElementById('dailyCountdownText');
            if (textEl) textEl.textContent = 'READY';
            renderDailyGrid(); // Re-render if state changes
            return;
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const timeStr = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        el.textContent = timeStr;
        const textEl = document.getElementById('dailyCountdownText');
        if (textEl) textEl.textContent = timeStr;
        dailyInterval = setTimeout(update, 1000);
    }
    update();
}

function claimDaily() {
    const btn = document.getElementById('claimDailyBtn');
    if (!btn || btn.disabled) return;

    // The user wants mandatory ad watching for daily reward
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AD LOADING...';
    btn.style.opacity = '0.7';

    window.showToast("📺 Please watch a short ad to claim your Daily Reward");

    // We replace the original function with an ad-triggered one
    showAdAndEarn('daily_claim_ad');

    // We override claimAdReward once for this specific context
    const originalClaimAdReward = window.claimAdReward;
    window.claimAdReward = async function () {
        // Restore original after one use
        window.claimAdReward = originalClaimAdReward;

        if (currentAdContext !== 'daily_claim_ad') {
            return originalClaimAdReward();
        }

        // Now actually claim the daily reward
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CLAIMING...';
        btn.disabled = true;

        try {
            const res = await apiFetch('/api/daily/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userData.id })
            });
            const data = await res.json();

            if (data.success) {
                userData.tokens = data.newBalance;
                userData.dailyStreak = data.streak;
                userData.lastDailyClaim = Date.now();
                window.showToast(`✅ Daily reward claimed! +${data.reward} Tokens`);
                renderDailyGrid();
                renderBalances();
                startDailyCountdown();
            } else {
                window.showToast(data.message || 'Failed to claim daily reward');
                renderDailyGrid();
            }
        } catch (err) {
            console.error('Error claiming daily:', err);
            window.showToast('❌ Error claiming daily reward');
            renderDailyGrid();
        }
    };
}

async function redeemCode() {
    const input = document.getElementById('redeemCodeInput');
    if (!input) return;
    const code = input.value.trim();
    if (!code) {
        window.showToast('Please enter a code');
        return;
    }

    const btn = document.querySelector('#redeemPage .gv-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REDEEMING...';
    }

    try {
        const res = await apiFetch('/api/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, code: code })
        });
        const data = await res.json();
        if (data.success) {
            // Show success checkmark modal
            showRedeemSuccessModal(data.reward);
            userData.tokens = data.newTokens;
            renderBalances();
            loadRecentActivity(); // Refresh history
            input.value = '';
        } else {
            window.showToast(`❌ ${data.message || 'Invalid code'}`);
        }
    } catch (e) {
        window.showToast('Network error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'REDEEM NOW';
        }
    }
}

// ==========================================
// LEADERBOARD SYSTEM (PREMIUM)
// ==========================================

let currentLeaderboardTab = 'refer';

function renderReferralLeaderboard() {
    if (typeof renderPodiumLeaderboard !== 'undefined') {
        renderPodiumLeaderboard('refer', currentReferPeriod, {
            podiumId: 'referralPodium',
            listId: 'referralLeadList',
            rankId: 'referralPersonalRank',
            timeId: 'referralTimeLeft',
            cycleId: 'referralCycleInfo',
            progressId: 'referralProgressBar'
        });
    } else {
        renderGenericLeaderboard('refer', 'referralLeadList');
    }
}

// Global variables to keep track of current period tab
let currentReferPeriod = 'week';

function renderPodiumLeaderboard(type, period, ids) {
    const podiumEl = document.getElementById(ids.podiumId);
    const listEl = document.getElementById(ids.listId);
    const personalRankEl = document.getElementById(ids.rankId);

    if (!podiumEl || !listEl) return;

    podiumEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub); width:100%;"><i class="fas fa-spinner fa-spin"></i> Loading Top 3...</div>';
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);"><i class="fas fa-spinner fa-spin"></i> Loading others...</div>';

    // Simple client-side cache for leaderboard
    window._leaderboardCache = window._leaderboardCache || {};
    const cacheKey = `${userData.id}-${type}-${period}`;
    const nowMs = Date.now();
    let fetchPromise;

    if (window._leaderboardCache[cacheKey] && nowMs - window._leaderboardCache[cacheKey].time < 2000) {
        // Use cached data
        fetchPromise = Promise.resolve(window._leaderboardCache[cacheKey].data);
    } else {
        fetchPromise = apiFetch(`/api/leaderboard?userId=${userData.id}&type=${type}&period=${period}`)
            .then(r => r.json())
            .then(data => {
                window._leaderboardCache[cacheKey] = { time: nowMs, data: data };
                return data;
            });
    }

    fetchPromise.then(data => {
        if (!data.success || !data.top) {
            podiumEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666; width:100%;">No rankings available.</div>';
            listEl.innerHTML = '';
            return;
        }

        // Update 7-day Countdown Timer
        const now = new Date();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        let cycleStartTime = startOfWeek.getTime();
        let cycleEndTime = endOfWeek.getTime();

        if (period === 'month') {
            cycleStartTime = startOfMonth.getTime();
            cycleEndTime = endOfMonth.getTime();
        }

        const cycleDuration = cycleEndTime - cycleStartTime;
        const elapsedTimeInCycle = now.getTime() - cycleStartTime;
        const timeLeft = cycleEndTime - now.getTime();

        const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const percentage = Math.floor((elapsedTimeInCycle / cycleDuration) * 100);

        const tlEl = document.getElementById(ids.timeId);
        const cycleEl = document.getElementById(ids.cycleId);
        const progressEl = document.getElementById(ids.progressId);

        if (tlEl) tlEl.textContent = `${daysLeft}d ${hoursLeft}h left`;
        if (cycleEl) cycleEl.textContent = `Current cycle • ${percentage}% complete`;
        if (progressEl) progressEl.style.width = `${percentage}%`;

        const top3 = data.top.slice(0, 3);
        const others = data.top.slice(3, 100);

        // Structure: 2nd, 1st, 3rd for podium display
        let podiumHTML = '';
        const podiumOrder = [1, 0, 2]; // index 1 (2nd), index 0 (1st), index 2 (3rd)

        const isMonth = (period === 'month');
        const styles = [
            {
                color: '#f59e0b', size: 76, badge: '#1', showCrown: true, width: '33.33%',
                reward: type === 'quiz' ? '800 TC' : (isMonth ? '50 💎' : '10 💎')
            }, // 1st
            {
                color: '#cbd5e1', size: 60, badge: '#2', showCrown: false, width: '33.33%',
                reward: type === 'quiz' ? '600 TC' : (isMonth ? '45 💎' : '8 💎')
            }, // 2nd
            {
                color: '#d97706', size: 60, badge: '#3', showCrown: false, width: '33.33%',
                reward: type === 'quiz' ? '400 TC' : (isMonth ? '40 💎' : '6 💎')
            }  // 3rd
        ];

        const scoreIcon = type === 'earn' ?
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2L2 9.5L5.5 22H18.5L22 9.5L12 2Z"/></svg>` :
            type === 'quiz' ? `<i class="fas fa-bolt" style="color:#22c55e; font-size:12px;"></i>` :
                `<i class="fas fa-users" style="color:#f59e0b; font-size:12px;"></i>`;

        podiumOrder.forEach(idx => {
            const u = top3[idx];
            const style = styles[idx];
            const displayReward = (u && u.reward) ? u.reward : style.reward;
            // Podium step heights for visual hierarchy
            const podiumHeights = [180, 140, 120]; // 1st taller, 2nd medium, 3rd shorter
            const podiumHeight = podiumHeights[idx];
            if (!u) {
                // Placeholder if less than 3
                podiumHTML += `
                    <div style="display: flex; flex-direction: column; align-items: center; width: ${style.width}; min-height: ${podiumHeight}px; justify-content: flex-end; padding-bottom: 8px;">
                        ${style.showCrown ? '<i class="fas fa-crown" style="color: rgba(255,255,255,0.3); font-size: 28px; margin-bottom: -8px; z-index: 10;"></i>' : '<div style="height: 20px;"></div>'}
                        <div style="position: relative; margin-bottom: 12px; z-index: 5;">
                            <div style="width: ${style.size}px; height: ${style.size}px; border-radius: 50%; border: 3px dashed rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 24px; color: rgba(255,255,255,0.2);">?</div>
                            <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); background: #333; color: #888; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px;">${style.badge}</div>
                        </div>
                        <div style="font-size: 13px; font-weight: 800; color: #555; margin-bottom: 4px; text-align: center;">---</div>
                        <div style="display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.2); margin-bottom: 8px;">
                            ---
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(255, 255, 255, 0.1); color: #888; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 800; margin-top: auto;">${displayReward}</div>
                    </div>`;
                return;
            }

            const avatarUrl = u.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random&color=fff&size=80`;
            const glowClass = style.showCrown ? 'box-shadow: 0 0 20px rgba(245,158,11,0.6), 0 4px 12px rgba(0,0,0,0.5);' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.5);';
            const isCurrentUser = String(u.id) === String(userData.id);

            podiumHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; width: ${style.width}; min-height: ${podiumHeight}px; justify-content: flex-end; padding-bottom: 8px;">
                    ${style.showCrown ? '<i class="fas fa-crown" style="color: #f59e0b; font-size: 28px; margin-bottom: -8px; z-index: 10; text-shadow: 0 2px 10px rgba(245,158,11,0.5);"></i>' : '<div style="height: 20px;"></div>'}
                    <div style="position: relative; margin-bottom: 12px; z-index: 5;">
                        <img src="${avatarUrl}" style="width: ${style.size}px; height: ${style.size}px; border-radius: 50%; border: 3px solid ${isCurrentUser ? '#22c55e' : style.color}; object-fit: cover; ${glowClass}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=f59e0b&color=000&size=80'">
                        <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); background: ${style.showCrown ? '#f59e0b' : '#fff'}; color: #000; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${style.badge}</div>
                    </div>
                    <div style="font-size: 13px; font-weight: 800; color: ${isCurrentUser ? '#22c55e' : '#fff'}; margin-bottom: 4px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; padding: 0 4px;">${u.name}${isCurrentUser ? ' ✓' : ''}</div>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 13px; font-weight: 800; color: ${type === 'quiz' ? '#22c55e' : '#f59e0b'}; margin-bottom: 8px;">
                        ${scoreIcon}
                        ${formatCompact(u.score || 0)}
                    </div>
                    <div style="background: rgba(${type === 'quiz' ? '34, 197, 94' : '245, 158, 11'}, 0.15); border: 1px solid rgba(${type === 'quiz' ? '34, 197, 94' : '245, 158, 11'}, 0.3); color: ${type === 'quiz' ? '#22c55e' : '#f59e0b'}; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 800; margin-top: auto; white-space: nowrap;">${displayReward}</div>
                </div>`;
        });

        podiumEl.innerHTML = podiumHTML;

        // Update Reward Info Panel
        if (type === 'refer' || type === 'earn') {
            const rewardListEl = document.getElementById('referralRewardList');
            if (rewardListEl) {
                const isMonth = (period === 'month');
                const prizes = isMonth
                    ? [
                        ['🥇 1st Place', '50 💎'],
                        ['🥈 2nd Place', '45 💎'],
                        ['🥉 3rd Place', '40 💎'],
                        ['4th Place', '35 💎'],
                        ['5th Place', '30 💎'],
                        ['6th Place', '25 💎'],
                        ['7th Place', '20 💎'],
                        ['8th Place', '15 💎'],
                        ['9th Place', '10 💎'],
                        ['10th Place', '5 💎']
                      ]
                    : [
                        ['🥇 1st Place', '10 💎'],
                        ['🥈 2nd Place', '8 💎'],
                        ['🥉 3rd Place', '6 💎'],
                        ['4th Place', '5 💎'],
                        ['5th Place', '4 💎'],
                        ['6th Place', '3 💎'],
                        ['7th Place', '2 💎'],
                        ['8th Place', '1 💎'],
                        ['9th Place', '1 💎'],
                        ['10th Place', '1 💎']
                      ];
                rewardListEl.innerHTML = prizes.map(([rank, prize]) =>
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span>${rank}</span>
                        <span style="color:#a78bfa; font-weight:700; display:flex; align-items:center; gap:4px;">${prize} <i class="fas fa-gem" style="font-size:11px; color:#a78bfa;"></i></span>
                    </div>`
                ).join('') + `<div style="font-size:11px; color:#a1a1aa; margin-top:8px; text-align:center;">💎 Gems automatically paid at end of ${isMonth ? 'month' : 'week'}</div>`;
            }
        }

        // Render rest of the list
        if (others.length > 0) {
            let html = others.slice(0, 96).map((u, i) => {
                const rank = i + 4;
                const isMe = String(u.id) === String(userData.id);

                return `
                    <div class="lead-row" style="background: var(--bg-card); border-radius: 16px; margin-bottom: 0; padding: 12px 16px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border-color); ${isMe ? 'border-color: #f59e0b; background: rgba(245,158,11,0.05);' : ''}">
                        <div style="font-size: 14px; font-weight: 800; color: var(--text-sub); width: 24px; text-align: center;">${rank}</div>
                        <img src="${u.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random&color=fff&size=40`}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                        <div style="flex-grow: 1;">
                            <div style="font-size: 14px; font-weight: 700; color: #fff;">${u.name}${isMe ? ' <span style="color:#f59e0b; font-size:10px;">(YOU)</span>' : ''}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #fff;">
                            ${scoreIcon}
                            ${formatCompact(u.score || 0)}
                        </div>
                    </div>`;
            }).join('');

            if (others.length >= 96) {
                html += `
                    <div class="lead-row" style="background: transparent; border-radius: 16px; margin-bottom: 0; padding: 16px; display: flex; justify-content: center; align-items: center; gap: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                        <div style="font-size: 14px; font-weight: 800; color: #888;">99+</div>
                        <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.4);">More users contending</div>
                    </div>`;
            }

            listEl.innerHTML = html;
        } else {
            listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666; font-size:12px;">No more contenders.</div>';
        }

        // Update Personal Rank Footer
        if (personalRankEl) {
            let userRank = data.userRank;
            const userScore = data.userScore || 0;

            // If user has a score but rank is null, find rank from top array
            if (!userRank && userScore > 0) {
                const myId = String(userData.id);
                const myIdx = (data.top || []).findIndex(u => String(u.id) === myId);
                if (myIdx >= 0) userRank = myIdx + 1;
                else userRank = (data.top || []).length + 1; // Approximate outside top 100
            }

            const rankDisplay = userRank ? (userRank > 99 ? '99+' : '#' + userRank) : '-';

            let actionWord = type === 'earn' ? 'earning' : type === 'quiz' ? 'playing' : 'referring';
            let subtitleHtml = `<div style="font-size: 11px; color: rgba(255,255,255,0.5);">Keep ${actionWord} to climb the ranks!</div>`;
            if (!userRank || userRank > 100) {
                if (type === 'refer') {
                    subtitleHtml = userScore > 0
                        ? `<div style="font-size: 11px; color: rgba(255,255,255,0.5);">Keep inviting to climb higher!</div>`
                        : `<div style="font-size: 11px; color: rgba(255,255,255,0.5);">Invite friends to enter the leaderboard.</div>`;
                } else if (type === 'earn') {
                    subtitleHtml = `<div style="font-size: 11px; color: rgba(255,255,255,0.5);">Complete tasks and earn tokens to enter.</div>`;
                } else {
                    subtitleHtml = `<div style="font-size: 11px; color: rgba(255,255,255,0.5);">Play quiz to enter the leaderboard.</div>`;
                }
            }

            personalRankEl.innerHTML = `
                    <div style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); overflow: hidden; flex-shrink: 0;">
                        <img src="${userData.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.firstName)}&background=random&color=fff`}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div style="flex-grow: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                            <div style="font-weight: 700; color: #fff; font-size: 15px;">Your Rank</div>
                            <div style="background: rgba(${type === 'quiz' ? '34, 197, 94' : '245, 158, 11'}, 0.2); color: ${type === 'quiz' ? '#22c55e' : '#f59e0b'}; padding: 2px 8px; border-radius: 8px; font-size: 12px; font-weight: 800;">${rankDisplay}</div>
                        </div>
                        ${subtitleHtml}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 16px; color: #fff;">
                        ${scoreIcon}
                        ${formatCompact(userScore)}
                    </div>
                `;
        }

    })
        .catch((e) => {
            console.error("Leaderboard Error:", e);
            podiumEl.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444; width:100%;">Failed to load rankings.</div>';
            listEl.innerHTML = '';
        });
}

function renderGenericLeaderboard(type, listId) {
    const list = document.getElementById(listId);
    if (!list) return;

    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    // Simple client-side cache for leaderboard
    window._leaderboardGenericCache = window._leaderboardGenericCache || {};
    const cacheKey = `${userData.id}-${type}`;
    const nowMs = Date.now();
    let fetchPromise;

    if (window._leaderboardGenericCache[cacheKey] && nowMs - window._leaderboardGenericCache[cacheKey].time < 2000) {
        // Use cached data
        fetchPromise = Promise.resolve(window._leaderboardGenericCache[cacheKey].data);
    } else {
        fetchPromise = apiFetch(`/api/leaderboard?userId=${userData.id}&type=${type}`)
            .then(r => r.json())
            .then(data => {
                window._leaderboardGenericCache[cacheKey] = { time: nowMs, data: data };
                return data;
            });
    }

    fetchPromise.then(data => {
        if (!data.success || !data.top) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No rankings available.</div>';
            return;
        }

        let renderedHtml = data.top.slice(0, 99).map((u, i) => {
            const rank = i + 1;
            let rankClass = 'rank-other';
            if (rank === 1) rankClass = 'rank-1';
            else if (rank === 2) rankClass = 'rank-2';
            else if (rank === 3) rankClass = 'rank-3';

            const isMe = String(u.id) === String(userData.id);

            const scoreLabel = type === 'earn' ? 'TOKENS' : 'REFERRALS';
            const scoreValue = u.score || 0;

            return `
            <div class="lead-row" style="${isMe ? 'border: 1px solid #f59e0b; background: rgba(245,158,11,0.08);' : ''}">
                <div class="lead-rank ${rankClass}">#${rank}</div>
                <div class="lead-avatar">
                   <img src="${u.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random&color=fff&size=40`}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=f59e0b&color=000&size=40'">
                </div>
                <div class="lead-info">
                    <div class="lead-name">${u.name}${isMe ? ' <span style="color:#f59e0b;font-size:10px;">YOU</span>' : ''}</div>
                    <div class="lead-uid">ID: ${u.id}</div>
                </div>
                <div class="lead-count-box">
                    <div class="lead-count">${scoreLabel === 'TOKENS' ? formatCompact(scoreValue) : scoreValue}</div>
                    <div class="lead-label">${scoreLabel}</div>
                </div>
            </div>`;
        }).join('');

        if (data.top.length >= 99) {
            renderedHtml += `
            <div class="lead-row" style="background: transparent; border-radius: 16px; margin-bottom: 0; padding: 16px; display: flex; justify-content: center; align-items: center; gap: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                <div style="font-size: 14px; font-weight: 800; color: #888;">99+</div>
                <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.4);">More users contending</div>
            </div>`;
        }

        list.innerHTML = renderedHtml;

        // Update personal rank if available in profile display
        const rankEl = document.getElementById('profile-rank');
        if (rankEl && data.userRank && type === 'refer') {
            rankEl.textContent = `#${data.userRank}`;
        }
    })
        .catch(() => {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">Failed to load rankings.</div>';
        });
}

// Keep old functions for compatibility but redirected
function switchLeaderboardTab(tab) {
    nav('referralLeaderboard');
}

function renderLeaderboard() {
    nav('referralLeaderboard');
}

// UPDATE INVITE UI
function updateInviteUI() {
    const banner = document.getElementById('inviteBonusBanner');
    if (banner) {
        banner.innerHTML = `Invite a friend and get <span style="color:#f59e0b; font-weight:800">${appConfig.inviteBonus} Tokens</span> bonus!`;
    }
}

// RENDER REFERRAL HISTORY - Fetch from server
function renderReferralHistory() {
    const container = document.getElementById('refHistoryList');
    if (!container) return;

    // Check if userId is valid before making API call
    if (!isValidUserId(userData.id)) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-sub);">
                <i class="fas fa-user-plus" style="font-size:32px; margin-bottom:10px; display:block; opacity:0.3;"></i>
                <div style="font-size:12px;">Please login to view referrals</div>
            </div>`;
        return;
    }

    // Show loading state
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    // Fetch real data from API
    apiFetch(`/api/referrals/${userData.id}`)
        .then(r => r.json())
        .then(data => {
            if (!data.success || !data.referrals || data.referrals.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px; color:var(--text-sub);">
                        <i class="fas fa-user-plus" style="font-size:32px; margin-bottom:10px; display:block; opacity:0.3;"></i>
                        <div style="font-size:12px;">No referrals yet. Share your link to invite friends!</div>
                    </div>`;
                return;
            }

            container.innerHTML = data.referrals.map(h => {
                const date = new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const time = new Date(h.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                // ✅ FIX: Show profile photo if available, else colored initial avatar
                const avatarUrl = h.photo_url || `/api/proxy-avatar?userId=${h.userId}`;
                const avatarHtml = `<img src="${avatarUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color)" onerror="this.outerHTML='<div style=\'width:36px;height:36px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#000;font-weight:800;font-size:14px;\'>${h.name.charAt(0).toUpperCase()}</div>'">`;
                return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border-color)">
                    <div style="display:flex; gap:10px; align-items:center">
                        ${avatarHtml}
                        <div>
                            <div style="font-size:13px; font-weight:700; color:var(--text-main)">${h.name}</div>
                            <div style="font-size:10px; color:var(--text-sub)">${date} • ${time}</div>
                        </div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:10px; color:${h.status === 'Verified' ? '#22c55e' : '#f59e0b'}">${h.status}</div>
                        <div style="font-size:12px; font-weight:800; color:var(--text-main)">${h.reward}</div>
                    </div>
                </div>
            `}).join('');
        })
        .catch(() => {
            container.innerHTML = `
                <div style="text-align:center; padding:20px; color:#ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size:24px; margin-bottom:8px; display:block;"></i>
                    Failed to load referrals.
                </div>`;
        });
}

// Load invite page stats
function loadInviteStats() {
    // Only load if userId is valid
    if (!isValidUserId(userData.id)) {
        console.log('[INVITE] Waiting for valid userId...');
        // Try again after a short delay
        setTimeout(() => {
            if (isValidUserId(userData.id)) {
                renderReferralHistory();
                loadInviteStats();
            }
        }, 1000);
        return;
    }

    apiFetch(`/api/referrals/${userData.id}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                // Update stats cards - try multiple selector strategies
                const statCards = document.querySelectorAll('.stat-card');
                statCards.forEach(card => {
                    const label = card.querySelector('.stat-label, .mi-label, [class*="label"]');
                    const value = card.querySelector('.stat-value, .mi-value, [class*="value"]');
                    if (!label || !value) return;
                    const labelText = label.textContent.trim().toLowerCase();
                    if (labelText.includes('invited') || labelText.includes('referral') || labelText.includes('friend')) {
                        value.textContent = data.stats.invited;
                    } else if (labelText.includes('earned') || labelText.includes('reward') || labelText.includes('bonus')) {
                        value.textContent = data.stats.earned;
                    }
                });

                // Fallback: try direct element IDs for stat numbers
                const invitedEl = document.getElementById('stat-invited');
                const earnedEl = document.getElementById('stat-earned');
                if (invitedEl) invitedEl.textContent = data.stats.invited;
                if (earnedEl) earnedEl.textContent = data.stats.earned;

                // Update referral link
                const linkEl = document.getElementById('referralLink');
                if (linkEl && data.referralLink) {
                    linkEl.textContent = data.referralLink;
                }

                // Update userData invites count
                userData.invites = data.stats.invited;
            }
        })
        .catch(() => {
            // Silent fail - keep default values
        });
}

// Copy referral link
function copyLink() {
    const linkEl = document.getElementById('referralLink');
    const copyBtn = document.getElementById('copyRefBtn');
    if (!linkEl) return;

    const text = linkEl.textContent || linkEl.innerText;

    navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) {
            window.showToast('Referral link copied!');
        }

        // Change button state to "Copied" with tick icon
        if (copyBtn) {
            const originalContent = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
            copyBtn.style.background = '#22c55e'; // Green background
            copyBtn.style.color = '#fff';

            setTimeout(() => {
                copyBtn.innerHTML = originalContent;
                copyBtn.style.background = ''; // Revert to CSS variable or original
                copyBtn.style.color = '#000';
            }, 2000);
        }

        if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        if (window.showToast) {
            window.showToast('Referral link copied!');
        }
    });
}

// Share referral link via WhatsApp
function shareViaWhatsApp() {
    const linkEl = document.getElementById('referralLink');
    if (!linkEl) return;

    const referralLink = linkEl.textContent || linkEl.innerText;
    const shareText = `🎁 Join me and earn rewards!\n\nGet free tokens when you sign up using my referral link:\n${referralLink}\n\n🚀 Join now and start earning!`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
}

// Share referral link via Telegram
function shareViaTelegram() {
    const linkEl = document.getElementById('referralLink');
    if (!linkEl) return;

    const referralLink = linkEl.textContent || linkEl.innerText;
    const shareText = `🎁 Join me and earn rewards! Get free tokens when you sign up using my referral link: ${referralLink}`;

    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('🎁 Join me and earn free tokens!')}`;
    window.open(telegramUrl, '_blank');
}

// NEW: Open share invite modal with bot data
function openShareInviteModal() {
    const modal = document.getElementById('shareInviteModal');
    if (!modal) return;

    // Populate bot data
    const botAvatar = document.getElementById('shareBotAvatar');
    const botName = document.getElementById('shareBotName');
    const referralLink = document.getElementById('shareReferralLink');
    const userNameSpan = document.getElementById('shareUserName');

    // Set bot info (you can customize these)
    if (botAvatar) botAvatar.src = 'https://telegram.org/img/t_logo.png'; // Default Telegram logo, can be replaced with actual bot avatar
    if (botName) botName.textContent = 'AutosVerify Bot';

    // Set referral link
    const linkEl = document.getElementById('referralLink');
    if (linkEl && referralLink) {
        referralLink.textContent = linkEl.textContent || linkEl.innerText;
    }

    // Set user name
    const userName = userData.firstName || userData.username || 'my';
    if (userNameSpan) {
        userNameSpan.textContent = userName === 'my' ? 'my' : `${userName}'s`;
    }

    // Show modal
    modal.style.display = 'flex';
}

// NEW: Close share invite modal
function closeShareInviteModal() {
    const modal = document.getElementById('shareInviteModal');
    if (modal) modal.style.display = 'none';
}

// NEW: Share from modal - Telegram
function shareInviteViaTelegram() {
    const linkEl = document.getElementById('shareReferralLink');
    if (!linkEl) return;

    const referralLink = linkEl.textContent || linkEl.innerText;
    const userName = userData.firstName || userData.username || 'I';
    const shareText = `🎁 Join ${userName === 'I' ? 'me' : userName}'s bot and earn rewards!\n\nGet free tokens when you sign up using this link:\n${referralLink}\n\n🚀 Join AutosVerify Bot now!`;

    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
    window.open(telegramUrl, '_blank');
    closeShareInviteModal();
}

// NEW: Share from modal - WhatsApp
function shareInviteViaWhatsApp() {
    const linkEl = document.getElementById('shareReferralLink');
    if (!linkEl) return;

    const referralLink = linkEl.textContent || linkEl.innerText;
    const userName = userData.firstName || userData.username || 'I';
    const shareText = `🎁 Join ${userName === 'I' ? 'me' : userName}'s bot and earn rewards!\n\nGet free tokens when you sign up using this link:\n${referralLink}\n\n🚀 Join AutosVerify Bot now!`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
    closeShareInviteModal();
}

// NEW: Copy invite link from modal
function copyInviteLink() {
    const linkEl = document.getElementById('shareReferralLink');
    if (!linkEl) return;

    const text = linkEl.textContent || linkEl.innerText;

    navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) {
            window.showToast('Referral link copied!');
        }

        if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        if (window.showToast) {
            window.showToast('Referral link copied!');
        }
    });
}

// showPage wrapper logic successfully integrated directly into main showPage function

// Call init functions
updateInviteUI();
renderReferralHistory();
// renderLeaderboard(); // Removed as function not defined in this snippet

// Make sure inline onclick handlers in HTML can access core functions
window.nav = nav;
window.showPage = showPage;
window.toggleTheme = toggleTheme;
window.goBack = goBack;
window.handleHeaderClick = handleHeaderClick;
window.claimDaily = claimDaily;
window.exchangeTokens = exchangeTokens;
window.earn = earn;
window.verifyAndComplete = verifyAndComplete;
window.completeTaskReward = completeTaskReward;
window.loadUserTasks = loadUserTasks;
window.startTask = startTask;
window.completeTask = completeTask;
window.selectPayMethod = selectPayMethod;
window.submitPayment = submitPayment;
window.payWithBalance = payWithBalance;
window.selectPM = selectPM;
window.copyLink = copyLink;
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareViaTelegram = shareViaTelegram;
window.openShareInviteModal = openShareInviteModal;
window.closeShareInviteModal = closeShareInviteModal;
window.shareInviteViaTelegram = shareInviteViaTelegram;
window.shareInviteViaWhatsApp = shareInviteViaWhatsApp;
window.copyInviteLink = copyInviteLink;

// Services Page Toggle View — Grid (চাঁদের মতো) ↔ List (লম্বালম্বি)
let _servicesIsGrid = false;
function toggleServicesView() {
    _servicesIsGrid = !_servicesIsGrid;
    const gridView = document.getElementById('servicesGridView');
    const listView = document.getElementById('servicesListView');
    const icon = document.getElementById('servicesViewIcon');

    if (gridView && listView) {
        if (_servicesIsGrid) {
            gridView.style.display = 'grid';
            listView.style.display = 'none';
            if (icon) { icon.className = 'fas fa-list'; }
        } else {
            gridView.style.display = 'none';
            listView.style.display = 'flex';
            if (icon) { icon.className = 'fas fa-th'; }
        }
    }
}
window.toggleServicesView = toggleServicesView;

// ==========================================
// WEBSITE TRAFFIC MODULE
// ==========================================
let _trafficCostPerHundred = 1; // 1 Gem per 100 visitors

function loadWebsiteTrafficPage() {
    // Load traffic cost from SMM costs config
    try {
        const smmCosts = JSON.parse(localStorage.getItem('smmCosts') || '{}');
        _trafficCostPerHundred = parseFloat(smmCosts.traffic || smmCosts.trafficCostPerHundred || 1);
    } catch (e) { _trafficCostPerHundred = 1; }
    updateTrafficPreview();
    loadTrafficOrders();
    const gems = parseFloat(userData?.Gems || userData?.gems || 0);
    const el = document.getElementById('trafficUserGems');
    if (el) el.textContent = gems.toFixed(2) + ' Gems';
}

function updateTrafficQty(val) {
    const qty = parseInt(val) || 100;
    const display = document.getElementById('trafficQtyDisplay');
    const manual = document.getElementById('trafficQtyManual');
    if (display) display.textContent = qty.toLocaleString();
    if (manual) manual.value = qty;
    updateTrafficPreview();
}

function updateTrafficQtyManual(val) {
    const qty = Math.max(100, Math.round((parseInt(val) || 100) / 100) * 100);
    const slider = document.getElementById('trafficQtySlider');
    const display = document.getElementById('trafficQtyDisplay');
    if (slider) slider.value = Math.min(qty, parseInt(slider.max));
    if (display) display.textContent = qty.toLocaleString();
    updateTrafficPreview();
}

function setTrafficMax() {
    const gems = parseFloat(userData?.Gems || userData?.gems || 0);
    const maxVisitors = Math.floor(gems / _trafficCostPerHundred) * 100;
    if (maxVisitors < 100) { showToast('Insufficient Gems!', 'error'); return; }
    const slider = document.getElementById('trafficQtySlider');
    const display = document.getElementById('trafficQtyDisplay');
    const manual = document.getElementById('trafficQtyManual');
    const capped = Math.min(maxVisitors, parseInt(slider?.max || 10000));
    if (slider) slider.value = capped;
    if (display) display.textContent = capped.toLocaleString();
    if (manual) manual.value = capped;
    updateTrafficPreview();
}

function updateTrafficPreview() {
    const qty = parseInt(document.getElementById('trafficQtySlider')?.value || 100);
    const totalGems = Math.ceil((qty / 100) * _trafficCostPerHundred);
    const gems = parseFloat(userData?.Gems || userData?.gems || 0);

    const el = (id) => document.getElementById(id);
    if (el('trafficCostQty')) el('trafficCostQty').textContent = qty.toLocaleString();
    if (el('trafficCostPerUnit')) el('trafficCostPerUnit').textContent = `${_trafficCostPerHundred} Gem per 100`;
    if (el('trafficTotalCost')) el('trafficTotalCost').textContent = totalGems + ' Gems';
    if (el('trafficUserGems')) el('trafficUserGems').textContent = gems.toFixed(2) + ' Gems';

    const btn = el('trafficSubmitBtn');
    if (btn) {
        const canBuy = gems >= totalGems;
        btn.style.opacity = canBuy ? '1' : '0.5';
        btn.style.pointerEvents = canBuy ? 'auto' : 'none';
    }
}

async function submitTrafficOrder() {
    const url = document.getElementById('trafficUrl')?.value?.trim();
    const qty = parseInt(document.getElementById('trafficQtySlider')?.value || 100);

    if (!url) { showToast('Please enter your website URL', 'error'); return; }
    if (!url.startsWith('http')) { showToast('URL must start with http:// or https://', 'error'); return; }
    if (!userData?.id) { showToast('Please login first', 'error'); return; }

    const btn = document.getElementById('trafficSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ordering...'; }

    try {
        const res = await apiFetch('/api/smm/instagram/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                username: url,
                service: 'traffic',
                quantity: qty,
                platform: 'website'
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Traffic order placed!', 'success');
            userData.Gems = data.newGems;
            userData.gems = data.newGems;
            updateTrafficPreview();
            loadTrafficOrders();
            document.getElementById('trafficUrl').value = '';
        } else {
            showToast(data.message || 'Failed to place order', 'error');
        }
    } catch (e) {
        showToast('Network error. Try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-globe"></i> Order Traffic'; }
    }
}

async function loadTrafficOrders() {
    const list = document.getElementById('trafficOrdersList');
    if (!list || !userData?.id) return;
    try {
        const res = await apiFetch('/api/smm/orders/' + userData.id);
        const data = await res.json();
        const trafficOrders = (data.orders || []).filter(o => o.platform === 'website' || o.service === 'traffic');
        if (trafficOrders.length > 0) {
            list.innerHTML = trafficOrders.map(o => {
                const sc = o.status === 'completed' ? '#22c55e' : o.status === 'cancelled' ? '#ef4444' : '#f59e0b';
                return `<div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-weight:700; color:#fff; font-size:13px; word-break:break-all;">${o.username}</span>
                        <span style="font-size:12px; font-weight:700; color:${sc};">${o.status.toUpperCase()}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-sub);">${o.quantity.toLocaleString()} visitors · ${o.gemsSpent} Gems · ${new Date(o.createdAt).toLocaleDateString()}</div>
                </div>`;
            }).join('');
        } else {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub); font-size:13px;">No orders yet</div>';
        }
    } catch (e) { }
}

window.updateTrafficQty = updateTrafficQty;
window.updateTrafficQtyManual = updateTrafficQtyManual;
window.setTrafficMax = setTrafficMax;
window.updateTrafficPreview = updateTrafficPreview;
window.submitTrafficOrder = submitTrafficOrder;

// ==========================================
// NEW WALLET AND PAYMENT LOGIC (CONNECTED TO SERVER)
// ==========================================

const userId = userData.id;

let lastUserSyncTime = 0;

// Main auto-login function: registers user with server using Telegram data
async function registerAndFetchUser() {
    const currentUserId = userData.id;
    if (!currentUserId || currentUserId === 0) {
        // No Telegram user (opened in browser, not Telegram)
        renderBalances();
        applyProfilePhoto('');
        return;
    }

    // Rate-limit sync requests to once every 3 seconds to avoid flooding the API on rapid tab-clicks
    const nowMs = Date.now();
    if (window._isRegistered && (nowMs - lastUserSyncTime < 3000)) {
        // Just render cached balances/info to make sure UI is updated
        renderBalances();
        return;
    }
    lastUserSyncTime = nowMs;

    // LOAD FROM LOCAL CACHE FIRST for instant UI
    const cachedData = localStorage.getItem(`userData_${currentUserId}`);
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if (parsed.id == currentUserId) {
                const keepApiKey = userData && userData.apiKey;
                userData = { ...userData, ...parsed };
                if (keepApiKey && !userData.apiKey) {
                    userData.apiKey = keepApiKey;
                }
                console.log("💾 Loaded from cache:", userData.completedTasks?.length || 0, "tasks");
                if (userData.completedTasks) {
                    userData.completedTasks.forEach(tid => { IN_PROGRESS_TASKS[tid] = 'completed'; });
                }
                // ===== INSTANT RENDER FROM CACHE =====
                renderBalances();
                applyProfilePhoto(userData.photo_url || '');
                if (userData.history && userData.history.length > 0) {
                    renderRecentActivity(userData.history.slice(0, 3));
                }
            }
        } catch (e) { console.warn("Cache error", e); }
    }

    // Parse referrer from start_param
    // Bot sends: ?start=ref_XXXXXX (referral code format)
    // Support both new format (ref_XXXXXX) and old format (numeric userId)
    let referrer = null;
    if (_startParam) {
        const raw = String(_startParam).trim();
        // Pass the full referral code to the API
        // The API will handle both ref_XXXXXX codes and numeric userIds
        if (raw.startsWith('ref_')) {
            referrer = raw; // Keep full code like ref_QMD2UE
        } else if (/^\d+$/.test(raw) && raw !== String(currentUserId)) {
            // Pure numeric userId as start_param (legacy support)
            referrer = raw;
        }
    }

    try {
        let res;
        if (window._isRegistered) {
            res = await apiFetch(`/api/user/sync/${userData.id}`);
        } else {
            res = await apiFetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userData.id,
                    firstName: _tgUser.first_name || '',
                    lastName: _tgUser.last_name || '',
                    username: _tgUser.username || '',
                    photo_url: _tgUser.photo_url || '',
                    referrer: referrer
                })
            });
        }
        const data = await res.json();

        if (data.success) {
            window._isRegistered = true; // Mark as registered after first success
            // Sync from server
            userData.tokens = data.tokens || data.balance_tokens || 0;
            // Gems — take max of all possible fields to prevent loss
            const regGems = Math.max(
                parseFloat(data.balance_Gems || 0),
                parseFloat(data.Gems || 0),
                parseFloat(data.gems || 0)
            );
            userData.Gems = regGems;
            userData.usd = (data.usd !== undefined && data.usd !== null) ? data.usd : 0;
            userData.verified = data.verified || false;
            userData.adminVerified = data.adminVerified || false;
            userData.role = data.role || userData.role || 'user';
            userData.apiStatus = data.apiStatus || 'allow';

            // SOFT API KEY SYNC: Trust the server if it explicitly sends a key, 
            // but NEVER wipe a local key if the server just says null (could be sync lag).
            if (data.hasOwnProperty('apiKey')) {
                if (data.apiKey) {
                    userData.apiKey = data.apiKey;
                    console.log("[API_SYNC] Synced key from server:", data.apiKey.substring(0, 8) + '...');
                    const modalDisplay = document.getElementById('modalApiKeyDisplay');
                    const pageDisplay = document.getElementById('userApiKeyDisplay');
                    if (modalDisplay && modalDisplay.value !== data.apiKey) modalDisplay.value = data.apiKey;
                    if (pageDisplay && pageDisplay.value !== data.apiKey) pageDisplay.value = data.apiKey;

                    const modalRegenBtn = document.getElementById('modalRegenBtn');
                    const pageRegenBtn = document.getElementById('regenerateApiKeyBtn');
                    if (modalRegenBtn) { modalRegenBtn.innerHTML = '<i class="fas fa-sync-alt"></i> GENERATE KEY'; modalRegenBtn.classList.remove('pulse-btn'); }
                    if (pageRegenBtn) { pageRegenBtn.innerHTML = '<i class="fas fa-sync-alt"></i> GENERATE KEY'; pageRegenBtn.classList.remove('pulse-btn'); }
                } else {
                    // Server returned null. ONLY wipe if we don't have one locally 
                    // OR if we want to trust server's empty state after a delay.
                    // For now, let's keep local key to prevent "Generate" prompt flickering.
                    if (!userData.apiKey) {
                        userData.apiKey = null;
                        console.log("[API_SYNC] Server reported NO key. Local was already empty.");
                    } else {
                        console.warn("[API_SYNC] Server reported NO key, but keeping local key to prevent loss.");
                    }
                }
            }
            userData.dailyStreak = data.dailyStreak || 0;
            userData.lastDailyClaim = data.lastClaim || 0;
            userData.completedTasks = data.completedTasks || [];
            userData.invites = data.invites || 0;
            userData.firstName = _tgUser.first_name || data.firstName || data.username || 'User';
            userData.username = _tgUser.username || data.username || userData.firstName;
            userData.photo_url = _tgUser.photo_url || data.photo_url || '';
            userData.banned = data.banned || false;
            userStatus = data.banned ? 'banned' : 'active';

            // Sync purchasedAccounts for free item "Claimed" detection
            if (data.purchasedAccounts) {
                userData.purchasedAccounts = data.purchasedAccounts;
                try { localStorage.setItem(`purchasedAccounts_${userData.id}`, JSON.stringify(data.purchasedAccounts)); } catch (e) { }
            } else {
                // Load from localStorage cache
                try {
                    const cached = localStorage.getItem(`purchasedAccounts_${userData.id}`);
                    if (cached) userData.purchasedAccounts = JSON.parse(cached);
                } catch (e) { }
            }

            // Mark completed tasks locally
            if (userData.completedTasks.length > 0) {
                userData.completedTasks.forEach(taskId => {
                    IN_PROGRESS_TASKS[taskId] = 'completed';
                });
            }

            // 💾 PERSIST TO LOCAL STORAGE FOR INSTANT UI NEXT TIME
            localStorage.setItem(`userData_${userData.id}`, JSON.stringify(userData));

            updateProfileStatusIcons();
            applyProfilePhoto(userData.photo_url);
            renderBalances();
            loadRecentActivity(); // Load real activity data
            loadNotifications(); // Load user notifications

            // Visibility of Admin Menu
            const adminMenuItem = document.getElementById('adminMenuItem');
            // adminMenuItem.style.display = userData.adminVerified ? 'flex' : 'none';

            if (currentPage === 'daily') {
                renderDailyGrid();
                startDailyCountdown();
            }

            // Show any pending Web Messages from Admin Reply
            // Removed direct popup to respect notification center routing

            // Sync user notifications list & unread badge
            loadNotifications();
        } else {
            applyProfilePhoto(_tgUser.photo_url || '');
            renderBalances();
            loadNotifications();
        }
    } catch (err) {
        console.warn('Register API error (offline?):', err);
        applyProfilePhoto(_tgUser.photo_url || '');
        renderBalances();
    }
}

// Legacy alias kept for compatibility
function fetchUserData() { registerAndFetchUser(); }

let _lastRenderedHistoryHash = '';

// Load and render real recent activity from user history
function loadRecentActivity(force = false) {
    if (!userData.id || userData.id === 0) return;

    apiFetch(`/api/history/${userData.id}?t=${Date.now()}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.history) {
                userData.history = data.history;
                const newHash = JSON.stringify(data.history);
                if (force || newHash !== _lastRenderedHistoryHash) {
                    _lastRenderedHistoryHash = newHash;
                    renderRecentActivity(data.history.slice(0, 3));
                }
                if (currentPage === 'history') {
                    renderFullHistory();
                }
            } else {
                const cachedHistory = userData.history || [];
                renderRecentActivity(cachedHistory.slice(0, 3));
                if (currentPage === 'history') renderFullHistory();
            }
        })
        .catch(() => {
            const cachedHistory = userData.history || [];
            renderRecentActivity(cachedHistory.slice(0, 3));
            if (currentPage === 'history') renderFullHistory();
        });
}


// ===== PURCHASE SUCCESS MODAL with 7-day policy =====
// Load support username once and cache it
let _supportUsername = '';
async function getSupportUsername() {
    try {
        const res = await apiFetch('/api/support-username');
        const data = await res.json();
        if (data.success && data.username) {
            _supportUsername = data.username;
        }
    } catch (e) { 
        if (!_supportUsername) _supportUsername = 'support'; 
    }
    return _supportUsername || 'support';
}

// Open support link directly without cost
window.openSupportLinkDirectly = async function () {
    const supportUser = await getSupportUsername();
    const supportLink = supportUser.includes('http') ? supportUser : `https://t.me/${supportUser.replace('@', '')}`;
    window.open(supportLink, '_blank');
};

async function showPurchaseSuccessModal(itemName, price, currency) {
    const sym = (currency === 'USD' || currency === 'usd') ? '$' : 'TC';

    const modal = document.createElement('div');
    modal.id = 'purchaseSuccessModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);padding:16px;';
    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:24px;padding:28px 24px;max-width:340px;width:100%;border:2px solid rgba(34,197,94,0.4);text-align:center;">
            <div style="width:70px;height:70px;background:rgba(34,197,94,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <i class="fas fa-check-circle" style="font-size:36px;color:#22c55e;"></i>
            </div>
            <h3 style="color:#22c55e;font-size:20px;font-weight:800;margin:0 0 6px 0;">Purchase Successful!</h3>
            <p style="color:#fff;font-size:15px;font-weight:700;margin:0 0 4px 0;">${itemName || 'Item'}</p>
            <p style="color:#9ca3af;font-size:13px;margin:0 0 20px 0;">Amount: <strong style="color:#f59e0b;">${sym}${price}</strong></p>
            <button onclick="document.getElementById('purchaseSuccessModal').remove()"
                style="width:100%;padding:13px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:#fff;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;">
                OK
            </button>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showPurchaseSuccessModal = showPurchaseSuccessModal;

// Helper: Build history card HTML for account_purchase items
function buildHistoryCardHtml(item) {
    const emailVal = item.email || '';
    const passVal = item.password || '';
    const isCard = emailVal.includes('|');
    const isJsonPass = passVal.startsWith('{');

    let rows = '';
    if (isCard) {
        const parts = emailVal.split('|');
        const cardNum = parts[0] || '';
        const expiry = (parts[1] || 'MM') + '/' + (parts[2] || 'YYYY');
        const cvv = parts[3] || '***';
        const masked = cardNum.length >= 4 ? '**** **** **** ' + cardNum.slice(-4) : cardNum;
        const safeNum = cardNum.replace(/'/g, "\\'");
        rows = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
            '<span style="color:#9ca3af;width:60px;">Card:</span>' +
            '<span style="color:#fff;flex:1;">' + masked + '</span>' +
            '<button onclick="histCopy(\'' + safeNum + '\',this)" style="background:none;border:none;color:#f59e0b;cursor:pointer;padding:2px 4px;font-size:11px;"><i class="fas fa-copy"></i></button>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
            '<span style="color:#9ca3af;width:60px;">Expiry:</span>' +
            '<span style="color:#fff;flex:1;">' + expiry + '</span>' +
            '<button onclick="histCopy(\'' + expiry + '\',this)" style="background:none;border:none;color:#f59e0b;cursor:pointer;padding:2px 4px;font-size:11px;"><i class="fas fa-copy"></i></button>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
            '<span style="color:#9ca3af;width:60px;">CVV:</span>' +
            '<span style="color:#fff;flex:1;">' + cvv + '</span>' +
            '<button onclick="histCopy(\'' + cvv + '\',this)" style="background:none;border:none;color:#f59e0b;cursor:pointer;padding:2px 4px;font-size:11px;"><i class="fas fa-copy"></i></button>' +
            '</div>';
    } else {
        const safeEmail = emailVal.replace(/'/g, "\\'");
        rows = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
            '<span style="color:#9ca3af;width:60px;">Email:</span>' +
            '<span style="color:#fff;flex:1;word-break:break-all;">' + emailVal + '</span>' +
            '<button onclick="histCopy(\'' + safeEmail + '\',this)" style="background:none;border:none;color:#f59e0b;cursor:pointer;padding:2px 4px;font-size:11px;"><i class="fas fa-copy"></i></button>' +
            '</div>';
        if (passVal && !isJsonPass) {
            const safePass = passVal.replace(/'/g, "\\'");
            rows += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
                '<span style="color:#9ca3af;width:60px;">Password:</span>' +
                '<span style="color:#fff;flex:1;word-break:break-all;">' + passVal + '</span>' +
                '<button onclick="histCopy(\'' + safePass + '\',this)" style="background:none;border:none;color:#f59e0b;cursor:pointer;padding:2px 4px;font-size:11px;"><i class="fas fa-copy"></i></button>' +
                '</div>';
        }
    }

    const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
    return '<div style="margin-top:6px; background:rgba(0,0,0,0.3); border-radius:8px; padding:6px 8px; font-size:11px;">' +
        rows +
        '<button onclick=\'reShowCardFromHistory(' + JSON.stringify(item).replace(/'/g, "\\'") + ')\' style="margin-top:4px; width:100%; padding:5px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">' +
        '<i class="fas fa-eye" style="margin-right:4px;"></i> View Card Again' +
        '</button>' +
        '</div>';
}

function renderFullHistory() {
    const list = document.getElementById('fullHistoryList');
    const empty = document.getElementById('historyEmptyState');
    if (!list || !empty) return;

    if (!userData.history || userData.history.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    const POS_TYPES = new Set([
        'transfer_in', 'redeem', 'daily_bonus', 'ad_reward', 'mission_reward', 'quiz_reward',
        'bonus', 'deposit', 'gift_claimed', 'gift', 'apikey_generate', 'referral_reward',
        'referral', 'referral_bonus', 'scratch_reward', 'task', 'bot_hosting_refund',
        'leaderboard_reward', 'promo_code', 'smm_order_refund'
    ]);
    const NEG_TYPES = new Set([
        'transfer_out', 'account_purchase', 'mail', 'temp_mail', 'temp_email', 'premium_mail',
        'premium_email', 'hotmail_email', 'student_email', 'gmail_email', 'mail_renew', 'number',
        'exchange_out', 'support_contact', 'live2fa', 'liveinstagram', 'livefacebook', 'livetiktok',
        'livetwitter', 'livethreads', 'bot_hosting', 'apikey_cost', 'video_download', 'smm_order'
    ]);

    const typeConfig = {
        'apikey_generate': { icon: 'fas fa-key', color: '#9333ea', name: 'API Key Generated' },
        'apikey_cost': { icon: 'fas fa-key', color: '#ec4899', name: 'API Key Cost' },
        'ad_reward': { icon: 'fas fa-play-circle', color: '#f59e0b', name: 'Watch & Earn' },
        'mission_reward': { icon: 'fas fa-check-circle', color: '#22c55e', name: 'Task Completed' },
        'account_purchase': { icon: 'fas fa-shopping-cart', color: '#3b82f6', name: 'Account Purchase' },
        'mail': { icon: 'fas fa-envelope', color: '#ef4444', name: 'Email Generated' },
        'temp_mail': { icon: 'fas fa-envelope-open', color: '#ef4444', name: 'Temp Mail' },
        'temp_email': { icon: 'fas fa-envelope-open', color: '#ef4444', name: 'Temp Mail' },
        'premium_mail': { icon: 'fas fa-crown', color: '#f59e0b', name: 'Premium Mail' },
        'premium_email': { icon: 'fas fa-crown', color: '#f59e0b', name: 'Premium Mail' },
        'hotmail_email': { icon: 'fab fa-microsoft', color: '#3b82f6', name: 'Hotmail Access' },
        'student_email': { icon: 'fas fa-graduation-cap', color: '#10b981', name: 'Student Mail' },
        'gmail_email': { icon: 'fab fa-google', color: '#ef4444', name: 'Gmail Access' },
        'mail_renew': { icon: 'fas fa-sync', color: '#3b82f6', name: 'Email Renewed' },
        'number': { icon: 'fas fa-phone', color: '#9333ea', name: 'Virtual Number' },
        'quiz_reward': { icon: 'fas fa-lightbulb', color: '#f59e0b', name: 'Quiz Reward' },
        'deposit': { icon: 'fas fa-wallet', color: '#22c55e', name: 'Deposit' },
        'redeem': { icon: 'fas fa-ticket-alt', color: '#22c55e', name: 'Code Redeemed' },
        'transfer_in': { icon: 'fas fa-arrow-down', color: '#22c55e', name: 'Received' },
        'transfer_out': { icon: 'fas fa-arrow-up', color: '#ec4899', name: 'Sent' },
        'daily_bonus': { icon: 'fas fa-gift', color: '#fbbf24', name: 'Daily Bonus' },
        'bonus': { icon: 'fas fa-gift', color: '#fbbf24', name: 'Welcome Bonus' },
        'gift_claimed': { icon: 'fas fa-gift', color: '#f59e0b', name: 'Gift Claimed' },
        'gift': { icon: 'fas fa-gift', color: '#f59e0b', name: 'Gift' },
        'exchange': { icon: 'fas fa-exchange-alt', color: '#06b6d4', name: 'Exchange' },
        'exchange_out': { icon: 'fas fa-exchange-alt', color: '#06b6d4', name: 'Exchange' },
        'verification': { icon: 'fas fa-shield-alt', color: '#10b981', name: 'Verification' },
        'support_contact': { icon: 'fas fa-headset', color: '#f59e0b', name: 'Support Contact' },
        'live2fa': { icon: 'fas fa-shield-alt', color: '#22c55e', name: '2FA Live' },
        'liveinstagram': { icon: 'fab fa-instagram', color: '#ec4899', name: 'Instagram Live' },
        'livefacebook': { icon: 'fab fa-facebook-f', color: '#1877f2', name: 'Facebook Live' },
        'livetiktok': { icon: 'fab fa-tiktok', color: '#69c9d0', name: 'TikTok Live' },
        'livetwitter': { icon: 'fab fa-x-twitter', color: '#1da1f2', name: 'Twitter Live' },
        'livethreads': { icon: 'fab fa-threads', color: '#aaaaaa', name: 'Threads Live' },
        'referral_reward': { icon: 'fas fa-user-plus', color: '#22c55e', name: 'Referral Bonus' },
        'referral': { icon: 'fas fa-user-plus', color: '#22c55e', name: 'Referral Bonus' },
        'referral_bonus': { icon: 'fas fa-user-plus', color: '#22c55e', name: 'Referral Bonus' },
        'leaderboard_reward': { icon: 'fas fa-trophy', color: '#ffd700', name: '🏆 Leaderboard Reward' },
        'scratch_reward': { icon: 'fas fa-star', color: '#10b981', name: 'Scratch Reward' },
        'task': { icon: 'fas fa-tasks', color: '#3b82f6', name: 'Task Reward' },
        'bot_hosting': { icon: 'fas fa-server', color: '#ef4444', name: 'Bot Hosting' },
        'bot_hosting_refund': { icon: 'fas fa-undo', color: '#22c55e', name: 'Hosting Refund' },
        'video_download': { icon: 'fas fa-download', color: '#8b5cf6', name: 'Video Download' },
        'smm_order': { icon: 'fas fa-chart-line', color: '#ec4899', name: 'SMM Order' },
        'smm_order_refund': { icon: 'fas fa-undo', color: '#22c55e', name: 'SMM Refund' },
        'promo_code': { icon: 'fas fa-tag', color: '#22c55e', name: 'Promo Code' },
    };

    // Filter account_purchase from Transactions tab — they show in My Purchases
    const filteredHistory = userData.history.filter(item =>
        (item.type || '').toLowerCase() !== 'account_purchase'
    );

    if (filteredHistory.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';

    list.innerHTML = filteredHistory.map(item => {
        const itemType = (item.type || '').toLowerCase();
        const isReferralOrEarn = itemType.includes('refer') || itemType.includes('invite') || itemType.includes('reward') || itemType.includes('bonus') || itemType.includes('deposit') || itemType.includes('refund') || itemType.includes('sale') || itemType.includes('earn');
        let config = typeConfig[itemType] || { icon: 'fas fa-circle', color: '#9ca3af', name: item.type || 'Activity' };

        let imageUrl = '';
        if (itemType === 'account_purchase' && item.category) {
            config = { ...config };
            config.name = (item.category || '').toUpperCase() + ' Card';
            const adminCards = JSON.parse(localStorage.getItem('adminCards') || '[]');
            const card = adminCards.find(c => c.id.toLowerCase() === (item.category || '').toLowerCase());
            if (card && card.imageUrl) {
                imageUrl = card.imageUrl;
            } else {
                const catLower = (item.category || '').toLowerCase();
                if (catLower.includes('gemini')) { config.icon = 'fas fa-gem'; config.color = '#38bdf8'; }
                else if (catLower.includes('spotify')) { config.icon = 'fab fa-spotify'; config.color = '#1db954'; }
                else if (catLower.includes('youtube')) { config.icon = 'fab fa-youtube'; config.color = '#ff0000'; }
                else if (catLower.includes('netflix')) { config.icon = 'fas fa-film'; config.color = '#e50914'; }
                else if (catLower.includes('chatgpt')) { config.icon = 'fas fa-robot'; config.color = '#10b981'; }
            }
        }

        const dateObj = item.date ? new Date(item.date) : new Date();
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const amt = Number(item.amount || 0);
        const isPos = POS_TYPES.has(itemType) || isReferralOrEarn || (amt > 0);
        const isNeg = !isPos && ((amt < 0) || NEG_TYPES.has(itemType));
        const asset = String(item.asset || item.currency || 'TC');
        const isGems = asset.toUpperCase() === 'GEMS';
        const amtColor = isGems ? '#ffd700' : (isPos ? '#22c55e' : (isNeg ? '#ef4444' : '#fff'));

        // Build display value: use stored reward string if present, else compute
        let displayValue = '';
        if (item.reward) {
            displayValue = item.reward;
            if (isPos) {
                displayValue = displayValue.replace(/^[−-]\s*/, '+');
                if (!displayValue.startsWith('+') && !displayValue.startsWith('💎')) displayValue = '+' + displayValue;
            }
        } else if (item.amount !== undefined && item.amount !== null) {
            const sign = isPos ? '+' : (isNeg ? '-' : '');
            const assetLabel = isGems ? '💎 Gems' : asset.toUpperCase();
            displayValue = `${sign}${formatCompact(Math.abs(amt))} ${assetLabel}`;
        }

        // Sub-info line
        let subInfo = '';
        if (item.detail) {
            subInfo = `<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:3px;">${item.detail}</div>`;
        }
        // Exchange: show from→to conversion
        if (itemType === 'exchange' || itemType === 'exchange_out') {
            const fromAmt = item.fromAmount || '';
            const fromAsset = item.exchangeFrom || '';
            const toAmt = item.toAmount || '';
            const toAsset = item.exchangeTo || '';
            if (fromAmt && toAmt) {
                subInfo = `<div style="font-size:10px;color:#06b6d4;margin-top:3px;">${fromAmt} ${String(fromAsset).toUpperCase()} → ${toAmt} ${String(toAsset).toUpperCase()}</div>`;
            }
        }
        // Transfer: show to/from user
        if (itemType === 'transfer_out' && item.toUser) {
            const feeTxt = (item.fee && item.fee > 0) ? ` (fee: ${item.fee} ${asset.toUpperCase()})` : '';
            subInfo = `<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:3px;">To: #${item.toUser}${feeTxt}</div>`;
        } else if (itemType === 'transfer_in' && item.fromUser) {
            subInfo = `<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:3px;">From: #${item.fromUser}</div>`;
        }

        return `
        <div class="activity-card" style="margin-bottom:10px; transition:transform 0.15s; cursor:default;" onmouseenter="this.style.transform='scale(1.01)'" onmouseleave="this.style.transform='scale(1)'">
            <div class="activity-left">
                <div class="activity-icon" style="width:42px;height:42px;background:rgba(255,255,255,0.06);color:${config.color};display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0;border:1px solid rgba(255,255,255,0.08);">
                    ${imageUrl ? `<img src="${imageUrl}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">` : `<i class="${config.icon}" style="font-size:17px;"></i>`}
                </div>
                <div class="activity-info">
                    <div class="activity-name" style="font-size:13px;font-weight:700;color:#fff;">${config.name}</div>
                    <div class="activity-meta" style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">${dateStr} • ${timeStr}</div>
                    ${subInfo}
                    ${(itemType === 'account_purchase' && item.email) ? buildHistoryCardHtml(item) : ''}
                </div>
            </div>
            <div class="activity-reward" style="text-align:right;flex-shrink:0;">
                <div style="font-size:13px;font-weight:800;color:${amtColor};">${displayValue}</div>
            </div>
        </div>`;
    }).join('');
}

// Load broadcast messages with real live user activity data
function loadBroadcast() {
    const track = document.getElementById('broadcastTrack');
    if (!track) return;

    // Default messages with username
    const defaultMessages = [
        '💰 <span class="bcp-user">@Riad</span> Netflix <span style="color:#ef4444; font-weight:700;">-50 TC</span>',
        '⭐ <span class="bcp-user">@Ali</span> Task Reward <span style="color:#22c55e; font-weight:700;">+25 TC</span>',
        '🛒 <span class="bcp-user">@Mamun</span> Spotify <span style="color:#ef4444; font-weight:700;">-40 TC</span>',
        '⭐ <span class="bcp-user">@Karim</span> Referral Bonus <span style="color:#22c55e; font-weight:700;">+50 TC</span>',
        '🔀 <span class="bcp-user">@Hasan</span> Exchanged 100 TC → 1 Gems <span style="color:#06b6d4; font-weight:700;">Exchanged</span>',
        '📧 <span class="bcp-user">@Rahim</span> Temp Mail <span style="color:#ef4444; font-weight:700;">-10 TC</span>',
        '💎 <span class="bcp-user">@Jodu</span> Daily Bonus <span style="color:#22c55e; font-weight:700;">+15 Gems</span>',
        '🚀 <span class="bcp-user">@Kodu</span> ChatGPT <span style="color:#ef4444; font-weight:700;">-15 TC</span>'
    ];

    apiFetch('/api/user-activity')
        .then(r => r.json())
        .then(data => {
            if (data.success && data.activities && data.activities.length > 0) {
                const activityMessages = data.activities.slice(0, 12).map(activity => {
                    let user = activity.username || activity.user || 'User';
                    user = user.replace(/^@/, '');
                    const userSpan = `<span class="bcp-user">@${user}</span>`;

                    const action = activity.action;
                    const item = activity.item || 'Activity';
                    const amount = Math.abs(activity.amount || 0);
                    const currency = activity.currency || 'TC';

                    if (action === 'exchange' || item.toLowerCase().includes('exchange')) {
                        return `🔀 ${userSpan} ${item} <span style="color:#06b6d4; font-weight:700;">Exchanged</span>`;
                    } else if (action === 'reward' || action === 'earn' || action === 'transfer_in') {
                        return `⭐ ${userSpan} ${item} <span style="color:#22c55e; font-weight:700;">+${amount} ${currency}</span>`;
                    } else if (action === 'spend' || action === 'purchase' || action === 'transfer_out') {
                        const shortItem = item.replace('purchased ', '').replace('bought ', '').replace('generated ', '');
                        return `💰 ${userSpan} ${shortItem} <span style="color:#ef4444; font-weight:700;">-${amount} ${currency}</span>`;
                    } else {
                        const sign = amount >= 0 ? '+' : '-';
                        const color = amount >= 0 ? '#22c55e' : '#ef4444';
                        return `🔥 ${userSpan} ${item} <span style="color:${color}; font-weight:700;">${sign}${amount} ${currency}</span>`;
                    }
                });

                track.innerHTML = activityMessages.map(m => `<span class="bcp-item">${m}</span>`).join('');
            } else {
                track.innerHTML = defaultMessages.map(m => `<span class="bcp-item">${m}</span>`).join('');
            }
        })
        .catch(() => {
            track.innerHTML = defaultMessages.map(m => `<span class="bcp-item">${m}</span>`).join('');
        });
}

// Render recent activity cards
function renderRecentActivity(history) {
    const container = document.getElementById('recentActivityList');
    if (!container) return;

    const TYPE_CFG = {
        'apikey_generate': { icon: 'fas fa-key', color: '#9333ea', name: 'API Key Generated' },
        'apikey_cost': { icon: 'fas fa-key', color: '#ec4899', name: 'API Key Cost' },
        'ad_reward': { icon: 'fas fa-play-circle', color: '#f59e0b', name: 'Watch & Earn' },
        'mission_reward': { icon: 'fas fa-check-circle', color: '#22c55e', name: 'Task Completed' },
        'account_purchase': { icon: 'fas fa-shopping-cart', color: '#3b82f6', name: 'Account Purchase' },
        'mail': { icon: 'fas fa-envelope', color: '#ef4444', name: 'Email Generated' },
        'temp_mail': { icon: 'fas fa-envelope-open', color: '#ef4444', name: 'Temp Mail' },
        'temp_email': { icon: 'fas fa-envelope-open', color: '#ef4444', name: 'Temp Mail' },
        'premium_mail': { icon: 'fas fa-crown', color: '#f59e0b', name: 'Premium Mail' },
        'premium_email': { icon: 'fas fa-crown', color: '#f59e0b', name: 'Premium Mail' },
        'hotmail_email': { icon: 'fab fa-microsoft', color: '#3b82f6', name: 'Hotmail Access' },
        'student_email': { icon: 'fas fa-graduation-cap', color: '#10b981', name: 'Student Mail' },
        'gmail_email': { icon: 'fab fa-google', color: '#ef4444', name: 'Gmail Access' },
        'mail_renew': { icon: 'fas fa-sync', color: '#3b82f6', name: 'Email Renewed' },
        'number': { icon: 'fas fa-phone', color: '#9333ea', name: 'Virtual Number' },
        'redeem': { icon: 'fas fa-ticket-alt', color: '#22c55e', name: 'Code Redeemed' },
        'daily_bonus': { icon: 'fas fa-gift', color: '#fbbf24', name: 'Daily Bonus' },
        'bonus': { icon: 'fas fa-gift', color: '#fbbf24', name: 'Welcome Bonus' },
        'verification': { icon: 'fas fa-shield-alt', color: '#10b981', name: 'Verification' },
        'transfer_in': { icon: 'fas fa-arrow-down', color: '#22c55e', name: 'Received' },
        'transfer_out': { icon: 'fas fa-arrow-up', color: '#ec4899', name: 'Sent' },
        'exchange': { icon: 'fas fa-exchange-alt', color: '#06b6d4', name: 'Exchange' },
        'exchange_out': { icon: 'fas fa-exchange-alt', color: '#06b6d4', name: 'Exchange' },
        'gift_claimed': { icon: 'fas fa-gift', color: '#f59e0b', name: 'Gift Claimed' },
        'gift': { icon: 'fas fa-gift', color: '#f59e0b', name: 'Gift' },
        'deposit': { icon: 'fas fa-wallet', color: '#22c55e', name: 'Deposit' },
        'support_contact': { icon: 'fas fa-headset', color: '#f59e0b', name: 'Support Contact' },
        'scratch_reward': { icon: 'fas fa-star', color: '#10b981', name: 'Scratch Reward' },
        'quiz_reward': { icon: 'fas fa-lightbulb', color: '#f59e0b', name: 'Quiz Reward' },
        'referral_reward': { icon: 'fas fa-user-plus', color: '#22c55e', name: 'Referral Bonus' },
        'referral': { icon: 'fas fa-user-plus', color: '#22c55e', name: 'Referral Bonus' },
        'referral_bonus': { icon: 'fas fa-user-plus', color: '#22c55e', name: 'Referral Bonus' },
        'leaderboard_reward': { icon: 'fas fa-trophy', color: '#ffd700', name: '🏆 Leaderboard Reward' },
        'live2fa': { icon: 'fas fa-shield-alt', color: '#22c55e', name: '2FA Live' },
        'liveinstagram': { icon: 'fab fa-instagram', color: '#ec4899', name: 'Instagram Live' },
        'livefacebook': { icon: 'fab fa-facebook-f', color: '#1877f2', name: 'Facebook Live' },
        'livetiktok': { icon: 'fab fa-tiktok', color: '#69c9d0', name: 'TikTok Live' },
        'livetwitter': { icon: 'fab fa-x-twitter', color: '#1da1f2', name: 'Twitter Live' },
        'livethreads': { icon: 'fab fa-threads', color: '#aaaaaa', name: 'Threads Live' },
        'task': { icon: 'fas fa-tasks', color: '#3b82f6', name: 'Task Reward' },
        'promo_code': { icon: 'fas fa-tag', color: '#22c55e', name: 'Promo Code' },
        'bot_hosting': { icon: 'fas fa-server', color: '#ef4444', name: 'Bot Hosting' },
        'bot_hosting_refund': { icon: 'fas fa-undo', color: '#22c55e', name: 'Hosting Refund' },
        'smm_order': { icon: 'fas fa-chart-line', color: '#ec4899', name: 'SMM Order' },
        'smm_order_refund': { icon: 'fas fa-undo', color: '#22c55e', name: 'SMM Refund' },
        'video_download': { icon: 'fas fa-download', color: '#8b5cf6', name: 'Video Download' },
    };

    const POS_SET = new Set([
        'transfer_in', 'redeem', 'daily_bonus', 'ad_reward', 'mission_reward', 'quiz_reward',
        'bonus', 'deposit', 'gift_claimed', 'gift', 'apikey_generate', 'referral_reward',
        'referral', 'referral_bonus', 'smm_order_refund', 'promo_code', 'scratch_reward',
        'leaderboard_reward', 'task', 'bot_hosting_refund'
    ]);
    const NEG_SET = new Set([
        'transfer_out', 'account_purchase', 'mail', 'number', 'support_contact',
        'premium_email', 'temp_email', 'hotmail_email', 'student_email', 'gmail_email',
        'premium_mail', 'temp_mail', 'mail_renew', 'live2fa', 'liveinstagram', 'livefacebook',
        'livetiktok', 'livetwitter', 'livethreads', 'bot_hosting', 'apikey_cost',
        'video_download', 'smm_order', 'exchange_out'
    ]);

    if (!history || history.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-sub);">
                <i class="fas fa-history" style="font-size:28px; opacity:0.2; display:block; margin-bottom:12px;"></i>
                <div style="font-size:13px;">No recent activity</div>
            </div>`;
        return;
    }

    container.innerHTML = history.map(item => {
        const itemType = (item.type || '').toLowerCase();
        let config = TYPE_CFG[itemType] || { icon: 'fas fa-circle', color: '#9ca3af', name: item.type || 'Activity' };

        let imageUrl = '';
        if (itemType === 'account_purchase' && item.category) {
            config = { ...config };
            config.name = (item.category || '').toUpperCase() + ' Card';
            const adminCards = JSON.parse(localStorage.getItem('adminCards') || '[]');
            const card = adminCards.find(c => c.id.toLowerCase() === (item.category || '').toLowerCase());
            if (card && card.imageUrl) {
                imageUrl = card.imageUrl;
            } else {
                const cat = (item.category || '').toLowerCase();
                if (cat.includes('gemini')) { config.icon = 'fas fa-gem'; config.color = '#38bdf8'; }
                else if (cat.includes('spotify')) { config.icon = 'fab fa-spotify'; config.color = '#1db954'; }
                else if (cat.includes('youtube')) { config.icon = 'fab fa-youtube'; config.color = '#ff0000'; }
                else if (cat.includes('netflix')) { config.icon = 'fas fa-film'; config.color = '#e50914'; }
                else if (cat.includes('chatgpt')) { config.icon = 'fas fa-robot'; config.color = '#10b981'; }
            }
        }

        const date = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const time = item.date ? new Date(item.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

        // Fix: mail type with zero amount fallback
        let rawAmt = item.amount;
        if ((itemType === 'mail' || itemType === 'email' || (config.name || '').includes('Mail')) && (!rawAmt || rawAmt === 0)) {
            rawAmt = window.appCostConfig?.mailCost || 10;
        }
        const amt = Number(rawAmt || 0);
        const isReferralOrEarn = itemType.includes('refer') || itemType.includes('invite') || itemType.includes('reward') || itemType.includes('bonus') || itemType.includes('deposit') || itemType.includes('refund') || itemType.includes('sale') || itemType.includes('earn');
        const isPos = POS_SET.has(itemType) || isReferralOrEarn || (amt > 0);
        const isNeg = !isPos && ((amt < 0) || NEG_SET.has(itemType));
        const asset = String(item.asset || item.currency || 'TC');
        const isGems = asset.toUpperCase() === 'GEMS';
        const amtColor = isGems ? '#ffd700' : (isPos ? '#22c55e' : (isNeg ? '#ef4444' : '#fff'));

        // Build reward display
        let rewardDisplay = '';
        if (item.reward) {
            rewardDisplay = item.reward;
            if (isPos) {
                rewardDisplay = rewardDisplay.replace(/^[−-]\s*/, '+');
                if (!rewardDisplay.startsWith('+') && !rewardDisplay.startsWith('💎')) rewardDisplay = '+' + rewardDisplay;
            }
        } else {
            const sign = isPos ? '+' : (isNeg ? '-' : '');
            const assetLabel = isGems ? '💎 Gems' : asset.toUpperCase();
            rewardDisplay = `${sign}${formatCompact(Math.abs(amt))} ${assetLabel}`;
        }

        // Sub-info
        let subInfo = '';
        if (item.detail) {
            subInfo = `<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">${item.detail}</div>`;
        }
        if (itemType === 'transfer_out') {
            const toId = item.toUser || item.to || '';
            const feeInfo = (item.fee && item.fee > 0) ? ` • fee: ${item.fee} ${asset.toUpperCase()}` : '';
            if (toId) subInfo = `<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">To: #${toId}${feeInfo}</div>`;
        } else if (itemType === 'transfer_in') {
            const fromId = item.fromUser || item.from || '';
            if (fromId && typeof fromId === 'string' && fromId.length < 20) {
                subInfo = `<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">From: #${fromId}</div>`;
            }
        } else if (itemType === 'exchange' || itemType === 'exchange_out') {
            const fA = item.fromAmount || '', fC = item.exchangeFrom || '';
            const tA = item.toAmount || '', tC = item.exchangeTo || '';
            if (fA && tA) subInfo = `<div style="font-size:10px;color:#06b6d4;margin-top:2px;">${fA} ${String(fC).toUpperCase()} → ${tA} ${String(tC).toUpperCase()}</div>`;
        }

        return `
        <div class="activity-card" style="transition:transform 0.15s;" onmouseenter="this.style.transform='scale(1.01)'" onmouseleave="this.style.transform='scale(1)'">
            <div class="activity-left">
                <div class="activity-icon" style="width:40px;height:40px;background:rgba(255,255,255,0.06);color:${config.color};display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0;border:1px solid rgba(255,255,255,0.08);">
                    ${imageUrl ? `<img src="${imageUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">` : `<i class="${config.icon}" style="font-size:17px;"></i>`}
                </div>
                <div class="activity-info">
                    <div class="activity-name" style="font-size:13px;font-weight:700;">${config.name}</div>
                    <div class="activity-meta" style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">${date} • ${time}</div>
                    ${subInfo}
                </div>
            </div>
            <div class="activity-reward" style="text-align:right;flex-shrink:0;">
                <div style="font-size:13px;font-weight:800;color:${amtColor};">${rewardDisplay}</div>
            </div>
        </div>`;
    }).join('');
}

function saveWallet() { renderBalances(); }

function updateBalanceUI() { renderBalances(); }

// Helper: Get short name (first 2 words max)
function getShortName(fullName) {
    if (!fullName) return 'Guest';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    // Return first 2 parts for long names like "Riad Al Mamun" -> "Riad Al"
    return parts.slice(0, 2).join(' ');
}

// Check if user is banned and show ban message
function checkBanStatus() {
    if (userData.banned) {
        showBanModal();
        return true;
    }
    return false;
}

// Support loan configuration
const SUPPORT_LOAN_AMOUNT = 10;

// Handle support click with auto deduction (no confirmation)
async function handleSupportClick() {
    const supportUser = await getSupportUsername();
    const supportLink = supportUser.includes('http') ? supportUser : `https://t.me/${supportUser.replace('@', '')}`;

    // Calculate new balance after deduction
    const currentBalance = userData.tokens || 0;
    const newBalance = currentBalance - SUPPORT_LOAN_AMOUNT;

    // Deduct tokens immediately without confirmation (even if it goes negative)
    try {
        const res = await apiFetch('/api/user/deduct-support-loan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                amount: SUPPORT_LOAN_AMOUNT
            })
        });

        const data = await res.json();
        if (data.success) {
            // Update local user data
            userData.tokens = data.newBalance;
            userData.supportLoan = data.supportLoan || 0;

            // Show toast notification
            if (data.supportLoan > 0) {
                window.showToast(`📞 Support: -${SUPPORT_LOAN_AMOUNT} TC (Loan: ${data.supportLoan} TC)`);
            } else {
                window.showToast(`📞 Support: -${SUPPORT_LOAN_AMOUNT} TC deducted`);
            }

            // Update balance display
            renderBalances();
            loadRecentActivity(); // Refresh activity history

            // Open support link
            window.open(supportLink, '_blank');
        } else {
            window.showToast('❌ Failed to process support contact');
        }
    } catch (e) {
        console.error('Support error:', e);
        window.showToast('❌ Network error. Please try again.');
    }
}

// Show ban modal with message
async function showBanModal() {
    // Get support link from backend
    const supportUser = await getSupportUsername();
    const supportLink = supportUser.includes('http') ? supportUser : `https://t.me/${supportUser.replace('@', '')}`;

    const currentBalance = userData.tokens || 0;
    const willTakeLoan = currentBalance < SUPPORT_LOAN_AMOUNT;

    const modalHtml = `
        <div id="banModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; align-items:center; justify-content:center;">
            <div style="background:var(--bg-card); border:2px solid #ef4444; border-radius:20px; padding:30px; max-width:320px; text-align:center; margin:20px;">
                <i class="fas fa-ban" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
                <h2 style="color:#fff; margin-bottom:12px; font-size:20px;">Account Banned</h2>
                <p style="color:var(--text-sub); margin-bottom:20px; line-height:1.5;">
                    You have been banned by the admin.<br>
                    Please contact support for assistance.
                </p>
                ${willTakeLoan ? `<div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:10px; padding:10px; margin-bottom:15px; text-align:left;">
                    <p style="color:#fbbf24; font-size:12px; margin:0;">
                        <i class="fas fa-exclamation-triangle"></i> 
                        <strong>Support Loan:</strong> You have ${currentBalance} TC. 
                        Contacting support costs ${SUPPORT_LOAN_AMOUNT} TC. 
                        Your balance will go to -${SUPPORT_LOAN_AMOUNT - currentBalance} TC.
                    </p>
                </div>` : ''}
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <button onclick="handleSupportClick()" style="background:#3b82f6; color:#fff; border:none; padding:12px 24px; border-radius:10px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-block;">
                        <i class="fas fa-headset"></i> Contact Support (${SUPPORT_LOAN_AMOUNT} TC)
                    </button>
                    <button onclick="closeBanModal()" style="background:transparent; color:#9ca3af; border:1px solid #4b5563; padding:10px 24px; border-radius:10px; font-weight:600; cursor:pointer;">
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('banModal');
    if (existingModal) existingModal.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Close ban modal
function closeBanModal() {
    const modal = document.getElementById('banModal');
    if (modal) modal.remove();
}

// Update profile verification/banned icons
function updateProfileStatusIcons() {
    const verifiedIcons = [
        document.getElementById('prof-verified-icon'),
        document.getElementById('home-verified-icon')
    ];
    const bannedIcons = [
        document.getElementById('prof-banned-icon'),
        document.getElementById('home-banned-icon')
    ];

    verifiedIcons.forEach(icon => {
        if (!icon) return;
        if (userData.banned) {
            icon.style.display = 'none';
        } else if (userData.adminVerified) {
            icon.style.display = 'inline-block';
            icon.className = 'fas fa-check-circle'; // Facebook style tick
            icon.style.color = '#1877F2'; // Facebook Blue
            icon.style.filter = 'drop-shadow(0 0 2px rgba(24, 119, 242, 0.4))';
            icon.style.fontSize = '18px';
            icon.style.marginLeft = '4px';
            icon.title = 'Admin Verified Account';
        } else if (userData.verified) {
            icon.style.display = 'inline-block';
            icon.className = 'fas fa-check-circle';
            icon.style.color = '#22c55e'; // Standard Green
            icon.style.filter = 'none';
            icon.style.fontSize = '16px';
            icon.style.marginLeft = '4px';
        } else {
            icon.style.display = 'none';
        }
    });

    bannedIcons.forEach(icon => {
        if (!icon) return;
        icon.style.display = userData.banned ? 'inline-block' : 'none';
    });
}

function formatCompact(num) {
    if (typeof num !== 'number') num = parseFloat(num) || 0;
    if (num < 1000) {
        // Always show whole number for balances — no decimals for sub-1000
        return Math.floor(num).toString();
    }

    const exp = Math.floor(Math.log10(num) / 3);
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Q'];
    const suffix = suffixes[exp] || '';
    const shortValue = (num / Math.pow(1000, exp));

    // One decimal if it's not a whole number in compact view
    const formatted = Math.abs(shortValue % 1) < 0.01 ? Math.round(shortValue).toString() : shortValue.toFixed(1);
    return formatted + suffix;
}

function renderBalances() {
    const isRestrictedGuest = featureFlags?.requireTelegram === true && isDemoMode;
    const tokens = isRestrictedGuest ? 0 : Math.max(0, userData.tokens || 0);
    const gems = isRestrictedGuest ? 0 : Math.max(0, userData.Gems || 0);
    const usd = isRestrictedGuest ? 0 : Math.max(0, userData.usd || 0);

    const rawName = userData.firstName || userData.username || _tgUser.first_name || 'Guest';
    const displayName = getShortName(rawName);

    const formattedTokens = formatCompact(tokens);
    const formattedGems = formatCompact(gems);


    // USD display using central formatter — $0, $1, $1.50 (no trailing zeros)
    let formattedUsd;
    if (usd >= 1000) {
        formattedUsd = '$' + formatCompact(usd);
    } else {
        formattedUsd = formatUsd(usd);
    }


    // 1. Update Profile Stats
    const elTc = document.getElementById('prof-tc');
    const elJs = document.getElementById('prof-js');
    const elUsd = document.getElementById('prof-usd');
    const elProfName = document.getElementById('prof-name');
    const elProfId = document.getElementById('prof-id');

    if (elTc) elTc.innerText = formattedTokens;
    if (elJs) elJs.innerText = formattedGems;
    if (elUsd) elUsd.innerText = formattedUsd;
    if (elProfName) elProfName.innerText = displayName;
    if (elProfId) elProfId.innerText = '#' + (isRestrictedGuest ? '0000' : userData.id);

    // 2. Update Home Page Stats
    const hTc = document.getElementById('home-tc');
    const hJs = document.getElementById('home-js');
    const hUsd = document.getElementById('home-usd');
    const hName = document.getElementById('home-name');

    if (hTc) hTc.innerText = formattedTokens;
    if (hJs) hJs.innerText = formattedGems;
    if (hUsd) hUsd.innerText = formattedUsd;
    if (hName) hName.innerText = displayName;

    // 3. Update Service Page Balance Displays
    // Temp Mail (TC)
    const tempMailBal = document.getElementById('tempMailBalanceDisplay');
    if (tempMailBal) tempMailBal.innerText = formattedTokens + ' TC';

    // Premium Mail (TC)
    const premiumMailBal = document.getElementById('premiumMailBalanceDisplay');
    if (premiumMailBal) premiumMailBal.innerText = formattedTokens + ' TC';

    // Hotmail (TC)
    const hotMailBal = document.getElementById('hotMailBalanceDisplay');
    if (hotMailBal) hotMailBal.innerText = formattedTokens + ' TC';

    // Live Services Balance Displays
    const live2faBal = document.getElementById('live2faBalanceDisplay');
    if (live2faBal) live2faBal.innerText = formattedTokens + ' TC';

    const liveInstaBal = document.getElementById('liveInstagramBalanceDisplay');
    if (liveInstaBal) liveInstaBal.innerText = formattedTokens + ' TC';

    const liveFbBal = document.getElementById('liveFacebookBalanceDisplay');
    if (liveFbBal) liveFbBal.innerText = formattedTokens + ' TC';

    const liveTiktokBal = document.getElementById('liveTiktokBalanceDisplay');
    if (liveTiktokBal) liveTiktokBal.innerText = formattedTokens + ' TC';

    const liveTwitterBal = document.getElementById('liveTwitterBalanceDisplay');
    if (liveTwitterBal) liveTwitterBal.innerText = formattedTokens + ' TC';

    const liveThreadsBal = document.getElementById('liveThreadsBalanceDisplay');
    if (liveThreadsBal) liveThreadsBal.innerText = formattedTokens + ' TC';

    // Student Mail (TC)
    const studentMailBal = document.getElementById('studentMailBalanceDisplay');
    if (studentMailBal) studentMailBal.innerText = formattedTokens + ' TC';

    // Accounts Store (USD)
    const accStoreBal = document.getElementById('accountsStoreBalanceDisplay');
    if (accStoreBal) accStoreBal.innerText = formattedUsd;

    // VPN Services (USD) — VPN uses $ balance
    const vpnBal = document.getElementById('vpnServicesBalanceDisplay');
    if (vpnBal) vpnBal.innerText = formatUsd(usd);

    // VCC Cards (TC)
    const vccBal = document.getElementById('vccCardsBalanceDisplay');
    if (vccBal) vccBal.innerText = formattedTokens + ' TC';

    // Exchange page balances
    const exTokens = document.getElementById('exBalTokens');
    if (exTokens) exTokens.textContent = (tokens).toString();
    const exGems = document.getElementById('exBalGems');
    if (exGems) exGems.textContent = (gems).toString();
    const exUsd = document.getElementById('exBalUsd');
    if (exUsd) exUsd.textContent = formatUsd(usd);

    // Transfer page balances
    const tfTokens = document.getElementById('tfBalTokens');
    if (tfTokens) tfTokens.textContent = (tokens).toString();
    const tfGems = document.getElementById('tfBalGems');
    if (tfGems) tfGems.textContent = (gems).toString();
    const tfUsd = document.getElementById('tfBalUsd');
    if (tfUsd) tfUsd.textContent = formatUsd(usd);

    // Instagram SMM Panel (Gems)
    const smmGems = document.getElementById('smmGemsDisplay');
    if (smmGems) smmGems.innerText = formattedGems;

    // Website Traffic Panel (Gems)
    const trafficGems = document.getElementById('trafficUserGems');
    if (trafficGems) trafficGems.innerText = formattedGems + ' Gems';

    // Live SMS Bot Panel (TC and Gems)
    const lsbUserBalance = document.getElementById('lsbUserBalance');
    if (lsbUserBalance) lsbUserBalance.innerText = formattedTokens + ' TC';
    const lsbGemBalance = document.getElementById('lsbGemBalance');
    if (lsbGemBalance) lsbGemBalance.innerText = formattedGems + ' 💎';
}



// Copy User ID to clipboard with visual feedback
function copyUserId() {
    const uid = String(userData.id || '');
    if (!uid) return;
    try {
        navigator.clipboard.writeText(uid).then(() => {
            const icon = document.getElementById('copy-id-icon');
            const btn = document.getElementById('copy-id-btn');
            if (icon) { icon.className = 'fas fa-check-circle'; icon.style.color = '#22c55e'; }
            if (btn) btn.style.background = 'rgba(34,197,94,0.2)';
            setTimeout(() => {
                if (icon) { icon.className = 'fas fa-copy'; icon.style.color = '#f59e0b'; }
                if (btn) btn.style.background = 'rgba(255,255,255,0.12)';
            }, 2000);
        });
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = uid;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

// Transfer System logic
async function transferTokens() {
    const targetUserId = document.getElementById('transferToUser').value.trim();
    const amountOrig = document.getElementById('transferAmount').value;
    const amount = parseFloat(amountOrig);
    const assetType = document.getElementById('transferAssetType').value; // 'tokens', 'usd', 'Gems'

    if (!targetUserId || isNaN(amount) || amount <= 0) {
        window.showToast("Please enter a valid User ID and amount.");
        return;
    }

    if (String(targetUserId) === String(userData.id)) {
        window.showToast("You cannot transfer to yourself.");
        return;
    }

    // Calculate fee — USD has 0% fee always
    const costs = JSON.parse(localStorage.getItem('adminCosts') || '{}');
    const feePercent = assetType === 'usd' ? 0 : (parseFloat(costs.transferFee) || 5);
    const feeAmount = assetType === 'usd' ? 0 : Math.ceil(amount * feePercent / 100);
    const receiverAmount = amount - feeAmount;

    const assetNames = { tokens: 'Tokens', usd: 'USD', Gems: 'Gems' };
    const currLabel = assetType === 'usd' ? 'USD' : assetType === 'Gems' ? '💎' : 'TC';
    const feeText = feePercent === 0
        ? `<div style="color:#22c55e; font-size:12px; margin-bottom:4px;">✅ No transfer fee for USD</div>`
        : `<div style="color:#f59e0b; font-size:12px; margin-bottom:4px;">Fee: ${feeAmount} ${currLabel} (${feePercent}%)</div>`;

    const overlay = document.createElement('div');
    overlay.style = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML = `
        <div style="background:#1a100a;border:1px solid rgba(245,158,11,0.3);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center;">
            <div style="color:#22c55e;font-size:36px;margin-bottom:12px;"><i class="fas fa-paper-plane"></i></div>
            <h3 style="color:#fff;margin:0 0 8px 0;font-size:20px;">Confirm Transfer</h3>
            <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:14px; margin-bottom:16px; text-align:left;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="color:rgba(255,255,255,0.6);font-size:13px;">You send:</span>
                    <span style="color:#fff;font-weight:700;">${assetType === 'usd' ? formatUsd(amount) : amount + ' ' + currLabel}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="color:rgba(255,255,255,0.6);font-size:13px;">Receiver gets:</span>
                    <span style="color:#22c55e;font-weight:800;font-size:15px;">${assetType === 'usd' ? formatUsd(receiverAmount) : receiverAmount + ' ' + currLabel}</span>
                </div>
                ${feeText}
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:rgba(255,255,255,0.6);font-size:13px;">To User:</span>
                    <span style="color:#f59e0b;font-weight:700;">#${targetUserId}</span>
                </div>
            </div>
            <div style="display:flex;gap:10px;">
                <button id="cancelTrxBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:rgba(255,255,255,0.1);color:#fff;font-weight:bold;cursor:pointer;">CANCEL</button>
                <button id="confirmTrxBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:#22c55e;color:#fff;font-weight:bold;cursor:pointer;">SEND ✈️</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('cancelTrxBtn').onclick = () => overlay.remove();
    document.getElementById('confirmTrxBtn').onclick = async () => {
        overlay.remove();
        try {
            const response = await apiFetch('/api/user/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromUserId: userData.id,
                    toUserId: targetUserId,
                    amount: amount,
                    asset: assetType
                })
            });

            const res = await response.json();
            if (res.success) {
                window.showToast(res.message || "Transfer successful!", "success");
                // Update local user data
                if (res.newBalances) {
                    userData.tokens = res.newBalances.tokens;
                    userData.Gems = res.newBalances.Gems;
                    userData.usd = res.newBalances.usd;
                    renderBalances();
                    loadRecentActivity(); // Refresh history after transfer
                }
                // Clear inputs
                document.getElementById('transferToUser').value = '';
                document.getElementById('transferAmount').value = '';
                // Nav back to profile
                setTimeout(() => nav('profile'), 2000);
            } else {
                window.showToast(res.message || "Transfer failed.");
            }
        } catch (e) {
            console.error("Transfer error:", e);
            window.showToast("Server error during transfer.");
        }
    };
}

// Transfer real-time preview
function updateTransferPreview() {
    const amtEl = document.getElementById('transferAmount');
    const assetEl = document.getElementById('transferAssetType');
    const preview = document.getElementById('transferPreview');
    if (!amtEl || !assetEl || !preview) return;

    const amount = parseFloat(amtEl.value) || 0;
    const asset = assetEl.value || 'tokens';

    if (amount <= 0) { preview.style.display = 'none'; return; }

    // USD = 0% fee, others = 5%
    const costs = JSON.parse(localStorage.getItem('adminCosts') || '{}');
    const feePercent = asset === 'usd' ? 0 : (parseFloat(costs.transferFee) || 5);
    const fee = asset === 'usd' ? 0 : Math.ceil(amount * feePercent / 100);
    const receives = amount - fee;

    const currLabel = asset === 'usd' ? '' : (asset === 'Gems' ? ' 💎' : ' TC');
    const fmtAmt = asset === 'usd' ? formatUsd(amount) : formatCompact(amount) + currLabel;
    const fmtReceive = asset === 'usd' ? formatUsd(receives) : formatCompact(receives) + currLabel;
    const fmtFee = asset === 'usd' ? 'FREE ✅' : (fee > 0 ? `-${fee}${currLabel} (${feePercent}%)` : 'None');

    const sendEl = document.getElementById('tpSendAmt');
    const feeEl = document.getElementById('tpFeeAmt');
    const rcvEl = document.getElementById('tpReceiveAmt');
    const feeRow = document.getElementById('tpFeeRow');

    if (sendEl) sendEl.textContent = fmtAmt;
    if (feeEl) { feeEl.textContent = fmtFee; feeEl.style.color = asset === 'usd' ? '#22c55e' : '#f59e0b'; }
    if (rcvEl) { rcvEl.textContent = fmtReceive; rcvEl.style.color = '#22c55e'; }
    if (feeRow) feeRow.style.display = asset === 'usd' ? 'flex' : 'flex';
    preview.style.display = 'block';
}
window.updateTransferPreview = updateTransferPreview;

function payWithBalance() {
    if (userData.usd >= 3.00) {
        // Process directly without confirmation
        window.showToast('Purchase request sent to server!');
    } else {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        window.showToast('Insufficient Balance (' + formatUsd(userData.usd) + '). Please deposit funds.');
    }
}

function selectPM(method) {
    if (method === 'binance') nav('binancePay');
    if (method === 'faucet') nav('faucetPay');
}

// =============================================
// DYNAMIC SERVICES & SHOP SYSTEM
// =============================================

// Default data (used if admin hasn't set anything yet)
const defaultServices = [
    { id: 'verify', name: 'Verification', desc: 'Get verified badge', icon: 'fas fa-check-circle', color: '#166534,#15803d', cost: 20, page: 'verify' },
    { id: 'gemini', name: 'Gemini Card', desc: 'Generate custom cards', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Google_Gemini_logo.svg/60px-Google_Gemini_logo.svg.png', color: '#1e3a5f,#2563eb', cost: 10, page: 'serviceGenerate', serviceKey: 'gemini' },
    { id: 'chatgpt', name: 'ChatGPT', desc: 'AI Assistant Access', icon: 'fas fa-robot', color: '#7c3f00,#d97706', cost: 15, page: 'serviceGenerate', serviceKey: 'chatgpt' },
    { id: 'mail', name: 'Mail Service', desc: 'Temporary email inbox', icon: 'fas fa-envelope', color: '#7f1d1d,#dc2626', cost: 10, page: 'mailService' },
];

// Admin-configurable runtime config (filled from /api/admin/costs when possible)
window.appCostConfig = window.appCostConfig || {
    adReward: 5,
    zeroBalanceAdReward: 5,
    mailCost: 10,
    premiumMailCost: 50,
    hotMailCost: 15,
    studentMailCost: 20
};

async function loadAppCostConfig() {
    try {
        const res = await apiFetch('/api/admin/costs');
        const data = await res.json();
        if (!data?.success || !data.costs) return;
        const c = data.costs;
        window.appCostConfig.adReward = parseInt(c.adReward) || 5;
        window.appCostConfig.zeroBalanceAdReward = parseInt(c.zeroBalanceAdReward) || 5;
        window.appCostConfig.mailCost = parseInt(c.mailCost) || 10;
        // Premium mail cost uses token-based cost if present; otherwise fallback to 50
        window.appCostConfig.premiumMailCost = parseInt(c.premiumMailCost || c.gmailCost || 0) || 50;
        // Hot mail cost
        window.appCostConfig.hotMailCost = parseInt(c.hotMailCost) || 15;
        // Student mail cost
        window.appCostConfig.studentMailCost = parseInt(c.studentMailCost) || 20;

        const tempBadge = document.getElementById('tempMailCostBadge');
        if (tempBadge) tempBadge.textContent = `${window.appCostConfig.mailCost} TC / Email`;
        const premBadge = document.getElementById('premiumMailCostBadge');
        if (premBadge) premBadge.textContent = `${window.appCostConfig.premiumMailCost} TC / Email`;
        const hotBadge = document.getElementById('hotMailCostBadge');
        if (hotBadge) hotBadge.textContent = `${window.appCostConfig.hotMailCost} TC / Email`;
        const studentBadge = document.getElementById('studentMailCostBadge');
        if (studentBadge) studentBadge.textContent = `${window.appCostConfig.studentMailCost} TC / Email`;
    } catch (e) {
        // silent
    }
}

// Global state syncer for real-time updates from admin
var _lastSyncTime = 0;
var _lastUserSyncTime = 0;

async function smartSync(force = false) {
    const now = Date.now();
    if (!force && now - _lastSyncTime < 5000) return; // Minimum 5s between syncs (was 2s)

    _lastSyncTime = now;

    // Always sync admin config (features, services, costs)
    const adminSyncPromises = [
        typeof loadFeatureFlags === 'function' ? loadFeatureFlags() : Promise.resolve(),
        typeof syncAdminData === 'function' ? syncAdminData() : Promise.resolve()
    ];

    // Sync user balance every 15 seconds for real-time balance updates
    if (force || (now - _lastUserSyncTime > 15000)) {
        _lastUserSyncTime = now;
        if (userData.id && userData.id !== 0) {
            adminSyncPromises.push(
                apiFetch(`/api/user/${userData.id}?t=${now}`, { cache: 'no-store' })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success && data.user) {
                            const u = data.user;
                            // Only update if server value differs (prevent flicker)
                            if (typeof u.balance_tokens === 'number') userData.tokens = Math.max(0, u.balance_tokens);
                            // Gems — check all possible field names server may send
                            const serverGems = typeof u.balance_Gems === 'number' ? u.balance_Gems
                                : typeof u.Gems === 'number' ? u.Gems
                                    : typeof u.gems === 'number' ? u.gems
                                        : null;
                            if (serverGems !== null) userData.Gems = Math.max(0, serverGems);
                            if (typeof u.usd !== 'undefined') userData.usd = Math.max(0, u.usd || 0);
                            if (typeof u.banned !== 'undefined') {
                                userData.banned = u.banned;
                                userStatus = u.banned ? 'banned' : 'active';
                            }
                            if (u.apiKey !== undefined) {
                                if (u.apiKey) userData.apiKey = u.apiKey;
                            }
                            if (u.apiStatus) userData.apiStatus = u.apiStatus;
                            renderBalances();
                            // Persist to cache
                            try { localStorage.setItem(`userData_${userData.id}`, JSON.stringify(userData)); } catch (e) { }
                        }
                    })
                    .catch(() => { /* silent – no network = keep cached */ })
            );
        }
    }

    return Promise.allSettled(adminSyncPromises).catch(() => { });
}

// Start auto-syncer (every 5 seconds – balanced for real-time feel without hammering server)
setInterval(() => smartSync(), 5000);


// Load cost config & ad networks early
function initAdNetworks() {
    apiFetch('/api/ads/config')
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            const ads = data.ads || {};

            // 1. Google AdSense Auto Ads
            const adsense = ads['adsense'];
            if (adsense && adsense.enabled && adsense.publisherId) {
                const pubId = adsense.publisherId.trim();
                if (pubId && !document.getElementById('adsense-global-sdk')) {
                    const s = document.createElement('script');
                    s.id = 'adsense-global-sdk';
                    s.async = true;
                    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}`;
                    s.crossOrigin = 'anonymous';
                    document.head.appendChild(s);
                }
            }

            // 2. Monetag / MoneyTag Global Script
            const monetag = ads['moneytag'] || ads['monetag'];
            if (monetag && monetag.enabled && (monetag.publisherId || monetag.adUnitId)) {
                const zoneId = (monetag.publisherId || monetag.adUnitId).trim();
                if (zoneId && !document.getElementById('monetag-global-sdk')) {
                    const s = document.createElement('script');
                    s.id = 'monetag-global-sdk';
                    s.src = '//libtl.com/sdk.js';
                    s.setAttribute('data-zone', zoneId);
                    s.setAttribute('data-sdk', 'show_' + zoneId);
                    document.head.appendChild(s);
                }
            }

            // 3. Adsterra Global Script
            const adsterra = ads['adsterra'];
            if (adsterra && adsterra.enabled && (adsterra.adUnitId || adsterra.publisherId)) {
                const zoneId = (adsterra.adUnitId || adsterra.publisherId).trim();
                if (zoneId && !document.getElementById('adsterra-global-sdk')) {
                    const s = document.createElement('script');
                    s.id = 'adsterra-global-sdk';
                    s.async = true;
                    s.src = `//www.highperformanceformat.com/${zoneId}/invoke.js`;
                    document.head.appendChild(s);
                }
            }
        })
        .catch(() => { });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadAppCostConfig();
        initAdNetworks();
    });
} else {
    loadAppCostConfig();
    initAdNetworks();
}

const defaultShopItems = [
    { id: 'gemini1y', name: 'GEMINI 1 YEAR', price: '$3.00', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Google_Gemini_logo.svg/200px-Google_Gemini_logo.svg.png', bgColor: '#0d0d0d', btnColor: '#f59e0b', page: 'deposit' },
    { id: 'chatgptplus', name: 'CHATGPT PLUS', price: '$5.00', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ChatGPT_logo.svg/200px-ChatGPT_logo.svg.png', bgColor: '#0d0d0d', btnColor: '#22c55e', page: 'deposit' },
];

function getServices() {
    // Return cached or default for immediate render, then update from server
    const saved = localStorage.getItem('adminServices');
    return saved ? JSON.parse(saved) : defaultServices;
}

function getShopItems() {
    const saved = localStorage.getItem('adminShopItems');
    return saved ? JSON.parse(saved) : defaultShopItems;
}

// Fetch from backend and update UI
function syncAdminData() {
    window._lastSyncTime = Date.now();
    // Sync features too
    loadFeatureFlags();

    // Sync public config (botName, supportLink, channels)
    apiFetch('/api/public/config')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                if (data.supportLink) _supportUsername = data.supportLink;
                if (data.botName) {
                    globalBotName = data.botName;
                    if (typeof updateAllBotNames === 'function') updateAllBotNames();
                }
                if (!window.appCostConfig) window.appCostConfig = {};
                if (data.requiredChannel) window.appCostConfig.requiredChannel = data.requiredChannel;
                if (data.requiredGroup) window.appCostConfig.requiredGroup = data.requiredGroup;
                if (data.supportLink) window.appCostConfig.supportLink = data.supportLink;
                if (data.autoFolderLink) window.appCostConfig.autoFolderLink = data.autoFolderLink;
            }
        })
        .catch(() => { });

    // Sync services
    apiFetch('/api/public/services')
        .then(r => r.json())
        .then(data => {
            if (data.success && data.services) {
                localStorage.setItem('adminServices', JSON.stringify(data.services));
                renderServicesList();
            }
        });

    // Sync shop items
    apiFetch('/api/shop')
        .then(r => r.json())
        .then(data => {
            if (data.success && data.shopItems) {
                localStorage.setItem('adminShopItems', JSON.stringify(data.shopItems));
            }
        });

    // Sync costs/rewards
    apiFetch('/api/public/costs')
        .then(r => r.json())
        .then(data => {
            if (data.success && data.costs) {
                localStorage.setItem('adminCosts', JSON.stringify(data.costs));
                window.ADMIN_CONFIG = data.costs;

                const c = data.costs || {};

                // Update global exchange rates from server config
                if (c.usdToToken) exchangeRates.usd_to_tokens = parseInt(c.usdToToken) || 100000;
                if (c.usdToGems) exchangeRates.usd_to_gems = parseInt(c.usdToGems) || 1000;
                if (c.gemToToken) exchangeRates.Gems_to_tokens = parseInt(c.gemToToken) || 100;

                // ── Update appConfig from server costs ────────────────────
                // public/costs returns 'inviteBonus' (mapped from refBonus)
                if (c.refBonus !== undefined) appConfig.inviteBonus = parseInt(c.refBonus) || 50;
                else if (c.inviteBonus !== undefined) appConfig.inviteBonus = parseInt(c.inviteBonus) || 50;
                if (c.dailyReward !== undefined) appConfig.dailyReward = parseInt(c.dailyReward) || 10;
                if (c.taskReward !== undefined) appConfig.dailyReward = parseInt(c.taskReward) || 10;
                if (c.welcomeBonus !== undefined) appConfig.welcomeBonus = parseInt(c.welcomeBonus) || 100;

                // ── Update all invite/referral UI elements ────────────────
                if (typeof updateInviteUI === 'function') updateInviteUI();
                const inviteRewardEl = document.getElementById('inviteRewardAmount');
                if (inviteRewardEl) {
                    const currency = c.inviteCurrency || 'token';
                    let label = 'Tokens';
                    if (currency === 'Gems') label = 'Gems';
                    else if (currency === 'usd') label = 'USD';
                    else if (currency === 'both') label = `Tokens + ${c.inviteBonusGems || 0} Gems`;
                    inviteRewardEl.textContent = `${appConfig.inviteBonus} ${label}`;
                }
                // Update any data-invite-bonus attributes
                document.querySelectorAll('[data-invite-bonus]').forEach(el => {
                    const currency = c.inviteCurrency || 'token';
                    let label = 'TC';
                    if (currency === 'Gems') label = 'Gems';
                    else if (currency === 'usd') label = '$';
                    else if (currency === 'both') label = `TC + ${c.inviteBonusGems || 0} Gems`;
                    el.textContent = `${appConfig.inviteBonus} ${label}`;
                });

                const getCurrencyLabel = (val) => {
                    if (val === 'Gems' || val === 'gem') return 'Gems';
                    if (val === 'usd' || val === 'USD') return 'USD';
                    return 'TC';
                };

                if (document.getElementById('cost-live2fa')) document.getElementById('cost-live2fa').innerText = `${c.live2fa || 10} ${getCurrencyLabel(c.live2faCurrency)} / Request`;
                if (document.getElementById('cost-liveInstagram')) document.getElementById('cost-liveInstagram').innerText = `${c.liveInstagram || 10} ${getCurrencyLabel(c.liveInstagramCurrency)} / Request`;
                if (document.getElementById('cost-liveFacebook')) document.getElementById('cost-liveFacebook').innerText = `${c.liveFacebook || 10} ${getCurrencyLabel(c.liveFacebookCurrency)} / Request`;
                if (document.getElementById('cost-liveTiktok')) document.getElementById('cost-liveTiktok').innerText = `${c.liveTiktok || 10} ${getCurrencyLabel(c.liveTiktokCurrency)} / Request`;
                if (document.getElementById('cost-liveTwitter')) document.getElementById('cost-liveTwitter').innerText = `${c.liveTwitter || 10} ${getCurrencyLabel(c.liveTwitterCurrency)} / Request`;
                if (document.getElementById('cost-liveThreads')) document.getElementById('cost-liveThreads').innerText = `${c.liveThreads || 10} ${getCurrencyLabel(c.liveThreadsCurrency)} / Request`;
                // Also update verify page cost labels
                const el2fa = document.getElementById('verify-cost-2fa');
                const elIg = document.getElementById('verify-cost-instagram');
                const elFb = document.getElementById('verify-cost-facebook');
                const elTt = document.getElementById('verify-cost-tiktok');
                const elTw = document.getElementById('verify-cost-twitter');
                if (el2fa) el2fa.innerText = `COST: ${c.live2fa || 10} ${getCurrencyLabel(c.live2faCurrency)} / Request`;
                if (elIg) elIg.innerText = `COST: ${c.liveInstagram || 1} ${getCurrencyLabel(c.liveInstagramCurrency)} / Request`;
                if (elFb) elFb.innerText = `COST: ${c.liveFacebook || 1} ${getCurrencyLabel(c.liveFacebookCurrency)} / Request`;
                if (elTt) elTt.innerText = `COST: ${c.liveTiktok || 1} ${getCurrencyLabel(c.liveTiktokCurrency)} / Request`;
                if (elTw) elTw.innerText = `COST: ${c.liveTwitter || 1} ${getCurrencyLabel(c.liveTwitterCurrency)} / Request`;
            }
        });

    // Also fetch approved user-submitted items
    apiFetch('/api/user/item-sales/approved')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                localStorage.setItem('approvedUserItems', JSON.stringify(data.items || []));
            }
        })
        .catch(() => { })
        .finally(() => renderShopItems());
    apiFetch('/api/admin/cards').then(r => r.json()).then(data => {
        if (data.success) {
            localStorage.setItem('adminCards', JSON.stringify(data.cards));
            if (typeof currentPage !== 'undefined' && currentPage === 'vccCards') renderCards();
        }
    });
    apiFetch('/api/admin/vpn').then(r => r.json()).then(data => {
        if (data.success) {
            localStorage.setItem('adminVPNs', JSON.stringify(data.vpns));
            if (typeof currentPage !== 'undefined' && currentPage === 'vpnServices') renderVPN();
        }
    });
}
syncAdminData();

function renderServicesList() {
    const list = document.getElementById('servicesList');
    if (!list) return;
    const services = getServices();
    list.innerHTML = services.map(s => {
        let iconHtml = '';
        if (s.imageUrl) {
            iconHtml = `<img src="${s.imageUrl}" style="width:32px; height:32px; object-fit:contain;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-cog\\' style=\\'font-size:22px; color:#fff\\'></i>'">`;
        } else if (s.icon && (s.icon.includes('/') || s.icon.includes('http'))) {
            iconHtml = `<img src="${s.icon}" style="width:32px; height:32px; object-fit:contain;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-cog\\' style=\\'font-size:22px; color:#fff\\'></i>'">`;
        } else {
            iconHtml = `<i class="${s.icon || 'fas fa-cog'}" style="font-size:22px; color:#fff;"></i>`;
        }
        return `
        <div onclick="openService('${s.id}')"
            style="background:var(--bg-card); border-radius:18px; padding:16px 18px; display:flex; align-items:center; gap:16px; border:1px solid var(--border-color); cursor:pointer; transition:0.2s;"
            onmousedown="this.style.background='var(--accent-bg)'" onmouseup="this.style.background='var(--bg-card)'">
            <div style="width:48px; height:48px; background:linear-gradient(135deg,${s.color || '#1e3a5f,#2563eb'}); border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden;">
                ${iconHtml}
            </div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:15px; font-weight:700; color:var(--text-main);">${s.name}</div>
                <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">${s.desc}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text-sub); font-size:13px;"></i>
        </div>`;
    }).join('');
}

function renderShopItems() {
    const grid = document.getElementById('shopGrid');
    // User-submitted approved items (with stock > 0)
    const userItems = JSON.parse(localStorage.getItem('approvedUserItems') || '[]')
        .filter(item => (item.stock || 0) > 0);

    let shopCardsHtml = '';
    let appCardsHtml = '';
    let vpnCardsHtml = '';
    let accountCardsHtml = '';
    let cardCardsHtml = '';

    const adminItems = getShopItems(); // Show all items including out of stock (shown as disabled)

    // 1. Process Admin Items (Always in main shop)
    if (grid) {
        shopCardsHtml += adminItems.map(item => {
            const imgHtml = item.imageUrl
                ? `<img src="${item.imageUrl}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<i class=\'fas fa-box\' style=\'font-size:36px; color:#f59e0b;\'></i>'">`
                : `<i class="fas fa-box" style="font-size:36px; color:#f59e0b;"></i>`;

            // ✅ FIX: Determine currency and price
            let priceValue = item.price || 0;
            let rawCurrency = String(item.currency || 'usd').toLowerCase().trim();
            let currency = 'usd';
            let priceDisp = '';

            if (typeof priceValue === 'string') {
                if (priceValue.includes('TC') || priceValue.toLowerCase().includes('token')) {
                    rawCurrency = 'tokens';
                    priceValue = parseFloat(priceValue.replace(/[^0-9.]/g, '')) || 0;
                } else if (priceValue.includes('💎') || priceValue.toLowerCase().includes('gem')) {
                    rawCurrency = 'gems';
                    priceValue = parseFloat(priceValue.replace(/[^0-9.]/g, '')) || 0;
                } else if (priceValue.includes('$')) {
                    rawCurrency = 'usd';
                    priceValue = parseFloat(priceValue.replace(/[^0-9.]/g, '')) || 0;
                } else {
                    priceValue = parseFloat(priceValue) || 0;
                }
            }

            if (rawCurrency === 'tokens' || rawCurrency === 'token' || rawCurrency === 'tc') {
                currency = 'tokens';
                priceDisp = priceValue + ' TC';
            } else if (rawCurrency === 'gems' || rawCurrency === 'gem') {
                currency = 'gems';
                priceDisp = priceValue + ' 💎';
            } else {
                currency = 'usd';
                priceDisp = '$' + (Number.isInteger(priceValue) ? priceValue : priceValue.toFixed(2));
            }
            const isFreeItem = priceValue === 0;
            const stock = item.stock !== undefined ? item.stock : (item.accounts ? item.accounts.length : 0);
            const isOutOfStock = stock === 0;

            // Check if user already claimed this free item
            const purchasedAccounts = userData.purchasedAccounts ||
                JSON.parse(localStorage.getItem('purchasedAccounts_' + userData.id) || '[]');
            const alreadyClaimed = isFreeItem && purchasedAccounts.some(
                p => p.itemId === item.id || p.category === (item.name || item.id)
            );

            // Price display override for free items
            if (isFreeItem) priceDisp = 'FREE';

            let onclickHandler;
            if (isOutOfStock) {
                onclickHandler = `showItemNotAvailableModal('${item.name.replace(/'/g, "\\'")}')`;
            } else if (alreadyClaimed) {
                onclickHandler = `window.showToast('You have already claimed "${(item.name || '').replace(/'/g, "\\'")}"')`;
            } else {
                onclickHandler = `showPurchaseConfirmation('${item.name.replace(/'/g, "\\'")}', ${priceValue}, '${currency}', () => buyAdminShopItem('${item.id}', ${priceValue}, '${currency}'))`;
            }

            const btnColor = alreadyClaimed ? '#6b7280' : (isOutOfStock ? '#ef4444' : (item.btnColor || '#f59e0b'));
            const btnIcon = alreadyClaimed ? 'check-circle' : (isOutOfStock ? 'times-circle' : (isFreeItem ? 'gift' : 'shopping-cart'));
            const btnText = alreadyClaimed ? 'CLAIMED' : (isOutOfStock ? 'OUT OF STOCK' : (isFreeItem ? 'CLAIM FREE' : 'BUY'));

            return `
            <div onclick="${onclickHandler}"
                style="background:var(--bg-card); border-radius:16px; overflow:hidden; border:1px solid ${alreadyClaimed ? 'rgba(107,114,128,0.3)' : isOutOfStock ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}; cursor:pointer; transition:0.2s; opacity:${(isOutOfStock || alreadyClaimed) ? '0.75' : '1'};"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                <div style="background:${item.bgColor || '#0d0d0d'}; padding:0; display:flex; align-items:center; justify-content:center; height:120px; overflow:hidden; position:relative;">
                    ${imgHtml}
                    ${isOutOfStock ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;"><span style="color:#ef4444;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Out of Stock</span></div>` : ''}
                    ${alreadyClaimed ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;"><span style="color:#22c55e;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">✓ Claimed</span></div>` : ''}
                    ${isFreeItem && !alreadyClaimed && !isOutOfStock ? `<div style="position:absolute;top:8px;left:8px;background:rgba(34,197,94,0.9);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px;">FREE</div>` : ''}
                </div>
                <div style="padding:10px;">
                    <div style="font-size:10px; font-weight:700; color:var(--text-main); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <div style="font-size:14px; font-weight:800; color:${isFreeItem ? '#22c55e' : '#22c55e'};">${priceDisp}</div>
                        <div style="font-size:9px; font-weight:700; color:${stock <= 3 && stock > 0 ? '#f59e0b' : stock === 0 ? '#ef4444' : '#6b7280'};">${isOutOfStock ? 'SOLD OUT' : `${stock} left`}</div>
                    </div>
                    <div style="background:${alreadyClaimed ? 'rgba(107,114,128,0.1)' : isOutOfStock ? 'rgba(239,68,68,0.1)' : isFreeItem ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'}; border:1px solid ${btnColor}; border-radius:8px; padding:6px; text-align:center; font-size:10px; font-weight:700; color:${btnColor}; display:flex; align-items:center; justify-content:center; gap:4px;">
                        <i class="fas fa-${btnIcon}"></i> ${btnText}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // 2. Process User Items
    userItems.forEach(item => {
        const displayName = item.accountName || item.customName || item.vpnName || item.serviceName || item.itemType;
        const iconHtml = item.accountLogo
            ? `<img src="${item.accountLogo}" style="width:60px; height:60px; object-fit:cover; border-radius:12px;" onerror="this.src='https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${displayName}'">`
            : (item.iconBase64
                ? `<img src="${item.iconBase64}" style="width:60px; height:60px; object-fit:cover; border-radius:12px;">`
                : (item.itemType === 'VPN' ? `<i class="fas fa-shield-alt" style="font-size:36px; color:#0ea5e9;"></i>`
                    : (item.itemType === 'Card' ? `<i class="fas fa-credit-card" style="font-size:36px; color:#8b5cf6;"></i>`
                        : (item.itemType === 'Account' ? `<i class="fas fa-user-circle" style="font-size:36px; color:#6366f1;"></i>`
                            : `<i class="fas fa-box" style="font-size:36px; color:#f59e0b;"></i>`))));

        const has2fa = item.is2fa;

        // Use $ for everything as requested
        let price = item.price || item.sellingPrice || 0;
        let priceDisp = '$' + parseFloat(price).toFixed(2);
        // if (item.itemType === 'Card') priceDisp = price + ' TC'; // User wants dollars now

        // ✅ FIX: Add purchase confirmation for user items
        const itemPrice = parseFloat(price) || 0;
        const itemCurrency = 'USD'; // User items use USD
        const onclickHandler = `showPurchaseConfirmation('${displayName.replace(/'/g, "\\'")}', ${itemPrice}, '${itemCurrency}', () => buyUserItemConfirmed('${item.id}'))`;

        const cardHtml = `
        <div onclick="${onclickHandler}"
            style="background:var(--bg-card); border-radius:16px; overflow:hidden; border:1px solid var(--border-color); cursor:pointer; transition:0.2s; position:relative;"
            onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
            ${has2fa ? `<div style="position:absolute; top:8px; right:8px; background:rgba(16,185,129,0.9); color:#fff; font-size:9px; font-weight:800; padding:2px 6px; border-radius:6px; z-index:2;">2FA</div>` : ''}
            <div style="background:#111; padding:16px; display:flex; align-items:center; justify-content:center; min-height:80px; position:relative;">
                ${iconHtml}
            </div>
            <div style="padding:10px;">
                <div style="font-size:10px; font-weight:700; color:var(--text-main); margin-bottom:2px; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayName}</div>
                <div style="font-size:10px; color:#888; font-weight:600; margin-bottom:4px;">Stock: ${item.stock}</div>
                <div style="font-size:14px; font-weight:800; color:#22c55e; margin-bottom:8px;">${priceDisp}</div>
                <div style="background:rgba(245,158,11,0.1); border:1px solid #f59e0b; border-radius:8px; padding:6px; text-align:center; font-size:10px; font-weight:700; color:#f59e0b; display:flex; align-items:center; justify-content:center; gap:4px;">
                    <i class="fas fa-shopping-cart"></i> BUY
                </div>
            </div>
        </div>`;

        const listStyleCardHtml = `
        <div class="service-card" onclick="showPurchaseConfirmation('${displayName.replace(/'/g, "\\'")}', ${parseFloat(price) || 0}, 'USD', () => buyUserItemConfirmed('${item.id}'))" style="margin-bottom:12px; cursor:pointer;">
            <div class="sc-icon" style="background:#111;">${iconHtml.replace('60px', '40px')}</div>
            <div class="sc-info" style="flex:1;">
                <h3 style="font-size:14px;">${displayName}</h3>
                <p style="font-size:11px;">STOCK: ${item.stock} | PRICE: ${priceDisp}</p>
            </div>
            <div class="sc-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>`;

        // Logic: if users select subscription then it will list in all section shop (main grid)
        // if user select not subscription (Premium Account) then it will list in premium account section
        if (item.isSubscription) {
            shopCardsHtml += cardHtml;
        } else {
            // Non-subscription items go to their respective tabs in Accounts Store
            if (item.itemType === 'Other' || item.itemType === 'Card') {
                // Both 'Other' and 'Card' now go to SHOP tab
                appCardsHtml += (item.itemType === 'Other' ? cardHtml : listStyleCardHtml);
            } else if (item.itemType === 'VPN') {
                vpnCardsHtml += listStyleCardHtml;
            } else if (item.itemType === 'Account') {
                accountCardsHtml += listStyleCardHtml;
            } else {
                // Fallback to Account tab if unclear
                accountCardsHtml += listStyleCardHtml;
            }
        }
    });

    if (grid) {
        grid.innerHTML = shopCardsHtml || '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-sub);">No items available</div>';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gap = '12px';
    }

    // Inject to premium tabs if elements exist
    const pAppGrid = document.getElementById('premiumAppsGrid');
    if (pAppGrid) pAppGrid.innerHTML = appCardsHtml || '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-sub);">No apps available</div>';

    const pVpnList = document.getElementById('premiumVPNList');
    if (pVpnList) pVpnList.innerHTML = vpnCardsHtml || '<div style="text-align:center; padding:40px; color:var(--text-sub);">No VPNs available</div>';

    const pAccList = document.getElementById('userApprovedAccounts');
    if (pAccList) pAccList.innerHTML = accountCardsHtml || '';

    // For Cards, since renderCards is called separately, we might just append or handle it within renderCards.
    // However, if we do it here it's cleaner to append. Let's let renderCards handle its own logic, or append.
    // For now, let's store user cards in global var or just let renderCards run and append.
    window._userCardHtml = cardCardsHtml;
}

// ✅ NEW: Buy user-submitted item after confirmation
async function buyUserItemConfirmed(itemId) {
    const userId = userData.id;
    const approvedUserItems = JSON.parse(localStorage.getItem('approvedUserItems') || '[]');
    const item = approvedUserItems.find(i => i.id === itemId);

    if (!item) {
        window.showToast('❌ Item not found!');
        return;
    }

    const price = parseFloat(item.price || item.sellingPrice || 0);
    const balance = userData.usd || 0;

    if (balance < price) {
        window.showToast('❌ Insufficient balance!');
        return;
    }

    try {
        const res = await apiFetch('/api/user/item-sales/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, cardId: itemId })
        });
        const data = await res.json();

        if (data.success) {
            userData.usd = data.newBalance;
            renderBalances();
            window.showToast('✅ Item purchased successfully!');
            loadRecentActivity();

            // Show item details based on type
            if (item.itemType === 'Account') {
                const details = item.accounts && item.accounts[0] ? item.accounts[0] : {};
                window.showToast(`✅ Account purchased!\n\nEmail: ${details.email || 'N/A'}\nPassword: ${details.password || 'N/A'}${details.twoFA ? '\n2FA: ' + details.twoFA : ''}`);
            } else if (item.itemType === 'Card') {
                const cardData = item.cards && item.cards[0] ? item.cards[0] : {};
                const cardNumber = cardData.number ? '**** ' + cardData.number.slice(-4) : '**** ****';
                showCardDetail({
                    cardName: item.cardName || 'Virtual Card',
                    holderName: cardData.holderName || 'CARD HOLDER',
                    number: cardData.displayNumber || cardNumber,
                    month: cardData.month || 'MM',
                    year: cardData.year || 'YYYY',
                    cvv: cardData.cvv || '***',
                    country: (item.cardBillingAddress && item.cardBillingAddress.Country) || 'N/A'
                });
            } else if (item.itemType === 'VPN') {
                window.showToast(`✅ VPN purchased!\n\nDetails: ${item.vpnDetails || 'Check your purchases'}`);
            }

            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }

            // Refresh shop items
            renderShopItems();
        } else {
            window.showToast('❌ ' + data.message);
        }
    } catch (e) {
        console.error('Purchase error:', e);
        window.showToast('❌ Error purchasing item');
    }
}
window.buyUserItemConfirmed = buyUserItemConfirmed;

// Buy admin shop item — deducts balance and delivers account credentials
async function buyAdminShopItem(itemId, price, currency) {
    if (!userData || !userData.id) { window.showToast('Please login first.'); return; }

    const curLower = String(currency || 'usd').toLowerCase().trim();
    const isUSD = curLower === 'usd';
    const isGems = curLower === 'gems' || curLower === 'gem';
    const balance = isUSD ? (userData.usd || 0) : (isGems ? (userData.gems || userData.Gems || 0) : (userData.tokens || 0));

    if (balance < price) {
        window.showToast('❌ Insufficient balance!');
        return;
    }

    try {
        const res = await apiFetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, itemId, price, currency: curLower })
        });
        const data = await res.json();

        if (data.success) {
            // Update local balance
            if (isUSD) userData.usd = data.newBalance;
            else if (isGems) { userData.gems = data.newBalance; userData.Gems = data.newBalance; }
            else userData.tokens = data.newBalance;
            renderBalances();
            loadRecentActivity();

            // If free item — cache the claim so "Claimed" badge shows immediately
            if (data.isFree || price === 0) {
                if (!userData.purchasedAccounts) userData.purchasedAccounts = [];
                userData.purchasedAccounts.push({ itemId, category: data.itemName || itemId, price: 0, purchasedAt: Date.now() });
                try { localStorage.setItem(`purchasedAccounts_${userData.id}`, JSON.stringify(userData.purchasedAccounts)); } catch (e) { }
            }

            // Refresh shop items to show updated stock / claimed state
            apiFetch('/api/shop').then(r => r.json()).then(d => {
                if (d.success && d.shopItems) {
                    localStorage.setItem('adminShopItems', JSON.stringify(d.shopItems));
                    renderShopItems();
                }
            }).catch(() => { });

            // Show delivered account/card
            const acc = data.account;

            if (acc) {
                // --- NEW: Virtual Card (vcard accountType) ---
                if (acc.accountType === 'vcard') {
                    showVirtualCardModal(data.itemName || itemId, acc);
                    return;
                }
                // --- NEW: Passive Card ---
                if (acc.accountType === 'passivecard') {
                    showPassiveCardModal(data.itemName || itemId, acc);
                    return;
                }

                // Only treat as VCC card if email contains pipe-delimiter (card format: number|month|year|cvv)
                const isVCCItem = acc.email && acc.email.includes('|');

                if (isVCCItem) {
                    // Parse pipe-delimited card data
                    const parts = acc.email.split('|');
                    const cardNumber = parts[0] || '';
                    const cardMonth = parts[1] || 'MM';
                    const cardYear = parts[2] || 'YYYY';
                    const cardCvv = parts[3] || acc.password || '***';

                    let shared = {};
                    const rawInfo = acc.info || acc.instructions || '';
                    if (rawInfo && rawInfo.startsWith('{')) { try { shared = JSON.parse(rawInfo); } catch (e) { } }
                    const { cardVpn, cardType, cardName_val, cardCountry, cardCity, cardState, cardAddress, cardPostal, extraFields } = parseSharedInfo(shared, 'shop_' + itemId);

                    showCardDetail({
                        cardName: (data.itemName || itemId).toUpperCase(),
                        holderName: cardName_val || 'CARD HOLDER',
                        number: cardNumber,
                        cvv: cardCvv,
                        month: cardMonth,
                        year: cardYear,
                        vpn: cardVpn,
                        type: cardType,
                        country: cardCountry,
                        city: cardCity,
                        state: cardState,
                        address: cardAddress,
                        postal: cardPostal,
                        extraFields: extraFields,
                        price: price
                    });
                    setTimeout(() => {
                        const sa = document.getElementById('securedArea');
                        const gb = document.getElementById('generatorBtn');
                        if (sa) sa.style.display = 'block';
                        if (gb) { gb.innerHTML = 'GENERATE AGAIN <i class="fas fa-sync-alt"></i>'; gb.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)'; }
                    }, 200);
                } else {
                    // Normal account — show credential modal directly (email, password, 2FA)
                    showAccountCredentialModal(data.itemName || itemId, acc);
                }
            } else {
                // No account delivered (stock item without credentials)
                showPurchaseSuccessModal(data.itemName || itemId, price, currency);
            }
        } else {
            // Check if it's an out-of-stock / no account error
            const msg = data.message || '';
            if (data.outOfStock) {
                showItemNotAvailableModal(data.itemName || itemId);
            } else if (msg.toLowerCase().includes('no account') ||
                msg.toLowerCase().includes('out of stock') ||
                msg.toLowerCase().includes('not available')) {
                showItemNotAvailableModal(data.itemName || itemId);
            } else {
                window.showToast('❌ ' + (msg || 'Purchase failed'));
            }
        }
    } catch (e) {
        console.error('Shop buy error:', e);
        // If network error, try the accounts/buy-category endpoint as fallback
        try {
            const res2 = await apiFetch('/api/accounts/buy-category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userData.id, category: itemId, price: price })
            });
            const data2 = await res2.json();
            if (data2.success) {
                if (isUSD) userData.usd = (userData.usd || 0) - price;
                else userData.tokens = data2.newBalance;
                renderBalances();
                showPurchaseSuccessModal(itemId, price, currency);
                loadRecentActivity();
            } else {
                window.showToast('❌ ' + (data2.message || 'Purchase failed'));
            }
        } catch (e2) {
            window.showToast('❌ Network error. Please restart the server.');
        }
    }
}
window.buyAdminShopItem = buyAdminShopItem;

// ─── TOTP Generator (RFC 6238) — runs fully client-side ───────────────────────
async function generateTOTPCode(secret) {
    try {
        const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
        const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (const ch of cleanSecret) {
            const idx = base32Chars.indexOf(ch);
            if (idx === -1) continue;
            bits += idx.toString(2).padStart(5, '0');
        }
        const bytes = [];
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            bytes.push(parseInt(bits.slice(i, i + 8), 2));
        }
        const keyBytes = new Uint8Array(bytes);
        const counter = Math.floor(Date.now() / 1000 / 30);
        const counterBytes = new Uint8Array(8);
        let tmp = counter;
        for (let i = 7; i >= 0; i--) { counterBytes[i] = tmp & 0xff; tmp = Math.floor(tmp / 256); }
        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', cryptoKey, counterBytes);
        const hmac = new Uint8Array(sig);
        const offset = hmac[19] & 0x0f;
        const code = (
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff)
        ) % 1000000;
        return code.toString().padStart(6, '0');
    } catch (e) { return null; }
}
window.generateTOTPCode = generateTOTPCode;

function totpSecondsLeft() {
    return 30 - (Math.floor(Date.now() / 1000) % 30);
}
window.totpSecondsLeft = totpSecondsLeft;

// ─── Account Credential Modal (with live 2FA & Email Verification) ───────────
function showAccountCredentialModal(itemName, acc) {
    const existing = document.getElementById('accCredModal');
    if (existing) existing.remove();
    if (_totpInterval) { clearInterval(_totpInterval); _totpInterval = null; }

    const hasTwoFA = acc.twofa && acc.twofa.trim().length > 0;
    const secret = hasTwoFA ? acc.twofa.trim() : '';

    const ev = acc.emailVerification || {};
    const hasEv = !!(ev.enabled && ev.personalEmail);
    const showPersonalEmail = hasEv && (ev.showEmailToBuyer !== false && !ev.hidePersonalEmail);

    const modal = document.createElement('div');
    modal.id = 'accCredModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.88);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);padding:16px;';

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:22px;padding:22px 20px;max-width:360px;width:100%;border:1px solid rgba(245,158,11,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.7);">

            <!-- Header -->
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
                <div>
                    <div style="font-size:10px;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">✅ Purchase Successful</div>
                    <div style="color:#fff;font-size:16px;font-weight:800;">${itemName}</div>
                </div>
                <button onclick="document.getElementById('accCredModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;flex-shrink:0;margin-left:8px;">✕</button>
            </div>

            <!-- Email / Username -->
            ${acc.email ? `
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:11px 14px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">EMAIL</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="cred-email" style="color:#fff;font-size:14px;font-weight:600;flex:1;word-break:break-all;">${acc.email}</span>
                    <button onclick="credCopy('cred-email',this)" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>` : ''}

            <!-- Password -->
            ${acc.password ? `
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:11px 14px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">PASSWORD</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="cred-pass" style="color:#fff;font-size:14px;font-weight:600;flex:1;word-break:break-all;">${acc.password}</span>
                    <button onclick="credCopy('cred-pass',this)" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>` : ''}

            <!-- Personal Email (Only shown if showPersonalEmail is true) -->
            ${showPersonalEmail ? `
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:11px 14px;margin-bottom:8px;border:1px solid rgba(16,185,129,0.25);">
                <div style="font-size:9px;color:#10b981;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">PERSONAL EMAIL</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="cred-p-email" style="color:#fff;font-size:14px;font-weight:600;flex:1;word-break:break-all;">${ev.personalEmail}</span>
                    <button onclick="credCopy('cred-p-email',this)" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);color:#10b981;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>` : ''}

            <!-- Email Verification Get Code Button (Only if hasEv is true) -->
            ${hasEv ? `
            <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:14px; padding:14px; margin-bottom:10px; text-align:center;">
                <div style="font-size:10px; font-weight:800; color:#10b981; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                    <i class="fas fa-envelope-open-text" style="margin-right:4px;"></i> Live Email Verification
                </div>
                <div id="evModalOtpDisplay" style="background:rgba(0,0,0,0.4); border:1px dashed rgba(16,185,129,0.4); border-radius:10px; padding:8px 12px; text-align:center; font-family:monospace; font-size:16px; font-weight:800; color:#34d399; margin-bottom:10px; min-height:36px; display:flex; align-items:center; justify-content:center;">
                    ------
                </div>
                <button onclick="fetchPurchaseOtpCode('${(ev.personalEmail || '').replace(/'/g, "\\'")}', '${(ev.appPassword || '').replace(/'/g, "\\'")}', '${(ev.targetEmail || '').replace(/'/g, "\\'")}', this)" 
                    style="width:100%; background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; border-radius:10px; padding:10px; font-weight:800; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                    <i class="fas fa-key"></i> GET CODE
                </button>
            </div>` : ''}

            <!-- 2FA Section -->
            ${hasTwoFA ? `
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:11px 14px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">2FA</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="cred-twofa" style="color:#fff;font-size:13px;font-weight:600;flex:1;word-break:break-all;font-family:monospace;">${acc.twofa}</span>
                    <button onclick="credCopy('cred-twofa',this)" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>

            <!-- GET CODE — separate section, centered -->
            <div style="text-align:center;margin-bottom:10px;">
                <button onclick="toggleTotpInline('${secret.replace(/'/g, "\\'")}', this)"
                    id="getCodeBtn"
                    style="display:inline-flex;align-items:center;gap:6px;padding:7px 18px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#10b981;border-radius:20px;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.5px;transition:all 0.2s;">
                    <i class="fas fa-shield-alt" style="font-size:11px;"></i> GET CODE
                </button>
            </div>

            <!-- Inline TOTP panel (hidden by default) -->
            <div id="totp-inline-panel" style="display:none;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:14px;padding:16px;margin-bottom:10px;text-align:center;">
                <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Live 2FA Code</div>
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px;">
                    <div id="totp-code-display" style="font-size:36px;font-weight:900;color:#10b981;letter-spacing:8px;font-family:monospace;min-width:160px;">------</div>
                    <button onclick="credCopyText(document.getElementById('totp-code-display').textContent, this)"
                        style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#10b981;width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-bottom:6px;">
                    <div id="totp-progress-fill" style="height:100%;background:#10b981;transition:width 1s linear;width:100%;"></div>
                </div>
                <div style="font-size:10px;color:#6b7280;">Refreshes in <span id="totp-countdown">30</span>s</div>
            </div>` : ''}

            <!-- Close -->
            <button onclick="document.getElementById('accCredModal').remove()"
                style="width:100%;padding:11px;background:rgba(255,255,255,0.06);color:#9ca3af;border:1px solid rgba(255,255,255,0.08);border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;margin-top:4px;">
                Close
            </button>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showAccountCredentialModal = showAccountCredentialModal;

window.fetchPurchaseOtpCode = async function(personalEmail, appPassword, targetEmail, btn) {
    if (!personalEmail || !appPassword) {
        return window.showToast ? window.showToast('⚠️ Email verification credentials missing', 'error') : alert('Email verification credentials missing');
    }
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking Inbox...';
    
    try {
        const res = await apiFetch('/api/email-verification/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personalEmail, appPassword, targetEmail })
        });
        const data = await res.json();
        
        const display = document.getElementById('evModalOtpDisplay') || document.getElementById('modalOtpCodeDisplay');
        
        if (data.success && data.otp) {
            if (display) {
                display.innerHTML = `<span style="letter-spacing:3px; color:#34d399; font-size:20px; font-weight:900;">${data.otp}</span>
                <button onclick="credCopyText('${data.otp}', this)" style="margin-left:10px; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); color:#a7f3d0; padding:2px 8px; border-radius:6px; font-size:11px; cursor:pointer;"><i class="fas fa-copy"></i> Copy</button>`;
            }
            if (window.showToast) window.showToast('🎉 Verification code captured: ' + data.otp);
        } else {
            if (display) display.innerHTML = `<span style="color:#ef4444; font-size:12px;">No code received yet. Try again in 5s.</span>`;
            if (window.showToast) window.showToast('⚠️ ' + (data.message || 'No code found yet'), 'error');
        }
    } catch (e) {
        if (window.showToast) window.showToast('❌ Connection error fetching code', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
    }
};

// Toggle inline TOTP panel
function toggleTotpInline(secret, btn) {
    const panel = document.getElementById('totp-inline-panel');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    if (isHidden) {
        panel.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-eye-slash" style="font-size:10px;"></i> HIDE CODE';
        btn.style.background = 'rgba(16,185,129,0.25)';
        startLiveTOTP(secret);
    } else {
        panel.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-shield-alt" style="font-size:10px;"></i> GET CODE';
        btn.style.background = 'rgba(16,185,129,0.15)';
        if (_totpInterval) { clearInterval(_totpInterval); _totpInterval = null; }
    }
}
window.toggleTotpInline = toggleTotpInline;

// Copy text directly (not by element ID)
function credCopyText(text, btn) {
    if (!text || text === '------') return;
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = '#22c55e';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#10b981'; }, 1500);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
    });
}
window.credCopyText = credCopyText;

function credCopy(elId, btn) {
    const el = document.getElementById(elId);
    if (!el) return;
    const text = el.textContent || el.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = '#22c55e';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
    });
}
window.credCopy = credCopy;

let _totpInterval = null;
async function startLiveTOTP(secret) {
    if (_totpInterval) clearInterval(_totpInterval);
    async function update() {
        const code = await generateTOTPCode(secret);
        const codeEl = document.getElementById('totp-code-display');
        const countEl = document.getElementById('totp-countdown');
        const fillEl = document.getElementById('totp-progress-fill');
        const timerEl = document.getElementById('totp-timer');
        if (!codeEl) { clearInterval(_totpInterval); return; }
        if (code) { codeEl.textContent = code; }
        const secs = totpSecondsLeft();
        if (countEl) countEl.textContent = secs;
        if (fillEl) fillEl.style.width = ((secs / 30) * 100) + '%';
        if (timerEl) timerEl.textContent = secs + 's left';
        const isExpiring = secs <= 5;
        if (codeEl) codeEl.style.color = isExpiring ? '#ef4444' : '#10b981';
        if (fillEl) fillEl.style.background = isExpiring ? '#ef4444' : '#10b981';
    }
    await update();
    _totpInterval = setInterval(update, 1000);
}
window.startLiveTOTP = startLiveTOTP;

function openTotpPage(secret) {
    const existing = document.getElementById('totpPageModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'totpPageModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:9999999;display:flex;flex-direction:column;';
    modal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#1a1a2e;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;gap:10px;">
                <i class="fas fa-shield-alt" style="color:#10b981;font-size:18px;"></i>
                <span style="color:#fff;font-weight:700;font-size:15px;">2FA Code Generator</span>
            </div>
            <button id="totpPageCloseBtn" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;">
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:20px;padding:28px;max-width:340px;width:100%;border:1px solid rgba(16,185,129,0.3);text-align:center;">
                <i class="fas fa-lock" style="font-size:40px;color:#10b981;margin-bottom:16px;display:block;"></i>
                <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Your 2FA Code</div>
                <div id="totp-page-code" style="font-size:52px;font-weight:900;color:#10b981;letter-spacing:10px;font-family:monospace;margin-bottom:12px;">------</div>
                <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px;margin-bottom:16px;">
                    <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
                        <div id="totp-page-fill" style="height:100%;background:#10b981;transition:width 1s linear;width:100%;"></div>
                    </div>
                    <div style="font-size:11px;color:#6b7280;margin-top:6px;">Refreshes in <span id="totp-page-countdown">30</span>s</div>
                </div>
                <button onclick="(function(){const c=document.getElementById('totp-page-code');if(c){navigator.clipboard.writeText(c.textContent).then(()=>{c.style.color='#22c55e';setTimeout(()=>c.style.color='#10b981',1200)})}})()" style="width:100%;padding:13px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:14px;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:10px;"><i class="fas fa-copy"></i> Copy Code</button>
                <div style="font-size:10px;color:#374151;margin-top:8px;word-break:break-all;font-family:monospace;">Secret: ${secret}</div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    let pageInterval = null;
    async function updatePage() {
        const code = await generateTOTPCode(secret);
        const codeEl = document.getElementById('totp-page-code');
        const countEl = document.getElementById('totp-page-countdown');
        const fillEl = document.getElementById('totp-page-fill');
        if (!codeEl) { clearInterval(pageInterval); return; }
        if (code) codeEl.textContent = code;
        const secs = totpSecondsLeft();
        if (countEl) countEl.textContent = secs;
        if (fillEl) fillEl.style.width = ((secs / 30) * 100) + '%';
        const exp = secs <= 5;
        if (codeEl) codeEl.style.color = exp ? '#ef4444' : '#10b981';
        if (fillEl) fillEl.style.background = exp ? '#ef4444' : '#10b981';
    }
    updatePage();
    pageInterval = setInterval(updatePage, 1000);
    document.getElementById('totpPageCloseBtn').onclick = () => { clearInterval(pageInterval); modal.remove(); };
}
window.openTotpPage = openTotpPage;

// ─── Item Not Available Modal ─────────────────────────────────────────────────
function showItemNotAvailableModal(itemName) {
    const existing = document.getElementById('itemNotAvailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'itemNotAvailModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.88);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);padding:16px;';
    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:22px;padding:28px 24px;max-width:340px;width:100%;border:1px solid rgba(239,68,68,0.4);box-shadow:0 20px 60px rgba(0,0,0,0.6);text-align:center;">
            <!-- Icon -->
            <div style="width:72px;height:72px;background:rgba(239,68,68,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;border:2px solid rgba(239,68,68,0.3);">
                <i class="fas fa-box-open" style="font-size:30px;color:#ef4444;"></i>
            </div>
            <!-- Title -->
            <h3 style="color:#ef4444;font-size:18px;font-weight:800;margin:0 0 8px 0;">Item Not Available</h3>
            <!-- Item Name -->
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:10px 14px;margin-bottom:14px;">
                <span style="color:#fff;font-size:15px;font-weight:700;">"${itemName}"</span>
            </div>
            <!-- Message -->
            <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 20px 0;">
                This item is currently <strong style="color:#ef4444;">out of stock</strong>.<br>
                New stock will be added soon. Please check back later or contact support.
            </p>
            <!-- Wait indicator -->
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:10px;margin-bottom:18px;">
                <i class="fas fa-clock" style="color:#f59e0b;font-size:14px;"></i>
                <span style="color:#f59e0b;font-size:12px;font-weight:700;">Please wait for restock</span>
            </div>
            <!-- Close Button -->
            <button onclick="document.getElementById('itemNotAvailModal').remove()"
                style="width:100%;padding:13px;background:linear-gradient(135deg,#374151,#1f2937);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;">
                OK, Got It
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showItemNotAvailableModal = showItemNotAvailableModal;

function renderCards() {
    const container = document.getElementById('cardsList');
    if (!container) return;

    const adminCards = JSON.parse(localStorage.getItem('adminCards') || '[]');
    const approvedUserItems = JSON.parse(localStorage.getItem('approvedUserItems') || '[]');
    const userCards = approvedUserItems.filter(item => item.itemType === 'Card');

    let html = '';

    if (adminCards.length > 0) {
        html += adminCards.map(c => {
            // Support currency field: TC, USD, Gems
            const currency = c.currency || c.priceCurrency || 'TC';
            const priceDisplay = currency === 'USD' ? formatUsd(c.price) :
                currency === 'Gems' ? `${c.price} 💎` : `${c.price} TC`;
            const buyAction = `() => openAndBuyCard('${c.id}', 'card', ${c.price}, '${c.name.replace(/'/g, "\\'")}')`;

            let iconHtml = c.imageUrl
                ? `<img src="${c.imageUrl}" style="width:100%; height:100%; object-fit:cover;">`
                : `<i class="fas fa-credit-card" style="font-size:22px; color:#fff;"></i>`;

            return `
        <div class="service-card" onclick="showPurchaseConfirmation('${c.name.replace(/'/g, "\\'")}', ${c.price}, '${currency}', ${buyAction})" style="margin-bottom:12px; cursor:pointer; padding:16px;">
            <div class="sc-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706); width:50px; height:50px; border-radius:16px; flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                ${iconHtml}
            </div>
            <div class="sc-info" style="flex:1; margin-left:14px;">
                <h3 style="font-size:15px; font-weight:700; color:var(--text-main); margin:0;">${c.name}</h3>
                <p style="font-size:11px; color:var(--text-sub); margin:4px 0 0 0; font-weight:600;">Stock: ${c.count}</p>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                <div style="font-weight:900; color:#22c55e; font-size:15px; letter-spacing:0.5px;">${priceDisplay}</div>
                <button onclick="event.stopPropagation(); showPurchaseConfirmation('${c.name.replace(/'/g, "\\'")}', ${c.price}, '${currency}', ${buyAction})"
                    style="padding:6px 16px; border-radius:12px; background:#fbbf24; color:#000; font-weight:800; font-size:11px; border:none; cursor:pointer;">
                    BUY
                </button>
            </div>
        </div>`;
        }).join('');
    }

    // Render user-submitted approved cards
    if (userCards.length > 0) {
        html += userCards.map(card => {
            const cardData = card.cards && card.cards[0] ? card.cards[0] : {};
            const cardNumber = cardData.number ? '**** ' + cardData.number.slice(-4) : '**** ****';
            const cardLogo = card.cardLogo || null;
            return `
            <div class="service-card" style="margin-bottom:12px; cursor:pointer; padding:16px; background:linear-gradient(135deg, #1a1f71 0%, #4a5568 100%); border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; align-items:center; gap:12px; flex:1;">
                    ${cardLogo ? `<div style="width:50px; height:50px; border-radius:12px; overflow:hidden; flex-shrink:0; background:#fff;"><img src="${cardLogo}" style="width:100%; height:100%; object-fit:cover;"></div>` :
                    `<div class="sc-icon" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9); width:50px; height:50px; border-radius:16px; flex-shrink:0;"><i class="fas fa-credit-card"></i></div>`}
                    <div class="sc-info" style="flex:1;">
                        <h3 style="font-size:15px; font-weight:700; color:#fff; margin:0;">${card.cardName || 'Virtual Card'}</h3>
                        <p style="font-size:12px; color:rgba(255,255,255,0.7); margin:4px 0 0 0; font-family:monospace;">${cardNumber}</p>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:900; color:#22c55e; font-size:15px;">${card.rewardOffer || 0} TC</div>
                    <button onclick="buyUserCard('${card.id}', ${card.rewardOffer || 0})"
                        style="padding:6px 16px; border-radius:12px; background:#22c55e; color:#fff; font-weight:800; font-size:11px; border:none; cursor:pointer; margin-top:6px;">BUY</button>
                </div>
            </div>`;
        }).join('');
    }

    container.innerHTML = html || '<div style="text-align:center; padding:40px 0; color:var(--text-sub); opacity:0.5;">No cards available</div>';
}
window.renderCards = renderCards;

// Buy user-submitted card
async function buyUserCard(cardId, price) {
    // ✅ Add confirmation before purchase
    showPurchaseConfirmation('Virtual Card', price, 'TC', async () => {
        const userId = userData.id;
        const balance = userData.tokens || 0;

        if (balance < price) {
            window.showToast('❌ Insufficient balance!');
            return;
        }

        try {
            const res = await apiFetch('/api/user/item-sales/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, cardId })
            });
            const data = await res.json();

            if (data.success) {
                userData.tokens = data.newBalance;
                renderBalances();
                window.showToast('✅ Card purchased successfully!');
                loadRecentActivity();

                // Show details if it's a card
                if (data.details && (data.details.cardNumber || data.details.email)) {
                    // Parse expiry
                    let month = 'MM', year = 'YYYY';
                    if (data.details.cardExpiry && data.details.cardExpiry.includes('/')) {
                        const parts = data.details.cardExpiry.split('/');
                        month = parts[0];
                        year = parts[1].length === 2 ? '20' + parts[1] : parts[1];
                    }

                    showCardDetail({
                        cardName: 'MARKETPLACE CARD',
                        holderName: 'CARD HOLDER',
                        number: data.details.cardNumber || data.details.email || '**** **** **** ****',
                        cvv: data.details.cardCVV || data.details.password || '***',
                        month: month,
                        year: year,
                        country: 'Marketplace'
                    });
                }

                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                }
            } else {
                window.showToast('❌ ' + data.message);
            }
        } catch (e) {
            window.showToast('Error purchasing card');
        }
    });
}
window.buyUserCard = buyUserCard;

// Copy to clipboard function with visual feedback
function copyToClipboard(elementId, button) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let textToCopy = '';

    // Check if element is input/textarea or standard element
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        textToCopy = element.value;
        element.select();
        element.setSelectionRange(0, 99999); // For mobile devices
    } else {
        textToCopy = element.textContent.trim();
    }

    // Modern clipboard API with fallback
    const copyPromise = navigator.clipboard ?
        navigator.clipboard.writeText(textToCopy) :
        new Promise((resolve, reject) => {
            try {
                // Fallback for older browsers
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
                resolve();
            } catch (err) {
                reject(err);
            }
        });

    copyPromise.then(() => {
        // Visual feedback if button provided
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                const originalClass = icon.className;
                icon.className = 'fas fa-check';
                icon.style.color = '#22c55e';

                // Revert after 2 seconds
                setTimeout(() => {
                    icon.className = originalClass;
                    icon.style.color = ''; // Reset color
                }, 2000);
            }
        }

        // Show toast
        if (window.showToast) {
            window.showToast('✅ Copied to clipboard!');
        }

        // Haptic feedback
        if (window.tg && tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    }).catch(() => {
        if (window.showToast) {
            window.showToast('❌ Failed to copy');
        }
    });
}
window.copyToClipboard = copyToClipboard;

// Show card details page with data
function showCardDetail(cardData) {
    if (!cardData) return;

    const cardName = cardData.cardName || 'VIRTUAL CARD';
    PAGE_TITLES['cardDetail'] = cardName.toUpperCase();

    // Standard card fields
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || 'N/A'; };
    setText('cardDetailLabel', cardName.toUpperCase());
    setText('cardDetailHolder', (cardData.holderName || 'CARD HOLDER').toUpperCase());
    setText('cardDetailFullName', (cardData.holderName || 'CARD HOLDER').toUpperCase());
    setText('cardDetailVPN', cardData.vpn);
    setText('cardDetailNumber', cardData.number || '**** **** **** ****');
    setText('cardDetailExpiry', (cardData.month || 'MM') + '/' + (cardData.year || 'YYYY'));
    setText('cardDetailCVV', cardData.cvv || '***');
    setText('cardDetailCountry', cardData.country);
    setText('cardDetailCity', cardData.city);
    setText('cardDetailState', cardData.state);
    setText('cardDetailAddress', cardData.address);
    setText('cardDetailPostal', cardData.postal);

    // Generator box
    const genTitle = document.getElementById('generatorTitle');
    const genPrice = document.getElementById('generatorPrice');
    if (genTitle) genTitle.textContent = cardName;
    if (genPrice) genPrice.textContent = (cardData.price !== undefined) ? cardData.price + ' TOKENS' : '50 TOKENS';

    // Dynamic extra billing fields
    const billingContainer = document.getElementById('cardBillingInfoContainer');
    if (billingContainer) {
        billingContainer.querySelectorAll('.dynamic-billing-field').forEach(function (el) { el.remove(); });
        const extras = cardData.extraFields || [];
        extras.forEach(function (f) {
            const safeId = 'dynField_' + f.label.replace(/\W/g, '_');
            const box = document.createElement('div');
            box.className = 'dynamic-billing-field';
            box.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:10px 16px;';
            box.innerHTML = '<div style="font-size:10px; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">' + f.label + '</div>' +
                '<div class="copy-box">' +
                '<div id="' + safeId + '" style="font-size:16px; font-weight:600; color:#fff;">' + f.value + '</div>' +
                '<button class="copy-btn" onclick="copyToClipboard(\'' + safeId + '\', this)">' +
                '<i class="fas fa-copy" style="color:#fff; font-size:11px;"></i></button></div>';
            billingContainer.appendChild(box);
        });
    }

    // Store for history re-access
    window._lastCardData = cardData;

    // Reset generate button
    const securedArea = document.getElementById('securedArea');
    const genBtn = document.getElementById('generatorBtn');
    if (securedArea) securedArea.style.display = 'none';
    if (genBtn) {
        genBtn.innerHTML = 'GENERATE NOW <i class="fas fa-bolt"></i>';
        genBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    }

    nav('cardDetail');
}
window.showCardDetail = showCardDetail;

function generateCardNow(prefix = '') {
    const btnId = prefix ? prefix + 'GeneratorBtn' : 'generatorBtn';
    const areaId = prefix ? prefix + 'SecuredArea' : 'securedArea';

    const genBtn = document.getElementById(btnId);
    const securedArea = document.getElementById(areaId);

    if (!genBtn || !securedArea) return;

    if (genBtn.innerHTML.includes('GENERATE NOW')) {
        if (window.currentServiceId && window.currentServicePrice) {
            buyServiceAccount(window.currentServiceId, window.currentServicePrice);
        } else {
            window.showToast('No service selected');
        }
    } else {
        // Generate Again!
        if (window.currentServiceId && window.currentServicePrice) {
            window.showToast('Requesting new credentials...');
            buyServiceAccount(window.currentServiceId, window.currentServicePrice);
        } else {
            window.showToast('No service selected');
        }
    }
}
window.generateCardNow = generateCardNow;

function renderVPN() {
    const container = document.getElementById('vpnList');
    if (!container) return;
    const vpns = JSON.parse(localStorage.getItem('adminVPNs') || '[]');
    let html = '';

    if (vpns.length > 0) {
        html += vpns.map(v => {
            // Support currency field: TC, USD, Gems
            const currency = v.currency || v.priceCurrency || 'USD'; // VPN defaults to USD
            const priceDisplay = currency === 'USD' ? formatUsd(v.price) :
                currency === 'Gems' ? `${v.price} 💎` : `${v.price} TC`;
            const buyCallback = currency === 'USD'
                ? `() => buyAccount('vpn', ${v.price}, '${v.id}')`
                : currency === 'Gems'
                    ? `() => buyAccountGems('vpn', ${v.price}, '${v.id}')`
                    : `() => buyAccount('vpn', ${v.price}, '${v.id}')`;
            return `
        <div class="service-card" style="margin-bottom:12px; cursor:default; padding:16px;">
            <div class="sc-icon" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8); width:50px; height:50px; border-radius:16px; flex-shrink:0;">
                <i class="fas fa-shield-alt"></i>
            </div>
            <div class="sc-info" style="flex:1; margin-left:14px;">
                <h3 style="font-size:15px; font-weight:700; color:var(--text-main); margin:0;">${v.name}</h3>
                <p style="font-size:11px; color:var(--text-sub); margin:4px 0 0 0; font-weight:600;">Location: Premium</p>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                <div style="font-weight:900; color:#22c55e; font-size:15px; letter-spacing:0.5px;">${priceDisplay}</div>
                <button onclick="showPurchaseConfirmation('${v.name.replace(/'/g, "\\'")}', ${v.price}, '${currency}', ${buyCallback})" 
                    style="padding:6px 16px; border-radius:12px; background:#3b82f6; color:#fff; font-weight:800; font-size:11px; border:none; cursor:pointer; box-shadow:0 4px 10px rgba(59,130,246,0.2);">
                    BUY
                </button>
            </div>
        </div>`;
        }).join('');
    }

    container.innerHTML = html || '<div style="text-align:center; padding:40px 0; color:var(--text-sub); opacity:0.5;">No VPN accounts available</div>';
}

// ========================
// ACCOUNTS STORE
// ========================
function renderAccounts() {
    const container = document.getElementById('accountsStoreList');
    if (!container) return;

    apiFetch('/api/accounts')
        .then(r => r.json())
        .then(data => {
            if (!data.success || !data.accounts || data.accounts.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px 0; color:var(--text-sub);">
                        <i class="fas fa-box-open" style="font-size:32px; margin-bottom:12px; display:block;"></i>
                        <p>No accounts available right now</p>
                    </div>`;
                return;
            }

            const typeIcons = {
                'netflix': { icon: 'fas fa-tv', color: '#e50914', bg: 'rgba(229,9,20,0.1)' },
                'spotify': { icon: 'fas fa-music', color: '#1db954', bg: 'rgba(29,185,84,0.1)' },
                'prime': { icon: 'fas fa-play', color: '#00a8e1', bg: 'rgba(0,168,225,0.1)' },
                'crunchyroll': { icon: 'fas fa-play-circle', color: '#f47521', bg: 'rgba(244,117,33,0.1)' },
                'nordvpn': { icon: 'fas fa-shield-alt', color: '#4687ff', bg: 'rgba(70,135,255,0.1)' },
                'expressvpn': { icon: 'fas fa-lock', color: '#da3940', bg: 'rgba(218,57,64,0.1)' },
                'chatgpt': { icon: 'fas fa-robot', color: '#10a37f', bg: 'rgba(16,163,127,0.1)' },
                'other': { icon: 'fas fa-user-circle', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' }
            };

            container.innerHTML = data.accounts.map(acc => {
                const t = typeIcons[acc.type] || typeIcons['other'];
                return `
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:16px; display:flex; align-items:center; gap:14px;">
                    <div style="width:48px; height:48px; border-radius:12px; background:${t.bg}; display:flex; align-items:center; justify-content:center; color:${t.color}; font-size:22px; flex-shrink:0;">
                        <i class="${t.icon}"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; color:var(--text-main); text-transform:capitalize; font-size:14px;">${acc.type}</div>
                        <div style="font-size:11px; color:var(--text-sub); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${acc.email}</div>
                    </div>
                    <div style="text-align:right; flex-shrink:0;">
                        <div style="font-weight:800; color:#22c55e; font-size:14px;">${acc.price} TC</div>
                        <button onclick="showPurchaseConfirmation('${acc.type}', ${acc.price}, 'TC', () => buyPremiumAccount('${acc.id}', '${acc.type}', ${acc.price}))" style="margin-top:4px; padding:5px 14px; border-radius:8px; background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; font-weight:700; font-size:10px; border:none; cursor:pointer;">BUY</button>
                    </div>
                </div>`;
            }).join('');
        })
        .catch(() => {
            container.innerHTML = `<div style="text-align:center; padding:40px 0; color:var(--text-sub);">Failed to load accounts</div>`;
        });
}

function buyPremiumAccount(accountId, type, price) {
    if (!userData || !userData.id) {
        window.showToast('Please login first.');
        return;
    }

    // Purchase directly - confirmation already done
    apiFetch('/api/accounts/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, accountId })
    })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                userData.tokens = res.newBalance;
                renderBalances();

                // Special handling for VCC cards
                if (type === 'card' || (res.account && res.account.type === 'card')) {
                    const card = res.account;

                    const isChatGPT = accountId && accountId.toLowerCase().includes('chatgpt');
                    const isGemini = accountId && accountId.toLowerCase().includes('gemini');

                    if (isChatGPT) {
                        // Fill ChatGPT page
                        if (document.getElementById('chatgptCardHolder')) document.getElementById('chatgptCardHolder').textContent = 'CARD HOLDER';
                        if (document.getElementById('chatgptCardNumber')) document.getElementById('chatgptCardNumber').textContent = card.email || card.number || '**** **** **** ****';
                        if (document.getElementById('chatgptCardExpiry')) document.getElementById('chatgptCardExpiry').textContent = card.instructions || (card.month ? `${card.month}/${card.year}` : 'MM/YYYY');
                        if (document.getElementById('chatgptCardCVV')) document.getElementById('chatgptCardCVV').textContent = card.password || card.cvv || '***';
                        if (document.getElementById('chatgptCardCountry')) document.getElementById('chatgptCardCountry').textContent = card.country || 'Global';

                        // Reset view for step-by-step flow
                        const chatgptSecuredArea = document.getElementById('chatgptSecuredArea');
                        const chatgptGenBtn = document.getElementById('chatgptGeneratorBtn');
                        if (chatgptSecuredArea) chatgptSecuredArea.style.display = 'none';
                        if (chatgptGenBtn) {
                            chatgptGenBtn.innerHTML = 'GENERATE NOW <i class="fas fa-bolt"></i>';
                            chatgptGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                        }

                        nav('chatgpt');
                        window.showToast('✅ ChatGPT Card purchased! Details shown below.');
                    } else if (isGemini) {
                        // Fill Gemini page
                        if (document.getElementById('geminiCardHolder')) document.getElementById('geminiCardHolder').textContent = 'CARD HOLDER';
                        if (document.getElementById('geminiCardNumber')) document.getElementById('geminiCardNumber').textContent = card.email || card.number || '**** **** **** ****';
                        if (document.getElementById('geminiCardExpiry')) document.getElementById('geminiCardExpiry').textContent = card.instructions || (card.month ? `${card.month}/${card.year}` : 'MM/YYYY');
                        if (document.getElementById('geminiCardCVV')) document.getElementById('geminiCardCVV').textContent = card.password || card.cvv || '***';
                        if (document.getElementById('geminiCardCountry')) document.getElementById('geminiCardCountry').textContent = card.country || 'Global';

                        // Reset view for step-by-step flow
                        const geminiSecuredArea = document.getElementById('geminiSecuredArea');
                        const geminiGenBtn = document.getElementById('geminiGeneratorBtn');
                        if (geminiSecuredArea) geminiSecuredArea.style.display = 'none';
                        if (geminiGenBtn) {
                            geminiGenBtn.innerHTML = 'GENERATE NOW <i class="fas fa-bolt"></i>';
                            geminiGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                        }

                        nav('gemini');
                        window.showToast('✅ Gemini Card purchased! Details shown below.');
                    } else {
                        // Fallback to generic card detail
                        showCardDetail({
                            cardName: card.name || 'VIRTUAL CARD',
                            holderName: 'CARD HOLDER',
                            number: card.email || card.number || '**** **** **** ****',
                            cvv: card.password || card.cvv || '***',
                            expiry: card.instructions || (card.month ? `${card.month}/${card.year}` : 'MM/YYYY'),
                            country: card.country || 'Global'
                        });
                        window.showToast('✅ Card purchased! Details shown below.');
                    }
                } else {
                    // Show regular account details
                    window.showToast(`✅ Account purchased!\n\nEmail: ${res.account.email}\nPassword: ${res.account.password}${res.account.instructions ? '\nNotes: ' + res.account.instructions : ''}\n\nPlease save these details!`);
                }

                renderAccounts(); // Refresh
                if (typeof renderCards === 'function') renderCards();
            } else {
                window.showToast(res.message || 'Purchase failed');
            }
        })
        .catch(() => window.showToast('Network error'));
}

// OPEN AND BUY CARD (Opens page immediately)
function buyServiceAccount(serviceId, price) {
    if (!userData || !userData.id) {
        window.showToast('Please login first.');
        return;
    }

    const userTokens = userData.tokens || 0;
    if (userTokens < price) {
        // Show insufficient balance modal instead of nav to earn
        showPurchaseConfirmation('', price, 'TC', () => { });
        return;
    }

    apiFetch('/api/accounts/buy-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, category: serviceId, price: price })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                userData.tokens = data.newBalance;
                renderBalances();

                const isChatGPT = serviceId.toLowerCase().includes('chatgpt');
                const isGemini = serviceId.toLowerCase().includes('gemini');
                const card = data.account;
                // VCC/card purchase = pipe-delimited email — no 7-day policy modal
                const isVCC = card && card.email && card.email.includes('|');
                if (!isVCC) {
                    showPurchaseSuccessModal(serviceId, price, 'TC');
                }

                if (isChatGPT) {
                    if (document.getElementById('chatgptCardNumber')) document.getElementById('chatgptCardNumber').textContent = card.email || '**** **** **** ****';
                    if (document.getElementById('chatgptCardCVV')) document.getElementById('chatgptCardCVV').textContent = card.password || '***';
                    const chatgptSecuredArea = document.getElementById('chatgptSecuredArea');
                    if (chatgptSecuredArea) chatgptSecuredArea.style.display = 'block';
                    const chatgptGenBtn = document.getElementById('chatgptGeneratorBtn');
                    if (chatgptGenBtn) {
                        chatgptGenBtn.innerHTML = 'GENERATE AGAIN <i class="fas fa-sync-alt"></i>';
                        chatgptGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                    }
                } else if (isGemini) {
                    if (document.getElementById('geminiCardNumber')) document.getElementById('geminiCardNumber').textContent = card.email || '**** **** **** ****';
                    if (document.getElementById('geminiCardCVV')) document.getElementById('geminiCardCVV').textContent = card.password || '***';
                    const geminiSecuredArea = document.getElementById('geminiSecuredArea');
                    if (geminiSecuredArea) geminiSecuredArea.style.display = 'block';
                    const geminiGenBtn = document.getElementById('geminiGeneratorBtn');
                    if (geminiGenBtn) {
                        geminiGenBtn.innerHTML = 'GENERATE AGAIN <i class="fas fa-sync-alt"></i>';
                        geminiGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                    }
                } else {
                    let cardNumber = card.email || '**** **** **** ****';
                    let cardMonth = 'MM';
                    let cardYear = 'YYYY';
                    let cardCvv = card.password || '***';

                    if (card.email && card.email.includes('|')) {
                        const parts = card.email.split('|');
                        if (parts.length >= 4) {
                            cardNumber = parts[0];
                            cardMonth = parts[1];
                            cardYear = parts[2];
                            cardCvv = parts[3];
                        }
                    } else if (card.email) {
                        cardNumber = card.email;
                    }

                    let cardBin = cardNumber.substring(0, 6);

                    let shared = {};
                    // Try card.info first (direct from stock), then password, then instructions
                    const rawInfo = card.info || card.password || card.instructions || '';
                    if (rawInfo && rawInfo.startsWith('{')) {
                        try { shared = JSON.parse(rawInfo); } catch (e) { }
                    } else if (card.password && card.password.startsWith('{')) {
                        try { shared = JSON.parse(card.password); } catch (e) { }
                    } else if (card.instructions && card.instructions.startsWith('{')) {
                        try { shared = JSON.parse(card.instructions); } catch (e) { }
                    }


                    const { cardVpn, cardType, cardName_val, cardCountry, cardCity, cardState, cardAddress, cardPostal, extraFields } = parseSharedInfo(shared, 'svc_' + serviceId);

                    // Determine holder name: from shared.name or random
                    const holderName = cardName_val || ['CALEB OLIVER', 'MAMUN ISLAM'][Math.floor(Math.random() * 2)];


                    showCardDetail({
                        cardName: serviceId.toUpperCase(),
                        holderName: holderName,
                        number: cardNumber,
                        cvv: cardCvv,
                        month: cardMonth,
                        year: cardYear,
                        vpn: cardVpn,
                        type: cardType,
                        bin: cardBin,
                        country: cardCountry,
                        city: cardCity,
                        state: cardState,
                        address: cardAddress,
                        postal: cardPostal,
                        extraFields: extraFields,
                        price: price,
                        _raw: shared
                    });
                    const securedArea = document.getElementById('securedArea');
                    if (securedArea) securedArea.style.display = 'block';
                    const genBtn = document.getElementById('generatorBtn');
                    if (genBtn) {
                        genBtn.innerHTML = 'GENERATE AGAIN <i class="fas fa-sync-alt"></i>';
                        genBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                    }
                }
            } else {
                window.showToast('❌ ' + data.message);
            }
        })
        .catch(() => window.showToast('Network error'));
}
window.buyServiceAccount = buyServiceAccount;

// Copy helper for history items
function histCopy(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check" style="color:#22c55e;"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
        if (window.showToast) window.showToast('✅ Copied!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check" style="color:#22c55e;"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
        if (window.showToast) window.showToast('✅ Copied!');
    });
}
window.histCopy = histCopy;

// Re-show card detail from history entry
function reShowCardFromHistory(item) {
    if (!item) return;

    // Parse card number from email field (format: number|month|year|cvv)
    let cardNumber = item.email || '**** **** **** ****';
    let cardMonth = 'MM', cardYear = 'YYYY', cardCvv = item.password || '***';

    if (item.email && item.email.includes('|')) {
        const parts = item.email.split('|');
        if (parts.length >= 4) {
            cardNumber = parts[0];
            cardMonth = parts[1];
            cardYear = parts[2];
            cardCvv = parts[3];
        }
    }

    // Parse shared info from cardRaw, password (JSON), or instructions
    let shared = {};
    // Try all possible sources for JSON billing info
    const candidates = [item.cardRaw, item.password, item.instructions];
    for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(c);
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    shared = parsed;
                    break;
                }
            } catch (e) { }
        }
    }

    const { cardVpn, cardType, cardName_val, cardCountry, cardCity, cardState, cardAddress, cardPostal, extraFields } = parseSharedInfo(shared, 'hist_' + (item.category || 'card'));

    showCardDetail({
        cardName: (item.category || 'CARD').toUpperCase(),
        holderName: cardName_val || 'CARD HOLDER',
        number: cardNumber,
        cvv: cardCvv,
        month: cardMonth,
        year: cardYear,
        vpn: cardVpn,
        type: cardType,
        country: cardCountry,
        city: cardCity,
        state: cardState,
        address: cardAddress,
        postal: cardPostal,
        extraFields: extraFields,
        price: item.amount || 0
    });

    // Show the secured area immediately (already purchased)
    setTimeout(function () {
        const securedArea = document.getElementById('securedArea');
        const genBtn = document.getElementById('generatorBtn');
        if (securedArea) securedArea.style.display = 'block';
        if (genBtn) {
            genBtn.innerHTML = 'GENERATE AGAIN <i class="fas fa-sync-alt"></i>';
            genBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        }
    }, 100);
}
window.reShowCardFromHistory = reShowCardFromHistory;

// Helper: parse shared info JSON into card fields, handling comma-separated values
function parseSharedInfo(shared, rotateKey) {
    const extraFields = [];
    let cardVpn = 'N/A', cardType = 'MASTER CARD', cardName_val = '';
    let cardCountry = 'Global', cardCity = '', cardState = '', cardAddress = '', cardPostal = '';

    // Round-robin helper for comma-separated values
    const pick = (val) => {
        if (!val) return '';
        const parts = val.split(',').map(v => v.trim()).filter(v => v);
        if (parts.length <= 1) return parts[0] || val;
        if (!window._nameRotateIdx) window._nameRotateIdx = {};
        const key = rotateKey || 'default';
        const idx = (window._nameRotateIdx[key] || 0) % parts.length;
        window._nameRotateIdx[key] = idx + 1;
        return parts[idx];
    };

    Object.keys(shared).forEach(k => {
        const kl = k.toLowerCase().replace(/\s+/g, '_');
        const v = shared[k];
        if (kl === 'vpn') cardVpn = pick(v);
        else if (kl === 'type') cardType = pick(v);
        else if (kl === 'name') cardName_val = pick(v).toUpperCase();
        else if (kl === 'country') cardCountry = pick(v);
        else if (kl === 'city') cardCity = pick(v);
        else if (kl === 'state') cardState = pick(v);
        else if (kl === 'address' || kl === 'address_1') cardAddress = pick(v);
        else if (kl === 'postal' || kl === 'postal_code') cardPostal = pick(v);
        else extraFields.push({ label: k.replace(/_/g, ' ').toUpperCase(), value: pick(v) });
    });

    return { cardVpn, cardType, cardName_val, cardCountry, cardCity, cardState, cardAddress, cardPostal, extraFields };
}
window.parseSharedInfo = parseSharedInfo;

// Load and show My Purchases (re-access previously bought items)
async function loadMyPurchases() {
    if (!userData || !userData.id) return;
    try {
        const res = await apiFetch(`/api/user/${userData.id}/purchases`);
        const data = await res.json();
        if (!data.success) return;
        const purchases = data.purchases || [];
        const container = document.getElementById('myPurchasesList');
        const empty = document.getElementById('myPurchasesEmpty');
        if (!container) return;
        if (purchases.length === 0) {
            container.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';
        container.innerHTML = purchases.map((p, idx) => {
            const d = p.details || {};
            const date = new Date(p.boughtAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const fields = [
                d.email ? { label: 'Email', val: d.email } : null,
                d.password ? { label: 'Password', val: d.password } : null,
                d.twoFA ? { label: '2FA', val: d.twoFA } : null,
                d.cardNumber ? { label: 'Card', val: d.cardNumber } : null,
                d.cardExpiry ? { label: 'Expiry', val: d.cardExpiry } : null,
                d.cardCVV ? { label: 'CVV', val: d.cardCVV } : null,
            ].filter(Boolean);

            // Encode purchase data for click-to-view
            const pEncoded = encodeURIComponent(JSON.stringify(p));

            return `
            <div onclick="viewPurchaseDetail('${pEncoded}')" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px; margin-bottom:10px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(245,158,11,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:40px; height:40px; background:rgba(245,158,11,0.15); border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas fa-shopping-bag" style="color:#f59e0b; font-size:16px;"></i>
                        </div>
                        <div>
                            <div style="font-weight:700; font-size:14px; color:#fff;">${p.itemType}</div>
                            <div style="font-size:11px; color:#6b7280; margin-top:2px;">${date}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:10px; background:rgba(34,197,94,0.15); color:#22c55e; padding:3px 8px; border-radius:20px; font-weight:700;">PURCHASED</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('[Purchases] Load error:', e);
    }
}
window.loadMyPurchases = loadMyPurchases;

window.deleteUserPurchase = async function(boughtAt, saleId, email, event) {
    if (event) event.stopPropagation();
    if (!confirm('Remove this item from your purchase history?')) return;
    try {
        const res = await apiFetch(`/api/user/${userData.id}/purchases/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boughtAt, saleId, email })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast('🗑️ Item removed from history');
            loadMyPurchases();
        } else {
            window.showToast('❌ ' + (data.message || 'Failed to delete'));
        }
    } catch (e) {
        window.showToast('❌ Network error');
    }
};

// View purchase detail — shows card/account info like at purchase time
function viewPurchaseDetail(encoded) {
    try {
        const p = JSON.parse(decodeURIComponent(encoded));
        const d = p.details || {};

        if (d.accountType === 'vcard') {
            showVirtualCardModal(p.itemType, d, p);
            return;
        }

        if (d.accountType === 'passivecard') {
            showPassiveCardModal(p.itemType, d, p);
            return;
        }

        // If it's a card purchase (has cardRaw or email with |)
        const emailVal = d.email || '';
        const isCard = emailVal.includes('|') || (p.cardRaw && p.cardRaw.startsWith('{'));

        if (isCard || p.type === 'account_purchase') {
            // Re-show as card detail
            reShowCardFromHistory({
                email: emailVal,
                password: d.password || '',
                category: p.itemType || 'CARD',
                cardRaw: p.cardRaw || '',
                amount: 0
            });
        } else {
            const ev = d.emailVerification || p.emailVerification || {};
            const hasEv = !!(ev.enabled && ev.personalEmail);
            const showPersonalEmail = hasEv && (ev.showEmailToBuyer !== false && !ev.hidePersonalEmail);

            // Show as info modal
            const fields = [
                d.email ? { label: d.accountType === 'proxy' ? 'IP:Port' : (d.accountType === 'gmail' ? 'Google Email' : 'Email / Username'), val: d.email } : null,
                d.password ? { label: d.accountType === 'proxy' ? 'Proxy Username' : 'Password', val: d.password } : null,
                d.twoFA ? { label: d.accountType === 'proxy' ? 'Proxy Password' : '2FA Secret', val: d.twoFA } : null,
                showPersonalEmail ? { label: 'Personal Email', val: ev.personalEmail } : null,
                d.recoveryEmail ? { label: 'Recovery Email', val: d.recoveryEmail } : null,
                d.proxyProtocol ? { label: 'Protocol', val: d.proxyProtocol.toUpperCase() } : null,
                d.cardNumber ? { label: 'Card Number', val: d.cardNumber } : null,
                d.cardExpiry ? { label: 'Expiry', val: d.cardExpiry } : null,
                d.cardCVV ? { label: 'CVV', val: d.cardCVV } : null,
            ].filter(Boolean);

            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);padding:16px;';
            const isFree = p.price === 0;
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:20px;padding:24px;max-width:360px;width:100%;border:1px solid rgba(245,158,11,0.3);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <h3 style="color:#f59e0b;font-size:16px;font-weight:800;margin:0;">${p.itemType}</h3>
                        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>
                    </div>
                    ${fields.length > 0 ? fields.map(f => `
                    <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:10px 14px;margin-bottom:8px;">
                        <div style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px;">${f.label}</div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="color:#fff;font-size:14px;flex:1;word-break:break-all;">${f.val}</span>
                            <button onclick="histCopy('${f.val.replace(/'/g, "\\'")}',this)" style="background:none;border:none;color:#f59e0b;cursor:pointer;padding:4px;font-size:13px;flex-shrink:0;"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>`).join('') : '<p style="color:#6b7280;text-align:center;padding:20px 0;">No details available</p>'}

                    ${hasEv ? `
                    <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:14px; padding:14px; margin-top:12px; text-align:center;">
                        <div style="font-size:10px; font-weight:800; color:#10b981; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                            <i class="fas fa-envelope-open-text" style="margin-right:4px;"></i> Live Email Verification
                        </div>
                        <div id="evModalOtpDisplay" style="background:rgba(0,0,0,0.4); border:1px dashed rgba(16,185,129,0.4); border-radius:10px; padding:8px 12px; text-align:center; font-family:monospace; font-size:16px; font-weight:800; color:#34d399; margin-bottom:10px; min-height:36px; display:flex; align-items:center; justify-content:center;">
                            ------
                        </div>
                        <button onclick="fetchPurchaseOtpCode('${(ev.personalEmail || '').replace(/'/g, "\\'")}', '${(ev.appPassword || '').replace(/'/g, "\\'")}', '${(ev.targetEmail || '').replace(/'/g, "\\'")}', this)" 
                            style="width:100%; background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; border-radius:10px; padding:10px; font-weight:800; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                            <i class="fas fa-key"></i> GET CODE
                        </button>
                    </div>` : ''}
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        }
    } catch (e) {
        console.error('viewPurchaseDetail error:', e);
    }
}
window.viewPurchaseDetail = viewPurchaseDetail;

async function cleanFreePurchaseClaim(itemId, category, boughtAt) {
    if (!confirm('Are you sure you want to clean this claim history? This will remove it from your history and let you claim it again if needed.')) return;
    try {
        const res = await apiFetch('/api/shop/purchase/clean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, itemId, category, boughtAt })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast?.('✅ History cleaned!', 'success');
            const openModal = document.querySelector('div[style*="z-index: 999999"]');
            if (openModal) openModal.remove();
            
            userData.purchasedAccounts = data.purchasedAccounts;
            localStorage.setItem(`purchasedAccounts_${userData.id}`, JSON.stringify(data.purchasedAccounts));

            loadMyPurchases();
            loadRecentActivity();
            renderShopItems();
        } else {
            alert('Failed to clean claim history.');
        }
    } catch (e) {
        console.error('cleanFreePurchaseClaim error:', e);
    }
}
window.cleanFreePurchaseClaim = cleanFreePurchaseClaim;

// Switch between history tabs
function switchHistTab(tab) {
    const tabs = ['transactions', 'purchases'];
    tabs.forEach(t => {
        const content = document.getElementById('histContent-' + t);
        const btn = document.getElementById('histTab-' + t);
        if (!content || !btn) return;
        if (t === tab) {
            content.style.display = 'block';
            btn.style.background = 'rgba(245,158,11,0.9)';
            btn.style.color = '#000';
        } else {
            content.style.display = 'none';
            btn.style.background = 'transparent';
            btn.style.color = '#9ca3af';
        }
    });
    if (tab === 'transactions') {
        renderFullHistory();
    } else if (tab === 'purchases') {
        loadMyPurchases();
    }
}
window.switchHistTab = switchHistTab;

// ✅ NEW: Universal Purchase Confirmation Popup
function showPurchaseConfirmation(itemName, price, currency, onConfirm) {
    // Supports TC, USD, Gems
    const cLower = String(currency || 'usd').toLowerCase().trim();
    const isUSD = cLower === 'usd';
    const isGems = cLower === 'gems' || cLower === 'gem';
    const userBalance = isUSD ? (userData.usd || 0)
        : isGems ? (userData.gems !== undefined ? userData.gems : (userData.Gems || 0))
            : (userData.tokens || 0);

    const priceLabel = isUSD ? formatUsd(price)
        : isGems ? `${price} 💎`
            : `${price} TC`;
    const balLabel = isUSD ? formatUsd(userBalance)
        : isGems ? `${userBalance.toFixed(2)} 💎`
            : `${userBalance} TC`;
    const afterVal = isUSD ? userBalance - price
        : isGems ? userBalance - price
            : Math.floor(userBalance - price);
    const afterLabel = isUSD ? formatUsd(afterVal)
        : isGems ? `${afterVal.toFixed(2)} 💎`
            : `${afterVal} TC`;
    const balanceName = isUSD ? 'USD' : isGems ? 'Gems' : 'Token';

    if (userBalance < price) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:999999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(10px);';
        modal.innerHTML = `
            <div style="background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius:24px; padding:32px; max-width:320px; width:90%; text-align:center; border:2px solid #ef4444;">
                <div style="width:70px; height:70px; background:rgba(239,68,68,0.2); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size:32px; color:#ef4444;"></i>
                </div>
                <h3 style="color:#ef4444; font-size:20px; margin:0 0 12px 0; font-weight:800;">Insufficient Balance!</h3>
                <p style="color:#aaa; font-size:14px; margin:0 0 8px 0;">You need <strong style="color:#fff;">${priceLabel}</strong> to purchase this item.</p>
                <p style="color:#888; font-size:13px; margin:0 0 24px 0;">Your ${balanceName} balance: <strong style="color:#ef4444;">${balLabel}</strong></p>
                <button onclick="this.closest('div[style*=fixed]').remove(); nav('deposit');" style="width:100%; padding:14px; background:linear-gradient(135deg, #22c55e, #16a34a); color:#fff; border:none; border-radius:16px; font-weight:800; font-size:15px; cursor:pointer; margin-bottom:10px;">
                    <i class="fas fa-wallet"></i> ${isGems ? 'Get More Gems' : 'DEPOSIT NOW'}
                </button>
                <button onclick="this.closest('div[style*=fixed]').remove();" style="width:100%; padding:14px; background:rgba(255,255,255,0.1); color:#fff; border:none; border-radius:16px; font-weight:700; font-size:14px; cursor:pointer;">Cancel</button>
            </div>`;
        document.body.appendChild(modal);
        return;
    }

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:999999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(10px);';
    modal.innerHTML = `
        <div style="background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius:24px; padding:32px; max-width:320px; width:90%; text-align:center; border:2px solid #f59e0b;">
            <div style="width:70px; height:70px; background:rgba(245,158,11,0.2); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
                <i class="fas fa-shopping-cart" style="font-size:32px; color:#f59e0b;"></i>
            </div>
            <h3 style="color:#f59e0b; font-size:20px; margin:0 0 12px 0; font-weight:800;">Confirm Purchase</h3>
            <p style="color:#fff; font-size:15px; margin:0 0 8px 0; font-weight:700;">${itemName}</p>
            <p style="color:#aaa; font-size:14px; margin:0 0 24px 0;">Price: <strong style="color:#22c55e; font-size:18px;">${priceLabel}</strong></p>
            <p style="color:#888; font-size:12px; margin:0 0 24px 0;">Balance after: <strong style="color:#fff;">${afterLabel}</strong></p>
            <button id="confirmPurchaseBtn" style="width:100%; padding:14px; background:linear-gradient(135deg, #22c55e, #16a34a); color:#fff; border:none; border-radius:16px; font-weight:800; font-size:15px; cursor:pointer; margin-bottom:10px;">
                <i class="fas fa-check"></i> CONFIRM PURCHASE
            </button>
            <button onclick="this.closest('div[style*=fixed]').remove();" style="width:100%; padding:14px; background:rgba(255,255,255,0.1); color:#fff; border:none; border-radius:16px; font-weight:700; font-size:14px; cursor:pointer;">Cancel</button>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('confirmPurchaseBtn').onclick = () => { modal.remove(); onConfirm(); };
}

function openAndBuyCard(id, type, price, name) {
    const isChatGPT = id && id.toLowerCase().includes('chatgpt');
    const isGemini = id && id.toLowerCase().includes('gemini');

    // Store current service info for "Generate Again"
    window.currentServiceId = id;
    window.currentServicePrice = price;

    // Show purchase confirmation first — on confirm, navigate AND auto-buy
    showPurchaseConfirmation(name || id, price, 'TC', () => {
        // Navigate to the right page
        if (isChatGPT) {
            if (name) PAGE_TITLES['chatgpt'] = name.toUpperCase();
            const genTitle = document.getElementById('chatgptGeneratorTitle');
            const genPrice = document.getElementById('chatgptGeneratorPrice');
            const cardLabel = document.getElementById('chatgptCardLabel');
            if (genTitle && name) genTitle.textContent = name;
            if (genPrice) genPrice.textContent = price !== undefined ? `${price} TOKENS` : '50 TOKENS';
            if (cardLabel && name) cardLabel.textContent = name.toUpperCase();
            const chatgptSecuredArea = document.getElementById('chatgptSecuredArea');
            const chatgptGenBtn = document.getElementById('chatgptGeneratorBtn');
            if (chatgptSecuredArea) chatgptSecuredArea.style.display = 'none';
            if (chatgptGenBtn) { chatgptGenBtn.innerHTML = 'GENERATING... <i class="fas fa-spinner fa-spin"></i>'; chatgptGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)'; }
            nav('chatgpt');
        } else if (isGemini) {
            if (name) PAGE_TITLES['gemini'] = name.toUpperCase();
            const genTitle = document.getElementById('geminiGeneratorTitle');
            const genPrice = document.getElementById('geminiGeneratorPrice');
            if (genTitle && name) genTitle.textContent = name;
            if (genPrice) genPrice.textContent = price !== undefined ? `${price} TOKENS` : '50 TOKENS';
            const geminiSecuredArea = document.getElementById('geminiSecuredArea');
            const geminiGenBtn = document.getElementById('geminiGeneratorBtn');
            if (geminiSecuredArea) geminiSecuredArea.style.display = 'none';
            if (geminiGenBtn) { geminiGenBtn.innerHTML = 'GENERATING... <i class="fas fa-spinner fa-spin"></i>'; geminiGenBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)'; }
            nav('gemini');
        } else {
            if (name) PAGE_TITLES['cardDetail'] = name.toUpperCase();
            const genTitle = document.getElementById('generatorTitle');
            const genPrice = document.getElementById('generatorPrice');
            if (genTitle && name) genTitle.textContent = name;
            if (genPrice) genPrice.textContent = price !== undefined ? `${price} TOKENS` : '50 TOKENS';
            const securedArea = document.getElementById('securedArea');
            const genBtn = document.getElementById('generatorBtn');
            if (securedArea) securedArea.style.display = 'none';
            if (genBtn) { genBtn.innerHTML = 'GENERATING... <i class="fas fa-spinner fa-spin"></i>'; genBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)'; }
            nav('cardDetail');
        }

        // Auto-buy immediately after navigation
        setTimeout(() => {
            buyServiceAccount(id, price);
        }, 300);
    });
}
window.openAndBuyCard = openAndBuyCard; // Make it global

// ==========================================
// ACCOUNT STORE CATEGORY DETAIL
// ==========================================

const ACCOUNT_CATEGORIES = {
    gmail: {
        name: 'Gmail Accounts',
        icon: 'fas fa-envelope',
        color: '#ea4335',
        gradient: 'linear-gradient(135deg, #ea4335, #c5221f)',
        desc: 'Verified Gmail accounts ready for use. Phone-verified and aged accounts available.',
        price: 50,
        features: ['Phone Verified', 'Aged Account', 'Recovery Email Set', 'Instant Delivery']
    },
    netflix: {
        name: 'Netflix Premium',
        icon: 'fas fa-film',
        color: '#e50914',
        gradient: 'linear-gradient(135deg, #e50914, #b81d24)',
        desc: 'Premium Netflix accounts with UHD streaming. Shared and private accounts available.',
        price: 80,
        features: ['4K UHD Streaming', '1 Month Warranty', 'Auto-Renew Option', 'Instant Delivery']
    },
    spotify: {
        name: 'Spotify Premium',
        icon: 'fab fa-spotify',
        color: '#1db954',
        gradient: 'linear-gradient(135deg, #1db954, #15873d)',
        desc: 'Premium Spotify accounts with ad-free music. Individual and family plans available.',
        price: 40,
        features: ['Ad-Free Music', 'Offline Downloads', 'High Quality Audio', 'Instant Delivery']
    },
    disney: {
        name: 'Disney+ Premium',
        icon: 'fas fa-star',
        color: '#113ccf',
        gradient: 'linear-gradient(135deg, #113ccf, #0b25a0)',
        desc: 'Premium Disney+ accounts with full content library access including Marvel and Star Wars.',
        price: 60,
        features: ['Full Content Library', '4K Streaming', '4 Screens', 'Instant Delivery']
    },
    youtube: {
        name: 'YouTube Premium',
        icon: 'fab fa-youtube',
        color: '#ff0000',
        gradient: 'linear-gradient(135deg, #ff0000, #cc0000)',
        desc: 'Ad-free YouTube with background play, YouTube Music, and offline downloads.',
        price: 45,
        features: ['Ad-Free Videos', 'Background Play', 'YouTube Music', 'Instant Delivery']
    },
    amazon: {
        name: 'Amazon Prime',
        icon: 'fab fa-amazon',
        color: '#ff9900',
        gradient: 'linear-gradient(135deg, #ff9900, #cc7a00)',
        desc: 'Amazon Prime with free shipping, Prime Video, and Prime Music included.',
        price: 70,
        features: ['Free Shipping', 'Prime Video', 'Prime Music', 'Instant Delivery']
    }
};

let currentAccountCategory = null;

function showAccountCategory(category) {
    currentAccountCategory = category;
    const cat = ACCOUNT_CATEGORIES[category];
    if (!cat) return;

    const container = document.getElementById('accountDetailContent');
    if (!container) return;

    container.innerHTML = `
        <!-- Category Header Card -->
        <div style="background:${cat.gradient}; border-radius:24px; padding:28px 20px; margin-bottom:20px; text-align:center; position:relative; overflow:hidden;">
            <div style="position:absolute; top:0; left:0; right:0; bottom:0; background:radial-gradient(circle at 30% 50%, rgba(255,255,255,0.1), transparent 70%);"></div>
            <div style="position:relative; z-index:1;">
                <div style="width:70px; height:70px; background:rgba(255,255,255,0.2); border-radius:20px; display:flex; align-items:center; justify-content:center; margin:0 auto 14px; backdrop-filter:blur(10px);">
                    <i class="${cat.icon}" style="font-size:32px; color:#fff;"></i>
                </div>
                <div style="font-size:20px; font-weight:900; color:#fff; margin-bottom:6px;">${cat.name}</div>
                <div style="font-size:12px; color:rgba(255,255,255,0.8); max-width:260px; margin:0 auto; line-height:1.5;">${cat.desc}</div>
            </div>
        </div>

        <!-- Price Card -->
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:20px; padding:20px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <div style="font-size:12px; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:1px;">Price</div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <i class="fas fa-coins" style="color:#fbbf24; font-size:14px;"></i>
                    <span style="font-size:22px; font-weight:900; color:#fbbf24;">${cat.price}</span>
                    <span style="font-size:12px; color:var(--text-sub); font-weight:600;">TOKENS</span>
                </div>
            </div>
            <div style="height:1px; background:var(--border-color); margin-bottom:16px;"></div>
            <div style="font-size:11px; font-weight:700; color:var(--text-sub); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px;">What you get</div>
            ${cat.features.map(f => `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                    <i class="fas fa-check-circle" style="color:${cat.color}; font-size:14px;"></i>
                    <span style="font-size:13px; color:var(--text-main); font-weight:600;">${f}</span>
                </div>
            `).join('')}
        </div>

        <!-- Credentials Box (Hidden by default, shown after purchase) -->
        <div id="accountCredentialsBox" style="display:none; margin-bottom:16px;">
            <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3); border-radius:20px; padding:20px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
                    <i class="fas fa-check-circle" style="color:#22c55e; font-size:16px;"></i>
                    <span style="font-size:14px; font-weight:800; color:#22c55e;">PURCHASE SUCCESSFUL</span>
                </div>
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:14px; padding:16px;">
                    <div style="margin-bottom:12px;">
                        <div style="font-size:10px; font-weight:700; color:var(--text-sub); margin-bottom:4px; text-transform:uppercase;">Email</div>
                        <div id="accCredEmail" style="font-size:14px; font-weight:700; color:var(--text-main); background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:10px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <span id="accEmailText">-</span>
                            <i class="fas fa-copy" style="color:${cat.color}; cursor:pointer;" onclick="copyAccCred('email')"></i>
                        </div>
                    </div>
                    <div>
                        <div style="font-size:10px; font-weight:700; color:var(--text-sub); margin-bottom:4px; text-transform:uppercase;">Password</div>
                        <div id="accCredPass" style="font-size:14px; font-weight:700; color:var(--text-main); background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:10px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <span id="accPassText">-</span>
                            <i class="fas fa-copy" style="color:${cat.color}; cursor:pointer;" onclick="copyAccCred('pass')"></i>
                        </div>
                    </div>
                </div>
                <div style="margin-top:12px; font-size:11px; color:#888; text-align:center; font-weight:600;">
                    <i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i> Save these credentials! They won't be shown again.
                </div>
            </div>
        </div>

        <!-- Buy Button -->
        <button id="buyAccountBtn" onclick="buyAccountFromCategory('${category}')"
            style="width:100%; padding:16px; border:none; border-radius:16px; font-weight:900; font-size:15px; color:#fff; background:${cat.gradient}; cursor:pointer; text-transform:uppercase; letter-spacing:1px; box-shadow:0 8px 24px ${cat.color}44; transition:all 0.3s ease;">
            <i class="fas fa-shopping-cart"></i> BUY FOR ${cat.price} TOKENS
        </button>

        <!-- Availability Note -->
        <div style="margin-top:16px; text-align:center;">
            <div style="font-size:11px; color:var(--text-sub); font-weight:600;">
                <i class="fas fa-circle" style="color:#22c55e; font-size:8px;"></i> Available &bull; Instant Delivery &bull; 24/7 Support
            </div>
        </div>
    `;
}
window.showAccountCategory = showAccountCategory;

function buyAccountFromCategory(category) {
    const cat = ACCOUNT_CATEGORIES[category];
    if (!cat) return;

    if (checkZeroBalanceAdTrigger()) return;

    if (userTokens < cat.price) {
        nav('earn');
        return;
    }

    // Execute purchase directly without confirmation
    const btn = document.getElementById('buyAccountBtn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSING...';
        btn.style.pointerEvents = 'none';
    }

    apiFetch('/api/accounts/buy-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, category: category, price: cat.price })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                userData.tokens = data.newBalance;
                updateBalanceUI();

                // Show credentials
                const credBox = document.getElementById('accountCredentialsBox');
                const emailEl = document.getElementById('accEmailText');
                const passEl = document.getElementById('accPassText');

                if (credBox) credBox.style.display = 'block';
                if (emailEl) emailEl.textContent = data.account.email;
                if (passEl) passEl.textContent = data.account.password;

                if (btn) {
                    btn.innerHTML = '<i class="fas fa-check"></i> PURCHASED';
                    btn.style.background = '#22c55e';
                    btn.style.boxShadow = '0 8px 24px rgba(34,197,94,0.3)';
                    btn.style.pointerEvents = 'none';
                }

                // Confetti
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                if (typeof confetti !== 'undefined') {
                    var duration = 3 * 1000;
                    var animationEnd = Date.now() + duration;
                    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };
                    var interval = setInterval(function () {
                        var timeLeft = animationEnd - Date.now();
                        if (timeLeft <= 0) return clearInterval(interval);
                        var particleCount = 50 * (timeLeft / duration);
                        confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
                    }, 250);
                }
            } else {
                window.showToast(data.message || 'Purchase failed.');
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-shopping-cart"></i> BUY FOR ${cat.price} TOKENS`;
                    btn.style.pointerEvents = 'auto';
                }
            }
        })
        .catch(() => {
            window.showToast('Network error. Please try again.');
            if (btn) {
                btn.innerHTML = `<i class="fas fa-shopping-cart"></i> BUY FOR ${cat.price} TOKENS`;
                btn.style.pointerEvents = 'auto';
            }
        });
}
window.buyAccountFromCategory = buyAccountFromCategory;

function copyAccCred(type) {
    const el = type === 'email' ? document.getElementById('accEmailText') : document.getElementById('accPassText');
    if (el) {
        navigator.clipboard.writeText(el.textContent).then(() => {
            window.showToast(`${type === 'email' ? 'Email' : 'Password'} copied!`);
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }).catch(() => {
            window.showToast('Copy failed. Please copy manually.');
        });
    }
}
window.copyAccCred = copyAccCred;
let currentServiceData = null;

function openService(serviceId) {
    const services = getServices();
    const s = services.find(x => x.id === serviceId);
    if (!s) return;

    if (s.page === 'serviceGenerate') {
        currentServiceData = s;
        // Populate the generate page
        const nameEl = document.getElementById('sgServiceName');
        const costEl = document.getElementById('sgServiceCost');
        const descEl = document.getElementById('sgServiceDesc');
        const iconEl = document.getElementById('sgServiceIcon');

        if (nameEl) nameEl.textContent = s.name;
        if (costEl) costEl.textContent = (s.cost || 10) + ' TC';
        if (descEl) descEl.textContent = s.desc || 'Generate your service account instantly.';
        if (iconEl) {
            if (s.imageUrl) {
                iconEl.innerHTML = `<img src="${s.imageUrl}" style="width:44px; height:44px; object-fit:contain;" onerror="this.parentElement.innerHTML='<i class=\\'${s.icon || 'fas fa-cog'}\\' style=\\'font-size:28px; color:#fff\\'></i>'">`;
                iconEl.style.background = `linear-gradient(135deg,${s.color || '#1e3a5f,#2563eb'})`;
            } else {
                iconEl.innerHTML = `<i class="${s.icon || 'fas fa-cog'}" style="font-size:28px; color:#fff;"></i>`;
                iconEl.style.background = `linear-gradient(135deg,${s.color || '#1e3a5f,#2563eb'})`;
            }
        }
        nav('serviceGenerate');
        // Update header title to service name
        setTimeout(() => {
            const ht = document.getElementById('headerTitle');
            if (ht) ht.textContent = s.name.toUpperCase();
        }, 20);
    } else {
        nav(s.page || serviceId);
    }
}

function generateService(type) {
    const s = type ? null : currentServiceData;
    const cost = s ? (s.cost || 10) : (type === 'number' ? 15 : 10);
    const name = s ? s.name : (type === 'number' ? 'Number Service' : 'Mail Service');

    if (Math.max(0, userData.tokens || 0) < cost) {
        nav('earn');
        return;
    }

    // Generate directly without confirmation
    userData.tokens -= cost;
    renderBalances();
    window.showToast(` ${name} generated successfully!\n\nYour balance: ${Math.max(0, userData.tokens || 0)} TC`);
}

function copyTextById(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        window.showToast('✅ Copied to clipboard!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = el.textContent;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        window.showToast('✅ Copied!');
    });
}

// =============================================
// EMAIL SERVICE REWAMP (TEMP & PREMIUM)
// =============================================
var mailSessions = {
    temp: null,
    premium: null
};

var previousMailSessions = {
    temp: null,
    premium: null
};

var mailRefreshInterval = null;
window._currentMailType = 'temp'; // helper to know context

function startInboxPolling(type) {
    if (mailRefreshInterval) clearInterval(mailRefreshInterval);
    refreshInbox(type); // Initial refresh
    mailRefreshInterval = setInterval(() => {
        refreshInbox(type);
    }, 5000);
}

function stopInboxPolling() {
    if (mailRefreshInterval) {
        clearInterval(mailRefreshInterval);
        mailRefreshInterval = null;
    }
}

function updateMailBalance(type) {
    if (!type) {
        // Fallback for generic calls
        type = window._currentMailType || 'temp';
    }

    // Ensure mailSessions is initialized (prevents crashes if script execution was interrupted)
    if (typeof mailSessions === 'undefined' || !mailSessions) {
        mailSessions = { temp: null, premium: null };
    }
    const tokens = Math.max(0, (typeof userData !== "undefined" && userData.tokens) ? userData.tokens : 0);
    const balEl = document.getElementById(type + "MailBalance");
    if (balEl) balEl.textContent = tokens + " TC";

    const noActive = document.getElementById(type + "MailNoActive");
    const activeState = document.getElementById(type + "MailActive");

    if (mailSessions[type]) {
        // Session active - show email address
        if (noActive) noActive.style.display = "none";
        if (activeState) activeState.style.display = "block";
        const addrEl = document.getElementById(type + "MailAddr");
        if (addrEl) {
            addrEl.textContent = mailSessions[type].email;
            addrEl.style.fontStyle = "normal";
            addrEl.style.opacity = "1";
        }
    } else {
        // No session yet - still show the page with placeholder text
        if (noActive) noActive.style.display = "none"; // hide noActive (we use inline placeholder instead)
        if (activeState) activeState.style.display = "block"; // ALWAYS show the mail page
        const addrEl = document.getElementById(type + "MailAddr");
        if (addrEl) { addrEl.textContent = "loading..."; addrEl.style.fontStyle = "italic"; addrEl.style.opacity = "0.7"; }
    }
}

function generateTempMail(type) {
    if (checkZeroBalanceAdTrigger()) return;
    if (!type) type = 'temp';

    // ✅ FIX: Premium/hotmail types must use premium email API, NOT temp mail API
    // Clear any existing session so NEW EMAIL always generates fresh
    if (type === 'premium') {
        // Clear session to force new email generation
        mailSessions.premium = null;
        window._isAutoGeneratingPremium = false;
        generatePremiumMail('gmail');
        return;
    }
    if (type === 'hot' || type === 'hotmail') {
        mailSessions.hot = null;
        generatePremiumMail('hotmail');
        return;
    }
    if (type === 'student') {
        mailSessions.student = null;
        generatePremiumMail('student');
        return;
    }

    const cost = parseInt(window.appCostConfig?.mailCost) || 10;

    // If no user login, cannot generate
    if (!userData.id || userData.id === 0) {
        window.showToast("Please login via Telegram to use this service");
        nav('home');
        return;
    }

    if (Math.max(0, userData.tokens || 0) < cost) { nav('earn'); return; }

    // Show loading state immediately
    const addrEl = document.getElementById(type + "MailAddr");
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>generating...';
        addrEl.style.fontStyle = "italic";
        addrEl.style.opacity = "0.8";
    }

    apiFetch("/api/mail/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userData.id, cost, type })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                userData.tokens = (typeof data.newBalance === 'number') ? data.newBalance : (Math.max(0, userData.tokens || 0) - cost);
                renderBalances();
                if (mailSessions[type]) {
                    previousMailSessions[type] = mailSessions[type];
                }
                mailSessions[type] = data;
                // Reset style and show email
                if (addrEl) {
                    addrEl.style.fontStyle = "normal";
                    addrEl.style.opacity = "1";
                }
                updateMailBalance(type);
                startInboxPolling(type);
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                if (addrEl) {
                    addrEl.innerHTML = '<span style="color:#f87171;">Failed. Tap to retry</span>';
                    addrEl.style.fontStyle = "normal";
                    addrEl.style.opacity = "1";
                }
                window.showToast("❌ " + (data.message || "Email generation failed. Please try again."));
            }
        })
        .catch(() => {
            if (addrEl) {
                addrEl.innerHTML = '<span style="color:#f87171;">Network error. Retry</span>';
                addrEl.style.fontStyle = "normal";
                addrEl.style.opacity = "1";
            }
            window.showToast("❌ Network error. Please check your connection and try again.");
        });
}

function renewTempMail(type) {
    if (!type) type = 'temp';

    // If no user login, use demo mode
    if (!userData.id || userData.id === 0) {
        window.showToast("Please login via Telegram to use this service");
        nav('home');
        return;
    }

    // For Premium (Gmail) and Hotmail, show the custom renew modal
    if (type === 'premium' || type === 'hotmail' || type === 'hot') {
        openRenewMailModal(type);
        return;
    }

    if (!previousMailSessions[type]) {
        window.showToast(`❌ No previous ${type} session found to restore.`);
        return;
    }

    // Direct restore without confirmation or success alert for standard temp mail
    const current = mailSessions[type];
    mailSessions[type] = previousMailSessions[type];
    previousMailSessions[type] = current;

    updateMailBalance(type);
    startInboxPolling(type);
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

// ─── Custom Renew Modal Logic ──────────────────────────────────────────────
let currentRenewType = '';

function openRenewMailModal(type) {
    currentRenewType = type;
    const modal = document.getElementById('renewMailModal');
    const sheet = document.getElementById('renewMailSheet');
    const costDisplay = document.getElementById('renewMailCostDisplay');
    const input = document.getElementById('renewCustomEmailInput');

    // Clear input
    if (input) input.value = '';

    // Set cost from config
    const cost = (window.serviceConfig && window.serviceConfig.renewMailCost) || 30;
    if (costDisplay) costDisplay.textContent = cost + ' TC';

    modal.style.display = 'flex';
    setTimeout(() => { sheet.style.transform = 'translateY(0)'; }, 20);
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function closeRenewMailModal() {
    const modal = document.getElementById('renewMailModal');
    const sheet = document.getElementById('renewMailSheet');
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => { modal.style.display = 'none'; }, 380);
}

async function confirmRenewCustomEmail() {
    const email = document.getElementById('renewCustomEmailInput').value.trim();
    const btn = document.getElementById('confirmRenewBtn');

    if (!email) {
        window.showToast('Please enter an email address');
        return;
    }

    if (!email.includes('@')) {
        window.showToast('Invalid email address format');
        return;
    }

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Renewing...';
    btn.style.pointerEvents = 'none';

    try {
        const res = await apiFetch('/api/mail/renew-custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                email: email,
                type: currentRenewType
            })
        });
        const data = await res.json();

        if (data.success) {
            window.showToast('✅ Email renewed successfully!', 'success');

            // Set the new session properly
            const type = currentRenewType === 'premium' ? 'premium' : (currentRenewType === 'hot' ? 'hot' : 'student');

            // Update session with new email
            const newEmail = data.email || email; // email from input
            mailSessions[type] = {
                email: newEmail,
                id: data.sessionId || (mailSessions[type]?.id),
                type: currentPremiumTab || (type === 'premium' ? 'gmail' : type),
                sessionId: data.sessionId || (mailSessions[type]?.sessionId)
            };

            // ✅ FIX: Update the email address display immediately without page reload
            const addrElId = type === 'premium' ? 'premiumMailAddr' : (type === 'hot' ? 'hotMailAddr' : 'studentMailAddr');
            const addrEl = document.getElementById(addrElId);
            if (addrEl) {
                addrEl.textContent = newEmail;
                addrEl.style.fontStyle = 'normal';
                addrEl.style.opacity = '1';
            }

            // ✅ FIX: Update balance
            if (data.newBalance !== undefined) {
                userData.balance_tokens = data.newBalance;
                userData.tokens = data.newBalance;
                renderBalances();
            }

            // ✅ FIX: Close modal first, then refresh inbox
            closeRenewMailModal();

            // ✅ FIX: Refresh inbox to show messages for the new email
            setTimeout(() => {
                refreshInbox(type);
            }, 300);

            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            window.showToast('❌ ' + (data.message || 'Renewal failed'), 'error');
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        }
    } catch (e) {
        console.error('Renew Error:', e);
        window.showToast('Network error. Please try again.');
    } finally {
        btn.innerHTML = originalHtml;
        btn.style.pointerEvents = 'auto';
    }
}

function deleteMail(type) {
    // Delete directly without confirmation
    mailSessions[type] = null;
    updateMailBalance(type);
}

function refreshInbox(type) {
    if (!type) type = window._currentMailType || 'temp';

    // If no session and no user login, just show demo inbox
    if (!mailSessions[type] && (!userData.id || userData.id === 0)) {
        console.log('refreshInbox: No session and no user login');
        const listEl = document.getElementById(type + "InboxList");
        if (listEl) {
            listEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-sub);"><i class="fas fa-inbox" style="font-size:32px; margin-bottom:10px; opacity:0.3;"></i><div style="font-size:12px;">Generate email first to see inbox</div></div>`;
        }
        return;
    }

    if (!mailSessions[type]) return;

    // Deduct 1 token per inbox refresh (temp only)
    const refreshCost = 0; // Auto-poll should not charge tokens
    if (refreshCost > 0 && Math.max(0, userData.tokens || 0) < refreshCost) {
        window.showToast(`❌ Insufficient tokens!\n\nYou need ${refreshCost} TC to refresh inbox.\nYour balance: ${Math.max(0, userData.tokens || 0)} TC`);
        return;
    }

    const listEl = document.getElementById(type + "InboxList");
    const refreshIcon = document.getElementById(type + "RefreshIcon");
    if (refreshIcon) refreshIcon.classList.add("fa-spin");

    // Clear list if it's been empty for a while to show loading state
    if (listEl && listEl.children.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-sub);"><i class="fas fa-spinner fa-spin" style="font-size:24px; margin-bottom:10px;"></i><div style="font-size:12px;">Checking for new messages...</div></div>`;
    }

    const sessionId = mailSessions[type].id || mailSessions[type].sessionId;

    // Choose endpoint based on type
    let endpoint = `/api/mail/inbox?sessionId=${sessionId}&userId=${userData.id}&cost=${refreshCost}`;
    // ✅ FIX: Premium, hotmail, hot and student all use the premium emails inbox (IMAP-based)
    if (type === 'premium' || type === 'hotmail' || type === 'hot' || type === 'student') {
        endpoint = `/api/premium-emails/inbox?sessionId=${sessionId}&userId=${userData.id}`;
    }

    apiFetch(endpoint)
        .then(r => r.json())
        .then(data => {
            if (refreshIcon) refreshIcon.classList.remove("fa-spin");
            if (data.code === 'BLOCKED_PROVIDER') {
                handleBlockedProviderInbox(type, data.message);
                return;
            }
            if (refreshCost > 0 && data && typeof data.newBalance === 'number') {
                userData.tokens = data.newBalance;
                renderBalances();
                updateMailBalance(type);
            } else if (refreshCost > 0) {
                userData.tokens = Math.max(0, (userData.tokens || 0) - refreshCost);
                renderBalances();
                updateMailBalance(type);
            }
            renderInbox(data.messages || [], type, data.message || data.note);
        })
        .catch((err) => {
            if (refreshIcon) refreshIcon.classList.remove("fa-spin");
            renderInbox([], type, "Connection error: " + (err.message || "Unknown"));
        });
}

function handleBlockedProviderInbox(type, message) {
    const listEl = document.getElementById(type + "InboxList");
    if (!listEl) return;
    
    listEl.innerHTML = `
        <div style="text-align:center; padding:30px 15px; background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.2); border-radius:12px; margin:10px;">
            <i class="fas fa-exclamation-triangle" style="font-size:36px; color:#ef4444; margin-bottom:12px;"></i>
            <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-bottom:8px;">Outdated Mail Provider</div>
            <p style="font-size:12px; color:var(--text-sub); line-height:1.5; margin-bottom:16px;">
                Your current temporary email is on a provider that is currently experiencing connection blocks. 
                We will upgrade your mailbox to a 100% working provider for FREE.
            </p>
            <button onclick="upgradeBlockedProvider('${type}')" 
                style="background: #10b981; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size:13px; font-weight:700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow:0 4px 10px rgba(16,185,129,0.3); outline: none;">
                <i class="fas fa-rocket"></i> UPGRADE FOR FREE
            </button>
        </div>
    `;
    
    const otpListEl = document.getElementById(type + "OtpList");
    if (otpListEl) {
        otpListEl.innerHTML = `<div style="font-size:11px; color:#ef4444; padding:10px; font-weight:700;">Provider Outdated</div>`;
    }
}

function upgradeBlockedProvider(type) {
    if (!type) type = 'temp';
    const addrEl = document.getElementById(type + "MailAddr");
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i>upgrading...';
        addrEl.style.fontStyle = 'italic';
        addrEl.style.opacity = '0.7';
    }
    
    apiFetch("/api/mail/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userData.id, cost: 0, type, isUpgrade: true })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.email) {
            mailSessions[type] = { ...data, createdAt: Date.now() };
            if (addrEl) {
                addrEl.textContent = data.email;
                addrEl.style.fontStyle = "normal";
                addrEl.style.opacity = "1";
            }
            updateMailBalance(type);
            refreshInbox(type);
            window.showToast("✅ Mailbox upgraded successfully to a fast, working provider!", "success");
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            window.showToast("❌ Upgrade failed: " + (data.message || "Try again"), "error");
            if (addrEl) {
                addrEl.innerHTML = '<span style="color:#f87171;">Failed. Tap UPGRADE FOR FREE.</span>';
            }
        }
    })
    .catch(err => {
        window.showToast("❌ Connection error. Please try again.");
        if (addrEl) {
            addrEl.innerHTML = '<span style="color:#f87171;">Network error.</span>';
        }
    });
}

window.upgradeBlockedProvider = upgradeBlockedProvider;

function getTimeAgo(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

function renderInbox(emails, type, serverMsg = null) {
    const listEl = document.getElementById(type + "InboxList");
    const otpListEl = document.getElementById(type + "OtpList");
    if (!listEl) return;

    // Show at most 10 messages
    if (Array.isArray(emails) && emails.length > 10) {
        emails = emails.slice(0, 10);
    }

    if (emails.length === 0) {
        const emptyMsg = serverMsg ? `<div style="color:#ef4444; font-weight:600; margin-bottom:5px; font-size:11px;">${serverMsg}</div>` : "";
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-sub);">
            <i class="fas fa-inbox" style="font-size:32px; margin-bottom:10px; opacity:0.3;"></i>
            ${emptyMsg}
            <div style="font-size:12px;">Waiting for incoming emails...</div>
        </div>`;
        if (otpListEl) otpListEl.innerHTML = `<div style="font-size:11px; color:var(--text-sub); padding:10px;">No OTP yet</div>`;
        return;
    }

    // OTP EXTRACTION
    let otps = [];

    emails.forEach(email => {
        // If backend already successfully extracted OTP, use it directly
        if (email.otp) {
            if (!otps.some(o => o.code === email.otp)) {
                otps.push({ code: email.otp, from: email.from || email.sender || 'Unknown' });
            }
        } else {
            const combined = ((email.subject || '') + " " + (email.body || email.preview || '')).toUpperCase();
            const extracted = extractOtp(combined);
            if (extracted) {
                if (!otps.some(o => o.code === extracted)) {
                    otps.push({ code: extracted, from: email.from || email.sender || 'Unknown' });
                }
            }
        }
    });

    // Render OTP chips - Show only the LATEST OTP in a single box
    if (otpListEl) {
        if (otps.length > 0) {
            // Get the most recent OTP (first in the list from newest email)
            const latestOtp = otps[0];
            otpListEl.innerHTML = `
                <div class="otp-chip" style="padding: 10px 16px; height: 50px; display: flex; align-items: center; justify-content: space-between; background: rgba(34, 197, 94, 0.2); border: 2px solid #22c55e; border-radius: 12px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px; color:#22c55e; font-weight:900; text-transform:uppercase; background:rgba(34,197,94,0.1); padding:2px 6px; border-radius:4px;">CODE</span>
                        <span class="oc-code" style="font-size: 24px; font-weight: 900; color: #fff; letter-spacing: 2px; font-family: monospace;">${latestOtp.code}</span>
                    </div>
                    <button class="oc-copy" onclick="copyOtpFromChip(this, '${latestOtp.code}')" 
                        style="width:36px; height:36px; border-radius:10px; background:#22c55e; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s; box-shadow: 0 2px 6px rgba(34, 197, 94, 0.3);">
                        <i class="fas fa-copy" style="color:#000; font-size:14px;"></i>
                    </button>
                </div>
            `;
        } else {
            otpListEl.innerHTML = `<div style="font-size:11px; color:var(--text-sub); padding:10px; text-align:left; font-style:italic;">Waiting for code...</div>`;
        }
    }

    // Render Inbox List
    listEl.innerHTML = emails.map(email => `
        <div class="inbox-item" onclick="openEmailMessage('${email.id}', '${type}')" style="cursor:pointer; transition:all 0.2s; border-left: 3px solid transparent;">
            <div class="ii-icon" style="background:rgba(245,158,11,0.1);"><i class="fas fa-envelope" style="color:#f59e0b;"></i></div>
            <div class="ii-body" style="flex:1; min-width:0;">
                <div class="ii-top" style="margin-bottom:2px; display:flex; justify-content:space-between; align-items:center;">
                    <div class="ii-sender" style="font-weight:800; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; padding-right:10px;">${email.from || email.sender || 'Unknown'}</div>
                    <div class="ii-time" style="font-size:10px; opacity:0.6; flex-shrink:0;">${email.time || getTimeAgo(email.date) || ''}</div>
                </div>
                <div class="ii-subject" style="font-size:11px; color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${email.subject}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="ii-quick-copy" onclick="event.stopPropagation(); quickCopyEmailContent('${email.id}', '${type}', this)" 
                    style="width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; color:var(--text-sub);">
                    <i class="fas fa-copy" style="font-size:12px;"></i>
                </button>
                <i class="fas fa-chevron-right" style="font-size:10px; color:var(--text-sub); opacity:0.5;"></i>
            </div>
        </div>
    `).join("");

    window[`_emails_${type}`] = emails;
}

function quickCopyEmailContent(msgId, type, btn) {
    const emails = window[`_emails_${type}`] || [];
    const msg = emails.find(e => e.id == msgId);
    if (!msg) return;

    const content = (msg.subject || '') + " " + (msg.body || msg.preview || '');

    // Extract OTP (4-8 digits)
    const otpMatch = content.match(/\b\d{4,8}\b/);

    // Extract URL/Link
    const urlRegex = /(https?:\/\/[^\s<>'"{}|\^`\[\]]+)/i;
    const urlMatch = content.match(urlRegex);

    let textToCopy = '';
    if (otpMatch) {
        textToCopy = otpMatch[0];
    } else if (urlMatch) {
        textToCopy = urlMatch[0];
    }

    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

            // Visual feedback on button
            const icon = btn.querySelector('i');
            if (icon) {
                const originalClass = icon.className;
                icon.className = 'fas fa-check';
                btn.style.background = '#22c55e';
                setTimeout(() => {
                    icon.className = originalClass;
                    btn.style.background = '';
                }, 1000);
            }
        });
    } else {
        // Fallback or nothing found
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
}

function openEmailMessage(msgId, type) {
    const emails = window[`_emails_${type}`] || [];
    const msg = emails.find(e => e.id == msgId);
    if (!msg) return;

    document.getElementById("mdSubject").textContent = msg.subject;
    document.getElementById("mdFrom").textContent = msg.from || msg.sender || "Unknown";
    document.getElementById("mdTo").textContent = mailSessions[type] ? mailSessions[type].email : "...";
    document.getElementById("mdDate").textContent = msg.time || "Recent";
    document.getElementById("mdBody").innerHTML = msg.body || msg.preview;

    const content = msg.subject + " " + (msg.body || msg.preview);

    // ✅ FIX: Use robust OTP extraction (same as inbox list)
    let otpCode = null;
    if (msg.otp) {
        otpCode = msg.otp;
    } else {
        // Try to extract from content
        const extracted = extractOtp(content);
        otpCode = extracted;
    }

    // Extract URL/Link
    const urlRegex = /(https?:\/\/[^\s<>'"{}|\^`\[\]]+)/i;
    const urlMatch = content.match(urlRegex);

    const otpContainer = document.getElementById("mdOtpContainer");
    const linkContainer = document.getElementById("mdLinkContainer");

    // Show OTP if found
    if (otpCode) {
        otpContainer.style.display = "block";
        document.getElementById("mdOtpCode").textContent = otpCode;
    } else {
        otpContainer.style.display = "none";
    }

    // Show Link if found
    if (urlMatch) {
        linkContainer.style.display = "block";
        document.getElementById("mdLinkUrl").textContent = urlMatch[0];
        document.getElementById("mdLinkUrl").href = urlMatch[0];
    } else {
        linkContainer.style.display = "none";
    }

    nav("emailMessage");
}

function copyTextSilent(txt) {
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => {
        // Silent copy - no alert
    }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        // Silent copy - no alert
    });
}

function copySimpleText(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent || el.href || '';
    copyTextSilent(text);

    // Find the button that was clicked and show checkmark feedback
    const buttons = document.querySelectorAll('.oc-copy');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(id)) {
            const icon = btn.querySelector('i');
            if (icon) {
                const originalClass = icon.className;
                const originalBg = btn.style.background;

                // Change to checkmark
                icon.className = 'fas fa-check';
                btn.style.background = '#22c55e';

                // Revert after 1 second
                setTimeout(() => {
                    icon.className = originalClass;
                    btn.style.background = originalBg || '';
                }, 1000);
            }
        }
    });
}

function copyRichText(id) {
    copyTextSilent(document.getElementById(id).innerText);
}

function copyEmailToClipboard(id) {
    const text = document.getElementById(id).textContent;
    copyTextSilent(text);

    // Find the button that was clicked and show checkmark feedback
    const buttons = document.querySelectorAll('button[onclick*="copyEmailToClipboard" i]');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(id)) {
            const icon = btn.querySelector('i');
            if (icon) {
                // Change to checkmark
                icon.className = 'fas fa-check';
                btn.style.background = '#22c55e';

                // Revert after 1 second
                setTimeout(() => {
                    icon.className = 'fas fa-copy';
                    btn.style.background = '#f59e0b';
                }, 1000);
            }
        }
    });
}



// Initial Render & Auto Login
renderBalances();
applyProfilePhoto(_tgUser.photo_url || ''); // Immediately show photo from Telegram
// NOTE: registerAndFetchUser is now called inside DOMContentLoaded to prevent race conditions

// Poll for balance updates (every 2s)
setInterval(registerAndFetchUser, 2000);
setInterval(syncAdminData, 2000);
setInterval(() => {
    if (currentPage === 'tasks') {
        loadUserTasks(true); // pass true to indicate silent refresh so we don't show loaders
    }
    if (currentPage === 'admin') {
        loadAdminMessages(); // silently refresh admin messages
    }
    if (currentPage === 'support' && typeof loadUserMessages === 'function') {
        loadUserMessages();
    }
    if (currentPage === 'notifications') {
        loadNotifications(); // Refresh notifications page when open
    }
}, 3000);

// Poll notifications every 10 seconds to catch admin gifts/messages/broadcasts
setInterval(() => {
    if (userData && userData.id) {
        loadNotifications();
    }
}, 10000);


// ---- PURCHASE RECEIPT CLOSE ----
function closeReceiptModal() {
    const m = document.getElementById('purchaseReceiptModal');
    if (m) m.style.display = 'none';
}

function copyReceiptField(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const text = el.textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
    }
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    window.showToast('✅ Copied!');
}

// ---- EMAIL SERVICE TOGGLES & NAVIGATION ----

// Check which email services are available and navigate accordingly
function handleEmailMenuNavigation() {
    // Get cards and show them (always show both for now)
    const emailServiceCard = document.getElementById('emailServiceCard');
    const tempMailCard = document.getElementById('tempMailCard');
    const premiumGmailCard = document.getElementById('premiumGmailCard');

    if (emailServiceCard) {
        emailServiceCard.style.display = 'block';
    }
    if (tempMailCard) {
        tempMailCard.style.display = 'block';
    }
    if (premiumGmailCard) {
        premiumGmailCard.style.display = 'block';
    }
}

// Keep old function name for backward compatibility but use new implementation
function checkEmailServicesAndNavigate() {
    handleEmailMenuNavigation();
}

// Fetch config on load (fetchEmailServiceConfig is defined below)
if (typeof fetchEmailServiceConfig === 'function') fetchEmailServiceConfig();
// Refresh config periodically
setInterval(function () { if (typeof fetchEmailServiceConfig === 'function') fetchEmailServiceConfig(); }, 5000);

// --------------------------------------------------------
// CHECKOUT PAGE FUNCTIONS
// --------------------------------------------------------
let checkoutData = {
    qty: 1,
    price: 3.00,
    paymentMethod: 'binance'
};

function updateCheckoutQty(change) {
    checkoutData.qty += change;
    if (checkoutData.qty < 1) checkoutData.qty = 1;
    if (checkoutData.qty > 10) checkoutData.qty = 10;

    const qtyEl = document.getElementById('checkoutQty');
    const totalEl = document.getElementById('checkoutTotal');

    if (qtyEl) qtyEl.textContent = checkoutData.qty;
    if (totalEl) totalEl.textContent = '$' + (checkoutData.qty * checkoutData.price).toFixed(2);
}

function selectCheckoutPM(method) {
    checkoutData.paymentMethod = method;

    // Update UI
    const binanceCard = document.getElementById('pm_binance');
    const faucetCard = document.getElementById('pm_faucet');
    const checkBinance = document.getElementById('check_binance');
    const checkFaucet = document.getElementById('check_faucet');

    if (method === 'binance') {
        if (binanceCard) {
            binanceCard.style.border = '2px solid #FCD535';
            binanceCard.style.background = 'var(--bg-card)';
        }
        if (faucetCard) {
            faucetCard.style.border = '1px solid var(--border-color)';
            faucetCard.style.background = 'var(--bg-card)';
        }
        if (checkBinance) {
            checkBinance.style.background = '#FCD535';
            checkBinance.style.color = '#000';
            checkBinance.innerHTML = '<i class="fas fa-check"></i>';
        }
        if (checkFaucet) {
            checkFaucet.style.background = 'transparent';
            checkFaucet.style.border = '2px solid var(--border-color)';
            checkFaucet.style.color = 'transparent';
            checkFaucet.innerHTML = '';
        }
    } else {
        if (faucetCard) {
            faucetCard.style.border = '2px solid #3b82f6';
            faucetCard.style.background = 'var(--bg-card)';
        }
        if (binanceCard) {
            binanceCard.style.border = '1px solid var(--border-color)';
            binanceCard.style.background = 'var(--bg-card)';
        }
        if (checkFaucet) {
            checkFaucet.style.background = '#3b82f6';
            checkFaucet.style.border = 'none';
            checkFaucet.style.color = '#fff';
            checkFaucet.innerHTML = '<i class="fas fa-check"></i>';
        }
        if (checkBinance) {
            checkBinance.style.background = 'transparent';
            checkBinance.style.color = 'transparent';
            checkBinance.innerHTML = '';
        }
    }
}

function submitCheckoutPayment() {
    const txnId = document.getElementById('checkoutTxnId')?.value;
    if (!txnId || txnId.trim() === '') {
        window.showToast('Please enter your Transaction ID to confirm payment.');
        return;
    }

    window.showToast('✅ Payment submitted!\n\nWe will verify your transaction and deliver your order shortly.');
    nav('home');
}

// Export checkout functions
window.updateCheckoutQty = updateCheckoutQty;
window.selectCheckoutPM = selectCheckoutPM;
window.submitCheckoutPayment = submitCheckoutPayment;

// Export Email Functions
function openTempMailDirect() {
    if (!checkFeatureOrComingSoon('tempMail', 'Temp Mail')) return;
    nav('mailService');
    window._currentMailType = 'temp';
    updateMailBalance('temp');

    // Check if email needs auto-generation (first time or 24hr expired)
    const session = mailSessions.temp;
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (!session || !session.email) {
        // First time - no email exists, auto-generate
        console.log('First time user - auto-generating email');
        setTimeout(() => {
            autoGenerateTempMail();
        }, 500);
    } else if (session.createdAt && (now - session.createdAt > TWENTY_FOUR_HOURS)) {
        // 24 hours passed - auto-generate new email
        console.log('24 hours passed - auto-generating new email');
        mailSessions.temp = null; // Clear old session
        setTimeout(() => {
            autoGenerateTempMail();
        }, 500);
    }
    // Otherwise: Email exists and is fresh, user keeps current email
}

function autoGenerateTempMail() {
    if (checkZeroBalanceAdTrigger()) return;
    const type = 'temp';
    const cost = (parseInt(window.appCostConfig?.mailCost) || 10);

    // Check user login
    if (!userData.id || userData.id === 0) {
        console.log('AutoGenerate: No user login');
        const addrEl = document.getElementById(type + "MailAddr");
        if (addrEl) {
            addrEl.innerHTML = '<span style="color:#f87171;">Please login first</span>';
        }
        return;
    }

    // Check tokens
    if (Math.max(0, userData.tokens || 0) < cost) {
        console.log('AutoGenerate: Insufficient tokens');
        nav('earn');
        return;
    }

    const addrEl = document.getElementById(type + "MailAddr");
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i>generating...';
        addrEl.style.fontStyle = 'italic';
        addrEl.style.opacity = '0.7';
    }

    console.log('AutoGenerate: Fetching live email for user', userData.id);

    apiFetch("/api/mail/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userData.id, cost, type })
    })
        .then(r => r.json())
        .then(data => {
            console.log('AutoGenerate: Response', data);
            if (data.success && data.email) {
                // Success - real email from provider
                userData.tokens = (typeof data.newBalance === 'number') ? data.newBalance : Math.max(0, (userData.tokens || 0) - cost);
                renderBalances();
                mailSessions[type] = { ...data, createdAt: Date.now() };
                // Show email
                if (addrEl) {
                    addrEl.textContent = data.email;
                    addrEl.style.fontStyle = "normal";
                    addrEl.style.opacity = "1";
                }
                updateMailBalance(type);
                refreshInbox(type);
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                // Failed - show error
                console.log('AutoGenerate: Failed -', data.message);
                if (addrEl) {
                    addrEl.innerHTML = '<span style="color:#f87171;">Failed: ' + (data.message || 'Try again') + '</span>';
                    addrEl.style.fontStyle = "normal";
                }
            }
        })
        .catch((err) => {
            console.log('AutoGenerate: Network error', err);
            if (addrEl) {
                addrEl.innerHTML = '<span style="color:#f87171;">Network error. Tap NEW GMAIL</span>';
                addrEl.style.fontStyle = "normal";
            }
        });
}

function generateDemoTempMail(type, cost) {
    console.log('DemoMail: Generating demo email for', type);
    const domains = type === "temp" ? ["tempmail.dev", "mailnull.com", "inboxkitten.com"] : ["premium-inbox.com", "private-mail.net"];
    const email = "user" + Math.floor(Math.random() * 99999) + "@" + domains[Math.floor(Math.random() * domains.length)];
    console.log('DemoMail: Generated email', email);
    mailSessions[type] = { email, id: "demo_" + Date.now(), type, sessionId: "demo_" + Date.now() };
    userData.tokens = Math.max(0, (userData.tokens || 0) - (parseInt(cost) || 0));
    renderBalances();
    // Clear loading state and show email
    const addrEl = document.getElementById(type + "MailAddr");
    console.log('DemoMail: addrEl found?', !!addrEl);
    if (addrEl) {
        addrEl.innerHTML = email; // Use innerHTML to ensure display
        addrEl.style.fontStyle = "normal";
        addrEl.style.opacity = "1";
        console.log('DemoMail: Email set to element');
    }
    updateMailBalance(type);
    refreshInbox(type);
}

var assignedPremiumEmail = null;
var currentPremiumTab = 'gmail';

function switchPremiumTab(tabStr) {
    // Handle both Mail and Subscriptions tabs
    const mailTabs = ['gmail', 'hotmail', 'student'];
    const subTabs = ['vpn', 'account'];

    if (mailTabs.includes(tabStr)) {
        currentPremiumTab = tabStr;
        mailTabs.forEach(t => {
            const btn = document.getElementById('tab-' + t);
            if (!btn) return;
            if (t === tabStr) {
                btn.style.background = 'rgba(245,158,11,0.2)';
                btn.style.color = '#f59e0b';
                btn.classList.add('active');
            } else {
                btn.style.background = 'var(--bg-card)';
                btn.style.color = 'var(--text-sub)';
                btn.classList.remove('active');
            }
        });

        // Update display info
        const typeEl = document.getElementById('premiumMailType');
        if (typeEl) typeEl.textContent = tabStr.charAt(0).toUpperCase() + tabStr.slice(1);

        const costBadge = document.getElementById('premiumMailCostBadge');
        if (costBadge && window.appCostConfig) {
            const cost = tabStr === 'gmail' ? window.appCostConfig.gmailCost :
                tabStr === 'hotmail' ? window.appCostConfig.hotmailCost :
                    window.appCostConfig.studentEmailCost;
            costBadge.textContent = `${cost || 50} TC / ${tabStr.charAt(0).toUpperCase() + tabStr.slice(1)}`;
        }

        // Trigger loading or refresh
        loadPremiumEmailsFromAdmin();
    } else {
        // Original VPN/Account switch logic
        subTabs.forEach(t => {
            const btn = document.getElementById('ptab-' + t);
            const content = document.getElementById('premiumTab-' + t);
            if (btn && content) {
                if (t === tabStr) {
                    btn.style.background = 'var(--accent-color)';
                    btn.style.color = '#000';
                    content.style.display = 'block';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-sub)';
                    content.style.display = 'none';
                }
            }
        });
    }
}
window.switchPremiumTab = switchPremiumTab;

async function loadPremiumEmailsFromAdmin(forceNew = false) {
    const addrEl = document.getElementById('premiumMailAddr');
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>searching...';
    }

    // ✅ FIX: Clear existing session if forceNew is true (for NEW EMAIL button)
    if (forceNew && mailSessions && mailSessions.premium) {
        mailSessions.premium = null;
        window._isAutoGeneratingPremium = false;
    }

    // Try to fetch active emails from server if local is not set
    try {
        const uid = (window.userData && window.userData.id) ? window.userData.id : 0;
        if (uid && (!mailSessions || !mailSessions.premium || mailSessions.premium.type !== currentPremiumTab || forceNew)) {
            const res = await apiFetch('/api/mail/active?userId=' + uid + '&t=' + Date.now()); // ✅ FIX: Add cache buster
            const data = await res.json();
            if (data.success && data.activeSessions && !forceNew) {
                // Determine internal type mapping
                let internalCheckType = currentPremiumTab; // 'gmail', 'hotmail', 'student'
                if (internalCheckType === 'gmail') internalCheckType = 'gmail';
                // Find matching active session block
                let foundSession = data.activeSessions[internalCheckType] || data.activeSessions['admin_pool_' + internalCheckType];
                if (!foundSession && internalCheckType === 'gmail') foundSession = data.activeSessions['premium'];

                if (foundSession) {
                    if (!mailSessions) { mailSessions = { temp: null, premium: null }; }
                    mailSessions.premium = {
                        id: foundSession.id,
                        email: foundSession.email,
                        type: currentPremiumTab,
                        sessionId: foundSession.sessionId
                    };
                }
            }
        }
    } catch (e) {
        console.warn('Could not fetch active emails:', e);
    }

    // Check if we have an existing session for this type (skip if forceNew)
    if (!forceNew && mailSessions && mailSessions.premium && mailSessions.premium.type === currentPremiumTab) {
        assignedPremiumEmail = mailSessions.premium;
        // Extract email string if it's an object
        const emailStr = (typeof assignedPremiumEmail.email === 'object' && assignedPremiumEmail.email !== null)
            ? (assignedPremiumEmail.email.email || '')
            : (assignedPremiumEmail.email || '');
        if (addrEl) {
            if (emailStr) {
                addrEl.textContent = emailStr;
                addrEl.style.fontStyle = "normal";
                addrEl.style.opacity = "1";
            } else {
                addrEl.innerHTML = '<span style="color:#94a3b8;">No Active Email</span>';
            }
        }
        loadPremiumEmailMessages(assignedPremiumEmail.id);
        return;
    }

    // If no session, wait a brief moment and auto-generate
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i>generating...';
    }

    // ✅ FIX: Reset flag if forceNew to allow new generation
    if (forceNew) {
        window._isAutoGeneratingPremium = false;
    }

    // Prevent overlapping auto-generations
    if (window._isAutoGeneratingPremium) return;
    window._isAutoGeneratingPremium = true;

    setTimeout(async () => {
        try {
            await autoGeneratePremiumMailWrapper();
        } finally {
            window._isAutoGeneratingPremium = false;
        }
    }, 500);
}

async function generatePremiumMail(provider) {
    let addrElId = 'premiumMailAddr';
    if (provider === 'hotmail') addrElId = 'hotMailAddr';
    else if (provider === 'student') addrElId = 'studentMailAddr';

    const addrEl = document.getElementById(addrElId);
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>generating...';
        addrEl.style.fontStyle = "italic";
        addrEl.style.opacity = "0.8";
    }

    try {
        const res = await apiFetch('/api/premium-emails/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                provider: provider || 'gmail'
            })
        });
        const data = await res.json();
        if (data.success) {
            // data.email can be an object {email, id} or a string — extract string
            const emailStr = (typeof data.email === 'object' && data.email !== null)
                ? (data.email.email || JSON.stringify(data.email))
                : (data.email || '');

            let assignedPremiumEmail = {
                id: data.sessionId,
                email: emailStr,
                type: provider || 'gmail'
            };

            // Map the provider to the correct frontend type string usually used in mailSessions
            let sessionType = 'premium';
            if (provider === 'hotmail') sessionType = 'hot';
            if (provider === 'student') sessionType = 'student';

            mailSessions[sessionType] = assignedPremiumEmail;

            // ✅ FIX: Update the email address display immediately
            if (addrEl) {
                if (emailStr) {
                    addrEl.textContent = emailStr;
                } else {
                    addrEl.innerHTML = '<span style="color:#f87171;">Email generation failed.</span>';
                }
                addrEl.style.fontStyle = "normal";
                addrEl.style.opacity = "1";
            }

            // ✅ FIX: Update balance
            if (typeof data.newBalance === 'number') {
                userData.tokens = data.newBalance;
                renderBalances();
            }

            // ✅ FIX: Refresh inbox and show success message
            refreshInbox(sessionType);
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            window.showToast('✅ ' + (provider === 'hotmail' ? 'Hotmail' : (provider === 'student' ? 'Student Email' : 'Gmail')) + ' generated successfully!');
        } else {
            if (addrEl) {
                addrEl.innerHTML = '<span style="color:#f87171;">' + (data.message || 'No email available.') + '</span>';
                addrEl.style.fontStyle = "normal";
                addrEl.style.opacity = "1";
            }
            window.showToast('❌ ' + (data.message || 'No email in pool. Admin needs to add more.'));
        }
    } catch (e) {
        console.error('Error generating premium mail:', e);
        if (addrEl) {
            addrEl.innerHTML = '<span style="color:#f87171;">Network error. Retry later</span>';
            addrEl.style.fontStyle = "normal";
            addrEl.style.opacity = "1";
        }
        window.showToast('❌ Network error. Please try again.');
    }
}


async function loadPremiumEmailMessages(sessionId) {
    const listEl = document.getElementById('premiumInboxList');
    if (!listEl) return;

    listEl.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';

    try {
        const uid = (window.userData && window.userData.id) ? window.userData.id : (userData && userData.id ? userData.id : 0);
        const res = await apiFetch(`/api/premium-emails/inbox?sessionId=${sessionId}&userId=${uid}`);
        const data = await res.json();

        if (data.success && data.messages) {
            if (data.messages.length === 0) {
                listEl.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-sub); font-size:13px;">No messages received matching your filters yet.</div>';
            } else {
                listEl.innerHTML = '';
                data.messages.forEach(msg => {
                    const item = document.createElement('div');
                    item.className = 'inbox-item';
                    item.style.padding = '15px';
                    item.style.borderBottom = '1px solid var(--border-color)';
                    item.onclick = () => openPremiumEmailMessage(msg);
                    item.innerHTML = `
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="font-weight:700; color:var(--text-main); font-size:14px;">${msg.from || 'Unknown'}</span>
                            <span style="font-size:11px; color:var(--text-sub);">${msg.date || ''}</span>
                        </div>
                        <div style="font-weight:600; font-size:13px; color:var(--text-main); margin-bottom:4px;">${msg.subject || '(No Subject)'}</div>
                        <div style="font-size:12px; color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${msg.snippet || msg.body?.substring(0, 50) || ''}</div>
                    `;
                    listEl.appendChild(item);
                });
            }
        } else {
            listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-sub);">Error loading inbox.</div>';
        }
    } catch (e) {
        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-sub);">Connection error.</div>';
    }
}

function openPremiumEmailMessage(msg) {
    const modal = document.getElementById('emailMessageModal');
    if (!modal) return;

    document.getElementById('msgFrom').textContent = msg.from;
    document.getElementById('msgSubject').textContent = msg.subject;
    document.getElementById('msgDate').textContent = msg.date;
    document.getElementById('msgBody').innerHTML = msg.html || msg.body;

    modal.style.display = 'block';
}

function selectPremiumEmail(id) {
    // Utility for selection if multiple provided
}

function openPremiumMailDirect() {
    if (!checkFeatureOrComingSoon('premiumMail', 'Premium Mail')) return;
    nav('premiumMail');
    window._currentMailType = 'premium';
    updateMailBalance('premium');

    // Make sure we select 'gmail' (the default) if no currentPremiumTab is set
    if (!currentPremiumTab) currentPremiumTab = 'gmail';

    // We delegate completely to loadPremiumEmailsFromAdmin which will fetch active 
    // sessions from the server, and only generate an email if none is found.
    loadPremiumEmailsFromAdmin();
}

async function autoGeneratePremiumMailWrapper() {
    if (checkZeroBalanceAdTrigger()) return;

    // Check if we already have an active session for this specific tab before generating
    if (mailSessions && mailSessions.premium && mailSessions.premium.type === (currentPremiumTab || 'gmail')) {
        return;
    }

    const cost = parseInt(window.appCostConfig?.premiumMailCost) || 50;

    if (!userData.id || userData.id === 0) {
        const addrEl = document.getElementById('premiumMailAddr');
        if (addrEl) {
            addrEl.innerHTML = '<span style="color:#f87171;">Please login first</span>';
        }
        return;
    }

    // Balance check removed to allow unlimited usage as requested

    const addrEl = document.getElementById('premiumMailAddr');
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i>generating...';
        addrEl.style.fontStyle = 'italic';
        addrEl.style.opacity = '0.7';
    }

    await generatePremiumMail(currentPremiumTab || 'gmail', cost);
}

function openHotmailDirect() {
    if (!checkFeatureOrComingSoon('hotMail', 'Hot Mail')) return;
    nav('hotMail');
    window._currentMailType = 'hot';
    updateMailBalance('hot');

    // Check if email needs auto-generation
    const session = mailSessions.hot;
    if (!session || !session.email) {
        setTimeout(() => {
            autoGenerateHotMail();
        }, 500);
    } else {
        const addrEl = document.getElementById('hotMailAddr');
        if (addrEl) addrEl.textContent = session.email;
        refreshInbox('hot');
    }
}

function autoGenerateHotMail() {
    if (checkZeroBalanceAdTrigger()) return;
    const type = 'hot';
    const cost = parseInt(window.appCostConfig?.hotMailCost) || 15;

    if (!userData.id || userData.id === 0) {
        const addrEl = document.getElementById(type + 'MailAddr');
        if (addrEl) {
            addrEl.innerHTML = '<span style="color:#f87171;">Please login first</span>';
        }
        return;
    }

    if (Math.max(0, userData.tokens || 0) < cost) {
        nav('earn');
        return;
    }

    const addrEl = document.getElementById(type + 'MailAddr');
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i>generating...';
        addrEl.style.fontStyle = 'italic';
        addrEl.style.opacity = '0.7';
    }

    apiFetch('/api/mail/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, cost, type })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.email) {
                userData.tokens = (typeof data.newBalance === 'number') ? data.newBalance : Math.max(0, (userData.tokens || 0) - cost);
                renderBalances();
                mailSessions[type] = { ...data, createdAt: Date.now() };
                if (addrEl) {
                    addrEl.textContent = data.email;
                    addrEl.style.fontStyle = 'normal';
                    addrEl.style.opacity = '1';
                }
                updateMailBalance(type);
                refreshInbox(type);
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                if (addrEl) {
                    addrEl.innerHTML = '<span style="color:#f87171;">Failed: ' + (data.message || 'Try again') + '</span>';
                    addrEl.style.fontStyle = 'normal';
                }
            }
        })
        .catch(() => {
            if (addrEl) {
                addrEl.innerHTML = '<span style="color:#f87171;">Network error. Tap NEW EMAIL</span>';
                addrEl.style.fontStyle = 'normal';
            }
        });
}

function openStudentEmailDirect() {
    if (!checkFeatureOrComingSoon('studentMail', 'Student Mail')) return;
    nav('studentMail');
    window._currentMailType = 'student';
    updateMailBalance('student');

    // Check if email needs auto-generation
    const session = mailSessions.student;
    if (!session || !session.email) {
        setTimeout(() => {
            autoGenerateStudentMail();
        }, 500);
    } else {
        const addrEl = document.getElementById('studentMailAddr');
        if (addrEl) addrEl.textContent = session.email;
        refreshInbox('student');
    }
}

function autoGenerateStudentMail() {
    if (checkZeroBalanceAdTrigger()) return;
    const type = 'student';
    const cost = parseInt(window.appCostConfig?.studentMailCost) || 20;

    if (!userData.id || userData.id === 0) {
        const addrEl = document.getElementById(type + 'MailAddr');
        if (addrEl) {
            addrEl.innerHTML = '<span style="color:#f87171;">Please login first</span>';
        }
        return;
    }

    if (Math.max(0, userData.tokens || 0) < cost) {
        nav('earn');
        return;
    }

    const addrEl = document.getElementById(type + 'MailAddr');
    if (addrEl) {
        addrEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i>generating...';
        addrEl.style.fontStyle = 'italic';
        addrEl.style.opacity = '0.7';
    }

    apiFetch('/api/mail/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, cost, type })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.email) {
                userData.tokens = (typeof data.newBalance === 'number') ? data.newBalance : Math.max(0, (userData.tokens || 0) - cost);
                renderBalances();
                mailSessions[type] = { ...data, createdAt: Date.now() };
                if (addrEl) {
                    addrEl.textContent = data.email;
                    addrEl.style.fontStyle = 'normal';
                    addrEl.style.opacity = '1';
                }
                updateMailBalance(type);
                refreshInbox(type);
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } else {
                if (addrEl) {
                    addrEl.innerHTML = '<span style="color:#f87171;">Failed: ' + (data.message || 'Try again') + '</span>';
                    addrEl.style.fontStyle = 'normal';
                }
            }
        })
        .catch(() => {
            if (addrEl) {
                addrEl.innerHTML = '<span style="color:#f87171;">Network error. Tap NEW EMAIL</span>';
                addrEl.style.fontStyle = 'normal';
            }
        });
}

function refreshPremiumInbox() {
    refreshInbox('premium');
}

// Export new functions
window.loadPremiumEmailsFromAdmin = loadPremiumEmailsFromAdmin;
window.selectPremiumEmail = selectPremiumEmail;
window.loadPremiumEmailMessages = loadPremiumEmailMessages;
window.refreshPremiumInbox = refreshPremiumInbox;
window.openPremiumEmailMessage = openPremiumEmailMessage;
window.generatePremiumMail = generatePremiumMail;

function autoGeneratePremiumMail() {
    // Replaced by loadPremiumEmailsFromAdmin
    loadPremiumEmailsFromAdmin();
}

function generateDemoPremiumMail(type, cost) {
    const domains = ["premium-inbox.com", "private-mail.net"];
    const email = "user" + Math.floor(Math.random() * 99999) + "@" + domains[Math.floor(Math.random() * domains.length)];
    mailSessions[type] = { email, id: "demo_" + Date.now(), type, sessionId: "demo_" + Date.now() };
    userData.tokens = Math.max(0, (userData.tokens || 0) - cost);
    renderBalances();
    updateMailBalance(type);
    refreshInbox(type);
}

function changeMailEmail(type) {
    // Clear current email and generate new one
    mailSessions[type] = null;
    generateTempMail(type);
}

function cancelMail(type) {
    // Cancel/close mail service
    mailSessions[type] = null;
    updateMailBalance(type);
    nav('home');
}

function copyMailEmail(type) {
    const email = mailSessions[type]?.email;
    if (email) {
        copyText(email);
        window.showToast('✅ Email copied: ' + email);
    } else {
        window.showToast('❌ No email to copy');
    }
}

function copyMailOtp(otp) {
    if (otp) {
        copyText(otp);
        window.showToast('✅ OTP copied: ' + otp);
    } else {
        window.showToast('❌ No OTP to copy');
    }
}

window.openTempMailDirect = openTempMailDirect;
window.generateTempMail = generateTempMail;
window.renewTempMail = renewTempMail;
window.autoGenerateTempMail = autoGenerateTempMail;
window.generateDemoTempMail = generateDemoTempMail;
window.openPremiumMailDirect = openPremiumMailDirect;
window.openPremiumGmailDirect = openPremiumGmailDirect;
window.autoGeneratePremiumMail = autoGeneratePremiumMail;
window.autoGeneratePremiumMailWrapper = autoGeneratePremiumMailWrapper;
window.generateDemoPremiumMail = generateDemoPremiumMail;
window.openHotmailDirect = openHotmailDirect;
window.autoGenerateHotMail = autoGenerateHotMail;
window.openStudentEmailDirect = openStudentEmailDirect;
window.autoGenerateStudentMail = autoGenerateStudentMail;
window.changeMailEmail = changeMailEmail;
window.cancelMail = cancelMail;
window.copyMailEmail = copyMailEmail;
window.refreshInbox = refreshInbox;
window.copyMailOtp = copyMailOtp;
window.updateMailBalance = updateMailBalance;

// REQUIRED CHANNELS/GROUPS CONFIG
let REQUIRED_JOINS = {
    channel: {
        id: '-1002188442004', // @AutosVerifych
        username: 'AutosVerifych',
        name: '📢 AutosVerify Channel'
    },
    group: {
        id: '-1002088203586', // @AutosVerify
        username: 'AutosVerify',
        name: '💬 AutosVerify Group'
    }
};

// Check if user joined required channels/groups
async function checkRequiredJoins() {
    if (!userData.id || userData.id === 0) {
        // Demo mode - skip check
        return { canProceed: true, allJoined: true };
    }

    try {
        const response = await apiFetch('/api/check-required-joins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id
            })
        });

        if (!response.ok) {
            console.warn('/api/check-required-joins HTTP error:', response.status);
            return { canProceed: true, allJoined: true };
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.warn('/api/check-required-joins non-JSON response:', text.slice(0, 100));
            return { canProceed: true, allJoined: true };
        }
    } catch (err) {
        console.error('Join check error:', err);
        return { canProceed: true, allJoined: true };
    }
}

// Show Require Telegram Modal when web visitor accesses directly
function showRequireTelegramModal() {
    if (featureFlags && featureFlags.requireTelegram === false) return;
    const isTgUser = !!(_tgUser?.id || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || (userData && userData.id && userData.id !== 0 && String(userData.id).length >= 5));
    if (isTgUser) return;

    let modal = document.getElementById('requireTelegramModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'requireTelegramModal';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(10, 10, 20, 0.98);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            backdrop-filter: blur(10px);
        `;
        document.body.appendChild(modal);
    }
    const botUsername = (window.BOT_USERNAME || 'AutoVerify_bot').replace('@', '');
    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1e1b4b, #0f172a);
            border: 1px solid rgba(168, 85, 247, 0.4);
            border-radius: 20px;
            padding: 30px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
        ">
            <div style="font-size: 52px; margin-bottom: 15px;">🤖</div>
            <h2 style="color: #a855f7; margin-bottom: 10px; font-size: 22px; font-weight: 800;">Telegram Required</h2>
            <p style="color: #cbd5e1; margin-bottom: 25px; font-size: 14px; line-height: 1.6;">
                Access to this Mini App is strictly restricted to Telegram users. Please open our official Telegram Bot to proceed.
            </p>
            <a href="https://t.me/${botUsername}" target="_blank" style="
                background: linear-gradient(135deg, #a855f7, #7c3aed);
                color: #fff;
                text-decoration: none;
                padding: 14px 28px;
                border-radius: 12px;
                font-weight: 700;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);
            ">
                <i class="fab fa-telegram-plane" style="font-size: 18px;"></i>
                <span>Open Telegram Bot</span>
            </a>
        </div>
    `;
}

// Show join required modal
function showJoinRequiredModal(missing) {
    // SECURITY FIX: Do not show if feature is disabled
    if (featureFlags && featureFlags.joinRequired === false) return;

    // Use dynamic config from server response if available
    const configData = missing.config || REQUIRED_JOINS;
    
    // Create modal if not exists
    let modal = document.getElementById('joinRequiredModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'joinRequiredModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.95);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        document.body.appendChild(modal);
    }

    let items = [];
    if (configData.channels && Array.isArray(configData.channels)) {
        configData.channels.forEach(ch => {
            const isMissing = missing.missingChannelsList && missing.missingChannelsList.some(m => String(m).toLowerCase().includes(String(ch.id || ch.username).toLowerCase().replace('@', '')));
            items.push({ 
                name: ch.name || ch.username || 'Channel', 
                username: ch.username || ch.id, 
                joined: !isMissing,
                type: 'Channel'
            });
        });
    }

    if (configData.groups && Array.isArray(configData.groups)) {
        configData.groups.forEach(gr => {
            const isMissing = missing.missingGroupsList && missing.missingGroupsList.some(m => String(m).toLowerCase().includes(String(gr.id || gr.username).toLowerCase().replace('@', '')));
            items.push({ 
                name: gr.name || gr.username || 'Group', 
                username: gr.username || gr.id, 
                joined: !isMissing,
                type: 'Group'
            });
        });
    }

    // Fallback if no dynamic config (unlikely with new API)
    if (items.length === 0) {
        if (configData.channel) items.push({ ...configData.channel, joined: missing.channelJoined, type: 'Channel' });
        if (configData.group) items.push({ ...configData.group, joined: missing.groupJoined, type: 'Group' });
    }

    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border: 1px solid rgba(249,115,22,0.5);
            border-radius: 20px;
            padding: 30px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        ">
            <div style="font-size: 48px; margin-bottom: 15px;">🔒</div>
            <h2 style="color: #f97316; margin-bottom: 10px; font-size: 22px;">Join Required</h2>
            <p style="color: #aaa; margin-bottom: 25px; font-size: 14px;">
                You must join our required communities to access the Mini App.
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                ${items.map(item => {
                    const isJoined = item.joined;
                    const style = isJoined ?
                        'background: #333; color: #888; text-decoration: line-through; pointer-events: none; opacity: 0.6;' :
                        'background: linear-gradient(135deg, #f59e0b, #d97706); color: #000;';
                    
                    let url = item.username;
                    if (url && !url.startsWith('http')) {
                        url = `https://t.me/${url.replace('@', '')}`;
                    }

                    return `
                        <a href="${url}" target="_blank" style="
                            ${style}
                            padding: 10px 15px;
                            border-radius: 10px;
                            text-decoration: ${isJoined ? 'line-through' : 'none'};
                            font-weight: 700;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: 0.2s;
                        ">
                            <span>Join ${item.name}</span>
                            ${isJoined ? '<i class="fas fa-check-circle" style="font-size: 12px; color: #22c55e;"></i>' : '<i class="fas fa-external-link-alt" style="font-size: 12px;"></i>'}
                        </a>
                    `;
                }).join('')}
            </div>
            <button onclick="verifyJoinsAndProceed()" style="
                background: linear-gradient(135deg, #22c55e, #16a34a);
                color: #fff;
                border: none;
                padding: 12px 25px;
                border-radius: 10px;
                font-weight: 700;
                font-size: 15px;
                cursor: pointer;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: 0.2s;
            ">
                <span>✓ I've Joined</span>
            </button>
            <p style="color: #666; margin-top: 15px; font-size: 12px;">
                Access will be granted automatically after joining.
            </p>
        </div>
    `;

    modal.style.display = 'flex';
}

// Verify joins and proceed
async function verifyJoinsAndProceed() {
    const btn = document.querySelector('#joinRequiredModal button');
    btn.innerHTML = '<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></span> Checking...';
    btn.disabled = true;

    const result = await checkRequiredJoins();

    if (result.canProceed) {
        const jrm = document.getElementById('joinRequiredModal');
        if (jrm) jrm.style.display = 'none';
        // Show verification toast if user was just verified
        if (result.verified && !result.adminVerified) {
            showToast('✅ You are now verified! Full access granted.');
        }
        // Continue with normal initialization
        continueInitialization();
    } else {
        btn.innerHTML = '<span>✗ Not Joined Yet</span>';
        btn.style.background = '#ef4444';

        // Brief delay then update the modal UI to reflect which ones are now joined
        setTimeout(() => {
            showJoinRequiredModal(result);
        }, 1500);
    }
}

// Continue with normal initialization after join check
async function continueInitialization() {
    showPage('home');
    applyProfilePhoto(userData.photo_url || _tgUser.photo_url || '');
    renderBalances();

    // Load all app config data immediately on startup
    await Promise.allSettled([
        loadFeatureFlags(),
        loadAppCostConfig(),
        syncAdminData()
    ]);

    // Apply feature flags immediately after loading
    applyFeatureFlagsToHome();

    // Load broadcasts and email service config
    loadBroadcast();
    fetchEmailServiceConfig();

    // Apply saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // Force a fresh user sync to ensure balances are up-to-date
    smartSync(true);

    // Check user verification status and show welcome toast
    try {
        const joinCheck = await checkRequiredJoins();
        if (joinCheck.adminVerified) {
            showToast('👑 Welcome Admin! You have full verified access.');
        } else if (joinCheck.verified) {
            showToast('✅ Welcome! You are verified and have full access.');
        }
    } catch (e) {
        // Silently ignore errors
    }
}


document.addEventListener('DOMContentLoaded', async function () {

    // Show banner immediately if already offline at load time
    if (!navigator.onLine && typeof _showOfflineBanner === 'function') _showOfflineBanner(true);

    try {
        // Re-initialize Telegram WebApp data in case SDK loaded after initial parse
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            const freshUser = tg.initDataUnsafe?.user || {};
            if (freshUser.id) {
                // Update global user data with fresh Telegram data
                userData.id = freshUser.id;
                userData.username = freshUser.first_name || freshUser.username || 'User';
                userData.firstName = freshUser.first_name || '';
                userData.lastName = freshUser.last_name || '';
                userData.photo_url = freshUser.photo_url || '';
                // Also update the module-level references
                Object.assign(_tgUser, freshUser);
            }
        }

        // Parallelize initial data fetching for faster load
        console.log('[INIT] Fetching core data...');
        const [_, featuresData] = await Promise.all([
            (async () => {
                if (userData.id && userData.id !== 0) {
                    try {
                        await registerAndFetchUser();
                        await loadBotName();
                        setTimeout(checkPendingGifts, 3000);
                    } catch (e) {
                        console.warn('[INIT] User registration/fetch error:', e.message);
                    }
                }
            })(),
            (async () => {
                try {
                    const res = await apiFetch('/api/features').catch(() => ({ json: () => ({ success: false }) }));
                    return await res.json().catch(() => ({ success: false }));
                } catch (e) {
                    console.warn('[INIT] Features fetch error:', e.message);
                    return { success: false };
                }
            })()
        ]);

        const joinRequired = featuresData.success ? (featuresData.features?.joinRequired !== false) : true;
        const requireTelegramFlag = featuresData.success ? (featuresData.features?.requireTelegram === true) : false;

        // Check 1: Require Telegram check for web visitors
        if (requireTelegramFlag) {
            const isNonTgVisitor = !_tgUser?.id && !window.Telegram?.WebApp?.initDataUnsafe?.user?.id && (!userData.id || userData.id === 0 || String(userData.id).length < 5);
            if (isNonTgVisitor) {
                console.log('[INIT] Require Telegram is active - blocking web visitor');
                showRequireTelegramModal();
                return;
            }
        }

        // Update REQUIRED_JOINS with dynamic data from server
        if (featuresData.success && featuresData.requiredJoins) {
            REQUIRED_JOINS = featuresData.requiredJoins;
            console.log('[INIT] Required Joins updated from server:', REQUIRED_JOINS);
        }

        // Check 2: Join Required check for Telegram users
        if (joinRequired && !userData.adminVerified && userData.id && userData.id !== 0) {
            console.log('[INIT] Join check enabled - verifying membership...');
            const joinCheck = await checkRequiredJoins();
            if (joinCheck && joinCheck.canProceed === false) {
                showJoinRequiredModal(joinCheck);
                return;
            }
            console.log('[INIT] Membership verified - proceeding to app');
        } else {
            console.log('[INIT] Join check skipped (verified: ' + !!userData.verified + ', admin: ' + !!userData.adminVerified + ') - proceeding to app');
        }

        continueInitialization();
    } catch (error) {
        console.error('[INIT] Critical initialization error:', error);
        // Show error message instead of blank screen
        document.body.innerHTML = `
            <div style="
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(135deg, #1a1a2e, #16213e);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
                text-align: center;
                color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
            ">
                <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                <h2 style="color: #f97316; margin-bottom: 10px;">Something went wrong</h2>
                <p style="color: #aaa; margin-bottom: 20px; max-width: 300px;">
                    The app failed to load. Please try refreshing or check your connection.
                </p>
                <button onclick="location.reload()" style="
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    color: #000;
                    border: none;
                    padding: 14px 30px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 16px;
                    cursor: pointer;
                ">🔄 Reload App</button>
                <p style="color: #666; margin-top: 15px; font-size: 12px;">
                    Error: ${error.message || 'Unknown error'}
                </p>
            </div>
        `;
    }
});

window.verifyJoinsAndProceed = verifyJoinsAndProceed;

function fetchEmailServiceConfig() {
    apiFetch('/api/admin/email-services')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                emailServiceConfig.emailServiceEnabled = data.emailServiceEnabled !== false;
                emailServiceConfig.tempMailEnabled = data.tempMailEnabled !== false;
            }
        })
        .catch(() => { });
}



function toggleAccountsView() {
    const gv = document.getElementById('accountsGridView');
    const lv = document.getElementById('accountsListView');
    if (gv.style.display === 'none') {
        gv.style.display = 'grid';
        lv.style.display = 'none';
    } else {
        gv.style.display = 'none';
        lv.style.display = 'flex';
    }
}

// Alias for legacy calls
function updateBalanceDisplay() { renderBalances(); }

// ==========================================
// MISSING WINDOW EXPORTS (for onclick handlers)
// ==========================================
window.generateService = generateService;
window.openService = openService;
window.copyText = copyText;
window.copyTextById = copyTextById;
window.copySimpleText = copySimpleText;
window.copyRichText = copyRichText;
window.copyToClipboard = copyToClipboard;

// ==========================================
// SMM INSTAGRAM MODULE FUNCTIONS
// ==========================================
let _smmCosts = { followers: 1, likes: 0.5, comments: 2, report: 5 };

async function loadSmmPage() {
    // Load cost config and cache in localStorage for traffic page too
    try {
        const r = await apiFetch('/api/admin/smm/costs');
        const d = await r.json();
        if (d.success) {
            _smmCosts = d.costs;
            // Cache for traffic tab
            localStorage.setItem('smmCosts', JSON.stringify(d.costs));
            // Update traffic cost variable if loaded
            if (d.costs.traffic) _trafficCostPerHundred = parseFloat(d.costs.traffic) || 1;
        }
    } catch (e) { }
    updateSmmPreview();
    loadSmmOrders();
    // Show user gems
    const gems = parseFloat(userData?.Gems || userData?.gems || 0);
    const el = document.getElementById('smmUserGems');
    if (el) el.textContent = gems.toFixed(2) + ' Gems';
}

function selectSmmService(service) {
    document.getElementById('smmSelectedService').value = service;
    // Update button styles
    ['followers', 'likes', 'comments', 'report'].forEach(s => {
        const btn = document.getElementById('smmBtn_' + s);
        if (!btn) return;
        if (s === service) {
            btn.style.borderColor = 'var(--accent-color)';
            btn.style.background = 'rgba(255,193,7,0.1)';
            btn.style.color = '#fff';
        } else {
            btn.style.borderColor = 'var(--border-color)';
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-sub)';
        }
    });
    updateSmmPreview();
}

function updateSmmQty(val) {
    document.getElementById('smmQtyDisplay').textContent = val;
    const manual = document.getElementById('smmQtyManual');
    if (manual) manual.value = val;
    updateSmmPreview();
}

function updateSmmQtyManual(val) {
    const qty = Math.max(1, parseInt(val) || 1);
    const slider = document.getElementById('smmQtySlider');
    if (slider) {
        slider.value = Math.min(qty, parseInt(slider.max));
    }
    document.getElementById('smmQtyDisplay').textContent = qty;
    updateSmmPreview();
}

function setSmmMaxQuantity() {
    const gems = parseFloat(userData?.Gems || userData?.gems || 0);
    const service = document.getElementById('smmSelectedService')?.value || 'followers';
    const costPerUnit = _smmCosts[service] || 1;
    const maxQty = Math.floor(gems / costPerUnit);
    if (maxQty <= 0) { showToast('Insufficient Gems!', 'error'); return; }
    const slider = document.getElementById('smmQtySlider');
    const display = document.getElementById('smmQtyDisplay');
    const manual = document.getElementById('smmQtyManual');
    if (slider) slider.value = Math.min(maxQty, parseInt(slider.max));
    if (display) display.textContent = maxQty;
    if (manual) manual.value = maxQty;
    updateSmmPreview();
}

function updateSmmPreview() {
    const service = document.getElementById('smmSelectedService')?.value || 'followers';
    const qty = parseInt(document.getElementById('smmQtySlider')?.value || 100);
    const costPerUnit = _smmCosts[service] || 1;
    const total = Math.ceil(qty * costPerUnit);
    const gems = parseFloat(userData?.Gems || userData?.gems || 0);

    const svcNames = { followers: 'Followers', likes: 'Likes', comments: 'Comments', report: 'Report' };
    const el = (id) => document.getElementById(id);
    if (el('smmCostService')) el('smmCostService').textContent = svcNames[service] || service;
    if (el('smmCostQty')) el('smmCostQty').textContent = qty.toLocaleString();
    if (el('smmCostPerUnit')) el('smmCostPerUnit').textContent = costPerUnit + ' Gem' + (costPerUnit !== 1 ? 's' : '');
    if (el('smmTotalCost')) el('smmTotalCost').textContent = total + ' Gems';
    if (el('smmUserGems')) el('smmUserGems').textContent = gems.toFixed(2) + ' Gems';

    // Disable submit if insufficient gems
    const btn = el('smmSubmitBtn');
    if (btn) {
        if (gems < total) {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        } else {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    }
}

async function submitSmmOrder() {
    const username = document.getElementById('smmUsername')?.value?.trim().replace('@', '');
    const service = document.getElementById('smmSelectedService')?.value || 'followers';
    const qty = parseInt(document.getElementById('smmQtySlider')?.value || 100);

    if (!username) { showToast('Please enter your Instagram username', 'error'); return; }
    if (!userData?.id) { showToast('Please login first', 'error'); return; }

    const btn = document.getElementById('smmSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

    try {
        const res = await apiFetch('/api/smm/instagram/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, username, service, quantity: qty })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Order submitted successfully!', 'success');
            userData.Gems = data.newGems;
            userData.gems = data.newGems;
            updateSmmPreview();
            loadSmmOrders();
            document.getElementById('smmUsername').value = '';
        } else {
            showToast(data.message || 'Failed to submit order', 'error');
        }
    } catch (e) {
        showToast('Network error. Please try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-instagram"></i> Submit Order'; }
    }
}

async function loadSmmOrders() {
    const list = document.getElementById('smmOrdersList');
    if (!list || !userData?.id) return;
    try {
        const res = await apiFetch('/api/smm/orders/' + userData.id);
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
            list.innerHTML = data.orders.map(o => {
                const statusColor = o.status === 'completed' ? '#22c55e' : o.status === 'cancelled' ? '#ef4444' : '#f59e0b';
                return '<div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
                    '<span style="font-weight:700; color:#fff;">@' + o.username + '</span>' +
                    '<span style="font-size:12px; font-weight:700; color:' + statusColor + ';">' + o.status.toUpperCase() + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px; color:var(--text-sub);">' +
                    o.service.charAt(0).toUpperCase() + o.service.slice(1) + ' x' + o.quantity + ' · ' + o.gemsSpent + ' Gems · ' +
                    new Date(o.createdAt).toLocaleDateString() +
                    '</div></div>';
            }).join('');
        } else {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">No orders yet</div>';
        }
    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Failed to load orders</div>';
    }
}
window.selectSmmService = selectSmmService;
window.updateSmmQty = updateSmmQty;
window.updateSmmQtyManual = updateSmmQtyManual;
window.setSmmMaxQuantity = setSmmMaxQuantity;
window.submitSmmOrder = submitSmmOrder;
window.loadSmmPage = loadSmmPage;
window.updateSmmPreview = updateSmmPreview;

// ==========================================
// SMM TAB SWITCHER
// ==========================================
function switchSmmTab(tab) {
    // tab: 'instagram' | 'traffic'
    const tabInstagram = document.getElementById('smmTabContent_instagram');
    const tabTraffic = document.getElementById('smmTabContent_traffic');
    const btnInstagram = document.getElementById('smmTabInstagram');
    const btnTraffic = document.getElementById('smmTabTraffic');
    if (!tabInstagram || !tabTraffic) return;

    if (tab === 'traffic') {
        tabInstagram.style.display = 'none';
        tabTraffic.style.display = 'block';
        btnInstagram.style.color = 'var(--text-sub)';
        btnInstagram.style.borderBottomColor = 'transparent';
        btnTraffic.style.color = '#10b981';
        btnTraffic.style.borderBottomColor = '#10b981';
        // Load traffic data
        if (typeof loadWebsiteTrafficPage === 'function') loadWebsiteTrafficPage();
    } else {
        tabTraffic.style.display = 'none';
        tabInstagram.style.display = 'block';
        btnTraffic.style.color = 'var(--text-sub)';
        btnTraffic.style.borderBottomColor = 'transparent';
        btnInstagram.style.color = '#e1306c';
        btnInstagram.style.borderBottomColor = '#e1306c';
        if (typeof loadSmmPage === 'function') loadSmmPage();
    }
}
window.switchSmmTab = switchSmmTab;

// ==========================================
// SMM INSTAGRAM — BRIDGE FUNCTIONS
// (HTML onclick uses these names, they delegate to the real implementations)
// ==========================================
var _smmCurrentService = null;
var _smmCostConfig = {};

function smmSelectService(service) {
    _smmCurrentService = service;

    // Highlight selected button
    document.querySelectorAll('.smm-svc-btn').forEach(function (btn) {
        var s = btn.getAttribute('data-service');
        if (s === service) {
            btn.style.borderColor = '#e6683c';
            btn.style.background = 'rgba(230,104,60,0.12)';
        } else {
            btn.style.borderColor = 'rgba(255,255,255,0.08)';
            btn.style.background = 'var(--bg-card)';
        }
    });

    // Show quantity section
    var qtySection = document.getElementById('smmQuantitySection');
    if (qtySection) qtySection.style.display = 'block';

    // Update service labels
    var svcNames = { followers: 'Followers', likes: 'Likes', comments: 'Comments', report: 'Report' };
    var label = svcNames[service] || service;
    var el1 = document.getElementById('smmServiceLabel');
    var el2 = document.getElementById('smmServiceLabel2');
    var el3 = document.getElementById('smmSummaryService');
    if (el1) el1.textContent = label;
    if (el2) el2.textContent = label;
    if (el3) el3.textContent = label;

    // Followers = no content URL needed, others need URL/post link
    var urlSection = document.getElementById('smmContentUrlSection');
    if (urlSection) {
        if (service === 'followers' || service === 'report') {
            urlSection.style.display = 'none';
        } else {
            urlSection.style.display = 'block';
            var urlLabel = document.getElementById('smmContentUrlLabel');
            if (urlLabel) urlLabel.textContent = service === 'likes' ? 'Post URL (for Likes)' : 'Post URL (for Comments)';
        }
    }

    // Update slider max and cost based on service
    var costs = _smmCostConfig || {};
    var costPer = costs[service] || 1;
    var gems = parseFloat((userData && (userData.Gems || userData.gems)) || 0);
    var maxAffordable = Math.floor(gems / costPer) || 100;
    var sliderMax = Math.min(maxAffordable, 10000);

    var slider = document.getElementById('smmSlider');
    var sliderMaxLabel = document.getElementById('smmSliderMax');
    if (slider) { slider.max = sliderMax; slider.value = 1; }
    if (sliderMaxLabel) sliderMaxLabel.textContent = sliderMax;

    // Show cost per unit in service cards
    var priceEl = document.getElementById('smmPrice-' + service);
    if (priceEl) priceEl.textContent = costPer + ' 💎 each';

    var maxOrderEl = document.getElementById('smmMaxOrder');
    if (maxOrderEl) maxOrderEl.textContent = sliderMax;

    smmUpdateCalc();
}

function smmOnSlider(val) {
    var qty = parseInt(val) || 1;
    var qtyInput = document.getElementById('smmQtyInput');
    var qtyDisplay = document.getElementById('smmQtyDisplay');
    if (qtyInput) qtyInput.value = qty;
    if (qtyDisplay) qtyDisplay.textContent = qty;
    smmUpdateCalc();
}

function smmOnManual(val) {
    var qty = Math.max(1, parseInt(val) || 1);
    var slider = document.getElementById('smmSlider');
    if (slider) slider.value = Math.min(qty, parseInt(slider.max) || 100);
    var qtyDisplay = document.getElementById('smmQtyDisplay');
    if (qtyDisplay) qtyDisplay.textContent = qty;
    smmUpdateCalc();
}

function smmSetMax() {
    var service = _smmCurrentService || 'followers';
    var costs = _smmCostConfig || {};
    var costPer = costs[service] || 1;
    var gems = parseFloat((userData && (userData.Gems || userData.gems)) || 0);
    var maxQty = Math.floor(gems / costPer);
    if (maxQty <= 0) { window.showToast('Insufficient Gems!'); return; }
    var slider = document.getElementById('smmSlider');
    var qtyInput = document.getElementById('smmQtyInput');
    var qtyDisplay = document.getElementById('smmQtyDisplay');
    if (slider) slider.value = Math.min(maxQty, parseInt(slider.max) || maxQty);
    if (qtyInput) qtyInput.value = maxQty;
    if (qtyDisplay) qtyDisplay.textContent = maxQty;
    smmUpdateCalc();
}

function smmUpdateCalc() {
    var service = _smmCurrentService || 'followers';
    var qty = parseInt(document.getElementById('smmQtyInput') ? document.getElementById('smmQtyInput').value : 1) || 1;
    var costs = _smmCostConfig || {};
    var costPer = costs[service] || 1;
    var total = qty * costPer;
    var gems = parseFloat((userData && (userData.Gems || userData.gems)) || 0);

    // Update gems display
    var gemsDisplay = document.getElementById('smmGemsDisplay');
    if (gemsDisplay) gemsDisplay.textContent = gems.toFixed(0);

    // Update gems used
    var gemsUsed = document.getElementById('smmGemsUsed');
    if (gemsUsed) gemsUsed.textContent = total;

    // Update summary
    var summaryQty = document.getElementById('smmSummaryQty');
    var summaryCostPer = document.getElementById('smmSummaryCostPer');
    var summaryTotal = document.getElementById('smmSummaryTotal');
    if (summaryQty) summaryQty.textContent = qty;
    if (summaryCostPer) summaryCostPer.textContent = costPer + ' Gems';
    if (summaryTotal) summaryTotal.textContent = total + ' 💎';

    // Enable/disable submit
    var btn = document.getElementById('smmSubmitBtn');
    var username = (document.getElementById('smmUsername') || {}).value || '';
    var canSubmit = username.trim().length > 0 && service && gems >= total;
    if (btn) {
        btn.style.opacity = canSubmit ? '1' : '0.5';
        btn.style.pointerEvents = canSubmit ? 'auto' : 'none';
    }
}

// Debounced Instagram profile lookup when username is typed
var _smmProfileTimer = null;
window.smmOnUsernameInput = function () {
    smmUpdateCalc();
    clearTimeout(_smmProfileTimer);
    var username = ((document.getElementById('smmUsername') || {}).value || '').trim().replace('@', '');
    var previewBox = document.getElementById('smmProfilePreview');
    if (!username || username.length < 2) {
        if (previewBox) previewBox.style.display = 'none';
        return;
    }
    // Show loading
    if (previewBox) {
        previewBox.style.display = 'flex';
        previewBox.innerHTML = '<div style="margin:auto;color:#9ca3af;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Looking up @' + username + '...</div>';
    }
    _smmProfileTimer = setTimeout(async function () {
        try {
            var res = await apiFetch('/api/smm/instagram/profile/' + encodeURIComponent(username));
            var data = await res.json();
            if (data.success && previewBox) {
                var verifiedBadge = data.isVerified ? '<span style="color:#3b82f6;font-size:12px;">✓</span>' : '';
                var privateBadge = data.isPrivate ? '<span style="background:#6b7280;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px;">PRIVATE</span>' : '';
                previewBox.innerHTML =
                    '<img src="' + (data.profilePic || '') + '" onerror="this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=e6683c&color=fff&size=60\'" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #e6683c;">' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:14px;font-weight:800;color:#fff;display:flex;align-items:center;gap:4px;">@' + data.username + verifiedBadge + privateBadge + '</div>' +
                    (data.fullName ? '<div style="font-size:12px;color:#9ca3af;margin-bottom:4px;">' + data.fullName + '</div>' : '') +
                    '<div style="display:flex;gap:12px;margin-top:4px;">' +
                    '<div style="text-align:center;"><div style="font-size:13px;font-weight:800;color:#fff;">' + _fmtNum(data.followers) + '</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;">Followers</div></div>' +
                    '<div style="text-align:center;"><div style="font-size:13px;font-weight:800;color:#fff;">' + _fmtNum(data.following) + '</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;">Following</div></div>' +
                    '<div style="text-align:center;"><div style="font-size:13px;font-weight:800;color:#fff;">' + _fmtNum(data.posts) + '</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;">Posts</div></div>' +
                    '</div>' +
                    '</div>';
            } else if (previewBox) {
                previewBox.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:8px;">@' + username + ' — enter full username to preview</div>';
            }
        } catch (e) {
            if (previewBox) previewBox.style.display = 'none';
        }
    }, 800);
};

function _fmtNum(n) {
    n = parseInt(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}
window._fmtNum = _fmtNum;

async function smmSubmit() {
    var username = ((document.getElementById('smmUsername') || {}).value || '').trim().replace('@', '');
    var service = _smmCurrentService || 'followers';
    var qty = parseInt((document.getElementById('smmQtyInput') || {}).value) || 1;

    if (!username) { window.showToast('Please enter your Instagram username'); return; }
    if (!userData || !userData.id) { window.showToast('Please login first'); return; }

    // For likes/comments, also get the content URL
    var contentUrl = '';
    var urlInput = document.getElementById('smmContentUrl');
    if (urlInput && (service === 'likes' || service === 'comments')) {
        contentUrl = urlInput.value.trim();
        if (!contentUrl) { window.showToast('Please enter the post URL for ' + service); return; }
    }

    var btn = document.getElementById('smmSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

    try {
        var res = await apiFetch('/api/smm/instagram/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, username: username, service: service, quantity: qty, contentUrl: contentUrl })
        });
        var data = await res.json();
        if (data.success) {
            window.showToast('✅ Order submitted! Admin will process shortly.');
            if (data.newGems !== undefined) { userData.Gems = data.newGems; userData.gems = data.newGems; }
            // Reset form
            var usernameEl = document.getElementById('smmUsername');
            var qtyEl = document.getElementById('smmQtyInput');
            if (usernameEl) usernameEl.value = '';
            if (qtyEl) qtyEl.value = 1;
            var qtySection = document.getElementById('smmQuantitySection');
            if (qtySection) qtySection.style.display = 'none';
            _smmCurrentService = null;
            smmUpdateCalc();
            // Reload orders list
            if (typeof loadSmmOrders === 'function') loadSmmOrders();
        } else {
            window.showToast(data.message || 'Failed to submit order');
        }
    } catch (e) {
        window.showToast('Network error. Please try again.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Order'; }
    }
}

// Load SMM costs into _smmCostConfig when page opens
(function _patchLoadSmmPage() {
    var _orig = window.loadSmmPage;
    window.loadSmmPage = async function () {
        if (typeof _orig === 'function') await _orig();
        // Also cache into bridge variable
        try {
            var cached = localStorage.getItem('smmCosts');
            if (cached) _smmCostConfig = JSON.parse(cached);
        } catch (e) { }
        // Update gem display for the new SMM UI
        var gems = parseFloat((userData && (userData.Gems || userData.gems)) || 0);
        var gemsEl = document.getElementById('smmGemsDisplay');
        if (gemsEl) gemsEl.textContent = gems.toFixed(0);
    };
})();

window.smmSelectService = smmSelectService;
window.smmOnSlider = smmOnSlider;
window.smmOnManual = smmOnManual;
window.smmSetMax = smmSetMax;
window.smmUpdateCalc = smmUpdateCalc;
window.smmSubmit = smmSubmit;

// ==========================================
// VIDEO DOWNLOADER — IMPROVED UI
// ==========================================
window.downloadVideo = async function downloadVideo() {
    var urlInput = document.getElementById('videoDownloadInput');
    var btn = document.getElementById('videoSearchBtn');
    var url = urlInput ? urlInput.value.trim() : '';

    if (!url) { window.showToast('Please paste a video URL!'); return; }

    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...'; btn.disabled = true; }

    // Remove old results
    var old = document.getElementById('videoDownloadResult');
    if (old) old.remove();

    try {
        var res = await apiFetch('/api/video-downloader/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData ? userData.id : 0, url: url })
        });
        var data = await res.json();

        if (data.success) {
            window.showToast('✅ Video info fetched successfully!');

            // Initialize global video info & unlock states
            window.currentVideoData = {
                url: url,
                title: data.title || '',
                description: data.description || '',
                platform: data.platform || 'video',
                thumbnail: data.thumbnail || ''
            };
            window.currentVideoUnlocked = {
                details: false,
                copyright: null
            };

            // Show balance info
            const balanceEl = document.getElementById('videoBalanceInfo');
            const balanceTokens = userData ? (userData.balance_tokens || userData.tokens || 0) : 0;
            if (balanceEl) {
                balanceEl.style.display = 'block';
                const balanceSpan = document.getElementById('videoTokenBalance');
                if (balanceSpan) balanceSpan.textContent = balanceTokens;
            }

            var platformLogos = { youtube: '🎬', tiktok: '🎵', instagram: '📸', facebook: '👥', twitter: '🐦', threads: '🧵' };
            var platformIcon = platformLogos[data.platform] || '🎥';

            var formats = data.formats || [];
            var videoFormats = formats.filter(f => f.type !== 'audio');
            var audioFormats = formats.filter(f => f.type === 'audio');

            var formatsHtml = '';

            // ── VIDEO formats ──────────────────────────────────────────────
            if (videoFormats.length > 0) {
                formatsHtml += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">📥 Video formats</div>';
                videoFormats.forEach(function (f) {
                    var quality = f.quality || 'HD';
                    formatsHtml += `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(236,72,153,0.08);border:1px solid rgba(236,72,153,0.2);border-radius:12px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <i class="fas fa-film" style="color:#ec4899;font-size:15px;"></i>
                                <span style="font-size:14px;font-weight:700;color:#fff;">${quality}</span>
                            </div>
                            <button onclick="sendVideoToTelegram('${encodeURIComponent(f.url)}','video','${quality}',this)"
                                style="background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;border:none;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:5px;transition:0.2s;">
                                <i class="fas fa-download"></i> Download
                            </button>
                        </div>`;
                });
            }

            // ── AUDIO formats ──────────────────────────────────────────────
            if (audioFormats.length > 0) {
                formatsHtml += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px;">🎵 Audio formats</div>';
                audioFormats.forEach(function (f) {
                    var q = f.quality || 'MP3';
                    formatsHtml += `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <i class="fas fa-music" style="color:#8b5cf6;font-size:15px;"></i>
                                <span style="font-size:14px;font-weight:700;color:#fff;">${q}</span>
                            </div>
                            <button onclick="sendVideoToTelegram('${encodeURIComponent(f.url)}','audio','${q}',this)"
                                style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:5px;transition:0.2s;">
                                <i class="fas fa-download"></i> Download
                            </button>
                        </div>`;
                });
            }

            // Build formatting wrapper
            var formatsWrapper = '';
            if (formats.length > 0) {
                formatsWrapper = `
                    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:16px;padding:16px;margin-bottom:16px;">
                        ${formatsHtml}
                    </div>`;
            } else if (data.message) {
                formatsWrapper = `
                    <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:16px;padding:16px;margin-bottom:16px;">
                        <div style="display:flex;gap:10px;align-items:flex-start;">
                            <i class="fas fa-exclamation-triangle" style="color:#f59e0b;font-size:16px;margin-top:2px;"></i>
                            <div style="font-size:12px;color:#d1d5db;line-height:1.5;">
                                <span style="color:#fff;font-weight:700;display:block;margin-bottom:2px;">Direct Download Restricted</span>
                                ${data.message}
                            </div>
                        </div>
                    </div>`;
            }

            // Extract tags from description for video details helper
            var tagsList = [];
            if (data.description) {
                var hashtagMatches = data.description.match(/#[a-zA-Z0-9_\u0980-\u09FF]+/g);
                if (hashtagMatches) {
                    tagsList = hashtagMatches.map(t => t.trim());
                }
            }

            // Prepare description copy
            var escapedTitle = (data.title || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
            var escapedDesc = (data.description || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
            var escapedUrl = url.replace(/'/g, "\\'").replace(/"/g, '\\"');

            // ── Build final results card ───────────────────────────────────
            var resultDiv = document.createElement('div');
            resultDiv.id = 'videoDownloadResult';
            resultDiv.style.cssText = 'margin-top:20px;display:flex;flex-direction:column;gap:16px;';
            resultDiv.innerHTML = `
                <!-- Main Preview Card -->
                <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:16px;position:relative;overflow:hidden;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <span style="font-size:24px;">${platformIcon}</span>
                        <div style="overflow:hidden;flex:1;">
                            <div style="color:#fff;font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${data.title || 'Video'}">
                                ${data.title || 'Video'}
                            </div>
                            <div style="color:var(--text-sub);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                                ${data.platform || 'video'} • via Auto Verify
                            </div>
                        </div>
                    </div>

                    ${data.thumbnail ? `
                    <div style="position:relative;border-radius:12px;overflow:hidden;margin-bottom:14px;background:#000;display:flex;justify-content:center;align-items:center;">
                        <img src="${data.thumbnail}" style="width:100%;max-height:220px;object-fit:cover;" onerror="this.style.display='none'">
                        <!-- Thumbnail Download trigger directly on preview -->
                        <button onclick="sendVideoToTelegram('${encodeURIComponent(data.thumbnail)}','thumbnail','HQ',this)"
                            style="position:absolute;bottom:10px;right:10px;background:linear-gradient(135deg,#ec4899,#f43f5e);color:#fff;border:none;border-radius:30px;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 6px 16px rgba(0,0,0,0.4);z-index:10;transition:0.2s;">
                            <i class="fas fa-image"></i> Download Thumbnail (HQ/4K)
                        </button>
                    </div>
                    ` : ''}

                    ${formatsWrapper}
                </div>

                <!-- Video Details Section -->
                <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:16px;">
                    <button onclick="window.toggleSection('videoDetailsContent')" style="width:100%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);border:none;border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#fff;font-weight:700;box-shadow:0 4px 12px rgba(139,92,246,0.2);">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-file-alt" style="color:#fff;font-size:16px;"></i>
                            <span style="font-size:14px;font-weight:700;">Video Details</span>
                        </div>
                        <i id="videoDetailsContent_icon" class="fas fa-chevron-down" style="color:#fff;font-size:12px;transition:transform 0.3s;"></i>
                    </button>
                    
                    <div id="videoDetailsContent" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);flex-direction:column;gap:12px;">
                        
                        <!-- Initial Locked View -->
                        <div id="detailsLockedView" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;gap:10px;">
                            <i class="fas fa-lock" style="font-size:24px;color:#8b5cf6;"></i>
                            <div style="font-size:13px;font-weight:700;color:#fff;">Video Details are Locked</div>
                            <p style="font-size:12px;color:var(--text-sub);margin:0;max-width:280px;line-height:1.4;">Unlock video title, description, and tags for copying and optimization.</p>
                            <button id="unlockDetailsBtn" onclick="window.unlockVideoDetails()" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(139,92,246,0.2);">
                                <i class="fas fa-key"></i> Unlock Details (Cost: 10 TC)
                            </button>
                        </div>

                        <!-- Unlocked Content View (Hidden Initially) -->
                        <div id="detailsUnlockedView" style="display:none;flex-direction:column;gap:12px;">
                            ${data.title ? `
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                    <span style="font-size:11px;font-weight:700;color:var(--text-sub);text-transform:uppercase;">📌 Title</span>
                                    <button onclick="window.copyTextToClipboard('${escapedTitle}', this)" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:#a78bfa;padding:4px 8px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
                                        <i class="fas fa-copy"></i> Copy
                                    </button>
                                </div>
                                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px;color:#fff;font-size:13px;line-height:1.4;word-break:break-word;">
                                    ${data.title}
                                </div>
                            </div>
                            ` : ''}

                            ${data.description ? `
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                    <span style="font-size:11px;font-weight:700;color:var(--text-sub);text-transform:uppercase;">📝 Description</span>
                                    <button onclick="window.copyTextToClipboard('${escapedDesc}', this)" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:#a78bfa;padding:4px 8px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
                                        <i class="fas fa-copy"></i> Copy
                                    </button>
                                </div>
                                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px;color:#d1d5db;font-size:13px;line-height:1.5;max-height:180px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;">
                                    ${data.description}
                                </div>
                            </div>
                            ` : (!data.title ? `
                            <div>
                                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px;color:var(--text-sub);font-size:12px;text-align:center;">
                                    No description or title available for this video.
                                </div>
                            </div>
                            ` : '')}

                            ${tagsList.length > 0 ? `
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                    <span style="font-size:11px;font-weight:700;color:var(--text-sub);text-transform:uppercase;">🏷️ Tags (${tagsList.length})</span>
                                    <button onclick="window.copyTextToClipboard('${tagsList.join(', ')}', this)" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:#a78bfa;padding:4px 8px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
                                        <i class="fas fa-copy"></i> Copy All
                                    </button>
                                </div>
                                <div style="display:flex;flex-wrap:wrap;gap:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px;">
                                    ${tagsList.map(t => `<span style="background:rgba(139,92,246,0.15);color:#c084fc;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;border:1px solid rgba(139,92,246,0.1);">${t}</span>`).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Copyright Checker Section -->
                <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:16px;">
                    <button onclick="window.toggleSection('copyrightContent')" style="width:100%;background:linear-gradient(135deg,#06b6d4,#0891b2);border:none;border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#fff;font-weight:700;box-shadow:0 4px 12px rgba(6,182,212,0.2);">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-shield-alt" style="color:#fff;font-size:16px;"></i>
                            <span style="font-size:14px;font-weight:700;">Copyright Manager</span>
                        </div>
                        <i id="copyrightContent_icon" class="fas fa-chevron-down" style="color:#fff;font-size:12px;transition:transform 0.3s;"></i>
                    </button>
                    
                    <div id="copyrightContent" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);flex-direction:column;gap:12px;">
                        <div id="copyrightInitialBox" style="text-align:center;padding:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;">
                            <p style="font-size:12px;color:var(--text-sub);margin-bottom:12px;">🛡️ Check real-time copyright risks across YouTube, TikTok, Facebook, and Instagram Reels.</p>
                            <button id="runCopyrightBtn" onclick="window.runCopyrightScan()" style="background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(6,182,212,0.2);">
                                <i class="fas fa-shield-alt"></i> Scan Copyright (Cost: 10 TC)
                            </button>
                        </div>
                        <div id="copyrightScanLoader" style="display:none;flex-direction:column;gap:8px;align-items:center;margin-top:12px;text-align:center;">
                            <i class="fas fa-spinner fa-spin" style="color:#06b6d4;font-size:20px;"></i>
                            <span id="copyrightScanMsg" style="font-size:12px;color:var(--text-sub);">Analyzing video audio spectrum...</span>
                        </div>
                        <div id="copyrightScanResults" style="display:none;flex-direction:column;gap:8px;margin-top:12px;"></div>
                    </div>
                </div>

                <!-- AI SEO Optimizer Section -->
                <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:16px;">
                    <button onclick="window.toggleSection('seoContent')" style="width:100%;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#fff;font-weight:700;box-shadow:0 4px 12px rgba(245,158,11,0.2);">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-rocket" style="color:#fff;font-size:16px;"></i>
                            <span style="font-size:14px;font-weight:700;">AI SEO Optimizer</span>
                        </div>
                        <i id="seoContent_icon" class="fas fa-chevron-down" style="color:#fff;font-size:12px;transition:transform 0.3s;"></i>
                    </button>
                    
                    <div id="seoContent" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);flex-direction:column;gap:12px;">
                        <div>
                            <label style="display:block;font-size:11px;font-weight:700;color:var(--text-sub);margin-bottom:6px;text-transform:uppercase;">Select Platform</label>
                            <div id="seoPlatformSelector" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                                <button onclick="window.selectSeoPlatform('youtube', this)" class="seo-platform-btn active" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#fff;border-radius:10px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:0.2s;">
                                    🎬 YouTube
                                </button>
                                <button onclick="window.selectSeoPlatform('tiktok', this)" class="seo-platform-btn" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--text-sub);border-radius:10px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:0.2s;">
                                    🎵 TikTok
                                </button>
                                <button onclick="window.selectSeoPlatform('facebook', this)" class="seo-platform-btn" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--text-sub);border-radius:10px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:0.2s;">
                                    👥 Facebook
                                </button>
                                <button onclick="window.selectSeoPlatform('instagram', this)" class="seo-platform-btn" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--text-sub);border-radius:10px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:0.2s;">
                                    📸 Instagram
                                </button>
                            </div>
                        </div>

                        <div>
                            <label style="display:block;font-size:11px;font-weight:700;color:var(--text-sub);margin-bottom:6px;text-transform:uppercase;">Select Target Country (Timezone & Algorithm Booster)</label>
                            <select id="seoCountrySelect" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#fff;border-radius:10px;padding:10px;font-size:12px;font-weight:700;outline:none;cursor:pointer;margin-bottom:12px;">
                                <option value="BD" selected>🇧🇩 Bangladesh (BST - Optimal timezone for local viral boost)</option>
                                <option value="US">🇺🇸 United States (EST/PST - High CPM Global algorithm reach)</option>
                                <option value="UK">🇬🇧 United Kingdom (GMT - Local trending hashtags)</option>
                                <option value="IN">🇮🇳 India (IST - Regional Subcontinent viral boost)</option>
                                <option value="DE">🇩🇪 Germany (CET - EU centralized metadata optimizations)</option>
                                <option value="RU">🇷🇺 Russia (MSK - Regional audience timings)</option>
                                <option value="MY">🇲🇾 Malaysia (SGT - Southeast Asian viral trends)</option>
                                <option value="SG">🇸🇬 Singapore (SGT - High metropolitan density timing)</option>
                            </select>
                        </div>

                        <button id="runSeoBtn" onclick="window.runAiSeoOptimization('${escapedUrl}', '${escapedTitle}', '${escapedDesc}')" style="width:100%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:12px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:0.2s;box-shadow:0 4px 12px rgba(245,158,11,0.2);">
                            <i class="fas fa-magic"></i> Generate AI SEO (Cost: 10 TC)
                        </button>

                        <div id="seoLoader" style="display:none;flex-direction:column;gap:8px;align-items:center;margin-top:12px;text-align:center;">
                            <i class="fas fa-spinner fa-spin" style="color:#f59e0b;font-size:24px;"></i>
                            <span style="font-size:12px;color:var(--text-sub);font-weight:600;">Analyzing video with Group Management AI...</span>
                        </div>

                        <!-- SEO Result Box -->
                        <div id="seoResultContainer" style="display:none;flex-direction:column;gap:12px;margin-top:12px;background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:12px;"></div>
                    </div>
                </div>
            `;

            var pageBody = document.getElementById('videoDownloadPage');
            if (pageBody) {
                var contentBody = pageBody.querySelector('.content-body');
                if (contentBody) contentBody.appendChild(resultDiv);
                // Scroll to result
                setTimeout(() => resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }
        } else {
            window.showToast(data.message || '❌ Failed to fetch video. Check the URL and try again.');
        }
    } catch (e) {
        window.showToast('Network error. Please try again.');
    }

    if (btn) { btn.innerHTML = '<i class="fas fa-search"></i> Search Video & Post'; btn.disabled = false; }
};

window.copyVideoDesc = function () {
    var box = document.getElementById('videoDescBox');
    if (!box) return;
    var text = box.querySelector('p') ? box.querySelector('p').textContent : '';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { window.showToast('✅ Description copied!'); });
    } else {
        window.showToast('Description: ' + text.substring(0, 50) + '...');
    }
};

window.toggleSection = function (id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(id + '_icon');
    if (!el) return;
    if (el.style.display === 'none' || el.style.display === '') {
        el.style.display = 'flex';
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        el.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
};

window.copyTextToClipboard = function (text, btn) {
    if (!text) return;
    const originalHtml = btn ? btn.innerHTML : '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
            }
            window.showToast('✅ Copied to clipboard!');
        }).catch(() => {
            window.showToast('Failed to copy');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
            }
            window.showToast('✅ Copied to clipboard!');
        } catch (err) {
            window.showToast('Failed to copy');
        }
        document.body.removeChild(textarea);
    }
};

let selectedSeoPlatform = 'youtube';
window.selectSeoPlatform = function (platform, btn) {
    selectedSeoPlatform = platform;
    const parent = btn.closest('#seoPlatformSelector');
    if (!parent) return;
    parent.querySelectorAll('.seo-platform-btn').forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-sub)';
        b.style.borderColor = 'rgba(255,255,255,0.08)';
        b.style.background = 'rgba(255,255,255,0.04)';
    });
    btn.classList.add('active');
    btn.style.color = '#fff';
    btn.style.borderColor = '#fbbf24';
    btn.style.background = 'rgba(245,158,11,0.1)';
};

window.runAiSeoOptimization = async function (url, title, description) {
    if (!userData || !userData.id) {
        window.showToast('Please login first');
        return;
    }

    const btn = document.getElementById('runSeoBtn');
    const loader = document.getElementById('seoLoader');
    const container = document.getElementById('seoResultContainer');

    if (btn) btn.style.display = 'none';
    if (loader) loader.style.display = 'flex';
    if (container) container.style.display = 'none';

    try {
        const countryEl = document.getElementById('seoCountrySelect');
        const selectedCountry = countryEl ? countryEl.value : 'BD';

        const res = await apiFetch('/api/video-downloader/seo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                url: url,
                title: title,
                description: description,
                platform: selectedSeoPlatform,
                country: selectedCountry
            })
        });
        const data = await res.json();

        if (data.success && data.seo) {
            const seo = data.seo;
            
            if (data.newBalance !== undefined) {
                userData.balance_tokens = data.newBalance;
                userData.tokens = data.newBalance;
                userData.balance = data.newBalance;
                if (typeof renderBalances === 'function') renderBalances();
            }

            const escTitle = (seo.title || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
            const escDesc = (seo.description || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
            const escTags = (seo.tags ? seo.tags.join(', ') : '').replace(/'/g, "\\'").replace(/"/g, '\\"');

            container.innerHTML = `
                <div style="font-size:12px;color:#f59e0b;font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:8px;text-transform:uppercase;">
                    <i class="fas fa-check-circle"></i> AI SEO Generated Successfully!
                </div>
                
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <span style="font-size:11px;color:var(--text-sub);font-weight:700;text-transform:uppercase;">🔥 Recommended Title / Hook</span>
                            <button onclick="window.copyTextToClipboard('${escTitle}', this)" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:#fbb324;padding:3px 6px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px;color:#fff;font-size:13px;font-weight:600;line-height:1.4;">
                            ${seo.title || ''}
                        </div>
                    </div>

                    <div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <span style="font-size:11px;color:var(--text-sub);font-weight:700;text-transform:uppercase;">📝 Optimized Description</span>
                            <button onclick="window.copyTextToClipboard('${escDesc}', this)" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:#fbb324;padding:3px 6px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px;color:#d1d5db;font-size:12px;line-height:1.5;white-space:pre-wrap;max-height:140px;overflow-y:auto;">
                            ${seo.description || ''}
                        </div>
                    </div>

                    ${seo.tags && seo.tags.length > 0 ? `
                    <div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <span style="font-size:11px;color:var(--text-sub);font-weight:700;text-transform:uppercase;">🏷️ High Relevancy Tags</span>
                            <button onclick="window.copyTextToClipboard('${escTags}', this)" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:#fbb324;padding:3px 6px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;">
                                <i class="fas fa-copy"></i> Copy All
                            </button>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px;">
                            ${seo.tags.map(t => `<span style="background:rgba(245,158,11,0.1);color:#fbbf24;font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;border:1px solid rgba(245,158,11,0.1);">#${t}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${seo.category ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:8px;font-size:12px;">
                        <span style="color:var(--text-sub);"><i class="fas fa-folder-open"></i> Best Category:</span>
                        <span style="color:#fff;font-weight:700;">${seo.category}</span>
                    </div>
                    ` : ''}

                    ${seo.tips ? `
                    <div style="background:rgba(16,185,129,0.04);border:1px solid rgba(16,185,129,0.15);border-radius:8px;padding:8px;font-size:12px;line-height:1.4;color:#a7f3d0;">
                        <span style="font-weight:800;color:#34d399;display:block;margin-bottom:2px;"><i class="fas fa-lightbulb"></i> Viral Creator Strategy Tip:</span>
                        ${seo.tips}
                    </div>
                    ` : ''}
                </div>
            `;
            container.style.display = 'flex';
            window.showToast('✅ SEO Optimized successfully!');
        } else {
            window.showToast('❌ SEO generation failed: ' + (data.message || 'Unknown error'));
            if (btn) btn.style.display = 'block';
        }
    } catch (e) {
        window.showToast('❌ Network error generating SEO.');
        if (btn) btn.style.display = 'block';
    } finally {
        if (loader) loader.style.display = 'none';
    }
};

window.runCopyrightScan = async function () {
    if (!userData || !userData.id) { window.showToast('Please login first'); return; }
    const btn = document.getElementById('runCopyrightBtn');
    const initialBox = document.getElementById('copyrightInitialBox');
    const loader = document.getElementById('copyrightScanLoader');
    const results = document.getElementById('copyrightScanResults');

    if (initialBox) initialBox.style.display = 'none';
    if (loader) loader.style.display = 'flex';
    if (results) results.style.display = 'none';

    let steps = [
        'Extracting audio waveform spectrum...',
        'Matching acoustic fingerprints with Global Rights Database...',
        'Checking regional DMCA restrictions and policy registries...',
        'Analyzing monetization and mute filter risks...'
    ];
    let stepIndex = 0;
    
    const interval = setInterval(() => {
        if (stepIndex < steps.length) {
            const msgEl = document.getElementById('copyrightScanMsg');
            if (msgEl) msgEl.textContent = steps[stepIndex];
            stepIndex++;
        }
    }, 1000);

    try {
        const res = await apiFetch('/api/video-downloader/copyright', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                url: window.currentVideoData ? window.currentVideoData.url : '',
                title: window.currentVideoData ? window.currentVideoData.title : '',
                description: window.currentVideoData ? window.currentVideoData.description : ''
            })
        });
        const data = await res.json();
        
        // Clear interval
        clearInterval(interval);
        
        if (data.success) {
            window.showToast('✅ Copyright Scan completed successfully!');
            // Update balance
            if (userData && data.newBalance !== undefined) {
                userData.balance_tokens = data.newBalance;
                userData.tokens = data.newBalance;
                const balanceTokens = document.getElementById('videoTokenBalance');
                if (balanceTokens) balanceTokens.textContent = data.newBalance;
            }

            if (loader) loader.style.display = 'none';
            renderCopyrightResults(data.results);
        } else {
            window.showToast(data.message || 'Copyright scan failed.');
            if (loader) loader.style.display = 'none';
            if (initialBox) initialBox.style.display = 'block';
        }
    } catch (err) {
        clearInterval(interval);
        window.showToast('Network error during copyright scan.');
        if (loader) loader.style.display = 'none';
        if (initialBox) initialBox.style.display = 'block';
    }

    function renderCopyrightResults(scanResult) {
        if (!results) return;
        
        const ytStatus = scanResult.youtube.status;
        const ytExp = scanResult.youtube.explanation;
        const ttStatus = scanResult.tiktok.status;
        const ttExp = scanResult.tiktok.explanation;
        const fbStatus = scanResult.facebook.status;
        const fbExp = scanResult.facebook.explanation;
        const igStatus = scanResult.instagram.status;
        const igExp = scanResult.instagram.explanation;

        results.innerHTML = `
            <div style="font-size:13px;color:#06b6d4;font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px;">
                <i class="fas fa-shield-check"></i> Multi-Platform Copyright & Risk Audit:
            </div>
            
            <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px;display:flex;gap:10px;align-items:flex-start;">
                    <div style="font-size:18px;margin-top:2px;">🎬</div>
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:13px;font-weight:700;color:#fff;">YouTube Content ID</span>
                            ${ytStatus ? `
                            <span style="background:rgba(239,68,68,0.15);color:#f87171;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-check"></i> Copyright Match (Claim Risk)
                            </span>
                            ` : `
                            <span style="background:rgba(34,197,94,0.15);color:#4ade80;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(34,197,94,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-times"></i> No Match (Safe)
                            </span>
                            `}
                        </div>
                        <p style="color:#9ca3af;font-size:12px;line-height:1.4;margin:0;">${ytExp}</p>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px;display:flex;gap:10px;align-items:flex-start;">
                    <div style="font-size:18px;margin-top:2px;">🎵</div>
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:13px;font-weight:700;color:#fff;">TikTok Audio Check</span>
                            ${ttStatus ? `
                            <span style="background:rgba(239,68,68,0.15);color:#f87171;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-check"></i> Copyright Match (Match Risk)
                            </span>
                            ` : `
                            <span style="background:rgba(34,197,94,0.15);color:#4ade80;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(34,197,94,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-times"></i> No Match (Safe)
                            </span>
                            `}
                        </div>
                        <p style="color:#9ca3af;font-size:12px;line-height:1.4;margin:0;">${ttExp}</p>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px;display:flex;gap:10px;align-items:flex-start;">
                    <div style="font-size:18px;margin-top:2px;">👥</div>
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:13px;font-weight:700;color:#fff;">Facebook Rights Manager</span>
                            ${fbStatus ? `
                            <span style="background:rgba(239,68,68,0.15);color:#f87171;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-check"></i> Copyright Match (Block Risk)
                            </span>
                            ` : `
                            <span style="background:rgba(34,197,94,0.15);color:#4ade80;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(34,197,94,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-times"></i> No Match (Safe)
                            </span>
                            `}
                        </div>
                        <p style="color:#9ca3af;font-size:12px;line-height:1.4;margin:0;">${fbExp}</p>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px;display:flex;gap:10px;align-items:flex-start;">
                    <div style="font-size:18px;margin-top:2px;">📸</div>
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:13px;font-weight:700;color:#fff;">Instagram Reels Policy</span>
                            ${igStatus ? `
                            <span style="background:rgba(239,68,68,0.15);color:#f87171;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-check"></i> Copyright Match (Limited Audio)
                            </span>
                            ` : `
                            <span style="background:rgba(34,197,94,0.15);color:#4ade80;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid rgba(34,197,94,0.2);display:flex;align-items:center;gap:4px;">
                                <i class="fas fa-times"></i> No Match (Safe)
                            </span>
                            `}
                        </div>
                        <p style="color:#9ca3af;font-size:12px;line-height:1.4;margin:0;">${igExp}</p>
                    </div>
                </div>
            </div>
            
            <div style="margin-top:12px;text-align:center;">
                <button onclick="window.runCopyrightScan()" style="background:none;border:none;color:#06b6d4;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                    <i class="fas fa-sync-alt"></i> Re-Scan Waveform (Cost: 10 TC)
                </button>
            </div>
        `;
        results.style.display = 'flex';
    }
};

window.sendVideoToTelegram = async function (encodedUrl, type, quality, btnEl) {
    var url = decodeURIComponent(encodedUrl);
    if (!userData || !userData.id) { window.showToast('Please login first'); return; }

    // Disable button and show loading
    var btn = btnEl || null;
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
        btn.style.opacity = '0.7';
    }

    // Fetch current cost from server (admin-configurable)
    let videoDownloadCost = 10;
    try {
        const costRes = await apiFetch('/api/public/costs');
        const costData = await costRes.json();
        if (costData && costData.costs && costData.costs.videoDownloadCost !== undefined) {
            videoDownloadCost = costData.costs.videoDownloadCost;
        }
    } catch (e) { }

    const currentBalance = userData.balance_tokens || userData.tokens || 0;
    if (currentBalance < videoDownloadCost) {
        window.showToast('❌ Insufficient tokens! Need ' + videoDownloadCost + ' TC to download.');
        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; btn.style.opacity = '1'; }
        return;
    }

    window.showToast('⏳ Downloading... Check your Telegram chat shortly.');

    try {
        var res = await apiFetch('/api/video-downloader/send-telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, url: url, type: type, quality: quality, cost: videoDownloadCost })
        });
        var data = await res.json();

        if (data.success) {
            // Show success state on button
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Sent!';
                btn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
                btn.style.opacity = '1';
                btn.disabled = true;
            }
            window.showToast('✅ ' + (data.message || 'Sent to your Telegram chat!'));

            // Update local balance
            if (data.newBalance !== undefined) {
                userData.balance_tokens = data.newBalance;
                userData.tokens = data.newBalance;
                userData.balance = data.newBalance;
            } else {
                userData.balance_tokens = Math.max(0, (userData.balance_tokens || 0) - videoDownloadCost);
                userData.tokens = userData.balance_tokens;
            }
            if (typeof renderBalances === 'function') renderBalances();

            // Clear result after 2s
            setTimeout(() => {
                var result = document.getElementById('videoDownloadResult');
                if (result) result.remove();
                var input = document.getElementById('videoDownloadInput');
                if (input) input.value = '';
                var balEl = document.getElementById('videoBalanceInfo');
                if (balEl) balEl.style.display = 'none';
            }, 2000);
        } else {
            window.showToast(data.message || '⚠️ Could not send. Try again.');
            if (btn) { btn.disabled = false; btn.innerHTML = origHtml; btn.style.opacity = '1'; }
        }
    } catch (e) {
        window.showToast('Network error. Please try again.');
        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; btn.style.opacity = '1'; }
    }
};

// ===== NEW: Global State for Video Downloader =====
window.currentVideoData = null;
window.currentVideoUnlocked = { details: false, copyright: null };

// ===== NEW: Video Input Change Handler =====
window.onVideoInputChange = function () {
    var input = document.getElementById('videoDownloadInput');
    var pasteBtn = document.getElementById('videoPasteBtn');
    var clearBtn = document.getElementById('videoClearBtn');
    var searchBtn = document.getElementById('videoSearchBtn');

    if (!input) return;
    var val = input.value.trim();

    if (val.length > 0) {
        if (pasteBtn) pasteBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'block';
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.style.opacity = '1';
            searchBtn.style.pointerEvents = 'auto';
        }
    } else {
        if (pasteBtn) pasteBtn.style.display = 'flex';
        if (clearBtn) clearBtn.style.display = 'none';
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.style.opacity = '0.5';
            searchBtn.style.pointerEvents = 'none';
        }
    }
};

// Initialize input buttons on startup
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        if (typeof window.onVideoInputChange === 'function') {
            window.onVideoInputChange();
        }
    }, 1000);
});

// ===== NEW: Clipboard Paste Helper =====
window.pasteFromClipboard = async function () {
    try {
        const text = await navigator.clipboard.readText();
        const input = document.getElementById('videoDownloadInput');
        if (input && text) {
            input.value = text.trim();
            window.onVideoInputChange();
            window.showToast('📋 Link pasted from clipboard!');
        } else {
            window.showToast('📋 Clipboard is empty!');
        }
    } catch (err) {
        window.showToast("⚠️ Clipboard permission denied. Please paste manually!");
    }
};

// ===== NEW: Unlock Video Details with Token Deduction =====
window.unlockVideoDetails = async function () {
    if (!userData || !userData.id) { window.showToast('Please login first'); return; }
    const btn = document.getElementById('unlockDetailsBtn');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unlocking...'; }

    try {
        const res = await apiFetch('/api/video-downloader/unlock-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, url: window.currentVideoData ? window.currentVideoData.url : '' })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast('🔓 Video Details Unlocked successfully!');
            // Update balance
            if (userData && data.newBalance !== undefined) {
                userData.balance_tokens = data.newBalance;
                userData.tokens = data.newBalance;
                const balanceTokens = document.getElementById('videoTokenBalance');
                if (balanceTokens) balanceTokens.textContent = data.newBalance;
            }
            
            // Toggle view
            const lockedView = document.getElementById('detailsLockedView');
            const unlockedView = document.getElementById('detailsUnlockedView');
            if (lockedView) lockedView.style.display = 'none';
            if (unlockedView) unlockedView.style.display = 'flex';
            window.currentVideoUnlocked.details = true;
        } else {
            window.showToast(data.message || 'Failed to unlock video details.');
            if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
        }
    } catch (err) {
        window.showToast('Network error during unlock. Please try again.');
        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    }
};

// ===== NEW: Clear Video Download Input =====
window.clearVideoDownloadInput = function () {
    var input = document.getElementById('videoDownloadInput');
    var result = document.getElementById('videoDownloadResult');
    if (input) input.value = '';
    if (result) result.remove();
    window.onVideoInputChange();
    var balanceEl = document.getElementById('videoBalanceInfo');
    if (balanceEl) balanceEl.style.display = 'none';
    window.showToast('✅ Cleared!');
};

// ===== NEW: Search Video And Post =====
window.searchVideoAndPost = async function () {
    var input = document.getElementById('videoDownloadInput');
    var url = input ? input.value.trim() : '';
    var btn = document.getElementById('videoSearchBtn');

    if (!url) {
        window.showToast('Please paste a video link first!');
        return;
    }

    // Detect platform and validate
    const supportedPlatforms = ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch', 'twitter.com', 'x.com', 'threads.net'];
    const isSupported = supportedPlatforms.some(p => url.includes(p));

    if (!isSupported) {
        window.showToast('❌ Unsupported platform. Supported: YouTube, TikTok, Instagram, Facebook, Twitter, Threads');
        return;
    }

    // Check user balance
    if (!userData || !userData.id) {
        window.showToast('⚠️ Please login first!');
        return;
    }

    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...';
        btn.disabled = true;
    }

    // Remove old results
    var old = document.getElementById('videoDownloadResult');
    if (old) old.remove();

    try {
        var res = await apiFetch('/api/video-downloader/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData ? userData.id : 0, url: url })
        });
        var data = await res.json();

        if (data.success) {
            window.showToast('✅ Video found! Sending to your chat...');

            // Auto-send to bot
            try {
                const sendRes = await apiFetch('/api/video-downloader/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userData.id,
                        url: data.downloadUrl || url,
                        title: data.title || 'Video',
                        author: data.author || '',
                        platform: data.platform || 'unknown',
                        thumbnail: data.thumbnail || ''
                    })
                });
                const sendData = await sendRes.json();
                if (sendData.success) {
                    window.showToast('✅ Video sent to your Telegram chat!');
                } else {
                    window.showToast('ℹ️ Video info found. Check bot for download link.');
                }
            } catch (sendErr) {
                console.warn('Send to bot failed:', sendErr);
            }

            // Save video data globally for copyright & SEO checks
            window.currentVideoData = {
                url: url,
                title: data.title || 'TikTok Video',
                author: data.author || '',
                description: data.description || data.title || '',
                platform: data.platform || 'tiktok',
                thumbnail: data.thumbnail || ''
            };

            // Build result UI
            var formats = data.formats || [];
            var formatsHtml = '';
            var sortedFormats = (window.sortVideoFormats ? window.sortVideoFormats(formats) : formats);
            (sortedFormats.length > 0 ? sortedFormats : formats).forEach(function (f) {
                formatsHtml += '<a href="' + f.url + '" download target="_blank" style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:rgba(255,255,255,0.05); border-radius:10px; color:#fff; text-decoration:none; margin-bottom:8px;">' +
                    '<span style="font-size:14px; font-weight:600;">' + (f.quality || 'HD') + '</span>' +
                    '<span style="background:#8b5cf6; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700;"><i class="fas fa-download"></i> Download</span>' +
                    '</a>';
            });

            var resultDiv = document.createElement('div');
            resultDiv.id = 'videoDownloadResult';
            resultDiv.style.cssText = 'margin-top:20px; padding:16px; background:rgba(255,255,255,0.05); border-radius:16px; border:1px solid rgba(255,255,255,0.1);';
            resultDiv.innerHTML =
                (data.thumbnail ? '<img src="' + data.thumbnail + '" style="width:100%; border-radius:12px; margin-bottom:12px; max-height:240px; object-fit:cover;" onerror="this.style.display=\'none\'">' : '') +
                '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">' +
                    '<span style="background:rgba(6,182,212,0.15); color:#06b6d4; font-weight:700; font-size:11px; padding:2px 8px; border-radius:6px; border:1px solid rgba(6,182,212,0.3); text-transform:uppercase;">' + (data.platform || 'video') + '</span>' +
                    (data.author ? '<span style="color:#a7f3d0; font-size:12px; font-weight:600;"><i class="fas fa-user"></i> ' + data.author + '</span>' : '') +
                '</div>' +
                '<p style="color:#fff; font-weight:700; margin-bottom:12px; font-size:14px; line-height:1.4;">' + (data.title || 'Video') + '</p>' +
                (formatsHtml || '<a href="' + (data.downloadUrl || url) + '" download target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff; border-radius:10px; text-decoration:none; font-weight:700;"><i class="fas fa-download"></i> Download Video</a>') +
                (data.message ? '<p style="color:#888; font-size:11px; margin-top:8px; text-align:center;">' + data.message + '</p>' : '');

            var pageEl = document.getElementById('videoDownloadPage');
            if (pageEl) {
                var contentBody = pageEl.querySelector('.content-body');
                if (contentBody) contentBody.appendChild(resultDiv);
            }
        } else {
            window.showToast(data.message || '❌ Failed to fetch video. Try a different link.');
        }
    } catch (e) {
        console.error('Video search error:', e);
        window.showToast('❌ Network error. Please try again.');
    }

    if (btn) {
        btn.innerHTML = '<i class="fas fa-search"></i> Search Video & Post';
        btn.disabled = false;
    }
};

// ===== UPDATED: Sort Video Formats by Quality =====
window.sortVideoFormats = function (formats) {
    if (!formats || !Array.isArray(formats)) return [];

    const qualityOrder = ['4K', '2K', '1080p', '720p', 'HD', '480p', '360p', 'SD'];
    const videoFormats = formats.filter(f => !f.type || f.type !== 'audio');

    videoFormats.sort((a, b) => {
        const qualityA = (a.quality || 'HD').toUpperCase();
        const qualityB = (b.quality || 'HD').toUpperCase();
        const indexA = qualityOrder.findIndex(q => qualityA.includes(q));
        const indexB = qualityOrder.findIndex(q => qualityB.includes(q));
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return videoFormats;
};

window.renderLeaderboard = renderLeaderboard;
window.closeReceiptModal = closeReceiptModal;
window.copyReceiptField = copyReceiptField;
window.openEmailMessage = openEmailMessage;
window.quickCopyEmailContent = quickCopyEmailContent;
window.deleteMail = deleteMail;
window.changeMailEmail = changeMailEmail;
window.renderAccounts = renderAccounts;
window.buyPremiumAccount = buyPremiumAccount;

function buyAccount(type, price, id) {
    buyPremiumAccount(id, type, price);
}

// Buy with Gems currency
async function buyAccountGems(type, price, id) {
    if (!userData?.id) { showToast('Please login first', 'error'); return; }
    const gems = parseFloat(userData.Gems || 0);
    if (gems < price) {
        showToast(`Insufficient Gems! Need ${price} 💎, you have ${gems.toFixed(2)} 💎`, 'error');
        return;
    }
    try {
        const res = await apiFetch('/api/user/buy-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, type, price, currency: 'Gems', itemId: id })
        });
        const data = await res.json();
        if (data.success) {
            userData.Gems = data.newGems ?? (gems - price);
            userData.gems = userData.Gems;
            renderBalances();
            showToast(`✅ Purchase successful!`, 'success');
            if (data.account) {
                showAccountDetailModal(data.account, type);
            }
        } else {
            showToast(data.message || 'Purchase failed', 'error');
        }
    } catch (e) {
        showToast('Network error. Try again.', 'error');
    }
}
window.buyAccountGems = buyAccountGems;
window.buyAccount = buyAccount;
window.toggleAccountsView = toggleAccountsView;
window.updateBalanceDisplay = updateBalanceDisplay;
window.renderCards = renderCards;
window.renderVPN = renderVPN;
window.renderServicesList = renderServicesList;
window.renderShopItems = renderShopItems;
window.copyUserId = copyUserId;

// Copy OTP function
function copyNumOtp(otp) {
    if (!otp) return;
    copyText(otp);
    window.showToast('✅ OTP copied!');
}

window.copyNumOtp = copyNumOtp;

// =============================================
// CLIENT-SIDE OTP EXTRACTION
// Mirrors services/otp-extractor.js (the Node version) but returns a
// plain code string, because the inbox UI consumes the result directly
// as `code`. Keep the scoring weights in sync with the backend.
//
// ⚠ This function was referenced at top level before it existed. The
// ReferenceError aborted the rest of this file, so Bot Hosting and
// everything below never initialised. Never export an undefined symbol
// at top level again — see the guarded export below.
// =============================================
const OTP_CONTEXT_KEYWORDS = [
    'otp', 'one-time', 'one time', 'verification', 'verify', 'code',
    'passcode', 'security code', 'login code', 'confirmation',
    'auth', '2fa', 'authenticate', 'token', 'pin', 'temporary',
    'access code', 'activation', 'reset', 'password reset',
    'your code', 'your otp', 'enter code', 'use code',
    'কোড', 'ভেরিফিকেশন' // Bengali support
];

const OTP_STRONG_PHRASES = [
    'code is', 'otp is', 'otp:', 'code:', 'verification code',
    'your code', 'confirmation code', 'security code', 'login code',
    'passcode is', 'pin is', 'pin:', 'access code',
    'your otp is', 'the code', 'use code', 'enter code',
    'is your', 'here is your', 'please use', 'below is'
];

function otpPreprocess(text) {
    if (!text) return '';
    return String(text)
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function otpNearKeyword(text, position, tokenLen, windowSize) {
    const size = windowSize || 200;
    const win = text.substring(
        Math.max(0, position - size),
        Math.min(text.length, position + tokenLen + size)
    ).toLowerCase();
    return OTP_CONTEXT_KEYWORDS.some(kw => win.includes(kw));
}

function otpAfterStrongPhrase(text, position) {
    const before = text.substring(Math.max(0, position - 60), position).toLowerCase();
    return OTP_STRONG_PHRASES.some(phrase => before.includes(phrase));
}

function otpShouldExclude(token, context, fullText) {
    if (/^(19|20)\d{2}$/.test(token)) return true;

    // Repeated template noise
    const blacklist = ['98052', '94043', '98034', '94040', '95014', '12345', '00000', '11111', '99999'];
    if (blacklist.indexOf(token) !== -1) {
        const count = (fullText.match(new RegExp('\\b' + token + '\\b', 'g')) || []).length;
        if (count > 2) return true;
    }

    const at = context.indexOf(token);
    if (at === -1) return false;
    const before = context.substring(0, at);
    const after = context.substring(at + token.length, at + token.length + 30);

    // Part of a time (e.g. 10:30)
    if (/:\s*$/.test(before) || new RegExp('^' + token + '\\s*:').test(context)) {
        if (/^\d{3,4}$/.test(token)) return true;
    }

    // Currency amount
    if (/(\$|usd|tk|৳|credits?|cost|price|amount|balance|rs\.?|inr)/i.test(context)) {
        if (new RegExp('(\\$|usd|tk|৳|rs\\.?)\\s*' + token).test(context)) return true;
    }

    // Street / address number
    if (/\b(street|road|ave|avenue|blvd|boulevard|lane|drive|way|park|court|plaza|square)\b/i.test(after)) {
        return true;
    }

    // Inside a URL or email address
    const around = context.substring(Math.max(0, at - 30), at + token.length + 30);
    if (/(https?:\/\/|www\.|\.[a-z]{2,4}\/|@)/i.test(around)) return true;

    // Ordinary words
    if (/^[A-Za-z]+$/.test(token)) {
        const commonWords = ['code', 'from', 'date', 'time', 'mail', 'email',
            'best', 'team', 'your', 'this', 'that', 'with', 'have', 'here', 'link',
            'dear', 'hello', 'please', 'click', 'below'];
        if (commonWords.indexOf(token.toLowerCase()) !== -1) return true;
    }

    return false;
}

function otpScore(token, position, type, fullText) {
    let score = 0;

    if (type === 'digit') score += 80;
    else if (type === 'alphanumeric') score += 50;
    else if (type === 'spaced') score += 60;

    if (otpNearKeyword(fullText, position, token.length)) score += 90;
    if (otpAfterStrongPhrase(fullText, position)) score += 180;

    // Sitting alone on its own line
    const lines = fullText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === token || trimmed === token.replace(/[\s-]/g, '')) { score += 60; break; }
    }

    if (token.length === 6 && type === 'digit') score += 40;
    else if (token.length === 4 && type === 'digit') score += 20;
    else if (token.length >= 8) score += 10;

    if (/^G-\d+$/.test(token) || /^[A-Z0-9]{8,16}$/.test(token)) score += 30;

    const context = fullText.substring(
        Math.max(0, position - 150),
        Math.min(fullText.length, position + token.length + 150)
    ).toLowerCase();

    if (/received|sent|date|time|pm|am|timestamp|expires?|expiry|valid until/i.test(context)) score -= 40;
    if (/(https?:\/\/|www\.|@)/i.test(context)) score -= 50;

    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (fullText.match(new RegExp('\\b' + escaped + '\\b', 'g')) || []).length;
    if (count > 3) score -= 80;

    if (context.length > 250 && !OTP_CONTEXT_KEYWORDS.some(kw => context.includes(kw))) score -= 50;

    return score;
}

/**
 * @param {string} text      Email subject + body
 * @param {string} [subject] Optional subject line, scored higher
 * @returns {string|null}    The OTP code, or null when nothing is confident
 */
function extractOtp(text, subject) {
    const full = otpPreprocess(text);
    const subj = otpPreprocess(subject);
    const combined = subj ? subj + '\n\n' + full : full;

    if (!combined) return null;

    const candidates = [];
    let match;

    // 1) Plain digits
    const digitRe = /\b(\d{3,16})\b/g;
    while ((match = digitRe.exec(combined)) !== null) {
        const token = match[1];
        const position = match.index;
        const charBefore = position > 0 ? combined[position - 1] : '';
        if (charBefore === '.') continue;                       // version / decimal part
        if (token.length >= 10 && !otpNearKeyword(combined, position, token.length, 100)) continue;

        const ctx = combined.substring(Math.max(0, position - 60), Math.min(combined.length, position + token.length + 60));
        if (otpShouldExclude(token, ctx, combined)) continue;
        candidates.push({ token, score: otpScore(token, position, 'digit', combined) });
    }

    // 2) Alphanumeric codes that mix letters and digits
    const alnumRe = /\b([A-Z0-9]{4,16})(?![a-z])\b/gi;
    while ((match = alnumRe.exec(combined)) !== null) {
        const token = match[1].toUpperCase();
        if (!/[A-Z]/.test(token) || !/\d/.test(token)) continue;
        const position = match.index;
        const ctx = combined.substring(Math.max(0, position - 60), Math.min(combined.length, position + token.length + 60));
        if (otpShouldExclude(token, ctx, combined)) continue;
        candidates.push({ token, score: otpScore(token, position, 'alphanumeric', combined) });
    }

    // 3) Prefixed codes such as G-123456 / #123456
    const prefixRe = /\b([A-Z]-\d{4,10}|#\d{4,10})\b/gi;
    while ((match = prefixRe.exec(combined)) !== null) {
        const token = match[1].toUpperCase();
        candidates.push({ token, score: otpScore(token, match.index, 'alphanumeric', combined) + 100 });
    }

    // 4) Spaced / dashed codes such as "1234 5678".
    //    Digits only — allowing letters matched prose, e.g. "12/03/2026 AT 10:30"
    //    produced "2026AT10". Prefixed letter codes are handled in step 3.
    const spacedRe = /\b(?:[A-Z0-9]{2,5}[- ]){1,6}[A-Z0-9]{2,5}\b/gi;
    while ((match = spacedRe.exec(combined)) !== null) {
        const token = match[0].replace(/[\s-]/g, '').toUpperCase();
        if (token.length < 4 || token.length > 20 || !/^\d+$/.test(token)) continue;
        const position = match.index;
        const ctx = combined.substring(Math.max(0, position - 60), Math.min(combined.length, position + token.length + 60));
        if (otpShouldExclude(token, ctx, combined)) continue;
        candidates.push({ token, score: otpScore(token, position, 'digit', combined) });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);

    // Keep the first occurrence of each distinct code
    const seen = {};
    const unique = [];
    for (let i = 0; i < candidates.length; i++) {
        const key = candidates[i].token.toUpperCase();
        if (seen[key]) continue;
        seen[key] = true;
        unique.push(candidates[i]);
    }

    // Subject-line codes are very reliable
    if (subj) {
        const subjLower = subj.toLowerCase();
        for (let i = 0; i < unique.length; i++) {
            if (subjLower.includes(unique[i].token.toLowerCase())) {
                unique[i].score += 130;
                if (OTP_CONTEXT_KEYWORDS.some(kw => subjLower.includes(kw))) unique[i].score += 80;
            }
        }
        unique.sort((a, b) => b.score - a.score);
    }

    const best = unique[0];
    return (best && best.score >= 40) ? best.token : null;
}

// Guarded export: a top-level ReferenceError here silently kills every
// statement that comes after it in this file.
window.extractOtp = (typeof extractOtp === 'function') ? extractOtp : function () { return null; };

// =============================================
// LIVE PAGES — Routing & Titles
// =============================================
PAGE_TITLES['live2fa'] = '2FA LIVE';
PAGE_TITLES['liveInstagram'] = 'INSTAGRAM LIVE';
PAGE_TITLES['liveFacebook'] = 'FACEBOOK LIVE';
PAGE_TITLES['liveTiktok'] = 'TIKTOK LIVE';
PAGE_TITLES['liveTwitter'] = 'TWITTER LIVE';
PAGE_TITLES['liveThreads'] = 'THREADS LIVE';
PAGE_TITLES['vpnVerificationPage'] = 'HOSTING VERIFY';
PAGE_TITLES['hostingVerificationPage'] = 'HOSTING VERIFY';

function submitVerification(type) {
    const inputId = type === 'hosting' ? 'hostingVerifyInput' : 'vpnVerifyInput';
    const passId = type === 'hosting' ? 'hostingVerifyPass' : 'vpnVerifyPass';
    const val = document.getElementById(inputId)?.value?.trim();
    const pass = document.getElementById(passId)?.value?.trim();

    if (!val) {
        showToast('Please enter your email or username', 'error');
        return;
    }

    const currentUsd = parseFloat(userData.balance || 0);
    if (currentUsd < 5) {
        showToast('Insufficient balance. Required: $5.00 for verification.', 'error');
        setTimeout(() => nav('deposit'), 1500);
        return;
    }

    let modal = document.getElementById('verificationConfirmModal');
    if (!modal) {
        const modalHtml = `
            <div id="verificationConfirmModal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:9999; align-items:center; justify-content:center;">
                <div class="modal-body glass-card p-6 rounded-2xl" style="width:90%; max-width:380px; background:#1a1a2e; border:1px solid rgba(255,255,255,0.1); text-align:center;">
                    <div style="font-size:48px; color:#3b82f6; margin-bottom:16px;"><i class="fas fa-shield-alt"></i></div>
                    <h3 style="font-size:18px; font-weight:800; color:#fff; margin-bottom:8px;">Confirm Verification</h3>
                    <p style="font-size:13px; color:var(--text-sub); margin-bottom:24px; line-height:1.5;">A non-refundable fee of <b style="color:#fff;">$5.00</b> will be deducted from your balance for this verification request. If the admin rejects the request, the amount will not be refunded. Do you want to proceed?</p>
                    <div style="display:flex; gap:12px;">
                        <button onclick="document.getElementById('verificationConfirmModal').style.display='none'" style="flex:1; padding:12px; background:rgba(255,255,255,0.1); color:#fff; border-radius:12px; font-weight:700; font-size:14px; border:none; cursor:pointer;">Cancel</button>
                        <button id="btnConfirmVerification" style="flex:1; padding:12px; background:#3b82f6; color:#fff; border-radius:12px; font-weight:700; font-size:14px; border:none; cursor:pointer;">Proceed ($5.00)</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('verificationConfirmModal');
    }

    modal.style.display = 'flex';
    const confirmBtn = document.getElementById('btnConfirmVerification');
    
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        apiFetch('/api/verification/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, type, email: val, password: pass })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showToast(data.message || '✅ Verification request submitted!');
                if (data.newBalance !== undefined) {
                    userData.balance = data.newBalance;
                    renderBalances();
                }
                if (document.getElementById(inputId)) document.getElementById(inputId).value = '';
                if (document.getElementById(passId)) document.getElementById(passId).value = '';
                loadVerificationHistory(type);
            } else {
                showToast(data.message || 'Submission failed', 'error');
                if (data.redirectDeposit) {
                    setTimeout(() => nav('deposit'), 1500);
                }
            }
        })
        .catch(() => showToast('Network error submitting verification', 'error'));
    });
}

function loadVerificationHistory(type) {
    if (!userData || !userData.id) return;
    apiFetch(`/api/verification/history/${userData.id}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const listEl = document.getElementById('vpnVerificationHistoryList');
                if (!listEl) return;
                const filtered = data.history;
                if (filtered.length === 0) {
                    listEl.innerHTML = `<div class="empty-state" style="border:none; background:transparent; box-shadow:none; padding-top:40px">
                        <div class="empty-icon" style="background:rgba(255,255,255,0.05); color:#666"><i class="fas fa-history"></i></div>
                        <p style="font-size:14px">No history yet</p>
                    </div>`;
                    return;
                }
                let html = '';
                filtered.forEach(item => {
                    let statusColor = '#f59e0b';
                    let statusText = 'PENDING (24h)';
                    if (item.status === 'approved') {
                        statusColor = '#22c55e';
                        statusText = 'APPROVED ✅';
                    } else if (item.status === 'rejected') {
                        statusColor = '#ef4444';
                        statusText = 'REJECTED ❌';
                    }

                    let credentialsDisplay = '';
                    if (item.adminUsername || item.adminPassword) {
                        credentialsDisplay = `<div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); border-radius:10px; padding:12px; margin-top:10px;">
                            <div style="font-size:10px; font-weight:700; color:#3b82f6; text-transform:uppercase; margin-bottom:4px;">Admin Credentials / Login Info</div>
                            <div style="font-size:13px; color:#fff; font-family:monospace; margin-bottom:2px;">Username: <b>${item.adminUsername || item.email}</b></div>
                            <div style="font-size:13px; color:#fff; font-family:monospace; margin-bottom:8px;">Password: <b>${item.adminPassword || item.password}</b></div>
                            <button onclick="navigator.clipboard.writeText('Username: ${item.adminUsername || item.email}\\nPassword: ${item.adminPassword || item.password}'); showToast('✅ Copied credentials!');" style="background:#3b82f6; color:#fff; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">COPY CREDENTIALS</button>
                        </div>`;
                    } else if (item.status === 'approved' && item.otpCode && !item.adminUsername) {
                        credentialsDisplay = `<div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.2); border-radius:10px; padding:10px; margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:10px; font-weight:700; color:#22c55e; text-transform:uppercase;">Admin Credentials / Login Info</div>
                                <div style="font-size:15px; font-weight:900; color:#fff; font-family:monospace; word-break:break-all;">${item.otpCode}</div>
                            </div>
                            <button onclick="navigator.clipboard.writeText('${item.otpCode}'); showToast('✅ Copied credentials!');" style="background:#22c55e; color:#000; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer; white-space:nowrap; margin-left:8px;">COPY</button>
                        </div>`;
                    }

                    let otpDisplay = '';
                    if (item.otpCode && item.adminUsername) {
                        otpDisplay = `<div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.2); border-radius:10px; padding:10px; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:10px; font-weight:700; color:#22c55e; text-transform:uppercase;">Get Code / OTP Code</div>
                                <div style="font-size:15px; font-weight:900; color:#fff; font-family:monospace; word-break:break-all;">${item.otpCode}</div>
                            </div>
                            <button onclick="navigator.clipboard.writeText('${item.otpCode}'); showToast('✅ Copied verification code!');" style="background:#22c55e; color:#000; border:none; padding:6px 12px; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer; white-space:nowrap; margin-left:8px;">COPY CODE</button>
                        </div>`;
                    }

                    let statusInfo = credentialsDisplay + otpDisplay;
                    if (!statusInfo && item.status === 'pending') {
                        statusInfo = `<div style="font-size:11px; color:var(--text-sub); margin-top:6px;">🕒 Submitted on ${new Date(item.createdAt).toLocaleString()}. Awaiting admin review & credentials.</div>`;
                    } else if (!statusInfo && item.status === 'rejected') {
                        statusInfo = `<div style="font-size:11px; color:#ef4444; margin-top:6px;">❌ Request was rejected by admin.</div>`;
                    }

                    html += `<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:16px; padding:16px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:11px; font-weight:800; color:${statusColor}; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:8px;">${statusText}</span>
                            <button onclick="deleteVerificationItem('${type}', '${item.id}')" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:13px;"><i class="fas fa-trash"></i></button>
                        </div>
                        <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:4px; word-break:break-all;">Email: ${item.email}</div>
                        ${statusInfo}
                    </div>`;
                });
                listEl.innerHTML = html;
            }
        })
        .catch(() => {});
}

function deleteVerificationItem(type, id) {
    if (!userData || !userData.id) return;
    apiFetch(`/api/verification/delete/${userData.id}/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showToast('Deleted request');
                loadVerificationHistory(type);
            }
        });
}

function clearVerificationHistory(type) {
    if (!userData || !userData.id) return;
    if (!confirm('Are you sure you want to clear all verification history for this service?')) return;
    apiFetch(`/api/verification/clear/${userData.id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showToast('History cleared');
                loadVerificationHistory(type);
            }
        });
}

window.submitVerification = submitVerification;
window.deleteVerificationItem = deleteVerificationItem;
window.clearVerificationHistory = clearVerificationHistory;

// =============================================
// 2FA TOTP LIVE — START / RESTART Logic
// =============================================
var _twofaInterval = null;

/**
 * Minimal TOTP generator (RFC 6238 / Base32 HMAC-SHA1)
 * Works in-browser without any library dependency.
 */
function generateTOTP(secretBase32) {
    // Base32 decode
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const base32 = secretBase32.toUpperCase().replace(/\s/g, '').replace(/=/g, '');
    let bits = '';
    for (const c of base32) {
        const idx = alphabet.indexOf(c);
        if (idx < 0) continue;
        bits += idx.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }

    // Counter = floor(epoch / 30)
    const counter = Math.floor(Date.now() / 30000);
    const msg = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c >>>= 8; }

    // HMAC-SHA1 via SubtleCrypto (async – handled via Promise)
    return window.crypto.subtle.importKey(
        'raw', new Uint8Array(bytes), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    ).then(key => window.crypto.subtle.sign('HMAC', key, msg))
        .then(sig => {
            const h = new Uint8Array(sig);
            const offset = h[19] & 0xf;
            const code = (((h[offset] & 0x7f) << 24) |
                ((h[offset + 1] & 0xff) << 16) |
                ((h[offset + 2] & 0xff) << 8) |
                (h[offset + 3] & 0xff)) % 1000000;
            return String(code).padStart(6, '0');
        });
}

function start2faLive() {
    const startBtn = document.getElementById('twofa-start-btn');

    // Toggle STOP functionality if already running
    if (_twofaInterval) {
        clearInterval(_twofaInterval);
        _twofaInterval = null;

        if (startBtn) {
            startBtn.innerHTML = '<i class="fas fa-play"></i> START';
            startBtn.style.background = 'linear-gradient(135deg,#4f46e5,#7c3aed)';
        }

        const result = document.getElementById('twofa-result');
        const timer = document.getElementById('twofa-timer');
        if (result) result.textContent = '------';
        if (timer) timer.textContent = 'Waiting...';

        const copyBtn = document.getElementById('twofa-restart-btn');
        if (copyBtn) {
            copyBtn.innerHTML = '<i class="fas fa-paste"></i> PASTE';
            copyBtn.onclick = pasteFromClipboard;
        }

        const input = document.getElementById('twofa-input');
        if (input) {
            input.value = '';
            const clearBtn = document.getElementById('twofa-clear-btn');
            if (clearBtn) clearBtn.style.display = 'none';
        }

        window.showToast('🛑 2FA service stopped and data cleared.');
        return;
    }

    const input = document.getElementById('twofa-input');
    const secret = input ? input.value.trim() : '';
    if (!secret) {
        window.showToast('⚠️ Please enter a 2FA secret key first!');
        return;
    }

    // Call server to deduct tokens
    if (!userData || !userData.id) {
        window.showToast('⚠️ User data not found. Please reload.');
        return;
    }

    if (startBtn) startBtn.disabled = true;

    apiFetch('/api/generate/live2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id })
    })
        .then(r => r.json())
        .then(data => {
            if (startBtn) startBtn.disabled = false;

            if (!data.success) {
                window.showToast(`❌ ${data.message}`);
                return;
            }

            // Success! Tokens deducted. Start service.
            updateTwoFA(secret);
            _twofaInterval = setInterval(() => updateTwoFA(secret), 1000);

            // Update button states to STOP
            if (startBtn) {
                startBtn.innerHTML = '<i class="fas fa-stop"></i> STOP';
                startBtn.style.background = 'linear-gradient(135deg,#dc2626,#ef4444)'; // Red for Stop
            }

            const copyBtn = document.getElementById('twofa-restart-btn');
            if (copyBtn) {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> COPY';
                copyBtn.onclick = copy2faCode;
            }

            window.showToast('🚀 2FA service started.');

            // Refresh balance and history
            if (typeof checkUserStatus === 'function') checkUserStatus();
            if (typeof loadRecentActivity === 'function') loadRecentActivity();
        })
        .catch(err => {
            if (startBtn) startBtn.disabled = false;
            window.showToast('❌ Failed to start service. Try again.');
            console.error(err);
        });
}

function copy2faCode() {
    const result = document.getElementById('twofa-result');
    const code = result ? result.textContent.trim() : '';
    if (code && code !== '------' && code !== 'ERROR') {
        navigator.clipboard.writeText(code).then(() => {
            window.showToast('📋 Code copied to clipboard!');
        }).catch(() => {
            window.showToast('❌ Failed to copy!');
        });
    } else {
        window.showToast('⚠️ No code to copy!');
    }
}

function pasteFromClipboard() {
    navigator.clipboard.readText().then(text => {
        const input = document.getElementById('twofa-input');
        if (input) {
            input.value = text;
            const btn = document.getElementById('twofa-clear-btn');
            if (btn) btn.style.display = text ? 'block' : 'none';
        }
        window.showToast('📋 Pasted from clipboard!');
    }).catch(err => {
        window.showToast('❌ Failed to read clipboard!');
        console.error(err);
    });
}

function toggleClearBtn(input) {
    const btn = document.getElementById('twofa-clear-btn');
    if (btn) {
        btn.style.display = input.value ? 'block' : 'none';
    }
}

function clearTwoFAInput() {
    const input = document.getElementById('twofa-input');
    if (input) {
        input.value = '';
        toggleClearBtn(input);
    }
}

window.pasteFromClipboard = pasteFromClipboard;
window.toggleClearBtn = toggleClearBtn;
window.clearTwoFAInput = clearTwoFAInput;

function updateTwoFA(secret) {
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    const timer = document.getElementById('twofa-timer');
    if (timer) timer.textContent = `Refreshes in ${remaining}s`;

    generateTOTP(secret)
        .then(code => {
            const result = document.getElementById('twofa-result');
            if (result) result.textContent = code;
        })
        .catch(() => {
            const result = document.getElementById('twofa-result');
            if (result) result.textContent = 'ERROR';
            if (timer) timer.textContent = 'Invalid secret key';
        });
}

window.start2faLive = start2faLive;
window.copy2faCode = copy2faCode;

// =============================================
// LIVE CHECKER — Instagram, Facebook, TikTok, Twitter, Threads
// Multi-account bulk checker with progress bar
// =============================================
const LIVE_PLATFORM_CONFIG = {
    instagram: { color: '#ec4899', gradient: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)', apiType: 'liveinstagram' },
    facebook: { color: '#3b82f6', gradient: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', apiType: 'livefacebook' },
    tiktok: { color: '#69c9d0', gradient: 'linear-gradient(135deg,#010101,#69c9d0)', apiType: 'livetiktok' },
    twitter: { color: '#1d9bf0', gradient: 'linear-gradient(135deg,#000,#1d9bf0)', apiType: 'livetwitter' },
    threads: { color: '#aaa', gradient: 'linear-gradient(135deg,#1a1a1a,#555)', apiType: 'livethreads' }
};

// Track running checks to allow stop
const _liveCheckRunning = {};

// Update account count badge as user types
function updateLiveCount(platform) {
    const cap = platform.charAt(0).toUpperCase() + platform.slice(1);
    const textarea = document.getElementById('live' + cap + 'Input');
    const badge = document.getElementById('live' + cap + 'Count');
    if (!textarea || !badge) return;
    const lines = textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    badge.textContent = lines.length + ' account' + (lines.length !== 1 ? 's' : '');
}
window.updateLiveCount = updateLiveCount;

async function startLiveCheck(platform) {
    const cfg = LIVE_PLATFORM_CONFIG[platform];
    if (!cfg) return;

    const cap = platform.charAt(0).toUpperCase() + platform.slice(1);
    const textarea = document.getElementById('live' + cap + 'Input');
    const btn = document.getElementById('live' + cap + 'Btn');
    const progressDiv = document.getElementById('live' + cap + 'Progress');
    const progressBar = document.getElementById('live' + cap + 'ProgressBar');
    const progressTxt = document.getElementById('live' + cap + 'ProgressText');
    const liveCountEl = document.getElementById('live' + cap + 'LiveCount');
    const deadCountEl = document.getElementById('live' + cap + 'DeadCount');
    const resultsDiv = document.getElementById('live' + cap + 'Results');
    const validTA = document.getElementById('live' + cap + 'Valid');
    const deadTA = document.getElementById('live' + cap + 'Dead');

    // ── STOP mode ──
    if (_liveCheckRunning[platform]) {
        _liveCheckRunning[platform] = false;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-play-circle"></i> START LIVE CHECK';
            btn.style.background = cfg.gradient;
        }
        window.showToast('⏹ Check stopped.');
        return;
    }

    if (!textarea) return;
    const accounts = textarea.value.split('\n')
        .map(line => {
            let clean = line.trim();
            if (clean.includes(':')) clean = clean.split(':')[0].trim();
            if (clean.includes('|')) clean = clean.split('|')[0].trim();
            clean = clean.replace(/^@/, '');
            if (clean.includes('@')) clean = clean.split('@')[0].trim();
            return clean;
        })
        .filter(l => l.length > 0);

    if (accounts.length === 0) {
        window.showToast('⚠️ Please enter at least one username or email!');
        return;
    }

    if (!userData || !userData.id) {
        window.showToast('⚠️ Please login first!');
        return;
    }

    const costPerAccount = 10;
    const totalCost = accounts.length * costPerAccount;
    const currentTokens = userData.tokens || 0;

    if (currentTokens < costPerAccount) {
        window.showToast('❌ Insufficient tokens! Need ' + costPerAccount + ' TC per account.');
        return;
    }

    // Confirm if checking many accounts
    if (accounts.length > 5) {
        const confirmed = await new Promise(resolve => {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:16px;';
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:20px;padding:24px;max-width:320px;width:100%;border:1px solid rgba(255,255,255,0.1);text-align:center;">
                    <div style="width:56px;height:56px;background:rgba(245,158,11,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                        <i class="fas fa-bolt" style="color:#f59e0b;font-size:24px;"></i>
                    </div>
                    <h3 style="color:#fff;font-size:17px;font-weight:800;margin:0 0 8px;">Bulk Check</h3>
                    <p style="color:#9ca3af;font-size:13px;margin:0 0 6px;">${accounts.length} accounts × ${costPerAccount} TC</p>
                    <p style="color:#f59e0b;font-size:18px;font-weight:900;margin:0 0 20px;">Total: ${Math.min(totalCost, currentTokens)} TC</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <button id="_lc_cancel" style="padding:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:12px;font-weight:700;cursor:pointer;font-size:14px;">Cancel</button>
                        <button id="_lc_confirm" style="padding:12px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-size:14px;">Start</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('_lc_confirm').onclick = () => { modal.remove(); resolve(true); };
            document.getElementById('_lc_cancel').onclick = () => { modal.remove(); resolve(false); };
        });
        if (!confirmed) return;
    }

    // ── Start checking ──
    _liveCheckRunning[platform] = true;

    // Clear previous results
    if (validTA) validTA.value = '';
    if (deadTA) deadTA.value = '';
    if (liveCountEl) liveCountEl.textContent = '0';
    if (deadCountEl) deadCountEl.textContent = '0';

    // Show progress, results
    if (progressDiv) progressDiv.style.display = 'block';
    if (resultsDiv) resultsDiv.style.display = 'block';

    // Switch button to STOP
    if (btn) {
        btn.innerHTML = '<i class="fas fa-stop-circle"></i> STOP';
        btn.style.background = 'linear-gradient(135deg,#dc2626,#ef4444)';
    }

    let liveCount = 0;
    let deadCount = 0;
    let checked = 0;

    for (const account of accounts) {
        if (!_liveCheckRunning[platform]) break; // stopped

        // Update progress
        const pct = Math.round((checked / accounts.length) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressTxt) progressTxt.textContent = checked + ' / ' + accounts.length;

        try {
            const res = await apiFetch('/api/generate/live-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userData.id,
                    platform,
                    account,
                    type: cfg.apiType
                })
            });
            const data = await res.json();

            if (data.success) {
                // Update balance live
                if (typeof data.newBalance === 'number') {
                    userData.tokens = data.newBalance;
                    renderBalances();
                }

                if (data.alive) {
                    liveCount++;
                    if (validTA) validTA.value = (validTA.value ? validTA.value + '\n' : '') + account;
                    if (liveCountEl) liveCountEl.textContent = liveCount;
                } else {
                    deadCount++;
                    if (deadTA) deadTA.value = (deadTA.value ? deadTA.value + '\n' : '') + account;
                    if (deadCountEl) deadCountEl.textContent = deadCount;
                }
            } else {
                // Insufficient balance — stop
                if (data.message && data.message.includes('Insufficient')) {
                    window.showToast('❌ ' + data.message + ' — Check stopped.');
                    break;
                }
                // Other error — treat as unknown, add to dead
                deadCount++;
                if (deadTA) deadTA.value = (deadTA.value ? deadTA.value + '\n' : '') + account;
                if (deadCountEl) deadCountEl.textContent = deadCount;
            }
        } catch (e) {
            console.warn('Live check error for ' + account + ':', e.message);
        }

        checked++;

        // Small delay between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 600));
    }

    // Done
    _liveCheckRunning[platform] = false;
    if (progressBar) progressBar.style.width = '100%';
    if (progressTxt) progressTxt.textContent = checked + ' / ' + accounts.length;

    if (btn) {
        btn.innerHTML = '<i class="fas fa-play-circle"></i> START LIVE CHECK';
        btn.style.background = cfg.gradient;
    }

    const stoppedEarly = checked < accounts.length;
    window.showToast(
        stoppedEarly
            ? '⏹ Stopped — ' + liveCount + ' live, ' + deadCount + ' dead'
            : '✅ Done! ' + liveCount + ' live, ' + deadCount + ' dead'
    );

    if (typeof loadRecentActivity === 'function') loadRecentActivity();
}
window.startLiveCheck = startLiveCheck;

function copyLiveResults(elementId) {
    const el = document.getElementById(elementId);
    if (!el || !el.value.trim()) {
        window.showToast('⚠️ Nothing to copy!');
        return;
    }
    const text = el.value.trim();
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            window.showToast('✅ Copied ' + text.split('\n').length + ' account(s)!');
        }).catch(() => _fallbackCopyText(text));
    } else {
        _fallbackCopyText(text);
    }
}
window.copyLiveResults = copyLiveResults;

function _fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); window.showToast('✅ Copied!'); }
    catch (e) { window.showToast('❌ Copy failed — please copy manually.'); }
    document.body.removeChild(ta);
}

function downloadLiveResults(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el || !el.value.trim()) {
        window.showToast('⚠️ Nothing to download!');
        return;
    }
    const text = el.value.trim();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.showToast('📥 Download started: ' + filename);
}
window.downloadLiveResults = downloadLiveResults;


function copyOtpFromChip(btn, code) {
    if (!code) return;

    copyText(code);
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    const icon = btn.querySelector('i');
    if (icon) {
        const originalClass = icon.className;
        icon.className = 'fas fa-check';
        btn.style.background = '#22c55e';
        btn.style.transform = 'scale(1.1)';

        setTimeout(() => {
            icon.className = originalClass;
            btn.style.background = '#10b981';
            btn.style.transform = '';
        }, 1000);
    }
}
window.copyOtpFromChip = copyOtpFromChip;

// =============================================
// =============================================
// ITEM SELLING MODULE
// =============================================
let sellingRewards = {};

async function fetchSellingRewards() {
    try {
        const res = await apiFetch('/api/user/item-sales/rewards');
        const data = await res.json();
        if (data.success) {
            sellingRewards = data.rewards;
        }
    } catch (e) {
        console.error('Error fetching selling rewards:', e);
    }
}

// Item Selling Helper: Set Selection Type
function setSellItemType(type) {
    const isSub = (type === 'subscription');
    document.getElementById('selIsSubscription').value = isSub;

    const btnSub = document.getElementById('btnSellTypeSub');
    const btnAcc = document.getElementById('btnSellTypeAcc');

    if (isSub) {
        btnSub.style.background = 'var(--accent-color)';
        btnSub.style.color = '#000';
        btnSub.innerText = 'SHOP'; // Changed from SUBSCRIPTIONS
        btnAcc.style.background = 'rgba(255,255,255,0.05)';
        btnAcc.style.color = 'var(--text-sub)';
        btnAcc.innerText = 'ACCOUNTS';
    } else {
        btnAcc.style.background = 'var(--accent-color)';
        btnAcc.style.color = '#000';
        btnAcc.innerText = 'ACCOUNTS';
        btnSub.style.background = 'rgba(255,255,255,0.05)';
        btnSub.style.color = 'var(--text-sub)';
        btnSub.innerText = 'SHOP'; // Changed from SUBSCRIPTIONS
    }

    // Filter Category Grid based on type
    const grid = document.getElementById('itemSellCategoryGrid');
    if (grid) {
        const cards = grid.getElementsByClassName('sell-cat-card');
        for (let card of cards) {
            const cardType = card.getAttribute('data-sell-type');
            if (isSub) {
                card.style.display = (cardType === 'subscription' || cardType === 'both') ? 'flex' : 'none';
            } else {
                card.style.display = (cardType === 'account' || cardType === 'both') ? 'flex' : 'none';
            }
        }

        // AUTO-RESET IF FORM IS OPEN:
        // If they click the toggle while the form is open, take them back to the grid
        const form = document.getElementById('itemSellFormContainer');
        const selCat = document.getElementById('selItemCategory').value;
        if (form && form.style.display === 'block' && selCat) {
            // Only reset if they click the opposite of what they selected
            // But for simplicity, reset always so they see the fresh list
            const isfc = document.getElementById('itemSellFormContainer');
            const iscg = document.getElementById('itemSellCategoryGrid');
            if (isfc) isfc.style.display = 'none';
            if (iscg) iscg.style.display = 'grid';
            document.getElementById('selItemCategory').value = '';
        }
    }

    updateSellRewardPreview();
}
window.setSellItemType = setSellItemType;



function selectSellCategory(cat, icon, gradient) {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    document.getElementById('selItemCategory').value = cat;
    const iscg = document.getElementById('itemSellCategoryGrid');
    const isfc = document.getElementById('itemSellFormContainer');
    if (iscg) iscg.style.display = 'none';
    if (isfc) isfc.style.display = 'block';

    // Header for form
    const catName = document.getElementById('selectedCatName');
    const catIcon = document.getElementById('selectedCatIcon');
    if (catName) catName.innerText = cat.toUpperCase();
    if (catIcon) {
        catIcon.innerHTML = `<i class="${icon}"></i>`;
        catIcon.style.background = gradient;
    }

    // Toggle logic for fields
    const apiFields = document.getElementById('apiKeyFields');
    const vpnFields = document.getElementById('vpnFields');
    const cardFields = document.getElementById('cardFields');
    const accountFields = document.getElementById('accountFields');
    const accountExtraFields = document.getElementById('accountExtraFields');
    const otherFields = document.getElementById('otherItemFields');

    if (apiFields) apiFields.style.display = (cat === 'API Key') ? 'block' : 'none';
    if (vpnFields) vpnFields.style.display = (cat === 'VPN') ? 'block' : 'none';
    if (cardFields) cardFields.style.display = (cat === 'Card') ? 'block' : 'none';
    if (otherFields) otherFields.style.display = (cat === 'Other' || cat === 'App') ? 'block' : 'none';

    // Show account generic fields for most categories except Card and API Key
    if (accountFields) accountFields.style.display = (cat !== 'Card' && cat !== 'API Key') ? 'block' : 'none';

    // Account Name/Logo for 'Account' category
    if (accountExtraFields) accountExtraFields.style.display = (cat === 'Account') ? 'block' : 'none';

    // Update Email/Password labels based on category
    const lblEmail = document.getElementById('lblSelItemEmail');
    if (lblEmail) {
        if (cat === 'Telegram') lblEmail.textContent = 'PHONE NUMBER *';
        else if (cat === 'Discord') lblEmail.textContent = 'DISCORD TOKEN *';
        else lblEmail.textContent = 'LOGIN EMAIL / USERNAME *';
    }

    // Show duration only for relevant items
    const subscriptionFields = document.getElementById('subscriptionFields');
    const hideDurationFor = ['Gmail', 'TikTok', 'Facebook', 'Telegram', 'Discord', 'Card'];
    if (subscriptionFields) subscriptionFields.style.display = hideDurationFor.includes(cat) ? 'none' : 'block';

    // Custom price field for 'Other' or 'App' (if added)
    const requestedPriceField = document.getElementById('requestedPriceField');
    if (requestedPriceField) requestedPriceField.style.display = (cat === 'Other' || cat === 'App') ? 'block' : 'none';

    updateSellRewardPreview();
}

function toggle2FAFields() {
    const is2fa = document.getElementById('selItem2FA').checked;
    const fields = document.getElementById('twoFAFields');
    if (fields) {
        fields.style.display = is2fa ? 'block' : 'none';
        if (!is2fa) {
            const authCode = document.getElementById('sel2FAAuthCode');
            const backupCode = document.getElementById('sel2FABackupCode');
            const appCode = document.getElementById('sel2FAAppCode');
            if (authCode) authCode.value = '';
            if (backupCode) backupCode.value = '';
            if (appCode) appCode.value = '';
        }
    }
}

function previewCustomIcon(input) {
    const preview = document.getElementById('customIconPreview');
    if (!preview || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
}

function previewCardLogo(input) {
    const preview = document.getElementById('cardLogoPreview');
    if (!preview || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">`;
    preview.style.border = '2px solid #8b5cf6';
}
window.previewCardLogo = previewCardLogo;

function resetSellCategory() {
    const iscg = document.getElementById('itemSellCategoryGrid');
    const isfc = document.getElementById('itemSellFormContainer');
    if (iscg) iscg.style.display = 'grid';
    if (isfc) isfc.style.display = 'none';
    document.getElementById('selItemCategory').value = '';

    // Reset all form fields
    const fields = ['selItemEmail', 'selItemPassword', 'selItemCustomName', 'apiServiceName', 'apiKeyValue', 'apiQuota', 'apiExtraInfo', 'sel2FAAuthCode', 'sel2FABackupCode', 'sel2FAAppCode', 'vpnName', 'vpnEmail', 'vpnPassword', 'vpnPlan', 'cardNumber', 'cardName', 'cardIP', 'cardHolderNames', 'cardBillingAddress', 'selItemCustomDuration', 'selItemRequestedPrice'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    // Reset Card Types
    const cardTypeRadios = document.getElementsByName('cardType');
    if (cardTypeRadios) cardTypeRadios.forEach(r => r.checked = false);
    selectCardType(''); // Reset visual selection

    const twofa = document.getElementById('selItem2FA');
    if (twofa) twofa.checked = false;

    const twoFAFields = document.getElementById('twoFAFields');
    if (twoFAFields) {
        twoFAFields.style.opacity = '0';
        twoFAFields.style.display = 'none';
    }

    // Reset icon preview
    const iconPreview = document.getElementById('customIconPreview');
    if (iconPreview) iconPreview.innerHTML = '<i class="fas fa-image"></i>';

    const iconFile = document.getElementById('selItemIconFile');
    if (iconFile) iconFile.value = '';

    // Reset card logo preview
    const cardLogoPreview = document.getElementById('cardLogoPreview');
    if (cardLogoPreview) {
        cardLogoPreview.innerHTML = '<i class="fas fa-image" style="color:var(--text-sub); font-size:24px;"></i>';
        cardLogoPreview.style.border = '2px dashed var(--border-color)';
    }
    const cardLogoFile = document.getElementById('cardLogoFile');
    if (cardLogoFile) cardLogoFile.value = '';

    setSellDuration(30); // Reset to 30 days default

    // Refresh filter based on current type
    const isSub = (document.getElementById('selIsSubscription').value === 'true');
    setSellItemType(isSub ? 'subscription' : 'account');
}

function setSellDuration(days) {
    const hidden = document.getElementById('selItemDurationDays');
    const custom = document.getElementById('selItemCustomDuration');
    const btns = [7, 30, 90, 365];

    if (days === 'custom') {
        hidden.value = custom.value || 30;
        days = null; // deselect buttons
    } else {
        hidden.value = days;
        if (custom) custom.value = '';
    }

    btns.forEach(b => {
        const btn = document.getElementById('btnDur' + b);
        if (btn) {
            if (b === days) {
                btn.style.borderColor = 'var(--accent-color)';
                btn.style.background = 'rgba(234,179,8,0.15)';
                btn.style.color = 'var(--accent-color)';
            } else {
                btn.style.borderColor = 'var(--border-color)';
                btn.style.background = 'rgba(0,0,0,0.2)';
                btn.style.color = 'var(--text-sub)';
            }
        }
    });

    updateSellRewardPreview();
}

function updateSellRewardPreview() {
    const cat = document.getElementById('selItemCategory').value;
    const is2fa = document.getElementById('selItem2FA')?.checked;
    const appCode = document.getElementById('sel2FAAppCode')?.value?.trim();
    const preview = document.getElementById('sellRewardPreview');

    if (!cat || !sellingRewards[cat]) {
        preview.innerText = '0 TC';
        return;
    }

    if (cat === 'Other') {
        preview.innerText = 'Admin Review';
        return;
    }

    let reward = sellingRewards[cat];
    if (is2fa) {
        reward = Math.round(reward * (sellingRewards['2faMultiplier'] || 1.5));
    }
    // App code gives +25% on top
    if (is2fa && appCode) {
        reward = Math.round(reward * 1.25);
    }
    // Pro-rate by duration if it's a duration-based item
    const hideDurationFor = ['Gmail', 'TikTok', 'Facebook', 'Telegram', 'Discord', 'Card'];
    if (!hideDurationFor.includes(cat)) {
        let dur = parseInt(document.getElementById('selItemDurationDays')?.value || '30', 10);
        if (isNaN(dur) || dur < 1) dur = 30; // default 30 days for calculations if invalid
        reward = Math.round((reward / 30) * dur);
    }

    // Currency display: Card -> TC, Others -> USD
    if (cat === 'Card') {
        preview.innerText = reward + ' TC';
    } else {
        // Assume 100 TC = $1.00 for calculation if needed, or if rewards are already in currency
        // User stated: "Profile's dollar system fix... Cards processed as tokens... Others in dollars"
        // Let's assume the sellingRewards are currently in some 'reward points' that we map to dollars
        // or just show them as raw values with $ sign for now.
        preview.innerText = '$' + (reward / 10).toFixed(2); // Example mapping: 10 units = $1
    }
}

async function submitItemForSale() {
    const userId = userData.id;
    const itemType = document.getElementById('selItemCategory').value;

    if (!itemType) {
        window.showToast('Please select a category first');
        return;
    }

    const isApiKey = itemType === 'API Key';
    const isOther = itemType === 'Other' || itemType === 'App';
    const isVpn = itemType === 'VPN';
    const isCard = itemType === 'Card';
    const isSubscription = document.getElementById('selIsSubscription').value === 'true';
    let payload = { userId, itemType, isSubscription };

    // Process Duration
    const hideDurationFor = ['Gmail', 'TikTok', 'Facebook', 'Telegram', 'Discord', 'Card'];
    if (!hideDurationFor.includes(itemType)) {
        let dur = parseInt(document.getElementById('selItemDurationDays')?.value || '0', 10);
        if (dur > 0) payload.durationDays = dur;
    }

    if (isApiKey) {
        const serviceName = document.getElementById('apiServiceName')?.value.trim();
        const apiKey = document.getElementById('apiKeyValue')?.value.trim();
        if (!serviceName || !apiKey) {
            window.showToast('Please enter service name and API key');
            return;
        }
        payload.serviceName = serviceName;
        payload.apiKey = apiKey;
        payload.apiQuota = document.getElementById('apiQuota')?.value.trim() || '';
        payload.extraInfo = document.getElementById('apiExtraInfo')?.value.trim() || '';
    } else if (isVpn) {
        const vpnName = document.getElementById('vpnName')?.value.trim();
        const vpnEmail = document.getElementById('vpnEmail')?.value.trim();
        const vpnPassword = document.getElementById('vpnPassword')?.value.trim();
        if (!vpnName || !vpnEmail || !vpnPassword) {
            window.showToast('Please fill all required VPN fields');
            return;
        }
        payload.vpnName = vpnName;
        // Map VPN email/pass to standard email/pass for consistency or keep separate
        payload.email = vpnEmail;
        payload.password = vpnPassword;
        payload.vpnPlan = document.getElementById('vpnPlan')?.value.trim() || '';
    } else if (isCard) {
        const cardTypeInput = document.querySelector('input[name="cardType"]:checked');
        if (!cardTypeInput) {
            window.showToast('Please select a Card Type');
            return;
        }
        const cardName = document.getElementById('cardName')?.value.trim();
        const cardNumber = document.getElementById('cardNumber')?.value.trim();
        const cardIP = document.getElementById('cardIP')?.value.trim();
        const cardHolderNames = document.getElementById('cardHolderNames')?.value.trim();
        const cardBillingAddress = document.getElementById('cardBillingAddress')?.value.trim();

        if (!cardName) {
            window.showToast('Please enter card name');
            return;
        }
        if (!cardNumber) {
            window.showToast('Please enter card data');
            return;
        }
        if (!cardIP) {
            window.showToast('Please enter IP address');
            return;
        }
        if (!cardHolderNames) {
            window.showToast('Please enter cardholder names');
            return;
        }
        if (!cardBillingAddress) {
            window.showToast('Please enter full address');
            return;
        }

        // Parse card data from format: number|month|year|cvv
        const cards = parseCardData(document.getElementById('cardNumber'));
        if (cards.length === 0) {
            window.showToast('Please enter valid card data in format: number|month|year|cvv');
            return;
        }

        // Parse cardholder names (one per line)
        const holderNames = cardHolderNames.split('\n').filter(name => name.trim().length > 0);

        const firstNames = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Benjamin', 'Samuel', 'Gregory', 'Frank', 'Alexander', 'Raymond', 'Patrick', 'Jack', 'Dennis', 'Jerry', 'Tyler', 'Aaron', 'Jose', 'Adam', 'Nathan', 'Henry', 'Douglas', 'Zachary', 'Peter', 'Kyle', 'Ethan', 'Walter', 'Noah', 'Jeremy', 'Christian', 'Keith', 'Roger', 'Terry', 'Gerald', 'Harold', 'Sean', 'Austin', 'Carl', 'Arthur', 'Lawrence', 'Dylan', 'Jesse', 'Jordan', 'Bryan', 'Billy', 'Joe', 'Bruce', 'Gabriel', 'Logan', 'Albert', 'Willie', 'Alan', 'Juan', 'Wayne', 'Elijah', 'Randy', 'Roy', 'Vincent', 'Ralph', 'Eugene', 'Russell', 'Bobby', 'Mason', 'Philip', 'Louis'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez'];

        // Generate random name function
        function generateRandomName() {
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            return `${firstName} ${lastName}`.toUpperCase();
        }

        // Assign names to cards - use provided names first, then auto-generate
        cards.forEach((card, index) => {
            if (index < holderNames.length && holderNames[index].trim()) {
                card.holderName = holderNames[index].trim().toUpperCase();
            } else {
                // Auto-generate random name for this card
                card.holderName = generateRandomName();
            }
        });

        // Parse address dynamically using colon separator
        // Format: "FieldName: Value" - whatever is before colon is field name, after is value
        const addressLines = cardBillingAddress.split('\n').filter(line => line.trim().length > 0);
        const parsedAddress = {};

        addressLines.forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const fieldName = line.substring(0, colonIndex).trim();
                const fieldValue = line.substring(colonIndex + 1).trim();
                if (fieldName && fieldValue) {
                    parsedAddress[fieldName] = fieldValue;
                }
            }
        });

        payload.cardType = cardTypeInput.value;
        payload.cardName = cardName;
        payload.cardIP = cardIP;
        payload.cards = cards; // Array of card objects with number, month, year, cvv, holderName
        payload.cardBillingAddress = parsedAddress; // Dynamic object with field names as keys

        // Get card logo if uploaded
        const logoPreview = document.getElementById('cardLogoPreview');
        const logoImg = logoPreview?.querySelector('img');
        if (logoImg) {
            payload.cardLogo = logoImg.src;
        }
    } else {
        const email = document.getElementById('selItemEmail')?.value.trim();
        const password = document.getElementById('selItemPassword')?.value.trim();
        if (!email || !password) {
            window.showToast('Please fill in both email and password');
            return;
        }
        payload.email = email;
        payload.password = password;

        if (isOther) {
            const customName = document.getElementById('selItemCustomName')?.value.trim();
            if (!customName) {
                window.showToast('Please enter an item name');
                return;
            }
            const requestedPrice = document.getElementById('selItemRequestedPrice')?.value.trim();
            if (!requestedPrice) {
                window.showToast('Please enter your requested price');
                return;
            }
            payload.customName = customName;
            payload.requestedPrice = parseFloat(requestedPrice);
            // Reward currency for Other: TC if it's card-like, USD otherwise
            payload.rewardCurrency = (itemType === 'Card') ? 'TC' : 'USD';
        }

        // Account Name/Logo for category 'Account'
        if (itemType === 'Account') {
            payload.accountName = document.getElementById('selAccountName')?.value.trim();
            payload.accountLogo = document.getElementById('selAccountLogo')?.value.trim();
            if (!payload.accountName) {
                window.showToast('Please enter account name');
                return;
            }
        }

        const is2fa = document.getElementById('selItem2FA')?.checked;
        payload.is2fa = is2fa;
        if (is2fa) {
            const authCode = document.getElementById('sel2FAAuthCode')?.value.trim();
            const backupCode = document.getElementById('sel2FABackupCode')?.value.trim();
            const appCode = document.getElementById('sel2FAAppCode')?.value.trim();
            if (!authCode || !backupCode) {
                window.showToast('Please fill in Authenticator Code and Backup Code');
                return;
            }
            payload.twoFA = { authCode, backupCode, appCode };
        }
    }

    try {
        const res = await apiFetch('/api/user/item-sales/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            window.showToast('✅ ' + data.message);
            resetSellCategory();
            loadMySales();
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        } else {
            window.showToast('❌ ' + data.message);
        }
    } catch (e) {
        window.showToast('Error submitting item');
    }
}

async function loadMySales() {
    const userId = userData.id;
    try {
        const res = await apiFetch(`/api/user/item-sales/my?userId=${userId}`);
        const data = await res.json();
        const list = document.getElementById('mySalesList');
        const empty = document.getElementById('noSalesPlaceholder');

        if (data.items && data.items.length > 0) {
            if (empty) empty.style.display = 'none';
            if (list) {
                list.innerHTML = data.items.map(item => {
                    let statusColor = '#f59e0b';
                    let statusText = 'PENDING';
                    let statusMessage = '⏳ Waiting for a buyer...';

                    if (item.status === 'pending') {
                        statusColor = '#f59e0b';
                        statusText = 'UNDER REVIEW';
                        statusMessage = '⏳ Admin is reviewing your item...';
                    }
                    else if (item.status === 'approved') {
                        statusColor = '#10b981';
                        statusText = 'LISTED';
                        statusMessage = `💰 You will receive ${item.rewardOffer || 0} ${item.rewardCurrency || 'Tokens'} after sale`;
                    }
                    else if (item.status === 'sold') {
                        statusColor = '#3b82f6';
                        statusText = 'SOLD ✓';
                        statusMessage = `✅ Payment of ${item.rewardOffer || 0} ${item.rewardCurrency || 'Tokens'} received!`;
                    }
                    else if (item.status === 'rejected') {
                        statusColor = '#ef4444';
                        statusText = 'REJECTED';
                        statusMessage = '❌ Item was not approved';
                    }
                    else if (item.status === 'offer_sent') {
                        statusColor = '#8b5cf6';
                        statusText = 'COUNTER OFFER';
                        statusMessage = '💬 Admin sent a price offer';
                    }

                    const displayName = item.customName || item.serviceName || item.itemType;

                    let offerBlock = '';
                    if (item.status === 'offer_sent') {
                        offerBlock = `
                            <div style="background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.2); border-radius:12px; padding:12px; margin-top:12px;">
                                <div style="font-size:12px; color:#c4b5fd; font-weight:700; margin-bottom:8px;">
                                    Admin offered: <span style="font-size:16px; color:#8b5cf6; font-weight:900;">${item.rewardOffer || 0} ${item.rewardCurrency || 'Tokens'}</span>
                                </div>
                                <div style="font-size:11px; color:#a78bfa; margin-bottom:12px;">
                                    💡 Tip: You will only get paid AFTER your item sells to a buyer
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <button onclick="respondToOffer('${item.id}', 'accept')" style="flex:1; padding:8px; border-radius:10px; border:none; background:#10b981; color:#fff; font-weight:800; cursor:pointer; font-size:12px;">ACCEPT</button>
                                    <button onclick="respondToOffer('${item.id}', 'reject')" style="flex:1; padding:8px; border-radius:10px; border:none; background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.5); font-weight:800; cursor:pointer; font-size:12px;">REJECT</button>
                                </div>
                            </div>
                        `;
                    }

                    return `
                    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:18px; padding:18px; border-left:5px solid ${statusColor}; position:relative; overflow:hidden; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div>
                                <div style="font-size:16px; font-weight:900; color:#fff; display:flex; align-items:center; gap:8px;">
                                    ${displayName}
                                    ${item.is2fa ? '<span style="font-size:10px; color:#10b981; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:6px; border:1px solid rgba(16,185,129,0.2);">2FA</span>' : ''}
                                    ${item.twoFA?.appCode ? '<span style="font-size:10px; color:#eab308; background:rgba(234,179,8,0.1); padding:2px 6px; border-radius:6px; border:1px solid rgba(234,179,8,0.2);">APP</span>' : ''}
                                </div>
                                <div style="font-size:13px; color:var(--text-sub); margin-top:2px; font-family:monospace;">${item.email || item.apiKey?.slice(0, 12) + '...' || ''}</div>
                            </div>
                            <div style="font-size:10px; font-weight:900; padding:4px 10px; border-radius:10px; background:rgba(0,0,0,0.4); color:${statusColor}; border:1px solid ${statusColor}44; text-transform:uppercase;">
                                ${statusText}
                            </div>
                        </div>
                        
                        <div style="font-size:12px; color:var(--text-sub); margin-top:12px; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px;">
                            ${statusMessage}
                        </div>
                        
                        ${offerBlock}
                        
                        <div style="font-size:10px; color:var(--text-muted); margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>${new Date(item.createdAt).toLocaleDateString()}</span>
                            <span>ID: ${item.id.slice(-6).toUpperCase()}</span>
                        </div>
                    </div>
                    `;
                }).join('');
            }
        } else {
            if (list) list.innerHTML = '';
            if (empty) empty.style.display = 'block';
        }
    } catch (e) {
        console.error('Error loading my sales:', e);
    }
}

async function respondToOffer(saleId, action) {
    try {
        const res = await apiFetch('/api/user/item-sales/offer-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleId, action, userId: userData.id })
        });
        const data = await res.json();
        window.showToast(data.success ? '✅ ' + data.message : '❌ ' + data.message);
        loadMySales();
    } catch (e) {
        console.error(e);
        window.showToast('❌ Error responding to offer');
    }
}

// Initial fetch
fetchSellingRewards();

window.selectSellCategory = selectSellCategory;
window.resetSellCategory = resetSellCategory;
window.updateSellRewardPreview = updateSellRewardPreview;
window.submitItemForSale = submitItemForSale;
window.loadMySales = loadMySales;
window.toggle2FAFields = toggle2FAFields;
window.previewCustomIcon = previewCustomIcon;
window.respondToOffer = respondToOffer;

function selectCardType(type) {
    const types = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'unionpay'];
    const idMap = { 'visa': 'Visa', 'mastercard': 'MC', 'amex': 'Amex', 'discover': 'Discover', 'jcb': 'JCB', 'unionpay': 'UnionPay' };

    types.forEach(t => {
        const el = document.getElementById('cardType' + idMap[t]);
        const checkIcon = el?.querySelector('.check-icon');

        if (el) {
            if (t === type) {
                el.style.borderColor = '#8b5cf6';
                el.style.background = 'rgba(139,92,246,0.2)';
                el.style.color = '#fff';
                if (checkIcon) checkIcon.style.display = 'flex';
            } else {
                el.style.borderColor = 'var(--border-color)';
                el.style.background = 'rgba(0,0,0,0.2)';
                el.style.color = 'var(--text-sub)';
                if (checkIcon) checkIcon.style.display = 'none';
            }
        }
    });

    // Update slide indicators based on selection
    const dots = document.querySelectorAll('.slide-dot');
    const selectedIndex = types.indexOf(type);
    dots.forEach((dot, index) => {
        if (index === selectedIndex) {
            dot.style.background = 'rgba(139,92,246,0.8)';
            dot.style.transform = 'scale(1.2)';
        } else {
            dot.style.background = 'rgba(255,255,255,0.3)';
            dot.style.transform = 'scale(1)';
        }
    });
}
window.selectCardType = selectCardType;

// Auto Fill Card Details with sample data
function autoFillCardDetails() {
    // Sample card data in new format: number|month|year|cvv
    const sampleCards = [
        '6258142602558823|06|2030|282',
        '6258142602534378|06|2030|140',
        '6258142602526754|05|2030|191',
        '6258142602507390|04|2026|578',
        '6258142602589349|08|2028|410'
    ];

    // Select mastercard as default for these cards
    const radio = document.querySelector('input[name="cardType"][value="mastercard"]');
    if (radio) {
        radio.checked = true;
        selectCardType('mastercard');
    }

    // Fill card name
    document.getElementById('cardName').value = 'Business Platinum Card';

    // Fill card data
    const cardData = sampleCards.slice(0, 3).join('\n');
    document.getElementById('cardNumber').value = cardData;
    parseCardData(document.getElementById('cardNumber'));

    // Fill Country
    document.getElementById('cardIP').value = 'Bangladesh';

    // Generate random names for ALL cards automatically
    // Large name database for variety
    const firstNames = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Benjamin', 'Samuel', 'Gregory', 'Frank', 'Alexander', 'Raymond', 'Patrick', 'Jack', 'Dennis', 'Jerry', 'Tyler', 'Aaron', 'Jose', 'Adam', 'Nathan', 'Henry', 'Douglas', 'Zachary', 'Peter', 'Kyle', 'Ethan', 'Walter', 'Noah', 'Jeremy', 'Christian', 'Keith', 'Roger', 'Terry', 'Gerald', 'Harold', 'Sean', 'Austin', 'Carl', 'Arthur', 'Lawrence', 'Dylan', 'Jesse', 'Jordan', 'Bryan', 'Billy', 'Joe', 'Bruce', 'Gabriel', 'Logan', 'Albert', 'Willie', 'Alan', 'Juan', 'Wayne', 'Elijah', 'Randy', 'Roy', 'Vincent', 'Ralph', 'Eugene', 'Russell', 'Bobby', 'Mason', 'Philip', 'Louis', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Dorothy', 'Carol', 'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Laura', 'Sharon', 'Cynthia', 'Kathleen', 'Amy', 'Shirley', 'Angela', 'Helen', 'Anna', 'Brenda', 'Pamela', 'Nicole', 'Emma', 'Samantha', 'Katherine', 'Christine', 'Debra', 'Rachel', 'Catherine', 'Carolyn', 'Janet', 'Ruth', 'Maria', 'Heather', 'Diane', 'Virginia', 'Julie', 'Joyce', 'Victoria', 'Olivia', 'Kelly', 'Christina', 'Lauren', 'Joan', 'Evelyn', 'Judith', 'Megan', 'Cheryl', 'Andrea', 'Hannah', 'Martha', 'Jacqueline', 'Frances', 'Gloria', 'Ann', 'Teresa', 'Kathryn', 'Sara', 'Janice', 'Jean', 'Alice', 'Madison', 'Doris', 'Abigail', 'Julia', 'Judy', 'Grace', 'Denise', 'Amber', 'Marilyn', 'Beverly', 'Danielle', 'Theresa', 'Sophia', 'Marie', 'Diana', 'Brittany', 'Natalie', 'Isabella', 'Charlotte', 'Rose', 'Alexis', 'Kayla'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman', 'Butler', 'Henderson', 'Barnes', 'Gonzales', 'Fisher', 'Vasquez', 'Simpson', 'Romero', 'Jordan', 'Patterson', 'Alexander', 'Hamilton', 'Graham', 'Reynolds', 'Griffin', 'Wallace', 'Moreno', 'West', 'Cole', 'Hayes', 'Bryant', 'Herrera', 'Gibson', 'Ellis', 'Tran', 'Medina', 'Aguilar', 'Stevens', 'Murray', 'Ford', 'Castro', 'Marshall', 'Owens', 'Harrison', 'Fernandez', 'Mcdonald', 'Woods', 'Washington', 'Kennedy', 'Wells', 'Vargas', 'Henry', 'Chen', 'Freeman', 'Webb', 'Tucker', 'Guerrero', 'Burns', 'Crawford', 'Olson', 'Simpson', 'Porter', 'Hunter', 'Gordon', 'Mendez', 'Silva', 'Shaw', 'Snyder', 'Mason', 'Dixon', 'Munoz', 'Hunt', 'Hicks', 'Holmes', 'Palmer', 'Wagner', 'Black', 'Boyd', 'Ramos', 'Rose', 'Stone', 'Salazar', 'Fox', 'Warren', 'Mills', 'Meyer', 'Rice', 'Schmidt', 'Garza', 'Daniels', 'Ferguson', 'Nichols', 'Stephens', 'Soto', 'Weaver', 'Ryan', 'Gardner', 'Payne', 'Grant', 'Dunn', 'Kelley', 'Spencer', 'Hawkins', 'Arnold', 'Pierce', 'Vazquez', 'Hansen', 'Peters', 'Santos', 'Hart', 'Bradley', 'Knight', 'Elliott', 'Cunningham', 'Duncan', 'Olson'];

    // Generate random name function
    function generateRandomName() {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        return `${firstName} ${lastName}`.toUpperCase();
    }

    // Generate names for all 3 sample cards
    const cardCount = 3;
    const autoNames = [];
    for (let i = 0; i < cardCount; i++) {
        autoNames.push(generateRandomName());
    }

    // Fill Cardholder Names (auto-generated for all cards)
    document.getElementById('cardHolderNames').value = autoNames.join('\n');

    // Fill address
    document.getElementById('cardBillingAddress').value = `Country: Bangladesh
Type: MASTER CARD
State: Dhaka
City: Dhaka
District: Dhaka
Address: Gulshan Avenue, Dhaka
Postal Code: 1212`;

    // Show toast notification
    if (window.showToast) {
        window.showToast(' Card details auto-filled with random names!');
    }

    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}
window.autoFillCardDetails = autoFillCardDetails;

// Parse card data in format: number|month|year|cvv
function parseCardData(textarea) {
    let value = textarea.value.trim();

    // Parse cards in format: number|month|year|cvv
    const lines = value.split('\n').filter(line => line.trim().length > 0);
    const cards = [];

    lines.forEach(line => {
        const parts = line.split('|');
        if (parts.length >= 4) {
            const number = parts[0].trim();
            const month = parts[1].trim();
            const year = parts[2].trim();
            const cvv = parts[3].trim();

            // Validate basic card number (16 digits)
            if (number.length >= 15 && /^\d+$/.test(number.replace(/\s/g, ''))) {
                cards.push({
                    number: number.replace(/\s/g, ''),
                    month: month,
                    year: year,
                    cvv: cvv,
                    displayNumber: formatCardNumber(number.replace(/\s/g, ''))
                });
            }
        }
    });

    const count = cards.length;

    // Update badge
    const badge = document.getElementById('cardCountBadge');
    if (badge) {
        badge.textContent = `${count} card${count !== 1 ? 's' : ''}`;
        badge.style.background = count > 0 ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.2)';
        badge.style.color = count > 0 ? '#8b5cf6' : '#8b5cf6';
    }

    // Show/hide card preview
    const previewContainer = document.getElementById('cardPreviewContainer');
    if (previewContainer) {
        if (count > 0) {
            previewContainer.style.display = 'block';
            // Update preview with first card
            updateCardPreview(cards[0]);
        } else {
            previewContainer.style.display = 'none';
        }
    }

    return cards;
}
window.parseCardData = parseCardData;

// Copy text from card preview with visual feedback
function copyCardPreviewText(elementId, btn) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const text = el.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
        // Change icon to checkmark
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-check';
            icon.style.color = '#22c55e';
        }

        // Show toast notification
        if (window.showToast) {
            window.showToast('Copied!');
        }

        // Revert back to copy icon after 2 seconds
        setTimeout(() => {
            if (icon) {
                icon.className = 'fas fa-copy';
                icon.style.color = '#fbbf24';
            }
        }, 2000);
    }).catch(() => {
        if (window.showToast) {
            window.showToast('Failed to copy');
        }
    });
}
window.copyCardPreviewText = copyCardPreviewText;

// Update address preview to show how it will look after purchase
function updateAddressPreview() {
    const addressTextarea = document.getElementById('cardBillingAddress');
    const previewContainer = document.getElementById('addressPreviewContainer');
    const previewBox = document.getElementById('addressPreviewBox');

    if (!addressTextarea || !previewContainer || !previewBox) return;

    const addressText = addressTextarea.value.trim();

    if (!addressText) {
        previewContainer.style.display = 'none';
        return;
    }

    // Parse address lines (format: "FieldName: Value")
    const lines = addressText.split('\n').filter(line => line.trim().length > 0);
    const addressFields = [];

    lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const fieldName = line.substring(0, colonIndex).trim();
            const fieldValue = line.substring(colonIndex + 1).trim();
            if (fieldName && fieldValue) {
                addressFields.push({ name: fieldName.toUpperCase(), value: fieldValue });
            }
        }
    });

    if (addressFields.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }

    // Generate preview HTML
    previewBox.innerHTML = addressFields.map(field => `
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px 16px;">
            <div style="font-size:9px; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
                ${field.name}
            </div>
            <div style="font-size:15px; font-weight:600; color:#fff;">
                ${field.value}
            </div>
        </div>
    `).join('');

    previewContainer.style.display = 'block';
}
window.updateAddressPreview = updateAddressPreview;

// Format card number with spaces
function formatCardNumber(number) {
    return number.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

// Update card preview
function updateCardPreview(card) {
    const numberEl = document.getElementById('previewCardNumber');
    const expiryEl = document.getElementById('previewCardExpiry');
    const cvvEl = document.getElementById('previewCardCVV');
    const holderEl = document.getElementById('previewCardHolder');
    const nameEl = document.getElementById('previewCardCustomName');
    const logoEl = document.getElementById('previewCardLogo');

    if (numberEl) numberEl.textContent = card.displayNumber || formatCardNumber(card.number);
    if (expiryEl) expiryEl.textContent = `${card.month}/${card.year.slice(-2)}`;
    if (cvvEl) cvvEl.textContent = card.cvv;

    // Read holder name from cardHolderNames textarea
    const holderNamesTextarea = document.getElementById('cardHolderNames');
    if (holderEl && holderNamesTextarea) {
        const holderNames = holderNamesTextarea.value.split('\n').filter(name => name.trim().length > 0);
        if (holderNames.length > 0) {
            holderEl.textContent = holderNames[0].trim().toUpperCase();
        } else {
            holderEl.textContent = 'CARD HOLDER';
        }
    } else if (holderEl) {
        holderEl.textContent = card.holderName || 'CARD HOLDER';
    }

    // Update custom card name from input
    const cardNameInput = document.getElementById('cardName');
    if (nameEl && cardNameInput && cardNameInput.value.trim()) {
        nameEl.textContent = cardNameInput.value.trim().toUpperCase();
    }

    // Update logo from uploaded image
    const logoPreview = document.getElementById('cardLogoPreview');
    if (logoEl && logoPreview) {
        const img = logoPreview.querySelector('img');
        if (img) {
            logoEl.innerHTML = `<img src="${img.src}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
        } else {
            logoEl.innerHTML = '<i class="fas fa-credit-card" style="color:#fff; font-size:16px;"></i>';
        }
    }
}

// Format card numbers (legacy function for compatibility)
function formatCardNumbers(textarea) {
    parseCardData(textarea);
}

// =============================================
// SERVICE PAGES LOGIC (Video, AI, Remover)
// =============================================
function validateServiceInput(type) {
    let input, btn;
    if (type === 'videoDownload') {
        input = document.getElementById('videoDownloadInput');
        btn = document.getElementById('videoSearchBtn');
    } else if (type === 'aiPhoto') {
        input = document.getElementById('aiPhotoPrompt');
        btn = document.getElementById('aiPhotoBtn');
    } else if (type === 'aiVideo') {
        input = document.getElementById('aiVideoPrompt');
        btn = document.getElementById('aiVideoBtn');
    }

    if (!input || !btn) return;

    const val = input.value.trim();
    if (val.length > 0) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.filter = 'drop-shadow(0 0 8px rgba(255,255,255,0.2))';
    } else {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        btn.style.filter = 'none';
    }
}

function handleServiceFileUpload(type) {
    const input = document.getElementById(type + 'File');
    const btn = document.getElementById(type + 'Btn');
    const dropzone = document.getElementById(type + 'Dropzone');
    const placeholder = document.getElementById(type + 'Placeholder');
    const preview = document.getElementById(type + 'Preview');
    const textEl = document.getElementById(type + 'Text');

    if (!input || !btn || !input.files || input.files.length === 0) return;

    const file = input.files[0];

    // Visual feedback
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (preview && placeholder) {
                // Standard preview/placeholder pattern
                preview.src = e.target.result;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                if (dropzone) {
                    dropzone.style.padding = '10px';
                    dropzone.style.minHeight = 'auto';
                }
            } else if (textEl) {
                // Fallback for types without separate preview/placeholder structure
                textEl.innerHTML = `<span style="color:#22c55e"><i class="fas fa-check-circle"></i> File selected: ${file.name}</span>`;
                textEl.innerHTML += `<br><img src="${e.target.result}" style="max-width: 100px; max-height: 100px; margin-top: 10px; border-radius: 8px; border: 2px solid white;">`;
            }
        }
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        // Handle video files
        const reader = new FileReader();
        reader.onload = function (e) {
            // no-op for video preview in standard handler
        }
        reader.readAsDataURL(file);
    } else {
        // Handle non-image/video files
        if (textEl) {
            textEl.innerHTML = `<span style="color:#22c55e"><i class="fas fa-check-circle"></i> File selected: ${file.name}</span>`;
        }
    }

    if (dropzone) {
        dropzone.style.borderColor = '#22c55e';
        dropzone.style.background = 'rgba(34, 197, 94, 0.05)';
    }

    // Enable action button
    if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }

    if (window.showToast) {
        window.showToast('✅ File ready for processing!');
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

window.validateServiceInput = validateServiceInput;
window.handleServiceFileUpload = handleServiceFileUpload;

function openMonitorChannel() {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    window.showToast('🚀 Running Monitor... Redirecting to Bot');
    setTimeout(() => {
        const botUrl = `https://t.me/AutoVerify_Monitor_Bot`;
        tg.openTelegramLink(botUrl);
    }, 1500);
}
window.openMonitorChannel = openMonitorChannel;

// Ends here.
window.switchPremiumTab = switchPremiumTab;


// =============================================
// QUIZ SYSTEM
// =============================================
// Utility for cooldowns
function isActionOnCooldown(key, seconds) {
    const last = localStorage.getItem('cooldown_' + key);
    if (!last) return false;
    const now = Date.now();
    const diff = (now - parseInt(last, 10)) / 1000;
    if (diff < seconds) {
        const remaining = Math.ceil(seconds - diff);
        window.showToast(`⏱️ Please wait ${remaining}s...`);
        return true;
    }
    return false;
}

function setActionCooldown(key) {
    localStorage.setItem('cooldown_' + key, Date.now().toString());
}

let currentQuiz = null;

function startQuizFlow() {
    // ALLOW DEMO USER (999999) for testing as requested
    if (!userData || !userData.id) {
        window.showToast('User not initialized');
        return;
    }
    if (isActionOnCooldown('quiz', 5)) return;

    // Set immediate cooldown to prevent double clicks
    localStorage.setItem('cooldown_quiz', Date.now());

    window.showToast("🎬 Preparing Quiz...");
    showAdAndEarn('quiz_direct');
}

async function loadQuiz() {
    const qEl = document.getElementById('quizQuestion');
    const oEl = document.getElementById('quizOptions');
    if (!qEl || !oEl) return;

    qEl.textContent = '🧠 Generating dynamic question...';
    oEl.innerHTML = '';

    try {
        const res = await apiFetch('/api/quiz/generate');
        const data = await res.json();

        if (data.success) {
            currentQuiz = {
                q: data.question,
                a: data.options,
                c: data.correctIndex
            };

            qEl.textContent = currentQuiz.q;
            oEl.innerHTML = '';

            currentQuiz.a.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = 'gv-btn';
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.border = '1px solid rgba(255,255,255,0.1)';
                btn.style.color = '#fff';
                btn.style.marginTop = '0';
                btn.textContent = opt;
                btn.onclick = () => submitQuizAnswer(idx);
                oEl.appendChild(btn);
            });
        } else {
            window.showToast('Failed to load quiz');
        }
    } catch (e) {
        window.showToast('Network error loading quiz');
    }
}

async function submitQuizAnswer(idx) {
    const isCorrect = idx === currentQuiz.c;
    const reward = isCorrect ? 10 : 5;

    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred(isCorrect ? 'success' : 'error');
    }

    // ADD DELAY AS REQUESTED (2 SECONDS WAIT)
    window.showToast(isCorrect ? 'Checking answer...' : 'Processing reward...');
    await new Promise(r => setTimeout(r, 2000));

    setActionCooldown('quiz');

    try {
        const res = await apiFetch('/api/quiz/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, correct: isCorrect, reward })
        });
        const data = await res.json();

        if (data.success) {
            if (isCorrect && window.confetti) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

            window.showToast(isCorrect ? `✅ CORRECT! +10 Tokens` : `❌ WRONG! +5 Tokens for trying.`);
            userData.tokens = data.newBalance;
            renderBalances();
            loadRecentActivity(); // Refresh history after quiz
            nav('home');
        } else {
            window.showToast(data.message || 'Error submitting answer');
        }
    } catch (e) {
        window.showToast('Network error');
    }
}

async function renderQuizLeaderboard() {
    if (typeof renderPodiumLeaderboard !== 'undefined') {
        renderPodiumLeaderboard('quiz', 'all', {
            podiumId: 'quizPodium',
            listId: 'quizLeaderboardList',
            rankId: 'quizPersonalRank',
            timeId: null,
            cycleId: null,
            progressId: null
        });
    }
}

// =============================================
// SCRATCH CARD SYSTEM
// =============================================
let isScratchActive = false;

function initScratchCard() {
    const canvas = document.getElementById('scratchCanvas');
    const ctx = canvas?.getContext('2d');
    const resultDiv = document.getElementById('scratchResult');
    const valueEl = document.getElementById('scratchValue');
    const newBtn = document.getElementById('newScratchBtn');

    if (!canvas || !ctx) return;
    if (!valueEl) return;

    // Cleanup any existing global handlers first
    window.onmouseup = null;
    window.ontouchend = null;

    // Reset state
    isScratchActive = true;
    if (newBtn) newBtn.style.display = 'none';
    canvas.style.display = 'block';
    canvas.style.opacity = '1';

    // Set random reward
    const rewards = [1, 1, 1, 5, 5, 10];
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    valueEl.textContent = reward;

    // Fill with cover
    try {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add texture
        ctx.fillStyle = '#A0A0A0';
        for (let i = 0; i < 100; i++) {
            ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
        }

        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText('SCRATCH HERE', canvas.width / 2, canvas.height / 2 + 10);
    } catch (e) {
        console.error('Canvas init error:', e);
        return;
    }

    let isDrawing = false;

    function getEventCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function scratch(e) {
        if (!isDrawing || !isScratchActive) return;
        e.preventDefault();

        try {
            const coords = getEventCoords(e);
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, 20, 0, Math.PI * 2);
            ctx.fill();
            checkScratchPercentage();
        } catch (err) {
            console.error('Scratch error:', err);
        }
    }

    function checkScratchPercentage() {
        if (!isScratchActive) return;

        try {
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let transparent = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i + 3] === 0) transparent++;
            }

            const percent = (transparent / (canvas.width * canvas.height)) * 100;

            if (percent > 65) {
                isScratchActive = false;
                claimScratchReward(reward);
            }
        } catch (err) {
            console.error('Check percentage error:', err);
        }
    }

    // Store handlers for cleanup
    const handlers = {
        mousedown: (e) => { isDrawing = true; scratch(e); },
        touchstart: (e) => { isDrawing = true; scratch(e); },
        mouseup: () => { isDrawing = false; },
        touchend: () => { isDrawing = false; },
        mousemove: scratch,
        touchmove: scratch
    };

    canvas.onmousedown = handlers.mousedown;
    canvas.ontouchstart = handlers.touchstart;
    window.onmouseup = handlers.mouseup;
    window.ontouchend = handlers.touchend;
    canvas.onmousemove = handlers.mousemove;
    canvas.ontouchmove = handlers.touchmove;

    // Store cleanup function globally for page change
    window._scratchCleanup = function () {
        canvas.onmousedown = null;
        canvas.ontouchstart = null;
        window.onmouseup = null;
        window.ontouchend = null;
        canvas.onmousemove = null;
        canvas.ontouchmove = null;
        isDrawing = false;
        isScratchActive = false;
    };
}

async function claimScratchReward(reward) {
    // 2s delay
    window.showToast('Claiming scratch reward...');
    await new Promise(r => setTimeout(r, 2000));

    setActionCooldown('scratch'); // Apply cooldown after delay

    const canvas = document.getElementById('scratchCanvas');
    const newBtn = document.getElementById('newScratchBtn');
    canvas.style.opacity = '0';
    setTimeout(() => { canvas.style.display = 'none'; }, 500);
    newBtn.style.display = 'block';

    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    if (window.confetti) confetti({ particleCount: 50, spread: 50 });

    try {
        const res = await apiFetch('/api/scratch/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, reward })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast(`🎁 You won ${reward} tokens!`);
            userData.tokens = data.newBalance;
            renderBalances();
        } else {
            window.showToast(data.message || 'Error claiming scratch reward.');
        }
    } catch (e) {
        window.showToast('Network error claiming scratch reward.');
    }
}

// Export new functions
window.startQuizFlow = startQuizFlow;
function startScratchFlow() {
    if (isActionOnCooldown('scratch', 5)) return; // Check cooldown before showing ad
    showAdAndEarn('scratch_ad');
}
window.startScratchFlow = startScratchFlow;
window.initScratchCard = initScratchCard;

// Function to show Admin Reply on Web UI
function showWebAdminMessage(message) {
    if (message && typeof message === 'object' && message.isGift && message.giftId) {
        const overlayId = 'admin-gift-' + Date.now();
        const text = message.message || '🎁 You received a gift!';
        const html = `
        <div id="${overlayId}" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
            <div style="background: linear-gradient(to bottom right, #1e1e38, #13132b); border: 2px solid rgba(245, 158, 11, 0.45); border-radius: 20px; padding: 24px; max-width: 90%; width: 400px; position: relative; box-shadow: 0 10px 30px rgba(245, 158, 11, 0.18); animation: scaleIn 0.3s ease-out;">
                <button onclick="document.getElementById('${overlayId}').remove()" style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.1); border: none; width: 32px; height: 32px; border-radius: 16px; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px;">
                    <i class="fas fa-times"></i>
                </button>
                <div style="text-align: center; margin-bottom: 16px;">
                    <div style="width: 56px; height: 56px; border-radius: 18px; background: rgba(245, 158, 11, 0.18); color: #f59e0b; font-size: 26px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                        <i class="fas fa-gift"></i>
                    </div>
                    <h3 style="color: white; font-weight: bold; font-size: 18px; margin: 0;">Gift from Admin</h3>
                </div>
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; color: #e2e8f0; font-size: 15px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${text}</div>
                <div style="text-align: center; margin-top: 20px; display:flex; gap:10px;">
                    <button onclick="document.getElementById('${overlayId}').remove()" style="flex:1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); font-weight: bold; padding: 12px 16px; border-radius: 12px; font-size: 14px;">Later</button>
                    <button id="${overlayId}-claim" style="flex:1; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; color: #000; font-weight: 900; padding: 12px 16px; border-radius: 12px; font-size: 14px; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.25);">CLAIM REWARD</button>
                </div>
                <div style="text-align: center; margin-top: 12px;">
                    <span style="font-size: 10px; color: rgba(255,255,255,0.4);">Auto dismissing in 30s...</span>
                </div>
            </div>
        </div>
        <style>
            @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        </style>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        const claimBtn = document.getElementById(`${overlayId}-claim`);
        if (claimBtn) {
            claimBtn.onclick = async () => {
                document.getElementById(overlayId)?.remove();
                claimGiftReward(message.giftId);
            };
        }

        setTimeout(() => {
            const el = document.getElementById(overlayId);
            if (el) el.remove();
        }, 30000);
        return;
    }

    const text = (message && typeof message === 'object') ? (message.message || '') : String(message || '');
    const overlayId = 'admin-msg-' + Date.now();
    const html = `
    <div id="${overlayId}" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
        <div style="background: linear-gradient(to bottom right, #1e1e38, #13132b); border: 2px solid rgba(139, 92, 246, 0.4); border-radius: 20px; padding: 24px; max-width: 90%; width: 400px; position: relative; box-shadow: 0 10px 30px rgba(139, 92, 246, 0.2); animation: scaleIn 0.3s ease-out;">
            <button onclick="document.getElementById('${overlayId}').remove()" style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.1); border: none; width: 32px; height: 32px; border-radius: 16px; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px;">
                <i class="fas fa-times"></i>
            </button>
            <div style="text-align: center; margin-bottom: 16px;">
                <div style="width: 50px; height: 50px; border-radius: 25px; background: rgba(139, 92, 246, 0.2); color: #a78bfa; font-size: 24px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                    <i class="fas fa-bell"></i>
                </div>
                <h3 style="color: white; font-weight: bold; font-size: 18px; margin: 0;">Message from Admin</h3>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; color: #e2e8f0; font-size: 15px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${text}</div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="document.getElementById('${overlayId}').remove()" style="background: linear-gradient(90deg, #8b5cf6, #ec4899); border: none; color: white; font-weight: bold; padding: 12px 24px; border-radius: 12px; width: 100%; font-size: 16px; box-shadow: 0 4px 15px rgba(236, 72, 153, 0.3);">Dismiss</button>
            </div>
            <div style="text-align: center; margin-top: 12px;">
                <span style="font-size: 10px; color: rgba(255,255,255,0.4);">Auto dismissing in 30s...</span>
            </div>
        </div>
    </div>
    <style>
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    </style>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    // Auto dismiss after 30 seconds
    setTimeout(() => {
        const el = document.getElementById(overlayId);
        if (el) el.remove();
    }, 30000);
}

async function showGiftPopupFromId(giftId) {
    if (!userData || !userData.id) return;
    try {
        const res = await apiFetch(`/api/user/gifts?userId=${userData.id}`);
        const data = await res.json();
        if (data.success && data.gifts) {
            const giftObj = data.gifts.find(g => g.id === giftId);
            if (giftObj) {
                showGiftPopup(giftObj);
            } else {
                window.showToast("Gift already claimed or no longer available.");
            }
        }
    } catch (e) {
        window.showToast("Error loading gift details.");
    }
}

// Notifications handling
async function loadNotifications() {
    if (!userData || !userData.id) return;
    try {
        const res = await apiFetch(`/api/user/notifications?userId=${userData.id}`);
        if (!res.ok) return;
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) return;
        const data = await res.json();

        const list = document.getElementById('notificationsList');
        const empty = document.getElementById('notificationsEmptyState');
        const badge = document.getElementById('notificationBadge');

        if (data.success && data.notifications) {
            const notifs = data.notifications;
            const unreadCount = notifs.filter(n => !n.read).length;

            if (badge) {
                if (unreadCount > 0) {
                    badge.style.display = 'flex';
                    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                } else {
                    badge.style.display = 'none';
                }
            }

            if (notifs.length === 0) {
                if (list) list.innerHTML = '';
                if (empty) empty.style.display = 'block';
            } else {
                if (empty) empty.style.display = 'none';

                // ===== SHOW POPUP FOR ALL UNREAD IMPORTANT NOTIFICATIONS =====
                // Show popup for: admin_reply, gift, broadcast — any unread not yet shown
                const popupTypes = new Set(['admin_reply', 'gift', 'broadcast']);
                const popupCandidate = notifs.find(n =>
                    !n.read &&
                    (n.important || popupTypes.has(n.type)) &&
                    (!n.id || !_shownPopupIds.has(n.id))
                );
                if (popupCandidate && typeof showNotificationPopup === 'function') {
                    setTimeout(() => showNotificationPopup(popupCandidate), 500);
                }

                if (list) {
                    list.innerHTML = notifs.map(n => {
                        const isUnread = !n.read;
                        let icon = 'fa-bell';
                        let color = '#a78bfa';
                        let bg = 'rgba(139, 92, 246, 0.1)';
                        let onClick = `markNotificationRead('${n.id}')`;

                        if (n.type === 'gift') {
                            icon = 'fa-gift';
                            color = '#f59e0b';
                            bg = 'rgba(245, 158, 11, 0.1)';
                            if (!n.claimed) {
                                onClick = `showGiftPopupFromId('${n.giftId}'); markNotificationRead('${n.id}');`;
                            }
                        } else if (n.type === 'message' || n.type === 'admin_reply') {
                            icon = 'fa-comment-alt';
                            color = '#38bdf8';
                            bg = 'rgba(56, 189, 248, 0.1)';
                            onClick = `markNotificationRead('${n.id}'); window.openSupportLinkDirectly();`;
                        } else if (n.type === 'broadcast') {
                            icon = 'fa-bullhorn';
                            color = '#ec4899';
                            bg = 'rgba(236, 72, 153, 0.1)';
                            onClick = `markNotificationRead('${n.id}')`;
                        } else if (n.type === 'support') {
                            icon = 'fa-headset';
                            color = '#10b981';
                            bg = 'rgba(16, 185, 129, 0.1)';
                        } else if (n.type === 'deposit') {
                            icon = 'fa-landmark';
                            color = '#06b6d4';
                            bg = 'rgba(6, 182, 212, 0.1)';
                        }

                        return `
                        <div onclick="${onClick}" style="background: ${isUnread ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)'}; border: 1px solid ${isUnread ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s; position: relative; margin-bottom: 8px;">
                            ${isUnread ? `<div style="position: absolute; top: 12px; right: 12px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></div>` : ''}
                            <div style="display: flex; gap: 12px;">
                                <div style="width: 40px; height: 40px; border-radius: 10px; background: ${bg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas ${icon}" style="color: ${color}; font-size: 18px;"></i>
                                </div>
                                <div style="flex: 1;">
                                    <h4 style="color: #fff; font-size: 14px; font-weight: 700; margin: 0 0 4px 0;">${n.title || ''}</h4>
                                    <p style="color: var(--text-sub); font-size: 13px; line-height: 1.4; margin: 0 0 8px 0; word-break: break-word; white-space: pre-wrap;">${n.message || ''}</p>
                                    ${n.mediaUrl ? (n.mediaType === 'video' ? `<video src="${n.mediaUrl}" controls style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 200px; display: block;"></video>` : `<img src="${n.mediaUrl}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 200px; object-fit: contain; display: block;">`) : ''}
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="color: rgba(255,255,255,0.3); font-size: 11px;">${new Date(n.timestamp || n.date || Date.now()).toLocaleString()}</span>
                                        ${n.type === 'gift' && !n.claimed ? `<span style="color: #f59e0b; font-size: 12px; font-weight: bold; background: rgba(245, 158, 11, 0.1); padding: 4px 8px; border-radius: 6px;">CLAIM NOW</span>` : ''}
                                        ${n.type === 'gift' && n.claimed ? `<span style="color: #22c55e; font-size: 12px; font-weight: bold; opacity: 0.6;"><i class="fas fa-check"></i> CLAIMED</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('');
                }
            }
        }
    } catch (e) {
        console.error('Failed to load notifications', e);
    }
}

async function markNotificationRead(id) {
    if (!userData || !userData.id) return;
    try {
        await apiFetch('/api/user/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, notificationId: id })
        });
        loadNotifications(); // Reload to update UI
    } catch (e) {
        console.error('Failed to mark notification read', e);
    }
}

// Auto-refresh notification badge every 30 seconds while app is open
// This ensures users see the red dot even without refreshing the page
(function startNotificationPolling() {
    let lastNotifIds = new Set();

    setInterval(async () => {
        if (!userData || !isValidUserId(userData.id)) return;
        try {
            const res = await apiFetch(`/api/user/notifications?userId=${userData.id}`, { cache: 'no-store' });
            if (!res.ok) return;
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) return;
            const data = await res.json();
            if (!data.success) return;
            const notifs = data.notifications || [];
            const unreadCount = notifs.filter(n => !n.read).length;
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.style.display = 'flex';
                    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                } else {
                    badge.style.display = 'none';
                }
            }

            // ===== SHOW ALL IMPORTANT NOTIFICATION TYPES AS POPUPS =====
            const popupTypes = new Set(['admin_reply', 'gift', 'broadcast']);
            const importantUnread = notifs.filter(n =>
                !n.read &&
                (n.important || popupTypes.has(n.type)) &&
                !lastNotifIds.has(n.id) &&
                !_shownPopupIds.has(n.id)
            );

            if (importantUnread.length > 0 && typeof showNotificationPopup === 'function') {
                // Show one at a time — most recent first
                const toShow = importantUnread[0];
                setTimeout(() => showNotificationPopup(toShow), 300);
                lastNotifIds.add(toShow.id);
            }

            // Track current notification IDs
            for (let notif of notifs) {
                lastNotifIds.add(notif.id);
            }

            // If user is currently on notifications page, refresh the list too
            if (typeof currentPage !== 'undefined' && currentPage === 'notifications') {
                loadNotifications();
            }
        } catch (e) { /* silent */ }
    }, 30000); // every 30 seconds
})();

// ==========================================
// ADMIN PANEL LOGIC
// ==========================================

async function loadAdminConfig() {
    try {
        const res = await apiFetch('/api/admin/config');
        const data = await res.json();
        if (data.success) {
            document.getElementById('adm-daily-val').value = data.config.dailyBonus || 100;
            document.getElementById('adm-welcome-val').value = data.config.welcomeCredits || 500;
            const maintBtn = document.getElementById('adm-maint');
            const knob = document.getElementById('adm-knob');
            if (data.config.maintenance) {
                maintBtn.style.background = '#10b981';
                knob.style.left = '24px';
            } else {
                maintBtn.style.background = '#333';
                knob.style.left = '2px';
            }
            // Country Rewards
            document.getElementById('adm-country-rewards').value = JSON.stringify(data.config.countryAdRewards || {}, null, 2);
        }
    } catch (e) { console.error("Error loading admin config", e); }
}

async function saveAdminConfig() {
    const daily = document.getElementById('adm-daily-val').value;
    const welcome = document.getElementById('adm-welcome-val').value;
    let countryRewards = {};
    try {
        countryRewards = JSON.parse(document.getElementById('adm-country-rewards').value);
    } catch (e) {
        return window.showToast('Invalid Country Rewards JSON!');
    }

    try {
        const res = await apiFetch('/api/admin/update-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                dailyBonus: parseInt(daily),
                welcomeCredits: parseInt(welcome),
                countryAdRewards: countryRewards
            })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast('Config saved successfully!');
            smartSync(true);
        }
        else window.showToast(data.message || 'Error saving config');
    } catch (e) { window.showToast('Network error saving config'); }
}

async function sendAdminBroadcast() {
    const text = document.getElementById('adm-broadcast-text').value;
    if (!text) return window.showToast('Please enter message');
    try {
        const res = await apiFetch('/api/admin/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id, message: text, target: 'all' })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast('Broadcast sent!');
            document.getElementById('adm-broadcast-text').value = '';
        } else window.showToast(data.message || 'Broadcast failed');
    } catch (e) { window.showToast('Network error broadcasting'); }
}

async function toggleAdminMeta(type) {
    try {
        const res = await apiFetch('/api/admin/toggle-maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminConfig(); // Refresh status
        }
    } catch (e) { window.showToast('Error toggling maintenance'); }
}

async function adminResetAction(type) {
    let confirmMsg = '';
    let apiEndpoint = '';

    if (type === 'history') {
        confirmMsg = '⚠️ WARNING: This will permanently DELETE ALL transaction histories and user logs across the database! Are you absolutely sure?';
        apiEndpoint = '/api/admin/reset-history';
    } else if (type === 'leaderboards') {
        confirmMsg = '⚠️ WARNING: This will RESET ALL leaderboard rankings, verifications, referral stats, and activity points to zero! Are you absolutely sure?';
        apiEndpoint = '/api/admin/reset-leaderboards';
    } else if (type === 'logs') {
        confirmMsg = 'Are you sure you want to clear all server system logs?';
        apiEndpoint = '/api/admin/logs/clear';
    } else {
        return;
    }

    const doubleConfirm = confirm(confirmMsg);
    if (!doubleConfirm) return;

    try {
        const res = await apiFetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData.id })
        });
        const data = await res.json();
        if (data.success) {
            window.showToast(data.message || 'Action executed successfully!');
            if (typeof registerAndFetchUser === 'function') {
                registerAndFetchUser().catch(() => {});
            }
        } else {
            window.showToast(data.message || 'Action failed');
        }
    } catch (e) {
        window.showToast('Network error executing admin reset');
    }
}

async function loadAdminMessages() {
    const list = document.getElementById('adminMessagesList');
    try {
        const res = await apiFetch('/api/admin/all-messages?userId=' + userData.id);
        const data = await res.json();
        if (data.success) {
            renderAdminMessages(data.messages);
        } else {
            list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-sub);">${data.message || 'Failed to load'}</div>`;
        }
    } catch (e) { list.innerHTML = '<div style="color:red; text-align:center;">Network error</div>'; }
}

function renderAdminMessages(messages) {
    const list = document.getElementById('adminMessagesList');

    // Save current input values to prevent losing them during auto-refresh
    const currentInputs = {};
    if (list) {
        const inputs = list.querySelectorAll('input[type="text"]');
        inputs.forEach(inp => {
            if (inp.id && inp.value) {
                currentInputs[inp.id] = inp.value;
            }
        });
    }

    if (!messages || Object.keys(messages).length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">No active support threads</div>';
        return;
    }
    let html = '';
    for (const uId in messages) {
        const userMsgs = messages[uId];
        const lastMsg = userMsgs[userMsgs.length - 1];
        const savedValue = currentInputs['reply-to-' + uId] || '';
        html += `
            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:15px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="font-weight:bold; color:var(--accent-color);">User: ${uId}</span>
                    <span style="font-size:10px; color:var(--text-sub);">${new Date(lastMsg.timestamp).toLocaleString()}</span>
                </div>
                <div style="font-size:14px; margin-bottom:10px; opacity:0.8;">Last: ${lastMsg.message}</div>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="reply-to-${uId}" placeholder="Type reply..." value="${savedValue.replace(/"/g, '&quot;')}"
                        style="flex:1; background:var(--bg-body); border:1px solid var(--border-color); color:var(--text-main); padding:8px; border-radius:8px; font-size:12px;">
                    <button onclick="replyToUser('${uId}')" 
                        style="background:var(--accent-color); color:#000; border:none; padding:8px 15px; border-radius:8px; font-weight:bold; font-size:12px;">SEND</button>
                </div>
            </div>
        `;
    }

    // Check if anything actually changed besides inputs
    // Wait, the new HTML includes the saved input values, so it's safe to just assign innerHTML
    // but assignment breaks cursor focus. Let's just avoid re-rendering if no new messages.
    // A simple hack: compare without input values. Or just re-render but focus might be lost. 
    // To preserve focus, don't re-render if the last messages are identical.

    // Simple state tracking:
    const newHtmlState = JSON.stringify(messages);
    if (list.dataset.lastState !== newHtmlState) {
        list.innerHTML = html;
        list.dataset.lastState = newHtmlState;

        // Restore focus if needed? Actually let's just let it be. If a message comes in, focus is lost, but it's acceptable for a live admin panel.
        // Re-apply focus to the right element if it was focused:
        const activeId = document.activeElement ? document.activeElement.id : null;
        if (activeId && currentInputs[activeId] !== undefined) {
            setTimeout(() => {
                const el = document.getElementById(activeId);
                if (el) { el.focus(); el.selectionStart = el.value.length; }
            }, 10);
        }
    }
}

async function replyToUser(targetUserId) {
    const input = document.getElementById('reply-to-' + targetUserId);
    const message = input.value;
    if (!message) return;
    try {
        const res = await apiFetch('/api/admin/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: targetUserId, message: message }) // targetUserId is the user to reply to
        });
        const data = await res.json();
        if (data.success) {
            window.showToast('Reply sent!');
            input.value = '';
            loadAdminMessages(); // Refresh
        } else window.showToast(data.message || 'Reply failed');
    } catch (e) { window.showToast('Network error replying'); }
}

// Ensure functions are global
window.saveAdminConfig = saveAdminConfig;
window.sendAdminBroadcast = sendAdminBroadcast;
window.loadAdminMessages = loadAdminMessages;
window.replyToUser = replyToUser;
window.toggleAdminMeta = toggleAdminMeta;
window.loadAdminConfig = loadAdminConfig;

// ==========================================
// AI & MEDIA SERVICES LOGIC
// ==========================================

function showResultWithDownload(containerId, imageUrl, label, isVideo) {
    var existing = document.getElementById(containerId);
    if (existing) existing.remove();

    var mediaTag = isVideo
        ? '<video controls style="width:100%; border-radius:12px; max-height:300px; background:#000;" src="' + imageUrl + '"></video>'
        : '<img src="' + imageUrl + '" style="width:100%; border-radius:12px; max-height:350px; object-fit:contain; background:rgba(0,0,0,0.3);">';

    var div = document.createElement('div');
    div.id = containerId;
    div.style.cssText = 'margin-top:20px; padding:16px; background:rgba(255,255,255,0.05); border-radius:16px; border:1px solid rgba(255,255,255,0.1);';
    div.innerHTML = '<p style="color:#22c55e; font-size:12px; font-weight:700; text-transform:uppercase; margin-bottom:12px;">' + label + '</p>' +
        mediaTag +
        '<a href="' + imageUrl + '" download target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:12px; padding:12px; background:linear-gradient(135deg,#22c55e,#16a34a); color:#fff; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;">' +
        '<i class="fas fa-download"></i> Download</a>';

    var pageEl = document.querySelector('.page[style*="block"]') || document.querySelector('.page:not([style*="none"])');
    if (pageEl) pageEl.querySelector('.content-body').appendChild(div);
}

async function pollJobResult(jobId, provider, onReady, maxTries) {
    maxTries = maxTries || 20;
    var tries = 0;
    var interval = setInterval(async function () {
        tries++;
        if (tries > maxTries) {
            clearInterval(interval);
            window.showToast('Processing timed out. Please try again.');
            return;
        }
        try {
            var res = await apiFetch('/api/ai/job-status/' + jobId + '?provider=' + (provider || 'bytez'));
            var data = await res.json();
            if (data.url) {
                clearInterval(interval);
                if (onReady) onReady(data.url);
            }
        } catch (e) { /* keep polling */ }
    }, 3000);
}

async function generateAIPhoto() {
    var prompt = document.getElementById('aiPhotoPrompt').value.trim();
    var style = document.getElementById('aiPhotoStyle').value;
    var btn = document.getElementById('aiPhotoBtn');

    if (!prompt) { window.showToast('Please enter a prompt!'); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    // Remove old result
    var old = document.getElementById('aiPhotoResult');
    if (old) old.remove();

    try {
        var res = await apiFetch('/api/ai/generate-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData ? userData.id : 0, prompt: prompt, style: style })
        });
        var data = await res.json();
        if (data.success) {
            if (data.data && data.data.url) {
                // Immediate result (OpenRouter)
                showResultWithDownload('aiPhotoResult', data.data.url, 'Generated Image', false);
                window.showToast('Photo generated!');
            } else if (data.data && data.data.jobId) {
                // Async job (Bytez)
                window.showToast('Generating image... Please wait');
                pollJobResult(data.data.jobId, data.provider, function (url) {
                    showResultWithDownload('aiPhotoResult', url, 'Generated Image', false);
                    window.showToast('Photo ready!');
                });
            } else {
                window.showToast('Processing started. Check back shortly.');
            }
        } else {
            window.showToast(data.error || data.message || 'Generation failed. Check API key in settings.');
        }
    } catch (e) { window.showToast('Network error. Is the server running?'); }

    btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Generate Image';
    btn.disabled = false;
}

async function generateAIVideo() {
    var prompt = document.getElementById('aiVideoPrompt').value.trim();
    var quality = document.getElementById('aiVideoQuality').value;
    var btn = document.getElementById('aiVideoBtn');

    if (!prompt) { window.showToast('Please enter a video prompt!'); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    var old = document.getElementById('aiVideoResult');
    if (old) old.remove();

    try {
        var res = await apiFetch('/api/ai/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userData ? userData.id : 0, prompt: prompt, quality: quality })
        });
        var data = await res.json();
        if (data.success) {
            if (data.data && data.data.url) {
                showResultWithDownload('aiVideoResult', data.data.url, 'Generated Video', true);
                window.showToast('Video generated!');
            } else if (data.data && data.data.jobId) {
                window.showToast('Generating video... This may take a few minutes');
                pollJobResult(data.data.jobId, data.provider, function (url) {
                    showResultWithDownload('aiVideoResult', url, 'Generated Video', true);
                    window.showToast('Video ready!');
                }, 40);
            } else {
                window.showToast('Processing started. Check back shortly.');
            }
        } else {
            window.showToast(data.error || data.message || 'Generation failed. Check API key in settings.');
        }
    } catch (e) { window.showToast('Network error. Is the server running?'); }

    btn.innerHTML = '<i class="fas fa-play"></i> Generate Video';
    btn.disabled = false;
}

// ── LIVE SMS BOT FUNCTIONS ───────────────────────────────────────────────────
let lsbLogsInterval = null;
window._lsbTimerIntervals = window._lsbTimerIntervals || {};

function _startLsbTimer(botId, startedAt) {
    const ts = parseInt(startedAt);
    if (!ts || isNaN(ts) || ts <= 0) return;

    if (window._lsbTimerIntervals[botId]) clearInterval(window._lsbTimerIntervals[botId]);
    function tick() {
        const el = document.getElementById('lsbTimer_' + botId);
        if (!el) { clearInterval(window._lsbTimerIntervals[botId]); delete window._lsbTimerIntervals[botId]; return; }
        const elapsed = Math.max(0, Date.now() - ts);
        const s = Math.floor(elapsed / 1000);
        const h = String(Math.floor(s / 3600)).padStart(2, '0');
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        el.textContent = `${h}:${m}:${ss}`;
    }
    tick();
    window._lsbTimerIntervals[botId] = setInterval(tick, 1000);
}

function toggleLsbLogs(botId) {
    const el = document.getElementById('lsbLogsContainer_' + botId);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        refreshLiveSmsLogs(botId);
    }
}
window.toggleLsbLogs = toggleLsbLogs;

function toggleBhLogs(botId) {
    const el = document.getElementById('bhLogsContainer_' + botId);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        bhRefreshLogsBox(botId);
    }
}
window.toggleBhLogs = toggleBhLogs;

function _renderLsbBotCard(bot) {
    const container = document.getElementById('lsbHistoryContainer');
    if (!container) return;

    const isRunning = (bot.status === 'Running' || bot.status === 'running');
    const card = document.createElement('div');
    card.id = 'lsbCard_' + bot.id;
    card.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-color); border-radius:18px; padding:16px; margin-bottom:14px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);';

    const statusBadge = isRunning
        ? '<span style="font-size:12px; font-weight:800; color:#22c55e; display:inline-flex; align-items:center; gap:6px;"><span style="width:7px; height:7px; border-radius:50%; background:#22c55e; display:inline-block; box-shadow:0 0 8px #22c55e; animation:pulse 1.5s infinite;"></span>RUNNING</span>'
        : '<span style="font-size:12px; font-weight:800; color:#ef4444; display:inline-flex; align-items:center; gap:6px;"><span style="width:7px; height:7px; border-radius:50%; background:#ef4444; display:inline-block;"></span>STOPPED</span>';

    const botTitle = bot.title || 'bot Panel.py';

    card.innerHTML = `
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                <div style="width:44px; height:44px; background:rgba(124,58,237,0.18); border:1px solid rgba(124,58,237,0.35); border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="fab fa-python" style="color:#a78bfa; font-size:22px;"></i>
                </div>
                <div style="min-width:0;">
                    <div style="font-size:15px; font-weight:800; color:var(--text-main); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${escHtml(botTitle)}
                    </div>
                    <div style="font-size:10px; color:var(--text-sub); font-weight:700; text-transform:uppercase; margin-top:2px; letter-spacing:0.4px;">
                        PYTHON · AUTOSVERIFY
                    </div>
                </div>
            </div>
            <div style="flex-shrink:0;">${statusBadge}</div>
        </div>

        <!-- Runtime Box -->
        <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.22); border-radius:12px; padding:10px 14px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
            <span style="color:#22c55e; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px;">
                <i class="fas fa-clock"></i> Runtime
            </span>
            <span id="lsbTimer_${bot.id}" style="color:#22c55e; font-size:13px; font-weight:900; font-family:monospace; letter-spacing:0.5px;">00:00:00</span>
        </div>

        <!-- Gems Used Box -->
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
            <span style="color:var(--text-sub); font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px;">
                <i class="fas fa-gem" style="color:#a78bfa;"></i> Gems used
            </span>
            <span style="color:#a78bfa; font-size:13px; font-weight:900;">${(parseFloat(bot.gemsUsed) || 0).toFixed(2)} 💎</span>
        </div>

        <!-- Action Buttons Bar (1 Primary Pill + 3 Square Icons) -->
        <div style="display:flex; align-items:center; gap:8px;">
            ${isRunning ? `
                <button onclick="controlLiveSmsBot('stop', '${bot.id}')" class="gv-btn" style="flex:1; height:44px; background:linear-gradient(135deg,rgba(239,68,68,0.25),rgba(185,28,28,0.25)); border:1px solid rgba(239,68,68,0.4); color:#f87171; border-radius:12px; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; box-shadow:0 4px 12px rgba(239,68,68,0.15);">
                    <i class="fas fa-stop-circle" style="color:#ef4444;"></i> Stop
                </button>
            ` : `
                <button onclick="controlLiveSmsBot('start', '${bot.id}')" class="gv-btn" style="flex:1; height:44px; background:linear-gradient(135deg,rgba(34,197,94,0.25),rgba(21,128,61,0.25)); border:1px solid rgba(34,197,94,0.4); color:#4ade80; border-radius:12px; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; box-shadow:0 4px 12px rgba(34,197,94,0.15);">
                    <i class="fas fa-play-circle" style="color:#22c55e;"></i> Start
                </button>
            `}

            <button onclick="controlLiveSmsBot('restart', '${bot.id}')" title="Restart Bot" style="width:44px; height:44px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; border-radius:12px; font-size:15px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                <i class="fas fa-redo-alt"></i>
            </button>

            <button onclick="toggleLsbLogs('${bot.id}')" title="Terminal Logs" style="width:44px; height:44px; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); color:#60a5fa; border-radius:12px; font-size:15px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                <i class="fas fa-terminal"></i>
            </button>

            <button onclick="deleteLiveSmsBot('${bot.id}')" title="Delete Bot" style="width:44px; height:44px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#9ca3af; border-radius:12px; font-size:15px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>

        <!-- Terminal Output / Logs Box (Collapsible) -->
        <div id="lsbLogsContainer_${bot.id}" style="display:none; margin-top:14px; background:#0b0f19; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="font-size:11px; font-weight:700; color:var(--text-sub); letter-spacing:0.3px;">📟 TERMINAL OUTPUT / LOGS</label>
                <button onclick="refreshLiveSmsLogs('${bot.id}')" style="background:none; border:none; color:#60a5fa; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>
            <div id="lsbLogsBox_${bot.id}" style="font-family:'JetBrains Mono', Courier, monospace; font-size:11px; line-height:1.5; color:#34d399; max-height:180px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;">
                ${(bot.logs && bot.logs.length) ? escHtml(bot.logs.join('\n')) : '[System] Initializing terminal output...'}
            </div>
        </div>
    `;

    container.appendChild(card);

    if (isRunning && bot.startedAt) {
        _startLsbTimer(bot.id, bot.startedAt);
    }
}

async function lsbLoadMyBots() {
    if (typeof userData === 'undefined' || !userData) return;

    try {
        const res = await apiFetch('/api/livesmsbot/list?userId=' + userData.id);
        const data = await res.json();

        const container = document.getElementById('lsbHistoryContainer');
        const countBadge = document.getElementById('lsbBotCountBadge');

        if (!container) return;

        const bots = (data.success && data.bots) ? data.bots : [];
        if (countBadge) countBadge.textContent = bots.length;

        // Clear existing timer intervals
        Object.keys(window._lsbTimerIntervals).forEach(id => {
            clearInterval(window._lsbTimerIntervals[id]);
            delete window._lsbTimerIntervals[id];
        });

        if (bots.length > 0) {
            container.innerHTML = '';
            bots.forEach(bot => _renderLsbBotCard(bot));
        } else {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-sub); font-size:13px;"><i class="fas fa-sms" style="font-size:28px; margin-bottom:8px; display:block; opacity:0.25;"></i>No Live SMS bots deployed yet.</div>';
        }
    } catch (err) {
        console.error('Error loading SMS bots:', err);
    }
}

async function deployLiveSmsBot() {
    const titleInput = document.getElementById('lsbBotTitle');
    const adminIdInput = document.getElementById('lsbAdminId');
    const botTokenInput = document.getElementById('lsbBotToken');
    const deployBtn = document.getElementById('lsbDeployBtn');

    if (!adminIdInput || !botTokenInput) return;
    
    let title = titleInput ? titleInput.value.trim() : '';
    if (!title) title = 'bot.py';
    if (!title.includes('.')) title += '.py';

    const adminId = adminIdInput.value.trim();
    const botToken = botTokenInput.value.trim();

    if (!adminId) {
        window.showToast('⚠️ Please enter Telegram Admin ID!');
        return;
    }
    if (!botToken) {
        window.showToast('⚠️ Please enter Telegram Bot Token!');
        return;
    }

    if (deployBtn) {
        deployBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deploying...';
        deployBtn.disabled = true;
    }

    try {
        const res = await apiFetch('/api/livesmsbot/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                title,
                adminId,
                botToken
            })
        });
        const data = await res.json();

        if (data.success) {
            window.showToast('🚀 ' + data.message);
            if (titleInput) titleInput.value = '';
            adminIdInput.value = '';
            botTokenInput.value = '';
            
            // Deduct locally and refresh balances
            if (data.bot) {
                let cost = 10;
                try {
                    const costRes = await apiFetch('/api/public/costs');
                    const costData = await costRes.json();
                    if (costData && costData.costs && costData.costs.liveSmsBotCost !== undefined) {
                        cost = costData.costs.liveSmsBotCost;
                    }
                } catch(e){}
                userData.balance_tokens = Math.max(0, (userData.balance_tokens || 0) - cost);
                userData.tokens = userData.balance_tokens;
                if (typeof renderBalances === 'function') renderBalances();
            }

            await lsbLoadMyBots();
        } else {
            window.showToast('❌ ' + (data.message || 'Deployment failed'));
        }
    } catch (e) {
        console.error('Deployment error:', e);
        window.showToast('❌ Network error during deployment');
    }

    if (deployBtn) {
        deployBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Deploy Bot';
        deployBtn.disabled = false;
    }
}

async function controlLiveSmsBot(action, botId) {
    if (!botId) return;

    const card = document.getElementById('lsbCard_' + botId);
    const actionBtn = card && card.querySelector(`button[onclick*="'${action}'"]`);
    if (actionBtn) { actionBtn.disabled = true; }

    try {
        const res = await apiFetch('/api/livesmsbot/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId })
        });
        const data = await res.json();

        if (data.success) {
            window.showToast(`✅ Bot ${action}ed successfully!`);
            await lsbLoadMyBots();
        } else {
            window.showToast('❌ Failed to control bot: ' + (data.message || 'Error'));
            if (actionBtn) actionBtn.disabled = false;
        }
    } catch (err) {
        window.showToast('❌ Network error control bot');
        if (actionBtn) actionBtn.disabled = false;
    }
}

async function deleteLiveSmsBot(botId) {
    if (!botId) return;

    if (!confirm('Are you sure you want to delete this bot deployment? This cannot be undone.')) return;

    try {
        const res = await apiFetch('/api/livesmsbot/delete?botId=' + botId, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (data.success) {
            window.showToast('✅ Bot deployment deleted.');
            if (window._lsbTimerIntervals && window._lsbTimerIntervals[botId]) {
                clearInterval(window._lsbTimerIntervals[botId]);
                delete window._lsbTimerIntervals[botId];
            }
            await lsbLoadMyBots();
        } else {
            window.showToast('❌ Failed to delete bot: ' + data.message);
        }
    } catch (err) {
        window.showToast('❌ Network error delete bot');
    }
}

async function refreshLiveSmsLogs(botId) {
    if (!botId) return;

    try {
        const res = await apiFetch('/api/livesmsbot/logs/' + botId);
        const data = await res.json();

        if (data.success && data.logs) {
            const logsBox = document.getElementById('lsbLogsBox_' + botId);
            if (logsBox) {
                logsBox.textContent = Array.isArray(data.logs) ? data.logs.join('\n') : String(data.logs);
                logsBox.scrollTop = logsBox.scrollHeight;
            }
        }
    } catch (e) {
        console.warn('Failed to refresh logs:', e);
    }
}

// Clean up interval on navigation out
window.addEventListener('hashchange', () => {
    if (lsbLogsInterval) {
        clearInterval(lsbLogsInterval);
        lsbLogsInterval = null;
    }
    if (window._lsbTimerIntervals) {
        Object.keys(window._lsbTimerIntervals).forEach(id => {
            clearInterval(window._lsbTimerIntervals[id]);
            delete window._lsbTimerIntervals[id];
        });
    }
});

window.generateAIPhoto = generateAIPhoto;
window.generateAIVideo = generateAIVideo;
window.deployLiveSmsBot = deployLiveSmsBot;
window.controlLiveSmsBot = controlLiveSmsBot;
window.deleteLiveSmsBot = deleteLiveSmsBot;
window.refreshLiveSmsLogs = refreshLiveSmsLogs;

// API KEY MANAGEMENT
window.openApiManagementModal = async function () {
    console.log('[API_UI] openApiManagementModal triggered');
    try {
        // If membership join gating is enabled and running in Telegram WebApp, enforce it here too (not only on init)
        if ((!featureFlags || featureFlags.joinRequired !== false) && userData.id && userData.id !== 0 && typeof checkRequiredJoins === 'function' && typeof showJoinRequiredModal === 'function') {
            console.log('[API_UI] Checking required joins...');
            try {
                const joinCheck = await checkRequiredJoins();
                console.log('[API_UI] joinCheck result:', joinCheck);
                if (joinCheck && joinCheck.canProceed === false) {
                    console.log('[API_UI] Join check failed, showing modal');
                    showJoinRequiredModal(joinCheck);
                    return;
                }
                console.log('[API_UI] Join check passed (or not needed)');
            } catch (e) {
                console.error('[API_UI] Join check error:', e);
                // If join check fails, don't hard-block API management UI
            }
        }

        console.log('[API_UI] Preparing to show API modal...');

        const modal = document.getElementById('apiManagementModal');
        if (modal) {
            console.log('[API_UI] Found modal, showing...');
            const modalNoKey = document.getElementById('apiModalNoKey');
            const modalActive = document.getElementById('apiModalActive');
            const modalBanned = document.getElementById('apiModalBanned');
            const modalLoading = document.getElementById('apiModalLoading');
            const modalDisplay = document.getElementById('modalApiKeyDisplay');

            // Reset visibility immediately
            if (modalLoading) modalLoading.style.display = 'none';
            if (modalNoKey) modalNoKey.style.display = 'none';
            if (modalActive) modalActive.style.display = 'none';
            if (modalBanned) modalBanned.style.display = 'none';

            // STRICT POLICY: If key exists in memory, show active screen INSTANTLY
            if (userData && userData.apiKey) {
                if (modalActive) modalActive.style.display = 'block';
                if (modalDisplay) modalDisplay.value = userData.apiKey;
                // No need for loading screen at all
            } else {
                // Only show loading if we are absolutely sure there is no local key
                if (modalLoading) modalLoading.style.display = 'block';
            }

            modal.style.display = 'flex';
            loadApiKey(); // This will sync with server in background
        } else {
            console.error('[API_UI] Modal element not found!');
        }
    } catch (e) {
        console.error('[API_UI] openApiManagementModal error:', e);
    }
};

window.closeApiManagementModal = function () {
    const modal = document.getElementById('apiManagementModal');
    if (modal) modal.style.display = 'none';
};

async function loadApiKey() {
    console.log('[API_UI] loadApiKey called. Unified Syncing...');

    // Elements for Unified Modal & Page
    const modalLoading = document.getElementById('apiModalLoading');
    const modalBanned = document.getElementById('apiModalBanned');
    const modalActive = document.getElementById('apiModalActive');
    const modalDisplay = document.getElementById('modalApiKeyDisplay');
    const modalRegenBtn = document.getElementById('modalRegenBtn');

    const pageActive = document.getElementById('apiKeyActive');
    const pageBanned = document.getElementById('apiKeyBannedNotice');
    const pageContent = document.getElementById('apiKeyContent');
    const pageDisplay = document.getElementById('userApiKeyDisplay');
    const pageRegenBtn = document.getElementById('regenerateApiKeyBtn');

    // 1. Initial State: Show Loading only if not already active
    if (modalBanned) modalBanned.style.display = 'none';
    if (pageBanned) pageBanned.style.display = 'none';
    if (!userData || !userData.apiKey) {
        if (modalLoading) modalLoading.style.display = 'block';
    }

    try {
        const userId = userData.id || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
        if (!userId) return;

        const res = await apiFetch(`/api/user/apikey?userId=${userId}&_=${Date.now()}`, { method: 'GET' });
        const data = await res.json();

        if (modalLoading) modalLoading.style.display = 'none';
        if (!data || !data.success) {
            if (modalActive) modalActive.style.display = 'block';
            if (pageActive) pageActive.style.display = 'block';
            if (pageContent) pageContent.style.display = 'block';
            return;
        }

        // Handle Ban
        if (data.status === 'ban') {
            if (modalBanned) modalBanned.style.display = 'block';
            if (pageBanned) pageBanned.style.display = 'block';
            if (modalActive) modalActive.style.display = 'none';
            if (pageActive) pageActive.style.display = 'none';
            if (pageContent) pageContent.style.display = 'none';
            return;
        }

        // Update memory
        if (userData) {
            userData.apiKey = data.apiKey || null;
            userData.apiStatus = data.status || 'pending';
            try { localStorage.setItem(`userData_${userId}`, JSON.stringify(userData)); } catch (e) { }
        }

        // Show Content
        if (modalActive) modalActive.style.display = 'block';
        if (pageActive) pageActive.style.display = 'block';
        if (pageContent) pageContent.style.display = 'block';

        const buttonText = data.apiKey ? '<i class="fas fa-sync-alt"></i> GENERATE KEY' : '<i class="fas fa-magic"></i> GENERATE NOW';
        const displayValue = data.apiKey || '--- CLICK BELOW TO GENERATE ---';

        if (modalDisplay) modalDisplay.value = displayValue;
        if (pageDisplay) pageDisplay.value = displayValue;

        // Set Unified Button Appearance
        const updateBtn = (btn) => {
            if (!btn) return;
            btn.innerHTML = buttonText;
            btn.style.background = 'linear-gradient(135deg, #9333ea 0%, #6366f1 100%)';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.boxShadow = '0 4px 15px rgba(147, 51, 234, 0.3)';
            if (!data.apiKey) btn.classList.add('pulse-btn');
            else btn.classList.remove('pulse-btn');
        };

        updateBtn(modalRegenBtn);
        updateBtn(pageRegenBtn);

    } catch (e) {
        console.error('Unified Sync error:', e);
        if (modalLoading) modalLoading.style.display = 'none';
        if (modalActive) modalActive.style.display = 'block';
        if (pageActive) pageActive.style.display = 'block';
        if (pageContent) pageContent.style.display = 'block';
    }
}

// Export to window for HTML onclick
window.generateNewApiKey = async function (btnElement) {
    console.log('[API_UI] generateNewApiKey clicked');
    const btn = btnElement || document.getElementById('regenerateApiKeyBtn');
    const btnText = btn ? btn.textContent.trim().toUpperCase() : '';
    const isFirstTime = btnText.includes('GENERATE NOW');
    const originalContent = btn ? btn.innerHTML : '';

    // Check if user is logged in
    const userId = userData.id || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
    if (!userId) {
        console.warn('[API_UI] No userId found yet');
        window.showToast('Please wait for account data to load...');
        return;
    }

    const startRegen = async () => {
        try {
            window.showToast('⏳ Initializing Key Regeneration...');
            console.log(`[API_UI] Starting generation for ${userId}. First time: ${isFirstTime}`);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GENERATING...';
            }

            const res = await apiFetch('/api/user/apikey/generate', {
                method: 'POST',
                body: { userId: userId }
            });

            const data = await res.json();
            if (data.success) {
                window.showToast('✅ API Key generated successfully!');

                // Update local storage and memory
                if (userData) userData.apiKey = data.apiKey;
                try { localStorage.setItem(`userData_${userId}`, JSON.stringify(userData)); } catch (e) { }

                // Immediate UI update 
                const modalDisplay = document.getElementById('modalApiKeyDisplay');
                const pageDisplay = document.getElementById('userApiKeyDisplay');
                if (modalDisplay) modalDisplay.value = data.apiKey;
                if (pageDisplay) pageDisplay.value = data.apiKey;

                if (btn) {
                    btn.innerHTML = '<i class="fas fa-sync-alt"></i> GENERATE KEY';
                    btn.classList.remove('pulse-btn');
                }

                // Call loadApiKey to update the Unified UI parts
                loadApiKey().catch(e => console.error(e));
                loadRecentActivity(); // Refresh history

                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                }
            } else {
                window.showToast('❌ Failed: ' + (data.message || 'Server error'));
                if (btn) btn.innerHTML = originalContent; // Restore on failure
            }
        } catch (e) {
            console.error('[API_UI] Fatal Exception:', e);
            window.showToast('❌ ' + (e.message || 'Connection error.'));
            if (btn) btn.innerHTML = originalContent; // Restore on failure
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    // Auto-proceed if it's the first time
    if (isFirstTime || !userData.apiKey) {
        startRegen();
    } else {
        // Custom simple confirm for iframe/web fallback since confirm() is often blocked
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;";
        overlay.innerHTML = `
            <div style="background:#1a100a;border:1px solid rgba(245,158,11,0.3);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center;">
                <div style="color:#ef4444;font-size:36px;margin-bottom:16px;"><i class="fas fa-exclamation-triangle"></i></div>
                <h3 style="color:#fff;margin:0 0 12px 0;font-size:20px;">Regenerate Key?</h3>
                <p style="color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:24px;line-height:1.5;">Your old API key will stop working immediately.</p>
                <div style="display:flex;gap:10px;">
                    <button id="cancelRegenBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:rgba(255,255,255,0.1);color:#fff;font-weight:bold;cursor:pointer;">CANCEL</button>
                    <button id="confirmRegenBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:#ef4444;color:#fff;font-weight:bold;cursor:pointer;">REGENERATE</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('cancelRegenBtn').onclick = () => overlay.remove();
        document.getElementById('confirmRegenBtn').onclick = () => { overlay.remove(); startRegen(); };
    }
};

function showApiDocs() {
    const modal = document.getElementById('apiDocsModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        // Set dynamic base URL
        const baseUrlEl = document.getElementById('apiBaseUrlDisplay');
        if (baseUrlEl) {
            const base = window.location.origin || 'https://your-domain.railway.app';
            baseUrlEl.textContent = base;
        }
    }
}

function closeApiDocs() {
    const modal = document.getElementById('apiDocsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}


// =============================================
// VIRTUAL CARD PURCHASE MODAL — Beautiful card UI
// =============================================
function showVirtualCardModal(itemName, acc, purchaseObj) {
    const existing = document.getElementById('vcardPurchaseModal');
    if (existing) existing.remove();

    const _grad = {
        visa: 'linear-gradient(135deg, #1a237e 0%, #1565c0 50%, #0d47a1 100%)',
        mastercard: 'linear-gradient(135deg, #4a0000 0%, #b71c1c 50%, #880e4f 100%)',
        amex: 'linear-gradient(135deg, #003300 0%, #1b5e20 50%, #00695c 100%)',
        discover: 'linear-gradient(135deg, #3e2700 0%, #e65100 50%, #bf360c 100%)',
        passive: 'linear-gradient(135deg, #1a002e 0%, #6a1b9a 50%, #4a148c 100%)',
    };
    const grad = _grad[acc.cardType] || _grad.visa;
    const cardLabel = (acc.cardType || 'visa').toUpperCase();

    // Format card number with spaces
    const rawNum = (acc.cardNumber || '').replace(/\s/g, '');
    const formattedNum = rawNum.replace(/(.{4})/g, '$1 ').trim() || '•••• •••• •••• ••••';

    // Build address string
    const addressLine = [acc.address, acc.city, acc.zip, acc.country].filter(Boolean).join(', ');

    const modal = document.createElement('div');
    modal.id = 'vcardPurchaseModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(12px);';

    modal.innerHTML = `
    <div style="background:#0d1117;border-radius:24px;padding:0;max-width:360px;width:100%;border:1px solid rgba(255,255,255,0.1);box-shadow:0 30px 80px rgba(0,0,0,0.8);overflow:hidden;">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:rgba(34,197,94,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-check" style="color:#22c55e;font-size:16px;"></i>
                </div>
                <div>
                    <div style="color:#fff;font-weight:800;font-size:14px;">Purchase Successful!</div>
                    <div style="color:#6b7280;font-size:11px;">${itemName}</div>
                </div>
            </div>
            <button onclick="document.getElementById('vcardPurchaseModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#9ca3af;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>

        <!-- Card Visual -->
        <div style="padding:20px 20px 10px;">
            <div style="border-radius:18px;padding:20px 22px;position:relative;overflow:hidden;min-height:170px;" id="vc-card-visual">
                <div style="position:absolute;inset:0;background:${grad};"></div>
                <!-- Decorative circles -->
                <div style="position:absolute;top:-40px;right:-40px;width:140px;height:140px;background:rgba(255,255,255,0.05);border-radius:50%;"></div>
                <div style="position:absolute;bottom:-50px;left:-20px;width:160px;height:160px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
                <div style="position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
                        <div>
                            <div style="width:42px;height:30px;background:linear-gradient(135deg,#ffd700,#ffa500);border-radius:5px;display:flex;align-items:center;justify-content:center;">
                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:4px;">
                                    <div style="background:rgba(0,0,0,0.3);border-radius:1px;height:8px;"></div>
                                    <div style="background:rgba(0,0,0,0.3);border-radius:1px;height:8px;"></div>
                                    <div style="background:rgba(0,0,0,0.2);border-radius:1px;height:8px;"></div>
                                    <div style="background:rgba(0,0,0,0.2);border-radius:1px;height:8px;"></div>
                                </div>
                            </div>
                        </div>
                        <div style="color:#fff;font-weight:900;font-size:20px;font-style:italic;opacity:0.9;">${cardLabel}</div>
                    </div>
                    <div id="vc-display-number" style="font-family:monospace;font-size:17px;color:#fff;letter-spacing:3px;margin-bottom:20px;text-shadow:0 1px 4px rgba(0,0,0,0.5);">${formattedNum}</div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
                        <div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Card Holder</div>
                            <div style="font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;">${acc.cardHolder || 'CARD HOLDER'}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Expires</div>
                            <div style="font-family:monospace;font-size:14px;font-weight:700;color:#fff;">${acc.expiry || '••/••'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Card Details — copy buttons -->
        <div style="padding:12px 20px 20px;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;">
                ${_vcRow('Card Number', formattedNum, rawNum)}
                ${acc.cvv ? _vcRow('CVV', acc.cvv, acc.cvv) : ''}
                ${acc.expiry ? _vcRow('Expiry', acc.expiry, acc.expiry) : ''}
                ${acc.cardHolder ? _vcRow('Card Holder', acc.cardHolder, acc.cardHolder) : ''}
                ${addressLine ? _vcRow('Billing Address', addressLine, addressLine) : ''}
            </div>

            ${acc.hasLinkedEmail ? `
            <div style="margin-top:10px;background:rgba(147,51,234,0.1);border:1px solid rgba(147,51,234,0.2);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:10px;">
                <i class="fas fa-envelope" style="color:#a78bfa;font-size:13px;flex-shrink:0;"></i>
                <div>
                    <div style="font-size:10px;color:#9ca3af;margin-bottom:1px;">OTP Email</div>
                    <div style="font-size:12px;color:#c4b5fd;">OTP will be sent to your linked email (backend)</div>
                </div>
            </div>` : ''}

            <!-- Close button -->
            <button onclick="document.getElementById('vcardPurchaseModal').remove()"
                style="width:100%;margin-top:14px;padding:13px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;border-radius:14px;font-weight:800;font-size:14px;cursor:pointer;letter-spacing:0.5px;">
                ✅ Done
            </button>
        </div>
    </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function copyVcRowText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check" style="color:#22c55e"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }).catch(() => {});
}
window.copyVcRowText = copyVcRowText;

function _vcRow(label, display, copyVal) {
    const id = 'vcr_' + Math.random().toString(36).substr(2, 6);
    const safeCopy = (copyVal || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:11px;color:#6b7280;min-width:90px;">${label}</span>
        <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end;">
            <span id="${id}" style="font-family:monospace;font-size:13px;color:#e5e7eb;word-break:break-all;text-align:right;">${display}</span>
            <button onclick="copyVcRowText('${safeCopy}', this)"
                style="background:rgba(255,255,255,0.08);border:none;color:#9ca3af;width:26px;height:26px;border-radius:8px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-copy" style="font-size:11px;"></i>
            </button>
        </div>
    </div>`;
}
window.showVirtualCardModal = showVirtualCardModal;

// =============================================
// PASSIVE CARD PURCHASE MODAL
// =============================================
function showPassiveCardModal(itemName, acc, purchaseObj) {
    const existing = document.getElementById('passiveCardModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'passiveCardModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(12px);';

    modal.innerHTML = `
    <div style="background:#0d1117;border-radius:24px;padding:0;max-width:340px;width:100%;border:1px solid rgba(167,139,250,0.2);box-shadow:0 30px 80px rgba(0,0,0,0.8);overflow:hidden;">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:rgba(167,139,250,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-sim-card" style="color:#a78bfa;font-size:16px;"></i>
                </div>
                <div>
                    <div style="color:#fff;font-weight:800;font-size:14px;">Passive Card Activated!</div>
                    <div style="color:#6b7280;font-size:11px;">${itemName}</div>
                </div>
            </div>
            <button onclick="document.getElementById('passiveCardModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#9ca3af;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>
        </div>

        <!-- Card Visual -->
        <div style="padding:20px 20px 10px;">
            <div style="border-radius:18px;padding:20px 22px;background:linear-gradient(135deg,#1a002e 0%,#6a1b9a 50%,#4a148c 100%);position:relative;overflow:hidden;min-height:130px;">
                <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.05);border-radius:50%;"></div>
                <div style="position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-sim-card" style="color:#c4b5fd;font-size:22px;"></i>
                            <span style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Passive Card</span>
                        </div>
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;">VIRTUAL</span>
                    </div>
                    <div style="font-size:14px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;">${acc.passiveLabel || 'PASSIVE CARD'}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">OTP routed via backend email</div>
                </div>
            </div>
        </div>

        <!-- Info -->
        <div style="padding:10px 20px 20px;">
            <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.15);border-radius:12px;padding:14px;margin-bottom:12px;">
                <div style="display:flex;align-items:flex-start;gap:10px;">
                    <i class="fas fa-info-circle" style="color:#a78bfa;margin-top:2px;flex-shrink:0;"></i>
                    <div style="font-size:12px;color:#c4b5fd;line-height:1.6;">
                        Your OTP codes will be received via the linked backend email.<br>
                        Contact support if you need an OTP for a transaction.
                    </div>
                </div>
            </div>
            ${acc.hasLinkedEmail ? `
            <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-check-circle" style="color:#22c55e;font-size:13px;"></i>
                <span style="font-size:12px;color:#86efac;">Backend email linked — OTP routing active</span>
            </div>` : ''}
            <button onclick="document.getElementById('passiveCardModal').remove()"
                style="width:100%;padding:13px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:14px;font-weight:800;font-size:14px;cursor:pointer;">
                ✅ Got It!
            </button>
        </div>
    </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showPassiveCardModal = showPassiveCardModal;


// ==================== BOT HOSTING ====================
(function () {
    'use strict';

    let bhSelectedFile = null;
    let bhSelectedLang = 'python';
    let bhSelectedServerId = null;
    let bhTimerIntervals = {};

    // ── helpers ──────────────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str || '').replace(/[&<>"']/g, m =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    function setEl(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function showEl(id, show) {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
    }

    // ── entry point: called when navigating to botHosting page ────────────────
    window.bhLoadMyBots = async function () {
        if (!userData || !userData.id) return;

        // ── Reset deploy state on every page visit ───────────────────────
        bhSelectedFile = null;
        bhSelectedServerId = null;
        bhSelectedLang = 'python';
        // Clear any lingering poll interval
        if (window._bhPollInterval) { clearInterval(window._bhPollInterval); window._bhPollInterval = null; }
        // Reset file name display and cards
        const card = document.getElementById('bhDetectedFileCard');
        if (card) card.style.display = 'none';
        const nameEl = document.getElementById('bhSelectedFileName');
        if (nameEl) nameEl.textContent = '';
        const dropZone = document.getElementById('bhDropZone');
        if (dropZone) {
            dropZone.style.borderColor = 'rgba(124,58,237,0.4)';
            dropZone.style.background = '';
        }
        const deployBtn = document.getElementById('bhDeployBtn');
        if (deployBtn) { deployBtn.disabled = false; deployBtn.innerHTML = '<i class="fas fa-rocket"></i> Deploy Bot'; }

        // Fetch fresh user data to get latest referral count
        // Use /api/referrals for accurate count (same source as invite page)
        try {
            const referRes = await apiFetch('/api/referrals/' + userData.id);
            const referData = await referRes.json();
            if (referData.success && referData.stats) {
                const freshInvites = referData.stats.invited || 0;
                userData.invites = freshInvites;
                userData.referralCount = freshInvites;
            } else {
                // Fallback to /api/user/:id
                const freshRes = await apiFetch('/api/user/' + userData.id);
                const freshData = await freshRes.json();
                if (freshData && freshData.userId) {
                    const fi = freshData.referralCount || freshData.invites ||
                        (freshData.user && (freshData.user.invites || freshData.user.referralCount)) || 0;
                    userData.invites = fi;
                    userData.referralCount = fi;
                }
            }
            // Always update gems from fresh data
            if (typeof renderBalances === 'function') renderBalances();
        } catch (e) { /* use cached userData */ }

        // Fetch admin-configured settings
        let bhReferReq = 2;
        let bhGemsPerHour = 1;
        let bhReferPerBot = 2;
        let bhMaxBots = 3;
        try {
            const settRes = await apiFetch('/api/public/costs');
            const settData = await settRes.json();
            if (settData && settData.costs) {
                bhReferReq = settData.costs.bhReferReq !== undefined ? settData.costs.bhReferReq : 2;
                bhGemsPerHour = settData.costs.bhGemsPerHour !== undefined ? settData.costs.bhGemsPerHour : 1;
                bhReferPerBot = settData.costs.bhReferPerBot !== undefined ? settData.costs.bhReferPerBot : 2;
                bhMaxBots = settData.costs.bhMaxBots !== undefined ? settData.costs.bhMaxBots : 3;
            }
        } catch (e) { }

        // Update gem balance
        const gems = userData.Gems || userData.balance_Gems || 0;
        setEl('bhGemBalance', gems + ' 💎');

        // Update gems/hr info in cost info text
        const costInfoEl = document.querySelector('#botHostingPage .bh-cost-info');
        if (costInfoEl) costInfoEl.textContent = `1 💎 Gem per hour. Bot runs on an external server selected in next step.`;

        // Count referrals — check all possible fields
        const referCount = userData.referralCount ||
            userData.invites ||
            (userData.referredUsers ? userData.referredUsers.length : 0) ||
            0;

        // Show actual count / required — if already met show full green
        const displayCount = referCount >= bhReferReq ? bhReferReq : referCount;
        setEl('bhReferCount', displayCount + ' / ' + bhReferReq);

        // Referral progress dots
        const dot1 = document.getElementById('bhReferProgress1');
        const dot2 = document.getElementById('bhReferProgress2');
        if (dot1) dot1.style.background = referCount >= 1 ? '#22c55e' : 'rgba(255,255,255,0.1)';
        if (dot2) dot2.style.background = referCount >= bhReferReq ? '#22c55e' : 'rgba(255,255,255,0.1)';

        // Update locked message dynamically
        const lockedMsgEl = document.getElementById('bhLockedMsg');
        if (lockedMsgEl) lockedMsgEl.innerHTML = `You need to refer <strong style="color:#f59e0b;">${bhReferReq} friends</strong> to unlock Bot Hosting.<br>Share your referral link and get them to join!`;

        // Check if user has deployed bots
        let hasBots = false;
        try {
            const listRes = await apiFetch('/api/bothosting/list?userId=' + userData.id);
            const listData = await listRes.json();
            if (listData && listData.bots && listData.bots.length > 0) {
                hasBots = true;
            }
        } catch (e) {}

        if (bhReferReq <= 0 || referCount >= bhReferReq || hasBots) {
            // Unlocked — enough referrals, no referral requirement, or already has deployed bots
            showEl('bhLockedSection', false);
            showEl('bhUnlockedSection', true);
            await _loadDeployedBots();
        } else {
            // Check admin/privileged bypass
            const isPrivileged = userData.adminVerified === true ||
                userData.role === 'admin' ||
                userData.role === 'verified' ||
                userData.role === 'superadmin' ||
                userData.role === 'helper_admin';

            if (isPrivileged) {
                showEl('bhLockedSection', false);
                showEl('bhUnlockedSection', true);
                await _loadDeployedBots();
            } else {
                showEl('bhLockedSection', true);
                showEl('bhUnlockedSection', false);
            }
        }
    };

    // ── File select / upload trigger ─────────────────────────────────────────
    window.bhTriggerFileUpload = function () {
        const fileInput = document.getElementById('bhFileInput');
        if (fileInput) {
            fileInput.click();
        }
    };

    // Reset selected file in Step 1
    window.bhResetSelectedFile = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        bhSelectedFile = null;
        const card = document.getElementById('bhDetectedFileCard');
        if (card) card.style.display = 'none';
        const nameEl = document.getElementById('bhSelectedFileName');
        if (nameEl) nameEl.textContent = '';
        const dropZone = document.getElementById('bhDropZone');
        if (dropZone) {
            dropZone.style.borderColor = 'rgba(124,58,237,0.4)';
            dropZone.style.background = '';
        }
        const fileInput = document.getElementById('bhFileInput');
        if (fileInput) fileInput.value = '';
        const checkBtn = document.getElementById('bhCheckFileBtn');
        if (checkBtn) {
            checkBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Check File';
            checkBtn.disabled = false;
        }
        showToast('File unselected.');
    };

    window.bhSelectLang = function (el) {
        document.querySelectorAll('.bh-lang-btn').forEach(b => {
            b.style.border = '2px solid rgba(255,255,255,0.08)';
            b.style.background = 'rgba(255,255,255,0.03)';
            b.style.boxShadow = 'none';
        });
        el.style.border = '2px solid #7c3aed';
        el.style.background = 'rgba(124,58,237,0.15)';
        el.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.2)';
        bhSelectedLang = el.getAttribute('data-lang');
    };

    // ── file select ───────────────────────────────────────────────────────────
    window.bhOnFileSelect = function (input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) {
            showToast('File too large. Max 100MB.');
            input.value = '';
            return;
        }

        let fileName = file.name || 'bot.py';
        if (!fileName.includes('.')) {
            fileName += '.py';
        }

        // Block obviously wrong file types (images, videos, audio, office docs)
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const blockedExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'mp4', 'mp3', 'avi', 'mkv', 'mov', 'pdf', 'docx', 'xlsx', 'pptx'];
        if (blockedExts.includes(ext)) {
            showToast('Please select a bot script file (.py .js .php .sh .zip etc.)');
            input.value = '';
            return;
        }

        const modifiedFile = new File([file], fileName, { type: file.type });
        bhSelectedFile = modifiedFile;
        setEl('bhSelectedFileName', '📁 ' + escHtml(fileName));

        // Display in Success Card
        const card = document.getElementById('bhDetectedFileCard');
        if (card) {
            card.style.display = 'block';
            const cardName = document.getElementById('bhDetectedFileName');
            if (cardName) cardName.textContent = fileName;
            const cardMeta = document.getElementById('bhDetectedMeta');
            if (cardMeta) {
                const sz = Math.round(file.size / 1024) + ' KB';
                cardMeta.textContent = `${sz} • Direct File Selection`;
            }
        }

        // Auto-detect language from extension
        const langMap = { py: 'python', js: 'nodejs', ts: 'nodejs', mjs: 'nodejs', php: 'php', rb: 'ruby', go: 'go', sh: 'bash', bash: 'bash', json: 'nodejs' };
        const detected = langMap[ext];
        if (detected) {
            const btn = document.querySelector(`.bh-lang-btn[data-lang="${detected}"]`);
            if (btn) bhSelectLang(btn);
        }

        // Highlight drop zone green
        const dz = document.getElementById('bhDropZone');
        if (dz) {
            dz.style.borderColor = '#22c55e';
            dz.style.background = 'rgba(34,197,94,0.06)';
        }
    };

    // ── Step navigation ───────────────────────────────────────────────────────
    window.bhNextToStep2 = async function () {
        if (!bhSelectedFile) {
            showToast('Please select a bot file first');
            return;
        }
        // Activate step 2 dot
        const c2 = document.getElementById('bhStep2DotCircle');
        const l2 = document.getElementById('bhStep2DotLabel');
        if (c2) { c2.style.background = '#7c3aed'; c2.style.color = '#fff'; }
        if (l2) l2.style.color = '#a78bfa';

        showEl('bhStep1Panel', false);
        showEl('bhStep2Panel', true);
        await _loadServersForSelect();
    };

    window.bhBackToStep1 = function () {
        showEl('bhStep2Panel', false);
        showEl('bhStep1Panel', true);
        bhSelectedServerId = null;
        // Reset step 2 dot
        const c2 = document.getElementById('bhStep2DotCircle');
        const l2 = document.getElementById('bhStep2DotLabel');
        if (c2) { c2.style.background = 'rgba(255,255,255,0.1)'; c2.style.color = '#9ca3af'; }
        if (l2) l2.style.color = 'var(--text-sub)';
    };

    // ── Load servers for user selection ──────────────────────────────────────
    async function _loadServersForSelect() {
        const list = document.getElementById('bhServerList');
        if (!list) return;
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub);font-size:12px;"><i class="fas fa-spinner fa-spin"></i> Loading servers...</div>';
        try {
            const res = await apiFetch('/api/bothosting/servers');
            const data = await res.json();
            const servers = (data.servers || []).filter(s => s.active && (s.botCount || 0) < (s.maxBots || 10));

            if (servers.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:20px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;"><i class="fas fa-server" style="color:#ef4444;font-size:24px;margin-bottom:8px;display:block;"></i><div style="font-size:12px;color:var(--text-sub);font-weight:600;">No hosting servers available.<br>Please check back later.</div></div>';
                return;
            }

            const typeIcon = { railway: 'fas fa-train', render: 'fas fa-cloud', heroku: 'fas fa-h-square', replit: 'fas fa-code', koyeb: 'fas fa-server', fly: 'fas fa-plane', custom: 'fas fa-server' };

            list.innerHTML = servers.map(s => `
                <div class="bh-server-btn" data-svr-id="${s.id}" onclick="bhSelectServer(this, '${s.id}')"
                    style="background:rgba(255,255,255,0.03); border:2px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; gap:12px;">
                    <div style="width:42px; height:42px; background:rgba(124,58,237,0.15); border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="${typeIcon[s.type] || 'fas fa-server'}" style="color:#7c3aed; font-size:18px;"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:800; color:var(--text-main);">${escHtml(s.name)}</div>
                        <div style="font-size:10px; color:var(--text-sub); font-weight:600; text-transform:uppercase;">${s.type} · ${s.botCount || 0}/${s.maxBots || 10} slots used</div>
                    </div>
                    <div style="width:10px; height:10px; border-radius:50%; background:#22c55e; flex-shrink:0;"></div>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;font-size:12px;">Failed to load servers</div>';
        }
    }

    window.bhSelectServer = function (el, svrId) {
        document.querySelectorAll('.bh-server-btn').forEach(b => {
            b.style.border = '2px solid rgba(255,255,255,0.08)';
            b.style.background = 'rgba(255,255,255,0.03)';
        });
        el.style.border = '2px solid #7c3aed';
        el.style.background = 'rgba(124,58,237,0.12)';
        bhSelectedServerId = svrId;

        // Enable deploy button
        const btn = document.getElementById('bhDeployBtn');
        if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
    };

    // ── Deploy bot ────────────────────────────────────────────────────────────
    window.bhDeploy = async function () {
        if (!bhSelectedFile || !bhSelectedServerId) {
            showToast('Select a file and server first');
            return;
        }
        if (!userData || !userData.id) return;

        const gems = userData.Gems || userData.balance_Gems || 0;
        if (gems < 1) {
            showToast('You need at least 1 💎 Gem to deploy. Earn Gems by completing tasks!');
            return;
        }

        const btn = document.getElementById('bhDeployBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deploying...'; }

        try {
            // Deploy using native file upload (multipart form)
            const formData = new FormData();
            formData.append('file', bhSelectedFile);
            formData.append('userId', userData.id);
            formData.append('language', bhSelectedLang);
            formData.append('serverId', bhSelectedServerId);
            formData.append('autoRestart', 'true');

            let res, data;
            try {
                res = await apiFetch('/api/bothosting/deploy', {
                    method: 'POST',
                    headers: { 'X-User-Id': String(userData.id) },
                    body: formData
                });
                data = await res.json();
            } catch (fetchErr) {
                showToast('❌ Upload failed. Check your connection and try again.');
                return;
            }
            if (data.success) {
                showToast('🚀 Bot deployed successfully!');
                _resetDeployForm();
                await _loadDeployedBots();
            } else {
                showToast('❌ ' + (data.message || 'Deploy failed'));
            }
        } catch (e) {
            showToast('❌ Error: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Deploy Bot'; }
        }
    };

    function _resetDeployForm() {
        bhSelectedFile = null;
        bhSelectedServerId = null;
        const fi = document.getElementById('bhFileInput');
        if (fi) fi.value = '';
        const nameEl = document.getElementById('bhSelectedFileName');
        if (nameEl) nameEl.textContent = '';
        const dropZone = document.getElementById('bhDropZone');
        if (dropZone) dropZone.style.borderColor = 'rgba(124,58,237,0.4)';
        // Reset step dots
        ['2', '3'].forEach(n => {
            const c = document.getElementById('bhStep' + n + 'DotCircle');
            const l = document.getElementById('bhStep' + n + 'DotLabel');
            if (c) { c.style.background = 'rgba(255,255,255,0.1)'; c.style.color = '#9ca3af'; }
            if (l) l.style.color = 'var(--text-sub)';
        });
        showEl('bhStep2Panel', false);
        showEl('bhStep1Panel', true);
    }

    // ── Load user's deployed bots ─────────────────────────────────────────────
    async function _loadDeployedBots() {
        if (!userData || !userData.id) return;
        const list = document.getElementById('bhMyBotsList');
        if (!list) return;
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub);font-size:13px;"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const res = await apiFetch('/api/bothosting/list?userId=' + userData.id);
            const data = await res.json();
            const bots = data.bots || [];

            const badge = document.getElementById('bhBotCountBadge');
            if (badge) badge.textContent = bots.length;

            // Update Hostinger Summary Panel Stats
            const elTotal = document.getElementById('bhStatTotal');
            const elRunning = document.getElementById('bhStatRunning');
            const elStopped = document.getElementById('bhStatStopped');
            const runningBots = bots.filter(b => b.status === 'running');
            const stoppedBots = bots.filter(b => b.status !== 'running');
            if (elTotal) elTotal.textContent = bots.length;
            if (elRunning) elRunning.textContent = runningBots.length;
            if (elStopped) elStopped.textContent = stoppedBots.length;

            if (bots.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-sub);font-size:13px;"><i class="fas fa-rocket" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.25;"></i>No bots deployed yet</div>';
            } else {
                list.innerHTML = '';
                bots.forEach(bot => _renderBotCard(bot));
            }

            // Render gems history for bot hosting only
            _renderBhGemsHistory();
        } catch (e) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;font-size:12px;">Failed to load bots</div>';
        }
    }

    // ── Bot Hosting Gems History ───────────────────────────────────────────────
    function _renderBhGemsHistory() {
        const section = document.getElementById('bhGemsHistorySection');
        const listEl = document.getElementById('bhGemsHistoryList');
        if (!section || !listEl || !userData || !userData.history) return;

        const bhHistory = userData.history.filter(h => h.type === 'bot_hosting');
        if (bhHistory.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';
        listEl.innerHTML = bhHistory.slice(0, 20).map(h => {
            const date = h.date ? new Date(h.date).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            }) : '';
            const amt = parseFloat(h.amount) || 0;
            const amtStr = amt < 0 ? `−${Math.abs(amt)} 💎` : `+${amt} 💎`;
            const color = amt < 0 ? '#ef4444' : '#22c55e';
            return `<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;background:rgba(124,58,237,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas fa-robot" style="color:#7c3aed;font-size:14px;"></i>
                    </div>
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--text-main);">${escHtml(h.detail || 'Bot Hosting')}</div>
                        <div style="font-size:10px;color:var(--text-sub);">${date}</div>
                    </div>
                </div>
                <span style="font-size:13px;font-weight:800;color:${color};">${amtStr}</span>
            </div>`;
        }).join('');
    }

    // ── Manual status refresh (only called when user explicitly refreshes) ────
    window.bhRefreshStatus = async function (botId) {
        try {
            const res = await apiFetch(`/api/bothosting/sync/${botId}?userId=${userData.id}`, {
                headers: { 'X-User-Id': String(userData.id) }
            });
            const data = await res.json();
            if (data.success) {
                // Update this specific card
                const card = document.getElementById('bhCard_' + botId);
                if (card) {
                    // Re-fetch and re-render just this bot
                    const listRes = await apiFetch('/api/bothosting/list?userId=' + userData.id);
                    const listData = await listRes.json();
                    const bot = listData.bots && listData.bots.find(b => b.id === botId);
                    if (bot) {
                        if (bhTimerIntervals[botId]) { clearInterval(bhTimerIntervals[botId]); delete bhTimerIntervals[botId]; }
                        card.remove();
                        _renderBotCard(bot);
                    }
                }
                return data.status;
            }
        } catch (e) { }
        return null;
    };

    // ── Live Terminal Logs Fetcher ─────────────────────────────────────────────
    window.bhRefreshLogsBox = async function (botId) {
        const box = document.getElementById('bhLogsBox_' + botId);
        if (!box) return;
        box.innerHTML = '<span style="color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> Fetching terminal logs...</span>';
        try {
            const res = await apiFetch(`/api/bothosting/logs/${botId}?userId=${userData.id}`, {
                headers: { 'X-User-Id': String(userData.id) }
            });
            const data = await res.json();
            if (data.success) {
                const logText = data.logs || '[System] Terminal ready. No logs recorded yet.';
                box.textContent = logText;
                box.scrollTop = box.scrollHeight;
            } else {
                box.textContent = '[System] ' + (data.message || 'No logs available.');
            }
        } catch (e) {
            box.textContent = '[System] Failed to fetch terminal logs.';
        }
    };

    // ── Render a single bot card ──────────────────────────────────────────────
    function _renderBotCard(bot) {
        const list = document.getElementById('bhMyBotsList');
        if (!list) return;

        const isRunning = bot.status === 'running';
        const langColor = { python: '#3b82f6', nodejs: '#22c55e', php: '#8b5cf6', ruby: '#e11d48', go: '#00acd7', bash: '#f59e0b' }[bot.language] || '#6b7280';
        const langIcon = { python: 'fab fa-python', nodejs: 'fab fa-node-js', php: 'fab fa-php', ruby: 'fas fa-gem', go: 'fas fa-code', bash: 'fas fa-terminal' }[bot.language] || 'fas fa-code';

        const card = document.createElement('div');
        card.id = 'bhCard_' + bot.id;
        card._botData = bot;
        card.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-color); border-radius:18px; padding:16px; margin-bottom:14px;';

        const statusBadge = isRunning
            ? '<span style="font-size:12px; font-weight:800; color:#22c55e; display:inline-flex; align-items:center; gap:6px; background:rgba(34,197,94,0.12); padding:4px 10px; border-radius:20px; border:1px solid rgba(34,197,94,0.3);"><span style="width:7px; height:7px; border-radius:50%; background:#22c55e; display:inline-block; animation:pulse 1.5s infinite;"></span>RUNNING</span>'
            : bot.adminLocked
                ? '<span style="font-size:12px; font-weight:800; color:#ef4444; display:inline-flex; align-items:center; gap:6px; background:rgba(239,68,68,0.12); padding:4px 10px; border-radius:20px; border:1px solid rgba(239,68,68,0.3);"><i class="fas fa-lock" style="font-size:10px;"></i>LOCKED</span>'
                : '<span style="font-size:12px; font-weight:800; color:#9ca3af; display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.06); padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.12);"><span style="width:7px; height:7px; border-radius:50%; background:#6b7280; display:inline-block;"></span>STOPPED</span>';

        const maskToken = (t) => {
            if (!t) return 'Not set';
            if (t.length <= 10) return t.substring(0, 3) + '***';
            return t.substring(0, 5) + '...' + t.substring(t.length - 4);
        };

        card.innerHTML = `
            <!-- Header -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                    <div style="width:44px; height:44px; background:rgba(124,58,237,0.15); border:1px solid rgba(124,58,237,0.3); border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="${langIcon}" style="color:${langColor}; font-size:20px;"></i>
                    </div>
                    <div style="min-width:0;">
                        <div style="font-size:15px; font-weight:800; color:var(--text-main); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(bot.fileName)}">
                            ${escHtml(bot.fileName)}
                        </div>
                        <div style="font-size:10px; color:var(--text-sub); font-weight:700; text-transform:uppercase; margin-top:2px; letter-spacing:0.4px;">
                            ${(bot.language || 'python').toUpperCase()} · VPS HOSTING
                        </div>
                    </div>
                </div>
                <div style="flex-shrink:0;">${statusBadge}</div>
            </div>

            <!-- Hostinger-style Spec Grid -->
            <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 12px; margin-bottom:10px; font-size:11px; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div>
                    <span style="color:var(--text-sub); font-weight:700; display:block; font-size:9px; text-transform:uppercase;">SERVER</span>
                    <span style="color:var(--text-main); font-weight:800;">${escHtml(bot.serverName || 'Hostinger Server 1')}</span>
                </div>
                <div>
                    <span style="color:var(--text-sub); font-weight:700; display:block; font-size:9px; text-transform:uppercase;">ADMIN ID</span>
                    <span style="color:var(--text-main); font-weight:800;">${escHtml(bot.adminId || 'Not set')}</span>
                </div>
                <div style="grid-column: span 2;">
                    <span style="color:var(--text-sub); font-weight:700; display:block; font-size:9px; text-transform:uppercase;">BOT TOKEN</span>
                    <span style="color:#a78bfa; font-weight:800; font-family:monospace;">${escHtml(maskToken(bot.botToken))}</span>
                </div>
            </div>

            <!-- Runtime & Gems Box -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); border-radius:10px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between;">
                    <span style="color:#22c55e; font-size:11px; font-weight:700;"><i class="fas fa-clock mr-1"></i> Runtime</span>
                    <span id="bhTimer_${bot.id}" style="color:#22c55e; font-size:12px; font-weight:900; font-family:monospace;">00:00:00</span>
                </div>
                <div style="background:rgba(167,139,250,0.08); border:1px solid rgba(167,139,250,0.2); border-radius:10px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between;">
                    <span style="color:#a78bfa; font-size:11px; font-weight:700;"><i class="fas fa-gem mr-1"></i> Gems</span>
                    <span style="color:#a78bfa; font-size:12px; font-weight:900;">${(parseFloat(bot.gemsUsed) || 0).toFixed(2)} 💎</span>
                </div>
            </div>

            ${bot.adminLocked ? `
            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:11px; font-weight:700; color:#ef4444; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-lock" style="font-size:14px;"></i>
                <span>This bot is locked by administrator. Contact admin to unlock.</span>
            </div>` : ''}

            ${(!isRunning && bot.stoppedReason === 'out_of_gems') ? `
            <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:11px; font-weight:700; color:#f59e0b; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-exclamation-triangle" style="font-size:14px;"></i>
                <span>Auto-stopped due to low Gems (1 💎/hr). Buy Gems and click ▶ Start to resume.</span>
            </div>` : ''}

            <!-- Hostinger Action Buttons Bar (1 Primary Pill + 4 Square Action Icons) -->
            <div style="display:flex; align-items:center; gap:6px;">
                ${isRunning ? `
                    <button onclick="bhStopBot('${bot.id}')" ${bot.adminLocked ? 'disabled' : ''} class="gv-btn" style="flex:1; height:42px; background:rgba(239,68,68,0.25); border:1px solid rgba(239,68,68,0.4); color:#f87171; border-radius:12px; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px; cursor:${bot.adminLocked ? 'not-allowed' : 'pointer'}; opacity:${bot.adminLocked ? '0.4' : '1'};">
                        <i class="fas fa-stop-circle"></i> Stop
                    </button>
                ` : `
                    <button onclick="bhStartBot('${bot.id}')" ${bot.adminLocked ? 'disabled' : ''} class="gv-btn" style="flex:1; height:42px; background:rgba(34,197,94,0.2); border:1px solid rgba(34,197,94,0.4); color:#4ade80; border-radius:12px; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px; cursor:${bot.adminLocked ? 'not-allowed' : 'pointer'}; opacity:${bot.adminLocked ? '0.4' : '1'};">
                        <i class="fas fa-play-circle"></i> Start
                    </button>
                `}

                <button onclick="bhRestartBot('${bot.id}')" ${!isRunning || bot.adminLocked ? 'disabled' : ''} title="Restart Bot" style="width:42px; height:42px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; border-radius:12px; font-size:14px; display:flex; align-items:center; justify-content:center; cursor:${!isRunning || bot.adminLocked ? 'not-allowed' : 'pointer'}; opacity:${!isRunning || bot.adminLocked ? '0.4' : '1'}; flex-shrink:0;">
                    <i class="fas fa-redo-alt"></i>
                </button>

                <button onclick="toggleBhLogs('${bot.id}')" title="Terminal Logs" style="width:42px; height:42px; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); color:#60a5fa; border-radius:12px; font-size:14px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                    <i class="fas fa-terminal"></i>
                </button>



                <button onclick="bhDeleteBot('${bot.id}')" title="Delete Bot" style="width:42px; height:42px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#9ca3af; border-radius:14px; font-size:14px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>

            <!-- Terminal Output / Logs Box (Collapsible) -->
            <div id="bhLogsContainer_${bot.id}" style="display:none; margin-top:14px; background:#0b0f19; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label style="font-size:11px; font-weight:700; color:var(--text-sub); letter-spacing:0.3px;">📟 TERMINAL OUTPUT / LOGS</label>
                    <button onclick="bhRefreshLogsBox('${bot.id}')" style="background:none; border:none; color:#60a5fa; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div id="bhLogsBox_${bot.id}" style="font-family:'JetBrains Mono', Courier, monospace; font-size:11px; line-height:1.5; color:#34d399; max-height:180px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;">
                    [System] Initializing terminal output...
                </div>
            </div>
        `;

        list.appendChild(card);

        if (isRunning && bot.startedAt) {
            _startTimer(bot.id, bot.startedAt);
        }
    }

    // ── Timer ─────────────────────────────────────────────────────────────────
    function _startTimer(botId, startedAt) {
        // Validate startedAt — must be a valid past timestamp
        const now = Date.now();
        const ts = parseInt(startedAt);
        if (!ts || isNaN(ts) || ts <= 0 || ts > now) return; // invalid

        if (bhTimerIntervals[botId]) clearInterval(bhTimerIntervals[botId]);
        function tick() {
            const el = document.getElementById('bhTimer_' + botId);
            if (!el) { clearInterval(bhTimerIntervals[botId]); delete bhTimerIntervals[botId]; return; }
            const elapsed = Date.now() - ts;
            if (elapsed < 0) { el.textContent = '00:00:00'; return; }
            const s = Math.floor(elapsed / 1000);
            const h = String(Math.floor(s / 3600)).padStart(2, '0');
            const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            el.textContent = `${h}:${m}:${ss}`;
        }
        tick();
        bhTimerIntervals[botId] = setInterval(tick, 1000);
    }

    // ── Start bot ─────────────────────────────────────────────────────────────
    window.bhStartBot = async function (botId) {
        // Check adminLocked first
        try {
            const listRes = await apiFetch('/api/bothosting/list?userId=' + userData.id);
            const listData = await listRes.json();
            const botInfo = listData.bots && listData.bots.find(b => b.id === botId);
            if (botInfo && botInfo.adminLocked) {
                showToast('🔒 This bot is locked by admin. Contact admin to unlock.');
                return;
            }
        } catch (e) { }

        // Show loading state
        const card = document.getElementById('bhCard_' + botId);
        const startBtn = card && card.querySelector('button[onclick*="bhStartBot"]');
        if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...'; }

        try {
            const res = await apiFetch('/api/bothosting/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userData.id) },
                body: JSON.stringify({ userId: userData.id, botId })
            });
            const data = await res.json();
            if (data.success) {
                showToast('▶ Bot started! 1 💎/hr');
                await _loadDeployedBots();
            } else {
                showToast(data.message || 'Failed to start bot');
                if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = '<i class="fas fa-play-circle"></i> Start'; }
            }
        } catch (e) {
            showToast('Error: ' + e.message);
            if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = '<i class="fas fa-play-circle"></i> Start'; }
        }
    };

    // ── Stop bot ──────────────────────────────────────────────────────────────
    window.bhStopBot = async function (botId) {
        // Show loading state
        const card = document.getElementById('bhCard_' + botId);
        const stopBtn = card && card.querySelector('button[onclick*="bhStopBot"]');
        if (stopBtn) { stopBtn.disabled = true; stopBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping...'; }

        try {
            const res = await apiFetch('/api/bothosting/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userData.id) },
                body: JSON.stringify({ userId: userData.id, botId })
            });
            const data = await res.json();
            if (data.success) {
                showToast('⏹ Bot stopped');
                if (bhTimerIntervals[botId]) { clearInterval(bhTimerIntervals[botId]); delete bhTimerIntervals[botId]; }
                await _loadDeployedBots();
            } else {
                showToast(data.message || 'Failed to stop bot');
            }
        } catch (e) { showToast('Error: ' + e.message); }
    };

    // ── Restart bot ───────────────────────────────────────────────────────────
    window.bhRestartBot = async function (botId) {
        showToast('🔄 Restarting...');
        if (bhTimerIntervals[botId]) { clearInterval(bhTimerIntervals[botId]); delete bhTimerIntervals[botId]; }
        try {
            const res = await apiFetch('/api/bothosting/restart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userData.id) },
                body: JSON.stringify({ userId: userData.id, botId })
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ ' + (data.message || 'Bot restarted!'));
                await _loadDeployedBots();
            } else {
                showToast(data.message || 'Restart failed');
            }
        } catch (e) { showToast('Error: ' + e.message); }
    };

    // ── View logs ─────────────────────────────────────────────────────────────
    window.bhViewLogs = async function (botId) {
        showToast('⏳ Fetching logs...');
        try {
            const res = await apiFetch(`/api/bothosting/logs/${botId}?userId=${userData.id}`, {
                headers: { 'X-User-Id': String(userData.id) }
            });
            const data = await res.json();
            if (data.success) {
                // Show logs in a modal
                const existing = document.getElementById('bhLogsModal');
                if (existing) existing.remove();

                const modal = document.createElement('div');
                modal.id = 'bhLogsModal';
                modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0;';
                modal.innerHTML = `
                    <div style="background:#0f0f12;border-radius:20px 20px 0 0;width:100%;max-height:70vh;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,0.1);border-bottom:none;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <i class="fas fa-terminal" style="color:#60a5fa;"></i>
                                <span style="font-size:13px;font-weight:800;color:#fff;">${escHtml(data.fileName || 'Bot Logs')}</span>
                            </div>
                            <button onclick="document.getElementById('bhLogsModal').remove()" style="background:rgba(255,255,255,0.1);border:none;color:#9ca3af;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;">Close</button>
                        </div>
                        <div style="flex:1;overflow-y:auto;padding:14px 16px;">
                            <pre style="color:#a3e635;font-size:11px;line-height:1.6;margin:0;white-space:pre-wrap;word-break:break-all;font-family:monospace;">${escHtml(data.logs || 'No logs available.')}</pre>
                        </div>
                    </div>
                `;
                modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
                document.body.appendChild(modal);
            } else {
                showToast(data.message || 'Failed to fetch logs');
            }
        } catch (e) {
            showToast('Error: ' + e.message);
        }
    };

    // ── Delete bot ────────────────────────────────────────────────────────────
    window.bhDeleteBot = async function (botId) {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showConfirm(
                '🗑 Permanently delete this bot?\n\nThis will remove it from the hosting server and cannot be undone.',
                async (ok) => { if (ok) await _doDelete(botId); }
            );
        } else {
            if (confirm('Permanently delete this bot?')) await _doDelete(botId);
        }
    };

    async function _doDelete(botId) {
        try {
            const res = await apiFetch('/api/bothosting/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userData.id) },
                body: JSON.stringify({ userId: userData.id, botId })
            });
            const data = await res.json();
            if (data.success) {
                showToast('🗑 Bot deleted');
                if (bhTimerIntervals[botId]) { clearInterval(bhTimerIntervals[botId]); delete bhTimerIntervals[botId]; }
                await _loadDeployedBots();
            } else {
                showToast(data.message || 'Delete failed');
            }
        } catch (e) { showToast('Error: ' + e.message); }
    }

})();
// ==================== END BOT HOSTING ====================


// ==========================================
// PYROGRAM BOT HOSTING FUNCTIONS
// ==========================================
let activeLogBotId = null;
let activeLogPhone = null;
let pyrogramTimers = {};
let pyroPhoneCodeHash = null;

function copyPyroGeneratedToken() {
    const txt = document.getElementById('pyroGeneratedTokenText');
    if (!txt || !txt.value) return;
    navigator.clipboard.writeText(txt.value).then(() => {
        showToast('Pyrogram Session Token copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy token', 'error');
    });
}
window.copyPyroGeneratedToken = copyPyroGeneratedToken;

async function pyrogramSendCode() {
    const phone = document.getElementById('pyroPhoneDeploy').value.trim();
    const apiId = document.getElementById('pyroApiIdDeploy').value.trim();
    const apiHash = document.getElementById('pyroApiHashDeploy').value.trim();

    if (!phone) {
        showToast('Please enter Phone Number (with country code, e.g., +88017... or +358...)', 'error');
        return;
    }

    const adminCosts = JSON.parse(localStorage.getItem('adminCosts') || '{}');
    const cost = adminCosts.pyrogramDeployCost !== undefined ? adminCosts.pyrogramDeployCost : 100;

    const userTokens = userData ? (userData.tokens || userData.balance_tokens || 0) : 0;

    if (userTokens < cost) {
        showToast(`❌ Insufficient Tokens! Generating Pyrogram Session Token requires ${cost} Tokens (You have ${userTokens} TC).`, 'error');
        return;
    }

    const btn = document.getElementById('pyroSendCodeBtn');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending Code...';
    btn.disabled = true;

    try {
        const res = await apiFetch('/api/pyrogram/generate/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData ? userData.id : null,
                phone,
                apiId,
                apiHash
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'OTP Code sent successfully! Check your Telegram App messages.', 'success');
            pyroPhoneCodeHash = data.phoneCodeHash;

            if (data.cleanPhone) {
                document.getElementById('pyroPhoneDeploy').value = data.cleanPhone;
            }

            if (data.otpCode) {
                const otpInput = document.getElementById('pyroOtpCode');
                if (otpInput) otpInput.value = data.otpCode;
            }

            if (typeof data.newBalance === 'number' && userData) {
                userData.tokens = data.newBalance;
                if (typeof renderBalances === 'function') renderBalances();
            }

            // Hide step 1 button, show step 2 inputs
            document.getElementById('pyroCodeStep1').style.display = 'none';
            document.getElementById('pyroCodeStep2').style.display = 'block';
        } else {
            showToast(data.message || 'Failed to send OTP code', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Connection to server failed', 'error');
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}
window.pyrogramSendCode = pyrogramSendCode;

async function pyrogramResendCode() {
    const phone = document.getElementById('pyroPhoneDeploy').value.trim();
    const btn = document.getElementById('pyroResendCodeBtn');
    if (!pyroPhoneCodeHash) {
        showToast('Session expired. Please click "Get Verification Code" again.', 'error');
        return;
    }

    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Resending...';
    }

    try {
        const res = await apiFetch('/api/pyrogram/generate/resend-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData ? userData.id : null,
                phone,
                phoneCodeHash: pyroPhoneCodeHash
            })
        });
        const data = await res.json();
        if (data.success) {
            if (data.phoneCodeHash) {
                pyroPhoneCodeHash = data.phoneCodeHash;
            }
            showToast(data.message || 'Code resend requested! Check your Telegram app.', 'success');
        } else {
            showToast(data.message || 'Failed to resend code.', 'error');
        }
    } catch (e) {
        showToast('Server connection failed', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldText || '<i class="fas fa-sync-alt mr-1"></i> Resend Code';
        }
    }
}
window.pyrogramResendCode = pyrogramResendCode;

async function pyrogramVerifyCode() {
    const phone = document.getElementById('pyroPhoneDeploy').value.trim();
    const apiId = document.getElementById('pyroApiIdDeploy').value.trim();
    const apiHash = document.getElementById('pyroApiHashDeploy').value.trim();
    const rawCode = document.getElementById('pyroOtpCode').value;
    const code = rawCode.replace(/[\s\-]/g, '').trim();
    const password = document.getElementById('pyroPassword').value.trim();

    if (!code) {
        showToast('Please enter the 5-digit verification code from your Telegram App', 'error');
        return;
    }

    const btn = document.getElementById('pyroVerifyBtn');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Verifying...';
    btn.disabled = true;

    try {
        const res = await apiFetch('/api/pyrogram/generate/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData ? userData.id : null,
                phone,
                apiId,
                apiHash,
                phoneCodeHash: pyroPhoneCodeHash,
                code,
                password
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Pyrogram Session Token generated successfully!', 'success');
            
            // Show generated token box if token exists
            if (data.sessionString) {
                const resBox = document.getElementById('pyroResultContainer');
                const tokenTxt = document.getElementById('pyroGeneratedTokenText');
                if (tokenTxt) tokenTxt.value = data.sessionString;
                if (resBox) resBox.style.display = 'block';
            }

            // Reset state
            document.getElementById('pyroPhoneDeploy').value = '';
            document.getElementById('pyroApiIdDeploy').value = '';
            document.getElementById('pyroApiHashDeploy').value = '';
            document.getElementById('pyroOtpCode').value = '';
            document.getElementById('pyroPassword').value = '';
            
            document.getElementById('pyroCodeStep1').style.display = 'block';
            document.getElementById('pyroCodeStep2').style.display = 'none';

            // Reload user state & sessions
            if (typeof loadUserData === 'function') loadUserData();
            if (typeof loadPyrogramSessions === 'function') loadPyrogramSessions();
        } else {
            showToast(data.message || 'Verification failed', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Connection to server failed', 'error');
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}
window.pyrogramVerifyCode = pyrogramVerifyCode;

async function deployPyrogramUserBot() {
    const phone = document.getElementById('pyroPhoneDeploy').value.trim();
    const apiId = document.getElementById('pyroApiIdDeploy').value.trim();
    const apiHash = document.getElementById('pyroApiHashDeploy').value.trim();
    const sessionString = document.getElementById('pyroSessionDeploy').value.trim();

    if (!phone || !apiId || !apiHash || !sessionString) {
        showToast('Please fill all deployment fields', 'error');
        return;
    }

    const btn = document.getElementById('pyroDeployBtn');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Deploying...';
    btn.disabled = true;

    try {
        const res = await apiFetch('/api/pyrogram/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userData.id,
                phone,
                apiId,
                apiHash,
                sessionString
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Pyrogram bot deployed successfully!', 'success');
            // Clear inputs
            document.getElementById('pyroPhoneDeploy').value = '';
            document.getElementById('pyroApiIdDeploy').value = '';
            document.getElementById('pyroApiHashDeploy').value = '';
            document.getElementById('pyroSessionDeploy').value = '';
            
            // Reload user state & sessions
            if (typeof loadUserData === 'function') loadUserData();
            loadPyrogramSessions();
        } else {
            showToast(data.message || 'Failed to deploy bot', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Connection to server failed', 'error');
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}
window.deployPyrogramUserBot = deployPyrogramUserBot;

async function togglePyrogramBot(botId, currentStatus) {
    const endpoint = currentStatus === 'Running' ? '/api/pyrogram/stop' : '/api/pyrogram/start';
    const actionText = currentStatus === 'Running' ? 'Stopping...' : 'Starting...';

    try {
        const res = await apiFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Status updated', 'success');
            loadPyrogramSessions();
            if (activeLogBotId === botId) {
                viewPyrogramLogs(botId, activeLogPhone);
            }
        } else {
            showToast(data.message || 'Operation failed', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Network error occurred', 'error');
    }
}
window.togglePyrogramBot = togglePyrogramBot;

async function restartPyrogramBot(botId) {
    try {
        const res = await apiFetch('/api/pyrogram/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Userbot restarted successfully', 'success');
            loadPyrogramSessions();
            if (activeLogBotId === botId) {
                viewPyrogramLogs(botId, activeLogPhone);
            }
        } else {
            showToast(data.message || 'Restart failed', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Network error on restart', 'error');
    }
}
window.restartPyrogramBot = restartPyrogramBot;

async function deletePyrogramBot(botId) {
    if (!confirm('Are you sure you want to completely delete and stop this Pyrogram Bot?')) return;
    try {
        const res = await apiFetch(`/api/pyrogram/${userData.id}/${botId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Bot deleted successfully', 'success');
            if (activeLogBotId === botId) {
                document.getElementById('pyroTerminalSection').style.display = 'none';
                activeLogBotId = null;
            }
            loadPyrogramSessions();
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Network error on deletion', 'error');
    }
}
window.deletePyrogramBot = deletePyrogramBot;

async function viewPyrogramLogs(botId, phoneNumber) {
    activeLogBotId = botId;
    activeLogPhone = phoneNumber;
    
    const logsContainer = document.getElementById('pyroTerminalLogs');
    const titleContainer = document.getElementById('pyroActiveTerminalName');
    
    if (titleContainer) titleContainer.innerText = phoneNumber;
    document.getElementById('pyroTerminalSection').style.display = 'block';
    
    if (logsContainer) logsContainer.innerHTML = 'Fetching console output...';
    
    try {
        const res = await apiFetch(`/api/pyrogram/logs/${botId}`);
        const data = await res.json();
        if (data.success && data.logs && data.logs.length > 0) {
            logsContainer.innerHTML = data.logs.join('\n');
            logsContainer.scrollTop = logsContainer.scrollHeight;
        } else {
            logsContainer.innerHTML = 'No terminal logs found for this bot yet.';
        }
    } catch (err) {
        console.error(err);
        if (logsContainer) logsContainer.innerHTML = 'Failed to fetch logs.';
    }
}
window.viewPyrogramLogs = viewPyrogramLogs;

// Hook terminal logs refresh button
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('pyroRefreshLogsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (activeLogBotId && activeLogPhone) {
                viewPyrogramLogs(activeLogBotId, activeLogPhone);
                showToast('Logs refreshed', 'success');
            }
        });
    }
});

let pyrogramSessionsCache = [];

function viewPyroDetails(botId) {
    const session = pyrogramSessionsCache.find(s => s.id === botId);
    if (!session) return;

    document.getElementById('pyroModalPhone').innerText = session.phoneNumber || 'N/A';
    document.getElementById('pyroModalApiId').innerText = session.apiId || 'Official App';
    document.getElementById('pyroModalApiHash').innerText = session.apiHash || 'Official Hash';

    document.getElementById('pyroModalToken').value = session.sessionString || '';
    
    const dateStr = session.createdAt ? new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    document.getElementById('pyroModalDate').innerText = dateStr;

    const modal = document.getElementById('pyroViewModal');
    if (modal) modal.style.display = 'flex';
}
window.viewPyroDetails = viewPyroDetails;

function closePyroViewModal() {
    const modal = document.getElementById('pyroViewModal');
    if (modal) modal.style.display = 'none';
}
window.closePyroViewModal = closePyroViewModal;

function copyPyroModalField(elementId, label) {
    let text = '';
    const el = document.getElementById(elementId);
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        text = el.value;
    } else {
        text = el.innerText || el.textContent;
    }
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(label + ' copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}
window.copyPyroModalField = copyPyroModalField;

async function loadPyrogramSessions() {
    const listEl = document.getElementById('pyrogramList');
    if (!listEl) return;

    // Dynamically update Pyrogram deploy cost label
    const adminCosts = JSON.parse(localStorage.getItem('adminCosts') || '{}');
    const cost = adminCosts.pyrogramDeployCost !== undefined ? adminCosts.pyrogramDeployCost : 100;

    const costLabel = document.getElementById('pyroCostLabel');
    if (costLabel) costLabel.innerText = cost + ' Tokens';
    const costHeader = document.getElementById('pyroCostHeader');
    if (costHeader) costHeader.innerText = cost + ' TC';
    
    // Clear old running timers
    Object.values(pyrogramTimers).forEach(t => clearInterval(t));
    pyrogramTimers = {};

    if (!userData || !userData.id) return;

    try {
        const res = await apiFetch('/api/pyrogram/' + userData.id);
        const data = await res.json();
        
        // Update stats
        if (data.success) {
            const activeCountEl = document.getElementById('pyroActiveCount');
            if (activeCountEl) activeCountEl.innerText = (data.sessions ? data.sessions.length : (data.activeCount || 0)) + ' Active';

            pyrogramSessionsCache = data.sessions || [];

            // Populate Bots list
            if (data.sessions && data.sessions.length > 0) {
                listEl.innerHTML = data.sessions.map(s => {
                    const date = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    
                    // Render Minimal Session Card (Phone Number on Top, Action Buttons on Side, Token Box Below)
                    return `
                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
                            <div style="flex:1; min-width:140px;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="font-weight:800; font-size:14px; color:#fff; word-break:break-all;">${s.phoneNumber}</span>
                                    <span style="background:rgba(14,165,233,0.12); color:#0ea5e9; font-size:9px; font-weight:800; padding:2px 6px; border-radius:6px; letter-spacing:0.3px; border:1px solid rgba(14,165,233,0.2);">PYROGRAM</span>
                                </div>
                                <div style="font-size:10px; color:var(--text-sub); margin-top:3px; font-weight:500;">
                                    Generated: ${date}
                                </div>
                            </div>

                            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                                <button onclick="viewPyroDetails('${s.id}')" style="background:rgba(14,165,233,0.15); border:1px solid rgba(14,165,233,0.3); color:#38bdf8; padding:5px 9px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:0.2s;" onmouseover="this.style.background='rgba(14,165,233,0.25)'" onmouseout="this.style.background='rgba(14,165,233,0.15)'" title="View Details">
                                    <i class="fas fa-eye" style="font-size:11px;"></i>
                                    <span>View</span>
                                </button>
                                <button onclick="deletePyrogramBot('${s.id}')" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#f87171; padding:5px 9px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'" title="Delete Session">
                                    <i class="fas fa-trash-alt" style="font-size:11px;"></i>
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>

                        <!-- Session string box -->
                        <div style="background:rgba(0,0,0,0.3); border-radius:10px; padding:8px 10px; display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid rgba(16,185,129,0.25);">
                            <span style="font-family:monospace; font-size:11px; color:#10b981; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${s.sessionString}">${s.sessionString}</span>
                            <button onclick="navigator.clipboard.writeText('${s.sessionString}').then(()=>showToast('Pyrogram Token copied!','success'))" style="background:#10b981; border:none; color:#fff; border-radius:8px; padding:5px 10px; font-size:11px; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:5px; flex-shrink:0; white-space:nowrap; transition:0.2s;" title="Copy Pyrogram Token">
                                <i class="fas fa-copy" style="font-size:11px;"></i> Copy Token
                            </button>
                        </div>
                    </div>`;
                }).join('');
            } else {
                listEl.innerHTML = `
                <div style="text-align:center; padding:32px 16px; border:1px dashed rgba(255,255,255,0.1); border-radius:14px; background:rgba(0,0,0,0.1);">
                    <i class="fas fa-key" style="font-size:28px; color:rgba(255,255,255,0.2); margin-bottom:10px;"></i>
                    <p style="font-size:12px; color:var(--text-sub); font-weight:600; margin:0;">No active Pyrogram sessions generated.</p>
                </div>`;
            }
        }
    } catch (err) {
        console.error(err);
        listEl.innerHTML = '<p class="text-red-400 text-sm py-4 text-center">Failed to load Pyrogram sessions</p>';
    }
}
window.loadPyrogramSessions = loadPyrogramSessions;


// ==========================================
// END OF FILE
// ==========================================
