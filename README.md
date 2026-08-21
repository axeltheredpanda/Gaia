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
- [ ] MCP Google Tasks
- [ ] Routing de modèle Haiku/Sonnet
- [ ] Stockage Supabase
- [ ] Comportement proactif todo
