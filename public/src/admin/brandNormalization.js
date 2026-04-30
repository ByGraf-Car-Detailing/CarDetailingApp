function normalizeBrandName(value) {
  const compact = String(value || "").trim().replace(/\s+/g, " ");
  if (!compact) return "";
  const formatPart = (part) => {
    const clean = String(part || "").trim();
    if (!clean) return "";
    const hasDigit = /\d/.test(clean);
    if (hasDigit || clean.length <= 3) return clean.toUpperCase();
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  };
  return compact
    .split(" ")
    .map((token) =>
      token
        .split("-")
        .map((part) => formatPart(part))
        .filter(Boolean)
        .join("-")
    )
    .filter(Boolean)
    .join(" ");
}

function normalizeBrandKey(value) {
  return normalizeBrandName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeOverrideId(value) {
  return normalizeBrandKey(value).slice(0, 100);
}

function normalizeVehicleType(value) {
  if (value === "car" || value === "motorcycle" || value === "both") return value;
  return "car";
}

function getAliasKeysForCanonical(canonicalName, aliasMap = {}) {
  const aliases = aliasMap[canonicalName] || [];
  return [canonicalName, ...aliases].map(normalizeBrandKey).filter(Boolean);
}

function buildBaselineRegistry(policy) {
  const cars = new Set(policy?.cars?.core || []);
  const motorcycles = new Set(policy?.motorcycles?.core || []);
  const canonical = Array.from(new Set([...cars, ...motorcycles]));
  const aliasMap = policy?.aliasMap || {};
  const byKey = new Map();

  for (const name of canonical) {
    const inCars = cars.has(name);
    const inMotorcycles = motorcycles.has(name);
    const vehicleType = inCars && inMotorcycles ? "both" : inCars ? "car" : "motorcycle";
    for (const key of getAliasKeysForCanonical(name, aliasMap)) {
      if (!byKey.has(key)) byKey.set(key, { canonicalName: name, vehicleType });
    }
  }

  return { byKey, canonical };
}

export {
  buildBaselineRegistry,
  normalizeBrandKey,
  normalizeBrandName,
  normalizeOverrideId,
  normalizeVehicleType,
};
