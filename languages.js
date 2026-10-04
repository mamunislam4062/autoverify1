// Multi-Language Support for Telegram Bot

const languages = {
    en: {
        name: 'English',
        flag: '🇺🇸',

        // Menu & Navigation
        welcome: (name, balance, id) => `👋 **Welcome, ${name}!**\n\n💰 Balance: **${balance} Credits**\n🆔 ID: \`${id}\`\n\nChoose an option below:`,
        mainMenu: 'Main Menu',
        backButton: '🔙 Back',
        cancelButton: '❌ Cancel',

        // Main Menu Buttons
        startVerification: '🚀 Start Verification',
        buyCards: '💳 Buy Cards & Accounts',
        balance: '💰 My Balance',
        daily: '🎁 Daily Reward',
        addBalance: '💵 Top Up Balance',
        redeemCode: '🎟 Redeem Code',
        referral: '👥 Referral',
        tasks: '📋 Tasks',
        support: '🎫 Support',
        adminPanel: '⚙️ Admin Panel',
        language: '🌍 Language',

        // Action Messages
        balanceMsg: (amount) => `💰 **My Balance**\n\nCurrent Balance: **${amount} Credits**\n\nNeed more credits? Top up now!`,
        dailySuccess: (amount) => `✅ Claimed ${amount} Credits!`,
        dailyWait: (msg) => `⏳ ${msg}`,
        insufficientBalance: (cost) => `❌ Insufficient Balance! Need ${cost} Credits`,
        verifying: '🔍 Verifying membership...',
        joinRequired: '❌ You must join our updated channels to use this bot!',
        joinChannel: '📢 Join Update Channel',
        joinGroup: '💬 Join Discussion Group',
        checkJoined: '✅ I Have Joined',
        verifiedWelcome: '✅ Verified! Welcome to the bot!',

        // Services
        selectService: '🛠 **Select a Service:**\nClick on a service to start verification.',
        serviceInfo: (name, cost) => `${name} (${cost} Credits)`,
        outOfStock: '❌ Out of Stock',
        stockCount: (count) => `✅ Stock: ${count}`,
        buyConfirm: (service, price) => `💳 **Confirm Purchase**\n\nService: ${service}\nPrice: ${price} Credits\n\nAre you sure?`,
        purchaseSuccess: (service) => `✅ **Success!** Purchased 1 ${service}.\n\nCheck your delivery below.`,
        verifyStart: (cost) => `🚀 **Starting Verification...**\n💰 Deducted: ${cost}`,
        verifySuccess: '✅ **Success!**',
        verifyFail: (err) => `❌ **Failed:** ${err}`,
        checkEmail: '📧 Check Email!',

        // Payment
        addBalanceMenu: `💵 **Add Balance**\n\nPurchase credits to use our services.\n\n**Current Rate:**\n• Crypto: 0.01 USDT per credit\n\nSelect amount:`,
        paymentSelectMethod: (amount, discount, usd) => `💰 **Select Payment Method**\n\nCredits: **${amount}**\nDiscount: **${discount}%**\n\n**Price:** $${usd} USDT\n\nChoose payment option:`,
        paymentInstruction: (method, amount, price, currency, address) => `💳 **Payment Instructions**\n\nMethod: **${method}**\nAmount: **${amount} Credits**\nPrice: **${price} ${currency}**\n\n**Send Payment To:**\n\`${address}\`\n\n⚠️ **After sending payment, click "Submit Proof" below.**`,
        submitProof: '✅ Submit Proof',
        submitProofPrompt: '📸 **Submit Payment Proof**\n\nPlease send a screenshot of the payment OR the Transaction ID (text).',
        paymentSubmitted: (id) => `✅ Proof submitted for \`${id}\`\n\nWaiting for admin approval.`,
        paymentHistory: '📜 **Payment History**',
        noPayments: 'You have no payments yet.',

        // Support
        supportMenu: (cost, bal) => `🎫 **Support Center**\n\nGet help from our team.\n\n**Cost:** ${cost} Credits\n**Your Balance:** ${bal} Credits\n\nClick below to access support channel.`,
        accessSupport: (cost) => `✅ Access Support`,
        supportGranted: (cost) => `✅ **Support Access Granted!**\n\n${cost} Credits deducted.\n\nClick below to join our support channel:`,
        goToSupport: '💬 Go to Support',

        // Referral
        referralStats: (link, count, earnings) => `👥 **Referral System**\n\n🔗 **Your Link:** \`${link}\`\n💰 **Total Referrals:** ${count}\n💵 **Total Earnings:** ${earnings} Credits\n\n🏆 **Top Referrers:**`,
        noRefData: '_(No data yet)_',

        // Tasks
        taskList: '📋 **Available Tasks**\n\nComplete tasks to earn free credits!',
        noTasks: '📭 No tasks available right now.',
        taskReward: (amount) => `✅ Earned ${amount} Credits!`,
        taskAlreadyDone: '❌ Task already completed',

        // Admin
        adminPanelTitle: '⚙️ **Admin Panel**\n\nManage your bot from here:',

        // File Upload
        uploadFileMenu: '📂 **Bulk Upload**\n\nUpload a text file to add multiple cards or codes.\n\nFormat: One item per line', // Kept from original

        // Settings
        selectLanguage: '🌍 **Select Language**\n\nChoose your preferred language:' // Kept from original
    },

    bn: {
        name: 'বাংলা',
        flag: '🇧🇩',

        // Menu & Navigation
        welcome: (name, balance, id) => `👋 **স্বাগতম, ${name}!**\n\n💰 ব্যালেন্স: **${balance} ক্রেডিট**\n🆔 আইডি: \`${id}\`\n\nনিচের অপশন থেকে বেছে নিন:`,
        mainMenu: 'মূল মেনু',
        backButton: '🔙 ফিরে যান',
        cancelButton: '❌ বাতিল করুন',

        // Main Menu Buttons
        startVerification: '🚀 ভেরিফিকেশন শুরু',
        buyCards: '💳 কার্ড কিনুন',
        balance: '💰 আমার ব্যালেন্স',
        daily: '🎁 দৈনিক বোনাস',
        addBalance: '💵 ব্যালেন্স যোগ',
        redeemCode: '🎟 কোড ব্যবহার',
        referral: '👥 রেফারেল',
        tasks: '📋 টাস্ক',
        support: '🎫 সাপোর্ট',
        adminPanel: '⚙️ এডমিন প্যানেল',
        language: '🌍 ভাষা',

        // Action Messages
        balanceMsg: (amount) => `💰 **আমার ব্যালেন্স**\n\nবর্তমান ব্যালেন্স: **${amount} ক্রেডিট**\n\nআরও ক্রেডিট প্রয়োজন? এখনই টপ-আপ করুন!`,
        dailySuccess: (amount) => `✅ ${amount} ক্রেডিট ক্লেইম করা হয়েছে!`,
        dailyWait: (msg) => `⏳ ${msg}`,
        insufficientBalance: (cost) => `❌ অপর্যাপ্ত ব্যালেন্স! প্রয়োজন ${cost} ক্রেডিট`,
        verifying: '🔍 মেম্বারশিপ যাচাই করা হচ্ছে...',
        joinRequired: '❌ এই বট ব্যবহার করতে আপনাকে আমাদের চ্যানেলগুলোতে জয়েন করতে হবে!',
        joinChannel: '📢 আপডেট চ্যানেল',
        joinGroup: '💬 আলোচনা গ্রুপ',
        checkJoined: '✅ আমি জয়েন করেছি',
        verifiedWelcome: '✅ যাচাই সম্পন্ন! স্বাগতম!',

        // Services
        selectService: '🛠 **সার্ভিস নির্বাচন করুন:**\nভেরিফিকেশন শুরু করতে একটি সার্ভিসে ক্লিক করুন।',
        serviceInfo: (name, cost) => `${name} (${cost} ক্রেডিট)`,
        outOfStock: '❌ স্টক নেই',
        stockCount: (count) => `✅ স্টক: ${count}`,
        buyConfirm: (service, price) => `💳 **ক্রয় নিশ্চিতকরণ**\n\nসার্ভিস: ${service}\nদাম: ${price} ক্রেডিট\n\nআপনি কি নিশ্চিত?`,
        purchaseSuccess: (service) => `✅ **সফল!** ১টি ${service} ক্রয় করা হয়েছে।\n\nনিচে আপনার ডেলিভারি দেখুন।`,
        verifyStart: (cost) => `🚀 **ভেরিফিকেশন শুরু হচ্ছে...**\n💰 কেটে নেওয়া হয়েছে: ${cost}`,
        verifySuccess: '✅ **সফল!**',
        verifyFail: (err) => `❌ **ব্যর্থ:** ${err}`,
        checkEmail: '📧 ইমেইল চেক করুন!',

        // Payment
        addBalanceMenu: `💵 **ব্যালেন্স যোগ করুন**\n\nআমাদের সেবা ব্যবহার করতে ক্রেডিট কিনুন।\n\n**বর্তমান রেট:**\n• ক্রিপ্টো: ০.০১ USDT প্রতি ক্রেডিট\n\nপরিমাণ নির্বাচন করুন:`,
        paymentSelectMethod: (amount, discount, usd) => `💰 **পেমেন্ট মেথড নির্বাচন করুন**\n\nক্রেডিট: **${amount}**\nছাড়: **${discount}%**\n\n**দাম:** $${usd} USDT\n\nকীভাবে পেমেন্ট করবেন?`,
        paymentInstruction: (method, amount, price, currency, address) => `💳 **পেমেন্ট নির্দেশাবলী**\n\nমেথড: **${method}**\nপরিমাণ: **${amount} ক্রেডিট**\nদাম: **${price} ${currency}**\n\n**টাকা পাঠান এই নম্বরে/ঠিকানায়:**\n\`${address}\`\n\n⚠️ **পেমেন্ট পাঠানোর পর নিচের "Submit Proof" বাটনে ক্লিক করুন।**`,
        submitProof: '✅ প্রমাণ জমা দিন',
        submitProofPrompt: '📸 **পেমেন্ট প্রমাণ জমা দিন**\n\nঅনুগ্রহ করে পেমেন্টের স্ক্রিনশট অথবা ট্রানজেকশন আইডি (TXN ID) পাঠান।',
        paymentSubmitted: (id) => `✅ প্রমাণ জমা দেওয়া হয়েছে (\`${id}\`)\n\nএডমিনের অনুমোদনের জন্য অপেক্ষা করুন।`,
        paymentHistory: '📜 **পেমেন্ট ইতিহাস**',
        noPayments: 'আপনার কোনো পেমেন্ট ইতিহাস নেই।',

        // Support
        supportMenu: (cost, bal) => `🎫 **সাপোর্ট সেন্টার**\n\nআমাদের টিমের সাহায্য নিন।\n\n**খরচ:** ${cost} ক্রেডিট\n**আপনার ব্যালেন্স:** ${bal} ক্রেডিট\n\nসাপোর্ট চ্যানেলে যেতে নিচে ক্লিক করুন।`,
        accessSupport: (cost) => `✅ সাপোর্ট এক্সেস`,
        supportGranted: (cost) => `✅ **সাপোর্ট এক্সেস দেওয়া হয়েছে!**\n\n${cost} ক্রেডিট কেটে নেওয়া হয়েছে।\n\nসাপোর্ট চ্যানেলে জয়েন করতে নিচে ক্লিক করুন:`,
        goToSupport: '💬 সাপোর্টে যান',

        // Referral
        referralStats: (link, count, earnings) => `👥 **রেফারেল সিস্টেম**\n\n🔗 **আপনার লিংক:** \`${link}\`\n💰 **মোট রেফারেল:** ${count}\n💵 **মোট আয়:** ${earnings} ক্রেডিট\n\n🏆 **সেরা রেফারার:**`,
        noRefData: '_(কোনো তথ্য নেই)_',

        // Tasks
        taskList: '📋 **উপলব্ধ টাস্ক**\n\nফ্রি ক্রেডিট পেতে টাস্ক সম্পন্ন করুন!',
        noTasks: '📭 এখন কোনো টাস্ক উপলব্ধ নেই।',
        taskReward: (amount) => `✅ ${amount} ক্রেডিট আয় করেছেন!`,
        taskAlreadyDone: '❌ টাস্ক ইতিমধ্যেই সম্পন্ন করেছেন',

        // Admin
        adminPanelTitle: '⚙️ **এডমিন প্যানেল**\n\nএখান থেকে বট পরিচালনা করুন:',

        // File Upload
        uploadFileMenu: '📂 **বাল্ক আপলোড**\n\nঅনেক কার্ড বা কোড যোগ করতে একটি টেক্সট ফাইল আপলোড করুন।\n\nফরম্যাট: প্রতি লাইনে একটি আইটেম', // Kept from original

        // Settings
        selectLanguage: '🌍 **ভাষা নির্বাচন করুন**\n\nআপনার পছন্দের ভাষা বেছে নিন:' // Kept from original
    }
};

function getText(lang, key, ...args) {
    const langData = languages[lang] || languages['en'];
    const text = langData[key];
    if (typeof text === 'function') return text(...args);
    return text || languages['en'][key] || key;
}

function getUserLanguage(userId, db) {
    const user = (db && typeof db.getUser === 'function') ? db.getUser(userId) : null;
    return (user && user.language) ? user.language : 'en';
}

module.exports = { languages, getText, getUserLanguage };
