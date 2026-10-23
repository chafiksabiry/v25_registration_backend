# reengagementMailer

Envoie l'e-mail de réengagement des reps HARX v1 via Amazon SES, par paliers. **Simulation par défaut.**

Prérequis : Node 18+, un fichier `email,token` produit par `importV1Reps.js --tokens-out`, un domaine SES vérifié (`mail.harx.ai`, région `eu-west-3`) avec accès Production.

```bash
cd scripts/reengagementMailer && npm install && npm test   # 12 tests, aucun appel AWS
```

## Sécurités intégrées
- `--apply` exige `--limit` (un palier par exécution), `--expect-account` (refuse d'envoyer depuis un autre compte AWS), `--config-set` et `--ledger`.
- Le journal (`--ledger`) évite tout double envoi : on peut relancer sans risque.
- Contrôle des taux de rebonds durs et de plaintes (CloudWatch, jeu de configuration) avant le départ et tous les `--check-every` envois. Arrêt si rebonds > 2 % ou plaintes > 0,1 % (ajustables), après 100 envois minimum.
- Arrêt après 10 échecs consécutifs, ou immédiatement si le compte SES est suspendu/en pause.
- Les clés AWS ne se passent jamais en argument : variables d'environnement uniquement.
- Aucun suivi d'ouverture ni de clic : le lien pointe directement vers la page de connexion.
- En-tête `List-Unsubscribe` de type `mailto:` + consigne « répondez STOP ». Les adresses ayant répondu STOP vont dans le fichier `--exclude`.

## Habillage de l'e-mail
Bandeau HARX (logo + « We inspire growth ») servi par le backend d'inscription : `GET /email/harx-banner.jpg` (fichier `src/assets/harx-email-banner.jpg`, 17 Ko, dérivé de `logo-pink.png`). Couleurs de `src/lib/harxBrand.ts` du front. `--asset-base` indique le backend qui sert l'image (production par défaut) ; avec `--apply`, le script refuse d'envoyer si l'image ne répond pas 200. **Déployer le backend d'inscription avant le premier envoi réel.**

## Mise en place unique (console AWS, région Paris)
1. **Jeu de configuration** : SES > Configuration > Jeux de configurations > (celui de l'assistant, ou en créer un) > *Event destinations* > Ajouter > **Amazon CloudWatch**. Événements : Sends, Hard bounces, Complaints, Deliveries. Dimension : nom `campaign`, source *Message tag*, valeur par défaut `reps-reengagement`.
2. **Utilisateur IAM dédié** à l'envoi (pas de droits d'administration), avec cette politique (remplacer `<CONFIG_SET>`) :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": [
        "arn:aws:ses:eu-west-3:407525819683:identity/mail.harx.ai",
        "arn:aws:ses:eu-west-3:407525819683:configuration-set/<CONFIG_SET>"
      ]
    },
    { "Effect": "Allow", "Action": "cloudwatch:GetMetricStatistics", "Resource": "*" }
  ]
}
```

3. Créer une clé d'accès pour cet utilisateur et la saisir sans l'afficher :

```bash
read -s "AWS_ACCESS_KEY_ID?Access key id : "; export AWS_ACCESS_KEY_ID
read -s "AWS_SECRET_ACCESS_KEY?Secret : "; export AWS_SECRET_ACCESS_KEY
```

## Utilisation
Simulation (aucun envoi, aperçu de l'e-mail avec un faux lien) :

```bash
node send.js --tokens ~/HARX_reengagement/tokens_pilot_A.csv \
  --link-base https://harx26connection-recette.netlify.app --limit 20 --preview-out apercu_email.html
```

Palier réel (en production, `--link-base https://harx.ai`) :

```bash
node send.js --tokens ~/HARX_reengagement/tokens_pilot_A.csv --link-base https://harx.ai \
  --apply --expect-account 407525819683 --config-set <CONFIG_SET> \
  --ledger ~/HARX_reengagement/ledger.jsonl --exclude ~/HARX_reengagement/exclus.txt --limit 300
```

Paliers prévus : 300, 1 000, 2 500, puis 4 000 par jour au maximum. Entre deux paliers, consulter le tableau de bord SES (délivrabilité) et lancer le palier suivant seulement si tout est sain. Segment A d'abord, puis C, puis D.

## À savoir
- Le contrôle automatique lit les compteurs publiés dans CloudWatch par le jeu de configuration. Cette lecture n'a pas pu être testée contre un vrai compte AWS : à vérifier au premier palier (les logs affichent `Preflight rates` et `After n`).
- Les statistiques CloudWatch ont quelques minutes de retard : le contrôle ne remplace pas la surveillance du tableau de bord.

## Langues (fr / en / bilingue)

Trois versions du même e-mail : français, anglais, bilingue (EN puis FR dans le même message, pied de page avec les deux mentions STOP).
`--lang auto` (défaut) choisit par destinataire à partir de `--file` (reps_clean.jsonl) :

1. langues déclarées : français + anglais → bilingue ; français seul → fr ; anglais seul → en ;
2. sinon le pays : pays francophones → fr ; pays anglophones → en ;
3. sinon (pays inconnu ou autre) → bilingue. Sans `--file`, tout est bilingue.

`--lang fr|en|bi` force une version. Le dry-run affiche la répartition (`byLang`) ; le ledger enregistre la langue envoyée.
`--preview-out p.html` écrit `p-fr.html`, `p-en.html`, `p-bi.html`.
