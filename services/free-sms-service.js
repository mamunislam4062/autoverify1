const axios = require('axios');

// Map of supported country codes to receive-sms-free.cc suffixes
const COUNTRY_MAP = {
    '1': { suffix: 'Free-USA-Phone-Number/', name: 'USA', flag: '🇺🇸' },
    '44': { suffix: 'Free-UK-Phone-Number/', name: 'UK', flag: '🇬🇧' },
    '33': { suffix: 'Free-France-Phone-Number/', name: 'France', flag: '🇫🇷' },
    '49': { suffix: 'Free-Germany-Phone-Number/', name: 'Germany', flag: '🇩🇪' },
    '46': { suffix: 'Free-Sweden-Phone-Number/', name: 'Sweden', flag: '🇸🇪' },
    '31': { suffix: 'Free-Netherlands-Phone-Number/', name: 'Netherlands', flag: '🇳🇱' },
    '39': { suffix: 'Free-Italy-Phone-Number/', name: 'Italy', flag: '🇮🇹' },
    '34': { suffix: 'Free-Spain-Phone-Number/', name: 'Spain', flag: '🇪🇸' },
    '358': { suffix: 'Free-Finland-Phone-Number/', name: 'Finland', flag: '🇫🇮' }
};

// Simulated high-quality public fallback numbers
const SIMULATED_NUMBERS = {
    '1': ['+13125550192', '+12135550143', '+16465550188'],
    '44': ['+447911123456', '+447911987654'],
    '33': ['+33612345678', '+33687654321'],
    '49': ['+491522123456', '+491761234567'],
    '880': ['+8801712345678', '+8801987654321'],
    '91': ['+919876543210', '+919123456789']
};

/**
 * Fetch list of free active numbers for a country code
 */
async function getFreeNumbers(countryCode) {
    const info = COUNTRY_MAP[countryCode];
    if (!info) {
        // Fallback to simulated numbers for non-direct countries
        return SIMULATED_NUMBERS[countryCode] || SIMULATED_NUMBERS['1'];
    }

    try {
        const url = `https://receive-sms-free.cc/${info.suffix}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 5000
        });

        const html = response.data;
        // Regex to extract numbers like: href="/Free-USA-Phone-Number/12135557788.html"
        const regex = new RegExp(`href=["'](?:https:\\/\\/receive-sms-free\\.cc)?\\/${info.suffix}([0-9]+)\\.html["']`, 'g');
        const numbers = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            const rawNum = match[1];
            if (rawNum && rawNum.length >= 8 && !numbers.includes(rawNum)) {
                // Add "+" prefix
                numbers.push('+' + rawNum);
            }
        }

        if (numbers.length > 0) {
            return numbers;
        }
    } catch (e) {
        console.error(`[Scraper] Error fetching free numbers for +${countryCode}: ${e.message}`);
    }

    // Fallback to simulated numbers if scrape fails
    return SIMULATED_NUMBERS[countryCode] || SIMULATED_NUMBERS['1'];
}

/**
 * Fetch SMS messages for a given free public number
 */
async function getFreeNumberSMS(number, countryCode, sessionId, requestedPlatform = 'telegram') {
    const rawNum = number.replace('+', '');
    const info = COUNTRY_MAP[countryCode];
    
    // Check if it's a simulated number
    const isSimulated = Object.values(SIMULATED_NUMBERS).flat().includes(number) || !info;

    if (isSimulated) {
        return getSimulatedSMS(number, sessionId, requestedPlatform);
    }

    try {
        const url = `https://receive-sms-free.cc/${info.suffix}${rawNum}.html`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 5000
        });

        const html = response.data;
        const messages = [];
        
        // Parse row-border layout of receive-sms-free.cc
        const rowRegex = /<div class="row-border">([\s\S]*?)<\/div>/g;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const block = rowMatch[1];
            const senderMatch = block.match(/<div class="col-xs-12 col-md-2"><b>(.*?)<\/b>/i);
            const contentMatch = block.match(/<div class="col-xs-12 col-md-8">(.*?)<\/div>/i);
            const timeMatch = block.match(/<div class="col-xs-12 col-md-2">(.*?)<\/div>/i);

            if (senderMatch && contentMatch) {
                messages.push({
                    sender: senderMatch[1].trim(),
                    content: contentMatch[1].trim().replace(/<[^>]*>/g, ''), // Strip any tags
                    time: timeMatch ? timeMatch[1].trim() : 'Just now'
                });
            }
        }

        const simulated = getSimulatedSMS(number, sessionId, requestedPlatform);
        return [...simulated, ...messages];
    } catch (e) {
        console.error(`[Scraper] Error fetching SMS for ${number}: ${e.message}`);
    }

    // Fallback to simulated SMS if real scraping fails
    return getSimulatedSMS(number, sessionId, requestedPlatform);
}

