# Gaia — Spécification projet

*Nom du projet : Gaia (aussi son wake word/signe d'appel). Ce document est la source de vérité pour le développement.*

## 1. Vision

Assistant personnel desktop inspiré de J.A.R.V.I.S. (Iron Man), distinct du site harbi.eu et de son assistant Claudette. S'appelle **Gaia**, ce nom sert aussi de wake word/signe d'appel. Doit répondre à des questions générales (type recherche Google) et à des questions personnelles précises basées sur le contexte réel de l'utilisateur (todo du jour, tâches Axel Project). Interface HUD façon capture d'écran de référence : fenêtre sombre, sphère de particules animée, zone de saisie/micro en bas, panneau latéral de contrôles.

## 2. Stack technique

- Application desktop : Electron (choisi plutôt que Tauri pour rester 100% JS/TS/React)
- Frontend : React, TypeScript, Tailwind, anime.js pour les micro-interactions
- API : appels à l'API Claude (Messages API), modèles `claude-sonnet-5` et `claude-haiku-4-5-20251001`
- Stockage : Supabase (Postgres + Supabase Vault pour les secrets)
- Discipline de code : plugin Claude Code [ponytail](https://github.com/DietrichGebert/ponytail), pour éviter le sur-engineering et garder le code minimal

## 3. Roadmap

- **V1** : texte uniquement
- **V2** : vocal (ASR + TTS), voix féminine, non spécifié davantage dans ce document

## 4. Architecture fonctionnelle

### 4.1 Recherche générale

Outil natif `web_search` de l'API Claude (`type: web_search_20250305`). Aucune intégration custom nécessaire.

### 4.2 Contexte personnel : todo et tâches

Deux connexions MCP déclarées dans le paramètre `mcp_servers` des appels à l'API :

- **Linear** (tâches Axel Project) : serveur MCP officiel hébergé, `https://mcp.linear.app/mcp`. OAuth géré par Linear directement.
- **Google Tasks** (tâches personnelles) : pas de serveur MCP officiel Google pour Tasks à ce jour (Google propose des serveurs officiels pour Gmail, Drive, Docs, Sheets, Calendar, mais pas Tasks). Utiliser un serveur MCP open source auto-hébergé (ex. `gtasks-mcp` de zcaceres), avec un projet Google Cloud dédié pour l'OAuth. Scope obligatoire : écriture (`tasks`), pas `tasks.readonly`.

Les todos ne sont jamais préchargées dans le system prompt : Claude appelle les tools `list-tasks` / `create-task` / etc. uniquement quand la demande l'exige, pour ne pas gaspiller de tokens.

### 4.3 Comportement proactif sur la todo

Si l'utilisateur exprime une intention ou une action à faire dans une phrase (ex. « je veux aller à la salle ce soir »), l'assistant doit l'ajouter automatiquement à la todo appropriée, sans demander confirmation. Retour utilisateur : petit feedback visuel discret dans le HUD (ex. toast « Ajouté : Salle de sport, ce soir »), pas de prompt de confirmation bloquant.

Ce comportement doit être explicité dans le system prompt : par défaut un modèle attend une demande explicite avant d'appeler un tool d'écriture, il faut donc l'orienter clairement vers l'ajout proactif.

### 4.4 Recherche d'images

Tool custom, pas de MCP nécessaire :

- **Primaire** : Google Custom Search API, mode image (100 requêtes gratuites/jour, payant au-delà, SDK officiel Node `googleapis`)
- **Fallback gratuit** : Openverse (gratuit, sans clé pour usage basique, catalogue sous licences ouvertes)
- Bing Image Search exclu : l'API a été retirée par Microsoft en août 2025.

### 4.5 Routing de modèle (gestion budget/token)

Routage par heuristique (règles simples, pas d'appel de classification LLM en plus pour la V1) :

- **Haiku** (`claude-haiku-4-5-20251001`) par défaut : ajout/modification de todo, questions factuelles courtes, formatage.
- **Sonnet** (`claude-sonnet-5`) : dès qu'il faut chaîner plusieurs tools (croiser Linear + Google Tasks + web search), du raisonnement multi-étapes, ou une demande ouverte.

Si l'heuristique se révèle insuffisante en usage réel, ajouter un classificateur Haiku en amont plus tard (non prioritaire pour la V1).

### 4.6 Assemblage du contexte à chaque requête

- **System prompt statique et caché** (prompt caching Anthropic) : persona, comportement proactif todo, style de réponse, plus un bloc mémoire compact des faits durables sur l'utilisateur (pas l'historique brut).
- **Cache HUD séparé** : badge léger (ex. « 3 tâches aujourd'hui ») visible dès l'ouverture de l'appli, rafraîchi en tâche de fond toutes les 10-15 minutes, stocké dans Supabase, indépendant du prompt système.
- **Historique de conversation en fenêtre glissante** : les 15-20 derniers messages tels quels ; au-delà, résumé périodique via un call Haiku, stocké dans Supabase.
- **Secrets OAuth** (Linear, Google) : stockés dans Supabase Vault, jamais en clair dans une table classique.

### 4.7 Authentification

Flow OAuth dans Electron via popup + redirect local (pour Linear et Google).

## 5. Interface (HUD)

Référence visuelle : capture d'écran fournie par l'utilisateur (fenêtre sombre type appli desktop, sphère de particules animée, zone de saisie/micro en bas, panneau latéral de contrôles). Design précis non encore arrêté (palette, structure exacte, intégration anime.js). À discuter séparément, hors scope de ce document.

## 6. Points ouverts

- Choix final du nom du projet
- Budget global (pas encore tranché)
- Design HUD détaillé
- Modalités exactes du fallback Sonnet si l'heuristique de routing échoue trop souvent
