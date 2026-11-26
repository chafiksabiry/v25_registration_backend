import { appSignupService, AppSignupError } from '../services/appSignupService.js';

const PAGE_TEXT = {
  fr: { title: 'Désabonnement', ask: 'Ne plus recevoir les e-mails de rappel HARX ?', button: 'Me désabonner', done: 'C’est fait : vous ne recevrez plus ces e-mails.', bad: 'Ce lien n’est pas valide.' },
  en: { title: 'Unsubscribe', ask: 'Stop receiving HARX reminder e-mails?', button: 'Unsubscribe', done: 'Done: you will no longer receive these e-mails.', bad: 'This link is not valid.' },
  es: { title: 'Darse de baja', ask: '¿Dejar de recibir los correos de recordatorio de HARX?', button: 'Darme de baja', done: 'Listo: ya no recibirás estos correos.', bad: 'Este enlace no es válido.' },
  ar: { title: 'إلغاء الاشتراك', ask: 'هل تريد التوقف عن تلقي رسائل التذكير من HARX؟', button: 'إلغاء اشتراكي', done: 'تم: لن تتلقى هذه الرسائل بعد الآن.', bad: 'هذا الرابط غير صالح.' },
};
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pageLang(req) {
  const q = String(req.query?.lang || '').slice(0, 2).toLowerCase();
  if (PAGE_TEXT[q]) return q;
  const h = String(req.headers?.['accept-language'] || '').slice(0, 2).toLowerCase();
  return PAGE_TEXT[h] ? h : 'en';
}

function page(lang, body) {
  const T = PAGE_TEXT[lang];
  return `<!DOCTYPE html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(T.title)}</title></head>`
    + `<body style="margin:0;background:#050814;color:#fff;font-family:Inter,Segoe UI,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;"><main style="max-width:420px;padding:24px;text-align:center;">${body}</main></body></html>`;
}

/** POST /api/auth/app-signup : { firstName, email, country, lang, consent } -> 200 identique que l'e-mail existe ou non. */
export const appSignup = async (req, res) => {
  try {
    const { response, background } = await appSignupService.signup(req.body, req);
    background.catch(() => undefined);
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof AppSignupError) return res.status(error.statusCode).json({ success: false, code: error.code, field: error.field });
    console.error('[app-signup]', error?.message || error);
    return res.status(500).json({ success: false, code: 'APP_SIGNUP_FAILED' });
  }
};

/** GET : page de confirmation (un simple affichage ne désabonne pas : les antivirus de messagerie ouvrent les liens). */
export const unsubscribePage = (req, res) => {
  const lang = pageLang(req);
  const T = PAGE_TEXT[lang];
  const t = typeof req.query?.t === 'string' ? req.query.t : '';
  res.set('Cache-Control', 'no-store');
  res.status(200).type('html').send(page(lang, `<p style="font-size:18px;line-height:1.5;">${escape(T.ask)}</p>`
    + `<form method="post" action="?t=${encodeURIComponent(t)}&amp;lang=${lang}"><button type="submit" style="margin-top:12px;padding:14px 28px;border:0;border-radius:999px;color:#fff;font-weight:800;font-size:16px;background:linear-gradient(90deg,#ff4d4d,#ec4899);">${escape(T.button)}</button></form>`));
};

/** POST : désabonnement en un clic (RFC 8058, List-Unsubscribe-Post) ou bouton de la page. */
export const unsubscribe = async (req, res) => {
  const lang = pageLang(req);
  const T = PAGE_TEXT[lang];
  const t = typeof req.query?.t === 'string' ? req.query.t : (typeof req.body?.t === 'string' ? req.body.t : '');
  try {
    const ok = await appSignupService.unsubscribe(t);
    res.set('Cache-Control', 'no-store');
    res.status(ok ? 200 : 400).type('html').send(page(lang, `<p style="font-size:18px;line-height:1.5;">${escape(ok ? T.done : T.bad)}</p>`));
  } catch (error) {
    console.error('[app-signup] désabonnement', error?.message || error);
    res.status(500).type('html').send(page(lang, `<p>${escape(T.bad)}</p>`));
  }
};
