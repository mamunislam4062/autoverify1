const axios = require('axios');
const puppeteer = require('puppeteer');
const { extractOTP: robustExtractOTP } = require('./otp-extractor');
const db = require('../db');
const tempmailProviders = require('./tempmail-providers');

/**
 * UNIFIED AUTOMATION SERVICES
 * 
 * Sections:
 * 1. AI Services (OpenRouter, Bytez providers)
 * 2. Browser Automation (Puppeteer-based BrowserPool)
 * 3. Exports
 * 
 * Note: Gmail/Hotmail email generation is handled by tempmail-providers.js
 */

// ==========================================
// SECTION 1: AI SERVICE PROVIDERS
// ==========================================

// OpenRouter Configuration
const OPENROUTER_CONFIG = {
    BASE_URL: 'https://openrouter.ai/api/v1',
    MODELS: {
        imageGeneration: [
            { id: 'openai/dall-e-3', name: 'DALL-E 3', cost: 0.04 },
            { id: 'stability-ai/sdxl', name: 'Stable Diffusion XL', cost: 0.02 },
            { id: 'midjourney/midjourney', name: 'Midjourney', cost: 0.05 }
        ],
        videoGeneration: [
            { id: 'runway/gen-3', name: 'Runway Gen-3', cost: 0.15 },
            { id: 'luma/luma-dream-machine', name: 'Luma Dream Machine', cost: 0.10 }
        ],
        chat: [
            { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
            { id: 'openai/gpt-4o', name: 'GPT-4o' },
            { id: 'google/gemini-pro', name: 'Gemini Pro' }
        ]
    }
};

// Bytez Configuration
const BYTEZ_CONFIG = {
    BASE_URL: 'https://api.bytez.com/v1',
    MODELS: {
        imageGeneration: [
            { id: 'black-forest-labs/flux-pro', name: 'FLUX Pro', cost: 0.03 },
            { id: 'stability-ai/sdxl', name: 'Stable Diffusion XL', cost: 0.02 },
            { id: 'dalle-mini/dalle-mega', name: 'DALL-E Mini', cost: 0.01 }
        ],
        videoGeneration: [
            { id: 'pika/pika-2.0', name: 'Pika 2.0', cost: 0.12 },
            { id: 'luma/luma-dream-machine', name: 'Luma Dream Machine', cost: 0.10 },
            { id: 'stable-video/stable-video-diffusion', name: 'Stable Video', cost: 0.08 }
        ]
    }
};

// Helper to get API keys from DB or Env
function getApiKey(service) {
    if (db.data && db.data.apiKeys) {
        if (service === 'OPENROUTER' && db.data.apiKeys.openRouterKey) return db.data.apiKeys.openRouterKey;
        if (service === 'BYTEZ' && db.data.apiKeys.bytezKey) return db.data.apiKeys.bytezKey;
    }
    if (service === 'OPENROUTER') return process.env.OPENROUTER_API_KEY;
    if (service === 'BYTEZ') return process.env.BYTEZ_API_KEY;
    return null;
}

// OpenRouter Provider Functions
async function openRouterGenerateImage(prompt, model = 'openai/dall-e-3', size = '1024x1024') {
    const apiKey = getApiKey('OPENROUTER');
    if (!apiKey) throw new Error('OpenRouter API key not configured');

    try {
        const response = await axios.post(`${OPENROUTER_CONFIG.BASE_URL}/images/generations`, {
            model: model,
            prompt: prompt,
            n: 1,
            size: size
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.SITE_URL || 'https://your-site.com',
                'X-Title': 'Telegram Bot AI Services'
            }
        });

        return { success: true, data: response.data.data, model: model };
    } catch (error) {
        console.error('OpenRouter Image Generation Error:', error.message);
        throw error;
    }
}

