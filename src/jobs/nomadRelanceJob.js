import { appSignupService } from '../services/appSignupService.js';

/**
 * Tâche de relance des comptes créés dans l'app (e-mails 2 et 3). Ce service n'avait aucun planificateur : un minuteur dans le
 * processus (Railway garde le service démarré en continu) suffit, car chaque envoi est réservé en base (étape attendue + verrou) :
 * plusieurs instances ou un redémarrage n'envoient jamais deux fois le même e-mail. Rien ne démarre en mode fonction (Netlify) ni
 * dans les tests.
 *
 * Variables : NOMAD_RELANCE_DRY_RUN (simulation sauf « false »), NOMAD_RELANCE_INTERVAL_MINUTES (défaut 15),
 * NOMAD_RELANCE_DELAYS_HOURS (défaut « 24,72 »), NOMAD_RELANCE_DISABLED=true pour arrêter la tâche.
 */
export function startNomadRelanceJob({ service = appSignupService, env = process.env, log = console.log } = {}) {
  if (String(env.NOMAD_RELANCE_DISABLED || '').toLowerCase() === 'true') {
    log('[relance] tâche désactivée (NOMAD_RELANCE_DISABLED)');
    return null;
  }
  const minutes = Math.min(Math.max(Number(env.NOMAD_RELANCE_INTERVAL_MINUTES) || 15, 1), 24 * 60);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await service.runRelances();
      if (r.sent || r.simulated || r.stopped || r.failed) log(`[relance] ${JSON.stringify(r)}`);
    } catch (err) {
      log(`[relance] passage en échec : ${err?.message || err}`);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 60 * 1000);
  const timer = setInterval(tick, minutes * 60 * 1000);
  first.unref?.();
  timer.unref?.();
  return { stop: () => { clearTimeout(first); clearInterval(timer); }, tick };
}
