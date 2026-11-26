/**
 * E-mails après une création de compte dans l'application mobile (activation + relances J+1, J+3), même gabarit d'images que
 * harxMessages.js (bandeau cid:harx-logo) et mot-symbole NOMAD en image (cid:nomad-wordmark), jamais écrit en texte.
 */
import { escapeHtml, publicApiBase, HARX_LOGO_SRC } from './harxMessages.js';
/**
 * Mot-symbole NOMAD des e-mails : image intégrée (Content-ID NOMAD_WORDMARK_CID, fichier src/assets/nomad-wordmark-email.png),
 * jamais le mot écrit (règle de marque). Comme pour le bandeau : pièce jointe inline sur le relais SMTP, URL publique sur l'API Brevo.
 */
export const NOMAD_WORDMARK_CID = 'nomad-wordmark';
export const NOMAD_WORDMARK_SRC = `cid:${NOMAD_WORDMARK_CID}`;

export function nomadWordmarkUrl() {
  return `${publicApiBase()}/email/nomad-wordmark.png`;
}

/** Image du mot-symbole, à la hauteur du texte courant (rapport largeur / hauteur du fichier : 482 x 52). */
function nomadWordmark(height = 11) {
  const width = Math.round((height * 482) / 52);
  return `<img src="${NOMAD_WORDMARK_SRC}" width="${width}" height="${height}" alt="NOMAD" style="display:inline-block;height:${height}px;width:${width}px;vertical-align:baseline;border:0;" />`;
}

/**
 * Textes des e-mails après une création de compte dans l'app (maquette validée : aso/maquette-relances.html). `{wm}` = mot-symbole.
 * Aucun prix : il n'est lu nulle part dans ce service (pas de prix Stripe par pays ici), donc la ligne de prix est omise.
 */
