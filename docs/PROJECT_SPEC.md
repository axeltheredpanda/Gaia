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
- **V2** : vocal (ASR + TTS) — voir section 9. « Voix féminine » : dépend de la voix Piper choisie par Axel (`fr_FR-siwis-medium` suggéré par défaut dans l'écran paramètres, non vérifié contre le catalogue réel — réseau bloqué dans ce sandbox, voir 9.3), pas de contrainte codée en dur côté app.

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
- **Date et heure** : une ligne « Nous sommes le [date] à [heure] », recalculée à chaque requête et injectée **hors** du bloc caché (jamais de `cache_control` sur ce segment), sans quoi elle se fige au moment de la création du cache. Instruction explicite dans le prompt système : comparer toujours les échéances à cette date, une date antérieure n'est jamais « prochaine » ni « à venir ».
- **Cache HUD séparé** : badge léger (ex. « 3 tâches aujourd'hui ») visible dès l'ouverture de l'appli, stocké dans Supabase, indépendant du prompt système. *Révisé (8.11)* : ne se rafraîchit plus tout seul en tâche de fond — affiche la dernière valeur en cache s'il y en a une.
- **Historique de conversation en fenêtre glissante** : les 15-20 derniers messages tels quels. *Révisé (8.11)* : au-delà, les messages plus anciens sortent de la fenêtre sans résumé de remplacement — le résumé automatique via Haiku a été supprimé (appel API silencieux non désiré).
- **Faits mémoire tier = peripheral pertinents au sujet en cours** : récupérés par mots-clés (voir 4.9), injectés en dehors du bloc caché puisqu'ils varient à chaque requête.
- **Secrets OAuth** (Linear, Google) : stockés dans Supabase Vault, jamais en clair dans une table classique.

### 4.7 Authentification

Flow OAuth dans Electron via popup + redirect local (pour Linear et Google).

### 4.8 Mémoire continue

Le contexte todo (Linear, Google Tasks) est du temps réel récupéré à la demande, jamais stocké. La mémoire continue est différente : des faits sur l'utilisateur qui persistent d'une conversation à l'autre (préférences, projets, habitudes, personnes qu'il mentionne), stockés dans `memory_facts` (Supabase) :

- `id`, `category` (texte libre : travail, habitudes, personnes, préférences, projets…), `tier` (`core` | `peripheral`), `content`, `created_at`, `updated_at`.

**Écriture (extraction continue) — partiellement réactivée** : après chaque échange, un call Haiku relit l'échange et décide s'il y a un fait `peripheral` durable à ajouter ou mettre à jour (`src/main/claude/memoryExtraction.ts`, réintroduit pour capturer aussi les préférences d'interaction). Upsert sur un fait proche existant, sortie forcée via tool use, jamais que du tier `peripheral` par construction de la requête (garde-fou `.eq('tier', 'peripheral')` sur les updates).

**Catégorie `style_interaction`** : faits peripheral décrivant comment Axel veut que Gaia lui parle (réponses courtes, ton direct, éviter les questions en rafale…). Même table, même tier `peripheral`. Lecture **exceptionnelle** : injectés intégralement et systématiquement dans le system prompt à chaque requête (comme les faits `core`), pas par matching mots-clés — une préférence d'interaction n'a pas de sujet auquel se rattacher.

**Lecture (deux niveaux + style_interaction)** :
- `core` : injecté intégralement et systématiquement dans le bloc caché du system prompt (voir 4.6), jamais filtré, jamais omis.
- `style_interaction` (peripheral) : injecté intégralement hors bloc caché, à chaque requête.
- autres `peripheral` : lus par mots-clés simples selon le sujet de la requête en cours.

**Règle des tiers (stricte)** : `core` vient exclusivement de l'onboarding et des éditions manuelles du profil ; `peripheral` vient de l'extraction automatique après échange et des faits déjà en base. Pas de promotion automatique `peripheral` → `core` pour cette V1.

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

**Révisé (8.11)** : le job Haiku en tâche de fond décrit ci-dessous a été supprimé après coup — plus aucun appel automatique. Les tools `get_weather`/`get_news` restent disponibles, mais uniquement dans la boucle de chat interactive (`toolLoop.ts`), à la demande explicite d'Axel.

- **Météo** : Open-Meteo, gratuit sans clé — géocodage (`geocoding-api.open-meteo.com`) puis prévisions (`api.open-meteo.com`). Ville par défaut déduite des faits `core` du profil (injectés dans le prompt du job), avec possibilité de forcer une ville via `app_settings.weather_city_override` (écran paramètres, 8.8).
- **Actu** : `rss-parser`, gratuit sans clé. Sources fixées explicitement (pas de choix ouvert, après un premier test ayant remonté un article hors-sujet) : Le Monde (générale), Les Echos finance/marchés (finance), TechCrunch (tech) — remplaçables via `app_settings.rss_feeds`.
- Nouvelle table `app_settings` (migration 0004) — une seule ligne, réglages simples, pas de gestion multi-profil.

### 8.2 États HUD différenciés

Un seul flux d'événements (`hud:state`, poussé du main vers le renderer via `webContents.send`, jamais de polling) pilote à la fois le label texte et l'animation du réseau de particules (`NetworkCanvas` dans `App.tsx`) — pas deux systèmes séparés, l'état est lu via un ref à chaque frame plutôt qu'une dépendance d'effet (la simulation ne redémarre jamais à un changement d'état). États, avec un comportement visuel distinct par état plutôt qu'un simple facteur d'intensité (révisé après retour utilisateur) :

- `idle` : dérive lente, pulsation faible, opacité tamisée.
- `listening` (bascule micro, purement local — pas d'ASR réelle avant la V2) : nœuds resserrés vers le centre (rayon de confinement réduit), pulsation plus rapide, accent plus lumineux.
- `thinking` (avant chaque appel API, libellé détaillé pour les tools exécutés côté client : "Consulte la météo...", "Recherche une image...", etc.) : le maillage habituel est remplacé par des points lumineux voyageant le long de spokes vers le centre (effet flux de données), pas un pulse statique.
- `responding` (réponse finale prête) : le cœur central (dégradé radial) est figé à son intensité maximale — sans oscillation — plutôt que de pulser.

`emitHudEvents` reste désactivé par défaut dans `toolLoop.ts` (activé explicitement dans `chat.ts` uniquement) — non déterminant aujourd'hui puisque le job en tâche de fond qui aurait pu en abuser a été supprimé (8.11), mais le garde-fou structurel reste en place.

**Densité proportionnelle à la taille du canvas** : le nombre de nœuds et la distance de connexion sont calculés à partir de la taille réelle du canvas (`Math.min(largeur, hauteur)`) plutôt que des constantes fixes — nécessaire depuis que le réseau existe aussi en petit format dans le bandeau mini du panneau de chat (8.9) : des constantes pensées pour la grande sphère centrée produisaient un amas dense illisible dans un petit espace.

**Limites techniques assumées** : Linear et `web_search` s'exécutent côté serveur Anthropic à l'intérieur d'un seul appel API — impossible d'avoir un signal "en cours" pendant leur exécution propre, seul le "thinking" générique avant l'appel les couvre. Le libellé détaillé par tool n'est donc précis que pour les tools exécutés côté client (Google Tasks, recherche d'image, météo, actu). De même, l'état `responding` n'est pas soutenu "tant que le texte s'écrit" au sens littéral : les réponses ne sont pas diffusées en streaming (l'API est appelée en mode non-streaming, le texte apparaît d'un bloc), donc cet état ne reste affiché que brièvement entre la réponse de l'API et son affichage — passer en streaming résoudrait ça mais n'était pas dans le périmètre de cette itération.

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

Nouveau tool client `capture_screenshot` (`src/main/tools/screenshot.ts`), ajouté uniquement à la boucle de chat interactive (`includeScreenshotTool: true` dans `chat.ts`), garantissant qu'il ne peut structurellement jamais se déclencher hors d'une demande explicite d'Axel. Le modèle choisit `active_window` ou `screen` selon la formulation d'Axel (paramètre du tool, pas de parsing regex fragile côté app). `Electron.desktopCapturer` fournit l'image ; contrairement à `search_image` (affichage seul), l'image est ici renvoyée au modèle comme bloc `image` dans le `tool_result` — Axel peut poser des questions sur le contenu de la capture. Aucune source disponible (permission macOS manquante ou refusée) → message de repli explicite indiquant Réglages → Confidentialité et sécurité → Enregistrement d'écran.

**Limite documentée** : pas d'API Electron multiplateforme pour identifier « la fenêtre active » — la première source retournée par `desktopCapturer` (généralement la plus récemment au premier plan) est utilisée par convention.

### 8.8 Écran paramètres complet

Extension du même `ProfileScreen` déjà utilisé pour l'onboarding et l'édition des faits `core` (spec : réutilisation plutôt qu'un nouvel écran), sections supplémentaires affichées uniquement hors onboarding :

- **Intégrations** : statut réel de Linear / Google Tasks / Google Calendar (mêmes pastilles que la sidebar) + bouton déconnecter pour Linear et Google Calendar (pas Google Tasks, dont le token est géré en dehors de l'app via `npx google-tasks-mcp auth`). Une déconnexion rafraîchit aussi immédiatement la sidebar (callback partagé, pas de polling).
- **Briefing** : flux RSS (un par ligne) et ville météo, lus/écrits via `app_settings` (nouvel IPC `settings:*`, `src/main/ipc/settings.ts`).
- **À propos** : version de l'app (`app.getVersion()`).

**Bug corrigé en marge (re-vérification demandée)** : `disconnectLinear()` écrit une chaîne vide dans Supabase Vault, mais `getLinearAuthorizationToken()` renvoyait cette chaîne vide telle quelle (`return stored`) au lieu de `null` — `isLinearConnected()` (qui teste `!== null`) considérait donc à tort la déconnexion comme toujours connectée. La pastille sidebar elle-même était déjà correctement câblée (vérifié en vidant/repeuplant Vault) ; le bug ne se manifestait qu'après un clic sur Déconnecter. Corrigé à la racine (`stored || null`), pas dans l'appelant. Google Calendar n'était pas affecté (`loadTokenBundle` testait déjà `!stored` correctement).

### 8.9 Refonte de l'affichage du chat

Priorité suite à un retour utilisateur négatif : le markdown ne se rendait pas (gras affiché en `**texte**` littéral) et seule la dernière réponse était visible (`.last-reply`), sans historique consultable, flottant par-dessus l'animation sans conteneur.

- **Rendu markdown** : `react-markdown` + `remark-gfm` (gras, listes, code, liens, tableaux) pour les réponses de Gaia. Les messages utilisateur restent en texte brut (pas de markdown à interpréter dans ce qu'Axel tape).
- **Panneau de conversation** : `ChatPanel` (nouveau composant, `App.tsx`) — historique complet scrollable, bulles visuellement distinctes utilisateur (alignées à droite, fond `--accent-soft`) / Gaia (alignées à gauche, fond `--bg-panel`), auto-scroll vers le bas à chaque nouveau message (`scrollIntoView`).
- **Réseau organique + label "GAIA"** : pleine taille centrée uniquement à l'état vide (`messages.length === 0`, `.stage`). Dès le premier message, réduits en bandeau (`.stage-mini`, 76px de haut) en haut du panneau de chat, pour laisser la place à la conversation.
- **Garde de navigation ajoutée en marge** : un lien markdown cliqué naviguait la fenêtre de l'app elle-même (aucun `will-navigate` n'était en place, seul `setWindowOpenHandler` existait pour les popups) — un lien dans une réponse aurait fait quitter l'UI de Gaia. Corrigé dans `src/main/index.ts` : toute navigation vers une origine différente de celle de l'app est interceptée et ouverte dans le navigateur système (`shell.openExternal`) à la place.

Vérifié : rendu markdown (gras, liste, code inline, lien) confirmé pixel par pixel dans un navigateur réel (bundle isolé de `ReactMarkdown`+`remarkGfm`, contournant l'impossibilité de mocker `window.gaia.chat.send` — l'objet exposé par `contextBridge` est gelé, une tentative de réaffectation échoue silencieusement) ; transition état vide → panneau de chat → retour à l'état vide, accumulation des messages et alternance des bulles vérifiées via Playwright contre l'app buildée.

### 8.10 Maîtrise des coûts

Suite à ~2$ dépensés sur un premier jour de test réel :

- **Job de badge HUD limité au premier plan, puis supprimé (voir 8.11)** : d'abord gaté sur `isMainWindowFocused()`, puis retiré entièrement — Axel a demandé la suppression complète de tout appel API automatique, pas seulement sa limitation.
- **Log de coût par appel** (`api_usage_log`, migration 0005 ; `src/main/supabase/apiUsage.ts`) : chaque appel `messages.create`/`beta.messages.create` logue modèle, tokens input/output/cache read/cache write (avec répartition 5 min / 1h), et un coût `$` calculé à partir des tarifs standard. Best-effort, jamais bloquant. Le coût du jour est affiché dans l'écran paramètres (« À propos »), via un nouvel IPC `settings:getTodayCostUsd`. Seuls les 2 points d'appel restants après 8.11 (boucle de chat, parsing du profil) sont désormais loggés — tous deux explicitement déclenchés par Axel.
- **Routing Haiku/Sonnet vérifié en pratique** : sur un échantillon de 40 messages représentatifs d'un usage réel (salutations, ajouts de todo, météo, questions ouvertes, croisement calendrier/tâches…), l'heuristique (`router.ts`) envoie 73 % vers Haiku, 27 % vers Sonnet — confirme l'hypothèse théorique, aucun correctif nécessaire.
- **Cache TTL étendu à 1h** : le bloc système caché (persona + faits core, `chat.ts`) passe de `cache_control: {type: 'ephemeral'}` (5 min) à `{type: 'ephemeral', ttl: '1h'}` — plus adapté à un usage réel probablement intermittent dans la journée (l'écart entre deux échanges dépasse souvent 5 min). Coût d'écriture doublé (2× au lieu de 1.25×) mais rentable dès 3 requêtes dans la fenêtre d'1h contre 2 pour le 5 min.

Non vérifié en conditions réelles (pas de clé Anthropic disponible dans ce sandbox) : l'impact chiffré effectif sur la facture réelle d'Axel — seule la logique (gating focus, calcul de coût, TTL) est vérifiée directement.

### 8.11 Appels API strictement à la demande

Déviation demandée en cours de session, par-dessus 8.10 : au-delà de limiter les appels automatiques, les supprimer entièrement. Un seul appel Claude par action explicite d'Axel — plus aucun appel déclenché par un timer ou en arrière-plan d'un échange.

Supprimés :
- **Job de badge HUD** (`src/main/claude/hudBadge.ts`, supprimé) — rafraîchissait `hud_cache` toutes les 12 minutes. Le badge « tâches aujourd'hui » de la statusbar affiche désormais la dernière valeur en cache s'il y en a une (lecture Supabase seule, gratuite), sans plus jamais se rafraîchir tout seul.
- **Extraction mémoire automatique** — supprimée initialement avec 8.11, **réactivée ensuite** (`src/main/claude/memoryExtraction.ts`) pour alimenter les faits `peripheral` incluant `style_interaction` (voir 4.8). Effet de bord d'un envoi de message explicite, pas d'un timer.
- **Résumé de conversation automatique** (`maybeSummarize()` dans `supabase/history.ts`, supprimé) — résumait la fenêtre glissante au-delà de 20 messages via Haiku (spec 4.6). La lecture d'un résumé déjà existant (`getConversationSummary()`) reste en place.

Conservés (déclenchés explicitement par une action d'Axel, pas par un timer ni un effet de bord silencieux) : la boucle de chat interactive (`chat.ts`, un envoi de message = un appel), et le parsing du profil en texte libre (`coreFactsParser.ts`, déclenché par le bouton « Enregistrer » de l'écran profil).

**Effet sur la mémoire continue (4.8) et l'historique (4.6)** : la mémoire `core` (onboarding, édition manuelle) n'est pas affectée. La mémoire `peripheral` est de nouveau alimentée après chaque échange (extraction Haiku), avec injection systématique des faits `style_interaction`. L'historique glissant continue de fonctionner (20 derniers messages, spec 4.6) ; au-delà, les messages plus anciens sortent simplement de la fenêtre sans résumé de remplacement — accepté comme compromis, pas de solution de repli demandée.

## 9. V2 vocal

**Principe d'architecture (strict)** : le vocal n'est pas un système à part — c'est une entrée alternative (ASR) et une sortie alternative (TTS) qui se greffent sur le pipeline de chat existant, sans branche spéciale. Concrètement : `sendChat()` (`src/main/claude/chat.ts`) est totalement inchangée par le vocal ; le texte transcrit passe par `runChatExchange()` côté renderer exactement comme un message tapé, avec juste un booléen `isVoice` transmis à l'IPC pour activer la synthèse — toute la logique voix (découpage en phrases, dispatch Piper) vit à la frontière IPC (`src/main/ipc/chat.ts`), jamais dans le cœur du pipeline.

### 9.1 Déclenchement (push-to-talk)

Deux déclencheurs, unifiés vers la même machine à états d'enregistrement (`startRecording`/`stopRecording`, `App.tsx`) :

- **Bouton micro du HUD** : maintien réel (`onPointerDown`/`onPointerUp`/`onPointerLeave`), pas un clic-bascule comme avant le V2 — `getUserMedia` + `MediaRecorder` (renderer), format d'enregistrement natif du navigateur (webm/opus).
- **Raccourci clavier global** (configurable, écran paramètres → VOIX, F1-F12) : `Electron.globalShortcut` ne fournit que des déclenchements ponctuels, pas de keydown/keyup pour un vrai maintien — utilisé `uiohook-napi` à la place (binaires précompilés macOS/Windows/Linux, pas de compilation requise). Le main process pousse `ptt:start`/`ptt:stop` au renderer (`src/main/voice/ptt.ts`), qui appelle les mêmes fonctions que le bouton micro.

**Permission macOS requise** (comme pour la capture d'écran, spec 8.7) : Réglages système → Confidentialité et sécurité → Surveillance des saisies (Input Monitoring), sinon uiohook ne reçoit silencieusement aucun événement clavier.

Pas de wake word en continu (hors scope V2.0, prévu pour une itération suivante) — aucun code d'écoute permanente du micro.

### 9.2 Transcription (ASR)

Whisper local via `whisper.cpp`, intégré par le wrapper npm `nodejs-whisper` (`src/main/voice/asr.ts`) plutôt qu'un binding fait main : vendorise le source whisper.cpp et le compile localement au premier besoin (cmake/make, aucun binaire précompilé à distribuer), télécharge le modèle GGML choisi depuis Hugging Face au premier besoin également. Gratuit, 100% local, aucun service cloud.

- **Modèle retenu : `base` (multilingue)**, compromis latence/précision — `tiny` est plus rapide mais nettement moins précis en français, `small` (~3x plus lourd) apporte un gain de précision qui compte peu pour de courtes requêtes vocales. **Non mesuré en conditions réelles** (réseau bloqué dans ce sandbox de développement, impossible de télécharger un modèle réel pour comparer) — décision motivée par la littérature/communauté whisper.cpp, pas par un benchmark local. Changeable dans `asr.ts` si l'usage réel montre que `small` vaut le coût.
- Audio renderer (webm/opus) → converti en WAV 16 kHz mono via `ffmpeg` (prérequis externe, comme pour Piper) avant d'être passé à whisper.cpp.
- **Détail d'implémentation vérifié dans le code source de whisper.cpp** (pas supposé) : la valeur de retour de `nodewhisper()` est la sortie console brute et verbeuse de `whisper-cli` (avec horodatages), pas un transcript propre — le texte propre (un segment par ligne, sans horodatage) est écrit dans un fichier `<entrée>.txt` par le flag `-otxt` (`cli.cpp::output_txt`). `asr.ts` lit ce fichier directement plutôt que de faire confiance à la valeur de retour.
- Langue forcée à `fr` (paramètre `-l`) plutôt que `auto` : meilleure précision/latence quand la langue est connue à l'avance.

### 9.3 Synthèse vocale (TTS)

Piper (gratuit, local), démarré à la demande — jamais au lancement de l'app, uniquement au premier besoin de synthèse (cohérent avec la discipline « appels strictement à la demande », 8.11, même si Piper n'est pas un appel Claude).

**Déviation par rapport au texte de la spec** : pas de binding npm direct — Piper est distribué soit en binaire autonome (releases GitHub historiques `rhasspy/piper`, limitées à Linux, pas de build macOS), soit via le paquet Python `piper-tts` (`pip install "piper-tts[http]"`), qui est la distribution actuelle et multiplateforme (projet transféré à `OHF-Voice/piper1-gpl`). Gaia pilote `python3 -m piper.http_server` en subprocess (`src/main/voice/tts.ts`) plutôt que le CLI `piper` : le CLI recharge le modèle à chaque appel (lent), alors que le serveur HTTP le charge une fois puis répond vite à chaque requête — nécessaire pour tenir la latence phrase par phrase demandée. **Prérequis non documentés dans la spec initiale, ajoutés au README** : `python3` et `pip install "piper-tts[http]"`.

- **Streaming phrase par phrase** : la boucle d'outils (`toolLoop.ts`) utilise désormais `client.beta.messages.stream()` au lieu de `.create()` (tous les appels, pas seulement en mode vocal — un seul chemin de code, pas de branche spéciale), avec un callback `onTextDelta` optionnel. Côté IPC (`ipc/chat.ts`), en mode vocal, chaque delta alimente un découpage naïf par ponctuation forte + espace (`/(?<=[.!?])\s+/`) ; chaque phrase complète est synthétisée dès qu'elle est détectée, mise en file (chaînage de promesses, ordre garanti) et poussée au renderer via `chat:ttsAudio`. Le reste du buffer est vidé comme dernière phrase une fois le flux terminé.
- **Bénéfice collatéral pour le texte tapé** : le passage au streaming fait que les réponses s'affichent maintenant progressivement dans le panneau de chat (spec 8.9), pas d'un bloc — corrige au passage la limite documentée en 8.2 (« l'état responding ne reste affiché que brièvement, pas de streaming réel »).
- **Voix française** : aucune voix précise n'est codée en dur par défaut — le nom de voix Piper (ex. `fr_FR-siwis-medium`, suggéré comme exemple dans l'écran paramètres) doit être confirmé/choisi par Axel via `python3 -m piper.download_voices` sur sa machine et saisi dans Paramètres → VOIX. Choix délibéré : le catalogue de voix (hébergé sur Hugging Face) n'est pas accessible depuis ce sandbox de développement pour vérifier qu'un nom précis existe réellement — plutôt que d'écrire en dur un nom non vérifié comme s'il s'agissait d'un fait établi, il reste un réglage explicite.
- Sans voix configurée, la synthèse est silencieusement ignorée (`if (!voiceName) return` dans `dispatchTts`) — Gaia répond en texte comme avant le V2, sans erreur ni blocage.
- **Lecture côté renderer** : chaque WAV reçu est mis en file (`audioQueueRef`) et joué via `HTMLAudioElement` dans l'ordre de réception, jamais en parallèle — le renderer a déjà un chemin de sortie audio fonctionnel (page web), pas besoin d'une lib de lecture audio native côté main.

### 9.4 États HUD pendant la voix

Réutilisation stricte des états existants (spec 8.2), rien de nouveau créé côté visuel :

- `listening` : dès `startRecording()` (bouton maintenu ou `ptt:start` reçu), jusqu'à `stopRecording()`.
- `thinking` : « Transcription... » pendant l'appel à whisper.cpp, puis les états `thinking` habituels de la boucle de chat (déjà émis par `toolLoop.ts`, aucun changement nécessaire).
- `responding` : réutilisé pour la durée de la lecture audio (pas seulement le bref instant entre réponse API et affichage comme avant le streaming) — posé à chaque phrase mise en lecture (`playNextInQueue`), retombe à `idle` quand la file audio se vide. Si aucune voix n'est configurée (aucun `chat:ttsAudio` ne sera jamais émis), repli sur `idle` après une brève marge (500 ms) plutôt que de rester bloqué sur `responding`.

Hors scope V2.0 (explicitement demandé de ne pas anticiper) : wake word en continu, interruption de Gaia en cours de parole (barge-in) — aucun code d'écoute permanente ni de gestion d'interruption n'a été ajouté.

### Vérifié / non vérifié

Vérifié directement dans ce sandbox (sans clé Anthropic ni accès réseau à Hugging Face/GitHub releases) :
- Compilation réelle de whisper.cpp (cmake + make, binaire `whisper-cli` obtenu et fonctionnel) et rejet propre d'un modèle invalide (`whisper_model_load: invalid model data`) — confirme toute la chaîne jusqu'au chargement du modèle.
- Pipeline complet renderer → IPC → ffmpeg → nodejs-whisper → whisper-cli, avec un vrai fichier webm/opus généré par ffmpeg, via l'app Electron buildée et Playwright avec device micro simulé (`--use-fake-device-for-media-stream`).
- Push-to-talk réel au bouton micro (maintien souris + `getUserMedia` simulé) et au raccourci global (événement `ptt:start`/`ptt:stop` poussé directement, uiohook-napi lui-même vérifié séparément — `uIOhook.start()` fonctionne sous Xvfb).
- Découpage en phrases (`extractSentences`) sur un flux de deltas simulé — phrases complètes extraites au bon moment, reste correctement conservé.
- Installation réelle de `piper-tts` (PyPI, atteignable) et comportement du serveur HTTP : démarrage, CLI réel (`-m`, `--host`, `--port` confirmés dans le code source), échec rapide et clair sur un modèle introuvable.
- File de lecture audio et transitions d'état HUD (`responding` → `idle`) confirmées par observation directe des transitions (MutationObserver) — la lecture audio elle-même échoue dans ce sandbox Xvfb (`NotSupportedError`, pas de device audio fonctionnel), gérée proprement par repli sur la phrase suivante plutôt qu'un blocage.
- Persistance réelle des réglages voix (raccourci, nom de voix) contre Postgres/PostgREST local.

Non vérifié (réseau bloqué vers Hugging Face et les releases GitHub dans ce sandbox, pas de device audio) :
- Téléchargement réel d'un modèle whisper.cpp ou d'une voix Piper, et donc la précision/latence réelle de la transcription et la qualité audio de la synthèse.
- Lecture audio réelle de bout en bout (dépend d'un device audio fonctionnel, absent de ce sandbox).
- Fonctionnement du raccourci global sur un vrai événement clavier OS (uiohook lui-même vérifié isolément, mais pas via une frappe physique simulée à ce niveau).

## 10. IA locale (Ollama)

**Prérequis** : Ollama tourne en local (`localhost:11434`). Vérification au démarrage (`src/main/ollama/client.ts` → `initOllama()`) ; toast HUD si absent. Les deux features ci-dessous se dégradent proprement sans Ollama — pas de crash.

**Pas de tool calling** sur les chemins Ollama : entrée/sortie texte pur uniquement.

Modèles par défaut (surchargeables via env) : `OLLAMA_FILLER_MODEL=llama3.2:3b`, `OLLAMA_LOCAL_MODEL=llama3.1:8b`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`.

### 10.1 Filler vocal

En mode voix, pendant un appel cloud Haiku/Sonnet (latence perceptible, tools possibles), Gaia génère une courte phrase d'accroche via le modèle local rapide et la joue immédiatement en TTS Piper (`src/main/ollama/filler.ts`, déclenché depuis `ipc/chat.ts` en parallèle de `sendChat`). Variantes courtes ; repli sur des phrases fixes si Ollama est absent ou trop lent.

### 10.2 Troisième palier de routing (sous Haiku)

Extension de l'heuristique (`src/main/claude/router.ts`) : messages sans besoin structurel de tool ni donnée externe (reformulation, traduction, question explicite sur le contexte conversationnel) → `llama3.1:8b` local via `runOllamaChat()` (`src/main/ollama/chat.ts`) au lieu de Haiku. Détection **conservative** — critères documentés inline dans `shouldRouteToLocal()` ; en cas de doute → cloud.

**Déviation spec 9 (V2 vocal)** : le filler vocal vit à la frontière IPC comme le reste du TTS, mais le routing local ajoute une branche dans `chat.ts` — le principe « pas de branche vocale séparée » reste vrai pour ASR/TTS.
