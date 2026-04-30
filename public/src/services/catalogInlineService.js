import {
  getDoc,
  collection,
  deleteField,
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

async function resolveAuthoritativeRole(fallbackRole = "") {
  const email = auth.currentUser?.email || "";
  if (!email) return String(fallbackRole || "").trim().toLowerCase();
  try {
    const snap = await getDoc(doc(db, "allowedUsers", email));
    const role = snap.exists() ? String(snap.data()?.role || "").trim().toLowerCase() : "";
    return role || String(fallbackRole || "").trim().toLowerCase();
  } catch {
    return String(fallbackRole || "").trim().toLowerCase();
  }
}

function logInlineTrace(event, details = {}) {
  try {
    const payload = {
      event,
      at: new Date().toISOString(),
      authEmail: auth.currentUser?.email || null,
      authUid: auth.currentUser?.uid || null,
      ...details,
    };
    console.info("[catalog-inline-trace]", payload);
  } catch {
    // no-op
  }
}

async function materializeMake({ makeId, makeName, vehicleType, actor }) {
  const makeRef = doc(db, "vehicleMakes", makeId);
  const existing = await getDoc(makeRef);
  const payload = {
    name: makeName,
    active: true,
    source: "manual_override",
    origin: "custom",
    policyVersion: "manual_override",
    makeId: null,
    makeIdCar: null,
    makeIdMotorcycle: null,
    nhtsaNameCar: null,
    nhtsaNameMotorcycle: null,
    deactivatedByPolicyVersion: deleteField(),
    addedAt: existing.exists() ? (existing.data()?.addedAt ?? null) : serverTimestamp(),
    vehicleType: normalizeVehicleType(vehicleType),
    updatedAt: serverTimestamp(),
    updatedBy: actor.updatedBy,
    updatedByName: actor.updatedByName,
  };
  if (payload.addedAt === null) delete payload.addedAt;
  logInlineTrace("materialize_make_attempt", {
    collection: "vehicleMakes",
    docId: makeId,
    payloadKeys: Object.keys(payload),
  });
  await setDoc(makeRef, payload, { merge: true });
  logInlineTrace("materialize_make_success", { collection: "vehicleMakes", docId: makeId });
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
  logInlineTrace("materialize_model_attempt", {
    collection: "vehicleModels",
    docId: modelId,
    payloadKeys: Object.keys(payload),
  });
  await setDoc(doc(db, "vehicleModels", modelId), payload, { merge: true });
  logInlineTrace("materialize_model_success", { collection: "vehicleModels", docId: modelId });
}

async function addInlineMake({ name, vehicleType, actor, role }) {
  const authoritativeRole = await resolveAuthoritativeRole(role);
  logInlineTrace("role_resolution", { requestedRole: role || null, authoritativeRole: authoritativeRole || null });
  if (authoritativeRole !== "admin") {
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
    const auditActor = actor || getActor();
    logInlineTrace("override_make_reactivate_attempt", {
      collection: "vehicleMakeOverrides",
      docId: makeId,
      role,
      makeName: brandName,
    });
    try {
      await setDoc(
        doc(db, "vehicleMakeOverrides", makeId),
        {
          name: brandName,
          vehicleType: safeVehicleType,
          active: true,
          origin: "custom",
          source: "manual_override",
          updatedAt: serverTimestamp(),
          updatedBy: auditActor.updatedBy,
          updatedByName: auditActor.updatedByName,
        },
        { merge: true }
      );
    } catch (error) {
      logInlineTrace("override_make_reactivate_override_write_fail", {
        collection: "vehicleMakeOverrides",
        docId: makeId,
        role: authoritativeRole,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      throw error;
    }
    try {
      await materializeMake({ makeId, makeName: brandName, vehicleType: safeVehicleType, actor: auditActor });
    } catch (error) {
      logInlineTrace("override_make_reactivate_fail", {
        collection: "vehicleMakes",
        docId: makeId,
        role,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      throw error;
    }
    return {
      status: "DUPLICATE",
      message: "Marca gia presente negli override: riattivata e selezionata.",
      makeId,
      makeName: brandName,
    };
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

  logInlineTrace("override_make_create_attempt", {
    collection: "vehicleMakeOverrides",
    docId: makeId,
    role,
    makeName: brandName,
    payloadKeys: Object.keys(overridePayload),
  });
  try {
    await setDoc(doc(db, "vehicleMakeOverrides", makeId), overridePayload, { merge: true });
  } catch (error) {
    logInlineTrace("override_make_create_fail", {
      collection: "vehicleMakeOverrides",
      docId: makeId,
      role: authoritativeRole,
      code: error?.code || null,
      message: error?.message || String(error),
    });
    throw error;
  }
  try {
    await materializeMake({ makeId, makeName: brandName, vehicleType: safeVehicleType, actor: auditActor });
  } catch (error) {
    logInlineTrace("materialize_make_fail", {
      collection: "vehicleMakes",
      docId: makeId,
      role,
      code: error?.code || null,
      message: error?.message || String(error),
    });
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
  const authoritativeRole = await resolveAuthoritativeRole(role);
  logInlineTrace("role_resolution", { requestedRole: role || null, authoritativeRole: authoritativeRole || null });
  if (authoritativeRole !== "admin") {
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
    return { status: "DUPLICATE", message: "Modello gia presente per la marca selezionata.", modelId, modelName: safeModel };
  }

  const existingModelOverrides = await getDocs(
    query(collection(db, "vehicleModelOverrides"), where("make", "==", safeMake), where("name", "==", safeModel))
  );
  if (!existingModelOverrides.empty) {
    return { status: "DUPLICATE", message: "Modello gia presente negli override.", modelId, modelName: safeModel };
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
  logInlineTrace("override_model_create_attempt", {
    collection: "vehicleModelOverrides",
    docId: modelId,
    role,
    makeName: safeMake,
    modelName: safeModel,
    payloadKeys: Object.keys(overridePayload),
  });
  try {
    await setDoc(doc(db, "vehicleModelOverrides", modelId), overridePayload, { merge: true });
  } catch (error) {
    logInlineTrace("override_model_create_fail", {
      collection: "vehicleModelOverrides",
      docId: modelId,
      role: authoritativeRole,
      code: error?.code || null,
      message: error?.message || String(error),
    });
    throw error;
  }

  try {
    await materializeModel({ modelId, makeName: safeMake, modelName: safeModel, actor: auditActor });
  } catch (error) {
    logInlineTrace("materialize_model_fail", {
      collection: "vehicleModels",
      docId: modelId,
      role,
      code: error?.code || null,
      message: error?.message || String(error),
    });
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
