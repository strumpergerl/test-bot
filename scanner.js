// scanPairs.js
require('dotenv').config();
const { Spot } = require('@binance/connector');
const ti = require('technicalindicators');

const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);

// Delay függvény, ami ms milliszekundum után visszaad egy resolved Promise-t
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lekéri az összes USDC-vel kereskedhető párt
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

// Lekéri a 15m gyertyákat és számolja a technikai indikátorokat
async function getIndicators(symbol) {
  try {
    const response = await binance.klines(symbol, '15m', { limit: 200 });
    const closes = response.data.map(candle => parseFloat(candle[4]));
    const rsiArr = ti.RSI.calculate({ values: closes, period: 14 });
    const sma50Arr = ti.SMA.calculate({ values: closes, period: 50 });
    const sma200Arr = ti.SMA.calculate({ values: closes, period: 200 });
    // Legutolsó (aktuális) értékek
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

// szabályok vételre:
function scoreBuy(indicators) {
    if (!indicators) return null;
    // Csak akkor javasoljuk a vételt, ha az RSI kisebb, mint 30 és bullish trend van (SMA50 > SMA200)
    if (indicators.rsi >= 30 || indicators.sma50 <= indicators.sma200) return null;
    
    // Alap pontszám: minél alacsonyabb az RSI, annál jobb
    let baseScore = 30 - indicators.rsi;
    
    // Számoljuk ki az SMA különbséget százalékban
    let trendDiffPercent = ((indicators.sma50 - indicators.sma200) / indicators.sma200) * 100;
    
    // Súlyozzuk a trend jelzést (például 0.2-es súllyal)
    let trendScore = trendDiffPercent * 0.2;
    
    return baseScore + trendScore;
  }
  
  // szabályok eladásra:
  function scoreSell(indicators) {
    if (!indicators) return null;
    // Csak akkor javasoljuk az eladást, ha az RSI nagyobb, mint 70
    if (indicators.rsi <= 70) return null;
    
    // Alap pontszám: minél magasabb az RSI, annál erősebb az eladási jelzés
    let baseScore = indicators.rsi - 70;
    
    // Ha bearish trend van (SMA50 < SMA200), akkor számoljuk ki a százalékos különbséget
    let trendDiffPercent = ((indicators.sma200 - indicators.sma50) / indicators.sma200) * 100;
    
    // Súlyozzuk a trend jelzést (például 0.2-es súllyal)
    let trendScore = trendDiffPercent * 0.2;
    
    return baseScore + trendScore;
  }
  

async function scanPairs() {
  const pairs = await fetchUSDCpairs();
  console.log(`Found ${pairs.length} USDC trading pairs.`);
  const buyCandidates = [];
  const sellCandidates = [];
  
  // Iterálunk minden USDC páron, és minden API hívás után várunk 200ms-t
  for (const symbol of pairs) {
    const indicators = await getIndicators(symbol);
    // Várjunk 200 ms-t a következő hívás előtt
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
  
  console.log("\nTop 5 Buy Recommendations:");
  buyCandidates.slice(0, 5).forEach(candidate => {
    console.log(
      `Symbol: ${candidate.symbol}, RSI: ${candidate.rsi.toFixed(2)}, SMA50: ${candidate.sma50.toFixed(2)}, SMA200: ${candidate.sma200.toFixed(2)}, Price: ${typeof candidate.currentPrice === 'number' ? candidate.currentPrice.toFixed(2) : '-'}, Score: ${candidate.score.toFixed(2)}`
    );
  });
  
  console.log("\nTop 5 Sell Recommendations:");
  sellCandidates.slice(0, 5).forEach(candidate => {
    console.log(
      `Symbol: ${candidate.symbol}, RSI: ${candidate.rsi.toFixed(2)}, SMA50: ${candidate.sma50.toFixed(2)}, SMA200: ${candidate.sma200.toFixed(2)}, Price: ${typeof candidate.currentPrice === 'number' ? candidate.currentPrice.toFixed(2) : '-'}, Score: ${candidate.score.toFixed(2)}`
    );
  });
}

scanPairs();
