const fs = require('fs');
const portfolioFile = 'portfolio.json';

// Betölti a portfólió adatokat a portfolio.json fájlból.
// Ha a fájl nem létezik, visszaad egy üres portfóliót.
function loadPortfolio() {
  if (fs.existsSync(portfolioFile)) {
    try {
      const data = fs.readFileSync(portfolioFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error("Hiba a portfólió fájl beolvasásakor:", err);
      return {};
    }
  } else {
    return {};
  }
}

// Elmenti a portfólió adatokat a portfolio.json fájlba.
function savePortfolio(portfolio) {
  try {
    fs.writeFileSync(portfolioFile, JSON.stringify(portfolio, null, 2), 'utf8');
    console.log("Portfólió mentve.");
  } catch (err) {
    console.error("Hiba a portfólió fájl mentésekor:", err);
  }
}

module.exports = {
  loadPortfolio,
  savePortfolio
};
