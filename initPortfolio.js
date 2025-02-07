// initPortfolio.js
const { Spot } = require('@binance/connector');
require('dotenv').config();
const { loadPortfolio, savePortfolio } = require('./portfolio');

const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);

// Delay függvény a rate limit kezeléséhez
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Inicializálja a paper trading portfóliót az élő Binance portfólió alapján.
 * - Lekéri a Binance account információkat.
 * - Az USDC esetén közvetlenül veszi az egyenleget.
 * - Más eszközök esetén lekéri az adott eszköz USDC páros árfolyamát (1 perces gyertya alapján),
 *   és ha az adott eszköz USD értéke meghaladja az 1 USD-t, akkor bekerül a virtuális portfólióba.
 * - Végül hozzáad 100 USDC‑t a portfólióhoz, majd elmenti a portfolio.json fájlba.
 */
async function initPaperTradingPortfolio() {
  try {
    const accountInfo = await binance.account();
    const balances = accountInfo.data.balances;
    let virtualPortfolio = {};

    for (const assetObj of balances) {
      const asset = assetObj.asset;
      const free = parseFloat(assetObj.free);
      if (free <= 0) continue;

      if (asset === "USDC") {
        // USDC esetén közvetlenül mentjük az egyenleget
        virtualPortfolio.USDC = free;
      } else {
        // Képezd a kereskedési párt (pl. BTCUSDC)
        const symbol = asset + "USDC";
        try {
          const klinesResponse = await binance.klines(symbol, '1m', { limit: 1 });
          if (klinesResponse.data && klinesResponse.data.length > 0) {
            const currentPrice = parseFloat(klinesResponse.data[0][4]);
            const usdValue = free * currentPrice;
            if (usdValue > 1) {
              virtualPortfolio[asset] = free;
            }
          }
        } catch (err) {
          console.error(`Hiba a ${symbol} árfolyam lekérésekor:`, err.message);
          // Ha hiba van, nem adunk hozzá semmit az adott eszközből
        }
      }
      // Késleltetés az API limitek miatt
      await delay(200);
    }

    // Hozzáadunk 100 USDC-t a portfólióhoz
    if (virtualPortfolio.USDC) {
      virtualPortfolio.USDC += 100;
    } else {
      virtualPortfolio.USDC = 100;
    }

    savePortfolio(virtualPortfolio);
    console.log("Paper trading portfólió inicializálva:", virtualPortfolio);
    return virtualPortfolio;
  } catch (err) {
    console.error("Hiba a paper trading portfólió inicializálásakor:", err);
    return null;
  }
}

module.exports = { initPaperTradingPortfolio };
