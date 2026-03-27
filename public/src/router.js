export function initRouter({ sectionByView, hideAllSections } = {}) {
  const resolvedSections = Array.isArray(sectionByView) ? sectionByView : [];

  function getCurrentView() {
    return localStorage.getItem("currentView");
  }

  function setCurrentView(viewKey) {
    localStorage.setItem("currentView", viewKey);
  }

  function clearCurrentView() {
    localStorage.removeItem("currentView");
  }

  function persistCurrentViewFromUI() {
    const active = resolvedSections.find(
      (item) => item.el && getComputedStyle(item.el).display !== "none"
    );
    if (active) {
      setCurrentView(active.key);
    }
  }

  function restoreCurrentView() {
    const currentView = getCurrentView();
    if (!currentView) return null;

    const target = resolvedSections.find((item) => item.key === currentView && item.el);
    if (!target) return null;

    hideAllSections();
    target.el.style.display = "block";
    return currentView;
  }

  return {
    clearCurrentView,
    getCurrentView,
    persistCurrentViewFromUI,
    restoreCurrentView,
    setCurrentView,
  };
}
