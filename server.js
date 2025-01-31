require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { loadConfig, saveConfig } = require('./config');

const app = express();
app.use(express.json());
app.use(cors());

let config = loadConfig();

// 📌 API végpontok
app.get('/status', (req, res) => res.json({ running: config.botRunning }));

app.post('/set-pair', (req, res) => {
    if (!req.body.symbol) return res.status(400).json({ message: "Hiányzó kereskedési pár." });

    config.symbol = req.body.symbol;
    saveConfig(config);
    res.json({ message: `Kereskedési pár módosítva: ${config.symbol}` });
});

app.post('/buy-limit', (req, res) => {
    const { limit } = req.body;
    if (typeof limit !== "number" || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "A vásárlási limitnek 1 és 100 között kell lennie." });
    }
    config.buyLimit = limit;
    saveConfig(config);
    res.json({ message: `Vásárlási limit frissítve: ${limit}%` });
});

app.listen(3000, () => console.log("✅ API fut a 3000-es porton"));
console.log("🚀 Spot bot elindítva!");
