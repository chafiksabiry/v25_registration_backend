#!/usr/bin/env node
/**
 * Send the HARX v1 reps re-engagement e-mail through Amazon SES, in stages.
 *
 * Dry-run is the default: nothing is sent, a preview is written if --preview-out is given.
 *
 *   node send.js --tokens ~/HARX_reengagement/tokens_pilot_A.csv \
 *                --link-base https://harx26connection-recette.netlify.app --limit 20
 *
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY come from the environment only (never a flag).
 *   node send.js ... --apply --expect-account 407525819683 --config-set <name> \
 *                --ledger ~/HARX_reengagement/ledger.jsonl --limit 300
 *
 * Options:
 *   --tokens <csv>          email,token file written by importV1Reps.js --tokens-out (required)
 *   --link-base <https url> where the one-click page lives (required): recette host or https://harx.ai
 *   --file <jsonl>          cleaned reps file (segment, languages, country): needed for --segments and for
 *                           the automatic language choice; without it every e-mail is the bilingual version
 *   --lang auto|fr|en|bi    auto (default): declared languages, then country, else bilingual; or force one version
 *   --segments A,C,D        send only to these v1 segments (needs --file)
 *   --exclude <txt>         one e-mail per line never to mail (opt-outs, bounces)
 *   --limit <n>             max recipients this run (required with --apply: one stage per run)
 *   --apply                 actually send
 *   --expect-account <id>   required with --apply: refuses to send from another AWS account
 *   --config-set <name>     SES configuration set (required with --apply)
 *   --ledger <jsonl>        attempt log used to skip already-sent addresses (required with --apply)
 *   --region <r>            default eu-west-3 (Paris)
 *   --from <addr>           default "HARX <reps@mail.harx.ai>"
 *   --reply-to <addr>       default reps-support@harx.ai
 *   --rate <n>              messages per second, default 2
 *   --check-every <n>       check bounce/complaint rates every n sends, default 100
 *   --max-bounce <ratio>    default 0.02     --max-complaint <ratio> default 0.001
 *   --min-sample <n>        sends needed before the rates count, default 100
 *   --campaign-tag <v>      message tag / CloudWatch dimension value, default reps-reengagement
 *   --asset-base <https>    where /email/harx-banner.jpg is served (registration backend); default production.
 *                           With --apply the banner must answer 200, otherwise nothing is sent.
 *   --preview-out <html>    write the rendered e-mails (placeholder link) for review: <name>-fr.html, -en.html, -bi.html
 */
import fs from 'fs';
import { pathToFileURL } from 'url';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { buildLink, buildBannerUrl, renderEmail, SUPPORT_ADDRESS } from './lib/template.js';
import { chooseLanguage, LANGS } from './lib/lang.js';
import { parseTokens, parseEmailList, maskEmail, safeMessage } from './lib/csv.js';
import { readLedger, appendLedger } from './lib/ledger.js';
import { evaluateRates, fetchCampaignCounts, DEFAULT_LIMITS } from './lib/guard.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_CONSECUTIVE_FAILURES = 10;
const ABORT_ERRORS = new Set(['AccountSuspendedException', 'SendingPausedException', 'NotFoundException', 'AccountSendingPausedException']);

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n, d = null) => {
    const i = args.indexOf(n);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
  };
  return {
    tokens: opt('--tokens'),
    linkBase: opt('--link-base'),
    file: opt('--file'),
    lang: opt('--lang', 'auto'),
    segments: opt('--segments') ? new Set(opt('--segments').split(',').map((s) => s.trim().toUpperCase())) : null,
    exclude: opt('--exclude'),
    limit: Number(opt('--limit', 0)) || 0,
    apply: flag('--apply'),
    expectAccount: opt('--expect-account'),
    configSet: opt('--config-set'),
    ledger: opt('--ledger'),
    region: opt('--region', 'eu-west-3'),
    from: opt('--from', 'HARX <reps@mail.harx.ai>'),
    replyTo: opt('--reply-to', SUPPORT_ADDRESS),
    rate: Number(opt('--rate', 2)) || 2,
    checkEvery: Number(opt('--check-every', 100)) || 100,
    limits: {
      maxBounce: Number(opt('--max-bounce', DEFAULT_LIMITS.maxBounce)),
      maxComplaint: Number(opt('--max-complaint', DEFAULT_LIMITS.maxComplaint)),
      minSample: Number(opt('--min-sample', DEFAULT_LIMITS.minSample)),
    },
    campaignTag: opt('--campaign-tag', 'reps-reengagement'),
    assetBase: opt('--asset-base', 'https://v25registrationbackend-production.up.railway.app'),
    previewOut: opt('--preview-out'),
  };
}

