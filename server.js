require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { loadConfig, saveConfig } = require('./config');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

let config = loadConfig();

function getTradeHistoryFile() {
    // Frissítjük a config értékét, ha szükséges
    config = loadConfig();
    return config.paperTrading ? 'paper_trades.json' : 'trade_history.json';
  }

// 📌 API végpontok
app.get('/status', (req, res) => res.json({ running: config.botRunning }));

app.post('/set-pair', (req, res) => {
    if (!req.body.symbol) return res.status(400).json({ message: "Hiányzó kereskedési pár." });
    // Vesszővel elválasztva több pár is megadható
    let symbols = req.body.symbol.split(',').map(s => s.trim()).filter(s => s !== '');
    if (!symbols.length) {
      return res.status(400).json({ message: "Érvénytelen kereskedési pár(oka)." });
    }
    config.symbols = symbols;
    // Backward compatibility: az első párt is beállítjuk
    config.symbol = symbols[0];
    saveConfig(config);
    res.json({ message: `Kereskedési párok módosítva: ${symbols.join(', ')}` });
  });

app.post('/buy-limit', (req, res) => {
	const { limit } = req.body;
	if (typeof limit !== 'number' || limit < 1 || limit > 100) {
		return res
			.status(400)
			.json({ message: 'A vásárlási limitnek 1 és 100 között kell lennie.' });
	}
	config.buyLimit = limit;
	saveConfig(config);
	res.json({ message: `Vásárlási limit frissítve: ${limit}%` });
});

app.get('/trade-history', (req, res) => {
    try {
      const historyFile = getTradeHistoryFile();
      let history = fs.existsSync(historyFile)
        ? JSON.parse(fs.readFileSync(historyFile))
        : [];
      res.json(history);
    } catch (err) {
      console.error('❌ Hiba a trade history olvasásakor:', err);
      res.status(500).json({ error: 'Nem sikerült lekérni a trade előzményeket' });
    }
  });
  

app.listen(3000, () => console.log('✅ API fut a 3000-es porton'));
console.log('🚀 Spot bot elindítva!');
