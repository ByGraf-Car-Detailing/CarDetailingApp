/**
 * Script one-shot per popolare collezione vehicleMakes
 * Eseguire con: node scripts/populateVehicleMakes.js
 */

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, setDoc, getDocs } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDrBjfxtshgBskV4KOaUc3lO6VI0ATNG88",
  authDomain: "cardetailingapp-e6c95.firebaseapp.com",
  projectId: "cardetailingapp-e6c95",
  storageBucket: "cardetailingapp-e6c95.firebasestorage.app",
  messagingSenderId: "1066766431776",
  appId: "1:1066766431776:web:80b9d02818baaaef052e45"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function populate() {
  console.log("📥 Fetching marche da API NHTSA...");
  
  const resp = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json");
  const data = await resp.json();
  
  if (!data.Results || !Array.isArray(data.Results)) {
    console.error("❌ Errore: risposta API non valida");
    process.exit(1);
  }

  const makes = data.Results.map(m => m.Make_Name).filter(Boolean);
  console.log(`✅ Trovate ${makes.length} marche`);

  // Carica marche esistenti per evitare duplicati
  console.log("🔍 Controllo marche esistenti...");
  const existingSnap = await getDocs(collection(db, "vehicleMakes"));
  const existingNames = new Set();
  existingSnap.forEach(d => existingNames.add(d.data().name?.toUpperCase()));
  console.log(`📋 Marche già presenti: ${existingNames.size}`);

  // Inserisci solo nuove marche
  let added = 0;
  let skipped = 0;

  for (const name of makes) {
    const nameUpper = name.toUpperCase();
    if (existingNames.has(nameUpper)) {
      skipped++;
      continue;
    }

    const docId = nameUpper.replace(/[^A-Z0-9]/g, "_");
    await setDoc(doc(db, "vehicleMakes", docId), {
      name: name,
      active: false,
      addedAt: new Date().toISOString()
    });
    added++;

    if (added % 500 === 0) {
      console.log(`⏳ Inserite ${added} marche...`);
    }
  }

  console.log(`\n✅ Completato!`);
  console.log(`   Aggiunte: ${added}`);
  console.log(`   Saltate (già esistenti): ${skipped}`);
  console.log(`\n👉 Ora attiva le marche desiderate in Firebase Console`);
  process.exit(0);
}

populate().catch(err => {
  console.error("❌ Errore:", err.message);
  process.exit(1);
});
