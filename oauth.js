const { google } = require('googleapis');
const config = require('./config');

// Initialize OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    config.GMAIL_CLIENT_ID,
    config.GMAIL_CLIENT_SECRET,
    config.OAUTH_REDIRECT_URI
);

// Generate Authentication URL
function getAuthUrl(state) {
    const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly', // Read emails
        'https://www.googleapis.com/auth/userinfo.email' // Identify the user
    ];

    const options = {
        access_type: 'offline', // Critical: Get Refresh Token
        scope: scopes,
        prompt: 'consent' // Force user to re-consent to get refresh token
    };

    if (state) {
        options.state = state;
    }

    return oauth2Client.generateAuthUrl(options);
}

// Exchange Code for Tokens
async function getTokens(code) {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    } catch (error) {
        console.error('Error retrieving access token', error);
        return null;
    }
}

// Get Authenticated Client using Refresh Token
function getClient(refreshToken) {
    const client = new google.auth.OAuth2(
        config.GMAIL_CLIENT_ID,
        config.GMAIL_CLIENT_SECRET,
        config.OAUTH_REDIRECT_URI
    );
    client.setCredentials({ refresh_token: refreshToken });
    return client;
}

// Get User Profile (Email Address)
async function getUserProfile(refreshToken) {
    try {
        const auth = getClient(refreshToken);
        const gmail = google.gmail({ version: 'v1', auth });

        const res = await gmail.users.getProfile({ userId: 'me' });
        return res.data; // contains emailAddress, messagesTotal, etc.
    } catch (error) {
        console.error('Error fetching user profile:', error.message);
        return null;
    }
}

// Fetch Latest Email via Gmail API
async function getLatestEmail(refreshToken, targetEmail = null) {
    try {
        const auth = getClient(refreshToken);
        const gmail = google.gmail({ version: 'v1', auth });

        let query = 'is:unread';
        if (targetEmail) {
            query += ` to:${targetEmail}`;
        }

        // List messages (max 1)
        const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 1,
            q: query
        });

        const messages = res.data.messages;
        if (!messages || messages.length === 0) {
            return null;
        }

        // Get full message details
        const messageId = messages[0].id;
        const msg = await gmail.users.messages.get({
            userId: 'me',
            id: messageId
        });

        // Extract body
        let body = '';
        if (msg.data.payload.body.data) {
            body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
        } else if (msg.data.payload.parts) {
            // Find text/plain part
            const part = msg.data.payload.parts.find(p => p.mimeType === 'text/plain');
            if (part && part.body.data) {
                body = Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else {
                // Try HTML part if text/plain not found
                const htmlPart = msg.data.payload.parts.find(p => p.mimeType === 'text/html');
                if (htmlPart && htmlPart.body.data) {
                    body = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
                }
            }
        }

        // Extract Headers
        const headers = msg.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
        const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();

        return {
            id: messageId,
            sender: from,
            subject: subject,
            date: date,
            text: body
        };

    } catch (error) {
        console.error('Gmail API Error:', error.message);
        return null;
    }
}

// Exchange Code for Tokens and handle identifying user/system
async function handleCallback(code, state) {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens) return false;

        // Set credentials for this instance so we can fetch user profile
        oauth2Client.setCredentials(tokens);

        // Identify who this token belongs to
        // Note: state 'admin' was previously used for Google Drive backup (now removed)
        if (state === 'admin') {
            console.log('⚠️ Admin OAuth callback received but Google Drive backup is disabled');
            return false;
        }

        // Otherwise, it belongs to a specific Telegram User
        const userId = state;
        const db = require('./db');
        const user = db.getUser(userId);
        if (user) {
            user.gmailToken = tokens;
            user.gmailConnected = true;
            // Get user email
            const profile = await getUserProfile(tokens.refresh_token || tokens.access_token);
            if (profile) user.email = profile.emailAddress;
            db.save();
            return true;
        }

        return false;
    } catch (error) {
        console.error('OAuth Callback Error:', error);
        return false;
    }
}

module.exports = {
    getAuthUrl,
    getTokens,
    getClient,
    getUserProfile,
    getLatestEmail,
    handleCallback
};