export function validate(o) {
  const errors = [];
  if (!o.tokens) errors.push('--tokens <csv> is required');
  if (!o.linkBase) errors.push('--link-base <https url> is required');
  if (o.lang !== 'auto' && !LANGS.includes(o.lang)) errors.push('--lang must be auto, fr, en or bi');
  if (o.segments && !o.file) errors.push('--segments needs --file <reps_clean.jsonl>');
  if (o.apply) {
    if (!o.limit) errors.push('--limit <n> is required with --apply (one stage per run)');
    if (!o.expectAccount) errors.push('--expect-account <aws account id> is required with --apply');
    if (!o.configSet) errors.push('--config-set <name> is required with --apply');
    if (!o.ledger) errors.push('--ledger <jsonl> is required with --apply');
  }
  return errors;
}

/** email -> { segment, languages, country } from the cleaned reps file. */
function loadMeta(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    map.set(String(r.email).toLowerCase(), { segment: r.segment, languages: r.languages, country: r.country });
  }
  return map;
}

/** Language of the e-mail for one recipient. Without metadata the bilingual version is safe. */
export function languageFor(o, meta) {
  if (o.lang !== 'auto') return o.lang;
  return meta ? chooseLanguage(meta) : 'bi';
}

/** Build the recipient list for this run (pure, no network). */
export function selectRecipients(o, { tokensContent, excludeContent, ledgerState, metaMap }) {
  const { rows, invalid } = parseTokens(tokensContent);
  const excluded = excludeContent ? parseEmailList(excludeContent) : new Set();
  const stats = { read: rows.length, invalidLines: invalid.length, excluded: 0, alreadySent: 0, wrongSegment: 0, byLang: { fr: 0, en: 0, bi: 0 } };
  const out = [];
  for (const r of rows) {
    if (excluded.has(r.email)) { stats.excluded += 1; continue; }
    if (ledgerState?.get(r.email)?.status === 'sent') { stats.alreadySent += 1; continue; }
    if (o.segments && !o.segments.has(metaMap?.get(r.email)?.segment)) { stats.wrongSegment += 1; continue; }
    out.push(r);
  }
  const selected = (o.limit ? out.slice(0, o.limit) : out).map((r) => ({ ...r, lang: languageFor(o, metaMap?.get(r.email)) }));
  for (const r of selected) stats.byLang[r.lang] += 1;
  return { selected, stats: { ...stats, eligible: out.length, selected: selected.length } };
}

