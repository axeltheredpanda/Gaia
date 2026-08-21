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
- [ ] MCP Linear
- [ ] MCP Google Tasks
- [ ] Routing de modèle Haiku/Sonnet
- [ ] Stockage Supabase
- [ ] Comportement proactif todo
