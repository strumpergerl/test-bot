const fs = require('fs');
const { trade, saveTrade } = require('./spot_bot'); // Importáljuk a bot függvényeit

const tradeHistoryFile = "trade_history.json";

// 📌 Segédfüggvény: Trade előzmények beolvasása
function readTradeHistory() {
    try {
        if (fs.existsSync(tradeHistoryFile)) {
            const data = fs.readFileSync(tradeHistoryFile, 'utf8');
            return JSON.parse(data);
        } else {
            console.log("ℹ️ A trade_history.json nem létezik. Létrehozás...");
            fs.writeFileSync(tradeHistoryFile, JSON.stringify([]), 'utf8');
            return [];
        }
    } catch (err) {
        console.error("❌ Hiba a trade history olvasásakor:", err);
        return [];
    }
}

// 📌 Teszt 1: Manuális trade beírása
function testSaveTrade() {
    console.log("\n🔄 Teszt 1: Manuális trade mentése...");
    
    saveTrade("BUY", "BTCUSDC", 50000, 0.01);
    saveTrade("SELL", "BTCUSDC", 51000, 0.01);

    const trades = readTradeHistory();
    console.log("✅ Trade history tartalom:", trades);
    
    if (trades.length >= 2) {
        console.log("✅ **Siker**: A trade_history.json megfelelően frissült!");
    } else {
        console.error("❌ **Hiba**: A trade_history.json nem frissült megfelelően!");
    }
}

// 📌 Teszt 2: Valós kereskedési ciklus futtatása
async function testTradeCycle() {
    console.log("\n🔄 Teszt 2: Kereskedési ciklus tesztelése...");

    try {
        await trade(); // Kereskedési logika lefuttatása

        const trades = readTradeHistory();
        console.log("📊 Frissített trade history:", trades);

        if (trades.length > 0) {
            console.log("✅ **Siker**: A trade függvény sikeresen végrehajtott egy vásárlást vagy eladást!");
        } else {
            console.error("❌ **Hiba**: A trade() nem mentett új bejegyzést!");
        }
    } catch (err) {
        console.error("❌ Hiba a teszt során:", err);
    }
}

// 📌 Összes teszt futtatása
async function runTests() {
    testSaveTrade();
    await testTradeCycle();
}

// **Futtatás**
runTests();
