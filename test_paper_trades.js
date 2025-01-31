const fs = require('fs');
const { trade, saveTrade } = require('./spot_bot'); // Importáljuk a bot függvényeit

const paperTradeHistoryFile = "paper_trades.json";

// 📌 Segédfüggvény: Paper trade előzmények beolvasása
function readPaperTradeHistory() {
    try {
        if (fs.existsSync(paperTradeHistoryFile)) {
            const data = fs.readFileSync(paperTradeHistoryFile, 'utf8');
            return JSON.parse(data);
        } else {
            console.log("ℹ️ A paper_trades.json nem létezik. Létrehozás...");
            fs.writeFileSync(paperTradeHistoryFile, JSON.stringify([]), 'utf8');
            return [];
        }
    } catch (err) {
        console.error("❌ Hiba a paper trade history olvasásakor:", err);
        return [];
    }
}

// 📌 Teszt 1: Manuális paper trade beírása
function testSavePaperTrade() {
    console.log("\n🔄 Teszt 1: Manuális paper trade mentése...");
    
    saveTrade("BUY", "BTCUSDC", 45000, 0.02, true);
    saveTrade("SELL", "BTCUSDC", 46000, 0.02, true);

    const trades = readPaperTradeHistory();
    console.log("✅ Paper trade history tartalom:", trades);
    
    if (trades.length >= 2) {
        console.log("✅ **Siker**: A paper_trades.json megfelelően frissült!");
    } else {
        console.error("❌ **Hiba**: A paper_trades.json nem frissült megfelelően!");
    }
}

// 📌 Teszt 2: Valós papírkereskedési ciklus futtatása
async function testPaperTradeCycle() {
    console.log("\n🔄 Teszt 2: Paper trading ciklus tesztelése...");

    try {
        await trade(); // Kereskedési logika lefuttatása papír módban

        const trades = readPaperTradeHistory();
        console.log("📊 Frissített paper trade history:", trades);

        if (trades.length > 0) {
            console.log("✅ **Siker**: A trade() függvény sikeresen végrehajtott egy vásárlást vagy eladást papírkereskedési módban!");
        } else {
            console.error("❌ **Hiba**: A trade() nem mentett új bejegyzést a paper_trades.json-be!");
        }
    } catch (err) {
        console.error("❌ Hiba a teszt során:", err);
    }
}

// 📌 Összes teszt futtatása
async function runTests() {
    testSavePaperTrade();
    await testPaperTradeCycle();
}

// **Futtatás**
runTests();
