/**
 * UNIFIED AI PROVIDERS
 * 
 * Sections:
 * 1. Bytez AI Provider (Image/Video)
 * 2. OpenRouter AI Provider (Image/Video/Chat)
 * 3. Student Email (re-exported from gmail-providers.js)
 * 
 * Note: Gmail/Hotmail generation is handled via Admin Pool in database/server.js
 */

// ==========================================
// SECTION 1: BYTEZ AI PROVIDER
// ==========================================

const BYTEZ_CONFIG = {
    baseUrl: 'https://api.bytez.com/v1',
    apiKey: process.env.BYTEZ_API_KEY || '',

    endpoints: {
        imageGenerate: '/images/generate',
        videoGenerate: '/videos/generate',
        imageEdit: '/images/edit',
        videoEdit: '/videos/edit',
        status: '/jobs/status',
        result: '/jobs/result'
    },

    models: {
        imageGeneration: [
            { id: 'flux-pro', name: 'FLUX Pro', description: 'High-quality image generation' },
            { id: 'stable-diffusion-xl', name: 'Stable Diffusion XL', description: 'Versatile image model' },
            { id: 'midjourney-v6', name: 'Midjourney V6', description: 'Artistic style images' },
            { id: 'dalle-3', name: 'DALL-E 3', description: 'OpenAI image model' },
        ],
        videoGeneration: [
            { id: 'svd-xt', name: 'Stable Video Diffusion XT', description: 'High-quality video generation' },
            { id: 'pika-2.0', name: 'Pika 2.0', description: 'Cinematic video generation' },
            { id: 'runway-gen3', name: 'Runway Gen-3', description: 'Professional video creation' },
        ]
    },

    defaults: {
        imageModel: 'flux-pro',
        videoModel: 'svd-xt'
    }
};

async function generateBytezImage(prompt, options = {}) {
    const model = options.model || BYTEZ_CONFIG.defaults.imageModel;
    const size = options.size || '1024x1024';
    const style = options.style || 'photorealistic';

    const response = await fetch(`${BYTEZ_CONFIG.baseUrl}${BYTEZ_CONFIG.endpoints.imageGenerate}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${BYTEZ_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            size: size,
            style: style,
            negative_prompt: options.negativePrompt || 'low quality, blurry, distorted',
            num_images: options.numImages || 1,
            seed: options.seed || Math.floor(Math.random() * 1000000)
        })
    });

    if (!response.ok) throw new Error(`Bytez API error: ${response.status}`);
    return await response.json();
}

async function generateBytezVideo(prompt, options = {}) {
    const model = options.model || BYTEZ_CONFIG.defaults.videoModel;
    const duration = options.duration || 5;
    const fps = options.fps || 24;

    const response = await fetch(`${BYTEZ_CONFIG.baseUrl}${BYTEZ_CONFIG.endpoints.videoGenerate}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${BYTEZ_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            duration: duration,
            fps: fps,
            width: options.width || 1024,
            height: options.height || 576,
            motion_bucket_id: options.motion || 127,
            seed: options.seed || Math.floor(Math.random() * 1000000)
        })
    });

    if (!response.ok) throw new Error(`Bytez API error: ${response.status}`);
    return await response.json();
}

async function checkBytezJobStatus(jobId) {
    const response = await fetch(`${BYTEZ_CONFIG.baseUrl}${BYTEZ_CONFIG.endpoints.status}/${jobId}`, {
        headers: { 'Authorization': `Bearer ${BYTEZ_CONFIG.apiKey}` }
    });

    if (!response.ok) throw new Error(`Bytez API error: ${response.status}`);
    return await response.json();
}

async function getBytezJobResult(jobId) {
    const response = await fetch(`${BYTEZ_CONFIG.baseUrl}${BYTEZ_CONFIG.endpoints.result}/${jobId}`, {
        headers: { 'Authorization': `Bearer ${BYTEZ_CONFIG.apiKey}` }
    });

    if (!response.ok) throw new Error(`Bytez API error: ${response.status}`);
    return await response.json();
}

// ==========================================
// SECTION 2: OPENROUTER AI PROVIDER
// ==========================================

const OPENROUTER_CONFIG = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',

    models: {
        imageGeneration: [
            { id: 'openai/dall-e-3', name: 'DALL-E 3', provider: 'OpenAI' },
            { id: 'stability-ai/stable-diffusion-xl', name: 'Stable Diffusion XL', provider: 'Stability AI' },
            { id: 'midjourney/midjourney', name: 'Midjourney', provider: 'Midjourney' },
            { id: 'recraft-ai/recraft-v3', name: 'Recraft V3', provider: 'Recraft' },
        ],
        videoGeneration: [
            { id: 'runway/gen-3', name: 'Runway Gen-3', provider: 'Runway' },
            { id: 'luma/luma-dream-machine', name: 'Luma Dream Machine', provider: 'Luma' },
            { id: 'pika/pika-labs', name: 'Pika Labs', provider: 'Pika' },
            { id: 'kling/kling-ai', name: 'Kling AI', provider: 'Kling' },
        ],
        chat: [
            { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
            { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'Google' },
            { id: 'meta-llama/llama-3.1-70b', name: 'Llama 3.1 70B', provider: 'Meta' },
        ]
    },

    defaults: {
        image: 'openai/dall-e-3',
        video: 'runway/gen-3',
        chat: 'openai/gpt-4o'
    }
};

async function generateOpenRouterImage(prompt, model = OPENROUTER_CONFIG.defaults.image, size = '1024x1024') {
    const response = await fetch(`${OPENROUTER_CONFIG.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'https://your-app.com',
            'X-Title': 'Telegram Bot'
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            n: 1,
            size: size,
            response_format: 'url'
        })
    });

    if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
    return await response.json();
}

async function generateOpenRouterVideo(prompt, model = OPENROUTER_CONFIG.defaults.video, duration = 5) {    const response = await fetch(`${OPENROUTER_CONFIG.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'https://your-app.com',
            'X-Title': 'Telegram Bot'
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            duration: duration,
            response_format: 'url'
        })
    });

    if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
    return await response.json();
}

// ==========================================
// EXPORTS
// ==========================================

// Re-export student email from tempmail-providers.js if needed
const tempmailProviders = require('./tempmail-providers');

module.exports = {
    // Bytez AI
    BYTEZ_CONFIG,
    generateBytezImage,
    generateBytezVideo,
    checkBytezJobStatus,
    getBytezJobResult,

    // OpenRouter AI
    OPENROUTER_CONFIG,
    generateOpenRouterImage,
    generateOpenRouterVideo
};
