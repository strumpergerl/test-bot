require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Spot } = require('@binance/connector');
const fs = require('fs');
const ti = require('technicalindicators');

const app = express();
app.use(express.json());
app.use(cors());

const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);
const settingsFile = 'settings.json';
const tradeHistoryFile = 'trade_history.json';
const paperTradeHistoryFile = 'paper_trades.json';

// 📌 Beállítások betöltése
function getSettings() {
    try {
        return fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
    } catch (err) {
        console.error('❌ Hiba a settings.json beolvasásakor:', err);
        return {};
    }
}
const settings = getSettings();

let botRunning = settings.botRunning || false;
let botData = { symbol: settings.symbol || "BTCUSDC", rsi: null, sma50: null, sma200: null, currentPrice: null };
const PAPER_TRADING = settings.paperTrading || false;
let virtualBalance = 100; // Kezdő USDC egyenleg papírkereskedéshez
let openPosition = null; // Aktív trade állapot
let lastUsdcBalance = null;
let lastVirtualBalance = null;

// 📌 USDC egyenleg lekérése
async function getUSDCBalance() {
    try {
        let accountInfo = await binance.account();
        let balances = accountInfo.data.balances;
        let usdcBalance = balances.find((b) => b.asset === 'USDC');
        return usdcBalance ? parseFloat(usdcBalance.free) : 0;
    } catch (err) {
        console.error('❌ Hiba az USDC egyenleg lekérésében:', err);
        return 0;
    }
}

// 📌 Kereskedési pár beolvasása settings.json-ból
function getTradingPair() {
    return settings.symbol || 'BTCUSDC';
}

// 📊 Indikátorok számítása
async function getIndicators(symbol) {
    try {
        let response = await binance.klines(symbol, '15m', { limit: 200 });
        let candles = response.data;
        if (!candles || !Array.isArray(candles) || candles.length === 0) return null;

        let closes = candles.map((c) => parseFloat(c[4]));
        let rsi = ti.RSI.calculate({ values: closes, period: 14 });
        let sma50 = ti.SMA.calculate({ values: closes, period: 50 });
        let sma200 = ti.SMA.calculate({ values: closes, period: 200 });

        return {
            rsi: rsi.length > 0 ? rsi[rsi.length - 1] : 'N/A',
            sma50: sma50.length > 0 ? sma50[sma50.length - 1] : 'N/A',
            sma200: sma200.length > 0 ? sma200[sma200.length - 1] : 'N/A',
            currentPrice: closes.length > 0 ? closes[closes.length - 1] : 'N/A',
        };
    } catch (err) {
        console.error('❌ Hiba az indikátorok számításában:', err);
        return null;
    }
}

// 📌 Trade mentése JSON fájlba
function saveTrade(type, symbol, price, quantity, isPaperTrade = false) {
    let historyFile = isPaperTrade ? paperTradeHistoryFile : tradeHistoryFile;
    let history = [];

    try {
        if (fs.existsSync(historyFile)) {
            const fileContent = fs.readFileSync(historyFile, 'utf8');
            history = fileContent.trim().length > 0 ? JSON.parse(fileContent) : [];
        }
    } catch (err) {
        console.error(`❌ Hiba a trade history olvasásakor:`, err);
        history = [];
    }

    let trade = { time: new Date().toISOString(), type, symbol, price, quantity };
    history.push(trade);

    try {
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
        console.log(`✅ Trade mentve: ${type} @ ${price} USDC | ${quantity} ${symbol}`);
    } catch (err) {
        console.error(`❌ Hiba a trade history mentésekor:`, err);
    }
}

