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
# Applique le schéma sur votre projet Supabase (SQL Editor, ou CLI supabase) :
supabase/migrations/0001_init.sql          # historique, résumé, faits mémoire, cache HUD
supabase/migrations/0002_vault_secrets.sql # fonctions RPC pour Supabase Vault
```

Ce que ça active :
- **Historique glissant** : les 20 derniers messages persistent dans
  `conversation_messages` ; au-delà, un résumé Haiku est stocké dans
  `conversation_summary` et injecté dans le system prompt à la place des
  messages hors fenêtre.
- **Faits mémoire** (`memory_facts`) : bloc compact injecté dans le system
  prompt. Rien n'écrit encore dans cette table pour l'instant (pas de feature
  d'extraction automatique de faits dans la spec V1) — c'est prêt à être
  branché plus tard.
- **Badge HUD** (`hud_cache`) : rafraîchi en tâche de fond toutes les 12
  minutes (fourchette 10-15 min de la spec) via un appel Haiku qui utilise les
  mêmes outils que le chat (Google Tasks + Linear).
- **Token Linear en Supabase Vault** : `connectLinear()` écrit le token via
  les fonctions RPC `gaia_set_secret`/`gaia_get_secret` (migration 0002) ; il
  survit ainsi aux redémarrages de l'app, plus seulement en mémoire.

Vérifié en local avec un vrai Postgres 16 + PostgREST (pas de mock) : les
migrations s'appliquent proprement, les opérations CRUD/upsert des quatre
tables et les deux fonctions RPC ont été exercées via `@supabase/supabase-js`
exactement comme en production, et le pipeline complet de l'app (chat +
badge HUD + persistance du token Linear après reconnexion) a été rejoué avec
Playwright contre cette instance locale. Seul le schéma `vault` lui-même
(propre à Supabase, non installable en local) n'a pas pu être testé
directement — les fonctions RPC ont été validées avec un schéma `vault` de
test reproduisant fidèlement les signatures officielles (`vault.create_secret`,
`vault.update_secret`, `vault.decrypted_secrets`), vérifiées via la doc et le
code source de `supabase/vault`.
