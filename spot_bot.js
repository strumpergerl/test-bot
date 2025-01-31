require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Spot } = require('@binance/connector');
const fs = require('fs');
const ti = require('technicalindicators');
const { loadConfig, saveConfig } = require('./config');

const app = express();
app.use(express.json());
app.use(cors());

const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);
const tradeHistoryFile = "trade_history.json";

let config = loadConfig();
let botRunning = config.botRunning || false;
let virtualBalance = config.virtualBalance || 100;
let openPosition = null;

// 📌 USDC egyenleg lekérése
async function getUSDCBalance() {
    console.log("🔄 USDC egyenleg lekérése...");
    try {
        let accountInfo = await binance.account();
        let usdcBalance = accountInfo.data.balances.find(b => b.asset === "USDC");
        return usdcBalance ? parseFloat(usdcBalance.free) : 0;
    } catch (err) {
        console.error("❌ Hiba az USDC egyenleg lekérésében:", err);
        return 0;
    }
}

// 📊 Indikátorok számítása
async function getIndicators(symbol) {
    try {
        let response = await binance.klines(symbol, "15m", { limit: 200 });
        let closes = response.data.map(c => parseFloat(c[4]));
        
        return {
            rsi: ti.RSI.calculate({ values: closes, period: 14 }).pop(),
            sma50: ti.SMA.calculate({ values: closes, period: 50 }).pop(),
            sma200: ti.SMA.calculate({ values: closes, period: 200 }).pop(),
            currentPrice: closes[closes.length - 1]
        };
    } catch (err) {
        console.error("❌ Hiba az indikátorok számításában:", err);
        return null;
    }
}

// 🔄 Kereskedési logika (Vétel & Eladás)
async function trade() {
    if (!botRunning) {
        console.log("⛔ A bot nem fut, nem végzünk kereskedést.");
        return;
    }

    config = loadConfig();
    let symbol = config.symbol || "BTCUSDC";
    let indicators = await getIndicators(symbol);
    if (!indicators) return;
    
    let { rsi, sma50, sma200, currentPrice } = indicators;
    console.log(`📊 Indikátorok: RSI: ${indicators.rsi.toFixed(2)} | SMA50: ${indicators.sma50.toFixed(2)} | SMA200: ${indicators.sma200.toFixed(2)}`);

    let usdcBalance = await getUSDCBalance();
    let buyLimit = config.buyLimit / 100;
    let availableUSDC = usdcBalance * buyLimit;
    let quantity = availableUSDC / currentPrice;

    console.log(`💰 USDC egyenleg: ${usdcBalance.toFixed(2)} USDC | Vásárlási limit: ${buyLimit * 100}% | Elérhető USDC: ${availableUSDC.toFixed(2)} USDC`);

    // ✅ VÉTELI LOGIKA: RSI < 30 és bullish trend (SMA50 > SMA200)
    if (rsi < 30 && sma50 > sma200 && !openPosition) {
        console.log(`📉 Túladott piac! VÁSÁRLÁS @ ${currentPrice} USDC`);

        if (config.paperTrading) {
            if (virtualBalance < availableUSDC) return;
            virtualBalance -= availableUSDC;
            openPosition = { type: "BUY", price: currentPrice, quantity };
            console.log(`📝 [PAPER TRADE] BUY @ ${currentPrice} USDC | ${quantity.toFixed(6)} ${symbol}`);
        } else {
            if (usdcBalance < availableUSDC) return;
            await binance.newOrder(symbol, 'BUY', 'MARKET', { quantity });
            openPosition = { type: "BUY", price: currentPrice, quantity };
            console.log(`✅ Valós BUY @ ${currentPrice} USDC`);
        }

        saveTrade("BUY", symbol, currentPrice, quantity);
    }

    // ✅ ELADÁSI LOGIKA: RSI > 70 és van nyitott pozíció
    if (rsi > 70 && openPosition) {
        console.log(`📈 Túlvett piac! ELADÁS @ ${currentPrice} USDC`);

        if (config.paperTrading) {
            virtualBalance += currentPrice * openPosition.quantity;
            console.log(`📝 [PAPER TRADE] SELL @ ${currentPrice} USDC | ${openPosition.quantity} ${symbol}`);
            console.log(`💰 Új virtuális egyenleg: ${virtualBalance.toFixed(2)} USDC`);
        } else {
            await binance.newOrder(symbol, 'SELL', 'MARKET', { quantity: openPosition.quantity });
            console.log(`✅ Valós SELL @ ${currentPrice} USDC`);
        }

        saveTrade("SELL", symbol, currentPrice, openPosition.quantity);
        openPosition = null;
    }
}

// 🔥 Trade mentése JSON fájlba
function saveTrade(type, symbol, price, quantity) {
    let history = [];
    try {
        if (fs.existsSync(tradeHistoryFile)) {
            history = JSON.parse(fs.readFileSync(tradeHistoryFile));
        }
    } catch (err) {
        console.error("❌ Hiba a trade history olvasásakor:", err);
    }

    let trade = { time: new Date().toISOString(), type, symbol, price, quantity };
    history.push(trade);
    fs.writeFileSync(tradeHistoryFile, JSON.stringify(history, null, 2));
}

// 🔄 Trade futtatása időzítve (5 percenként)
setInterval(trade, 5 * 1000);
// setInterval(trade, 5 * 60 * 1000);

// 🔥 API végpontok
app.get('/status', (req, res) => res.json({ running: botRunning, openPosition }));

app.get('/trade-history', (req, res) => {
    try {
        let history = fs.existsSync(tradeHistoryFile) ? JSON.parse(fs.readFileSync(tradeHistoryFile)) : [];
        res.json(history);
    } catch (err) {
        console.error("❌ Hiba a trade history olvasásakor:", err);
        res.status(500).json({ error: "Nem sikerült lekérni a trade előzményeket" });
    }
});

app.post('/start', (req, res) => {
    botRunning = true;
    config.botRunning = true;
    saveConfig(config);
    res.json({ message: "Bot elindult." });
});

app.post('/stop', (req, res) => {
    botRunning = false;
    config.botRunning = false;
    saveConfig(config);
    res.json({ message: "Bot leállítva." });
});

// 🔥 Indítás
// app.listen(4000, () => console.log("✅ Trading bot API fut a 4000-es porton"));
