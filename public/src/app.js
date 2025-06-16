// ✅ Import Firebase modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";

// ✅ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDrBjfxtshgBskV4KOaUc3lO6VI0ATNG88",
  authDomain: "cardetailingapp-e6c95.firebaseapp.com",
  projectId: "cardetailingapp-e6c95",
  storageBucket: "cardetailingapp-e6c95.firebasestorage.app",
  messagingSenderId: "1066766431776",
  appId: "1:1066766431776:web:80b9d02818baaaef052e45",
  measurementId: "G-26ZKJX6D03"
};

// ✅ Inizializzazione Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

console.log("✅ Firebase inizializzato con successo");

// ✅ Login handler
document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    console.log("✅ Login effettuato:", user.displayName, user.email);
    alert(`Benvenuto ${user.displayName}`);
  } catch (error) {
    console.error("❌ Errore login:", error.message);
    alert("Errore durante il login");
  }
});
