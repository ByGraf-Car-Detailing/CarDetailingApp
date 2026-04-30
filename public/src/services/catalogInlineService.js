import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { auth, db } from "./authService.js";
import {
  buildOperatorAuditActor,
  resolveSessionOperatorName,
} from "./operatorIdentity.js";
import {
  getEffectivePolicyPreview,
  normalizeBrandName,
  normalizeOverrideId,
} from "../admin/catalogSyncRunner.js";
import {
  isAuthorizedRole,
  normalizeModelKey,
  normalizeModelName,
  normalizeVehicleType,
  resolveInlineVehicleType,
} from "./catalogInlinePolicy.js";

function getActor() {
  return buildOperatorAuditActor({
    email: auth.currentUser?.email || "",
    operatorId: auth.currentUser?.uid || "",
    sessionDisplayName: resolveSessionOperatorName(),
    authDisplayName: auth.currentUser?.displayName || "",
  });
}

async function materializeMake({ makeId, makeName, vehicleType, actor }) {
  const payload = {
    name: makeName,
    active: true,
    source: "manual_override",
    origin: "custom",
    vehicleType: normalizeVehicleType(vehicleType),
    updatedAt: serverTimestamp(),
    updatedBy: actor.updatedBy,
    updatedByName: actor.updatedByName,
  };
  await setDoc(doc(db, "vehicleMakes", makeId), payload, { merge: true });
}

async function materializeModel({ modelId, makeName, modelName, actor }) {
  const payload = {
    make: makeName,
    name: modelName,
    source: "manual",
    updatedAt: serverTimestamp(),
    updatedBy: actor.updatedBy,
    updatedByName: actor.updatedByName,
  };
  await setDoc(doc(db, "vehicleModels", modelId), payload, { merge: true });
}

async function addInlineMake({ name, vehicleType, actor, role }) {
  if (!isAuthorizedRole(role)) {
    return { status: "UNAUTHORIZED", message: "Operazione non autorizzata." };
  }

  const brandName = normalizeBrandName(name);
  if (!brandName) {
    return { status: "INVALID_INPUT", message: "Inserisci una marca valida." };
  }

  const makeId = normalizeOverrideId(brandName);
  const safeVehicleType = normalizeVehicleType(vehicleType);
  const effectivePreview = await getEffectivePolicyPreview();
  const baselineSet = new Set((effectivePreview?.baselineKeys || []).map((k) => normalizeOverrideId(k)));
  if (baselineSet.has(makeId)) {
    return { status: "COLLISION", message: "Marca gia presente nella baseline catalogo." };
  }

  const overrideQuery = query(collection(db, "vehicleMakeOverrides"), where("name", "==", brandName));
  const existingOverride = await getDocs(overrideQuery);
  if (!existingOverride.empty) {
    return { status: "DUPLICATE", message: "Marca gia presente negli override.", makeId };
  }

  const auditActor = actor || getActor();
  const overridePayload = {
    name: brandName,
    vehicleType: safeVehicleType,
    active: true,
    origin: "custom",
    source: "manual_override",
    createdAt: serverTimestamp(),
    createdBy: auditActor.updatedBy,
    createdByName: auditActor.updatedByName,
    updatedAt: serverTimestamp(),
    updatedBy: auditActor.updatedBy,
    updatedByName: auditActor.updatedByName,
  };

  await setDoc(doc(db, "vehicleMakeOverrides", makeId), overridePayload, { merge: true });
  try {
    await materializeMake({ makeId, makeName: brandName, vehicleType: safeVehicleType, actor: auditActor });
  } catch (error) {
    return {
      status: "MATERIALIZE_FAIL",
      message: "Marca salvata negli override, ma non materializzata nel catalogo.",
      makeId,
      error: error?.message || String(error),
    };
  }

  return { status: "OK", message: "Marca aggiunta con successo.", makeId, makeName: brandName };
}

async function addInlineModel({ makeName, modelName, vehicleType, actor, role }) {
  if (!isAuthorizedRole(role)) {
    return { status: "UNAUTHORIZED", message: "Operazione non autorizzata." };
  }

  const safeMake = normalizeBrandName(makeName);
  const safeModel = normalizeModelName(modelName);
  if (!safeMake || !safeModel) {
    return { status: "INVALID_INPUT", message: "Inserisci marca e modello validi." };
  }

  const modelId = normalizeModelKey(safeMake, safeModel);
  const makeId = normalizeOverrideId(safeMake);
  const safeVehicleType = normalizeVehicleType(vehicleType);

  const existingModels = await getDocs(
    query(collection(db, "vehicleModels"), where("make", "==", safeMake), where("name", "==", safeModel))
  );
  if (!existingModels.empty) {
    return { status: "DUPLICATE", message: "Modello gia presente per la marca selezionata.", modelId };
  }

  const existingModelOverrides = await getDocs(
    query(collection(db, "vehicleModelOverrides"), where("make", "==", safeMake), where("name", "==", safeModel))
  );
  if (!existingModelOverrides.empty) {
    return { status: "DUPLICATE", message: "Modello gia presente negli override.", modelId };
  }

  const auditActor = actor || getActor();
  const overridePayload = {
    make: safeMake,
    makeId,
    name: safeModel,
    modelId,
    vehicleType: safeVehicleType,
    active: true,
    origin: "custom",
    source: "manual_override",
    createdAt: serverTimestamp(),
    createdBy: auditActor.updatedBy,
    createdByName: auditActor.updatedByName,
    updatedAt: serverTimestamp(),
    updatedBy: auditActor.updatedBy,
    updatedByName: auditActor.updatedByName,
  };
  await setDoc(doc(db, "vehicleModelOverrides", modelId), overridePayload, { merge: true });

  try {
    await materializeModel({ modelId, makeName: safeMake, modelName: safeModel, actor: auditActor });
  } catch (error) {
    return {
      status: "MATERIALIZE_FAIL",
      message: "Modello salvato negli override, ma non materializzato nel catalogo.",
      modelId,
      error: error?.message || String(error),
    };
  }

  return { status: "OK", message: "Modello aggiunto con successo.", modelId, modelName: safeModel };
}

export {
  addInlineMake,
  addInlineModel,
  resolveInlineVehicleType,
};
