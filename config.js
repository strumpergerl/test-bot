const fs = require('fs');
const settingsFile = 'settings.json';

function loadConfig() {
	try {
		let config = fs.existsSync(settingsFile)
			? JSON.parse(fs.readFileSync(settingsFile))
			: {};
		// Ha nincs "symbols" tömb, de van "symbol", alakítsuk át tömbbé
		if (!config.symbols && config.symbol) {
			config.symbols = [config.symbol];
		}
		return config;
	} catch (err) {
		console.error('❌ Hiba a settings.json beolvasásakor:', err);
		return {};
	}
}

function saveConfig(newConfig) {
	try {
		fs.writeFileSync(settingsFile, JSON.stringify(newConfig, null, 2));
	} catch (err) {
		console.error('❌ Hiba a settings.json mentésekor:', err);
	}
}

module.exports = {
	loadConfig,
	saveConfig,
};
