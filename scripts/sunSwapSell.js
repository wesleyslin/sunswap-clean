const TronWeb = require('tronweb');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const SUNSWAP_FACTORY_ADDRESS = 'TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY';
const ALLOWED_CHAT_ID = -4797845547;

// Initialize TronWeb for monitoring (no private key needed)
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});

// Initialize Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Cache to store processed events
const processedEvents = new Set();

// Store token addresses temporarily for buy/sell operations
const tokenStore = new Map();

// Store known base tokens
const BASE_TOKENS = {
    "WTRX": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
    "USDT": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "TRX": "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
};

// Simplified initialization function
async function initializeWatchTokens() {
    await sunSwap.initializeBot();
    const bot = sunSwap.getBot();
    
    // Start monitoring
    startMonitoring();
}

// Basic TRC20 ABI for name and symbol
const TRC20_ABI = [
    {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    }
];

// Update getTokenInfo function to properly clean the symbol
async function getTokenInfo(tokenAddress) {
    try {
        const contract = await tronWeb.contract(TRC20_ABI, tokenAddress);
        
        const [nameResult, symbolResult] = await Promise.all([
            tronWeb.transactionBuilder.triggerSmartContract(
                tokenAddress,
                'name()',
                {},
                [],
                tokenAddress
            ),
            tronWeb.transactionBuilder.triggerSmartContract(
                tokenAddress,
                'symbol()',
                {},
                [],
                tokenAddress
            )
        ]);

        // Clean and parse the results
        const cleanHexString = (hex) => {
            if (!hex) return 'Unknown';
            // Convert hex to string and remove all non-printable characters
            return tronWeb.toUtf8(hex)
                .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
                .trim();
        };

        const name = cleanHexString(nameResult?.constant_result?.[0]);
        const symbol = cleanHexString(symbolResult?.constant_result?.[0]);

        console.log(`Token info for ${tokenAddress}:`, { name, symbol });
        return { name, symbol };
    } catch (error) {
        console.error(`Error getting token info for ${tokenAddress}:`, error.message);
        return { name: 'Unknown', symbol: 'Unknown' };
    }
}

async function checkNewPairs() {
    try {
        const events = await tronWeb.event.getEventsByContractAddress(
            SUNSWAP_FACTORY_ADDRESS,
            {
                eventName: 'PairCreated',
                onlyConfirmed: true,
                limit: 1,
                orderBy: 'block_timestamp,desc'
            }
        );

        if (!events || !Array.isArray(events) || events.length === 0) {
            return;
        }

        const event = events[0];
        if (processedEvents.has(event.transaction)) {
            return;
        }

        processedEvents.add(event.transaction);

        // Convert hex addresses to TRON base58 format
        const token0 = tronWeb.address.fromHex('41' + event.result.token0.slice(2));
        const token1 = tronWeb.address.fromHex('41' + event.result.token1.slice(2));
        const pair = tronWeb.address.fromHex('41' + event.result.pair.slice(2));

        console.log('\nNew Pair Found:');
        console.log('Token0:', token0);
        console.log('Token1:', token1);
        console.log('Pair:', pair);

        // Get info for both tokens
        const token0Info = await getTokenInfo(token0);
        const token1Info = await getTokenInfo(token1);

        // Determine which is the new token and which is the base token
        let newToken, newTokenInfo, baseToken, baseTokenInfo;
        
        // Check if either token is a base token by address
        if (Object.values(BASE_TOKENS).includes(token0)) {
            newToken = token1;
            newTokenInfo = token1Info;
            baseToken = token0;
            baseTokenInfo = token0Info;
        } else if (Object.values(BASE_TOKENS).includes(token1)) {
            newToken = token0;
            newTokenInfo = token0Info;
            baseToken = token1;
            baseTokenInfo = token1Info;
        } else {
            // If neither is a known base token, assume token1 is the new token
            newToken = token1;
            newTokenInfo = token1Info;
            baseToken = token0;
            baseTokenInfo = token0Info;
        }

        // Add alert for USA/US/TRUMP token
        let alertPrefix = '';
        if (newTokenInfo.symbol === 'USA' || newTokenInfo.symbol === 'US' || 
            newTokenInfo.symbol.includes('USA') || newTokenInfo.symbol.includes('US') ||
            newTokenInfo.symbol === 'TRUMP' || newTokenInfo.symbol.includes('TRUMP')) {
            alertPrefix = `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 ALERT: ${newTokenInfo.symbol} TOKEN DETECTED! 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 ALERT: ${newTokenInfo.symbol} TOKEN DETECTED! 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 ALERT: ${newTokenInfo.symbol} TOKEN DETECTED! 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 ALERT: ${newTokenInfo.symbol} TOKEN DETECTED! 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n\n`;
        }

        // Modified message format without buy/sell buttons
        const message = `${alertPrefix}───────────────
🚀 New SunSwap Pair!

New Token (${newTokenInfo.symbol}): <code>${newToken}</code>
Paired with ${baseTokenInfo.symbol}: <code>${baseToken}</code>

🔍 <a href="https://tronscan.org/#/token20/${newToken}">View Token</a> | 📊 <a href="https://dexscreener.com/tron/${newToken}">DEX</a> | 💱 <a href="https://sun.io/#/home">Trade on SunSwap</a>
───────────────`;

        await bot.sendMessage(ALLOWED_CHAT_ID, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    } catch (error) {
        console.error('Error checking new pairs:', error);
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log('Starting to monitor for new token pairs...');
    
    while (true) {
        await checkNewPairs();
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Start monitoring
console.log('Initializing token monitoring...');
startMonitoring().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
