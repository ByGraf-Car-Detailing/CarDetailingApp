// /src/utils/modal.js
// Premium Dark Theme - Modal System

let modalOverlay = null;
let modalBox = null;

export function openModal({ title = "", content, onClose = null, noModalCancelBtn = false }) {
  // Chiudi eventuale modale aperta
  closeModal();

  // Overlay
  modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.tabIndex = -1;

  // Blocca scrolling pagina
  document.body.style.overflow = "hidden";

  // Box modale
  modalBox = document.createElement("div");
  modalBox.className = "modal";

  // Titolo
  if (title) {
    const titleDiv = document.createElement("div");
    titleDiv.className = "modal__title";
    titleDiv.textContent = title;
    modalBox.appendChild(titleDiv);
  }

  // Bottone chiusura (X)
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modal__close";
  closeBtn.innerHTML = "&times;";
  closeBtn.setAttribute("aria-label", "Chiudi");
  closeBtn.onclick = () => {
    closeModal();
    if (typeof onClose === "function") onClose();
  };
  modalBox.appendChild(closeBtn);

  // Contenuto dinamico
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "modal-content";
  
  if (typeof content === "string") {
    contentWrapper.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    contentWrapper.appendChild(content);
  }
  modalBox.appendChild(contentWrapper);

  // Tasto Annulla fisso (solo se NON disabilitato)
  if (!noModalCancelBtn) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "modal__actions";
    
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Annulla";
    cancelBtn.onclick = () => {
      closeModal();
      if (typeof onClose === "function") onClose();
    };
    actionsDiv.appendChild(cancelBtn);
    modalBox.appendChild(actionsDiv);
  }

  modalOverlay.appendChild(modalBox);
  document.body.appendChild(modalOverlay);

  // Focus e chiusura ESC
  modalBox.tabIndex = 0;
  modalBox.focus();
  
  modalOverlay.onkeydown = (e) => {
    if (e.key === "Escape") {
      closeModal();
      if (typeof onClose === "function") onClose();
    }
  };

  // Ritorna riferimento al content wrapper per setup listeners
  return contentWrapper;
}

// Chiudi modale
export function closeModal() {
  if (modalOverlay && modalOverlay.parentNode) {
    modalOverlay.parentNode.removeChild(modalOverlay);
  }
  modalOverlay = null;
  modalBox = null;
  document.body.style.overflow = "";
}
