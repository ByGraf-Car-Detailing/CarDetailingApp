function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function emailLocalPart(email) {
  const clean = sanitizeText(email);
  if (!clean) return "";
  const atIndex = clean.indexOf("@");
  if (atIndex <= 0) return clean;
  return clean.slice(0, atIndex);
}

export function resolveOperatorIdentity({
  allowedDisplayName = "",
  authDisplayName = "",
  email = "",
  operatorId = "",
} = {}) {
  const name =
    sanitizeText(allowedDisplayName) ||
    sanitizeText(authDisplayName) ||
    emailLocalPart(email) ||
    sanitizeText(operatorId);

  return {
    primaryName: name,
    email: sanitizeText(email),
  };
}

export function resolveOperatorDisplayName(params = {}) {
  return resolveOperatorIdentity(params).primaryName || "";
}

