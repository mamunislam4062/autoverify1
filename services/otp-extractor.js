/**
 * ULTRA-ROBUST OTP EXTRACTOR V3
 * ✅ Handles ALL OTP lengths: 3, 4, 5, 6, 7, 8, 10, 11, 16 digits
 * ✅ Alphanumeric codes (e.g. G-123456, ABC1234)
 * ✅ Context-aware scoring
 * ✅ Smart exclusion (dates, times, phone numbers, URLs)
 */

// Strong context keywords that signal an OTP is nearby
const CONTEXT_KEYWORDS = [
    'otp', 'one-time', 'one time', 'verification', 'verify', 'code',
    'passcode', 'security code', 'login code', 'confirmation',
    'auth', '2fa', 'authenticate', 'token', 'pin', 'temporary',
    'access code', 'activation', 'reset', 'password reset',
    'your code', 'your otp', 'enter code', 'use code',
    'কোড', 'ভেরিফিকেশন' // Bengali support
];

// Strong inline phrases that almost certainly precede an OTP
const STRONG_PHRASES = [
    'code is', 'otp is', 'otp:', 'code:', 'verification code',
    'your code', 'confirmation code', 'security code', 'login code',
    'passcode is', 'pin is', 'pin:', 'access code',
    'your otp is', 'the code', 'use code', 'enter code',
    'is your', 'here is your', 'please use', 'below is'
];

/**
 * Clean and normalize text for analysis
 */
function preprocessText(text) {
    if (!text) return '';
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
        .replace(/<[^>]+>/g, ' ')              // strip HTML tags
        .replace(/[ \t]+/g, ' ')               // normalize spaces
        .trim();
}

/**
 * Check if a token appears near OTP context keywords
 */
function isNearKeyword(text, position, tokenLen, windowSize = 200) {
    const window = text.substring(
        Math.max(0, position - windowSize),
        Math.min(text.length, position + tokenLen + windowSize)
    ).toLowerCase();
    return CONTEXT_KEYWORDS.some(kw => window.includes(kw));
}

/**
 * Check if a token immediately follows a strong phrase
 */
function isAfterStrongPhrase(text, position) {
    const before = text.substring(Math.max(0, position - 60), position).toLowerCase();
    return STRONG_PHRASES.some(phrase => before.includes(phrase));
}

/**
 * Determine whether a candidate should be excluded
 * @param {string} token - The candidate OTP string
 * @param {string} context - Surrounding text for context
 * @param {string} fullText - Entire email text
 */
function shouldExclude(token, context, fullText) {
    const lower = token.toLowerCase();
    const ctxLower = context.toLowerCase();

    // Must be all digits for digit candidates. If contains letters, skip here.
    // (Alphanumeric path is handled separately)

    // --- YEARS ---
    if (/^(19|20)\d{2}$/.test(token)) return true;

    // --- COMMON ZIP CODES / PLACEHOLDERS ---
    const blacklist = ['98052', '94043', '98034', '94040', '95014', '12345', '00000', '11111', '99999'];
    if (blacklist.includes(token)) {
        // Only exclude if they appear more than twice (template noise)
        const count = (fullText.match(new RegExp(`\\b${token}\\b`, 'g')) || []).length;
        if (count > 2) return true;
    }

    // --- TIME PATTERNS: exclude if token looks like it's part of a time ---
    // e.g. "10:30" → "1030" could be extracted, but if immediately adjacent to ":" skip
    if (/:\s*$/.test(context.substring(0, context.indexOf(token))) ||
        new RegExp(`^${token}\\s*:`).test(context)) {
        if (/^\d{3,4}$/.test(token)) return true;
    }

    // --- Currency context ---
    if (/(\$|usd|tk|৳|credits?|cost|price|amount|balance|rs\.?|inr)/i.test(context)) {
        if (new RegExp(`(\\$|usd|tk|৳|rs\\.?)\\s*${token}`).test(context)) return true;
    }

    // --- Address context (exclude street numbers) ---
    const afterContext = context.substring(context.indexOf(token) + token.length, context.indexOf(token) + token.length + 30).toLowerCase();
    if (/\b(street|road|ave|avenue|blvd|boulevard|lane|drive|way|park|court|plaza|square)\b/i.test(afterContext)) {
        return true;
    }

    // --- URL / Email context ---
    const urlContext = context.substring(
        Math.max(0, context.indexOf(token) - 30),
        context.indexOf(token) + token.length + 30
    );
    if (/(https?:\/\/|www\.|\.[a-z]{2,4}\/|@)/i.test(urlContext)) {
        return true;
    }

    // --- Pure letters with no digits ---
    if (/^[A-Za-z]+$/.test(token)) {
        const commonWords = ['code', 'from', 'date', 'time', 'mail', 'email',
            'best', 'team', 'your', 'this', 'that', 'with', 'have', 'here', 'link',
            'dear', 'hello', 'please', 'click', 'below'];
        if (commonWords.includes(lower)) return true;
    }

    return false;
}

