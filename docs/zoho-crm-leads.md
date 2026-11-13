# Prospects Zoho CRM à l'inscription

À chaque inscription réussie (`POST /register`), le serveur crée un prospect (module **Leads**) dans Zoho CRM. Code : `src/services/zohoLead.js`.
**Désactivé par défaut.** L'inscription n'attend jamais Zoho ; un échec est seulement journalisé (sans e-mail ni secret).

## Variables d'environnement (valeurs posées par le propriétaire dans Railway)

| Variable | Rôle |
|---|---|
| `ZOHO_CRM_ENABLED` | Interrupteur : `true` pour activer. Absent ou autre valeur = désactivé. |
| `ZOHO_CLIENT_ID` | Identifiant client du Self Client. |
| `ZOHO_CLIENT_SECRET` | Secret client. |
| `ZOHO_REFRESH_TOKEN` | Jeton d'actualisation (obtenu une fois, voir ci-dessous). |
| `ZOHO_DC` | Centre de données : `com`, `eu`, `in`, `com.au`, `jp`, `ca`, `sa`, `com.cn` (défaut `com`). Doit être celui du compte Zoho CRM. |
| `ZOHO_LEAD_SOURCE` | Valeur de `Lead_Source` (défaut `Site web HARX`). Lead_Source est toujours envoyé. |

## Champs réellement disponibles à l'inscription
Le front envoie à `POST /auth/register` : `fullName`, `email`, `password`, `phone`, des champs de mesure et `attribution` (utm_*, sous consentement). **Ni offre, ni type de compte, ni nom d'entreprise, ni pays** : le type arrive plus tard par `POST /auth/change-user-type` (`company`, `rep`, `call-center`). Le prospect créé à l'inscription contient donc `Last_Name`, `Company` (repli sur le nom complet), `Email`, `Lead_Source` et les utm_*. `Account_Type`, `Offer` et `Country` ne sont pas remplis tant que la décision du propriétaire (complétion au changement de type, offre, pays) n'est pas prise.

## Comportement
- Recherche préalable `GET /crm/v8/Leads/search?email=…` ; prospect trouvé : rien n'est créé. Sinon `POST /crm/v8/Leads`.
- Nouvelles tentatives (erreur réseau, 5xx, 429, 401) : attentes de 1 s, 5 s, 20 s, puis abandon journalisé.
- Si Zoho refuse un champ personnalisé inexistant (`INVALID_DATA`), le prospect est créé avec les champs standard seuls.
- Champs standard : `Last_Name` (nom complet), `Company`, `Email`, `Country`, `Lead_Source`.
- Champs personnalisés (noms d'API, **à créer par un administrateur Zoho** dans Paramètres > Personnalisation > Modules et champs > Leads, type « ligne unique ») : `Account_Type`, `Offer`, `UTM_Source`, `UTM_Medium`, `UTM_Campaign`. (Le `referrer` n'est ni stocké ni envoyé : décision du propriétaire en cours.)

## Procédure Zoho (Self Client)
1. Console développeurs du centre de données du compte (ex. `api-console.zoho.eu`) > **Self Client** : relever l'identifiant et le secret.
2. Onglet « Generate Code » : portée de création `ZohoCRM.modules.Leads.CREATE` (documentation « Insert Records » v8) ; portée de lecture pour la recherche anti-doublon : **à confirmer** sur la page « Search Records » (non lue) avant de la poser, durée choisie, puis générer le code.
3. Échanger ce code (à usage unique, valable quelques minutes) contre les jetons : `POST {accounts}/oauth/v2/token` avec `grant_type=authorization_code`, `client_id`, `client_secret`, `code`. Conserver le `refresh_token` (ne expire pas) ; l'access token (1 h) est renouvelé automatiquement par le serveur.
4. Poser les variables dans Railway, activer en dernier (`ZOHO_CRM_ENABLED=true`).
5. L'utilisateur Zoho qui a généré le code doit avoir les droits de créer et lire les prospects.

## Sources et niveau de vérification
- **Création (lue par le CTO sur la documentation officielle)** : « Insert Records » v8, <https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html> : portée `ZohoCRM.modules.Leads.CREATE` ; endpoint `{api-domain}/crm/v8/Leads` (ex. `https://www.zohoapis.com/crm/v8/Leads`) ; portée manquante = erreur `OAUTH_SCOPE_MISMATCH` (HTTP 401), traitée sans nouvelle tentative.
- **Recherche anti-doublon** : page officielle « Search Records » v8, <https://www.zoho.com/crm/developer/docs/api/v8/search-records.html>. Non lisible depuis l'environnement de développement : nom de la portée de lecture et réponse 204 = aucun résultat **à confirmer**.
- **Domaine api et domaine des comptes par centre de données** (table `DATA_CENTERS`) : **à confirmer en recette avec un compte de test avant activation** ; <https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html>.
- Self Client, échange de code, jeton d'accès valable 1 h, jeton d'actualisation permanent : billet communautaire Zoho <https://help.zoho.com/portal/en/community/topic/kaizen-2-oauth2-0-and-self-client-api> (non la documentation de référence).
- Les formes d'erreur `INVALID_DATA` et `DUPLICATE_DATA` restent à confirmer en recette.