// 🔄 Kereskedési logika
async function trade() {
    if (!botRunning) {
        console.log('⛔ A bot nem fut, nem végzünk kereskedést.');
        return;
    }

    try {
        let SYMBOL = getTradingPair();
        let indicators = await getIndicators(SYMBOL);
        if (!indicators) return;

        let { rsi, sma50, sma200, currentPrice } = indicators;
        console.log(`🔹 ${SYMBOL} | RSI: ${rsi} | SMA50: ${sma50} | SMA200: ${sma200} | Ár: ${currentPrice} USDC`);
        console.log(`🔍 Open Position: ${openPosition ? "Igen" : "Nincs"}`);

        let buyLimit = settings.buyLimit / 100 || 1.0;
        let availableUSDC = PAPER_TRADING ? virtualBalance * buyLimit : await getUSDCBalance() * buyLimit;
        let quantity = (availableUSDC / currentPrice).toFixed(6);

        console.log(`💰 USDC Egyenleg: ${availableUSDC} USDC | Vásárolható mennyiség: ${quantity} ${SYMBOL}`);

        // if (rsi < 55 && currentPrice > sma50 && sma50 > sma200 && openPosition === null) {
        if (rsi < 55 && openPosition === null) {
            console.log("📉 Túladott és emelkedő trend! Vásárlás (BUY)");

            if (PAPER_TRADING) {
                virtualBalance -= availableUSDC;
                openPosition = { type: "buy", price: currentPrice, quantity };
            } else {
                await binance.newOrder(SYMBOL, 'BUY', 'MARKET', { quantity });
                openPosition = { type: "buy", price: currentPrice, quantity };
            }

            saveTrade("BUY", SYMBOL, currentPrice, quantity, PAPER_TRADING);
        } else if (rsi > 60 && openPosition !== null) {
            console.log('📈 Túlvett! Eladás (SELL)');

            if (PAPER_TRADING) {
                virtualBalance += currentPrice * openPosition.quantity;
                openPosition = null;
            } else {
                await binance.newOrder(SYMBOL, 'SELL', 'MARKET', { quantity: openPosition.quantity });
                openPosition = null;
            }

            saveTrade('SELL', SYMBOL, currentPrice, openPosition?.quantity || 0, PAPER_TRADING);
        }
    } catch (err) {
        console.error('❌ Hiba a trade() függvényben:', err);
    }
}

// 🔥 API végpontok
app.get('/status', (req, res) => res.json({ running: botRunning, data: botData }));
app.post('/start', (req, res) => { botRunning = true; res.json({ message: 'Bot elindult.' }); });
app.post('/stop', (req, res) => { botRunning = false; res.json({ message: 'Bot leállítva.' }); });
app.post('/set-pair', (req, res) => {
	const { symbol } = req.body;
	if (!symbol)
		return res.status(400).json({ message: 'Hiányzó kereskedési pár.' });

	fs.writeFileSync('settings.json', JSON.stringify({ symbol }, null, 2));
	botData.symbol = symbol;
	res.json({ message: `Kereskedési pár módosítva: ${symbol}` });
});

app.get('/trade-history', (req, res) => {
	try {
		let history = fs.existsSync(tradeHistoryFile)
			? JSON.parse(fs.readFileSync(tradeHistoryFile))
			: [];
		res.json(history);
	} catch (err) {
		console.error('❌ Hiba a trade history olvasásakor:', err);
		res
			.status(500)
			.json({ error: 'Nem sikerült lekérni a trade előzményeket' });
	}
});

setInterval(trade, 5 * 1000);
// app.listen(3000, () => console.log('🚀 Spot Bot fut a 3000-es porton'));

module.exports = { saveTrade, trade };

// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const { Spot } = require('@binance/connector');
// const fs = require('fs');
// const ti = require('technicalindicators');

// const app = express();
// app.use(express.json());
// app.use(cors());

// const binance = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);
// const tradeHistoryFile = 'trade_history.json';
// const paperTradeHistoryFile = 'paper_trades.json';
// const settingsFile = 'settings.json';

// function getSettings() {
//     try {
//         return fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
//     } catch (err) {
//         console.error('❌ Hiba a settings.json beolvasásakor:', err);
//         return {};
//     }
// }
// const settings = getSettings();

// let botRunning = settings.botRunning;
// let botData = {
// 	symbol: settings.symbol,
// 	rsi: null,
// 	sma50: null,
// 	sma200: null,
// 	currentPrice: null,
// 	stopLoss: null,
// 	trailingStop: null,
// };

// const PAPER_TRADING = settings.paperTrading // Állítsd "false"-ra, ha élesben szeretnéd futtatni