/**
 * Score a candidate OTP (higher = more likely real OTP)
 */
function scoreCandidate(token, position, type, fullText, subject) {
    let score = 0;

    const context = fullText.substring(
        Math.max(0, position - 150),
        Math.min(fullText.length, position + token.length + 150)
    ).toLowerCase();

    const subjectLower = (subject || '').toLowerCase();

    // === BASE SCORES BY TYPE ===
    if (type === 'digit') score += 80;
    else if (type === 'alphanumeric') score += 50;
    else if (type === 'spaced') score += 60;

    // === KEYWORD PROXIMITY BOOST ===
    if (isNearKeyword(fullText, position, token.length)) {
        score += 90;
    }

    // === STRONG PHRASE (right before the token) MEGA BOOST ===
    if (isAfterStrongPhrase(fullText, position)) {
        score += 180;
    }

    // === SUBJECT LINE BOOST ===
    if (subject && subjectLower.includes(token.toLowerCase())) {
        score += 130;
        if (CONTEXT_KEYWORDS.some(kw => subjectLower.includes(kw))) {
            score += 80;
        }
    }

    // === STANDALONE ON OWN LINE ===
    const lines = fullText.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === token || trimmed === token.replace(/[\s-]/g, '')) {
            score += 60;
            break;
        }
    }

    // === LENGTH PREFERENCES ===
    // 6 digits is the most common OTP length
    if (token.length === 6 && type === 'digit') score += 40;
    // 4 digits also very common (ATM-style PIN)
    else if (token.length === 4 && type === 'digit') score += 20;
    // Long OTPs (8-16) are valid but less common
    else if (token.length >= 8) score += 10;

    // === GOOGLE/APPLE STYLE CODES ===
    if (/^G-\d+$/.test(token) || /^[A-Z0-9]{8,16}$/.test(token)) {
        score += 30;
    }

    // === PENALTIES ===

    // Near date/time markers
    if (/received|sent|date|time|pm|am|timestamp|expires?|expiry|valid until/i.test(context)) {
        score -= 40;
    }

    // Near URL or email
    if (/(https?:\/\/|www\.|@)/i.test(context)) {
        score -= 50;
    }

    // Repeated token (template/footer noise)
    const count = (fullText.match(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length;
    if (count > 3) score -= 80;

    // Long paragraph with no keywords
    if (context.length > 250 && !CONTEXT_KEYWORDS.some(kw => context.includes(kw))) {
        score -= 50;
    }

    return score;
}

/**
 * MAIN OTP EXTRACTION FUNCTION
 * 
 * @param {string} emailText - Full email body text
 * @param {string} subject - Email subject line
 * @returns {{ otp: string|null, confidence: number, candidates: Array }}
 */
function extractOTP(emailText, subject = '') {
    const fullText = preprocessText(emailText);
    const cleanSubject = preprocessText(subject);

    if (!fullText && !cleanSubject) {
        return { otp: null, confidence: 0, candidates: [] };
    }

    // Combine subject + body for better coverage
    const combinedText = cleanSubject ? `${cleanSubject}\n\n${fullText}` : fullText;

    const candidates = [];

    // ====================================================
    // PHASE 1: DIGIT-ONLY OTPs (3 to 16 digits)
    // We use context-aware filtering to pick the right one.
    // We do NOT blanket-exclude long numbers — instead we
    // score them lower unless near OTP keywords.
    // ====================================================
    const digitRegex = /\b(\d{3,16})\b/g;
    let match;

    while ((match = digitRegex.exec(combinedText)) !== null) {
        const token = match[1];
        const position = match.index;
        const charBefore = position > 0 ? combinedText[position - 1] : '';

        // Skip numbers following a dot (likely username or decimal part)
        if (charBefore === '.') continue;

        // Skip years
        if (/^(19|20)\d{2}$/.test(token)) continue;

        // Skip phone numbers ONLY if NOT near any OTP keyword
        if (token.length >= 10 && !isNearKeyword(combinedText, position, token.length, 100)) continue;

        const contextSnippet = combinedText.substring(
            Math.max(0, position - 60),
            Math.min(combinedText.length, position + token.length + 60)
        );

        if (!shouldExclude(token, contextSnippet, combinedText)) {
            candidates.push({
                token,
                position,
                type: 'digit',
                score: scoreCandidate(token, position, 'digit', combinedText, cleanSubject)
            });
        }
    }

    // ====================================================
    // PHASE 2: ALPHANUMERIC OTPs (e.g. G-123456, AB12CD)
    // Must contain BOTH letters AND digits.
    // ====================================================
    const alphanumRegex = /\b([A-Z0-9]{4,16})(?![a-z])\b/gi;

    while ((match = alphanumRegex.exec(combinedText)) !== null) {
        const token = match[1].toUpperCase();
        const position = match.index;

        const hasLetter = /[A-Z]/.test(token);
        const hasDigit = /\d/.test(token);

        if (hasLetter && hasDigit) {
            const contextSnippet = combinedText.substring(
                Math.max(0, position - 60),
                Math.min(combinedText.length, position + token.length + 60)
            );

            if (!shouldExclude(token, contextSnippet, combinedText)) {
                candidates.push({
                    token,
                    position,
                    type: 'alphanumeric',
                    score: scoreCandidate(token, position, 'alphanumeric', combinedText, cleanSubject)
                });
            }
        }
    }

    // ====================================================
    // PHASE 3: GOOGLE-STYLE PREFIXED CODES (G-XXXXXX, #XXXXXX)
    // ====================================================
    const prefixedRegex = /\b([A-Z]-\d{4,10}|#\d{4,10})\b/gi;

    while ((match = prefixedRegex.exec(combinedText)) !== null) {
        const token = match[1].toUpperCase();
        const position = match.index;
        const digits = token.replace(/[^0-9]/g, '');

        candidates.push({
            token,
            position,
            type: 'alphanumeric',
            // Prefixed codes get a big bonus — very reliable OTP format
            score: scoreCandidate(digits, position, 'alphanumeric', combinedText, cleanSubject) + 100
        });
    }

    // ====================================================
    // PHASE 4: SPACED / DASHED OTPs (e.g. "1234 5678" or "ABC-123")
    // ====================================================
    const spacedRegex = /\b(?:[A-Z0-9]{2,5}[- ]){1,6}[A-Z0-9]{2,5}\b/gi;

    while ((match = spacedRegex.exec(combinedText)) !== null) {
        const original = match[0];
        const token = original.replace(/[\s-]/g, '').toUpperCase();
        const position = match.index;

        if (token.length >= 4 && token.length <= 20 && /\d/.test(token)) {
            const contextSnippet = combinedText.substring(
                Math.max(0, position - 60),
                Math.min(combinedText.length, position + token.length + 60)
            );

            if (!shouldExclude(token, contextSnippet, combinedText)) {
                const type = (/[A-Z]/.test(token) && /\d/.test(token)) ? 'alphanumeric' : 'digit';
                candidates.push({
                    token,
                    position,
                    type,
                    score: scoreCandidate(token, position, 'spaced', combinedText, cleanSubject)
                });
            }
        }
    }

    // ====================================================
    // SCORING & DEDUPLICATION
    // ====================================================
    if (candidates.length === 0) {
        return { otp: null, confidence: 0, candidates: [] };
    }

    // Sort: highest score first
    candidates.sort((a, b) => b.score - a.score);

    // Deduplicate by token value
    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
        const key = c.token.toUpperCase();
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(c);
        }
    }

    const best = unique[0];

    // Confidence threshold: require at least score 40
    if (best.score < 40) {
        return {
            otp: null,
            confidence: best.score,
            candidates: unique.slice(0, 5).map(c => ({ token: c.token, score: c.score }))
        };
    }

    return {
        otp: best.token,
        confidence: best.score,
        candidates: unique.slice(0, 5).map(c => ({ token: c.token, score: c.score }))
    };
}

module.exports = {
    extractOTP,
    extractOtp: extractOTP
};
