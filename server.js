require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { loadConfig, saveConfig } = require('./config');
// Importáljuk a spot_bot.js-ből a szükséges függvényeket és a binance instance-t
const { getIndicators, getUSDCBalance, binance } = require('./spot_bot');
const { scanPairsForRecommendations } = require('./scanPairs'); 

const app = express();
app.use(express.json());
app.use(cors());

let config = loadConfig();

// Segédfüggvény: trade history fájl neve a konfiguráció alapján
function getTradeHistoryFile() {
  config = loadConfig();
  return config.paperTrading ? 'paper_trades.json' : 'trade_history.json';
}

// /scan-recommendations
app.get('/scan-recommendations', async (req, res) => {
    try {
      const recommendations = await scanPairsForRecommendations();
      res.json(recommendations);
    } catch (err) {
      console.error("Error scanning pairs:", err);
      res.status(500).json({ error: "Hiba a kereskedési ajánlások lekérésekor" });
    }
  });

/**
 * GET /status
 * Lekéri a bot állapotát, valamint élő adatokat a Binance API-ról az első (fő) kereskedési párra.
 */
app.get('/status', async (req, res) => {
  config = loadConfig();
  // Ha több pár van, vegyük az elsőt (vagy itt később módosíthatod, hogy tömbben adja vissza)
  let symbol = (config.symbols && config.symbols.length > 0) ? config.symbols[0] : (config.symbol || 'BTCUSDC');
  let indicators = await getIndicators(symbol);
  let usdcBalance = await getUSDCBalance();
  res.json({
    running: config.botRunning,
    data: {
      symbol: symbol,
      paperTrading: config.paperTrading,
      rsi: indicators ? indicators.rsi : null,
      sma50: indicators ? indicators.sma50 : null,
      sma200: indicators ? indicators.sma200 : null,
      currentPrice: indicators ? indicators.currentPrice : null,
      usdcBalance: usdcBalance
      // Ha a stop-loss értékek kezelése is megoldott van a kereskedési logikában, azt is be lehet építeni.
    }
  });
});

/**
 * GET /buy-limit
 * Visszaadja a jelenlegi vásárlási limitet a konfigurációból.
 */
app.get('/buy-limit', (req, res) => {
  config = loadConfig();
  res.json({ buyLimit: config.buyLimit });
});

/**
 * GET /trading-mode
 * Visszaadja, hogy a bot paper trading vagy real trading módban van.
 */
app.get('/trading-mode', (req, res) => {
  config = loadConfig();
  res.json({ mode: config.paperTrading ? 'Paper Trading' : 'Real Trading' });
});

/**
 * GET /balance
 * Visszaadja a portfólió adatait. Ha paper trading, akkor a virtuális egyenleget; ha real trading,
 * akkor a Binance API-ról lekért adatokat.
 */
app.get('/balance', async (req, res) => {
  config = loadConfig();
  if (config.paperTrading) {
    // Paper trading esetén a virtuális USDC egyenleggel térünk vissza
    res.json({
      portfolio: [
        { asset: 'USDC', free: config.virtualBalance, locked: 0 }
      ]
    });
  } else {
    try {
      let accountInfo = await binance.account();
      // Csak azokat az eszközöket adjuk vissza, amelyekből van szabad egyenleg
      let portfolio = accountInfo.data.balances.filter(b => parseFloat(b.free) > 0);
      res.json({ portfolio });
    } catch (err) {
      console.error("❌ Hiba a portfólió lekérésekor:", err);
      res.status(500).json({ error: "Nem sikerült lekérni a portfóliót" });
    }
  }
});

/**
 * POST /set-pair
 * Frissíti a kereskedési pár(oka)t a konfigurációban.
 * A UI vesszővel elválasztott stringet küld, amit tömbbé alakítunk.
 */
app.post('/set-pair', (req, res) => {
  if (!req.body.symbol)
    return res.status(400).json({ message: "Hiányzó kereskedési pár." });
  const symbols = req.body.symbol.split(',').map(s => s.trim()).filter(s => s !== '');
  config.symbols = symbols;
  config.symbol = symbols[0];
  saveConfig(config);
  res.json({ message: `Kereskedési pár módosítva: ${symbols.join(', ')}` });
});

/**
 * POST /buy-limit
 * Frissíti a vásárlási limitet.
 */
app.post('/buy-limit', (req, res) => {
  const { limit } = req.body;
  if (typeof limit !== "number" || limit < 1 || limit > 100) {
    return res.status(400).json({ message: "A vásárlási limitnek 1 és 100 között kell lennie." });
  }
  config.buyLimit = limit;
  saveConfig(config);
  res.json({ message: `Vásárlási limit frissítve: ${limit}%` });
});

/**
 * GET /trade-history
 * Visszaadja a trade előzményeket a megfelelő JSON fájlból.
 */
app.get('/trade-history', (req, res) => {
    getHistory(getTradeHistoryFile(), res, "trade history");
});

app.get('/paper-trade-history', (req, res) => {
    getHistory(getTradeHistoryFile(), res, "paper trade history");
});

function getHistory(fileName, res, historyType) {
    try {
        let history = fs.existsSync(fileName)
            ? JSON.parse(fs.readFileSync(fileName))
            : [];
        res.json(history);
    } catch (err) {
        console.error(`❌ Hiba a ${historyType} olvasásakor:`, err);
        res.status(500).json({ error: `Nem sikerült lekérni a ${historyType} előzményeket` });
    }
}

// Indítás
app.listen(3000, () => console.log("✅ API fut a 3000-es porton"));
console.log(" Spot bot elindítva!");