// let virtualBalance = 100; // Kezdő USDC tőke papírkereskedéshez
// let openPosition = null; // Nyitott pozíció papír módban

// let lastUsdcBalance = null;
// let lastVirtualBalance = null;

// // 📌 USDC egyenleg lekérése
// async function getUSDCBalance() {
// 	try {
// 		let accountInfo = await binance.account();
// 		let balances = accountInfo.data.balances;
// 		let usdcBalance = balances.find((b) => b.asset === 'USDC');
// 		return usdcBalance ? parseFloat(usdcBalance.free) : 0;
// 	} catch (err) {
// 		console.error('❌ Hiba az USDC egyenleg lekérésében:', err);
// 		return 0;
// 	}
// }

// // 📌 Kereskedési pár beolvasása settings.json-ból
// function getTradingPair() {
// 	try {
// 		return settings.symbol;
// 	} catch (err) {
// 		console.error('❌ Hiba a settings.json beolvasásakor:', err);
// 		return;
// 	}
// }

// // 📊 Indikátorok számítása
// async function getIndicators(symbol) {
// 	try {
// 		let response = await binance.klines(symbol, '15m', { limit: 200 });
// 		let candles = response.data;
// 		if (!candles || !Array.isArray(candles) || candles.length === 0)
// 			return null;

// 		let closes = candles.map((c) => parseFloat(c[4]));
// 		let rsi = ti.RSI.calculate({ values: closes, period: 14 });
// 		let sma50 = ti.SMA.calculate({ values: closes, period: 50 });
// 		let sma200 = ti.SMA.calculate({ values: closes, period: 200 });

// 		return {
// 			rsi: rsi.length > 0 ? rsi[rsi.length - 1] : 'N/A',
// 			sma50: sma50.length > 0 ? sma50[sma50.length - 1] : 'N/A',
// 			sma200: sma200.length > 0 ? sma200[sma200.length - 1] : 'N/A',
// 			currentPrice: closes.length > 0 ? closes[closes.length - 1] : 'N/A',
// 		};
// 	} catch (err) {
// 		console.error('❌ Hiba az indikátorok számításában:', err);
// 		return null;
// 	}
// }

// // 🔥 Trade mentése JSON fájlba
// function saveTrade(type, symbol, price, quantity, isPaperTrade = false) {
// 	let historyFile = isPaperTrade ? 'paper_trades.json' : 'trade_history.json';
// 	let history = [];

//     console.log(`📝 saveTrade() meghívva - Típus: ${type}, Pár: ${symbol}, Ár: ${price}, Mennyiség: ${quantity}, PaperTrade: ${isPaperTrade}`);

// 	try {
// 		if (fs.existsSync(historyFile)) {
// 			const fileContent = fs.readFileSync(historyFile, 'utf8');
//             history = fileContent.trim().length > 0 ? JSON.parse(fileContent) : [];
// 			// if (fileContent.trim().length > 0) {
// 			// 	// Csak ha nem üres
// 			// 	history = JSON.parse(fileContent);
// 			// 	if (!Array.isArray(history)) {
// 			// 		console.error(
// 			// 			`⚠️ Hibás JSON-formátum a ${historyFile} fájlban! Újrainicializálás...`
// 			// 		);
// 			// 		history = []; // Ha nem tömb, akkor alaphelyzetbe állítjuk
// 			// 	}
// 			// }
// 		}
// 	} catch (err) {
// 		console.error(`❌ Hiba a trade history olvasásakor:`, err);
// 		//history = []; // Ha bármilyen hiba van, inkább egy üres tömböt használunk
// 	}

// 	let trade = {
// 		time: new Date().toISOString(),
// 		type,
// 		symbol,
// 		price,
// 		quantity,
// 	};

// 	history.push(trade);

// 	try {
// 		fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
// 	} catch (err) {
// 		console.error(`❌ Hiba a trade history mentésekor:`, err);
// 	}
// }

// function updateBotStatus(running) {
// 	try {
// 		let settings = fs.existsSync(settingsFile)
// 			? JSON.parse(fs.readFileSync(settingsFile))
// 			: {};
// 		settings.botRunning = running;
// 		fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
// 	} catch (err) {
// 		console.error('❌ Hiba a bot státusz mentésekor:', err);
// 	}
// }

