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

- **System prompt statique et caché** (prompt caching Anthropic) : persona, comportement proactif todo, style de réponse, plus le bloc des faits mémoire **tier = core** (voir 4.9) — tout ce bloc est stable et regroupé dans le seul segment marqué `cache_control`.
- **Date et heure** : une ligne « Nous sommes le [date] à [heure] », recalculée à chaque requête et injectée **hors** du bloc caché (jamais de `cache_control` sur ce segment), sans quoi elle se fige au moment de la création du cache. Instruction explicite dans le prompt système : comparer toujours les échéances à cette date, une date antérieure n'est jamais « prochaine » ni « à venir ». Même traitement pour le prompt du badge HUD (4.6 suivant), qui n'a pas de bloc caché du tout mais doit recevoir la même ligne fraîche à chaque rafraîchissement.
- **Cache HUD séparé** : badge léger (ex. « 3 tâches aujourd'hui ») visible dès l'ouverture de l'appli, rafraîchi en tâche de fond toutes les 10-15 minutes, stocké dans Supabase, indépendant du prompt système.
- **Historique de conversation en fenêtre glissante** : les 15-20 derniers messages tels quels ; au-delà, résumé périodique via un call Haiku, stocké dans Supabase.
- **Faits mémoire tier = peripheral pertinents au sujet en cours** : récupérés par mots-clés (voir 4.9), injectés en dehors du bloc caché puisqu'ils varient à chaque requête.
- **Secrets OAuth** (Linear, Google) : stockés dans Supabase Vault, jamais en clair dans une table classique.

### 4.7 Authentification

Flow OAuth dans Electron via popup + redirect local (pour Linear et Google).

### 4.8 Mémoire continue

Le contexte todo (Linear, Google Tasks) est du temps réel récupéré à la demande, jamais stocké. La mémoire continue est différente : des faits sur l'utilisateur qui persistent d'une conversation à l'autre (préférences, projets, habitudes, personnes qu'il mentionne), stockés dans `memory_facts` (Supabase) :

- `id`, `category` (texte libre : travail, habitudes, personnes, préférences, projets…), `tier` (`core` | `peripheral`), `content`, `created_at`, `updated_at`.

**Écriture (extraction continue)** : après chaque échange, un call Haiku relit l'échange et les faits `peripheral` pertinents existants (même retrieval par mots-clés que la lecture), et décide s'il y a un fait durable à ajouter ou mettre à jour — toujours upsert sur un fait proche existant plutôt que dupliquer (le call fournit son id pour une mise à jour, l'omet pour une création ; c'est le modèle qui juge la similarité, pas un algorithme de similarité maison). Sortie forcée via tool use pour un résultat structuré fiable. N'écrit **jamais** que du tier `peripheral` — le code applique un filtre `tier = 'peripheral'` sur la requête d'écriture elle-même, pas seulement par convention, donc ce chemin ne peut structurellement jamais toucher un fait `core`.

**Lecture (deux niveaux)** :
- `core` : injecté intégralement et systématiquement dans le bloc caché du system prompt (voir 4.6), jamais filtré, jamais omis.
- `peripheral` : récupéré par mots-clés simples selon le sujet de la requête en cours — matching basique (normalisation des accents, filtrage des mots courants, substring), pas de recherche sémantique/pgvector pour cette V1. À revoir si le mot-clé s'avère insuffisant à l'usage.

**Règle des tiers (stricte)** : `core` vient exclusivement de l'onboarding et des éditions manuelles du profil ; `peripheral` vient exclusivement de l'extraction automatique. Pas de promotion automatique `peripheral` → `core` pour cette V1.

### 4.9 Onboarding et profil

Premier lancement détecté par l'absence de tout fait `tier = core` en base. Un écran (même composant que l'écran profil ci-dessous, cadrage différent) invite l'utilisateur à décrire qui il est, ce qu'il fait, ses projets en cours et son contexte personnel pertinent, en texte libre — un call Haiku (sortie forcée, structurée) découpe ce texte en faits distincts, toujours écrits en `tier = core`. Fermeture non bloquante (« Plus tard ») : l'app reste utilisable sans onboarding complété.

Le même écran, accessible depuis « Paramètres » dans la sidebar, liste tous les faits `core` connus, avec édition en ligne et suppression individuelle, plus la même zone de texte libre pour en ajouter.

## 5. Interface (HUD)

Référence visuelle : capture d'écran fournie par l'utilisateur (fenêtre sombre type appli desktop, sphère de particules animée, zone de saisie/micro en bas, panneau latéral de contrôles). Design précis non encore arrêté (palette, structure exacte, intégration anime.js). À discuter séparément, hors scope de ce document.

## 6. Points ouverts

- Choix final du nom du projet
- Budget global (pas encore tranché)
- Design HUD détaillé
- Modalités exactes du fallback Sonnet si l'heuristique de routing échoue trop souvent
- Retrieval `peripheral` par mots-clés (4.8) : passer à une recherche sémantique/pgvector si le matching simple s'avère insuffisant à l'usage
- Promotion `peripheral` → `core` : aucune pour cette V1, à réévaluer si des faits peripheral s'avèrent en pratique aussi durables que des faits core
