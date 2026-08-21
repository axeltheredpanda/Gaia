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

- [x] Squelette Electron + React + Tailwind, HUD placeholder (sphère, sidebar, barre de saisie)
- [x] Chat texte basique avec l'API Claude (+ `web_search` natif) — nécessite `ANTHROPIC_API_KEY` dans `.env`
- [x] MCP Linear — bouton "Connecter Linear" (OAuth 2.1 + PKCE + enregistrement dynamique de client) ou `LINEAR_API_KEY` en raccourci de test. Flow OAuth non vérifié en conditions réelles (réseau de développement sans accès à `mcp.linear.app`) — à valider avec un vrai compte Linear.
- [x] MCP Google Tasks — voir "Configuration Google Tasks" ci-dessous
- [ ] Routing de modèle Haiku/Sonnet
- [ ] Stockage Supabase
- [ ] Comportement proactif todo

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
