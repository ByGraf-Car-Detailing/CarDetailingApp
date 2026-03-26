// test-calendar.js

const { google } = require("googleapis");
const path = require("path");

// 🔐 Percorso del file JSON (assicurati che il nome corrisponda)
const KEYFILE = path.join(__dirname, "service-account.json");

// 🔧 Scopi per Google Calendar
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

async function createEvent() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEYFILE,
      scopes: SCOPES,
    });

    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: "v3", auth: authClient });

    // 🔁 Usa 'primary' per ora (modificabile dopo)
    const calendarId = "8cbd2ba21eb4f5a1995a6168f380398f7aab042872e04d018ced88f10d947d3f@group.calendar.google.com";

    const event = {
      summary: "🔧 Test Car Detailing App",
      description: "Evento di prova creato via Google Calendar API",
      start: {
        dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // +1h
        timeZone: "Europe/Rome",
      },
      end: {
        dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2h
        timeZone: "Europe/Rome",
      },
    };

    const response = await calendar.events.insert({
      calendarId,
      resource: event,
    });

    console.log("✅ Evento creato con ID:", response.data.id);
  } catch (err) {
    console.error("❌ Errore:", err.message);
  }
}

createEvent();