// function getBotStatus() {
// 	try {
// 		let settings = fs.existsSync('settings.json')
// 			? JSON.parse(fs.readFileSync('settings.json'))
// 			: {};
// 		return settings.botRunning || false;
// 	} catch (err) {
// 		console.error('❌ Hiba a bot állapotának olvasásakor:', err);
// 		return false;
// 	}
// }

// function getBuyLimit() {
// 	try {
// 		let settings = fs.existsSync('settings.json')
// 			? JSON.parse(fs.readFileSync('settings.json'))
// 			: {};
// 		return settings.buyLimit || 100; // Alapértelmezett: 100%
// 	} catch (err) {
// 		console.error('❌ Hiba a vásárlási limit olvasásakor:', err);
// 		return 100;
// 	}
// }

// // 🔄 Trade függvény módosítása USDC ellenőrzéssel
// async function trade() {
// 	if (!getBotStatus()) {
// 		console.log('⛔ A bot nem fut, nem végzünk kereskedést.');
// 		return;
// 	}

// 	try {
// 		SYMBOL = getTradingPair();
// 		let indicators = await getIndicators(SYMBOL);
// 		if (!indicators) return;

        
// 		let { rsi, sma50, sma200, currentPrice } = indicators;
// 		console.log(
//             `🔹 ${SYMBOL} | RSIdd: ${rsi} | SMA50: ${sma50} | SMA200: ${sma200} | Ár: ${currentPrice} USDC`
// 		);
//         console.log(`✅ DEBUG: Valós árfolyam a Binance-ról: ${currentPrice} USDC`);

//         console.log(`🔍 Open Position: ${openPosition ? "Igen" : "Nincs"}`);

// 		let usdcBalance = await getUSDCBalance();
// 		let buyLimit = getBuyLimit() / 100; // Pl. 20% -> 0.2

// 		let availableUSDC = PAPER_TRADING ? virtualBalance * buyLimit : usdcBalance * buyLimit; // Papírkereskedésben a virtuális egyenleget használjuk
// 		let quantity = availableUSDC / currentPrice; // Mennyi CRYPTO vásárolható ebből

// 		if (PAPER_TRADING) {
// 			if (virtualBalance < availableUSDC) {
// 				console.log('⛔ Nincs elég USDC a virtuális számlán!');
// 				return;
// 			}
// 			virtualBalance -= availableUSDC;

// 		} else {
// 			if (usdcBalance < availableUSDC) {
// 				console.log('⛔ Nincs elég USDC a számlán!');
// 				return;
// 			}
// 			await binance.newOrder(SYMBOL, 'BUY', 'MARKET', { quantity });
// 		}

// 		// ✅ Csak akkor írjuk ki, ha az egyenleg változott
// 		if (PAPER_TRADING) {
// 			if (virtualBalance !== lastVirtualBalance) {
// 				console.log(`💰 Paper Trading Egyenleg: ${virtualBalance} USDC`);
// 				lastVirtualBalance = virtualBalance; // Frissítjük az eltárolt állapotot
// 			}
// 		} else {
// 			if (usdcBalance !== lastUsdcBalance) {
// 				console.log(`💰 Valós USDC egyenleg: ${usdcBalance} USDC`);
// 				lastUsdcBalance = usdcBalance; // Frissítjük az eltárolt állapotot
// 			}
// 		}

// 		if (virtualBalance < 10) {
// 			console.log(
// 				'⛔ Nincs elég USDC a [PAPER TRADE] számlán, nem vásárolunk.'
// 			);
// 			return;
// 		}

//         if (rsi < 30 && currentPrice > sma50 && sma50 > sma200 && openPosition === null) {
//             console.log("XXXXXXXXXXXXX");
//             console.log("📉 Túladott és emelkedő trend! Vásárlás (BUY)");
//             let buyPrice = currentPrice;
//             let quantity = (virtualBalance / buyPrice).toFixed(6);

