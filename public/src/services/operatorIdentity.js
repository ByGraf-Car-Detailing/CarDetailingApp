function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

const OPERATOR_UNKNOWN_NAME = "Operatore sconosciuto";

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

export function resolveOperatorAuditName({
  updatedByName = "",
  allowedDisplayName = "",
  sessionDisplayName = "",
  authDisplayName = "",
} = {}) {
  return (
    sanitizeText(updatedByName) ||
    sanitizeText(allowedDisplayName) ||
    sanitizeText(sessionDisplayName) ||
    sanitizeText(authDisplayName) ||
    OPERATOR_UNKNOWN_NAME
  );
}

export function resolveSessionOperatorName() {
  let fromWindow = "";
  let fromStorage = "";

  if (typeof window !== "undefined") {
    fromWindow = sanitizeText(window.userName);
  }
  try {
    if (typeof localStorage !== "undefined") {
      fromStorage = sanitizeText(localStorage.getItem("userName"));
    }
  } catch {
    fromStorage = "";
  }

  return resolveOperatorAuditName({
    sessionDisplayName: fromWindow || fromStorage,
  });
}

export function buildOperatorAuditActor({
  email = "",
  operatorId = "",
  updatedByName = "",
  allowedDisplayName = "",
  sessionDisplayName = "",
  authDisplayName = "",
} = {}) {
  const technicalId = sanitizeText(email) || sanitizeText(operatorId) || "unknown";
  const displayName = resolveOperatorAuditName({
    updatedByName,
    allowedDisplayName,
    sessionDisplayName,
    authDisplayName,
  });
  return {
    updatedBy: technicalId,
    updatedByName: displayName,
  };
}

export { OPERATOR_UNKNOWN_NAME };