export async function runCampaign(o, deps) {
  const log = deps.log || console.log;
  const errors = validate(o);
  if (errors.length) return { exitCode: 1, errors };

  const tokensContent = deps.readFile(o.tokens);
  const excludeContent = o.exclude ? deps.readFile(o.exclude) : null;
  const ledgerState = o.ledger ? readLedger(o.ledger) : new Map();
  const metaMap = o.file ? deps.loadMeta(o.file) : null;
  const { selected, stats } = selectRecipients(o, { tokensContent, excludeContent, ledgerState, metaMap });

  log(`Link base: ${o.linkBase}`);
  log(JSON.stringify(stats));
  const bannerUrl = buildBannerUrl(o.assetBase);
  if (o.previewOut && selected[0]) {
    const previewBanner = deps.previewBanner ? deps.previewBanner() || bannerUrl : bannerUrl;
    const base = o.previewOut.replace(/\.html?$/i, '');
    for (const lang of LANGS) {
      const sample = renderEmail({ link: buildLink(o.linkBase, 'PREVIEW-TOKEN-NOT-A-REAL-LINK-0000000000'), bannerUrl: previewBanner, lang });
      deps.writeFile(`${base}-${lang}.html`, sample.html);
    }
    log(`Previews written to ${base}-fr.html, -en.html, -bi.html (placeholder link)`);
  }
  if (!o.apply) {
    if (deps.checkAsset) {
      const a = await deps.checkAsset(bannerUrl);
      log(`Banner ${bannerUrl}: ${a.ok ? 'reachable' : `NOT reachable (${a.reason}) - deploy the registration backend before sending`}`);
    }
    log(`[DRY RUN] would send ${selected.length} e-mail(s). First recipients: ${selected.slice(0, 3).map((r) => maskEmail(r.email)).join(', ') || '(none)'}`);
    log('Dry run only. Re-run with --apply to send.');
    return { exitCode: 0, dryRun: true, stats, selected: selected.length };
  }

  const account = await deps.getAccountId();
  if (account !== o.expectAccount) {
    log(`Refusing to send: connected to AWS account ${account} but --expect-account is ${o.expectAccount}.`);
    return { exitCode: 1 };
  }

  const asset = await deps.checkAsset(bannerUrl);
  if (!asset.ok) {
    log(`Refusing to send: banner ${bannerUrl} is not reachable (${asset.reason}). Deploy the registration backend first.`);
    return { exitCode: 1 };
  }

  const guardOpts = { region: o.region, dimensionName: 'campaign', dimensionValue: o.campaignTag };
  const preflight = evaluateRates(await deps.fetchCounts(guardOpts), o.limits);
  log(`Preflight rates: ${preflight.reason}`);
  if (!preflight.ok) {
    log('Refusing to start: previous stage is outside the limits.');
    return { exitCode: 3, guard: preflight };
  }

  const gapMs = Math.ceil(1000 / o.rate);
  const result = { exitCode: 0, sent: 0, failed: 0, stats };
  let consecutiveFailures = 0;

  for (const [i, r] of selected.entries()) {
    const email = renderEmail({ link: buildLink(o.linkBase, r.token), bannerUrl, lang: r.lang });
    let attempt = 0;
    for (;;) {
      try {
        const res = await deps.send({
          from: o.from,
          replyTo: o.replyTo,
          to: r.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
          configSet: o.configSet,
          campaignTag: o.campaignTag,
          listUnsubscribe: `<mailto:${o.replyTo}?subject=STOP>`,
        });
        appendLedger(o.ledger, { email: r.email, status: 'sent', lang: r.lang, messageId: res.messageId, at: new Date().toISOString() });
        result.sent += 1;
        consecutiveFailures = 0;
        break;
      } catch (err) {
        const name = err?.name || 'Error';
        if (ABORT_ERRORS.has(name)) {
          log(`Aborting: ${name} - ${err.message}`);
          return { ...result, exitCode: 2 };
        }
        if ((name === 'TooManyRequestsException' || name === 'ThrottlingException') && attempt < 3) {
          attempt += 1;
          await deps.sleep(2000 * attempt);
          continue;
        }
        appendLedger(o.ledger, { email: r.email, status: 'failed', error: name, detail: safeMessage(err), at: new Date().toISOString() });
        result.failed += 1;
        consecutiveFailures += 1;
        log(`Failed ${maskEmail(r.email)}: ${name} - ${safeMessage(err)}`);
        break;
      }
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      log(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
      return { ...result, exitCode: 2 };
    }
    const done = i + 1;
    if (done % o.checkEvery === 0 && done < selected.length) {
      const g = evaluateRates(await deps.fetchCounts(guardOpts), o.limits);
      log(`After ${done}: ${g.reason}`);
      if (!g.ok) {
        log('Stopping: limits exceeded. Review the SES dashboard before resuming.');
        return { ...result, exitCode: 3, guard: g };
      }
    }
    await deps.sleep(gapMs);
  }
  log(`Done: sent ${result.sent}, failed ${result.failed}.`);
  return result;
}

function realDeps(o) {
  const ses = new SESv2Client({ region: o.region });
  const sts = new STSClient({ region: o.region });
  return {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    writeFile: (p, c) => fs.writeFileSync(p, c),
    loadMeta,
    sleep,
    log: console.log,
    previewBanner: () => {
      const f = new URL('../../src/assets/harx-email-banner.jpg', import.meta.url);
      return fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : null;
    },
    checkAsset: async (url) => {
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        const type = res.headers.get('content-type') || '';
        return res.ok && type.startsWith('image/') ? { ok: true } : { ok: false, reason: `HTTP ${res.status} ${type}`.trim() };
      } catch (e) {
        return { ok: false, reason: e?.name || 'network error' };
      }
    },
    getAccountId: async () => (await sts.send(new GetCallerIdentityCommand({}))).Account,
    fetchCounts: (g) => fetchCampaignCounts(g),
    send: async (m) => {
      const res = await ses.send(
        new SendEmailCommand({
          FromEmailAddress: m.from,
          ReplyToAddresses: [m.replyTo],
          Destination: { ToAddresses: [m.to] },
          ConfigurationSetName: m.configSet,
          EmailTags: [{ Name: 'campaign', Value: m.campaignTag }],
          Content: {
            Simple: {
              Subject: { Data: m.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: m.text, Charset: 'UTF-8' }, Html: { Data: m.html, Charset: 'UTF-8' } },
              Headers: [{ Name: 'List-Unsubscribe', Value: m.listUnsubscribe }],
            },
          },
        })
      );
      return { messageId: res.MessageId };
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const o = parseArgs(process.argv);
  runCampaign(o, realDeps(o))
    .then((r) => {
      if (r.errors) {
        r.errors.forEach((e) => console.error(e));
      }
      process.exit(r.exitCode || 0);
    })
    .catch((e) => {
      console.error(e?.name || 'Error', String(e?.message || '').slice(0, 300));
      process.exit(1);
    });
}
