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

## Comportement
- Recherche préalable `GET /crm/v8/Leads/search?email=…` ; prospect trouvé : rien n'est créé. Sinon `POST /crm/v8/Leads`.
- Nouvelles tentatives (erreur réseau, 5xx, 429, 401) : attentes de 1 s, 5 s, 20 s, puis abandon journalisé.
- Si Zoho refuse un champ personnalisé inexistant (`INVALID_DATA`), le prospect est créé avec les champs standard seuls.
- Champs standard : `Last_Name` (nom complet), `Company`, `Email`, `Country`, `Lead_Source`.
- Champs personnalisés (noms d'API, **à créer par un administrateur Zoho** dans Paramètres > Personnalisation > Modules et champs > Leads, type « ligne unique ») : `Account_Type`, `Offer`, `UTM_Source`, `UTM_Medium`, `UTM_Campaign`, `Referrer`.

## Procédure Zoho (Self Client)
1. Console développeurs du centre de données du compte (ex. `api-console.zoho.eu`) > **Self Client** : relever l'identifiant et le secret.
2. Onglet « Generate Code » : portées `ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.READ` (la recherche exige la lecture), durée choisie, puis générer le code.
3. Échanger ce code (à usage unique, valable quelques minutes) contre les jetons : `POST {accounts}/oauth/v2/token` avec `grant_type=authorization_code`, `client_id`, `client_secret`, `code`. Conserver le `refresh_token` (ne expire pas) ; l'access token (1 h) est renouvelé automatiquement par le serveur.
4. Poser les variables dans Railway, activer en dernier (`ZOHO_CRM_ENABLED=true`).
5. L'utilisateur Zoho qui a généré le code doit avoir les droits de créer et lire les prospects.

## Sources et niveau de vérification
Les pages officielles `www.zoho.com/crm/developer/docs/` n'étaient **pas consultables en direct** depuis l'environnement de développement (hôte non autorisé) ; seuls les extraits de recherche ont été lus :
- Endpoint d'insertion/upsert v8 et `duplicate_check_fields` : <https://www.zoho.com/crm/developer/docs/api/v8/upsert-records.html> (confirmé par extrait).
- Recherche par e-mail v8 (`/{module}/search?email=`) : <https://www.zoho.com/crm/developer/docs/api/v8/search-records.html> (confirmé par extrait ; réponse 204 = aucun résultat, à confirmer sur la page).
- Self Client, échange de code, jeton valable 1 h, refresh token permanent : <https://help.zoho.com/portal/en/community/topic/kaizen-2-oauth2-0-and-self-client-api> (billet communautaire Zoho, non la documentation de référence).

**À vérifier par la recette avant activation** (non confirmé dans la documentation officielle lue) : noms exacts des portées `ZohoCRM.modules.leads.CREATE/READ`, domaines `accounts.zoho.*` / `www.zohoapis.*` par centre de données (table `DATA_CENTERS`), forme exacte des réponses d'erreur (`INVALID_DATA`, `DUPLICATE_DATA`). Référence : <https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html>.
