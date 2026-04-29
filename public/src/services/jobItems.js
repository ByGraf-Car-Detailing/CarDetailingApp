function toPositiveInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return fallback;
  return n;
}

function normalizeJobItem(input, fallbackJobType = null) {
  const source = input && typeof input === "object" ? input : {};
  const jobTypeId = typeof source.jobTypeId === "string" ? source.jobTypeId.trim() : "";
  const jobTypeData = source.jobTypeData && typeof source.jobTypeData === "object"
    ? { ...source.jobTypeData }
    : (fallbackJobType ? { ...fallbackJobType } : null);
  const price = toPositiveInt(source.price, toPositiveInt(jobTypeData?.defaultPrice, 0));
  const lineTotal = toPositiveInt(source.lineTotal, price);
  return {
    jobTypeId,
    jobTypeData,
    price,
    quantity: 1,
    lineTotal: lineTotal === price ? lineTotal : price,
  };
}

function normalizeAppointmentJobItems(appointment) {
  const data = appointment && typeof appointment === "object" ? appointment : {};
  const fromArray = Array.isArray(data.jobItems) ? data.jobItems : [];
  if (fromArray.length > 0) {
    const normalized = fromArray.map((item) => normalizeJobItem(item));
    if (normalized.some((item) => !item.jobTypeId)) {
      console.warn("[jobItems] appointment has malformed jobItems; using best-effort normalization.");
    }
    return normalized;
  }

  const fallback = normalizeJobItem({
    jobTypeId: data.jobTypeId || "",
    jobTypeData: data.jobTypeData || null,
    quantity: 1,
    price: toPositiveInt(data.price, toPositiveInt(data.jobTypeData?.defaultPrice, 0)),
    lineTotal: toPositiveInt(data.price, toPositiveInt(data.jobTypeData?.defaultPrice, 0)),
  });
  if (!fallback.jobTypeId && !fallback.jobTypeData) return [];
  return [fallback];
}

function computeAppointmentPrice(jobItems) {
  return (Array.isArray(jobItems) ? jobItems : []).reduce(
    (sum, item) => sum + toPositiveInt(item?.lineTotal, 0),
    0
  );
}

function buildLegacyFieldsFromJobItems(jobItems) {
  const normalized = (Array.isArray(jobItems) ? jobItems : []).map((item) => normalizeJobItem(item));
  const anchor = normalized[0] || null;
  return {
    jobItems: normalized,
    jobTypeId: anchor?.jobTypeId || "",
    jobTypeData: anchor?.jobTypeData || null,
    price: computeAppointmentPrice(normalized),
  };
}

export {
  buildLegacyFieldsFromJobItems,
  computeAppointmentPrice,
  normalizeAppointmentJobItems,
  normalizeJobItem,
  toPositiveInt,
};
