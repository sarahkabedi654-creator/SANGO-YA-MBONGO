# Sango ya Mbongo

Plateforme francophone de veille technologique consacrée au mobile money, aux fintechs et aux paiements numériques en République démocratique du Congo.

## Fonctionnalités

- Pages Accueil, Actualités, Analyses, Favoris, Sources, Connexion et Inscription.
- Collecte réelle à la demande auprès de GDELT, NewsData.io et du flux RSS TechCabal, exécutée dans une Supabase Edge Function.
- Agrégation partielle : chaque source échoue indépendamment ; les erreurs et le statut de chaque fournisseur sont visibles.
- Déduplication par URL, filtres de recherche/source/thématique, graphiques Chart.js construits à partir des seuls articles collectés.
- Authentification Supabase (inscription, connexion, session et déconnexion).
- Favoris locaux sans compte, synchronisés vers Supabase lorsqu’un utilisateur connecté ajoute ou retire un article.
- Aucune donnée éditoriale ou statistique de démonstration. Si les services ne sont pas configurés, l’interface affiche des états vides explicites.

## Prérequis et démarrage

Node.js 20.19+ ou 22.12+ (exigence Vite 8), npm et un projet Supabase.

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Renseigner dans `.env.local` les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Seule la clé publique anon/publishable doit être fournie au navigateur. Elle n’est pas un secret et doit être protégée par les politiques RLS.

## Supabase

1. Dans SQL Editor, exécuter `supabase/schema.sql`.
2. Déployer la fonction `collect-news` avec Supabase CLI :

   ```bash
   supabase functions deploy collect-news
   supabase secrets set NEWSDATA_API_KEY=votre_cle
   ```

3. La fonction reçoit automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans l’environnement géré par Supabase. La clé service role n’est jamais exposée au frontend.
4. Configurer l’URL de redirection d’authentification dans Supabase Auth pour les domaines local et production utilisés. La confirmation d’e-mail dépend de la configuration Auth du projet.
5. La collecte est déclenchée à l’ouverture de la page Actualités si la base est vide ou si l’utilisateur appuie sur Actualiser. La page Sources propose également une collecte manuelle. Pour une collecte planifiée, configurer Supabase Cron/pg_cron afin d’invoquer la fonction selon la politique du projet.

GDELT et le flux RSS TechCabal ne demandent pas de clé dans ce collecteur. NewsData.io nécessite `NEWSDATA_API_KEY` côté Edge Function. Les quotas, la couverture géographique, les droits de réutilisation des contenus et la disponibilité dépendent des fournisseurs. L’interface renvoie vers les articles originaux.

## Modèle de données

- `articles` : métadonnées collectées, URL unique, source, date de publication et thème détecté.
- `favorites` : relation utilisateur/article protégée par RLS.
- Les articles sont lisibles publiquement ; chaque utilisateur ne peut consulter, ajouter et supprimer que ses favoris.

Les favoris invités sont stockés dans le navigateur. La synchronisation des favoris historiques après connexion n’est pas automatique ; les enregistrements ajoutés pendant une session authentifiée sont synchronisés. La table RLS ne donne pas accès public à la liste des favoris.

## Construction

```bash
npm run build
npm run preview
```

## Diagnostic reproductible

Sous Windows PowerShell, lancez le diagnostic local et Supabase depuis la racine du projet :

```powershell
npm.cmd run diagnose
```

Le script contrôle les fichiers requis, les noms de variables (sans afficher leurs valeurs), la protection Git de `.env.local`, la cohérence locale du secret Cron, le schéma, les termes de veille RDC, les migrations et la compilation Vite. Il ne lit pas Vault, ne consulte pas les secrets distants, ne lance aucune collecte et ne déploie rien. Les vérifications distantes se font séparément avec la CLI Supabase.

### Mise en production du diagnostic de collecte

Après revue de `supabase/migrations/20261123000000_add_collection_log_diagnostics.sql`, prévisualisez les migrations, puis appliquez-les avant de déployer la fonction mise à jour. `--skip-vault` évite toute mise à jour des secrets Vault par la CLI :

```powershell
.\node_modules\.bin\supabase.cmd db push --remote --dry-run --skip-vault
.\node_modules\.bin\supabase.cmd db push --remote --skip-vault
.\node_modules\.bin\supabase.cmd functions deploy collect-news --remote
```

Vérifiez la sortie de `--dry-run` et appliquez uniquement après validation. Ces commandes sont documentées ici; le diagnostic ne les exécute pas.

Le projet est une application multipage Vite statique ; héberger le dossier `dist` et définir les variables d’environnement au moment de la construction.

### Complement de schema

Le script cree aussi `sources`, `collection_logs` (alimentes par la fonction Edge) et `indicator_data` pour les indicateurs World Bank. Les articles referencent le code source stable GDELT, NewsData.io ou TechCabal. Les journaux sont reservees au role service. Les indicateurs restent a alimenter par un processus World Bank configure separement.
## Collecte periodique automatique

Le script `supabase/cron.sql` programme l appel a `collect-news` toutes les 4 heures (6 appels planifies par jour). Il active `pg_cron`, `pg_net` et Vault si necessaire. Le meme nom de job est reutilise lors d une reexecution du script.

Avant d executer ce SQL dans Supabase:

1. Deployer `collect-news` avec `supabase/config.toml` (la verification JWT de la plateforme est desactivee car la fonction valide elle-meme ses appels).
2. Dans Edge Function Secrets, definir `COLLECT_NEWS_CRON_SECRET`.
3. Dans Dashboard > Integrations > Vault, enregistrer `sango_project_url`, `sango_publishable_key` et `sango_collect_news_cron_secret`. La derniere valeur doit etre identique a `COLLECT_NEWS_CRON_SECRET`. Ne pas mettre ces valeurs dans le depot.
4. Executer `supabase/cron.sql` dans SQL Editor. Le script verifie la presence des trois entrees Vault avant de creer le job.