async function openRouterGenerateVideo(prompt, model = 'runway/gen-3', duration = 5) {
    const apiKey = getApiKey('OPENROUTER');
    if (!apiKey) throw new Error('OpenRouter API key not configured');

    try {
        const response = await axios.post(`${OPENROUTER_CONFIG.BASE_URL}/videos/generations`, {
            model: model,
            prompt: prompt,
            duration: duration
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.SITE_URL || 'https://your-site.com',
                'X-Title': 'Telegram Bot AI Services'
            }
        });

        return { success: true, data: response.data.data, model: model };
    } catch (error) {
        console.error('OpenRouter Video Generation Error:', error.message);
        throw error;
    }
}

// Bytez Provider Functions
async function bytezGenerateImage(prompt, options = {}) {
    const apiKey = getApiKey('BYTEZ');
    if (!apiKey) throw new Error('Bytez API key not configured');

    try {
        const response = await axios.post(`${BYTEZ_CONFIG.BASE_URL}/jobs/create`, {
            model: options.model || 'black-forest-labs/flux-pro',
            input: {
                prompt: prompt,
                size: options.size || '1024x1024',
                style: options.style,
                negative_prompt: options.negativePrompt
            }
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return {
            job_id: response.data.job_id,
            status: response.data.status,
            estimated_time: response.data.estimated_time
        };
    } catch (error) {
        console.error('Bytez Image Generation Error:', error.message);
        throw error;
    }
}

async function bytezGenerateVideo(prompt, options = {}) {
    const apiKey = getApiKey('BYTEZ');
    if (!apiKey) throw new Error('Bytez API key not configured');

    try {
        const response = await axios.post(`${BYTEZ_CONFIG.BASE_URL}/jobs/create`, {
            model: options.model || 'pika/pika-2.0',
            input: {
                prompt: prompt,
                duration: options.duration || 5,
                fps: options.fps || 24,
                width: options.width || 1024,
                height: options.height || 576
            }
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return {
            job_id: response.data.job_id,
            status: response.data.status,
            estimated_time: response.data.estimated_time
        };
    } catch (error) {
        console.error('Bytez Video Generation Error:', error.message);
        throw error;
    }
}

async function bytezCheckJobStatus(jobId) {
    const apiKey = getApiKey('BYTEZ');
    if (!apiKey) throw new Error('Bytez API key not configured');

    try {
        const response = await axios.get(`${BYTEZ_CONFIG.BASE_URL}/jobs/${jobId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        return {
            job_id: response.data.job_id,
            status: response.data.status,
            progress: response.data.progress,
            url: response.data.output?.url
        };
    } catch (error) {
        console.error('Bytez Job Status Error:', error.message);
        throw error;
    }
}

async function bytezGetJobResult(jobId) {
    const apiKey = getApiKey('BYTEZ');
    if (!apiKey) throw new Error('Bytez API key not configured');

    try {
        const response = await axios.get(`${BYTEZ_CONFIG.BASE_URL}/jobs/${jobId}/result`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        return {
            job_id: response.data.job_id,
            url: response.data.output?.url,
            urls: response.data.output?.urls,
            metadata: response.data.output?.metadata
        };
    } catch (error) {
        console.error('Bytez Job Result Error:', error.message);
        throw error;
    }
}

// AI Service Manager
const AI_PROVIDERS = {
    OPENROUTER: 'openrouter',
    BYTEZ: 'bytez'
};

let defaultProvider = AI_PROVIDERS.BYTEZ;

function setDefaultProvider(provider) {
    if (Object.values(AI_PROVIDERS).includes(provider)) {
        defaultProvider = provider;
    }
}

function getAvailableModels(provider, type = 'image') {
    if (provider === AI_PROVIDERS.OPENROUTER) {
        return OPENROUTER_CONFIG.MODELS[
            type === 'image' ? 'imageGeneration' :
                type === 'video' ? 'videoGeneration' : 'chat'
        ];
    } else {
        return BYTEZ_CONFIG.MODELS[
            type === 'image' ? 'imageGeneration' : 'videoGeneration'
        ];
    }
}

async function generatePhoto(prompt, options = {}) {
    const provider = options.provider || defaultProvider;

    try {
        if (provider === AI_PROVIDERS.OPENROUTER) {
            const result = await openRouterGenerateImage(prompt, options.model, options.size);
            return {
                success: true,
                provider: 'openrouter',
                url: result.data?.[0]?.url,
                urls: result.data?.map(d => d.url),
                revisedPrompt: result.data?.[0]?.revised_prompt
            };
        } else {
            const job = await bytezGenerateImage(prompt, {
                model: options.model,
                size: options.size,
                style: options.style,
                negativePrompt: options.negativePrompt
            });

            return {
                success: true,
                provider: 'bytez',
                jobId: job.job_id,
                status: job.status,
                message: 'Image generation started. Check status with jobId.',
                checkStatus: async () => bytezCheckJobStatus(job.job_id),
                getResult: async () => bytezGetJobResult(job.job_id)
            };
        }
    } catch (error) {
        console.error('Photo generation error:', error);
        return { success: false, error: error.message, provider };
    }
}

async function generateVideo(prompt, options = {}) {
    const provider = options.provider || defaultProvider;

    try {
        if (provider === AI_PROVIDERS.OPENROUTER) {
            const result = await openRouterGenerateVideo(prompt, options.model, options.duration);
            return {
                success: true,
                provider: 'openrouter',
                url: result.data?.url,
                thumbnail: result.data?.thumbnail,
                duration: result.data?.duration
            };
        } else {
            const job = await bytezGenerateVideo(prompt, {
                model: options.model,
                duration: options.duration,
                fps: options.fps,
                width: options.width,
                height: options.height
            });

            return {
                success: true,
                provider: 'bytez',
                jobId: job.job_id,
                status: job.status,
                message: 'Video generation started. Check status with jobId.',
                checkStatus: async () => bytezCheckJobStatus(job.job_id),
                getResult: async () => bytezGetJobResult(job.job_id)
            };
        }
    } catch (error) {
        console.error('Video generation error:', error);
        return { success: false, error: error.message, provider };
    }
}

async function checkJobStatus(jobId, provider = 'bytez') {
    if (provider === 'bytez') return await bytezCheckJobStatus(jobId);
    return { error: 'Job status check only available for Bytez provider' };
}

async function getJobResult(jobId, provider = 'bytez') {
    if (provider === 'bytez') return await bytezGetJobResult(jobId);
    return { error: 'Job result only available for Bytez provider' };
}

// ==========================================
// SECTION 2: BROWSER AUTOMATION (Puppeteer)
// ==========================================

class BrowserPool {
    constructor(maxBrowsers = 5) {
        this.maxBrowsers = maxBrowsers;
        this.browsers = [];
        this.availableBrowsers = [];
        this.activePages = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        console.log('🌐 Initializing Browser Pool...');

        for (let i = 0; i < this.maxBrowsers; i++) {
            try {
                const browser = await puppeteer.launch({
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu',
                        '--window-size=1920,1080',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process'
                    ],
                    defaultViewport: { width: 1920, height: 1080 }
                });

                this.browsers.push(browser);
                this.availableBrowsers.push(browser);
                console.log(`✅ Browser ${i + 1}/${this.maxBrowsers} ready`);
            } catch (error) {
                console.error(`❌ Failed to launch browser ${i + 1}:`, error.message);
            }
        }

        this.isInitialized = true;
        console.log(`🎯 Browser Pool Ready: ${this.availableBrowsers.length}/${this.maxBrowsers} browsers`);
    }

    async getBrowser() {
        if (!this.isInitialized) await this.initialize();

        while (this.availableBrowsers.length === 0) {
            console.log('⏳ Waiting for available browser...');
            await this.delay(1000);
        }

        return this.availableBrowsers.shift();
    }

    releaseBrowser(browser) {
        this.availableBrowsers.push(browser);
    }

    async closeAll() {
        console.log('🔒 Closing all browsers...');
        for (const browser of this.browsers) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e.message);
            }
        }
        this.browsers = [];
        this.availableBrowsers = [];
        this.isInitialized = false;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==========================================
// EMAIL ACCOUNT PROVIDERS
// ==========================================

/**
 * Create Gmail Account
 * Delegates to tempmail-providers.js
 */
async function createGmailAccount() {
    console.log('📧 Creating Gmail account...');
    try {
        const account = await tempmailProviders.createAccount();
        if (account) {
            return account;
        }
    } catch (e) {
        console.error('❌ Error creating Gmail account:', e.message);
    }
    
    // Fallback to random domain
    const username = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return {
        email: `${username}@tempgmail.com`,
        token: `${username}@tempgmail.com`,
        sessionId: `${username}@tempgmail.com`,
        provider: 'fallback_gmail',
        password: null,
        isFallback: true
    };
}

/**
 * Create Hotmail Account
 * Delegates to tempmail-providers.js
 */
async function createHotmailAccount() {
    console.log('📧 Creating Hotmail account...');
    try {
        const account = await tempmailProviders.createAccount();
        if (account) {
            return account;
        }
    } catch (e) {
        console.error('❌ Error creating Hotmail account:', e.message);
    }
    
    // Fallback to random domain
    const username = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return {
        email: `${username}@outlook.com`,
        token: `${username}@outlook.com`,
        sessionId: `${username}@outlook.com`,
        provider: 'fallback_hotmail',
        password: null,
        isFallback: true
    };
}

/**
 * Create Student Email Account
 * Delegates to tempmail-providers.js
 */
async function createStudentEmailAccount() {
    console.log('📧 Creating Student Email account...');
    try {
        const account = await tempmailProviders.createAccount();
        if (account) {
            return account;
        }
    } catch (e) {
        console.error('❌ Error creating Student Email account:', e.message);
    }
    
    // Fallback to random student domain
    const username = `student${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return {
        email: `${username}@edu.pl`,
        token: `${username}@edu.pl`,
        sessionId: `${username}@edu.pl`,
        provider: 'fallback_student',
        password: null,
        isFallback: true
    };
}

/**
 * Get Gmail Messages
 * Delegates to tempmail-providers.js
 */
async function getGmailMessages(sessionId, email, provider) {
    try {
        return await tempmailProviders.getMessages(sessionId, email, provider) || [];
    } catch (e) {
        console.error('Error fetching Gmail messages:', e.message);
        return [];
    }
}

/**
 * Get Hotmail Messages
 * Delegates to tempmail-providers.js
 */
async function getHotmailMessages(sessionId, email, provider) {
    try {
        return await tempmailProviders.getMessages(sessionId, email, provider) || [];
    } catch (e) {
        console.error('Error fetching Hotmail messages:', e.message);
        return [];
    }
}

/**
 * Get Student Email Messages
 * Delegates to tempmail-providers.js
 */
async function getStudentEmailMessages(sessionId, email, provider) {
    try {
        return await tempmailProviders.getMessages(sessionId, email, provider) || [];
    } catch (e) {
        console.error('Error fetching Student Email messages:', e.message);
        return [];
    }
}

// ==========================================

module.exports = {
    // Email Providers
    createGmailAccount,
    createHotmailAccount,
    getGmailMessages,
    getHotmailMessages,

    // AI Services
    AI_PROVIDERS,
    setDefaultProvider,
    getAvailableModels,
    generatePhoto,
    generateVideo,
    checkJobStatus,
    getJobResult,
    OPENROUTER_CONFIG,
    BYTEZ_CONFIG,

    // Browser Pool
    BrowserPool,

    // Unified automation object for server.js
    automation: {
        initialize: async () => {
            console.log('[Automation] Initialized');
            return true;
        }
    }
};
