import admin from "firebase-admin";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const EMULATOR_PROJECT_IDS = ["cardetailingapp-e6c95", "cardetailingapp-e6c95-staging"];

const users = [
  { email: "admin@test.local", password: "Passw0rd!", role: "admin" },
  { email: "staff@test.local", password: "Passw0rd!", role: "staff" },
];

for (const projectId of EMULATOR_PROJECT_IDS) {
  const app = admin.initializeApp({ projectId }, projectId);
  const auth = admin.auth(app);
  const db = admin.firestore(app);

  for (const u of users) {
    try {
      await auth.getUserByEmail(u.email);
    } catch {
      await auth.createUser({ email: u.email, password: u.password });
    }
    await db.collection("allowedUsers").doc(u.email).set({ role: u.role }, { merge: true });
  }
}

console.log("OK seed:", users.map((u) => u.email).join(", "));
console.log("Seeded projects:", EMULATOR_PROJECT_IDS.join(", "));