Le collecteur accepte soit un JWT Supabase utilisateur valide, soit l en-tete interne `x-cron-secret`. Le secret Cron n est jamais lu par le frontend. La cle NewsData.io reste `NEWSDATA_API_KEY` dans les secrets Edge. Le tableau `sources.last_checked_at` garde l heure de chaque tentative; le tableau de bord lit cette valeur depuis Supabase et l affiche en heure locale de Lubumbashi. `collection_logs` garde le resultat par source.

Pour controler le job, utiliser les deux requetes de verification commentees a la fin de `supabase/cron.sql`. La premiere collecte automatique part au prochain multiple de 4 heures UTC; aucune collecte n est lancee par ce script SQL.

## Pagination et agregats du tableau de bord

La page Actualites lit les articles par lots de 200 et affiche le nombre exact fourni par PostgREST. Les filtres s'appliquent aux articles deja charges; charger d'autres lots elargit les resultats disponibles.

Le total et les graphiques complets utilisent `get_dashboard_analytics`, fonction SQL en `SECURITY INVOKER` qui respecte les politiques RLS publiques des articles. Pour un nouveau projet, elle est incluse dans `supabase/schema.sql`. Sur le projet existant, examiner puis appliquer la migration `supabase/migrations/20261123010000_dashboard_analytics.sql` apres les migrations precedentes :

```powershell
.\node_modules\.bin\supabase.cmd db push --remote --dry-run --skip-vault
.\node_modules\.bin\supabase.cmd db push --remote --skip-vault
```

La fonction calcule les mentions d'Airtel Money, M-Pesa, Orange Money et Afrimoney dans les titres et resumes. Ces mentions editoriales ne representent pas une part de marche ni un volume de transactions. Les favoris des utilisateurs connectes sont relus depuis `favorites`; les visiteurs utilisent le stockage local du navigateur.


## Collecte et analyse World Bank

La fonction Edge `collect-world-bank` interroge l'API Indicators v2 officielle, sans cle fournisseur, une fois par semaine (lundi a 06:00 UTC). Elle traite separement cinq series pour le pays World Bank `COD`, limite chaque serie aux dix observations annuelles non nulles les plus recentes, fixe un delai maximal de 15 secondes par appel et continue lorsqu'une serie echoue. Les observations sont upsertees par fournisseur, code, pays et periode; la date de recuperation et l'URL API sont conservees.

Series retenues : propriete d'un compte financier ou mobile money (`FX.OWN.TOTL.ZS`), abonnements mobiles par 100 personnes (`IT.CEL.SETS.P2`), usage d'Internet (`IT.NET.USER.ZS`), distributeurs automatiques par 100 000 adultes (`FB.ATM.TOTL.P5`) et croissance annuelle du PIB (`NY.GDP.MKTP.KD.ZG`). Les mentions de compte et de connectivite sont des indicateurs d'acces ou d'usage; elles ne representent pas les transactions mobile money.

`supabase/cron.sql` ajoute le job hebdomadaire en reutilisant les entrees Vault Cron deja requises; aucun nouveau secret fournisseur n'est necessaire. La fonction accepte un JWT utilisateur valide pour l'action manuelle depuis Analyses, ou le meme en-tete Cron interne que `collect-news`. La table `indicator_collection_logs` est privee et les valeurs restent consultables selon les politiques publiques de `indicator_data`.

`indicator_data` est en lecture seule pour `anon` et `authenticated`; `indicator_collection_logs` reste privee. `service_role` recoit explicitement `SELECT`, `INSERT` et `UPDATE` sur ces deux tables pour les UPSERT PostgREST (`ON CONFLICT DO UPDATE`). `collector_locks` n'accorde aucun acces direct a ces roles; les verrous passent uniquement par les RPC reservees a `service_role`.

Avant activation distante, examiner et appliquer dans l'ordre les migrations `20261123010000_dashboard_analytics.sql`, `20261123020000_world_bank_ingestion.sql` et `20261123030000_harden_public_table_privileges.sql`. La migration de droits retire les grants par defaut des roles clients sans toucher aux policies RLS ni aux donnees. Ensuite deployer les deux fonctions, puis reexecuter `supabase/cron.sql` dans SQL Editor pour enregistrer le nouveau job. Aucune de ces actions distantes n'est declenchee par le diagnostic local.

Les tests locaux du normaliseur sont executes par `npm.cmd test`. La compilation et le diagnostic peuvent etre lances avec `npm.cmd run build` et `npm.cmd run diagnose`.
# Publication de production

Apres comparaison du schema distant, appliquer les migrations dans l'ordre avant de deployer les fonctions. La migration `20261123030000_harden_public_table_privileges.sql` retire les grants client trop larges du schema de production tout en conservant les droits `service_role` requis :

```powershell
.\node_modules\.bin\supabase.cmd db push --remote --dry-run --skip-vault
.\node_modules\.bin\supabase.cmd db push --remote --skip-vault
```

Puis deployer les fonctions et actualiser Cron :

```powershell
.\node_modules\.bin\supabase.cmd functions deploy collect-news --remote
.\node_modules\.bin\supabase.cmd functions deploy collect-world-bank --remote
```

Reexecuter ensuite `supabase/cron.sql` dans SQL Editor apres confirmation des trois noms Vault existants. L'hebergement frontend sert `dist`; `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` doivent etre definies au moment du build. Ne jamais definir une cle service role dans l'environnement Vite.
