const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_FILE = path.join(__dirname, 'database.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Default initial data
const defaultData = {
    users: {},
    groups: {}, // Store Group/Channel IDs
    moderationStats: { deletedMessages: 0 },
    codes: {},
    settings: {
        dailyBonus: 50,
        refBonus: 50, // Updated to 50
        systemVersion: Date.now(), // Real-time update tracker
        taskReward: 10,
        adReward: 5,
        zeroBalanceAdReward: 5,
        countryAdRewards: {
            "USA": 15,
            "GBR": 12,
            "CAN": 12,
            "AUS": 12,
            "DEU": 10,
            "FRA": 10,
            "IND": 5,
            "BGD": 4,
            "PAK": 4
        },
        costs: {
            spotify: 50,
            youtube: 50,
            teacher: 100, // Bolt.new
            gpt: 100,
            military: 100,
            gemini: 50,
            gmail: 20,
            hotmail: 25,
            tempmail: 10,
            student: 50,
            renewmail: 30,
            live2fa: 10,
            liveInstagram: 1,
            liveFacebook: 1,
            liveTiktok: 1,
            liveTwitter: 1,
            liveThreads: 1
        },
        transferCost: 5, // Default transfer fee
        supportCost: 10,
        // Exchange Rates: 1 USD = 1000 Gems, 1 Gem = 100 Tokens
        usdToGems: 1000,
        gemToToken: 100,
        usdToToken: 100000,
        exchangeFee: 2,   // 2% fee
        transferFee: 5    // 5% fee
    },
    tasks: {
        "task_youtube": {
            name: "Youtube Channel",
            url: "https://youtube.com/@AutosVerify",
            reward: 10,
            gems: 1
        },
        "task_telegram_group": {
            name: "Telegram Group",
            url: "https://t.me/AutosVerifyGroup",
            reward: 10,
            gems: 1
        },
        "task_telegram_channel": {
            name: "Telegram Channel",
            url: "https://t.me/AutosVerifyCh",
            reward: 10,
            gems: 1
        }
    },
    cards: {
        "gemini": [],
        "chatgpt": [],
        "spotify": []
    },
    cardPrices: {
        "gemini": 150,
        "chatgpt": 200,
        "spotify": 50
    },
    serviceNames: {},
    scheduledBroadcasts: [],
    tickets: [],
    payments: [],
    transactions: [], // NEW: Transaction history
    serverLogs: [], // NEW: Log for server problems
    vpnAccounts: {
        "nordvpn": [],
        "expressvpn": [],
        "surfshark": [],
        "cyberghost": [],
        "protonvpn": []
    },
    vpnPrices: {
        "nordvpn": 100,
        "expressvpn": 120,
        "surfshark": 80,
        "cyberghost": 70,
        "protonvpn": 90
    },
    vpnServiceNames: {
        "nordvpn": "🛡️ NordVPN",
        "expressvpn": "⚡ ExpressVPN",
        "surfshark": "🦈 Surfshark",
        "cyberghost": "👻 CyberGhost",
        "protonvpn": "🔒 ProtonVPN"
    },
    // Email Pool for Premium Services
    emailPool: {
        gmail: [],   // Array of { email, password, note, addedAt, assignedTo, assignedAt }
        hotmail: []
    },
    // Manual Numbers Pool
    manualNumbers: [], // Array of { id, platform, number, otp, status, addedAt }
    // API Keys and Configuration
    apiKeys: {
        openRouterKey: '',
        bytezKey: '',
        miniAppUrl: 'https://autosverify.up.railway.app',
        backupBotToken: '8395111217:AAFQLisYZDcBa2krRZrQ4QfUIDcxg0gdKM4',
        requiredChannel: '@AutosVerify',
        requiredGroup: '@AutosVerifyCh',
        requiredChannels: ['@AutosVerify'],
        requiredGroups: ['@AutosVerifyCh', '@AutosVerifyBD'],
        smtpLabsKey: '',
        gmailClientId: '',
        gmailClientSecret: ''
    },
    // Service Categories for new Services Management system
    serviceCategories: [
        {
            id: "virtual-cards",
            name: "Virtual Cards",
            description: "API Keys & Accounts",
            icon: "fa-credit-card",
            color: "from-orange-500 to-red-600",
            type: "card",
            order: 1
        },
        {
            id: "vpn",
            name: "VPN Services",
            description: "VPN Accounts & Keys",
            icon: "fa-shield-alt",
            color: "from-cyan-500 to-blue-600",
            type: "account",
            order: 2
        }
    ],
    // Service Items with their types and stock
    serviceItems: {
        "gemini": { categoryId: "virtual-cards", type: "apikey", name: "Gemini", icon: "fa-brain", color: "from-purple-500 to-pink-600", price: 150 },
        "chatgpt": { categoryId: "virtual-cards", type: "apikey", name: "ChatGPT", icon: "fa-robot", color: "from-green-500 to-emerald-600", price: 200 },
        "4jibit": { categoryId: "virtual-cards", type: "apikey", name: "4jibit", icon: "fa-key", color: "from-blue-500 to-indigo-600", price: 100 },
        "spotify": { categoryId: "virtual-cards", type: "account", name: "Spotify", icon: "fa-music", color: "from-green-400 to-green-600", price: 50 },
        "nordvpn": { categoryId: "vpn", type: "account", name: "NordVPN", icon: "fa-shield-alt", color: "from-blue-600 to-blue-800", price: 100 },
        "expressvpn": { categoryId: "vpn", type: "account", name: "ExpressVPN", icon: "fa-bolt", color: "from-red-500 to-red-700", price: 120 },
        "surfshark": { categoryId: "vpn", type: "account", name: "Surfshark", icon: "fa-water", color: "from-cyan-500 to-teal-600", price: 80 },
        "cyberghost": { categoryId: "vpn", type: "account", name: "CyberGhost", icon: "fa-ghost", color: "from-yellow-500 to-orange-600", price: 70 },
        "protonvpn": { categoryId: "vpn", type: "account", name: "ProtonVPN", icon: "fa-lock", color: "from-purple-600 to-indigo-800", price: 90 }
    },
    adminSettings: {
        supportCost: 10,
        gmailCost: 20, // Default Gmail Cost
        tempMailCost: 10, // Default Temp Mail Cost
        hotmailCost: 25, // Default Hotmail Cost
        studentEmailCost: 50, // Default Student Email Cost
        renewMailCost: 30, // Default Custom Renew Cost
        creditRates: {
            crypto: 0.01,
            bkash: 1,
            nagad: 1
        },
        // Welcome credits for new users
        welcomeCredits: 50,
        botName: 'Auto Verify', // Customizable bot display name
        requireTelegram: false, // NEW: Requirement to access via Telegram only
        autoApproveJoinRequests: true, // NEW: Auto-approve join requests to groups/channels
        // Mother Email (IMAP) Configurations
        motherEmailConfigs: {
            gmail: { email: '', password: '', host: 'imap.gmail.com', port: 993 },
            hotmail: { email: '', password: '', host: 'imap-mail.outlook.com', port: 993 }
        },
        // Group Management Settings
        groupManagement: {
            autoDeleteSystemMessages: true, // Auto-delete join/leave messages
            deleteJoinMessages: true,
            deleteLeaveMessages: true,
            deletePinMessages: true,
            deleteVoiceChatStarted: true,
            deleteVoiceChatEnded: true,
            deleteVideoChatStarted: true,
            deleteVideoChatEnded: true,
            deleteVideoChatScheduled: true,
            deleteVideoChatParticipantsInvited: true,
            deleteProximityAlertTriggered: false,
            deleteAutoDeleteTimerChanged: false,
            deleteMessageAutoDeleteTimerChanged: false,
            deleteMigrateToChat: false,
            deleteMigrateFromChat: false,
            deleteChannelChatCreated: false,
            deleteSupergroupChatCreated: false,
            deleteDeleteGroupPhoto: false,
            deleteDeleteGroupStickerSet: false,
            deleteGroupPhotoChanged: false,
            deleteGroupStickerSetChanged: false,
            deleteTitleChanged: false,
            deleteDescriptionChanged: false,
            deletePinnedMessage: true,
            deleteGeneralForumTopicHidden: false,
            deleteGeneralForumTopicUnhidden: false,
            deleteForumTopicCreated: false,
            deleteForumTopicEdited: false,
            deleteForumTopicClosed: false,
            deleteForumTopicReopened: false,
            deleteForumTopic: false,
            deleteForumTopicIsGeneral: false,
            deleteWebAppData: false,
            deleteWebAppDataSent: false,
            deleteWebAppDataReceived: false,
            deletePassportData: false,
            deletePassportDataSent: false,
            deletePassportDataReceived: false,
            deleteProximityAlertTriggeredIn: false,
            deleteProximityAlertTriggeredOut: false,
            deleteBoostAdded: false,
            deleteChatBackgroundSet: false,
            deleteChatBackground: false,
            deleteGiveawayCreated: false,
            deleteGiveawayCompleted: false,
            deleteGiveawayWinners: false,
            deleteGiveawayPrizeStars: false,
            deletePaidMediaPurchased: false,
            deleteUsersShared: false,
            deleteChatShared: false,
            deleteConnectedWebsite: false,
            deleteWriteAccessAllowed: false,
            deleteVideoMessage: false,
            deleteVoiceMessage: false,
            deleteContact: false,
            deleteLocation: false,
            deleteVenue: false,
            deletePoll: false,
            deleteDice: false,
            deleteGame: false,
            deleteInvoice: false,
            deleteSuccessfulPayment: false,
            deleteSuccessfulPaymentStars: false,
            deleteRefundedPayment: false,
            deletePaymentRefunded: false,
            deleteGiftSent: false,
            deleteGiftReceived: false,
            deleteStarGiftSent: false,
            deleteStarGiftReceived: false,
            deleteStarTransaction: false,
            deleteStarTransactions: false,
            deleteChatJoinRequest: false,
            deleteChatMemberUpdated: false,
            deleteChatMember: false,
            deleteChatMembers: false,
            deleteChatMemberCount: false,
            deleteChatMemberStatus: false,
            deleteChatMemberUsername: false,
            deleteChatMemberFirstName: false,
            deleteChatMemberLastName: false,
            deleteChatMemberLanguageCode: false,
            deleteChatMemberIsBot: false,
            deleteChatMemberIsPremium: false,
            deleteChatMemberAddedToAttachmentMenu: false,
            deleteChatMemberCanJoinGroups: false,
            deleteChatMemberCanReadAllGroupMessages: false,
            deleteChatMemberSupportsInlineQueries: false
        },
        emailVerification: {
            enabled: false,
            allowMasking: true
        }
    },
    featureFlags: {
        // Admin Panel Buttons
        admin_manage_user: true,
        admin_manage_cards: true,
        admin_manage_apps: true,
        admin_manage_vpn: true,
        admin_manage_codes: true,
        admin_manage_tasks: true,
        admin_manage_costs: true,
        admin_payments: true,
        admin_backup: true,
        admin_settings: true,
        admin_stats: true,
        admin_broadcast: true,
        admin_upload_file: true,
        admin_group_controller: true,
        emailVerification: false, // User requested it to be off by default
        // User Features
        buy_cards: true,
        buy_vpn: true,
        buy_premium_app: true,
        verification: true,
        support: true,
        referral: true,
        daily_bonus: true,
        tasks: true,
        transfer: true,
        redeem_code: true,
        premiumMail: true,
        home_premiumMail: true,
        joinRequired: false
    },
    services: {},
    shopItems: {},
    itemSales: {}, // NEW: User item submissions for selling
    joinRequests: [], // Telegram Group/Channel join requests
    // Generic API Providers (New System)
    providers: {}, // { id: { title, type, apiUrl, apiKey (enc), priority, status, healthStats... } }
    broadcasts: [], // Ensure broadcast storage structure
    pendingDeposits: [], // { id, userId, method, amount, txnId, screenshot, date, status: 'pending'|'approved'|'rejected', autoApproved: true|false }
    cryptoMethods: {
        binance: { name: "Binance Pay", details: "39996280", email: "boyearn705@gmail.com", qr: "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=39996280", status: "active" },
        bitget: { name: "Bitget", details: "748839201", email: "", qr: "", status: "active" },
        gateio: { name: "Gate.io", details: "12345678", email: "", qr: "", status: "active" },
        usdt: { name: "Web3 (USDT TRC20)", details: "TR7NHqkeu71v7otNDV352u653nqYBg7KkZ", email: "", qr: "", status: "active" },
        bitcoin: { name: "Web3 (Bitcoin)", details: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", email: "", qr: "", status: "active" }
    },
    sellingRewards: {
        "Gmail": 50,
        "TikTok": 100,
        "Facebook": 80,
        "Telegram": 120,
        "Discord": 150,
        "Other": 40,
        "2faMultiplier": 1.5 // 50% bonus
    }
};

/* Encryption Helper */
const crypto = require('crypto');
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || 'default_secret_key_32_bytes_long____').padEnd(32, '0').slice(0, 32);
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return null;
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) { console.error("Encrypt Error:", e); return null; }
}

