const serverURL = "http://localhost:3000"; // Backend API címe
const ws = new WebSocket("ws://localhost:3000"); // WebSocket kapcsolat

// WebSocket események kezelése (állapot frissítés)
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    document.getElementById("bot-status").innerText = data.status === "running" ? "Fut" : "Leállt";
};

// Kereskedési pár módosítása
function updatePair() {
    const newPair = document.getElementById("pair").value;
    fetch(serverURL + "/set-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: newPair })
    })
    .then(res => res.json())
    .then(data => alert(data.message))
    .catch(err => console.error("Hiba a pár módosításánál:", err));
}

// Bot indítása
function startBot() {
    fetch(serverURL + "/start", { method: "POST" })
        .then(res => res.json())
        .then(data => alert(data.message))
        .catch(err => console.error("Hiba a bot indításánál:", err));
}

// Bot leállítása
function stopBot() {
    fetch(serverURL + "/stop", { method: "POST" })
        .then(res => res.json())
        .then(data => alert(data.message))
        .catch(err => console.error("Hiba a bot leállításánál:", err));
}

// Az aktuális kereskedési pár betöltése az oldal betöltésekor
async function loadCurrentPair() {
    try {
        const response = await fetch(serverURL + "/get-pair");
        const data = await response.json();
        document.getElementById("pair").value = data.symbol;
    } catch (err) {
        console.error("Hiba a kereskedési pár betöltésekor:", err);
    }
}

async function updateStatus() {
    try {
        const response = await fetch(serverURL + "/status");
        const data = await response.json();
        document.getElementById("bot-status").innerText = data.status === "running" ? "Fut" : "Leállt";
    } catch (err) {
        console.error("Hiba a státusz lekérésénél:", err);
    }
}

// Oldal betöltésekor frissíti a státuszt
updateStatus();
setInterval(updateStatus, 5000); // 5 másodpercenként frissíti a státuszt

// Oldal betöltésekor betölti az aktuális kereskedési párt
document.addEventListener("DOMContentLoaded", loadCurrentPair);
