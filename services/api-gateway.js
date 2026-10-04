const axios = require('axios');
const db = require('../db');

class ApiGateway {

    /**
     * Get a list of healthy providers sorted by priority
     * @param {string} type - Provider type (e.g. 'sms', 'email')
     * @returns {Array} List of decrypted provider configs
     */
    getHealthyProviders(type) {
        if (!db.data || !db.data.providers) return [];

        const all = db.getProviders(true); // Get raw (encrypted values)

        return Object.entries(all)
            .map(([id, p]) => {
                // Get decrypted version
                return db.getProviderDecrypted(id);
            })
            .filter(p => p && p.type === type && (p.status === 'online' || p.status === 'active'))
            .sort((a, b) => (a.priority || 10) - (b.priority || 10));
    }

    /**
     * Execute a request with automatic failover mechanism
     * @param {string} type - Provider type
     * @param {Function} requestFn - Async function (provider) => result. 
     *                               Should throw if request fails to trigger failover.
     * @returns {Promise<any>} Result from the first successful provider
     */
    async executeWithFailover(type, requestFn) {
        const providers = this.getHealthyProviders(type);

        if (providers.length === 0) {
            console.warn(`[ApiGateway] No online providers found for type: ${type}`);
            throw new Error('SERVICE_UNAVAILABLE'); // Specific error for stealth handling
        }

        let lastError = null;

        for (const provider of providers) {
            try {
                // Execute the request function with the current provider
                const result = await requestFn(provider);
                return result; // Success

            } catch (e) {
                console.warn(`[ApiGateway] Provider ${provider.title} failed: ${e.message}`);
                lastError = e;
                // Update stats if needed (failures count, timestamp) via DB?
                // For now, HealthCheck updates periodicaly.
                // We can mark "suspect" but let HealthCheck confirm.
            }
        }

        throw lastError || new Error('All providers failed.');
    }
}

module.exports = new ApiGateway();
