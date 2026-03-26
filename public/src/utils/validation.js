// === VALIDATION UTILS - Standard per tutti i form ===

export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  onlyNumbers: /[^0-9]/g,
  onlyLettersNumbers: /[^a-zA-Z0-9]/g
};

// Filtra input: solo numeri
export function filterNumbers(input) {
  input.addEventListener("input", () => {
    input.value = input.value.replace(patterns.onlyNumbers, "");
  });
}

// Auto-capitalize ogni parola
export function autoCapitalize(input) {
  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const val = input.value;
    const capitalized = val.split(" ").map(w => 
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(" ");
    if (val !== capitalized) {
      input.value = capitalized;
      input.setSelectionRange(pos, pos);
    }
  });
}

// Auto-uppercase
export function autoUppercase(input) {
  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(pos, pos);
  });
}

// Formato telaio: XXX XXX XXX... (uppercase + blocchi da 3)
export function formatTelaio(input) {
  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    let val = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let formatted = "";
    for (let i = 0; i < val.length; i++) {
      if (i > 0 && i % 3 === 0) formatted += " ";
      formatted += val[i];
    }
    input.value = formatted;
    // Adjust cursor for added spaces
    const spacesAdded = (formatted.match(/ /g) || []).length - (input.value.substring(0, pos).match(/ /g) || []).length;
    input.setSelectionRange(pos + spacesAdded, pos + spacesAdded);
  });
}

// Valida email
export function isValidEmail(email) {
  return patterns.email.test(email);
}

// Valida CAP (4-5 cifre)
export function isValidCAP(cap) {
  return /^\d{4,5}$/.test(cap);
}

// Setup validazione per un form
export function setupFormValidation(config) {
  const { phoneInput, capInput, emailInput, firstNameInput, lastNameInput, licenseInput, telInput, telainput } = config;
  
  if (phoneInput) filterNumbers(phoneInput);
  if (capInput) filterNumbers(capInput);
  if (telInput) filterNumbers(telInput);
  if (firstNameInput) autoCapitalize(firstNameInput);
  if (lastNameInput) autoCapitalize(lastNameInput);
  if (licenseInput) autoUppercase(licenseInput);
  if (telainput) formatTelaio(telainput);
}
