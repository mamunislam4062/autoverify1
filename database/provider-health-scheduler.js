const axios = require('axios');
const db = require('../db');

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 Minutes

function startHealthCheck() {
    console.log('[HealthCheck] Starting provider health monitor...');

    // Initial Run after small delay to let DB load
    setTimeout(runChecks, 5000);

    // Schedule
    setInterval(runChecks, CHECK_INTERVAL);
}

async function runChecks() {
    // Wait for DB to be ready if needed
    if (!db.data || !db.data.providers) return;

    const providers = db.getProviders(true); // Get raw/encrypted data structure
    const providerList = Object.entries(providers);

    if (providerList.length === 0) return;

    console.log(`[HealthCheck] Checking ${providerList.length} providers...`);

    for (const [id, p] of providerList) {
        // Decrypt key for usage using DB helper
        const decryptedP = db.getProviderDecrypted(id);
        if (!decryptedP) continue;

        try {
            const start = Date.now();
            const headers = {};
            // Common Auth Headers (Attempt both Bearer and X-API-KEY if key exists)
            // Real implementation might need provider-specific auth headers stored in 'config'
            if (decryptedP.apiKey) {
                headers['Authorization'] = `Bearer ${decryptedP.apiKey}`;
                headers['X-API-KEY'] = decryptedP.apiKey;
            }

            // Timeout 10s
            await axios.get(decryptedP.apiUrl, {
                timeout: 10000,
                headers: headers,
                validateStatus: (s) => s < 500 // 404/401 is technically "Online" (Service Reachable)
            });

            const latency = Date.now() - start;

            // Update
            const wasOnline = decryptedP.status === 'online';
            decryptedP.status = 'online';
            decryptedP.lastCheck = Date.now();
            decryptedP.latency = latency;

            // Log if status changed
            if (!wasOnline) console.log(`[HealthCheck] Provider ${decryptedP.title} is back ONLINE.`);

            // Save (db.saveProvider handles re-encryption of the key)
            db.saveProvider(id, decryptedP);

        } catch (e) {
            console.error(`[HealthCheck] Provider ${decryptedP.title} failed: ${e.message}`);
            const wasOnline = decryptedP.status === 'online';

            decryptedP.status = 'offline';
            decryptedP.lastCheck = Date.now();

            if (wasOnline) console.log(`[HealthCheck] Alert: Provider ${decryptedP.title} went OFFLINE.`);

            db.saveProvider(id, decryptedP);
        }
    }
}

module.exports = { startHealthCheck };
