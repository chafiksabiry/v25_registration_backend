# Synchronisation automatique Zoho CRM → `users`

`POST /api/integrations/zoho/sync-user` ajoute dans la collection `users` existante le contact d'un Deal Zoho,
**à chaque exécution du workflow d'envoi d'e-mail**, sans intervention humaine ni poste allumé.

## Comportement
- L'utilisateur est identifié par son **e-mail** (minuscules). S'il **existe déjà**, rien n'est modifié (`status: "exists"`).
- S'il n'existe pas, il est créé (`status: "created"`) selon la convention de `scripts/importV1Reps.js` :
  `password: null`, `typeUser: "rep"`, `isVerified: false`, `firstTime: true`, `invitationStatus: "none"`,
  `source: "zoho_crm_sync"`, `importBatch: "zoho-webhook-AAAA-MM"`.
- Upsert **atomique** (`$setOnInsert`) sur l'index unique `email` : pas de doublon, même avec des appels simultanés ou répétés.
- Les données peuvent arriver dans le corps (JSON ou formulaire) **ou dans l'URL** (paramètres de requête) : le corps l'emporte.
- Adresses invalides, de test ou au domaine mal saisi (`gmai.com`, `gmail.co`, `kkk@…`) : `status: "skipped"`, rien n'est écrit.
- Aucune suppression, aucune création de collection ni d'index, aucun nouveau champ dans le schéma.
- Un nom Zoho vide ou « NONE » n'est jamais enregistré comme nom ; à défaut, la partie locale de l'adresse sert de `fullName`.

## Configuration (variables d'environnement du service existant)
| Variable | Rôle |
|---|---|
| `ZOHO_WEBHOOK_SECRET` | **Obligatoire**, 24 caractères minimum. Sans elle la route répond 503 et n'écrit rien. |
| `ZOHO_NEW_USER_TYPE` | Optionnelle, défaut `rep`. |
| `ZOHO_SYNC_BATCH_PREFIX` | Optionnelle, défaut `zoho-webhook`. |

Générer un secret : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Côté Zoho (une seule fois)
1. Setup → Automation → Actions → **Webhooks** → Configure Webhook (module **Deals**).
2. URL : `https://<votre-api>/api/integrations/zoho/sync-user`, méthode **POST**.
3. En-tête : `X-Zoho-Webhook-Token: <ZOHO_WEBHOOK_SECRET>`.
   **Si votre écran Zoho n'offre pas de section « Header » utilisable**, ajoutez à la place un *Custom Parameter* nommé `token` dont la valeur est le secret. Moins sûr : le secret voyage dans l'URL et peut apparaître dans les journaux HTTP. Changez-le (puis redéployez) si vous le soupçonnez exposé.
4. Paramètres : `email` = e-mail du **contact lié au Deal** (Contact Name → Email), `first_name`, `last_name`, `phone`.
5. Ajouter ce webhook comme **action instantanée** du workflow « Réactivation Reps 2026 », à côté de la notification e-mail.

## Test manuel
```bash
curl -i -X POST "https://<votre-api>/api/integrations/zoho/sync-user" \
  -H "Content-Type: application/json" -H "X-Zoho-Webhook-Token: $ZOHO_WEBHOOK_SECRET" \
  -d '{"email":"test.integration@example.org","first_name":"Test","last_name":"Integration"}'
```
Réponses : `200 {"ok":true,"status":"created|exists|skipped"}`, `400` e-mail absent/invalide, `401` jeton absent/faux, `503` secret non configuré.
