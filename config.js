const fs = require('fs');

const settingsFile = "settings.json";

function loadConfig() {
    try {
        return fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile)) : {};
    } catch (err) {
        console.error("❌ Hiba a settings.json beolvasásakor:", err);
        return {};
    }
}

function saveConfig(newConfig) {
    try {
        fs.writeFileSync(settingsFile, JSON.stringify(newConfig, null, 2));
    } catch (err) {
        console.error("❌ Hiba a settings.json mentésekor:", err);
    }
}

module.exports = {
    loadConfig,
    saveConfig
};
