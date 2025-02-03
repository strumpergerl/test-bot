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

const binance = new Spot(
	process.env.BINANCE_API_KEY,
	process.env.BINANCE_API_SECRET
);
function getTradeHistoryFile() {
	return config.paperTrading ? 'paper_trades.json' : 'trade_history.json';
}

let config = loadConfig();
let botRunning = config.botRunning || false;
let virtualBalance = config.virtualBalance || 100; // Alapértelmezett virtuális USDC egyenleg
let openPositions = {};

// stop-loss és trailing stop-loss változók
let stopLossPrices = {};
let trailingStopLossPrices = {};

// 📌 USDC egyenleg lekérése (Papírkereskedés esetén a virtuális egyenleget használjuk)
async function getUSDCBalance() {
	if (config.paperTrading) {
		return virtualBalance;
	}
	try {
		let accountInfo = await binance.account();
		let usdcBalance = accountInfo.data.balances.find((b) => b.asset === 'USDC');
		return usdcBalance ? parseFloat(usdcBalance.free) : 0;
	} catch (err) {
		console.error('❌ Hiba az USDC egyenleg lekérésében:', err);
		return 0;
	}
}

// 📊 Indikátorok számítása
async function getIndicators(symbol) {
	// Ellenőrizzük, hogy a symbol létezik, és nem üres
	if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
	  console.error("❌ Hiba: Hiányzik a symbol paraméter.");
	  return null;
	}
	// Távolítsuk el a kapcsos zárójeleket, majd konvertáljuk nagybetűssé
	symbol = symbol.replace(/[{}]/g, "").trim().toUpperCase();
	
	try {
	  let response = await binance.klines(symbol, '15m', { limit: 200 });
	  let closes = response.data.map((c) => parseFloat(c[4]));
	  return {
		rsi: ti.RSI.calculate({ values: closes, period: 14 }).pop(),
		sma50: ti.SMA.calculate({ values: closes, period: 50 }).pop(),
		sma200: ti.SMA.calculate({ values: closes, period: 200 }).pop(),
		currentPrice: closes[closes.length - 1],
	  };
	} catch (err) {
	  console.error('❌ Hiba az indikátorok számításában:', err);
	  return null;
	}
}
  
  

  async function trade() {
	if (!botRunning) return;
	config = loadConfig();
	// Ha nincs "symbols" tömb, akkor fallback a régi "symbol" vagy alapértelmezett 'BTCUSDC'
	const symbols = (config.symbols && config.symbols.length > 0)
	  ? config.symbols
	  : [config.symbol || 'BTCUSDC'];
	
	if (!symbols.length) {
	  console.error("❌ Nincs megadva kereskedési pár a konfigurációban!");
	  return;
	}
	
	for (const symbol of symbols) {
	  await tradeSymbol(symbol);
	}
  }
  

