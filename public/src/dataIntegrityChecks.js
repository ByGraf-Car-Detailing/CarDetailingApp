import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

export function createDataIntegrityChecks({ db, alertBanner }) {
  async function checkInvalidContacts() {
    const invalidContacts = [];

    try {
      const q = query(
        collection(db, "clients"),
        where("type", "==", "person"),
        where("isContact", "==", true),
        where("active", "==", true)
      );

      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const companyId = data.companyId;
        if (!companyId) continue;

        const companyRef = doc(db, "clients", companyId);
        const companySnap = await getDoc(companyRef);
        if (!companySnap.exists()) {
          invalidContacts.push({
            id: docSnap.id,
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
            email: data.email || "",
          });
        }
      }

      sessionStorage.setItem("invalidContacts", JSON.stringify(invalidContacts));
      alertBanner.style.display = invalidContacts.length > 0 ? "block" : "none";
    } catch (err) {
      console.error("Errore durante la verifica contatti orfani:", err.message);
    }
  }

  return {
    checkInvalidContacts,
  };
}