function decrypt(text) {
    if (!text) return null;
    try {
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) { console.error("Decrypt Error:", e); return null; }
}


// ==================== MYSQL POOL ====================
const mysql = require('mysql2/promise');
let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'autosverify',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            connectTimeout: 5000  // 5 s — fail fast when DB is unavailable (e.g. local dev)
        });
    }
    return pool;
}

class Database {
    constructor() {
        this.data = defaultData;
        this.ready = false;
        this.DB_FILE = DB_FILE; // Expose for server.js file size stats

        this._mysqlSaveTimer = null;
        this._mysqlSavePending = false;
        this._mysqlAvailable = false; // Track if MySQL is reachable
        
        // ===== BAN CACHING SYSTEM =====
        // In-memory cache for banned IDs (for instant lookup without DB read)
        this._bannedCache = new Map(); // { userId -> true }
        this._banCacheTime = 0; // Last update time
        this._BAN_CACHE_TTL = 5 * 60 * 1000; // Refresh every 5 minutes
        
        // Real-time update tracking
        this._systemVersion = Date.now();

        this._isWiped = false;

        // Initialize Asynchronously
        this.dbReady = this.init();
    }

    async load() {
        console.log("🔄 Manual Database Load triggered...");
        this.ready = false;
        await this.init();
        return this.data;
    }

    async init() {
        console.log("🛠️ Starting Database Initialization...");

        // 1. Try to connect to MySQL and create tables
        try {
            const db = getPool();
            const conn = await db.getConnection();
            await conn.query(`
                CREATE TABLE IF NOT EXISTS bot_settings (
                    \`key\` VARCHAR(255) PRIMARY KEY,
                    value LONGTEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            await conn.query(`
                CREATE TABLE IF NOT EXISTS bot_users (
                    user_id BIGINT PRIMARY KEY,
                    data LONGTEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            conn.release();
            this._mysqlAvailable = true;
            console.log("✅ MySQL connected and tables ready.");
        } catch (e) {
            this._mysqlAvailable = false;
            console.warn("⚠️ MySQL unavailable — falling back to local disk (database.json):", e.message);
        }

        // 2. Load local disk data (always read as fallback / migration source)
        let localData = null;
        if (fs.existsSync(DB_FILE)) {
            try {
                localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            } catch (e) {
                console.error("Local DB Read Error:", e);
            }
        }

        if (this._mysqlAvailable) {
            // 3a. Try to load data from MySQL
            let mysqlHasData = false;
            try {
                const db = getPool();
                const [settingsRows] = await db.query('SELECT `key`, value FROM bot_settings');
                const [userRows] = await db.query('SELECT user_id, data FROM bot_users');

                if (settingsRows.length > 0 || userRows.length > 0) {
                    mysqlHasData = true;
                    // Apply settings rows to this.data
                    const merged = { ...defaultData };
                    for (const row of settingsRows) {
                        try { merged[row.key] = JSON.parse(row.value); } catch (_) { merged[row.key] = row.value; }
                    }
                    // Apply user rows
                    if (!merged.users) merged.users = {};
                    for (const row of userRows) {
                        try {
                            const userData = JSON.parse(row.data);
                            merged.users[String(row.user_id)] = userData;
                        } catch (_) {}
                    }
                    this.data = merged;
                    console.log("✅ Database loaded from MySQL. Keys:", Object.keys(this.data));
                    if (this.data.users) console.log("✅ Found users in MySQL. Count:", Object.keys(this.data.users).length);
                }
            } catch (e) {
                console.error("⚠️ Failed to load from MySQL:", e.message);
            }

            // 3b. If MySQL has no data but local disk does, migrate local → MySQL
            if (!mysqlHasData && localData) {
                console.log("📤 Migrating local data to MySQL...");
                this.data = { ...defaultData, ...localData };
                await this._upsertToMySQL();
                console.log("✅ Migration to MySQL complete.");
            } else if (!mysqlHasData && !localData) {
                console.warn("⚠️ No data found (local or MySQL). Starting fresh.");
            }
        } else {
            // 3c. MySQL unavailable — use local disk only
            if (localData) {
                this.data = { ...defaultData, ...localData };
                console.warn("⚠️ Using local disk fallback. MySQL syncing disabled.");
            } else {
                console.warn("⚠️ No data found (local or remote). Starting fresh.");
            }
        }

        // Force enable joinRequired on startup per user request
        if (!this.data.featureFlags) this.data.featureFlags = {};
        this.data.featureFlags.joinRequired = true;

        if (!this.data.apiKeys) this.data.apiKeys = {};
        this.data.apiKeys = { ...defaultData.apiKeys, ...this.data.apiKeys };
        if (!this.data.apiKeys.requiredChannels || !this.data.apiKeys.requiredChannels.length) {
            this.data.apiKeys.requiredChannels = ['@AutosVerify'];
        }
        if (!this.data.apiKeys.requiredGroups || !this.data.apiKeys.requiredGroups.length) {
            this.data.apiKeys.requiredGroups = ['@AutosVerifyCh', '@AutosVerifyBD'];
        }
        if (!this.data.apiKeys.requiredChannel) this.data.apiKeys.requiredChannel = '@AutosVerify';
        if (!this.data.apiKeys.requiredGroup) this.data.apiKeys.requiredGroup = '@AutosVerifyCh';
        if (!this.data.apiKeys.backupBotToken) this.data.apiKeys.backupBotToken = '8395111217:AAFQLisYZDcBa2krRZrQ4QfUIDcxg0gdKM4';
        if (!this.data.apiKeys.miniAppUrl) this.data.apiKeys.miniAppUrl = 'https://autosverify.up.railway.app';

        await this.save(true);

        this.ready = true;
        console.log("✅ Database is ready.");
    }

    deleteLocalBackup() {
        console.log("ℹ️ Local backup deletion skipped (kept for persistence safety).");
    }

    // Internal: upsert all data to MySQL
    async _upsertToMySQL() {
        if (!this._mysqlAvailable) return;
        try {
            const db = getPool();
            const conn = await db.getConnection();
            // Upsert each top-level key except 'users'
            for (const [key, value] of Object.entries(this.data)) {
                if (key === 'users') continue;
                try {
                    const serialized = JSON.stringify(value);
                    await conn.query(
                        'INSERT INTO bot_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW()',
                        [key, serialized]
                    );
                } catch (e) {
                    console.error(`[MySQL] Failed to upsert setting key "${key}":`, e.message);
                }
            }
            // Upsert each user
            if (this.data.users && typeof this.data.users === 'object') {
                for (const [userId, userData] of Object.entries(this.data.users)) {
                    try {
                        const serialized = JSON.stringify(userData);
                        await conn.query(
                            'INSERT INTO bot_users (user_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=NOW()',
                            [parseInt(userId), serialized]
                        );
                    } catch (e) {
                        console.error(`[MySQL] Failed to upsert user ${userId}:`, e.message);
                    }
                }
            }
            conn.release();
        } catch (e) {
            console.error("[MySQL] _upsertToMySQL error:", e.message);
        }
    }

    async save(force = false) {
        if (!this.ready && !force) return;

        if (!this.data.settings) this.data.settings = {};
        this._systemVersion = Date.now();
        this.data.settings.systemVersion = this._systemVersion;

        // Always write local disk backup first (no data loss)
        this.saveLocalBackup();

        if (force) {
            if (this._mysqlSaveTimer) {
                clearTimeout(this._mysqlSaveTimer);
                this._mysqlSaveTimer = null;
            }
            this._mysqlSavePending = false;
            try {
                await this._upsertToMySQL();
            } catch (e) {
                console.error("[MySQL] Force sync error:", e.message);
            }
            return;
        }

        this._mysqlSavePending = true;
        if (this._mysqlSaveTimer) return;

        return new Promise((resolve) => {
            this._mysqlSaveTimer = setTimeout(async () => {
                this._mysqlSaveTimer = null;
                if (!this._mysqlSavePending) {
                    resolve();
                    return;
                }
                this._mysqlSavePending = false;
                try {
                    await this._upsertToMySQL();
                } catch (e) {
                    console.error("[MySQL] Debounced sync error:", e.message);
                }
                resolve();
            }, 50);
        });
    }

    saveLocalBackup() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("❌ Failed to save local backup:", e.message);
        }
    }

