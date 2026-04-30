import { normalizeBrandKey, normalizeOverrideId } from "./brandNormalization.js";

function valuesDiffer(a, b) {
  return (a ?? null) !== (b ?? null);
}

function indexMakesByName(makes) {
  const byKey = new Map();
  for (const make of makes) {
    const key = normalizeBrandKey(make?.MakeName);
    if (key && !byKey.has(key)) byKey.set(key, make);
  }
  return byKey;
}

function resolveFromIndex(canonicalName, index, aliasMap) {
  const keys = [canonicalName, ...(aliasMap[canonicalName] || [])].map((v) => normalizeBrandKey(v)).filter(Boolean);
  for (const key of keys) {
    const match = index.get(key);
    if (match) return match;
  }
  return null;
}

function planMajorMakes(policy, carMakesRaw, motorcycleMakesRaw) {
  const carSet = new Set(policy.cars.core);
  const motorcycleSet = new Set(policy.motorcycles.core);
  const canonical = Array.from(new Set([...carSet, ...motorcycleSet]));
  const carIndex = indexMakesByName(carMakesRaw);
  const motorcycleIndex = indexMakesByName(motorcycleMakesRaw);
  const excludeRegexes = (policy.excludePatterns || []).map((p) => new RegExp(p, "i"));

  const selected = [];
  const missingCoreMatches = [];

  for (const canonicalName of canonical) {
    if (excludeRegexes.some((rx) => rx.test(canonicalName))) continue;

    const inCars = carSet.has(canonicalName);
    const inMotorcycles = motorcycleSet.has(canonicalName);
    const carMatch = inCars ? resolveFromIndex(canonicalName, carIndex, policy.aliasMap || {}) : null;
    const motorcycleMatch = inMotorcycles
      ? resolveFromIndex(canonicalName, motorcycleIndex, policy.aliasMap || {})
      : null;

    if (inCars && !carMatch) missingCoreMatches.push({ canonicalName, expectedType: "car" });
    if (inMotorcycles && !motorcycleMatch) {
      missingCoreMatches.push({ canonicalName, expectedType: "motorcycle" });
    }
    if (!carMatch && !motorcycleMatch) continue;

    selected.push({
      canonicalName,
      vehicleType: inCars && inMotorcycles ? "both" : inCars ? "car" : "motorcycle",
      makeId: carMatch?.MakeId ?? motorcycleMatch?.MakeId ?? null,
      makeIdCar: carMatch?.MakeId ?? null,
      makeIdMotorcycle: motorcycleMatch?.MakeId ?? null,
      nhtsaNameCar: carMatch?.MakeName ?? null,
      nhtsaNameMotorcycle: motorcycleMatch?.MakeName ?? null,
    });
  }

  return { selected, missingCoreMatches };
}

function planMajorMakesUpserts(existingMakesById, selectedMajorMakes, policyVersion) {
  const operations = [];
  const selectedIds = new Set();
  const nowIso = new Date().toISOString();
  let skipped = 0;

  for (const make of selectedMajorMakes) {
    const docId = normalizeOverrideId(make.canonicalName);
    selectedIds.add(docId);
    const existing = existingMakesById.get(docId);

    const base = {
      name: make.canonicalName,
      active: true,
      source: "NHTSA_MAJOR_POLICY",
      policyVersion,
      vehicleType: make.vehicleType,
      makeId: make.makeId,
      makeIdCar: make.makeIdCar,
      makeIdMotorcycle: make.makeIdMotorcycle,
      nhtsaNameCar: make.nhtsaNameCar,
      nhtsaNameMotorcycle: make.nhtsaNameMotorcycle,
    };

    if (!existing) {
      operations.push({
        collection: "vehicleMakes",
        docId,
        data: { ...base, addedAt: nowIso, updatedAt: nowIso },
      });
      continue;
    }

    const patch = {};
    for (const [key, val] of Object.entries(base)) {
      if (valuesDiffer(existing[key], val)) patch[key] = val;
    }
    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }
    patch.updatedAt = nowIso;
    operations.push({ collection: "vehicleMakes", docId, data: patch });
  }

  for (const [docId, data] of existingMakesById.entries()) {
    if (selectedIds.has(docId)) continue;
    if (data?.active !== true) continue;
    // Preserve manual/custom makes: policy sync may deactivate only baseline policy-managed makes.
    const source = String(data?.source || "").trim().toLowerCase();
    const origin = String(data?.origin || "").trim().toLowerCase();
    const isCustomManual = source === "manual_override" || origin === "custom";
    if (isCustomManual) continue;
    operations.push({
      collection: "vehicleMakes",
      docId,
      data: {
        active: false,
        deactivatedByPolicyVersion: policyVersion,
        updatedAt: nowIso,
      },
    });
  }

  return {
    operations,
    skipped,
    selectedCount: selectedMajorMakes.length,
    existingCount: existingMakesById.size,
  };
}

function planModelsForActiveMakes(activeMakes, existingModelsByMake, modelsByMake, policyVersion) {
  const operations = [];
  const nowIso = new Date().toISOString();
  let inspectedModels = 0;
  let skippedNoChange = 0;
  let skippedManualConflict = 0;

  for (const make of activeMakes) {
    const makeName = String(make?.name || "").trim();
    if (!makeName) continue;
    const makeId = make?.makeId ?? null;
    const models = modelsByMake.get(makeName) || [];
    const existingById = existingModelsByMake.get(makeName) || new Map();

    for (const item of models) {
      const modelName = String(item?.Model_Name || "").trim();
      if (!modelName) continue;
      inspectedModels += 1;
      const docId = normalizeOverrideId(`${makeName}_${modelName}`);
      const existing = existingById.get(docId);
      if (existing?.source === "manual") {
        skippedManualConflict += 1;
        continue;
      }

      const base = {
        make: makeName,
        makeId,
        name: modelName,
        source: "api",
        policyVersion,
      };

      if (!existing) {
        operations.push({
          collection: "vehicleModels",
          docId,
          data: { ...base, addedAt: nowIso, updatedAt: nowIso },
        });
        continue;
      }

      const patch = {};
      for (const [key, val] of Object.entries(base)) {
        if (valuesDiffer(existing[key], val)) patch[key] = val;
      }
      if (Object.keys(patch).length === 0) {
        skippedNoChange += 1;
        continue;
      }
      patch.updatedAt = nowIso;
      operations.push({ collection: "vehicleModels", docId, data: patch });
    }
  }

  return {
    operations,
    inspectedModels,
    skippedNoChange,
    skippedManualConflict,
    activeMakesCount: activeMakes.length,
  };
}

async function applyPlanChunked(operations, maxWrites, applyOperation) {
  const allowed = Math.max(1, Number(maxWrites) || 1);
  const chunk = operations.slice(0, allowed);
  for (const op of chunk) {
    await applyOperation(op);
  }
  return {
    planned: operations.length,
    applied: chunk.length,
    deferred: Math.max(0, operations.length - chunk.length),
  };
}

export {
  normalizeOverrideId as normalizeDocId,
  planMajorMakes,
  planMajorMakesUpserts,
  planModelsForActiveMakes,
  applyPlanChunked,
};

