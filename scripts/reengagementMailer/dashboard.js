#!/usr/bin/env node
/**
 * Campaign dashboard: one self-contained HTML page (no e-mail address, no token, nothing published).
 * Read-only: it never sends, never writes to Mongo, never changes AWS.
 *
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / MONGODB_URI come from the environment only (never a flag).
 *   node dashboard.js --ledger ~/HARX_reengagement/ledger.jsonl --batch-ids v1-reps-2026-10 \
 *        --expect-db harx_recette --out ~/HARX_reengagement/dashboard.html
 *
 * Options:
 *   --ledger <jsonl[,jsonl]>  send ledger(s) written by send.js (optional)
 *   --batch-ids <a,b>         importBatch values of the campaign (needed for the funnel)
 *   --expect-db <name>        required with --batch-ids: refuses to read another database
 *   --campaign-tag <v>        CloudWatch dimension value, default reps-reengagement
 *   --region <r>              default eu-west-3
 *   --days <n>                days of SES history, default 14
 *   --max-bounce / --max-complaint / --min-sample   same limits as send.js
 *   --no-ses                  skip the CloudWatch counters
 *   --out <html>              default ./dashboard.html (mode 600)
 */
import fs from 'fs';
import { pathToFileURL } from 'url';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { DEFAULT_LIMITS } from './lib/guard.js';
import { summarizeLedger, deliveryHealth, buildFunnel, renderDashboard } from './lib/dashboard.js';

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n, d = null) => {
    const i = args.indexOf(n);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
  };
  const list = (n) => (opt(n) ? opt(n).split(',').map((s) => s.trim()).filter(Boolean) : []);
  return {
    ledgers: list('--ledger'),
    batchIds: list('--batch-ids'),
    expectDb: opt('--expect-db'),
    campaignTag: opt('--campaign-tag', 'reps-reengagement'),
    region: opt('--region', 'eu-west-3'),
    days: Number(opt('--days', 14)) || 14,
    noSes: flag('--no-ses'),
    out: opt('--out', 'dashboard.html'),
    limits: {
      maxBounce: Number(opt('--max-bounce', DEFAULT_LIMITS.maxBounce)),
      maxComplaint: Number(opt('--max-complaint', DEFAULT_LIMITS.maxComplaint)),
      minSample: Number(opt('--min-sample', DEFAULT_LIMITS.minSample)),
    },
  };
}

export function validate(o) {
  const errors = [];
  if (!o.ledgers.length && !o.batchIds.length && o.noSes) errors.push('nothing to show: give --ledger, --batch-ids or drop --no-ses');
  if (o.batchIds.length && !o.expectDb) errors.push('--expect-db <name> is required with --batch-ids');
  return errors;
}

const METRICS = [['send', 'Send'], ['delivery', 'Delivery'], ['bounce', 'Bounce'], ['complaint', 'Complaint'], ['reject', 'Reject']];

export async function fetchSesDays({ region, tag, days, client }) {
  const cw = client || new CloudWatchClient({ region });
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (days - 1)));
  const byDay = new Map();
  await Promise.all(
    METRICS.map(async ([key, metric]) => {
      const res = await cw.send(
        new GetMetricStatisticsCommand({
          Namespace: 'AWS/SES',
          MetricName: metric,
          Dimensions: [{ Name: 'campaign', Value: tag }],
          StartTime: start,
          EndTime: end,
          Period: 86400,
          Statistics: ['Sum'],
        })
      );
      for (const d of res.Datapoints || []) {
        const day = d.Timestamp.toISOString().slice(0, 10);
        const row = byDay.get(day) || { day, send: 0, delivery: 0, bounce: 0, complaint: 0, reject: 0 };
        row[key] += d.Sum || 0;
        byDay.set(day, row);
      }
    })
  );
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

