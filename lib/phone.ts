// Phone connector — deterministic, offline intel from a number (validity, country,
// line type, formats) via libphonenumber. Automated owner-identity lookup isn't free,
// so the node points to the Epieos / Truecaller / PhoneInfoga pivots (pre-filled).

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

export function looksLikePhone(s: string): boolean {
  const t = s.trim();
  if (!/^\+?[\d\s().\-]{7,20}$/.test(t)) return false;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export interface PhoneIntel {
  input: string;
  valid: boolean;
  e164?: string;
  international?: string;
  national?: string;
  country?: string;
  callingCode?: string;
  type?: string;
}

export function phoneIntel(input: string, defaultCountry = "FR"): PhoneIntel {
  try {
    const p = parsePhoneNumberFromString(input, defaultCountry as CountryCode);
    if (!p) return { input, valid: false };
    return {
      input,
      valid: p.isValid(),
      e164: p.number,
      international: p.formatInternational(),
      national: p.formatNational(),
      country: p.country,
      callingCode: p.countryCallingCode ? "+" + p.countryCallingCode : undefined,
      type: p.getType(),
    };
  } catch {
    return { input, valid: false };
  }
}