const NOMAD_APP_TEXTS = {
  fr: {
    s1: 'Votre compte HARX est créé : activez votre ligne',
    h1: (n) => `Bienvenue, ${n}`,
    p1: 'Votre compte est créé. Il reste une étape pour obtenir le numéro de votre pays et l’utiliser dans l’app HARX {wm} :',
    l1: ['choisissez votre numéro ;', 'activez votre abonnement en ligne ;', 'connectez-vous dans l’app avec le même e-mail.'],
    c1: 'Activer ma ligne',
    s2: 'Votre numéro vous suit à l’étranger, sans roaming',
    h2: 'Restez joignable où que vous soyez',
    p2: 'Avec {wm}, vos contacts appellent le numéro de votre pays et vous décrochez dans l’app, en Wi-Fi ou en data :',
    l2: ['pas de roaming ni d’appel international facturé par votre opérateur ;', 'le répondeur résume chaque message avec l’IA ;', 'vos appels et messages restent dans le journal.'],
    c2: 'Choisir mon numéro',
    s3: 'Appeler votre banque ou les impôts depuis l’étranger',
    h3FR: 'Vos démarches, comme si vous étiez en France',
    p3FR: 'Banque, impôts, fournisseur d’énergie : composez leur numéro classique (01, 09…) depuis l’app. C’est votre numéro français qui s’affiche, sans appel international facturé par votre opérateur.',
    n3FR: 'Les numéros courts et surtaxés (3xxx, 08 9x…) ne sont pas joignables.',
    h3: 'Vos démarches, comme si vous étiez chez vous',
    p3: 'Banque, impôts, fournisseur d’énergie : composez leur numéro habituel depuis l’app. C’est le numéro de votre pays qui s’affiche, sans appel international facturé par votre opérateur.',
    n3: 'Les numéros courts et surtaxés ne sont pas joignables.',
    c3: 'Activer ma ligne',
    last: 'Dernier rappel.',
    why: 'Vous recevez cet e-mail car vous avez créé un compte dans l’app HARX {wm} et accepté d’être recontacté.',
    whyNoConsent: 'Vous recevez cet e-mail car vous avez créé un compte dans l’app HARX {wm}.',
    unsub: 'Se désabonner',
  },
  en: {
    s1: 'Your HARX account is ready: activate your line',
    h1: (n) => `Welcome, ${n}`,
    p1: 'Your account is ready. One step remains to get your country’s number and use it in the HARX {wm} app:',
    l1: ['choose your number;', 'activate your subscription online;', 'sign in to the app with the same e-mail.'],
    c1: 'Activate my line',
    s2: 'Your number follows you abroad, without roaming',
    h2: 'Stay reachable wherever you are',
    p2: 'With {wm}, your contacts call your country’s number and you answer in the app, over Wi-Fi or data:',
    l2: ['no roaming and no international call billed by your carrier;', 'voicemail sums up every message with AI;', 'your calls and messages stay in the log.'],
    c2: 'Choose my number',
    s3: 'Call your bank or the tax office from abroad',
    h3FR: 'Your errands, as if you were in France',
    p3FR: 'Bank, tax office, energy supplier: dial their usual number (01, 09…) from the app. Your French number is displayed, with no international call billed by your carrier.',
    n3FR: 'Short and premium-rate numbers (3xxx, 08 9x…) cannot be reached.',
    h3: 'Your errands, as if you were at home',
    p3: 'Bank, tax office, energy supplier: dial their usual number from the app. Your country’s number is displayed, with no international call billed by your carrier.',
    n3: 'Short and premium-rate numbers cannot be reached.',
    c3: 'Activate my line',
    last: 'Last reminder.',
    why: 'You are receiving this e-mail because you created an account in the HARX {wm} app and agreed to be contacted.',
    whyNoConsent: 'You are receiving this e-mail because you created an account in the HARX {wm} app.',
    unsub: 'Unsubscribe',
  },
  es: {
    s1: 'Tu cuenta HARX está creada: activa tu línea',
    h1: (n) => `Bienvenido/a, ${n}`,
    p1: 'Tu cuenta está creada. Queda un paso para obtener el número de tu país y usarlo en la app HARX {wm}:',
    l1: ['elige tu número;', 'activa tu suscripción en línea;', 'inicia sesión en la app con el mismo correo.'],
    c1: 'Activar mi línea',
    s2: 'Tu número te sigue en el extranjero, sin roaming',
    h2: 'Sigue localizable estés donde estés',
    p2: 'Con {wm}, tus contactos llaman al número de tu país y tú contestas en la app, por wifi o datos:',
    l2: ['sin roaming ni llamadas internacionales facturadas por tu operador;', 'el buzón de voz resume cada mensaje con IA;', 'tus llamadas y mensajes quedan en el historial.'],
    c2: 'Elegir mi número',
    s3: 'Llama a tu banco o a Hacienda desde el extranjero',
    h3FR: 'Tus trámites, como si estuvieras en Francia',
    p3FR: 'Banco, impuestos, proveedor de energía: marca su número habitual (01, 09…) desde la app. Se muestra tu número francés, sin llamadas internacionales facturadas por tu operador.',
    n3FR: 'Los números cortos y de tarificación especial (3xxx, 08 9x…) no están disponibles.',
    h3: 'Tus trámites, como si estuvieras en casa',
    p3: 'Banco, impuestos, proveedor de energía: marca su número habitual desde la app. Se muestra el número de tu país, sin llamadas internacionales facturadas por tu operador.',
    n3: 'Los números cortos y de tarificación especial no están disponibles.',
    c3: 'Activar mi línea',
    last: 'Último recordatorio.',
    why: 'Recibes este correo porque creaste una cuenta en la app HARX {wm} y aceptaste que te contactemos.',
    whyNoConsent: 'Recibes este correo porque creaste una cuenta en la app HARX {wm}.',
    unsub: 'Darse de baja',
  },
  ar: {
    s1: 'تم إنشاء حسابك في HARX: فعّل خطك',
    h1: (n) => `مرحبًا، ${n}`,
    p1: 'تم إنشاء حسابك. بقيت خطوة واحدة للحصول على رقم بلدك واستخدامه في تطبيق HARX {wm}:',
    l1: ['اختر رقمك؛', 'فعّل اشتراكك عبر الإنترنت؛', 'سجّل الدخول إلى التطبيق بالبريد الإلكتروني نفسه.'],
    c1: 'تفعيل خطي',
    s2: 'رقمك يرافقك في الخارج، دون تجوال',
    h2: 'ابقَ متاحًا أينما كنت',
    p2: 'مع {wm}، يتصل بك معارفك على رقم بلدك وتجيب في التطبيق عبر الواي فاي أو البيانات:',
    l2: ['لا تجوال ولا مكالمات دولية يحتسبها مشغّلك؛', 'البريد الصوتي يلخّص كل رسالة بالذكاء الاصطناعي؛', 'تبقى مكالماتك ورسائلك في السجل.'],
    c2: 'اختيار رقمي',
    s3: 'اتصل بمصرفك أو بمصلحة الضرائب من الخارج',
    h3FR: 'معاملاتك كما لو كنت في فرنسا',
    p3FR: 'المصرف، الضرائب، مزوّد الطاقة: اطلب رقمهم المعتاد (01، 09…) من التطبيق. يظهر رقمك الفرنسي، دون مكالمة دولية يحتسبها مشغّلك.',
    n3FR: 'لا يمكن الاتصال بالأرقام القصيرة والأرقام ذات التعرفة الخاصة (3xxx، 08 9x…).',
    h3: 'معاملاتك كما لو كنت في بلدك',
    p3: 'المصرف، الضرائب، مزوّد الطاقة: اطلب رقمهم المعتاد من التطبيق. يظهر رقم بلدك، دون مكالمة دولية يحتسبها مشغّلك.',
    n3: 'لا يمكن الاتصال بالأرقام القصيرة والأرقام ذات التعرفة الخاصة.',
    c3: 'تفعيل خطي',
    last: 'تذكير أخير.',
    why: 'تتلقى هذه الرسالة لأنك أنشأت حسابًا في تطبيق HARX {wm} ووافقت على أن نتواصل معك.',
    whyNoConsent: 'تتلقى هذه الرسالة لأنك أنشأت حسابًا في تطبيق HARX {wm}.',
    unsub: 'إلغاء الاشتراك',
  },
};
export const NOMAD_APP_EMAIL_LANGS = Object.keys(NOMAD_APP_TEXTS);