const CHUNK = 5000;
/** Read-only: users of the batches, their agent profile flags and subscriptions. */
export async function fetchFunnelData({ uri, expectDb, batchIds }) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    if (db.databaseName !== expectDb) throw new Error(`connected to database "${db.databaseName}", expected "${expectDb}"`);
    const rows = await db
      .collection('users')
      .find({ importBatch: { $in: batchIds } }, { projection: { 'legacyV1.segment': 1, 'reengagement.lastUsedAt': 1 } })
      .toArray();
    const users = rows.map((r) => ({ id: r._id, segment: r.legacyV1?.segment || null, clicked: !!r.reengagement?.lastUsedAt }));
    const agents = [];
    const subs = [];
    for (let i = 0; i < users.length; i += CHUNK) {
      const ids = users.slice(i, i + CHUNK).map((u) => u.id);
      const a = await db
        .collection('agents')
        .find({ userId: { $in: ids } }, { projection: { userId: 1, isBasicProfileCompleted: 1, 'onboardingProgress.phases.phase2.requiredActions': 1, 'onboardingProgress.phases.phase2.optionalActions': 1 } })
        .toArray();
      for (const d of a) {
        const req = d.onboardingProgress?.phases?.phase2?.requiredActions || {};
        const opt = d.onboardingProgress?.phases?.phase2?.optionalActions || {};
        agents.push({ userId: d.userId, flags: { cv: !!req.experienceAdded, basicProfile: !!d.isBasicProfileCompleted, photo: !!opt.photoUploaded, availability: !!req.availabilitySet } });
      }
      const s = await db.collection('repsubscriptions').find({ userId: { $in: ids } }, { projection: { userId: 1, status: 1 } }).toArray();
      for (const d of s) subs.push({ userId: d.userId, status: d.status });
    }
    return { users, agents, subs };
  } finally {
    await client.close();
  }
}

export async function runDashboard(o, deps) {
  const log = deps.log || console.log;
  const errors = validate(o);
  if (errors.length) return { exitCode: 1, errors };
  const notes = [];

  let ledger = null;
  if (o.ledgers.length) {
    const entries = [];
    for (const f of o.ledgers) {
      for (const line of deps.readFile(f).split('\n')) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line)); } catch { /* truncated last line */ }
      }
    }
    ledger = summarizeLedger(entries);
  }

  let sesDays = null;
  let ses = null;
  if (!o.noSes) {
    try {
      sesDays = await deps.fetchSesDays({ region: o.region, tag: o.campaignTag, days: o.days });
      const sum = (k) => sesDays.reduce((a, d) => a + d[k], 0);
      ses = deliveryHealth({ send: sum('send'), delivery: sum('delivery'), bounce: sum('bounce'), complaint: sum('complaint'), reject: sum('reject') }, o.limits);
      notes.push(`Compteurs SES : ${o.days} derniers jours, étiquette « ${o.campaignTag} ». Les ouvertures et clics ne sont pas suivis (choix de confidentialité).`);
    } catch (e) {
      notes.push(`Compteurs SES indisponibles (${e?.name || 'erreur'}).`);
      log(`SES counters unavailable: ${e?.name || 'error'}`);
    }
  }

  let funnel = null;
  if (o.batchIds.length) {
    const uri = deps.mongoUri;
    if (!uri) return { exitCode: 1, errors: ['MONGODB_URI is required with --batch-ids'] };
    funnel = buildFunnel(await deps.fetchFunnelData({ uri, expectDb: o.expectDb, batchIds: o.batchIds }));
    notes.push('« CV importé » = expérience ajoutée au profil ; « Formule choisie » = abonnement en essai ou actif (le code REPS2027 lui-même n\'est lisible que dans Stripe).');
  }

  const html = renderDashboard({ generatedAt: deps.now().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', campaign: o.campaignTag, ledger, ses, sesDays, funnel, notes, limits: o.limits });
  deps.writeFile(o.out, html);
  log(`Dashboard written to ${o.out}`);
  return { exitCode: 0, ledger, ses, funnel };
}

function realDeps() {
  return {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    writeFile: (p, c) => fs.writeFileSync(p, c, { mode: 0o600 }),
    fetchSesDays,
    fetchFunnelData,
    mongoUri: process.env.MONGODB_URI,
    now: () => new Date(),
    log: console.log,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const o = parseArgs(process.argv);
  runDashboard(o, realDeps())
    .then((r) => {
      (r.errors || []).forEach((e) => console.error(e));
      process.exit(r.exitCode || 0);
    })
    .catch((e) => {
      console.error(e?.name || 'Error', String(e?.message || '').replace(/mongodb(\+srv)?:\/\/[^\s]+/g, '[uri]').slice(0, 300));
      process.exit(1);
    });
}
