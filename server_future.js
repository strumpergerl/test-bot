require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// Alapértelmezett beállítások fájlba mentése
const settingsFile = "settings.json";
if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({ symbol: "BTCUSDC" }, null, 2));
}

// API végpont a kereskedési pár módosításához
app.post('/set-pair', (req, res) => {
    const { symbol } = req.body;
    if (!symbol) {
        return res.status(400).json({ error: "Hiányzó kereskedési pár!" });
    }

    // Mentés settings.json-be
    fs.writeFileSync(settingsFile, JSON.stringify({ symbol }, null, 2));
    res.json({ message: `Kereskedési pár frissítve: ${symbol}` });
});

// API végpont a jelenlegi kereskedési pár lekérdezésére
app.get('/get-pair', (req, res) => {
    const settings = JSON.parse(fs.readFileSync(settingsFile));
    res.json({ symbol: settings.symbol });
});

let botProcess = null;

app.post('/start', (req, res) => {
    if (!botProcess) {
        botProcess = spawn('node', ['bot.js']);
        console.log("Bot elindult.");
        res.json({ message: 'Bot elindítva' });
    } else {
        res.json({ message: 'A bot már fut' });
    }
});

app.post('/stop', (req, res) => {
    if (botProcess) {
        botProcess.kill();
        botProcess = null;
        console.log("Bot leállítva.");
        res.json({ message: 'Bot leállítva' });
    } else {
        res.json({ message: 'A bot nem fut' });
    }
});

// ✅ Bot állapotának lekérdezése
app.get('/status', (req, res) => {
    res.json({ status: botProcess ? "running" : "stopped" });
});

// Szerver indítása
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