// Map of platform ids to templates
const PLATFORM_TEMPLATES = {
    telegram: {
        sender: 'Telegram',
        texts: [
            'Telegram code: {code}. You can use this code to log in to your account. Do not share it.',
            'Telegram code {code}. This is your login verification code.'
        ]
    },
    whatsapp: {
        sender: 'WhatsApp',
        texts: [
            'Your WhatsApp code is {code}. You can also tap this link to verify your phone: v.whatsapp.com/{code}',
            'Your WhatsApp verification code is: {code}. Do not share this code.'
        ]
    },
    facebook: {
        sender: 'Facebook',
        texts: [
            '{code} is your Facebook confirmation code.',
            'Facebook: Your security verification code is {code}.'
        ]
    },
    google: {
        sender: 'Google',
        texts: [
            'G-{code} is your Google verification code.',
            'Your Google security verification code is G-{code}.'
        ]
    },
    tiktok: {
        sender: 'TikTok',
        texts: [
            '[{code}] is your TikTok verification code. Use this code to complete your login.',
            'TikTok: {code} is your login confirmation code.'
        ]
    },
    twitter: {
        sender: 'Twitter / X',
        texts: [
            'Your Twitter verification code is {code}. Use this to verify your identity.',
            'Twitter: {code} is your temporary login authorization code.'
        ]
    },
    microsoft: {
        sender: 'Microsoft',
        texts: [
            'Use {code} as Microsoft account password reset code.',
            'Microsoft account security code: {code}.'
        ]
    },
    Personal: {
        sender: 'VerifyService',
        texts: [
            'Your verification code is {code}. valid for 5 minutes.',
            'Verification Code: {code}'
        ]
    }
};

// Store active simulation timers/data to generate OTP after a short delay
const activeSimulations = {};

function startOtpSimulation(sessionId, platform) {
    const delay = 6000 + Math.random() * 4000; // 6 to 10 seconds delay
    activeSimulations[sessionId] = {
        platform,
        code: Math.floor(10000 + Math.random() * 90000).toString(),
        createdAt: Date.now(),
        triggerTime: Date.now() + delay
    };
}

function getSimulatedSMS(number, sessionId, requestedPlatform = 'telegram') {
    const list = [
        { sender: 'Google', content: 'Your Google Verification Code is G-582914. Valid for 10 minutes.', time: '2 mins ago' },
        { sender: 'Netflix', content: 'Your Netflix verification code is 491823.', time: '5 mins ago' },
        { sender: 'Amazon', content: 'Your Amazon login OTP code is 912834. Do not disclose.', time: '12 mins ago' }
    ];

    // If there is an active simulation session, let's inject its OTP!
    if (sessionId && activeSimulations[sessionId]) {
        const sim = activeSimulations[sessionId];
        if (Date.now() >= sim.triggerTime) {
            const platformKey = sim.platform && PLATFORM_TEMPLATES[sim.platform] ? sim.platform : 'Personal';
            const template = PLATFORM_TEMPLATES[platformKey];
            const textTemplate = template.texts[Math.floor(Math.random() * template.texts.length)];
            const content = textTemplate.replace('{code}', sim.code);

            // Add the generated OTP at the very beginning of the list
            list.unshift({
                sender: template.sender,
                content: content,
                time: 'Just now',
                otp: sim.code
            });
        }
    }

    return list;
}

module.exports = {
    getFreeNumbers,
    getFreeNumberSMS,
    getSimulatedSMS,
    startOtpSimulation,
    activeSimulations
};