const withWm = (s, wmHtml) => s.split('{wm}').join(wmHtml);
/** Version texte : le mot-symbole n'existe qu'en image ; le texte brut dit seulement « l'app HARX ». */
const plain = (s) => s.split('HARX {wm}').join('HARX').split('{wm}').join('HARX');

/**
 * E-mails 1 (activation, immédiat), 2 (J+1) et 3 (J+3) après une création de compte dans l'app.
 * `consent: false` : seul l'e-mail 1 existe (activation, sans lien de désabonnement puisqu'aucune relance ne suit).
 * @returns {{ subject: string, text: string, html: string, unsubscribeUrl: string|null }}
 */
export function nomadAppEmail({ step, lang, firstName, country, activationUrl, unsubscribeUrl = null, consent = true }) {
  const L = NOMAD_APP_TEXTS[lang] ? lang : 'en';
  const T = NOMAD_APP_TEXTS[L];
  const n = [1, 2, 3].includes(step) ? step : 1;
  const unsub = consent && unsubscribeUrl ? unsubscribeUrl : null;
  const fr = String(country || '').toUpperCase() === 'FR';
  const wm = nomadWordmark(11);
  const wmSmall = nomadWordmark(9);
  const rtl = L === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const safeName = escapeHtml(firstName || '');
  const url = escapeHtml(activationUrl);
  let subject; let heading; let paragraph; let items = []; let cta; let note = null;
  if (n === 1) { subject = T.s1; heading = T.h1(safeName); paragraph = T.p1; items = T.l1; cta = T.c1; }
  if (n === 2) { subject = T.s2; heading = T.h2; paragraph = T.p2; items = T.l2; cta = T.c2; }
  if (n === 3) { subject = T.s3; heading = fr ? T.h3FR : T.h3; paragraph = fr ? T.p3FR : T.p3; cta = T.c3; note = fr ? T.n3FR : T.n3; }
  const why = (n === 3 ? `${T.last} ` : '') + (unsub ? T.why : T.whyNoConsent);
  const list = items.length
    ? `<ul style="margin:10px 0;padding-${rtl ? 'right' : 'left'}:18px;">${items.map((i) => `<li style="margin:0 0 4px;">${escapeHtml(i)}</li>`).join('')}</ul>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="${L}" dir="${dir}">
  <body style="margin:0;padding:0;background-color:#e9ecf3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#e9ecf3" style="background-color:#e9ecf3;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="#ffffff" dir="${dir}" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td align="center" bgcolor="#050914" style="background-color:#050914;padding:0;line-height:0;font-size:0;">
                <img src="${HARX_LOGO_SRC}" width="560" alt="HARX" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td align="${align}" style="padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0b1020;text-align:${align};">
                <h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0b1020;">${heading}</h2>
                ${withWm(escapeHtml(paragraph), wm)}
                ${list}
                <p style="margin:14px 0 6px;">
                  <a href="${url}" style="display:inline-block;padding:13px 26px;border-radius:999px;color:#ffffff;font-weight:800;text-decoration:none;background-color:#E6188D;background-image:linear-gradient(90deg,#F7941E,#E6188D 55%,#ED1C24);">${escapeHtml(cta)}</a>
                </p>
                ${note ? `<p style="margin:6px 0 0;font-size:13px;color:#5b6480;">${escapeHtml(note)}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td align="${align}" style="padding:14px 24px 20px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.5;color:#7a829c;border-top:1px solid #eef0f5;text-align:${align};">
                ${withWm(escapeHtml(why), wmSmall)}${unsub ? ` <a href="${escapeHtml(unsub)}" style="color:#7a829c;text-decoration:underline;">${escapeHtml(T.unsub)}</a>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    heading.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
    '',
    plain(paragraph),
    ...items.map((i) => `- ${i}`),
    '',
    `${cta} : ${activationUrl}`,
    ...(note ? ['', note] : []),
    '',
    plain(why),
    ...(unsub ? [`${T.unsub} : ${unsub}`] : []),
  ].join('\n');
  return { subject, text, html, unsubscribeUrl: unsub };
}
