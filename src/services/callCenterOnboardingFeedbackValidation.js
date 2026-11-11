/** Validation de l'avis sur la mise en route (pure, testable sans base). */
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export function normalizeFeedbackInput(body) {
  const errors = [];
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('La note doit être un entier de 1 à 5.');
  let durationSeconds = null;
  if (body?.durationSeconds !== null && body?.durationSeconds !== undefined && body?.durationSeconds !== '') {
    const d = Number(body.durationSeconds);
    if (Number.isFinite(d) && d >= 0) durationSeconds = Math.round(d);
  }
  return { errors, value: { rating, comment: str(body?.comment, 2000), durationSeconds } };
}
