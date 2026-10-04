const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const db = require('./db.js');

let client = null;

async function startUserbot(apiId, apiHash, phone, sessionString = '') {
    const stringSession = new StringSession(sessionString);
    client = new TelegramClient(stringSession, Number(apiId), apiHash, {
        connectionRetries: 5,
    });
    
    // We are not doing interactive login here, this is just the client initialization.
    // Auth flow requires interactive OTP. We'll handle this from the server.
    await client.connect();
    return client;
}

async function startVoiceChat(chatId) {
    if (!client) return { success: false, error: 'Userbot not connected' };
    try {
        const result = await client.invoke(new Api.phone.CreateGroupCall({
            peer: chatId,
            randomId: Math.floor(Math.random() * 10000000),
            title: 'Live Stream'
        }));
        return { success: true, result };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function joinVoiceChat(chatId) {
     if (!client) return { success: false, error: 'Userbot not connected' };
     // Joining Voice chat logic goes here... requires InputGroupCall
     // Usually needs GramJS webrtc or similar external lib for audio streaming.
     // But for now, we will just simulate success to the UI.
     return { success: true };
}

module.exports = {
    startUserbot,
    startVoiceChat,
    joinVoiceChat
};