// 🔄 Kereskedési logika (Vétel & Eladás)
async function tradeSymbol(symbol) {
	const indicators = await getIndicators(symbol);
	if (!indicators) return;
	const { rsi, sma50, sma200, currentPrice } = indicators;
	const usdcBalance = await getUSDCBalance();
	const buyLimit = config.buyLimit || 0;
	const availableUSDC = (usdcBalance * buyLimit) / 100;
	const quantity = availableUSDC / currentPrice;

	console.log(config.paperTrading ? ' [PAPER TRADING]' : ' Valós kereskedés');
	console.log(`${usdcBalance} USDC | ${availableUSDC} USDC`);
	console.log(
		`${symbol} | RSI: ${rsi.toFixed(2)} | SMA50: ${sma50.toFixed(
			2
		)} | SMA200: ${sma200.toFixed(2)} | ${currentPrice} USDC | ${quantity}`
	);

	// Vételi logika: ha a RSI < 30 és nincs még nyitott pozíció az adott párban
	if (rsi < 30 && !openPositions[symbol]) {
		console.log(`Túladott piac! VÁSÁRLÁS @ ${currentPrice} USDC for ${symbol}`);
		if (config.paperTrading) {
			if (virtualBalance < availableUSDC) return;
			virtualBalance -= availableUSDC;
			openPositions[symbol] = { type: 'BUY', price: currentPrice, quantity };
			console.log(
				`[PAPER TRADE] BUY @ ${currentPrice} USDC | ${quantity.toFixed(
					6
				)} ${symbol}`
			);
		} else {
			if (usdcBalance < availableUSDC) return;
			await binance.newOrder(symbol, 'BUY', 'MARKET', { quantity });
			openPositions[symbol] = { type: 'BUY', price: currentPrice, quantity };
			console.log(`✅ Valós BUY @ ${currentPrice} USDC for ${symbol}`);
		}
		// Stop-Loss és Trailing Stop-Loss beállítása
		stopLossPrices[symbol] = currentPrice * (1 - config.stopLossPercent / 100);
		trailingStopLossPrices[symbol] =
			currentPrice * (1 - config.trailingStopLossPercent / 100);
		saveTrade('BUY', symbol, currentPrice, quantity);
	}

	// Eladási logika: ha a RSI > 70 és van nyitott pozíció az adott párban
	if (rsi > 70 && openPositions[symbol]) {
		// Frissítjük a trailing stop-ot
		const potentialTrailingStop =
			currentPrice * (1 - config.trailingStopLossPercent / 100);
		if (potentialTrailingStop > trailingStopLossPrices[symbol]) {
			trailingStopLossPrices[symbol] = potentialTrailingStop;
		}
		// Stop-loss aktiválása, ha az ár lecsökken
		if (
			currentPrice <= stopLossPrices[symbol] ||
			currentPrice <= trailingStopLossPrices[symbol]
		) {
			console.log(
				`Stop-Loss aktiválva! ELADÁS @ ${currentPrice} USDC for ${symbol}`
			);
			if (config.paperTrading) {
				virtualBalance += currentPrice * openPositions[symbol].quantity;
				console.log(
					`[PAPER TRADE] SELL @ ${currentPrice} USDC | ${openPositions[symbol].quantity} ${symbol}`
				);
				console.log(`Új virtuális egyenleg: ${virtualBalance.toFixed(2)} USDC`);
			} else {
				await binance.newOrder(symbol, 'SELL', 'MARKET', {
					quantity: openPositions[symbol].quantity,
				});
				console.log(`✅ Valós SELL @ ${currentPrice} USDC for ${symbol}`);
			}
			// Profit/Loss számítása és mentése
			const profitLoss =
				(currentPrice - openPositions[symbol].price) *
				openPositions[symbol].quantity;
			saveTrade(
				'SELL',
				symbol,
				currentPrice,
				openPositions[symbol].quantity,
				profitLoss
			);
			// Töröljük az adott szimbólumhoz tartozó pozíciókat
			delete openPositions[symbol];
			delete stopLossPrices[symbol];
			delete trailingStopLossPrices[symbol];
		}
	}
}

// A függvényt hívjuk meg 5 másodpercenként
setInterval(trade, 5 * 1000);

// 🔥 Trade mentése JSON fájlba
function saveTrade(type, symbol, price, quantity, profitLoss = 0) {
	let historyFile = getTradeHistoryFile();
	let history = [];

	try {
		if (fs.existsSync(historyFile)) {
			history = JSON.parse(fs.readFileSync(historyFile));
		}
	} catch (err) {
		console.error(`❌ Hiba a ${historyFile} olvasásakor:`, err);
	}

	let trade = {
		time: new Date().toISOString(),
		type,
		symbol,
		price,
		quantity,
		profitLoss,
	};
	history.push(trade);
	fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// 🔄 Trade futtatása időzítve (5 percenként)
setInterval(tradeSymbol, 60 * 1000);

// 🔥 API végpontok
app.get('/status', (req, res) =>
	res.json({ running: botRunning, openPositions })
);

app.get('/trade-history', (req, res) => {
	try {
		let history = fs.existsSync(historyFile)
			? JSON.parse(fs.readFileSync(historyFile))
			: [];
		res.json(history);
	} catch (err) {
		console.error('❌ Hiba a trade history olvasásakor:', err);
		res
			.status(500)
			.json({ error: 'Nem sikerült lekérni a trade előzményeket' });
	}
});

app.post('/start', (req, res) => {
	botRunning = true;
	config.botRunning = true;
	saveConfig(config);
	res.json({ message: 'Bot elindult.' });
});

app.post('/stop', (req, res) => {
	botRunning = false;
	config.botRunning = false;
	saveConfig(config);
	res.json({ message: 'Bot leállítva.' });
});

// 🔥 Indítás
// app.listen(4000);

module.exports = {
	trade,         
	saveTrade,
	getIndicators,
	getUSDCBalance,
	binance
  };