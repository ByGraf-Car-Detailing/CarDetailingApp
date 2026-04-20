import admin from "firebase-admin";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp({ projectId: "cardetailingapp-e6c95-staging" });

const auth = admin.auth();
const db = admin.firestore();

const users = [
  { email: "admin@test.local", password: "Passw0rd!", role: "admin" },
  { email: "staff@test.local", password: "Passw0rd!", role: "staff" },
];

for (const u of users) {
  try {
    await auth.getUserByEmail(u.email);
  } catch {
    await auth.createUser({ email: u.email, password: u.password });
  }
  await db.collection("allowedUsers").doc(u.email).set({ role: u.role }, { merge: true });
}

console.log("OK seed:", users.map(u => u.email).join(", "));
