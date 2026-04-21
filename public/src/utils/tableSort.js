const SORT_PREFS_KEY = "tableSortPrefs.v1";

function normalizeDirection(value) {
  return value === "asc" || value === "desc" ? value : null;
}

function normalizeState(value, fallback) {
  const defaultState = {
    key: fallback?.key || "",
    direction: normalizeDirection(fallback?.direction) || "asc",
  };
  if (!value || typeof value !== "object") return defaultState;
  const key = typeof value.key === "string" ? value.key : defaultState.key;
  const direction = normalizeDirection(value.direction) || defaultState.direction;
  return { key, direction };
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function readPrefs() {
  const raw = localStorage.getItem(SORT_PREFS_KEY);
  if (!raw) return {};
  const parsed = safeParse(raw, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writePrefs(prefs) {
  localStorage.setItem(SORT_PREFS_KEY, JSON.stringify(prefs));
}

export function resolveSortUserKey({ authUser = null, fallbackEmail = "" } = {}) {
  const email = (authUser?.email || fallbackEmail || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const uid = (authUser?.uid || "").trim();
  if (uid) return `uid:${uid}`;
  return "anonymous";
}

export function loadSortState({ tableId, userKey, defaultState }) {
  if (!tableId || !userKey) return normalizeState(null, defaultState);
  const prefs = readPrefs();
  const saved = prefs?.[userKey]?.[tableId];
  return normalizeState(saved, defaultState);
}

export function saveSortState({ tableId, userKey, state }) {
  if (!tableId || !userKey) return;
  const prefs = readPrefs();
  const userPrefs = prefs[userKey] && typeof prefs[userKey] === "object" ? prefs[userKey] : {};
  userPrefs[tableId] = normalizeState(state, state);
  prefs[userKey] = userPrefs;
  writePrefs(prefs);
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  const sa = String(a).trim().toLowerCase();
  const sb = String(b).trim().toLowerCase();
  return sa.localeCompare(sb, "it", { numeric: true, sensitivity: "base" });
}

export function sortRows(rows, { state, columns, tieBreaker }) {
  if (!Array.isArray(rows)) return [];
  const sortState = normalizeState(state, state);
  const column = (columns || []).find((item) => item?.key === sortState.key && item?.sortable !== false);
  if (!column || typeof column.getValue !== "function") return [...rows];

  const directionFactor = sortState.direction === "desc" ? -1 : 1;
  const fallback = typeof tieBreaker === "function" ? tieBreaker : (row) => row?.id || "";

  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const primary = compareValues(column.getValue(left.row), column.getValue(right.row));
      if (primary !== 0) return primary * directionFactor;
      const tie = compareValues(fallback(left.row), fallback(right.row));
      if (tie !== 0) return tie;
      return left.index - right.index;
    })
    .map((item) => item.row);
}

export function buildSortableHeaderRow({ columns, state, onSortChange }) {
  const tr = document.createElement("tr");
  const currentState = normalizeState(state, state);

  (columns || []).forEach((column) => {
    const th = document.createElement("th");
    if (column?.className) th.className = column.className;
    const sortable = column?.sortable !== false && typeof column?.key === "string";
    const isActive = sortable && currentState.key === column.key;
    const ariaSort = isActive
      ? (currentState.direction === "asc" ? "ascending" : "descending")
      : "none";
    th.setAttribute("aria-sort", ariaSort);

    if (sortable) {
      th.classList.add("th-sortable");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "th-sort-btn";
      btn.dataset.sortKey = column.key;
      btn.setAttribute("aria-label", `Ordina per ${column.label}`);
      btn.setAttribute("title", `Ordina per ${column.label}`);
      btn.innerHTML = `
        <span>${column.label}</span>
        <span class="sort-indicator" aria-hidden="true">${isActive ? (currentState.direction === "asc" ? "▲" : "▼") : "↕"}</span>
      `;
      btn.addEventListener("click", () => {
        const nextDirection =
          isActive && currentState.direction === "asc" ? "desc" : "asc";
        onSortChange?.({ key: column.key, direction: nextDirection });
      });
      th.appendChild(btn);
    } else {
      th.textContent = column?.label || "";
      th.classList.add("th-static");
    }

    tr.appendChild(th);
  });

  return tr;
}
