# Import des reps Zoho "Reps Pipeline / Reps inscrits"

Fichiers de donnees (hors depot, donnees personnelles : ne jamais les committer) :
- `reps_inscrits_import.jsonl` : 27 279 reps a importer (29 969 moins 2 690 noms corrompus), chacun avec
  `crmPipeline = "Reps Pipeline"`, `crmStage = "Reps inscrits"`, `crmDealId`, `segment = "D"`.
- `reps_inscrits_noms_corrompus.jsonl` : 2 690 reps exclus, a verifier plus tard.

## 1. Simulation sur la production (aucune ecriture)

```bash
MONGODB_URI="<uri production>" node scripts/importV1Reps.js \
  --file reps_inscrits_import.jsonl --segments D \
  --crm-pipeline "Reps Pipeline" --crm-stage "Reps inscrits" \
  --batch-id v1-reps-zoho-2026-11
```

Compteurs : `read`, `outOfScope` (doit valoir 0), `duplicateInFile` (doit valoir 0), `existingByEmail`,
`existingByDealOnly`, `existing`, `toInsert`. Les lectures sont en lecture seule.

## 2. Import reel (uniquement apres autorisation explicite)

```bash
MONGODB_URI="<uri production>" node scripts/importV1Reps.js \
  --file reps_inscrits_import.jsonl --segments D \
  --crm-pipeline "Reps Pipeline" --crm-stage "Reps inscrits" \
  --batch-id v1-reps-zoho-2026-11 --apply \
  --expect-db <nom exact de la base> --tokens-out tokens_zoho.csv
```

`tokens_zoho.csv` contient des secrets (liens de connexion) : mode 600, ne pas committer.

## Garanties
- Seule ecriture : `insertMany` de nouveaux utilisateurs. Aucun `update`, `replace` ni `upsert`.
- Un utilisateur existant (meme email, ou meme `legacyV1.crmDealId`) n'est jamais modifie.
- Les doublons du fichier (email ou `crmDealId`) sont ignores et comptes.
- `--expect-db` obligatoire avec `--apply` ; l'import est rejouable sans effet (2e passage : 0 insertion).
- Retour arriere : `--rollback <batch-id> --apply` ne supprime que les comptes de ce lot jamais utilises
  (`firstTime: true`, sans mot de passe).
