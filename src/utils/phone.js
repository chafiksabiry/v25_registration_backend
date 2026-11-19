/**
 * Téléphone facultatif à l'inscription : vide (absent, '', espaces) => undefined, pour que le champ ne soit
 * pas écrit en base ; sinon même règle de format que le changement de numéro (userService.requestPhoneChange).
 */
export const PHONE_PATTERN = /^\+?[0-9\s().-]{5,32}$/;

export function normalizeOptionalPhone(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return undefined;
  if (!PHONE_PATTERN.test(trimmed) || trimmed.replace(/\D/g, '').length < 5) {
    const err = new Error('Invalid phone number format');
    err.code = 'INVALID_PHONE';
    throw err;
  }
  return trimmed;
}