    // SERVER LOGGING SYSTEM
    logError(type, message, context = {}) {
        if (!this.ready) return;
        const logEntry = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toLocaleString(),
            type: type || 'error',
            message: message || 'Unknown error',
            context: context,
            status: 'unsolved'
        };
        if (!this.data.serverLogs) this.data.serverLogs = [];
        this.data.serverLogs.unshift(logEntry);
        // Keep only last 100 logs
        if (this.data.serverLogs.length > 100) {
            this.data.serverLogs = this.data.serverLogs.slice(0, 100);
        }
        this.save();
        console.warn(`⚠️ [LOGGED] ${type}: ${message}`);
    }

    clearLogs() {
        if (!this.ready) return;
        this.data.serverLogs = [];
        this.save();
    }

    solveLog(logId) {
        if (!this.ready) return;
        const log = this.data.serverLogs.find(l => l.id === logId);
        if (log) {
            log.status = 'solved';
            this.save();
        }
    }

    triggerSystemUpdate() {
        if (!this.ready) return;
        this._systemVersion = Date.now();
        if (!this.data.settings) this.data.settings = {};
        this.data.settings.systemVersion = this._systemVersion;
        this.save(true);
    }

    async wipe() {
        if (!this.ready) return;
        this._isWiped = true;

        // Clean user and system operational data
        this.data.users = {};
        this.data.groups = {};
        this.data.moderationStats = { deletedMessages: 0 };
        this.data.codes = {};
        this.data.tickets = [];
        this.data.payments = [];
        this.data.transactions = [];
        this.data.serverLogs = [];
        this.data.scheduledBroadcasts = [];
        this.data.mailSessions = {};
        this.data.numberSessions = {};
        this.data.gmails = [];
        this.data.smmOrders = [];
        this.data.itemSales = {};
        this.data.pendingDeposits = [];
        this.data.manualNumbers = [];
        this.data.pendingDeletions = [];
        this.data.liveStreams = {};
        this.data.emailPool = { gmail: [], hotmail: [] };

        if (this.data.cards) {
            Object.keys(this.data.cards).forEach(k => this.data.cards[k] = []);
        }
        if (this.data.vpnAccounts) {
            Object.keys(this.data.vpnAccounts).forEach(k => this.data.vpnAccounts[k] = []);
        }

        // Save local JSON backup
        this.saveLocalBackup();

        // Upsert wiped state to MySQL
        await this.save(true);

        // Realtime notification update
        this.triggerSystemUpdate();
        return true;
    }

    getUser(userId) {
        if (!userId) return null;
        
        // Handle common non-numeric strings silently
        const stringId = String(userId).trim();
        if (stringId === 'gifts' || stringId === 'undefined' || stringId === 'null') {
            return null;
        }

        const numericId = typeof userId === 'number' ? userId : parseInt(userId);
        if (isNaN(numericId) || numericId <= 0) {
            // Only log if it's not a common expected non-numeric string
            if (!/^[a-zA-Z_]+$/.test(stringId)) {
                console.error(`[DB] Invalid userId rejected: ${userId}`);
            }
            return null;
        }

        const id = numericId.toString();

        if (!this.data.users[id]) {
            const welcomeCredits = this.getWelcomeCredits();
            this.data.users[id] = {
                id: numericId,
                balance: welcomeCredits,  // Welcome credits for new users (legacy)
                balance_tokens: welcomeCredits, // New: Tokens (TC) currency
                joinedAt: Date.now(),
                referrer: null,
                lastDaily: null,
                tasksDone: [],
                referralCount: 0,
                referredBy: null,
                // New Stats
                username: null,
                successfulVerifications: 0,
                failedVerifications: 0,
                cardsPurchased: 0,
                blocked: false,
                adminVerified: false,
                isSuspended: false,
                language: 'en',  // Default language
                lastActive: Date.now(), // New: Activity tracking
                dailyStreak: 0,
                lastDaily: 0,
                usd: 0.00, // New: Dollar balance
                apiStatus: 'allow', // Default API status
                history: [
                    {
                        type: 'bonus',
                        amount: welcomeCredits,
                        reward: `+${welcomeCredits} Tokens`,
                        date: Date.now(),
                        detail: 'Welcome Bonus'
                    }
                ]
            };
            this.save();
        } else {
            // Migration for existing users without history
            if (!this.data.users[id].history || this.data.users[id].history.length === 0) {
                const welcome = this.getWelcomeCredits() || 100;
                this.data.users[id].history = [
                    {
                        type: 'bonus',
                        amount: welcome,
                        reward: `+${welcome} Tokens`,
                        date: Date.now(),
                        detail: 'Welcome Bonus'
                    }
                ];
                this.save();
            }
        }

        // Auto-sync gems: if Gems and balance_Gems differ, take the higher value
        const u = this.data.users[id];
        const gemsA = parseFloat(u.Gems || 0);
        const gemsB = parseFloat(u.balance_Gems || 0);
        if (gemsA !== gemsB) {
            const synced = Math.max(gemsA, gemsB);
            u.Gems = synced;
            u.balance_Gems = synced;
            // No immediate save here — will be saved on next write operation
        }

        return this.data.users[id];
    }

    updateUserActivity(userId) {
        if (!this.data.users) return;
        const id = userId.toString();
        if (this.data.users[id]) {
            this.data.users[id].lastActive = Date.now();
            this.save();
        }
    }

    saveGroup(chatId, title, type, memberCount) {
        if (!this.data.groups) this.data.groups = {};
        const id = chatId.toString();

        this.data.groups[id] = {
            id: chatId,
            title: title,
            type: type,
            memberCount: memberCount || this.data.groups[id]?.memberCount || 0,
            addedAt: this.data.groups[id]?.addedAt || Date.now(),
            lastActive: Date.now()
        };
        this.save();
    }

    getGroups() {
        if (!this.data.groups) this.data.groups = {};

        // Auto-register configured required channel/group if set in API keys or settings
        const apiKeys = this.data.apiKeys || {};
        const settings = this.data.settings || {};

        const reqChannel = apiKeys.requiredChannel || settings.requiredChannel || '';
        const reqGroup = apiKeys.requiredGroup || settings.requiredGroup || '';

        if (reqChannel) {
            const key = reqChannel.startsWith('@') ? reqChannel : ('@' + reqChannel);
            if (!this.data.groups[key] && !this.data.groups[reqChannel]) {
                this.data.groups[key] = {
                    id: key,
                    title: reqChannel,
                    type: 'channel',
                    memberCount: 0,
                    addedAt: Date.now(),
                    lastActive: Date.now()
                };
            }
        }

        if (reqGroup) {
            const key = reqGroup.startsWith('@') ? reqGroup : ('@' + reqGroup);
            if (!this.data.groups[key] && !this.data.groups[reqGroup]) {
                this.data.groups[key] = {
                    id: key,
                    title: reqGroup,
                    type: 'group',
                    memberCount: 0,
                    addedAt: Date.now(),
                    lastActive: Date.now()
                };
            }
        }

        if (Object.keys(this.data.groups).length === 0 && !reqChannel && !reqGroup) {
            this.data.groups['@MyTelegramChannel'] = {
                id: '@MyTelegramChannel',
                title: 'My Telegram Channel',
                type: 'channel',
                memberCount: 1250,
                addedAt: Date.now(),
                lastActive: Date.now()
            };
            this.data.groups['@MyTelegramGroup'] = {
                id: '@MyTelegramGroup',
                title: 'My Telegram Group',
                type: 'group',
                memberCount: 450,
                addedAt: Date.now(),
                lastActive: Date.now()
            };
        }

        return Object.values(this.data.groups || {});
    }

    incrementDeletedMessages(count = 1) {
        if (!this.data.moderationStats) this.data.moderationStats = { deletedMessages: 0 };
        this.data.moderationStats.deletedMessages += count;
        this.save();
    }

    getDeletedMessagesCount() {
        return this.data.moderationStats?.deletedMessages || 0;
    }

    async updateUser(userOrId, updates = null, forceSave = false) {
        // Handle both formats: updateUser(userObject) or updateUser(userId, updates)
        let userId, userData;

        if (typeof userOrId === 'object' && userOrId.id !== undefined) {
            // First format: updateUser(userObject)
            userId = userOrId.id;
            userData = userOrId;
        } else {
            // Second format: updateUser(userId, updates)
            userId = userOrId;
            userData = updates;
        }

        // Validate userId
        const numericId = typeof userId === 'number' ? userId : parseInt(userId);
        if (isNaN(numericId) || numericId <= 0) {
            console.error(`[DB] updateUser: Invalid userId rejected: ${userId}`);
            return false;
        }

        const id = numericId.toString();

        // If user doesn't exist, create it
        if (!this.data.users[id]) {
            this.data.users[id] = {
                id: numericId,
                balance: 0,
                balance_tokens: 0, // New: Tokens (TC) currency
                joinedAt: Date.now(),
                referrer: null,
                lastDaily: null,
                tasksDone: [],
                referralCount: 0,
                referredBy: null,
                username: null,
                successfulVerifications: 0,
                failedVerifications: 0,
                cardsPurchased: 0,
                blocked: false,
                language: 'en',
                usd: 0.00
            };
        }

        // Apply updates
        if (userData && typeof userData === 'object') {
            Object.keys(userData).forEach(key => {
                if (key !== 'id') { // Don't overwrite ID
                    const newValue = userData[key];
                    const existingValue = this.data.users[id][key];

                    // CRITICAL PROTECTION: Do not overwrite apiKey or apiStatus with null/undefined 
                    // if they already exist in the database. This prevents race conditions 
                    // from stale objects in the bot/server.
                    if ((key === 'apiKey' || key === 'apiStatus') && (newValue === null || newValue === undefined) && existingValue) {
                        // Keep existing value
                        return;
                    }

                    this.data.users[id][key] = newValue;
                }
            });
        }

        await this.save(forceSave);
        return true;
    }

    getUsers() {
        return Object.values(this.data.users || {});
    }

    // Helper: get canonical token balance
    getTokenBalance(user) {
        // Prefer balance_tokens (canonical) → tokens → balance → 0
        if (user.balance_tokens !== undefined && user.balance_tokens !== null) return user.balance_tokens;
        if (user.tokens !== undefined && user.tokens !== null) return user.tokens;
        return user.balance || 0;
    }

    // Helper: set canonical token balance (keeps all fields in sync)
    setTokenBalance(user, amount) {
        const val = Math.max(0, Math.round(amount));
        user.tokens = val;
        user.balance_tokens = val;
        user.balance = val;
        this.updateUser(user);
        this.save();
    }

    // Helper: get canonical gem balance (both Gems and balance_Gems fields)
    getGemBalance(user) {
        if (user.balance_Gems !== undefined && user.balance_Gems !== null) return parseFloat(user.balance_Gems) || 0;
        if (user.Gems !== undefined && user.Gems !== null) return parseFloat(user.Gems) || 0;
        return 0;
    }

    // Helper: set canonical gem balance (keeps both Gems fields in sync)
    setGemBalance(user, amount) {
        const val = Math.max(0, parseFloat(amount.toFixed ? amount.toFixed(4) : amount) || 0);
        user.Gems = val;
        user.balance_Gems = val;
        this.updateUser(user);
        this.save();
    }


    addCredit(userId, amount, currency = 'Tokens') {
        const user = this.getUser(userId);
        if (!user) return 0;

        if (currency === 'USD' || currency === 'Dollars' || currency === 'usd') {
            user.usd = parseFloat(((user.usd || 0) + parseFloat(amount)).toFixed(3));
        } else {
            const current = this.getTokenBalance(user);
            this.setTokenBalance(user, current + parseInt(amount));
        }

        this.save();
        return (currency === 'USD' || currency === 'usd') ? user.usd : user.tokens;
    }

    setLanguage(userId, lang) {
        const user = this.getUser(userId);
        user.language = lang;
        this.save();
    }

    // ==================== REFERRAL CODE SYSTEM ====================
    // Generate a random referral code like ref_QMD2UE
    generateReferralCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return 'ref_' + code;
    }

    // Get or create referral code for a user
    getReferralCode(userId) {
        const user = this.getUser(userId);
        if (!user) return null;

        // If user already has a code, return it
        if (user.referralCode) return user.referralCode;

        // Generate a new unique code
        let code;
        let attempts = 0;
        do {
            code = this.generateReferralCode();
            attempts++;
            // Check if code is already used by another user
            const existingUser = Object.values(this.data.users || {}).find(u => u.referralCode === code);
            if (!existingUser) break;
        } while (attempts < 10);

        // Save code to user
        user.referralCode = code;
        this.save();
        return code;
    }

    // Get userId from referral code
    getUserIdFromReferralCode(code) {
        if (!code) return null;
        const cleanCode = String(code).trim();

        // Find user with this referral code
        const users = Object.values(this.data.users || {});
        const user = users.find(u => u.referralCode === cleanCode);
        if (user) return user.id;

        // Fallback: try to parse old format (ref_userId or just userId)
        if (cleanCode.startsWith('ref_')) {
            const possibleId = cleanCode.replace('ref_', '');
            // Check if it's a numeric ID
            if (/^\d+$/.test(possibleId)) {
                const numericId = parseInt(possibleId);
                if (this.data.users[String(numericId)]) return numericId;
            }
        }

        return null;
    }

    // Referrals - Create pending referral when user clicks link
    handleReferral(newUserId, referrerCode) {
        const newUser = this.getUser(newUserId);
        // If already referred or self-referral, ignore
        if (newUser.referredBy || String(newUserId) === String(referrerCode)) return false;

        // Get referrer userId from code
        const referrerId = this.getUserIdFromReferralCode(referrerCode);
        if (!referrerId || String(referrerId) === String(newUserId)) return false;

        const referrer = this.getUser(referrerId);
        if (!referrer) return false;

        // Set referral relationship
        newUser.referredBy = String(referrerId);
        newUser.referredByCode = referrer.referralCode || referrerCode;
        newUser.referralVerified = false; // Track verification status

        // Track in referrer's list as PENDING (not rewarded yet)
        if (!referrer.referredUsers) referrer.referredUsers = [];
        referrer.referredUsers.push({
            userId: String(newUserId),
            date: Date.now(),
            rewarded: false, // Pending until verified
            status: 'Pending'
        });

        // DO NOT add bonus yet - wait for verification
        // DO NOT increment referralCount yet - wait for verification

        this.save();
        return true;
    }

    // Verify referral and give reward after user completes requirements
    verifyReferral(newUserId) {
        const newUser = this.getUser(newUserId);
        if (!newUser || !newUser.referredBy || newUser.referralVerified) return false;

        const referrerId = newUser.referredBy;
        const referrer = this.getUser(referrerId);
        if (!referrer) return false;

        // Find the pending referral record
        if (!referrer.referredUsers) return false;
        const referralRecord = referrer.referredUsers.find(r => r.userId === String(newUserId));
        if (!referralRecord || referralRecord.rewarded) return false; // Already rewarded or not found

        // Mark as verified
        newUser.referralVerified = true;
        referralRecord.rewarded = true;
        referralRecord.status = 'Verified';
        referralRecord.verifiedDate = Date.now();

        // Increment count
        if (!referrer.referralCount) referrer.referralCount = 0;
        referrer.referralCount++;

        // Add bonus to referrer (keep all balance fields in sync)
        const refBonus = (this.data.settings && this.data.settings.refBonus) || 50;
        const referrerBalance = this.getTokenBalance(referrer);
        this.setTokenBalance(referrer, referrerBalance + refBonus);

        // Add to referrer's history (only once, not in addTransaction)
        if (!referrer.history) referrer.history = [];
        referrer.history.unshift({
            type: 'referral_bonus',
            amount: refBonus,
            currency: 'tokens',
            date: Date.now(),
            details: `Referred and verified user #${newUserId}`,
            reward: `+${refBonus} TC`,
            status: 'Verified',
            userId: newUserId
        });

        // Add transaction record (global transactions only, no duplicate history)
        this.addTransaction(referrerId, 'referral', refBonus, 'TC', `Referral bonus from verified user #${newUserId}`, 'user-check');

        this.save();

        // Notify referrer
        return {
            referrerId,
            newUserId,
            refBonus,
            referrerName: referrer.firstName || referrer.username || 'User'
        };
    }

    getTopReferrers(limit = 10) {
        const users = Object.values(this.data.users);
        // Filter users with > 0 referrals and sort
        const top = users
            .filter(u => u.referralCount > 0)
            .sort((a, b) => b.referralCount - a.referralCount)
            .slice(0, limit);
        return top;
    }

    deductCredit(userId, amount) {
        const user = this.getUser(userId);
        if (!user) return false;

        const currentBalance = this.getTokenBalance(user);
        if (currentBalance < amount) return false;

        this.setTokenBalance(user, currentBalance - amount);

        this.save();
        return true;
    }

    getSettings() {
        if (!this.data.settings) this.data.settings = {};
        if (!this.data.settings.paymentMethods) {
            const config = require('./config');
            this.data.settings.paymentMethods = JSON.parse(JSON.stringify(config.PAYMENT_METHODS));
            this.save();
        }
        return this.data.settings;
    }

    updateSetting(key, value) {
        this.data.settings[key] = value;
        this.save();
    }

    updateSettings(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        this.save();
    }

    updateCost(service, cost) {
        this.data.settings.costs[service] = cost;
        this.save();
    }

    // Codes — canonical implementation (single definition below at PROMO CODE SYSTEM)

    // Daily
    claimDaily(userId) {
        const user = this.getUser(userId);
        if (!user) return { success: false, message: "User not found" };

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const lastClaim = user.lastDaily || 0;

        // Check if 24h passed
        if (lastClaim > 0 && (now - lastClaim < oneDay)) {
            const remaining = oneDay - (now - lastClaim);
            const hours = Math.floor(remaining / 3600000);
            const mins = Math.floor((remaining % 3600000) / 60000);
            return { success: false, msg: `Come back in ${hours}h ${mins}m`, message: `Come back in ${hours}h ${mins}m` };
        }

        // Streak Logic: Reset if missed a day (more than 48h)
        if (lastClaim > 0 && (now - lastClaim > oneDay * 2)) {
            user.dailyStreak = 0;
        }

        user.dailyStreak = (user.dailyStreak || 0) + 1;
        if (user.dailyStreak > 7) user.dailyStreak = 1; // Reset to Day 1 after Day 7

        user.lastDaily = now;

        // Reward Calculation
        const dailyBonus = (this.data.settings && this.data.settings.dailyBonus) || 50;
        const rewards = [dailyBonus, dailyBonus * 2, dailyBonus * 3, dailyBonus * 4, dailyBonus * 5, dailyBonus * 6, dailyBonus * 10];
        const reward = rewards[user.dailyStreak - 1] || dailyBonus;

        const currentBalance = this.getTokenBalance(user);
        this.setTokenBalance(user, currentBalance + reward);

        if (!user.history) user.history = [];
        user.history.unshift({
            type: 'daily_bonus',
            amount: reward,
            currency: 'tokens',
            date: now
        });

        this.save();
        return {
            success: true,
            amount: reward,
            reward: reward,
            newStreak: user.dailyStreak,
            newBalance: user.tokens
        };
    }

    // Tasks
    getTasks() {
        return this.data.tasks || {};
    }

    createTask(name, url, reward, gems = 0, icon = null) {
        if (!this.data.tasks) this.data.tasks = {};
        const id = 'task_' + Date.now();
        this.data.tasks[id] = {
            name,
            url,
            reward: parseInt(reward),
            gems: parseInt(gems) || 0,
            icon: icon || null
        };
        this.save();
        return id;
    }

    deleteTask(taskId) {
        if (this.data.tasks && this.data.tasks[taskId]) {
            delete this.data.tasks[taskId];
            this.save();
            return true;
        }
        return false;
    }

    completeTask(userId, taskId) {
        const user = this.getUser(userId);
        const task = this.data.tasks ? this.data.tasks[taskId] : null;

        if (!task) return { success: false, msg: "Task not found" };

        if (!user.tasksDone) user.tasksDone = [];
        if (user.tasksDone.includes(taskId)) return { success: false, msg: "Already completed" };

        user.tasksDone.push(taskId);
        const currentTokens = this.getTokenBalance(user);
        this.setTokenBalance(user, currentTokens + (task.reward || 0));
        if (task.gems > 0) {
            const currentGems = this.getGemBalance(user);
            this.setGemBalance(user, currentGems + task.gems);
        }
        this.updateUser(user);
        this.save();
        return { success: true, reward: task.reward };
    }

    // Card Management
    addCard(service, details) {
        if (!this.data.cards) this.data.cards = { "gemini": [], "chatgpt": [], "spotify": [] };
        if (!this.data.cards[service]) this.data.cards[service] = [];
        this.data.cards[service].push(details);
        this.save();
        return true;
    }

    getCard(service) {
        if (!this.data.cards || !this.data.cards[service] || this.data.cards[service].length === 0) {
            return null;
        }
        const card = this.data.cards[service].shift(); // Remove first available card

        // Check if stock is now empty - auto delete service and promo codes
        if (this.data.cards[service].length === 0) {
            console.log(`[DB] Stock depleted for service: ${service}. Auto-deleting service and promo codes...`);

            // Delete associated promo codes (codes that start with service name)
            if (this.data.settings && this.data.settings.codes) {
                const codesToDelete = Object.keys(this.data.settings.codes).filter(code => {
                    // Delete codes that match the service ID or contain service name
                    return code.toLowerCase().includes(service.toLowerCase());
                });

                codesToDelete.forEach(code => {
                    delete this.data.settings.codes[code];
                    console.log(`[DB] Deleted promo code: ${code}`);
                });
            }

            // Delete the service completely
            this.deleteService(service);
            console.log(`[DB] Service ${service} auto-deleted due to zero stock`);
        }

        this.save();
        return card;
    }

    getCardCounts() {
        const counts = {};
        const services = Object.keys(this.data.cards || {});
        services.forEach(s => {
            counts[s] = this.data.cards[s].length;
        });
        return counts;
    }

    clearCards(service) {
        if (this.data.cards && this.data.cards[service]) {
            this.data.cards[service] = [];
            this.save();
            return true;
        }
        return false;
    }

    getCardPrice(service) {
        if (this.data.cardPrices && this.data.cardPrices[service]) return this.data.cardPrices[service];
        return 100; // Default fallback
    }

    updatePrice(service, price) {
        if (!this.data.cardPrices) this.data.cardPrices = {};
        this.data.cardPrices[service] = parseInt(price);
        this.save();
    }

    getServices() {
        const fromPrices = Object.keys(this.data.cardPrices || {});
        const fromStock = Object.keys(this.data.cards || {});
        const fromNames = Object.keys(this.data.serviceNames || {});

        // Merge all known service IDs
        const allIds = [...new Set([...fromPrices, ...fromStock, ...fromNames])];

        // Filter out empty or invalid IDs just in case
        const validIds = allIds.filter(id => id && typeof id === 'string' && id.length > 0);

        return validIds.map(sid => {
            const stock = (this.data.cards && this.data.cards[sid]) ? this.data.cards[sid].length : 0;
            const price = (this.data.cardPrices && this.data.cardPrices[sid]) ? this.data.cardPrices[sid] : 100;
            const name = (this.data.serviceNames && this.data.serviceNames[sid]) ? this.data.serviceNames[sid] : sid.toUpperCase();

            return { id: sid, name: name, price: price, stock: stock };
        });
    }

    // Service Management


    createService(id, name, price, section = 'all') {
        if (!this.data.cards) this.data.cards = {};
        if (!this.data.serviceNames) this.data.serviceNames = {};
        if (!this.data.cardPrices) this.data.cardPrices = {};
        if (!this.data.serviceSections) this.data.serviceSections = {};

        if (!this.data.cards[id]) this.data.cards[id] = [];
        this.data.serviceNames[id] = name;
        this.data.cardPrices[id] = parseInt(price);
        this.data.serviceSections[id] = section;
        this.save();
    }

    deleteService(id) {
        if (this.data.cards && this.data.cards[id]) delete this.data.cards[id];
        if (this.data.serviceNames && this.data.serviceNames[id]) delete this.data.serviceNames[id];
        if (this.data.cardPrices && this.data.cardPrices[id]) delete this.data.cardPrices[id];
        if (this.data.serviceSections && this.data.serviceSections[id]) delete this.data.serviceSections[id];
        if (this.data.vpnPrices && this.data.vpnPrices[id]) delete this.data.vpnPrices[id];
        if (this.data.vpnAccounts && this.data.vpnAccounts[id]) delete this.data.vpnAccounts[id];
        if (this.data.vpnServiceNames && this.data.vpnServiceNames[id]) delete this.data.vpnServiceNames[id];
        if (this.data.services && this.data.services[id]) delete this.data.services[id];
        if (this.data.shopItems && this.data.shopItems[id]) delete this.data.shopItems[id];
        if (this.data.serviceItems && this.data.serviceItems[id]) delete this.data.serviceItems[id];
        if (this.data.serviceIcons && this.data.serviceIcons[id]) delete this.data.serviceIcons[id];
        if (this.data.serviceDescriptions && this.data.serviceDescriptions[id]) delete this.data.serviceDescriptions[id];
        if (this.data.premiumAccounts) {
            this.data.premiumAccounts = this.data.premiumAccounts.filter(a => a.type !== id);
        }
        if (this.data.settings && this.data.settings.costs && this.data.settings.costs[id]) {
            delete this.data.settings.costs[id];
        }
        this.save();
        return true;
    }

    getServiceSection(id) {
        return this.data.serviceSections?.[id] || 'all';
    }

    updateServiceSection(id, section) {
        if (!this.data.serviceSections) this.data.serviceSections = {};
        this.data.serviceSections[id] = section;
        this.save();
    }

    getServicesBySection(section) {
        const allServices = this.getServices();
        if (section === 'all') return allServices;
        return allServices.filter(s => this.getServiceSection(s.id) === section);
    }

    // ==================== SERVICE CATEGORIES & ITEMS (NEW SYSTEM) ====================

    getServiceCategories() {
        return this.data.serviceCategories || [];
    }

    createServiceCategory(categoryData) {
        if (!this.data.serviceCategories) this.data.serviceCategories = [];
        const newCategory = {
            id: categoryData.id || 'cat_' + Date.now(),
            name: categoryData.name || 'New Category',
            description: categoryData.description || '',
            icon: categoryData.icon || 'fa-box',
            color: categoryData.color || 'from-blue-500 to-purple-600',
            type: categoryData.type || 'card',
            order: categoryData.order || this.data.serviceCategories.length + 1
        };
        this.data.serviceCategories.push(newCategory);
        this.save();
        return newCategory;
    }

    updateServiceCategory(categoryId, updates) {
        if (!this.data.serviceCategories) return null;
        const index = this.data.serviceCategories.findIndex(c => c.id === categoryId);
        if (index === -1) return null;
        this.data.serviceCategories[index] = { ...this.data.serviceCategories[index], ...updates };
        this.save();
        return this.data.serviceCategories[index];
    }

    deleteServiceCategory(categoryId) {
        if (!this.data.serviceCategories) return false;
        const index = this.data.serviceCategories.findIndex(c => c.id === categoryId);
        if (index === -1) return false;
        this.data.serviceCategories.splice(index, 1);

        // Also delete all items in this category
        if (this.data.serviceItems) {
            Object.keys(this.data.serviceItems).forEach(itemId => {
                if (this.data.serviceItems[itemId].categoryId === categoryId) {
                    this.deleteService(itemId);
                }
            });
        }

        this.save();
        return true;
    }

    getServiceItems(categoryId = null) {
        const items = this.data.serviceItems || {};
        if (categoryId) {
            const filtered = {};
            Object.keys(items).forEach(key => {
                if (items[key].categoryId === categoryId) {
                    filtered[key] = items[key];
                }
            });
            return filtered;
        }
        return items;
    }

    createServiceItem(itemId, itemData) {
        if (!this.data.serviceItems) this.data.serviceItems = {};
        if (!this.data.cards) this.data.cards = {};
        if (!this.data.vpnAccounts) this.data.vpnAccounts = {};

        this.data.serviceItems[itemId] = {
            categoryId: itemData.categoryId,
            type: itemData.type || 'apikey',
            name: itemData.name || itemId,
            icon: itemData.icon || 'fa-key',
            color: itemData.color || 'from-blue-500 to-purple-600',
            price: itemData.price || 100
        };

        // Initialize stock storage based on type
        if (itemData.type === 'card' || itemData.type === 'apikey') {
            if (!this.data.cards[itemId]) this.data.cards[itemId] = [];
        } else if (itemData.type === 'account' || itemData.categoryId === 'vpn') {
            if (!this.data.vpnAccounts[itemId]) this.data.vpnAccounts[itemId] = [];
        }

        this.save();
        return this.data.serviceItems[itemId];
    }

    updateServiceItem(itemId, updates) {
        if (!this.data.serviceItems || !this.data.serviceItems[itemId]) return null;
        this.data.serviceItems[itemId] = { ...this.data.serviceItems[itemId], ...updates };
        this.save();
        return this.data.serviceItems[itemId];
    }

    deleteServiceItem(itemId) {
        if (!this.data.serviceItems || !this.data.serviceItems[itemId]) return false;
        delete this.data.serviceItems[itemId];
        // Also delete stock
        if (this.data.cards && this.data.cards[itemId]) delete this.data.cards[itemId];
        if (this.data.vpnAccounts && this.data.vpnAccounts[itemId]) delete this.data.vpnAccounts[itemId];
        this.save();
        return true;
    }

    getServiceItemStock(itemId) {
        const item = this.data.serviceItems?.[itemId];
        if (!item) return 0;

        if (item.type === 'card' || item.type === 'apikey') {
            return this.data.cards?.[itemId]?.length || 0;
        } else if (item.type === 'account' || item.categoryId === 'vpn') {
            return this.data.vpnAccounts?.[itemId]?.length || 0;
        }
        return 0;
    }

    // ==================== TRANSACTION HISTORY ====================

    addTransaction(userId, type, amount, currency, title, icon = 'circle') {
        if (!this.data.transactions) this.data.transactions = [];

        const transaction = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            user_id: userId.toString(),
            type: type, // 'deposit', 'withdraw', 'service', 'exchange', 'bonus'
            amount: amount,
            currency: currency, // 'Tokens', 'Gems', 'USD'
            title: title,
            icon: icon,
            timestamp: Date.now()
        };

        this.data.transactions.unshift(transaction); // Add to beginning

        // DO NOT auto-add to user history here - causes duplicates
        // History should be added manually in each function for proper control

        // Limit history size per user or globally to prevent bloat (keep last 1000 globally)
        if (this.data.transactions.length > 1000) {
            this.data.transactions = this.data.transactions.slice(0, 1000);
        }

        this.save();
        return transaction;
    }

    // ==================== SMS GATEWAYS (PROVIDERS) ====================

    getSmsGateways() {
        if (!this.data.smsGateways) this.data.smsGateways = {};
        return this.data.smsGateways;
    }

    saveSmsGateway(id, config) {
        if (!this.data.smsGateways) this.data.smsGateways = {};
        this.data.smsGateways[id] = config;
        this.save();
    }

    deleteSmsGateway(id) {
        if (this.data.smsGateways && this.data.smsGateways[id]) {
            delete this.data.smsGateways[id];
            this.save();
            return true;
        }
        return false;
    }

    // ==================== EMAIL GATEWAYS (PROVIDERS) ====================

    getEmailGateways() {
        if (!this.data.emailGateways) this.data.emailGateways = {};
        return this.data.emailGateways;
    }

    saveEmailGateway(id, config) {
        if (!this.data.emailGateways) this.data.emailGateways = {};
        this.data.emailGateways[id] = config;
        this.save();
    }

    deleteEmailGateway(id) {
        if (this.data.emailGateways && this.data.emailGateways[id]) {
            delete this.data.emailGateways[id];
            this.save();
            return true;
        }
        return false;
    }

    // ==================== ACTIVE ORDERS (NUMBERS) ====================

    getActiveOrders() {
        if (!this.data.activeOrders) this.data.activeOrders = {};
        return this.data.activeOrders;
    }

    saveActiveOrder(order) {
        if (!this.data.activeOrders) this.data.activeOrders = {};
        this.data.activeOrders[order.id] = order;
        this.save();
    }

    updateActiveOrder(id, updates) {
        if (!this.data.activeOrders) this.data.activeOrders = {};
        if (this.data.activeOrders[id]) {
            this.data.activeOrders[id] = { ...this.data.activeOrders[id], ...updates };
            this.save();
            return true;
        }
        return false;
    }

    // Scheduled Broadcasts
    getScheduledBroadcasts() {
        if (!this.data.scheduledBroadcasts) this.data.scheduledBroadcasts = [];
        return this.data.scheduledBroadcasts;
    }

    addScheduledBroadcast(broadcast) {
        if (!this.data.scheduledBroadcasts) this.data.scheduledBroadcasts = [];
        broadcast.id = Date.now().toString();
        this.data.scheduledBroadcasts.push(broadcast);
        this.save();
        return broadcast.id;
    }

    removeScheduledBroadcast(id) {
        if (!this.data.scheduledBroadcasts) return false;
        const index = this.data.scheduledBroadcasts.findIndex(b => b.id === id);
        if (index !== -1) {
            this.data.scheduledBroadcasts.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    // ==================== SUPPORT TICKETS ====================

    createTicket(userId, subject, message) {
        if (!this.data.tickets) this.data.tickets = [];

        const ticket = {
            id: `TICKET-${Date.now()}`,
            userId: userId,
            subject: subject,
            message: message,
            status: 'open', // open, replied, closed
            createdAt: Date.now(),
            replies: []
        };

        this.data.tickets.push(ticket);
        this.save();
        return ticket.id;
    }

    getTickets(userId = null) {
        if (!this.data.tickets) this.data.tickets = [];
        if (userId) {
            return this.data.tickets.filter(t => t.userId === userId);
        }
        return this.data.tickets;
    }

    getTicket(ticketId) {
        if (!this.data.tickets) return null;
        return this.data.tickets.find(t => t.id === ticketId);
    }

    replyToTicket(ticketId, message, isAdmin = false) {
        const ticket = this.getTicket(ticketId);
        if (!ticket) return false;

        ticket.replies.push({
            message: message,
            timestamp: Date.now(),
            isAdmin: isAdmin
        });

        ticket.status = isAdmin ? 'replied' : 'open';
        this.save();
        return true;
    }

    closeTicket(ticketId) {
        const ticket = this.getTicket(ticketId);
        if (!ticket) return false;

        ticket.status = 'closed';
        this.save();
        return true;
    }

    // ==================== PAYMENT SYSTEM ====================

    createPayment(userId, amount, method, trxId = null) {
        if (!this.data.payments) this.data.payments = [];

        const payment = {
            id: `PAY-${Date.now()}`,
            userId: userId,
            amount: amount,
            method: method, // crypto, bkash, nagad, etc.
            status: 'pending', // pending, confirmed, rejected
            createdAt: Date.now(),
            trxId: trxId
        };

        this.data.payments.push(payment);
        this.save();
        return payment;
    }

    // ==================== EMAIL SERVICES SYSTEM ====================

    getEmailServices() {
        if (!this.data.emailServices) this.data.emailServices = {};
        return this.data.emailServices; // { "gemini": { name: "Gemini AI", price: 10, stock: [] } }
    }

    createEmailService(id, name, price) {
        if (!this.data.emailServices) this.data.emailServices = {};
        if (!this.data.emailServices[id]) {
            this.data.emailServices[id] = {
                name: name,
                price: parseInt(price),
                stock: []
            };
            this.save();
            return true;
        }
        return false;
    }

    deleteEmailService(id) {
        if (this.data.emailServices && this.data.emailServices[id]) {
            delete this.data.emailServices[id];
            this.save();
            return true;
        }
        return false;
    }

    addEmailStock(serviceId, emails) {
        // emails = [{ email, password }]
        if (!this.data.emailServices) this.data.emailServices = {};
        if (!this.data.emailServices[serviceId]) return false;

        this.data.emailServices[serviceId].stock.push(...emails);
        this.save();
        return true;
    }

    getAvailableEmailForUser(userId, serviceId) {
        const user = this.getUser(userId); // Ensure user object exists (though passed logic usually handles it)

        // 1. Check OAuth Pool (Priority)
        if (this.data.gmails) {
            // Find an OAuth email assigned to this SERVICE, which is NOT assigned to ANY USER yet.
            const oauthEmail = this.data.gmails.find(g =>
                g.oauth === true &&
                g.service === serviceId &&
                !g.assignedTo
            );

            if (oauthEmail) {
                // Initialize user.usedEmails if needed
                if (!user.usedEmails) user.usedEmails = [];
                user.usedEmails.push(oauthEmail.email);

                oauthEmail.assignedTo = userId;
                oauthEmail.assignedAt = Date.now();
                this.save();

                // Return compatible object
                return {
                    email: oauthEmail.email,
                    password: 'OAuth-Secured', // No password shown
                    oauth: true,
                    refreshToken: oauthEmail.refreshToken,
                    source: 'oauth'
                };
            }
        }

        // 2. Check Legacy Stock (service.stock)
        if (!this.data.emailServices || !this.data.emailServices[serviceId]) return null;

        const service = this.data.emailServices[serviceId];
        const usedEmails = user.usedEmails || [];

        // Find first email in stock that hasn't been used by this user
        let selectedIndex = -1;

        for (let i = 0; i < service.stock.length; i++) {
            if (!usedEmails.includes(service.stock[i].email)) {
                selectedIndex = i;
                break;
            }
        }

        if (selectedIndex === -1) return null;

        // Extract the email
        const emailObj = service.stock.splice(selectedIndex, 1)[0];

        // Add to global gmails list implementation
        this.addGmail(emailObj.email, emailObj.password);
        const saved = this.getGmail(emailObj.email);
        if (saved) {
            saved.assignedTo = userId;
            // saved.service = serviceId; // Optional tracking
            saved.source = 'start_stock';
            this.save();
        }

        // Update user used list
        if (!user.usedEmails) user.usedEmails = [];
        user.usedEmails.push(emailObj.email);
        this.updateUser(user);

        return saved; // Return the full object
    }


    getPayments(userId = null) {
        if (!this.data.payments) this.data.payments = [];
        if (userId) {
            return this.data.payments.filter(p => p.userId === userId);
        }
        return this.data.payments;
    }

    getPayment(paymentId) {
        if (!this.data.payments) return null;
        return this.data.payments.find(p => p.id === paymentId);
    }

    confirmPayment(paymentId, txnId = null) {
        const payment = this.getPayment(paymentId);
        if (!payment || payment.status !== 'pending') return false;

        payment.status = 'confirmed';
        payment.confirmedAt = Date.now();
        if (txnId) payment.txnId = txnId;

        // Add balance to user
        this.addCredit(payment.userId, payment.amount);
        this.save();
        return true;
    }

    rejectPayment(paymentId) {
        const payment = this.getPayment(paymentId);
        if (!payment || payment.status !== 'pending') return false;

        payment.status = 'rejected';
        this.save();
        return true;
    }

    // Undo payment (admin can reverse decision)
    undoPayment(paymentId) {
        const payment = this.getPayment(paymentId);
        if (!payment) return false;

        // If was confirmed, remove credits
        if (payment.status === 'confirmed') {
            this.addCredit(payment.userId, -payment.amount);
        }

        payment.status = 'pending';
        payment.confirmedAt = null;
        this.save();
        return true;
    }

    // ==================== ADMIN SETTINGS ====================

    getSupportCost() {
        if (!this.data.adminSettings) {
            this.data.adminSettings = { supportCost: 10, creditRates: { crypto: 0.01, bkash: 1, nagad: 1 } };
        }
        return this.data.adminSettings.supportCost || 10;
    }

    setSupportCost(cost) {
        if (!this.data.adminSettings) {
            this.data.adminSettings = { supportCost: 10, creditRates: { crypto: 0.01, bkash: 1, nagad: 1 } };
        }
        this.data.adminSettings.supportCost = cost;
        this.save();
    }

    getCreditRate(method) {
        if (!this.data.adminSettings || !this.data.adminSettings.creditRates) {
            this.data.adminSettings = { supportCost: 10, creditRates: { crypto: 0.01, bkash: 1, nagad: 1 } };
        }
        return this.data.adminSettings.creditRates[method] || 1;
    }

    setCreditRate(method, rate) {
        if (!this.data.adminSettings) {
            this.data.adminSettings = { supportCost: 10, creditRates: { crypto: 0.01, bkash: 1, nagad: 1 } };
        }
        if (!this.data.adminSettings.creditRates) {
            this.data.adminSettings.creditRates = {};
        }
        this.data.adminSettings.creditRates[method] = rate;
        this.save();
    }

    // ==================== BACKUP & RESTORE ====================

    createBackup(isAuto = false) {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }

        // Clean old AUTO backups if isAuto is true
        if (isAuto) {
            try {
                const files = fs.readdirSync(backupDir).filter(f => f.startsWith('auto_backup_'));
                // Sort by time, newest first
                files.sort((a, b) => {
                    return fs.statSync(path.join(backupDir, b)).mtime.getTime() -
                        fs.statSync(path.join(backupDir, a)).mtime.getTime();
                });

                // Keep latest 1, delete rest
                if (files.length >= 1) {
                    files.slice(0).forEach(f => fs.unlinkSync(path.join(backupDir, f))); // Delete ALL old ones first, or keep 1? User said "old backup auto delete", implies only keeping the new one.
                    // Let's keep the logic simple: Delete ALL previous auto_backups before creating new one.
                    // Or maybe safer: create new one, then delete old ones.
                }
            } catch (e) {
                console.error("Error cleaning old backups:", e);
            }
        }

        const prefix = isAuto ? 'auto_backup_' : 'backup_';
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const backupFile = path.join(backupDir, `${prefix}${timestamp}.json`);

        // Create backup with all data
        fs.writeFileSync(backupFile, JSON.stringify(this.data, null, 2));

        // Cleanup old files logic (Post-creation cleanup to be safe)
        if (isAuto) {
            try {
                const files = fs.readdirSync(backupDir).filter(f => f.startsWith('auto_backup_') && f !== path.basename(backupFile));
                files.forEach(f => fs.unlinkSync(path.join(backupDir, f)));
            } catch (e) { }
        }

        return backupFile;
    }

    getBackupsList() {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            return [];
        }

        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(backupDir, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    path: filePath,
                    size: stats.size,
                    created: stats.mtime
                };
            })
            .sort((a, b) => b.created - a.created);

        return files;
    }

    restoreBackup(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                return { success: false, msg: 'Backup file not found' };
            }

            const data = fs.readFileSync(backupPath, 'utf8');
            const parsed = JSON.parse(data);

            // Basic Validation
            if (!parsed.users || !parsed.settings) {
                return { success: false, msg: 'Invalid backup file structure' };
            }

            // Restore with MERGE (Keep new structures if missing in backup)
            // 1. Restore Users completely (Users data is critical)
            this.data.users = parsed.users;

            // 2. Restore Settings but merge with default settings to keep new features
            // If backup doesn't have 'groupRules', use existing/default ones.
            this.data.settings = { ...this.data.settings, ...parsed.settings };

            // Ensure groupRules exist even if backup didn't have them
            if (!this.data.settings.groupRules) {
                this.data.settings.groupRules = {
                    welcome: true, cleanService: true, allowLinks: false,
                    allowPhotos: true, allowFiles: true, allowVoice: true,
                    allowForward: true, blockEmails: true, blockCC: true
                };
            }

            // 3. Restore VPN and Cards independently if they exist, or keep defaults
            if (parsed.cards) this.data.cards = parsed.cards;
            if (parsed.cardPrices) this.data.cardPrices = parsed.cardPrices;

            if (parsed.vpnAccounts) this.data.vpnAccounts = parsed.vpnAccounts;
            else if (!this.data.vpnAccounts) this.data.vpnAccounts = defaultData.vpnAccounts; // Init if missing

            if (parsed.vpnPrices) this.data.vpnPrices = parsed.vpnPrices;
            else if (!this.data.vpnPrices) this.data.vpnPrices = defaultData.vpnPrices; // Init if missing

            if (parsed.vpnServiceNames) this.data.vpnServiceNames = parsed.vpnServiceNames;
            else if (!this.data.vpnServiceNames) this.data.vpnServiceNames = defaultData.vpnServiceNames; // Init if missing


            this.save();
            return { success: true };
        } catch (error) {
            console.error(error);
            return { success: false, msg: 'Restore failed: ' + error.message };
        }
    }

    // === NEW: DYNAMIC PAYMENT METHODS ===
    // Get full settings including paymentMethods


    // Add or Update Payment Method
    addPaymentMethod(key, details) {
        this.getSettings(); // Ensure initialized
        this.data.settings.paymentMethods[key] = details;
        this.save();
    }

    // Delete Payment Method
    deletePaymentMethod(key) {
        this.getSettings(); // Ensure initialized
        if (this.data.settings.paymentMethods[key]) {
            delete this.data.settings.paymentMethods[key];
            this.save();
            return true;
        }
        return false;
    }


    // ==================== GROUP CONTROLLER SYSTEM ====================

    getGroupSettings() {
        if (!this.data.adminSettings) this.data.adminSettings = {};
        if (!this.data.adminSettings.groupManagement) {
            this.data.adminSettings.groupManagement = {
                autoDeleteSystemMessages: true,
                deleteJoinMessages: true,
                deleteLeaveMessages: true,
                deletePinMessages: false,
                welcomeMessage: true,
                welcomeMessageText: "👋 Welcome {name} to {title}!",
                deleteTitleChanged: false,
                deleteGroupPhotoChanged: false
            };
            this.save();
        } else {
            let modified = false;
            if (this.data.adminSettings.groupManagement.welcomeMessage === undefined) {
                this.data.adminSettings.groupManagement.welcomeMessage = true;
                modified = true;
            }
            if (!this.data.adminSettings.groupManagement.welcomeMessageText) {
                this.data.adminSettings.groupManagement.welcomeMessageText = "👋 Welcome {name} to {title}!";
                modified = true;
            }
            if (modified) this.save();
        }
        return this.data.adminSettings.groupManagement;
    }

    toggleGroupSetting(key) {
        const rules = this.getGroupSettings();
        if (rules.hasOwnProperty(key)) {
            rules[key] = !rules[key];
            this.save();
            return rules[key];
        }
        return null;
    }

    // Warning System for Links
    addWarning(chatId, userId) {
        if (!this.data.groupWarnings) this.data.groupWarnings = {};
        const key = `${chatId}_${userId}`;

        if (!this.data.groupWarnings[key]) this.data.groupWarnings[key] = 0;
        this.data.groupWarnings[key]++;

        this.save();
        return this.data.groupWarnings[key];
    }

    resetWarnings(chatId, userId) {
        if (!this.data.groupWarnings) return;
        const key = `${chatId}_${userId}`;
        delete this.data.groupWarnings[key];
        this.save();
    }

    // ==================== PREMIUM APPS ====================

    getPremiumApps() {
        if (!this.data.settings.premiumApps) {
            this.data.settings.premiumApps = {}; // { id: { name, link, addedAt } }
            this.save();
        }
        return this.data.settings.premiumApps;
    }

    addPremiumApp(id, name, link, price = 0) {
        this.getPremiumApps(); // Ensure init
        this.data.settings.premiumApps[id] = {
            id: id,
            name: name,
            link: link,
            price: parseInt(price),
            addedAt: Date.now()
        };
        this.save();
    }

    deletePremiumApp(id) {
        this.getPremiumApps();
        if (this.data.settings.premiumApps[id]) {
            delete this.data.settings.premiumApps[id];
            this.save();
            return true;
        }
        return false;
    }

    // ==================== PROMO CODE SYSTEM ====================

    createCode(code, amount, uses) {
        this.getSettings();
        if (!this.data.settings.codes) this.data.settings.codes = {};

        this.data.settings.codes[code] = {
            amount: amount,
            maxUses: uses,
            uses: 0,
            createdAt: Date.now(),
            redeemedBy: []
        };
        this.save();
    }

    deleteCode(code) {
        this.getSettings();
        if (this.data.settings.codes && this.data.settings.codes[code]) {
            delete this.data.settings.codes[code];
            this.save();
            return true;
        }
        return false;
    }

    redeemCode(userId, code) {
        this.getSettings();
        if (!this.data.settings.codes) return { success: false, msg: 'Invalid Code' };

        const promo = this.data.settings.codes[code];

        if (!promo) {
            return { success: false, msg: '❌ This promo code does not exist or has expired.' };
        }

        // Check if max uses exceeded (maxUses: 0 means unlimited)
        if (promo.maxUses > 0 && promo.uses >= promo.maxUses) {
            // Auto-delete exhausted code
            delete this.data.settings.codes[code];
            this.save();
            return { success: false, msg: '❌ This promo code has expired and is no longer available.' };
        }

        if (!promo.redeemedBy) promo.redeemedBy = [];
        if (promo.redeemedBy.includes(userId)) {
            return { success: false, msg: 'You have already redeemed this code!' };
        }

        promo.uses++;
        promo.redeemedBy.push(userId);

        // Auto-delete code if uses reached maxUses
        if (promo.maxUses > 0 && promo.uses >= promo.maxUses) {
            delete this.data.settings.codes[code];
            console.log(`[DB] Promo code ${code} auto-deleted (uses exhausted)`);
        }

        // Add Balance
        const newBalance = this.addCredit(userId, promo.amount);
        this.save();
        return { success: true, amount: promo.amount, msg: 'Redeemed Successfully' };
    }

    // ==================== VPN ACCOUNT SYSTEM (Card System Clone) ====================

    // Add VPN Account
    addVPN(service, vpnData) {
        if (!this.data.vpnAccounts) this.data.vpnAccounts = {};
        if (!this.data.vpnAccounts[service]) this.data.vpnAccounts[service] = [];

        this.data.vpnAccounts[service].push({
            email: vpnData.email,
            password: vpnData.password,
            addedAt: Date.now()
        });
        this.save();
    }

    // Get VPN Account (for purchase)
    getVPN(service) {
        if (!this.data.vpnAccounts || !this.data.vpnAccounts[service]) return null;
        if (this.data.vpnAccounts[service].length === 0) return null;

        // Remove and return first account
        const account = this.data.vpnAccounts[service].shift();

        // Check if stock is now empty - auto delete service and promo codes
        if (this.data.vpnAccounts[service].length === 0) {
            console.log(`[DB] VPN stock depleted for service: ${service}. Auto-deleting service and promo codes...`);

            // Delete associated promo codes
            if (this.data.settings && this.data.settings.codes) {
                const codesToDelete = Object.keys(this.data.settings.codes).filter(code => {
                    return code.toLowerCase().includes(service.toLowerCase());
                });

                codesToDelete.forEach(code => {
                    delete this.data.settings.codes[code];
                    console.log(`[DB] Deleted promo code: ${code}`);
                });
            }

            // Delete the VPN service completely
            this.deleteVPNService(service);
            console.log(`[DB] VPN Service ${service} auto-deleted due to zero stock`);
        }

        this.save();
        return account;
    }

    // Get VPN Stock Counts
    getVPNCounts() {
        const counts = {};
        const services = Object.keys(this.data.vpnAccounts || {});
        services.forEach(s => {
            counts[s] = this.data.vpnAccounts[s].length;
        });
        return counts;
    }

    // Clear VPN Stock
    clearVPNAccounts(service) {
        if (this.data.vpnAccounts && this.data.vpnAccounts[service]) {
            this.data.vpnAccounts[service] = [];
            this.save();
            return true;
        }
        return false;
    }

    // Get VPN Price
    getVPNPrice(service) {
        if (this.data.vpnPrices && this.data.vpnPrices[service]) return this.data.vpnPrices[service];
        return 100; // Default fallback
    }

    // Update VPN Price
    updateVPNPrice(service, price) {
        if (!this.data.vpnPrices) this.data.vpnPrices = {};
        this.data.vpnPrices[service] = parseInt(price);
        this.save();
    }

    // Set VPN Price (alias for updateVPNPrice)
    setVPNPrice(service, price) {
        this.updateVPNPrice(service, price);
    }

    // Get all VPN Services (Returns array like getServices())
    getVPNServices() {
        const fromPrices = Object.keys(this.data.vpnPrices || {});
        const fromStock = Object.keys(this.data.vpnAccounts || {});
        const fromNames = Object.keys(this.data.vpnServiceNames || {});

        // Merge all known service IDs
        const allIds = [...new Set([...fromPrices, ...fromStock, ...fromNames])];

        // Filter out empty or invalid IDs
        const validIds = allIds.filter(id => id && typeof id === 'string' && id.length > 0);

        return validIds.map(sid => {
            const stock = (this.data.vpnAccounts && this.data.vpnAccounts[sid]) ? this.data.vpnAccounts[sid].length : 0;
            const price = (this.data.vpnPrices && this.data.vpnPrices[sid]) ? this.data.vpnPrices[sid] : 100;
            const name = (this.data.vpnServiceNames && this.data.vpnServiceNames[sid]) ? this.data.vpnServiceNames[sid] : sid.toUpperCase();

            return { id: sid, name: name, price: price, stock: stock };
        });
    }

    // Create VPN Service
    createVPNService(id, name, price) {
        if (!this.data.vpnAccounts) this.data.vpnAccounts = {};
        if (!this.data.vpnServiceNames) this.data.vpnServiceNames = {};
        if (!this.data.vpnPrices) this.data.vpnPrices = {};

        if (!this.data.vpnAccounts[id]) this.data.vpnAccounts[id] = [];
        this.data.vpnServiceNames[id] = name;
        this.data.vpnPrices[id] = parseInt(price);
        this.save();
    }

    // Delete VPN Service
    deleteVPNService(id) {
        if (this.data.vpnAccounts && this.data.vpnAccounts[id]) delete this.data.vpnAccounts[id];
        if (this.data.vpnServiceNames && this.data.vpnServiceNames[id]) delete this.data.vpnServiceNames[id];
        if (this.data.vpnPrices && this.data.vpnPrices[id]) delete this.data.vpnPrices[id];
        this.save();
    }

    // Update VPN Service Name
    updateVPNName(id, name) {
        if (!this.data.vpnServiceNames) this.data.vpnServiceNames = {};
        this.data.vpnServiceNames[id] = name;
        this.save();
    }

    // Get VPN Service by ID
    getVPNService(id) {
        const services = this.getVPNServices();
        return services.find(s => s.id === id) || null;
    }

    // ==================== FEATURE FLAGS / BUTTON MANAGEMENT ====================

    getFeatureFlags() {
        if (!this.data.featureFlags) {
            // Initialize with defaults if not exists
            this.data.featureFlags = {
                admin_manage_user: true,
                admin_manage_cards: true,
                admin_manage_apps: true,
                admin_manage_vpn: true,
                admin_manage_codes: true,
                admin_manage_tasks: true,
                admin_manage_costs: true,
                admin_payments: true,
                admin_backup: true,
                admin_settings: true,
                admin_stats: true,
                admin_broadcast: true,
                admin_upload_file: true,
                admin_group_controller: true,
                buy_cards: true,
                buy_vpn: true,
                buy_premium_app: true,
                verification: true,
                support: true,
                referral: true,
                daily_bonus: true,
                tasks: true,
                transfer: true,
                redeem_code: true
            };
            this.save();
        }
        return this.data.featureFlags;
    }

    isFeatureEnabled(featureKey) {
        const flags = this.getFeatureFlags();
        return flags[featureKey] !== false; // Default to true if not set
    }

    toggleFeature(featureKey) {
        const flags = this.getFeatureFlags();
        if (flags.hasOwnProperty(featureKey)) {
            flags[featureKey] = !flags[featureKey];
            this.save();
            return flags[featureKey];
        }
        return null;
    }

    setFeatureState(featureKey, state) {
        const flags = this.getFeatureFlags();
        flags[featureKey] = !!state;
        this.save();
        return flags[featureKey];
    }

    // ==================== WEB PANEL AUTHENTICATION ====================

    createWebLoginToken(userId) {
        if (!this.data.webTokens) this.data.webTokens = {};

        // Clean expired tokens first
        const now = Date.now();
        Object.keys(this.data.webTokens).forEach(t => {
            if (this.data.webTokens[t].expires < now) {
                delete this.data.webTokens[t];
            }
        });

        // Generate simple random token
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        this.data.webTokens[token] = {
            userId: userId,
            expires: now + 60 * 60 * 1000 // 1 hour validity
        };

        this.save();
        return token;
    }

    verifyWebLoginToken(token) {
        if (!this.data.webTokens || !this.data.webTokens[token]) return null;

        const info = this.data.webTokens[token];
        if (Date.now() > info.expires) {
            delete this.data.webTokens[token];
            this.save();
            return null;
        }

        return this.getUser(info.userId);
    }

    // ==================== BACKUP MANAGEMENT ====================

    deleteAllBackups() {
        const backupDir = path.join(__dirname, 'backups');

        if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(backupDir, file));
                } catch (e) {
                    console.error('Failed to delete backup file:', file, e);
                }
            }
        }
    }

    // ==================== APPS MANAGEMENT ====================
    getApps() {
        return this.data.apps || [];
    }

    createApp(name, price, description, type = 'account', content = '') {
        if (!this.data.apps) this.data.apps = [];
        const id = 'app_' + Date.now();
        const newApp = {
            id,
            name,
            price: parseInt(price),
            description,
            type, // 'account' or 'link'
            content, // URL if link
            stock: type === 'link' ? 9999 : 0,
            createdAt: new Date().toISOString()
        };
        this.data.apps.push(newApp);
        this.save();
        return newApp;
    }

    buyApp(userId, appId) {
        const user = this.getUser(userId);
        const app = (this.data.apps || []).find(a => a.id === appId);
        if (!app) return { success: false, error: 'App not found' };
        if (user.balance < app.price) return { success: false, error: 'Insufficient balance' };

        let deliveredContent = '';

        if (app.type === 'link') {
            deliveredContent = app.content;
        } else {
            if (!this.data.appStock || !this.data.appStock[appId] || this.data.appStock[appId].length === 0) {
                return { success: false, error: 'Out of stock' };
            }
            deliveredContent = this.data.appStock[appId].shift();
        }

        this.deductCredit(userId, app.price);
        if (!user.purchaseHistory) user.purchaseHistory = [];
        user.purchaseHistory.push({
            item: app.name,
            category: 'App',
            amount: app.price,
            date: new Date().toISOString(),
            details: deliveredContent,
            isLink: app.type === 'link'
        });

        this.save();
        return { success: true, content: deliveredContent, type: app.type };
    }

    // ==================== GEMS TOKEN SYSTEM ====================

    // ==================== ITEM SALES SYSTEM ====================

    getItemSales() {
        if (!this.data.itemSales) {
            this.data.itemSales = {};
            this.save();
        }
        return this.data.itemSales;
    }

    saveItemSale(saleData) {
        if (!this.data.itemSales) this.data.itemSales = {};
        this.data.itemSales[saleData.id] = saleData;
        this.save();
        return saleData;
    }

    deleteItemSale(saleId) {
        if (this.data.itemSales && this.data.itemSales[saleId]) {
            delete this.data.itemSales[saleId];
            this.save();
            return true;
        }
        return false;
    }

    updateItemSaleStatus(saleId, status, updates = {}) {
        if (!this.data.itemSales || !this.data.itemSales[saleId]) return false;

        const sale = this.data.itemSales[saleId];
        sale.status = status;
        sale.updatedAt = Date.now();

        // Apply any additional updates
        Object.keys(updates).forEach(key => {
            sale[key] = updates[key];
        });

        this.save();
        return sale;
    }

    // ==================== WELCOME CREDITS ====================

    getWelcomeCredits() {
        if (!this.data.adminSettings) {
            this.data.adminSettings = { welcomeCredits: 50 };
        }
        return this.data.adminSettings.welcomeCredits || 50;
    }

    setWelcomeCredits(amount) {
        if (!this.data.adminSettings) {
            this.data.adminSettings = {};
        }
        this.data.adminSettings.welcomeCredits = parseInt(amount);
        this.save();
        return { success: true, welcomeCredits: this.data.adminSettings.welcomeCredits };
    }

    // ==================== MONETAG AD SDK SETTINGS ====================

    getAdSdkSettings() {
        if (!this.data.adminSettings) {
            this.data.adminSettings = {};
        }
        return {
            enabled: this.data.adminSettings.adSdkEnabled || false,
            sdkUrl: this.data.adminSettings.adSdkUrl || '',
            zoneId: this.data.adminSettings.adZoneId || '',
            sdkKey: this.data.adminSettings.adSdkKey || '',
            rewardAmount: this.data.adminSettings.adRewardAmount || 5
        };
    }

    setAdSdkSettings(settings) {
        if (!this.data.adminSettings) {
            this.data.adminSettings = {};
        }

        this.data.adminSettings.adSdkEnabled = settings.enabled || false;
        this.data.adminSettings.adSdkUrl = settings.sdkUrl || '';
        this.data.adminSettings.adZoneId = settings.zoneId || '';
        this.data.adminSettings.adSdkKey = settings.sdkKey || '';
        this.data.adminSettings.adRewardAmount = parseInt(settings.rewardAmount) || 5;

        this.save();
        return {
            success: true,
            settings: this.getAdSdkSettings()
        };
    }

    // Parse SDK link and extract zone ID and SDK key
    parseSdkLink(sdkLink) {
        // Extract from: <script src='//libtl.com/sdk.js' data-zone='9716370' data-sdk='show_9716370'></script>
        const zoneMatch = sdkLink.match(/data-zone=['"](\d+)['"]/);
        const sdkMatch = sdkLink.match(/data-sdk=['"]([^'"]+)['"]/);

        return {
            zoneId: zoneMatch ? zoneMatch[1] : '',
            sdkKey: sdkMatch ? sdkMatch[1] : '',
            sdkUrl: '//libtl.com/sdk.js'
        };
    }

    // ==================== GMAIL SYSTEM ====================

    getGmails() {
        return this.data.gmails || [];
    }

    addOAuthGmail(email, refreshToken, serviceId) {
        if (!this.data.gmails) this.data.gmails = [];

        // Check if exists
        const existing = this.data.gmails.find(g => g.email === email);
        if (existing) {
            existing.refreshToken = refreshToken; // Update token
            existing.oauth = true;
            existing.provider = 'google';
            if (serviceId) existing.service = serviceId; // Auto-assign service
            this.save();
            return;
        }

        const newGmail = {
            email: email,
            password: 'OAUTH-TOKEN-SECURE', // Placeholder
            refreshToken: refreshToken,
            oauth: true,
            provider: 'google',
            service: serviceId || null, // Auto-assign service
            addedAt: Date.now(),
            stockAdded: true
        };

        this.data.gmails.push(newGmail);
        this.save();
    }

    addGmail(email, password) {
        if (!this.data.gmails) this.data.gmails = [];
        this.data.gmails.push({
            email,
            password,
            otp: null,
            assignedTo: null,
            date: new Date().toISOString()
        });
        this.save();
        return true;
    }

    // Modifying this to check balance first would be circular here.
    // Instead we just return available account, bot handles balance check.
    getAvailableGmail(userId) {
        if (!this.data.gmails) return null;
        // Find one not assigned
        const account = this.data.gmails.find(g => !g.assignedTo);
        if (account) {
            account.assignedTo = userId;
            account.date = new Date().toISOString();
            this.save();
        }
        return account;
    }

    getGmailCost() {
        return this.data.adminSettings.gmailCost || 50;
    }

    setGmailCost(amount) {
        if (!this.data.adminSettings) this.data.adminSettings = {};
        this.data.adminSettings.gmailCost = amount;
        this.save();
    }

    getGmail(email) {
        if (!this.data.gmails) return null;
        return this.data.gmails.find(g => g.email === email);
    }

    // Get last gmail assigned to user
    getUserLastGmail(userId) {
        if (!this.data.gmails) return null;
        // Find last one assigned to this user
        // We'll search simply for any assigned to this user. Ideally sort by date.
        const userGmails = this.data.gmails.filter(g => String(g.assignedTo) === String(userId));
        if (userGmails.length === 0) return null;
        return userGmails[userGmails.length - 1]; // Return last one
    }

    updateGmailOtp(email, otp) {
        const account = this.getGmail(email);
        if (account) {
            account.otp = otp;
            account.otpTime = Date.now();
            this.save();
            return true;
        }
        return false;
    }

    deleteGmail(email) {
        if (!this.data.gmails) return false;
        const initial = this.data.gmails.length;
        this.data.gmails = this.data.gmails.filter(g => g.email !== email);
        this.save();
        return this.data.gmails.length < initial;
    }

    // ==================== GENERIC PROVIDER MANAGER ====================
    getProviders(showSecrets = false) {
        if (!this.data.providers) return {};
        if (showSecrets) return this.data.providers; // Use carefully (e.g. for backup)

        // Return Masked for UI
        const masked = {};
        Object.entries(this.data.providers).forEach(([id, p]) => {
            masked[id] = {
                ...p,
                apiKey: (p.apiKey ? '✅ Secret Set' : '❌ Missing'), // Masked Indicator
                apiKeyStatus: (p.apiKey ? true : false)
            };
        });
        return masked;
    }

    getProviderDecrypted(providerId) {
        if (!this.data.providers || !this.data.providers[providerId]) return null;
        const p = this.data.providers[providerId];
        // Decrypt logic relying on global 'decrypt' function we added earlier
        const rawKey = p.apiKey ? decrypt(p.apiKey) : null;
        return { ...p, apiKey: rawKey };
    }

    saveProvider(id, config) {
        if (!this.data.providers) this.data.providers = {};

        // Handle Key Encryption
        // Logic: If apiKey is provided and looks like plaintext (no ':'), encrypt it.
        // If apiKey is undefined/null/empty strings, keep existing if ID exists.

        // Get existing to preserve key if not updating
        const existing = this.data.providers[id] || {};

        let finalKey = existing.apiKey;

        if (config.apiKey && config.apiKey.length > 0 && config.apiKey !== '***') {
            // New key provided
            finalKey = encrypt(config.apiKey);
        }

        this.data.providers[id] = {
            ...config,
            apiKey: finalKey,
            updatedAt: Date.now()
        };
        this.save();
        return id;
    }

    deleteProvider(id) {
        if (this.data.providers && this.data.providers[id]) {
            delete this.data.providers[id];
            this.save();
            return true;
        }
        return false;
    }

    // ==================== AUTO CLEANUP SYSTEM ====================
    cleanupOldHistory(days = 7) {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        let cleanedCount = 0;

        // 1. Clean User History (Purchase, etc.)
        Object.values(this.data.users).forEach(user => {
            // Purchase History
            if (user.purchaseHistory && user.purchaseHistory.length > 0) {
                const initial = user.purchaseHistory.length;
                user.purchaseHistory = user.purchaseHistory.filter(h => new Date(h.date).getTime() > cutoff);
                if (user.purchaseHistory.length < initial) cleanedCount++;
            }

            // Tasks Done (Optional: maybe keep tasks history longer? User said "history of what they buy/trade")
            // Not touching tasksDone for now as it tracks completion status.
        });

        // 2. Clean Global Payments
        if (this.data.payments) {
            const initial = this.data.payments.length;
            this.data.payments = this.data.payments.filter(p => p.createdAt > cutoff);
            if (this.data.payments.length < initial) cleanedCount++;
        }

        // 3. Clean Support Tickets (Closed ones older than 7 days)
        if (this.data.tickets) {
            this.data.tickets = this.data.tickets.filter(t => {
                return t.status !== 'closed' || t.createdAt > cutoff;
            });
        }

        if (cleanedCount > 0) {
            this.save();
            console.log(`[CLEANUP] Removed old history entries (> ${days} days)`);
        }
        return cleanedCount;
    }
    
    // ===== BAN CACHE METHODS =====
    isBanned(userId) {
        // Check in-memory cache first
        const cached = this._bannedCache.get(String(userId));
        if (cached !== undefined) {
            return cached; // Return cached value
        }
        
        // If cache is stale, refresh it
        const now = Date.now();
        if (now - this._banCacheTime > this._BAN_CACHE_TTL) {
            this._refreshBanCache();
        }
        
        // Check database
        const user = this.getUser(userId);
        const isBanned = user && (user.banned === true || user.blocked === true);
        
        // Cache the result
        this._bannedCache.set(String(userId), isBanned);
        return isBanned;
    }

    _refreshBanCache() {
        // Rebuild ban cache from current data
        this._bannedCache.clear();
        const users = this.data.users || {};
        for (const [userId, user] of Object.entries(users)) {
            if (user.banned === true || user.blocked === true) {
                this._bannedCache.set(userId, true);
            }
        }
        this._banCacheTime = Date.now();
        console.log(`[BAN CACHE] Refreshed - ${this._bannedCache.size} banned users cached`);
    }

    setBanned(userId, banned = true) {
        const user = this.getUser(userId);
        if (!user) return false;
        
        user.banned = banned;
        user.bannedAt = banned ? new Date().toISOString() : null;
        this.updateUser(user);
        
        // Invalidate cache
        this._bannedCache.set(String(userId), banned);
        this._banCacheTime = 0; // Mark cache as stale to force refresh
        this.save();
        
        console.log(`[BAN UPDATE] User ${userId} ban status set to: ${banned}`);
        return true;
    }

    getSystemVersion() {
        return this.data.settings?.systemVersion || this._systemVersion;
    }

    updateSystemVersion() {
        this._systemVersion = Date.now();
        if (!this.data.settings) this.data.settings = {};
        this.data.settings.systemVersion = this._systemVersion;
        return this._systemVersion;
    }
    
    // ===== REFERRAL LEADERBOARD SYSTEM =====
    getWeeklyReferrals() {
        if (!this.data.leaderboards) this.data.leaderboards = {};
        if (!this.data.leaderboards.weekly) {
            this.data.leaderboards.weekly = {
                week: Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)),
                referrers: {} // { userId -> count }
            };
        }
        return this.data.leaderboards.weekly;
    }
    
    getMonthlyReferrals() {
        if (!this.data.leaderboards) this.data.leaderboards = {};
        if (!this.data.leaderboards.monthly) {
            this.data.leaderboards.monthly = {
                month: Math.floor(Date.now() / (30 * 24 * 60 * 60 * 1000)),
                referrers: {} // { userId -> count }
            };
        }
        return this.data.leaderboards.monthly;
    }
    
    recordWeeklyReferral(referrerId) {
        const weekly = this.getWeeklyReferrals();
        const currentWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
        
        // Reset if week changed
        if (currentWeek !== weekly.week) {
            this.data.leaderboards.weekly = {
                week: currentWeek,
                referrers: {}
            };
        }
        
        // Increment count
        const weeklyBoard = this.data.leaderboards.weekly;
        weeklyBoard.referrers[String(referrerId)] = (weeklyBoard.referrers[String(referrerId)] || 0) + 1;
        this.save();
    }
    
    recordMonthlyReferral(referrerId) {
        const monthly = this.getMonthlyReferrals();
        const currentMonth = Math.floor(Date.now() / (30 * 24 * 60 * 60 * 1000));
        
        // Reset if month changed
        if (currentMonth !== monthly.month) {
            this.data.leaderboards.monthly = {
                month: currentMonth,
                referrers: {}
            };
        }
        
        // Increment count
        const monthlyBoard = this.data.leaderboards.monthly;
        monthlyBoard.referrers[String(referrerId)] = (monthlyBoard.referrers[String(referrerId)] || 0) + 1;
        this.save();
    }
    
    getWeeklyLeaderboard(limit = 10) {
        const weekly = this.getWeeklyReferrals();
        const sorted = Object.entries(weekly.referrers)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([userId, count], index) => ({
                rank: index + 1,
                userId,
                count,
                user: this.getUser(userId)
            }));
        return sorted;
    }
    
    getMonthlyLeaderboard(limit = 10) {
        const monthly = this.getMonthlyReferrals();
        const sorted = Object.entries(monthly.referrers)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([userId, count], index) => ({
                rank: index + 1,
                userId,
                count,
                user: this.getUser(userId)
            }));
        return sorted;
    }
    
    // Record referral reward distribution
    recordReferralReward(referrerId, referralUserId, amount, status = 'pending') {
        const user = this.getUser(referrerId);
        if (!user) return false;
        
        if (!user.referralRewards) user.referralRewards = [];
        user.referralRewards.unshift({
            date: Date.now(),
            referralUserId,
            amount,
            status, // pending, approved, distributed
            approvedAt: null,
            distributedAt: null
        });
        
        this.updateUser(user);
        this.save();
        return true;
    }
    
    approveReferralReward(referrerId, rewardIndex, adminId) {
        const user = this.getUser(referrerId);
        if (!user || !user.referralRewards || !user.referralRewards[rewardIndex]) return false;
        
        const reward = user.referralRewards[rewardIndex];
        reward.status = 'approved';
        reward.approvedAt = Date.now();
        reward.approvedBy = adminId;
        
        this.updateUser(user);
        this.save();
        return true;
    }
    
    distributeReferralRewards(referrerId) {
        const user = this.getUser(referrerId);
        if (!user || !user.referralRewards) return { distributed: 0, total: 0 };
        
        let distributed = 0;
        let total = 0;
        
        for (const reward of user.referralRewards) {
            if (reward.status === 'approved' && !reward.distributedAt) {
                // Add balance to user
                const currentBalance = this.getTokenBalance(user);
                this.setTokenBalance(user, currentBalance + reward.amount);
                
                // Add to history
                if (!user.history) user.history = [];
                user.history.unshift({
                    type: 'referral_reward_distributed',
                    amount: reward.amount,
                    currency: 'tokens',
                    date: Date.now(),
                    detail: `Referral reward for user #${reward.referralUserId} distributed`,
                    status: 'Distributed'
                });
                
                reward.status = 'distributed';
                reward.distributedAt = Date.now();
                distributed++;
            }
            total++;
        }
        
        if (distributed > 0) {
            this.updateUser(user);
            this.save();
        }
        
        return { distributed, total };
    }
}

const dbInstance = new Database();

process.on('SIGINT', () => {
    try { dbInstance.saveLocalBackup(); } catch (e) {}
    process.exit(0);
});

process.on('SIGTERM', () => {
    try { dbInstance.saveLocalBackup(); } catch (e) {}
    process.exit(0);
});

process.on('exit', () => {
    try { dbInstance.saveLocalBackup(); } catch (e) {}
});

module.exports = dbInstance;
