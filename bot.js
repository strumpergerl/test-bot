require('dotenv').config();
const Binance = require('node-binance-api');
const fs = require('fs');
const ti = require('technicalindicators');

const binance = new Binance().options({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET
});

// Betölti az aktuális kereskedési párt a settings.json-ból
function getTradingPair() {
    const settings = JSON.parse(fs.readFileSync("settings.json"));
    return settings.symbol;
}

// Beállítjuk a globális SYMBOL változót
let SYMBOL = getTradingPair();
console.log(`:: Kereskedési pár: ${SYMBOL}`);

// Papírkereskedési mód beállítása
const PAPER_TRADING = true;  // Állítsd "false"-ra ha élesben szeretnéd futtatni

// Alapértékek
let virtualBalance = 100;  // Kezdő USDC tőke papírkereskedéshez
let virtualPositions = [];   // Nyitott pozíciók papír módban

// Kereskedési paraméterek
const RSI_PERIOD = 14;
const STOP_LOSS_PERCENT = 0.05;
const TAKE_PROFIT_PERCENT = 0.10;
const TRAILING_STOP_PERCENT = 0.05;

async function getRSI(symbol, interval) {
    try {
        console.log(`📊 RSI számítása: ${symbol}, Interval: ${interval}`);
        let candles = await binance.candlesticks(symbol, interval, { limit: 15 });

        if (!candles || !Array.isArray(candles) || candles.length === 0) {
            console.error(`❌ Hiba: A Binance API nem küldött vissza adatot (${symbol}, ${interval})`);
            return null;
        }

        let closes = candles.map(c => parseFloat(c[4])); // Záróárak
        const rsiResult = ti.RSI.calculate({ values: closes, period: 14 });

        if (!rsiResult || rsiResult.length === 0) {
            console.error("❌ Hiba: Nem sikerült RSI értéket számolni.");
            return null;
        }

        return rsiResult[rsiResult.length - 1]; // Utolsó RSI érték
    } catch (err) {
        console.error("❌ Hiba az RSI számításban:", err);
        return null;
    }
}


async function trade() {
    // console.log("🚀 Trade függvény meghívva");
    SYMBOL = getTradingPair(); // Frissíti a globális változót
    let shortRSI = await getRSI(SYMBOL, "15m");
    let longRSI = await getRSI(SYMBOL, "1h");
    let btcPrice = (await binance.futuresPrices())[SYMBOL];

    console.log(`:: Kereskedési pár: ${SYMBOL} | 15m RSI: ${shortRSI} | 1h RSI: ${longRSI} | Ár: ${btcPrice}`);

    let tradeType = null;
    let entryPrice = null;
    let qty = (virtualBalance / btcPrice).toFixed(3);  // Mennyi BTC vehető

    if (shortRSI < 30 && longRSI < 40) {
        console.log("\ | Túladott! Vásárlás (Long)");
        tradeType = "buy";
        entryPrice = btcPrice;

    } else if (shortRSI > 70 && longRSI > 60) {
        console.log("/ | Túlvett! Eladás (Short)");
        tradeType = "sell";
        entryPrice = btcPrice;
    }

    if (tradeType) {
        let stopLossPrice = tradeType === "buy"
            ? (entryPrice * (1 - STOP_LOSS_PERCENT)).toFixed(2)
            : (entryPrice * (1 + STOP_LOSS_PERCENT)).toFixed(2);
        let takeProfitPrice = tradeType === "buy"
            ? (entryPrice * (1 + TAKE_PROFIT_PERCENT)).toFixed(2)
            : (entryPrice * (1 - TAKE_PROFIT_PERCENT)).toFixed(2);

        if (PAPER_TRADING) {
            virtualPositions.push({
                type: tradeType,
                price: entryPrice,
                stop_loss: stopLossPrice,
                take_profit: takeProfitPrice,
                qty: qty,
                open_time: new Date().toISOString()
            });

            console.log(`[PAPER TRADE] ${tradeType.toUpperCase()} @ ${entryPrice} USDC, SL: ${stopLossPrice}, TP: ${takeProfitPrice}`);
        } else {
            if (tradeType === "buy") {
                await binance.futuresMarketBuy(SYMBOL, qty);
            } else {
                await binance.futuresMarketSell(SYMBOL, qty);
            }
        }
    }

    fs.writeFileSync("paper_trades.json", JSON.stringify(virtualPositions, null, 2));
}

async function checkPaperTrades() {
    SYMBOL = getTradingPair();
    let btcPrice = (await binance.futuresPrices())[SYMBOL];
    let closedPositions = [];

    virtualPositions.forEach((pos, index) => {
        if ((pos.type === "buy" && btcPrice >= pos.take_profit) || (pos.type === "sell" && btcPrice <= pos.take_profit)) {
            console.log(`+ | Take-profit aktiválódott @ ${btcPrice} USDC`);
            closedPositions.push(index);
            virtualBalance += (pos.qty * btcPrice);  // Nyereség hozzáadása
        } else if ((pos.type === "buy" && btcPrice <= pos.stop_loss) || (pos.type === "sell" && btcPrice >= pos.stop_loss)) {
            console.log(`! | Stop-loss aktiválódott @ ${btcPrice} USDC`);
            closedPositions.push(index);
            virtualBalance -= (pos.qty * btcPrice);  // Veszteség levonása
        }
    });

    virtualPositions = virtualPositions.filter((_, i) => !closedPositions.includes(i));
    fs.writeFileSync("paper_trades.json", JSON.stringify(virtualPositions, null, 2));
}

setInterval(() => {
    const newSymbol = getTradingPair();
    if (newSymbol !== SYMBOL) {
        console.log(`* Új kereskedési pár beállítva: ${newSymbol}`);
        SYMBOL = newSymbol;
    }
}, 60 * 1000);

setInterval(trade, 15 * 1000);
setInterval(checkPaperTrades, 1  * 1000);
