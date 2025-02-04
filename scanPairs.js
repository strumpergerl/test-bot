// scanPairs.js
require('dotenv').config();
const { Spot } = require('@binance/connector');
const ti = require('technicalindicators');

const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);

// Delay függvény a rate limit kezelésére
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lekéri az összes USDC-vel kereskedhető párot
async function fetchUSDCpairs() {
  try {
    const exchangeInfo = await binance.exchangeInfo();
    const usdcPairs = exchangeInfo.data.symbols.filter(sym =>
      sym.symbol.endsWith("USDC") && sym.status === "TRADING"
    );
    return usdcPairs.map(sym => sym.symbol);
  } catch (err) {
    console.error("Error fetching exchange info:", err);
    return [];
  }
}

// Lekéri a 15m gyertyákat és kiszámolja az indikátorokat
async function getIndicators(symbol) {
  try {
    const response = await binance.klines(symbol, '15m', { limit: 200 });
    const closes = response.data.map(candle => parseFloat(candle[4]));
    const rsiArr = ti.RSI.calculate({ values: closes, period: 14 });
    const sma50Arr = ti.SMA.calculate({ values: closes, period: 50 });
    const sma200Arr = ti.SMA.calculate({ values: closes, period: 200 });
    const rsi = rsiArr[rsiArr.length - 1];
    const sma50 = sma50Arr[sma50Arr.length - 1];
    const sma200 = sma200Arr[sma200Arr.length - 1];
    const currentPrice = closes[closes.length - 1];
    return { rsi, sma50, sma200, currentPrice };
  } catch (err) {
    console.error(`Error fetching klines for ${symbol}:`, err.message);
    return null;
  }
}

// Precízebb pontozási szabály vételre
function scoreBuy(indicators) {
  if (!indicators) return null;
  if (indicators.rsi >= 35 || indicators.sma50 <= indicators.sma200) return null;
  let baseScore = 35 - indicators.rsi;
  let trendDiffPercent = ((indicators.sma50 - indicators.sma200) / indicators.sma200) * 100;
  let trendScore = trendDiffPercent * 0.3;
  return baseScore + trendScore;
}

// Precízebb pontozási szabály eladásra
function scoreSell(indicators) {
  if (!indicators) return null;
  if (indicators.rsi <= 70) return null;
  let baseScore = indicators.rsi - 70;
  let trendDiffPercent = ((indicators.sma200 - indicators.sma50) / indicators.sma200) * 100;
  let trendScore = trendDiffPercent * 0.2;
  return baseScore + trendScore;
}

// Fő függvény, amely végigmegy az összes USDC páron, és kiszámolja az ajánlásokat
async function scanPairsForRecommendations() {
  const pairs = await fetchUSDCpairs();
  const buyCandidates = [];
  const sellCandidates = [];
  
  for (const symbol of pairs) {
    const indicators = await getIndicators(symbol);
    // Várjunk 200 ms-t minden API hívás után a rate limit miatt
    await delay(200);
    if (!indicators) continue;
    
    const buyScore = scoreBuy(indicators);
    if (buyScore !== null) {
      buyCandidates.push({ symbol, ...indicators, score: buyScore });
    }
    
    const sellScore = scoreSell(indicators);
    if (sellScore !== null) {
      sellCandidates.push({ symbol, ...indicators, score: sellScore });
    }
  }
  
  // Rendezés: magasabb pontszám jobb ajánlás
  buyCandidates.sort((a, b) => b.score - a.score);
  sellCandidates.sort((a, b) => b.score - a.score);
  
  return {
    buyRecommendations: buyCandidates.slice(0, 5),
    sellRecommendations: sellCandidates.slice(0, 5)
  };
}

module.exports = { scanPairsForRecommendations };