//             if (PAPER_TRADING) {
//                 virtualBalance -= buyPrice * quantity;
//                 openPosition = { type: "buy", price: buyPrice, quantity }; // 📌 Frissítjük az `openPosition` állapotot
//                 console.log(`📝 [PAPER TRADE] BUY @ ${buyPrice} USDC | ${quantity} ${SYMBOL}`);
//                 console.log(`🔍 Open Position beállítva: ${JSON.stringify(openPosition)}`);
//             } else {
//                 await binance.newOrder(SYMBOL, 'BUY', 'MARKET', { quantity });
//                 openPosition = { type: "buy", price: buyPrice, quantity }; // 📌 Frissítjük az `openPosition` állapotot
//                 console.log(`✅ Valós BUY @ ${buyPrice} USDC`);
//                 console.log(`🔍 Open Position beállítva: ${JSON.stringify(openPosition)}`);
//             }
            
//             saveTrade("BUY", SYMBOL, buyPrice, quantity, PAPER_TRADING);
//         } else if (rsi > 60 && openPosition !== null) {
//             console.log('YYYYYYYYYYYYYY');
//             console.log('📈 Túlvett! Eladás (SELL)');
//             let sellPrice = currentPrice;

//             if (PAPER_TRADING) {
//                 virtualBalance += sellPrice * openPosition.quantity;
//                 console.log(`📝 [PAPER TRADE] SELL @ ${sellPrice} USDC | ${openPosition.quantity} ${SYMBOL}`);
//                 console.log(`💰 Új virtuális egyenleg: ${virtualBalance.toFixed(2)} USDC`);
//                 openPosition = null; // 📌 Pozíciót lezárjuk eladás után
//                 console.log(`🔍 Open Position törölve: ${openPosition}`);
//             } else {
//                 await binance.newOrder(SYMBOL, 'SELL', 'MARKET', { quantity: openPosition.quantity });
//                 console.log(`✅ Valós SELL @ ${sellPrice} USDC`);
//                 openPosition = null; // 📌 Pozíciót lezárjuk eladás után
//                 console.log(`🔍 Open Position törölve: ${openPosition}`);
//             }

//             saveTrade('SELL', SYMBOL, sellPrice, openPosition?.quantity || 0, PAPER_TRADING);
//         }
// 	} catch (err) {
// 		console.error('❌ Hiba a trade() függvényben:', err);
// 	}
// }

// // 🔄 Időzített frissítés, hogy mindig naprakész legyen a bot állapota
// setInterval(getBotStatus, 5000);
// getBotStatus();

// // 🔥 API végpontok
// app.get('/status', (req, res) => {
// 	res.json({ running: botRunning, data: botData });
// });

// app.post('/start', (req, res) => {
// 	botRunning = true;
// 	updateBotStatus(true);
// 	res.json({ message: 'Bot elindult.' });
// });

// app.post('/stop', (req, res) => {
// 	botRunning = false;
// 	updateBotStatus(false);
// 	res.json({ message: 'Bot leállítva.' });
// });

// app.post('/set-pair', (req, res) => {
// 	const { symbol } = req.body;
// 	if (!symbol)
// 		return res.status(400).json({ message: 'Hiányzó kereskedési pár.' });

// 	fs.writeFileSync('settings.json', JSON.stringify({ symbol }, null, 2));
// 	botData.symbol = symbol;
// 	res.json({ message: `Kereskedési pár módosítva: ${symbol}` });
// });

// app.get('/trade-history', (req, res) => {
// 	try {
// 		let history = fs.existsSync(tradeHistoryFile)
// 			? JSON.parse(fs.readFileSync(tradeHistoryFile))
// 			: [];
// 		res.json(history);
// 	} catch (err) {
// 		console.error('❌ Hiba a trade history olvasásakor:', err);
// 		res
// 			.status(500)
// 			.json({ error: 'Nem sikerült lekérni a trade előzményeket' });
// 	}
// });

// // 🔥 Indítás
// setInterval(trade, 5 * 1000);
// module.exports = { saveTrade, trade };
// // console.log("🚀 Spot bot elindítva!");
// // setInterval(trade, 5 * 60 * 1000);
