# Gaia

Assistant personnel desktop (Electron + React + TypeScript + Tailwind). Voir [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) pour la spécification complète — c'est la source de vérité du projet.

## Démarrage

```bash
npm install
npm run dev        # app en mode développement
npm run build       # build de production dans out/
npm run typecheck
```

## État d'avancement

- [x] Squelette Electron + React
- [x] HUD final (réseau de particules animé, statusbar, sidebar, barre de saisie) — fenêtre sans chrome natif (`frame: false`)
- [x] Chat texte basique avec l'API Claude (+ `web_search` natif) — nécessite `ANTHROPIC_API_KEY` dans `.env`
- [x] MCP Linear — bouton "Connecter Linear" (OAuth 2.1 + PKCE + enregistrement dynamique de client) ou `LINEAR_API_KEY` en raccourci de test. Flow OAuth non vérifié en conditions réelles (réseau de développement sans accès à `mcp.linear.app`) — à valider avec un vrai compte Linear.
- [x] MCP Google Tasks — voir "Configuration Google Tasks" ci-dessous
- [x] Routing de modèle Haiku/Sonnet — heuristique par mots-clés/longueur (spec 4.5), tag visible sous chaque réponse dans le HUD
- [x] Stockage Supabase — voir "Configuration Supabase" ci-dessous
- [x] Comportement proactif todo — ajout silencieux (system prompt explicite, spec 4.3) + toast HUD discret sur les créations détectées (Google Tasks et Linear)
- [x] Correctif ancrage temporel — date/heure fraîches à chaque requête, hors bloc caché (chat + badge HUD)
- [x] Mémoire continue (core/peripheral) + onboarding + écran profil — voir "Configuration Supabase" ci-dessous
- [x] Recherche d'images — voir "Configuration recherche d'images" ci-dessous
- [x] Correctif sidebar — les pastilles Linear/Google Tasks reflètent maintenant l'état de connexion réel (rafraîchi après chaque échange), plus une valeur figée
- [x] Briefing proactif météo/actu (spec 8.1) — Open-Meteo + rss-parser, tools `get_weather`/`get_news` disponibles dans le chat interactif. Le job Haiku en tâche de fond qui les exploitait automatiquement a depuis été supprimé (voir spec 8.11) : uniquement à la demande d'Axel désormais.
- [x] États HUD différenciés (spec 8.2) — un seul flux d'événements `hud:state` pour le label et l'intensité de l'animation
- [x] Google Calendar (spec 8.3) — `mcp_servers`, OAuth classique + PKCE (pas de DCR côté Google, contrairement à Linear), croisement Calendar/Tasks dans le system prompt
- [x] Vision (spec 8.4) — glisser-déposer/coller une image, content block natif, vérifié avec de vrais événements paste/drop et un vrai fichier image
- [x] Lecture PDF/DOCX (spec 8.5) — PDF en content block `document` natif, DOCX extrait côté renderer via `mammoth` et fusionné dans le message texte ; vérifié avec un vrai `.pdf` et un vrai `.docx` (chip + extraction + soumission bout en bout via Playwright)
- [x] Résumé de page web (spec 8.6) — détection d'URL dans le message, fetch + extraction `@mozilla/readability`/`jsdom` côté main process (jamais le tool `fetch` natif de l'API) ; vérifié avec un fetch simulé (page valide, page 404, erreur réseau) et en conditions réelles dans l'app buildée (le fetch réseau échoue proprement dans ce sandbox, sans bloquer la requête)
- [x] Capture d'écran à la demande (spec 8.7) — tool `capture_screenshot` (`active_window`/`screen`, choisi par le modèle), image renvoyée au modèle (pas juste affichée) via `desktopCapturer`, jamais activé pour le job en tâche de fond. Vérifié en conditions réelles avec Playwright contre l'app buildée : capture d'écran entier fonctionnelle sous ce sandbox Xvfb, et repli explicite quand aucune fenêtre n'est capturable (même chemin de code qu'une permission macOS refusée). **Permission macOS requise** : Réglages système → Confidentialité et sécurité → Enregistrement d'écran → autoriser Gaia (redémarrage de l'app après activation) ; sans elle, `desktopCapturer` ne retourne aucune source et Gaia répond avec ce message explicite au lieu de planter.
- [x] Écran paramètres complet (spec 8.8) — extension du `ProfileScreen` existant : statut + déconnexion Linear/Google Calendar, gestion des sources de briefing (flux RSS, ville météo), version de l'app. Vérifié bout en bout avec Playwright contre Postgres/PostgREST/Vault local (sauvegarde des réglages persistée et relue, déconnexion qui met bien à jour la pastille sidebar). **Bug corrigé au passage** : `getLinearAuthorizationToken()` renvoyait une chaîne vide (écrite par `disconnectLinear()`) au lieu de `null`, donc `isLinearConnected()` restait `true` après déconnexion — corrigé à la racine. La pastille sidebar elle-même était déjà correctement câblée (re-vérifié directement en vidant/repeuplant Supabase Vault) : le signalement initial venait de cette régression sur la déconnexion, pas d'un défaut du rafraîchissement de statut.
- [x] Refonte de l'affichage du chat (spec 8.9) — rendu markdown (`react-markdown`+`remark-gfm`), panneau de conversation scrollable avec bulles utilisateur/Gaia distinctes, réseau organique + label réduits en bandeau dès le premier message. Rendu markdown vérifié pixel par pixel dans un vrai navigateur (bundle isolé, `window.gaia.chat.send` non mockable — objet `contextBridge` gelé) ; transition de mise en page et accumulation des messages vérifiées via Playwright contre l'app buildée. **Corrigé au passage** : un lien markdown cliqué navigeait la fenêtre de l'app elle-même faute de garde `will-navigate` — ouvre maintenant dans le navigateur système.
- [x] États HUD différenciés, direction visuelle précise (spec 8.2 révisé) — comportement distinct par état (idle tamisé, listening resserré + lumineux, thinking en flux de points vers le centre, responding au cœur figé) plutôt qu'un facteur d'intensité unique ; densité du réseau proportionnelle à la taille du canvas (nécessaire pour le bandeau mini de 8.9). Les 4 états vérifiés visuellement (captures d'écran) et fonctionnellement (libellé) via de vrais événements `hud:state` poussés dans l'app buildée.
- [x] Sources RSS fixées explicitement (spec 8.1/8.9) — Le Monde / Les Echos finance-marchés / TechCrunch, plus de choix ouvert après un article hors-sujet remonté en test. URLs non vérifiables dans ce sandbox (réseau bloqué, même limitation que les autres domaines externes) — appliquées telles que fournies.
- [x] Maîtrise des coûts (spec 8.10) — log de coût par appel API dans Supabase (`api_usage_log`) avec coût du jour affiché dans les paramètres, routing Haiku/Sonnet vérifié en pratique sur 40 messages représentatifs (73 % Haiku), cache TTL étendu à 1h sur le bloc système du chat. Non vérifié : impact chiffré réel sur la facture (pas de clé Anthropic disponible ici).
- [x] Appels API strictement à la demande (spec 8.11) — suite au retour "enlève les appels silencieux" : job de badge HUD en tâche de fond, extraction mémoire automatique après chaque échange et résumé de conversation automatique **supprimés entièrement** (pas juste limités) — `hudBadge.ts` et `memoryExtraction.ts` supprimés, `maybeSummarize()`/`upsertPeripheralFact()` retirés. Il ne reste que 2 points d'appel Claude dans tout le code, tous deux déclenchés par une action explicite d'Axel (envoi d'un message, sauvegarde du profil) — vérifié par relecture exhaustive des call sites (`grep` sur `messages.create`).

## Configuration Google Tasks

Le paquet `gtasks-mcp` cité dans la spec est dépublié sur npm ; on utilise
[`google-tasks-mcp`](https://www.npmjs.com/package/google-tasks-mcp) (même
principe : serveur MCP Google Tasks auto-hébergé, open source), qui couvre en
plus les opérations sur les listes.

**Différence d'architecture importante par rapport à Linear** : le connecteur
`mcp_servers` de l'API Anthropic n'accepte que des serveurs MCP joignables en
HTTPS public (les requêtes partent des serveurs d'Anthropic, pas de la machine
de l'utilisateur) — un `localhost` ne fonctionnera jamais avec ce paramètre.
`google-tasks-mcp` parle stdio et tourne en subprocess local : Gaia le pilote
donc côté client (`src/main/mcp/googleTasksClient.ts`), avec une boucle
d'appel d'outils classique dans `src/main/claude/chat.ts`, plutôt que via
`mcp_servers`. Linear reste sur `mcp_servers` puisque son serveur est hébergé
par Linear en HTTPS public.

Configuration (une fois, ~15 minutes, voir le README du paquet pour le détail) :

```bash
# 1. Créer un projet Google Cloud, activer l'API Google Tasks, créer un
#    identifiant OAuth "Desktop app", sauvegarder le JSON dans
#    ~/.config/google-tasks-mcp/client_secret.json
# 2. Authentifier (ouvre le navigateur, stocke le refresh token) :
npx google-tasks-mcp auth
```

Gaia spawn ensuite automatiquement le serveur au premier besoin — aucune
configuration côté app. Vérifié : le subprocess démarre et liste correctement
ses 13 outils sans credentials ; un appel d'outil sans credentials renvoie
proprement une erreur explicite (au lieu de planter). Non vérifié : un appel
réel une fois authentifié (nécessite un compte Google).

## Configuration Supabase

Optionnel (spec 4.6) — sans ça, le chat fonctionne mais sans persistance entre
lancements. Une fois `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` renseignés :

```bash
# Applique le schéma sur votre projet Supabase (SQL Editor, ou CLI supabase), dans l'ordre :
supabase/migrations/0001_init.sql               # historique, résumé, faits mémoire, cache HUD
supabase/migrations/0002_vault_secrets.sql      # fonctions RPC pour Supabase Vault
supabase/migrations/0003_memory_facts_tiers.sql # mémoire continue : category/tier/content/updated_at
```

Ce que ça active :
- **Historique glissant** : les 20 derniers messages persistent dans
  `conversation_messages` ; au-delà, un résumé Haiku est stocké dans
  `conversation_summary` et injecté dans le system prompt à la place des
  messages hors fenêtre.
- **Mémoire continue à deux niveaux** (`memory_facts`, spec 4.8) :
  - `core` (identité, contexte perso stable) — via l'onboarding premier
    lancement ou l'écran profil ("Paramètres" dans la sidebar), jamais écrit
    par l'extraction automatique. Injecté intégralement dans le bloc caché du
    system prompt.
  - `peripheral` (préférences, habitudes détectées) — extrait automatiquement
    par Haiku après chaque échange (sortie forcée via tool use), avec upsert
    sur un fait proche existant plutôt que duplication. Récupéré par
    mots-clés (accent-insensible, pas de recherche sémantique en V1) selon le
    sujet de la requête en cours, injecté hors du bloc caché.
  - Le chemin d'écriture automatique filtre `tier = 'peripheral'` jusque dans
    la requête SQL elle-même : il ne peut structurellement jamais toucher un
    fait `core`, pas seulement par convention de code.
- **Badge HUD** (`hud_cache`) : rafraîchi en tâche de fond toutes les 12
  minutes (fourchette 10-15 min de la spec) via un appel Haiku qui utilise les
  mêmes outils que le chat (Google Tasks + Linear).
- **Token Linear en Supabase Vault** : `connectLinear()` écrit le token via
  les fonctions RPC `gaia_set_secret`/`gaia_get_secret` (migration 0002) ; il
  survit ainsi aux redémarrages de l'app, plus seulement en mémoire.

Vérifié en local avec un vrai Postgres 16 + PostgREST (pas de mock) : les
migrations s'appliquent proprement (y compris le rename `fact`→`content` et
le check constraint sur `tier`), les opérations CRUD/upsert de toutes les
tables et les fonctions RPC ont été exercées via `@supabase/supabase-js`
exactement comme en production. Le garde-fou core/peripheral a été testé
directement : une tentative de modifier un fait `core` via le chemin d'écriture
peripheral affecte bien 0 ligne. Le pipeline complet de l'app (chat, badge
HUD, onboarding auto-déclenché sans fait core, édition/suppression dans
l'écran profil, persistance du token Linear après reconnexion) a été rejoué
avec Playwright contre cette instance locale. Seul le schéma `vault` lui-même
(propre à Supabase, non installable en local) n'a pas pu être testé
directement — les fonctions RPC ont été validées avec un schéma `vault` de
test reproduisant fidèlement les signatures officielles (`vault.create_secret`,
`vault.update_secret`, `vault.decrypted_secrets`), vérifiées via la doc et le
code source de `supabase/vault`. De même, les appels Haiku réels (extraction
et parsing du profil) sont non vérifiés faute de clé Anthropic disponible ici
— seule leur intégration (IPC, erreurs, structure de la requête tool-use) l'est.

## Configuration recherche d'images

Optionnel (spec 4.4) — sans `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_ID`, le tool
`search_image` retombe automatiquement sur Openverse (gratuit, sans clé,
résultats moins précis). Pour Google : créer un moteur de recherche
personnalisé en mode "Image search" sur
[programmablesearchengine.google.com](https://programmablesearchengine.google.com),
récupérer sa clé API et son `cx`.

Architecture (voir spec 4.4 pour le détail des déviations par rapport au texte
initial) : le tool s'exécute côté client dans la même boucle d'outils que
Google Tasks (`src/main/claude/toolLoop.ts`) ; le main process télécharge
l'image lui-même et la sert au renderer en **data URI** — jamais d'URL tierce
chargée côté renderer, la CSP n'autorise que `img-src 'self' data:`. Le
résultat texte renvoyé au modèle ne contient qu'une description courte,
jamais les octets de l'image (pas la peine de gonfler le contexte).

Vérifié directement : les trois branches (Google prioritaire, fallback
Openverse, aucun résultat, type de contenu invalide, image trop volumineuse
rejetée à 8 Mo) testées avec un `fetch` simulé — chacune retombe proprement
sur un texte de repli au lieu de planter. Non vérifié : les vrais appels
réseau vers Google/Openverse (bloqués par le sandbox réseau de ce
container, même limitation que pour `mcp.linear.app` plus haut) et le rendu
réel d'une image dans le HUD (nécessite une clé Anthropic pour déclencher le
tool en conditions réelles).
