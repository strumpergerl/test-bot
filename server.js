require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Spot } = require('@binance/connector');
const fs = require('fs');
const ti = require('technicalindicators');

const settingsFile = "settings.json";

function getSettings() {
    try {
        return fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
    } catch (err) {
        console.error('❌ Hiba a settings.json beolvasásakor:', err);
        return {};
    }
}
const settings = getSettings();

const app = express();
app.use(express.json());
app.use(cors());

const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);

let botRunning = false;
let botData = {
    symbol: settings.symbol,
    rsi: null,
    sma50: null,
    sma200: null,
    currentPrice: null,
    stopLoss: null,
    trailingStop: null
};

// ⚡ Kereskedési pár beállítása a settings.json alapján
function getTradingPair() {
	try {
		return settings.symbol;
	} catch (err) {
		console.error('❌ Hiba a settings.json beolvasásakor:', err);
		return;
	}
}

// 📊 Indikátorok számítása
async function getIndicators(symbol) {
    try {
        let response = await binance.klines(symbol, "15m", { limit: 200 });
        let candles = response.data;
        if (!candles || !Array.isArray(candles) || candles.length === 0) return null;

        let closes = candles.map(c => parseFloat(c[4]));
        let rsi = ti.RSI.calculate({ values: closes, period: 14 });
        let sma50 = ti.SMA.calculate({ values: closes, period: 50 });
        let sma200 = ti.SMA.calculate({ values: closes, period: 200 });

        return {
            rsi: rsi[rsi.length - 1],
            sma50: sma50[sma50.length - 1],
            sma200: sma200[sma200.length - 1],
            currentPrice: closes[closes.length - 1]
        };
    } catch (err) {
        console.error("❌ Hiba az indikátorok számításában:", err);
        return null;
    }
}

// 🔄 Kereskedési folyamat
async function trade() {
    if (!botRunning) return;
    let symbol = getTradingPair();
    let indicators = await getIndicators(symbol);
    if (!indicators) return;

    botData = {
        symbol,
        ...indicators
    };

    console.log(`📊 ${symbol} | RSI: ${indicators.rsi} | SMA50: ${indicators.sma50} | SMA200: ${indicators.sma200} | Ár: ${indicators.currentPrice} USDC`);
}

// ⏳ Időzített futtatás
setInterval(trade, 5 * 60 * 1000);

// 🔥 Teljes spot portfólió lekérése
app.get('/balance', async (req, res) => {
    try {
        let accountInfo = await binance.account();
        let balances = accountInfo.data.balances;

        // Csak azokat az eszközöket mutatjuk, amelyeknek van szabad egyenlegük
        let portfolio = balances
            .filter(asset => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0)
            .map(asset => ({
                asset: asset.asset,
                free: asset.free,
                locked: asset.locked
            }));

        res.json({ portfolio });
    } catch (err) {
        console.error("❌ Hiba az egyenleg lekérésében:", err);
        res.status(500).json({ error: "Nem sikerült lekérni az egyenleget" });
    }
});

const tradeHistoryFile = "trade_history.json"; // 🔥 Itt adjuk hozzá

app.get('/trade-history', (req, res) => {
    try {
        let history = fs.existsSync(tradeHistoryFile) ? JSON.parse(fs.readFileSync(tradeHistoryFile)) : [];
        res.json(history);
    } catch (err) {
        console.error("❌ Hiba a trade history olvasásakor:", err);
        res.status(500).json({ error: "Nem sikerült lekérni a trade előzményeket" });
    }
});

const paperTradeHistoryFile = "paper_trades.json";

// 🔥 Paper trade előzmények lekérése
app.get('/paper-trade-history', (req, res) => {
    try {
        let history = [];
        
        if (fs.existsSync(paperTradeHistoryFile)) {
            const fileContent = fs.readFileSync(paperTradeHistoryFile, 'utf8').trim();
            history = fileContent.length > 0 ? JSON.parse(fileContent) : [];
        } else {
            fs.writeFileSync(paperTradeHistoryFile, JSON.stringify([]), 'utf8');
        }

        res.json(history);
    } catch (err) {
        console.error("❌ Hiba a paper trade history olvasásakor:", err);
        res.status(500).json({ error: "Nem sikerült lekérni a paper trade előzményeket" });
    }
});



function getBotStatus() {
    try {
        let settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
        return settings.botRunning || false;
    } catch (err) {
        console.error("❌ Hiba a bot állapotának olvasásakor:", err);
        return false;
    }
}

function updateBotStatus(running) {
    try {
        let settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
        settings.botRunning = running;
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error("❌ Hiba a bot státusz mentésekor:", err);
    }
}

function getTradingMode() {
    try {
        let settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
        return settings.paperTrading ? "Paper Trading" : "Valódi Pénz";
    } catch (err) {
        console.error("❌ Hiba a trading mód olvasásakor:", err);
        return "Ismeretlen";
    }
}

function getBuyLimit() {
    try {
        let settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
        return settings.buyLimit || 100; // Alapértelmezett érték: 100%
    } catch (err) {
        console.error("❌ Hiba a vásárlási limit olvasásakor:", err);
        return 100;
    }
}

function updateBuyLimit(limit) {
    try {
        let settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
        settings.buyLimit = limit;
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error("❌ Hiba a vásárlási limit mentésekor:", err);
    }
}


// **📌 API végpontok**
app.get('/status', (req, res) => {
    res.json({
        running: getBotStatus(),
        data: botData
    });
});

app.post('/start', (req, res) => {
    updateBotStatus(true);
    res.json({ message: "Bot elindult." });
});

app.post('/stop', (req, res) => {
    updateBotStatus(false);
    res.json({ message: "Bot leállítva." });
});

app.post('/set-pair', (req, res) => {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ message: "Hiányzó kereskedési pár." });

    fs.writeFileSync("settings.json", JSON.stringify({ symbol }, null, 2));
    botData.symbol = symbol;
    res.json({ message: `Kereskedési pár módosítva: ${symbol}` });
});

app.get('/trading-mode', (req, res) => {
    res.json({ mode: getTradingMode() });
});


app.get('/buy-limit', (req, res) => {
    res.json({ buyLimit: getBuyLimit() });
});

app.post('/buy-limit', (req, res) => {
    const { limit } = req.body;
    if (typeof limit !== "number" || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "A vásárlási limitnek 1 és 100 között kell lennie." });
    }
    updateBuyLimit(limit);
    res.json({ message: `Vásárlási limit frissítve: ${limit}%` });
});

// 🔥 Indítás
app.listen(3000, () => console.log("✅ API fut a 3000-es porton"));
