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

Tool custom (`search_image`), pas de MCP nécessaire :

- **Primaire** : Google Custom Search API, mode image (100 requêtes gratuites/jour, payant au-delà)
- **Fallback gratuit** : Openverse (gratuit, sans clé pour usage basique, catalogue sous licences ouvertes)
- Bing Image Search exclu : l'API a été retirée par Microsoft en août 2025.
- Un seul résultat (le meilleur) par recherche, pas une liste — le HUD affiche une image, pas une galerie.

**Déviations par rapport au texte initial de la spec** :
- Le SDK `googleapis` n'est pas utilisé : la recherche d'images est un seul appel REST (`customsearch.googleapis.com`), `fetch` natif suffit très largement, `googleapis` aurait ajouté une grosse dépendance pour un seul endpoint.
- L'image ne transite jamais par une URL publique côté renderer : le point sensible est que les résultats (Google comme Openverse) pointent vers des domaines tiers arbitraires (le site source de chaque image), impossibles à allowlister proprement dans la CSP. Le main process télécharge donc l'image lui-même et la sert en **data URI** au renderer (pas de petit serveur de proxy local — inutile pour des images ponctuelles de quelques centaines de Ko à quelques Mo, plafonné à 8 Mo). La CSP du renderer n'autorise que `img-src 'self' data:`, jamais d'origine tierce.
- Le tool s'exécute côté client comme Google Tasks (boucle d'appel d'outils, `src/main/claude/toolLoop.ts`), pas via `mcp_servers` — ce n'est de toute façon pas un serveur MCP.

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

## 8. Fonctionnalités additionnelles

### 8.1 Briefing proactif météo/actu

Étend le job Haiku existant du badge HUD (`src/main/claude/hudBadge.ts`, toutes les 12 min) plutôt qu'un mécanisme séparé : deux tools client (`get_weather`, `get_news`) ajoutés à la même boucle d'outils que le reste (`toolLoop.ts`), disponibles aussi bien pour ce job que pour le chat interactif.

- **Météo** : Open-Meteo, gratuit sans clé — géocodage (`geocoding-api.open-meteo.com`) puis prévisions (`api.open-meteo.com`). Ville par défaut déduite des faits `core` du profil (injectés dans le prompt du job), avec possibilité de forcer une ville via `app_settings.weather_city_override` (écran paramètres, 8.8).
- **Actu** : `rss-parser`, gratuit sans clé, un titre par flux sur trois flux par défaut (tech, finance, actu générale), remplaçables via `app_settings.rss_feeds`.
- Nouvelle table `app_settings` (migration 0004) — une seule ligne, réglages simples, pas de gestion multi-profil.

### 8.2 États HUD différenciés

Un seul flux d'événements (`hud:state`, poussé du main vers le renderer via `webContents.send`, jamais de polling) pilote à la fois le label texte et l'intensité de l'animation du réseau de particules — pas deux systèmes séparés. États : `idle`, `listening` (bascule micro, purement local — pas d'ASR réelle avant la V2), `thinking` (avant chaque appel API, avec un libellé détaillé pour les tools exécutés côté client : "Consulte la météo...", "Recherche une image...", etc.), `responding` (réponse finale prête). Gardé à l'écart du rafraîchissement du badge HUD en tâche de fond (`emitHudEvents` désactivé par défaut dans `toolLoop.ts`) pour ne jamais faire clignoter l'état à l'insu de l'utilisateur toutes les 12 minutes.

