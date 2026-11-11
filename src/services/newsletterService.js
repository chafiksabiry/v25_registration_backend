import NewsletterSubscriber from '../models/NewsletterSubscriber.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribe({ email, locale, source } = {}) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized) {
    const err = new Error('email is required');
    err.status = 400;
    throw err;
  }
  if (!EMAIL_RE.test(normalized)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }

  const interest = typeof source === 'string' && source.trim() ? source.trim() : null;
  const existing = await NewsletterSubscriber.findOne({ email: normalized }).lean();
  if (existing) {
    // Déjà inscrit (ex. par le pied de page) : on retient quand même l'annonce demandée.
    if (interest) await NewsletterSubscriber.updateOne({ _id: existing._id }, { $addToSet: { interests: interest } });
    return { email: existing.email, created: false };
  }

  try {
    const doc = await NewsletterSubscriber.create({
      email: normalized,
      locale: typeof locale === 'string' && locale.trim() ? locale.trim() : null,
      source: interest ?? 'landing_footer',
      interests: interest ? [interest] : [],
    });
    return { email: doc.email, created: true };
  } catch (error) {
    // Concurrent insert on unique email
    if (error?.code === 11000) {
      if (interest) await NewsletterSubscriber.updateOne({ email: normalized }, { $addToSet: { interests: interest } });
      return { email: normalized, created: false };
    }
    throw error;
  }
}