**Limite technique assumée** : Linear et `web_search` s'exécutent côté serveur Anthropic à l'intérieur d'un seul appel API — impossible d'avoir un signal "en cours" pendant leur exécution propre, seul le "thinking" générique avant l'appel les couvre. Le libellé détaillé par tool n'est donc précis que pour les tools exécutés côté client (Google Tasks, recherche d'image, météo, actu).

### 8.3 Google Calendar

`mcp_servers`, comme Linear, pas de subprocess local (`https://calendarmcp.googleapis.com/mcp/v1`, vérifié avant d'écrire le code, pas supposé).

**Déviation par rapport au texte de la spec** : contrairement à Linear, les serveurs MCP Google ne supportent pas l'enregistrement dynamique de client (DCR) — vérifié via la documentation Google avant d'implémenter. Il faut donc un client OAuth Google Cloud pré-enregistré (type "Desktop app", `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET`), flow d'autorisation classique + PKCE au lieu du DCR de Linear — même infra de popup + serveur de callback local réutilisée (`src/main/auth/`). Scopes lecture seule (`calendar.events.readonly`, `calendar.calendarlist.readonly`) : la spec ne demande que de croiser/lire, pas d'écrire dans Calendar. `access_type=offline` + `prompt=consent` pour obtenir un refresh_token, avec rafraîchissement automatique du token d'accès (contrairement à Linear où le token stocké n'est pas rafraîchi).

Le system prompt (`systemPrompt.ts`) instruit explicitement de croiser Calendar et les todos (Google Tasks, Linear) pour toute question de planning, jamais une seule source si les autres sont accessibles.

### 8.4 Vision

Glisser-déposer et coller une image dans le HUD (zone `.main` pour le drop, l'input pour le paste) — conversion en base64 côté renderer (`FileReader`), envoyée comme content block `image` natif de l'API Claude (`src/main/claude/attachments.ts`), pas de traitement côté main avant l'appel API. Aperçu sous forme de chip au-dessus de la barre de saisie, supprimable avant envoi.

### 8.5 Lecture PDF/DOCX

Même mécanisme de drop/paste que la vision (8.4), même chip de prévisualisation.

- **PDF** : content block `document` natif de l'API Claude (`src/main/claude/attachments.ts`) — aucun traitement supplémentaire, l'API l'accepte directement en base64.
- **DOCX** : l'API n'accepte pas ce format nativement. Extraction du texte côté renderer via `mammoth` (`extractRawText`, gratuit, tourne dans le navigateur — build `browser/` du paquet, résolu automatiquement par Vite via son champ `package.json#browser`) avant l'envoi ; le texte extrait est fusionné dans le message texte (`[Contenu de fichier.docx]\n...`) plutôt qu'envoyé comme content block séparé, puisqu'il n'y a pas de bloc dédié pour du texte pré-extrait.

### 8.6 Résumé de page web

Détection d'une URL dans le message (`src/main/tools/webPage.ts`) : le main process fetch la page lui-même (jamais le tool `fetch` natif de l'API), extrait le contenu lisible via `@mozilla/readability` + `jsdom`, et préfixe le texte extrait au message avant l'appel Claude (`chat.ts`) — le modèle reçoit du texte brut, charge à lui de résumer selon la demande d'Axel. Contenu tronqué à 6000 caractères pour ne pas gonfler le contexte. Échec de fetch/extraction : message de repli explicite plutôt qu'une exception, jamais bloquant pour le reste de la requête.

### 8.7 Capture d'écran à la demande

Nouveau tool client `capture_screenshot` (`src/main/tools/screenshot.ts`), ajouté uniquement à la boucle de chat interactive (`includeScreenshotTool: true` dans `chat.ts`) — jamais au job de badge HUD en tâche de fond, garantissant qu'il ne peut structurellement jamais se déclencher hors d'une demande explicite d'Axel. Le modèle choisit `active_window` ou `screen` selon la formulation d'Axel (paramètre du tool, pas de parsing regex fragile côté app). `Electron.desktopCapturer` fournit l'image ; contrairement à `search_image` (affichage seul), l'image est ici renvoyée au modèle comme bloc `image` dans le `tool_result` — Axel peut poser des questions sur le contenu de la capture. Aucune source disponible (permission macOS manquante ou refusée) → message de repli explicite indiquant Réglages → Confidentialité et sécurité → Enregistrement d'écran.

**Limite documentée** : pas d'API Electron multiplateforme pour identifier « la fenêtre active » — la première source retournée par `desktopCapturer` (généralement la plus récemment au premier plan) est utilisée par convention.

### 8.8 Écran paramètres complet

Extension du même `ProfileScreen` déjà utilisé pour l'onboarding et l'édition des faits `core` (spec : réutilisation plutôt qu'un nouvel écran), sections supplémentaires affichées uniquement hors onboarding :

- **Intégrations** : statut réel de Linear / Google Tasks / Google Calendar (mêmes pastilles que la sidebar) + bouton déconnecter pour Linear et Google Calendar (pas Google Tasks, dont le token est géré en dehors de l'app via `npx google-tasks-mcp auth`). Une déconnexion rafraîchit aussi immédiatement la sidebar (callback partagé, pas de polling).
- **Briefing** : flux RSS (un par ligne) et ville météo, lus/écrits via `app_settings` (nouvel IPC `settings:*`, `src/main/ipc/settings.ts`).
- **À propos** : version de l'app (`app.getVersion()`).

**Bug corrigé en marge (re-vérification demandée)** : `disconnectLinear()` écrit une chaîne vide dans Supabase Vault, mais `getLinearAuthorizationToken()` renvoyait cette chaîne vide telle quelle (`return stored`) au lieu de `null` — `isLinearConnected()` (qui teste `!== null`) considérait donc à tort la déconnexion comme toujours connectée. La pastille sidebar elle-même était déjà correctement câblée (vérifié en vidant/repeuplant Vault) ; le bug ne se manifestait qu'après un clic sur Déconnecter. Corrigé à la racine (`stored || null`), pas dans l'appelant. Google Calendar n'était pas affecté (`loadTokenBundle` testait déjà `!stored` correctement).
