import { useEffect, useRef, useState } from 'react'
import { extractRawText } from 'mammoth'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Attachment } from './gaia.d'

type Message = {
  role: 'user' | 'assistant'
  text: string
  model?: string
  imageDataUri?: string | null
  streaming?: boolean
}
type Toast = { id: number; text: string }
type PendingItem = (Attachment & { name: string }) | { kind: 'docx'; name: string; text: string }
let nextToastId = 0
let nextAttachmentId = 0

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Vision (spec 8.4) + PDF natif (spec 8.5, content block API) + DOCX (spec 8.5, mammoth, texte inline). */
async function fileToPendingItem(file: File): Promise<PendingItem | null> {
  if (file.type === DOCX_TYPE) {
    const { value } = await extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { kind: 'docx', name: file.name, text: value }
  }

  const dataUrl = await readFileAsDataUrl(file)
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    return { kind: 'image', mediaType, data, name: file.name }
  }
  if (file.type === 'application/pdf') {
    return { kind: 'pdf', data, name: file.name }
  }
  return null
}

function Clock(): React.JSX.Element {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('fr-FR'))
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString('fr-FR')), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="value">{time}</span>
}

// Référence de taille (px) à laquelle la densité du réseau (nombre de nœuds, distance de
// connexion) a été calibrée visuellement — mise à l'échelle proportionnelle en dessous (bandeau
// mini, spec 8.9) pour éviter un amas dense illisible dans un petit espace.
const REFERENCE_SIZE = 620
const REFERENCE_NODE_COUNT = 70
const REFERENCE_CONNECT_DIST = 70

/**
 * Réseau de particules animé — port du mockup HUD (canvas 2D, requestAnimationFrame). Le
 * comportement diffère explicitement par état (spec 8.2) plutôt qu'un simple facteur d'intensité :
 * idle = dérive lente tamisée, listening = resserrement + pulsation rapide + accent plus vif,
 * thinking = points voyageant le long de spokes vers le centre (flux de données, pas un pulse
 * statique), responding = cœur central figé (sans pulsation) tant que la réponse s'écrit.
 * État lu via un ref à chaque frame, jamais via une dépendance d'effet — la simulation ne
 * redémarre jamais à un changement d'état.
 */
function NetworkCanvas({ hudState }: { hudState: string }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(hudState)

  useEffect(() => {
    stateRef.current = hudState
  }, [hudState])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let w = 0
    let h = 0
    let nodeCount = REFERENCE_NODE_COUNT
    let connectDist = REFERENCE_CONNECT_DIST
    let nodes: { x: number; y: number; vx: number; vy: number; phase: number }[] = []
    const accent = '45,232,176'
    let frameId = 0

    function resize(): void {
      const rect = canvas!.parentElement!.getBoundingClientRect()
      w = canvas!.width = rect.width
      h = canvas!.height = rect.height
      const scale = Math.min(w, h) / REFERENCE_SIZE
      nodeCount = Math.max(10, Math.round(REFERENCE_NODE_COUNT * scale))
      connectDist = Math.max(18, REFERENCE_CONNECT_DIST * scale)
    }

    function initNodes(): void {
      nodes = []
      const cx = w / 2
      const cy = h / 2
      for (let i = 0; i < nodeCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.pow(Math.random(), 0.6) * Math.min(w, h) * 0.32
        nodes.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          phase: Math.random() * Math.PI * 2
        })
      }
    }

    function step(t: number): void {
      ctx!.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const state = stateRef.current
      const maxR = Math.min(w, h) * 0.34
      const isListening = state === 'listening'
      const isThinking = state === 'thinking'
      const isIdle = state === 'idle'

      // Mouvement : resserrement vers le centre en listening, dérive tamisée en idle.
      const speedMul = isListening ? 1.6 : isIdle ? 0.6 : 1
      const boundary = isListening ? maxR * 0.55 : maxR
      for (const n of nodes) {
        n.x += n.vx * speedMul
        n.y += n.vy * speedMul
        const d = Math.hypot(n.x - cx, n.y - cy)
        if (d > boundary) {
          n.vx -= (n.x - cx) * 0.0006
          n.vy -= (n.y - cy) * 0.0006
        }
      }

      if (isThinking) {
        // Flux de données : des points voyagent le long de spokes vers le centre, pas de pulse statique.
        for (const n of nodes) {
          ctx!.strokeStyle = `rgba(${accent},0.1)`
          ctx!.lineWidth = 0.5
          ctx!.beginPath()
          ctx!.moveTo(n.x, n.y)
          ctx!.lineTo(cx, cy)
          ctx!.stroke()

          const travel = ((t * 0.0008 + n.phase) % (Math.PI * 2)) / (Math.PI * 2)
          const px = n.x + (cx - n.x) * travel
          const py = n.y + (cy - n.y) * travel
          ctx!.fillStyle = `rgba(${accent},0.9)`
          ctx!.beginPath()
          ctx!.arc(px, py, 1.8, 0, Math.PI * 2)
          ctx!.fill()
        }
      } else {
        const opacity = isIdle ? 0.55 : isListening ? 1 : 0.8
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i]
            const b = nodes[j]
            const dist = Math.hypot(a.x - b.x, a.y - b.y)
            if (dist < connectDist) {
              const op = (1 - dist / connectDist) * 0.35 * opacity
              ctx!.strokeStyle = `rgba(${accent},${op})`
              ctx!.lineWidth = 0.6
              ctx!.beginPath()
              ctx!.moveTo(a.x, a.y)
              ctx!.lineTo(b.x, b.y)
              ctx!.stroke()
            }
          }
        }

        const pulseSpeed = isListening ? 0.003 : 0.0015
        for (const n of nodes) {
          const pulse = 0.5 + 0.5 * Math.sin(t * pulseSpeed + n.phase)
          ctx!.fillStyle = `rgba(${accent},${(0.4 + pulse * 0.5) * opacity})`
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, 1.4, 0, Math.PI * 2)
          ctx!.fill()
        }
      }

      // Cœur central : figé (sans pulsation) tant que la réponse s'écrit, sinon pulse doux.
      const coreRadius = maxR * 0.24
      const corePulse = state === 'responding' ? 1 : 0.6 + 0.4 * Math.sin(t * 0.002)
      const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreRadius)
      grad.addColorStop(0, `rgba(${accent},${0.25 * corePulse})`)
      grad.addColorStop(1, `rgba(${accent},0)`)
      ctx!.fillStyle = grad
      ctx!.beginPath()
      ctx!.arc(cx, cy, coreRadius, 0, Math.PI * 2)
      ctx!.fill()

      frameId = requestAnimationFrame(step)
    }

    function handleResize(): void {
      resize()
      initNodes()
    }

    resize()
    initNodes()
    frameId = requestAnimationFrame(step)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameId)
    }
  }, [])

  return <canvas ref={canvasRef} />
}

/** Panneau de conversation (spec 8.9) — rendu markdown côté Gaia, historique complet scrollable. */
function ChatPanel({ messages }: { messages: Message[] }): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  return (
    <div className="chat-panel">
      {messages.map((m, i) => (
        <div key={i} className={`msg msg-${m.role}`}>
          <div className="msg-bubble">
            {m.role === 'assistant' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            ) : (
              <p>{m.text}</p>
            )}
            {m.imageDataUri && <img src={m.imageDataUri} alt="" className="reply-image" />}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function Toasts({ toasts }: { toasts: Toast[] }): React.JSX.Element {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </div>
  )
}

type CoreFact = { id: number; category: string | null; content: string }

type IntegrationName = 'linear' | 'googleCalendar'

/** Statut + déconnexion d'une intégration (spec 8.8) — Google Tasks exclu : token géré en dehors de l'app. */
function IntegrationRow({
  label,
  connected,
  onDisconnect
}: {
  label: string
  connected: boolean
  onDisconnect: () => void
}): React.JSX.Element {
  return (
    <div className="profile-fact">
      <span style={{ flex: 1 }}>
        {label} <span className={`status-dot ${connected ? 'on' : ''}`} />
      </span>
      {connected && (
        <button type="button" onClick={onDisconnect}>
          Déconnecter
        </button>
      )}
    </div>
  )
}

/** Écran profil (paramètres) et onboarding premier lancement — même composant, spec : réutilisation. */
function ProfileScreen({
  isOnboarding,
  onClose,
  onIntegrationsChanged
}: {
  isOnboarding: boolean
  onClose: () => void
  onIntegrationsChanged: () => void
}): React.JSX.Element {
  const [facts, setFacts] = useState<CoreFact[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [freeText, setFreeText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [linearConnected, setLinearConnected] = useState(false)
  const [googleTasksConnected, setGoogleTasksConnected] = useState(false)
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [rssFeedsText, setRssFeedsText] = useState('')
  const [weatherCity, setWeatherCity] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [todayCostUsd, setTodayCostUsd] = useState<number | null>(null)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [pttShortcut, setPttShortcut] = useState('F9')
  const [piperVoice, setPiperVoice] = useState('')
  const [voiceSettingsSaved, setVoiceSettingsSaved] = useState(false)

  async function refresh(): Promise<void> {
    setFacts(await window.gaia.memory.getCoreFacts())
  }

  async function refreshSettings(): Promise<void> {
    const [linear, googleTasks, googleCalendar, rssFeeds, city, version, cost, shortcut, voice] = await Promise.all([
      window.gaia.auth.linear.status(),
      window.gaia.auth.googleTasks.status(),
      window.gaia.auth.googleCalendar.status(),
      window.gaia.settings.getRssFeeds(),
      window.gaia.settings.getWeatherCity(),
      window.gaia.settings.getAppVersion(),
      window.gaia.settings.getTodayCostUsd(),
      window.gaia.settings.getPttShortcut(),
      window.gaia.settings.getPiperVoice()
    ])
    setLinearConnected(linear)
    setGoogleTasksConnected(googleTasks)
    setGoogleCalendarConnected(googleCalendar)
    setRssFeedsText((rssFeeds ?? []).join('\n'))
    setWeatherCity(city ?? '')
    setAppVersion(version)
    setTodayCostUsd(cost)
    setPttShortcut(shortcut ?? 'F9')
    setPiperVoice(voice ?? '')
  }

  useEffect(() => {
    refresh()
    if (!isOnboarding) refreshSettings()
  }, [isOnboarding])

  async function handleDisconnect(name: IntegrationName): Promise<void> {
    if (name === 'linear') await window.gaia.auth.linear.disconnect()
    if (name === 'googleCalendar') await window.gaia.auth.googleCalendar.disconnect()
    await refreshSettings()
    onIntegrationsChanged()
  }

  async function handleSaveBriefingSettings(): Promise<void> {
    const feeds = rssFeedsText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
    await Promise.all([
      window.gaia.settings.setRssFeeds(feeds),
      window.gaia.settings.setWeatherCity(weatherCity.trim() || null)
    ])
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  async function handleSaveVoiceSettings(): Promise<void> {
    await Promise.all([
      window.gaia.settings.setPttShortcut(pttShortcut),
      window.gaia.settings.setPiperVoice(piperVoice.trim())
    ])
    setVoiceSettingsSaved(true)
    setTimeout(() => setVoiceSettingsSaved(false), 2000)
  }

  async function handleDelete(id: number): Promise<void> {
    await window.gaia.memory.deleteFact(id)
    await refresh()
  }

  async function handleSaveEdit(fact: CoreFact): Promise<void> {
    await window.gaia.memory.upsertCoreFact({ id: fact.id, category: fact.category, content: editValue })
    setEditingId(null)
    await refresh()
  }

  async function handleSaveFreeText(): Promise<void> {
    const text = freeText.trim()
    if (!text || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await window.gaia.memory.parseFreeText(text)
      setFreeText('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="profile-overlay">
      <div className="profile-panel">
        <h2>PROFIL</h2>
        {isOnboarding && (
          <p>
            Bienvenue — dis-moi qui tu es, ce que tu fais, tes projets en cours et ton contexte perso pour
            que Gaia s&apos;en souvienne d&apos;une conversation à l&apos;autre.
          </p>
        )}

        {facts.length > 0 && (
          <div>
            {facts.map((fact) =>
              editingId === fact.id ? (
                <div key={fact.id} className="profile-fact">
                  <span className="category">{fact.category}</span>
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleSaveEdit(fact)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(fact)}
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  key={fact.id}
                  className="profile-fact"
                  onClick={() => {
                    setEditingId(fact.id)
                    setEditValue(fact.content)
                  }}
                >
                  <span className="category">{fact.category}</span>
                  <span style={{ flex: 1 }}>{fact.content}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(fact.id)
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            )}
          </div>
        )}

        <textarea
          className="profile-textarea"
          placeholder="Voici qui je suis..."
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
        />
        {error && <p style={{ color: '#e86a5c' }}>⚠ {error}</p>}

        {!isOnboarding && (
          <>
            <h2>INTÉGRATIONS</h2>
            <IntegrationRow label="Linear" connected={linearConnected} onDisconnect={() => handleDisconnect('linear')} />
            <div className="profile-fact">
              <span style={{ flex: 1 }}>
                Google Tasks <span className={`status-dot ${googleTasksConnected ? 'on' : ''}`} />
              </span>
            </div>
            <IntegrationRow
              label="Google Calendar"
              connected={googleCalendarConnected}
              onDisconnect={() => handleDisconnect('googleCalendar')}
            />

            <h2>BRIEFING</h2>
            <label className="category">Flux RSS (un par ligne, vide = par défaut)</label>
            <textarea
              className="profile-textarea"
              placeholder="https://..."
              value={rssFeedsText}
              onChange={(e) => setRssFeedsText(e.target.value)}
            />
            <label className="category">Ville météo (vide = déduite du profil)</label>
            <input value={weatherCity} onChange={(e) => setWeatherCity(e.target.value)} placeholder="Paris" />
            <div className="profile-actions">
              <button type="button" className="primary" onClick={handleSaveBriefingSettings}>
                {settingsSaved ? 'Enregistré ✓' : 'Enregistrer le briefing'}
              </button>
            </div>

            <h2>VOIX (V2)</h2>
            <label className="category">Raccourci push-to-talk global (redémarrage requis)</label>
            <select value={pttShortcut} onChange={(e) => setPttShortcut(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => `F${i + 1}`).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <label className="category">
              Voix Piper (ex. fr_FR-siwis-medium — voir « python3 -m piper.download_voices »)
            </label>
            <input
              value={piperVoice}
              onChange={(e) => setPiperVoice(e.target.value)}
              placeholder="fr_FR-siwis-medium"
            />
            <p>
              Maintenez le bouton micro ou le raccourci ci-dessus pour parler à Gaia. La réponse est lue à
              voix haute uniquement si une voix Piper est configurée ici.
            </p>
            <div className="profile-actions">
              <button type="button" className="primary" onClick={handleSaveVoiceSettings}>
                {voiceSettingsSaved ? 'Enregistré ✓' : 'Enregistrer la voix'}
              </button>
            </div>

            <h2>À PROPOS</h2>
            <p>Gaia {appVersion && `v${appVersion}`}</p>
            <p>Coût API aujourd&apos;hui : {todayCostUsd !== null ? `$${todayCostUsd.toFixed(3)}` : '--'}</p>
          </>
        )}

        <div className="profile-actions">
          <button type="button" onClick={onClose}>
            {isOnboarding ? 'Plus tard' : 'Fermer'}
          </button>
          <button type="button" className="primary" onClick={handleSaveFreeText} disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [hudState, setHudState] = useState<{ state: string; detail?: string }>({ state: 'idle' })
  const [linearConnected, setLinearConnected] = useState(false)
  const [googleTasksConnected, setGoogleTasksConnected] = useState(false)
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [hudBadge, setHudBadge] = useState<string | null>(null)
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<(PendingItem & { id: number })[]>([])

  async function addFiles(files: FileList | File[]): Promise<void> {
    const converted = await Promise.all(Array.from(files).map(fileToPendingItem))
    const valid = converted.filter((a): a is PendingItem => a !== null)
    if (valid.length < converted.length) {
      pushToasts(['⚠ Fichier non supporté (images, PDF et DOCX uniquement)'])
    }
    setPendingAttachments((prev) => [...prev, ...valid.map((a) => ({ ...a, id: nextAttachmentId++ }))])
  }

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files)
  }

  function handlePaste(event: React.ClipboardEvent): void {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) void addFiles(files)
  }

  function refreshIntegrationStatus(): void {
    window.gaia.auth.linear.status().then(setLinearConnected)
    window.gaia.auth.googleTasks.status().then(setGoogleTasksConnected)
    window.gaia.auth.googleCalendar.status().then(setGoogleCalendarConnected)
  }

  useEffect(() => {
    refreshIntegrationStatus()
    window.gaia.hud.badge().then(setHudBadge)
    window.gaia.memory.hasCoreFacts().then((has) => setIsOnboarding(!has))
    return window.gaia.hud.onState(setHudState)
  }, [])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isRecordingRef = useRef(false)

  const audioQueueRef = useRef<HTMLAudioElement[]>([])
  const isPlayingRef = useRef(false)
  const ttsActiveRef = useRef(false)

  /** File de lecture des phrases synthétisées par Piper (spec V2 vocal 3) — lues dans l'ordre de réception, jamais en parallèle (chaque phrase attend la fin de la précédente). */
  function playNextInQueue(): void {
    const next = audioQueueRef.current.shift()
    if (!next) {
      isPlayingRef.current = false
      setHudState({ state: 'idle' })
      return
    }
    isPlayingRef.current = true
    setHudState({ state: 'responding' })
    next.onended = () => {
      URL.revokeObjectURL(next.src)
      playNextInQueue()
    }
    next.play().catch(() => playNextInQueue())
  }

  useEffect(() => {
    return window.gaia.chat.onTtsAudio((wav) => {
      ttsActiveRef.current = true
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
      audioQueueRef.current.push(new Audio(url))
      if (!isPlayingRef.current) playNextInQueue()
    })
  }, [])

  /**
   * Enregistrement micro (spec V2 vocal) — point d'entrée commun au bouton mic (pointerdown/up,
   * maintien natif du DOM) et au raccourci global push-to-talk (ptt:start/stop poussés par uiohook
   * côté main, spec 1) : les deux déclencheurs partagent exactement cette même machine à états.
   */
  async function startRecording(): Promise<void> {
    if (isRecordingRef.current) return
    isRecordingRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void finishRecording()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setHudState({ state: 'listening' })
    } catch (err) {
      isRecordingRef.current = false
      pushToasts([`⚠ Micro : ${err instanceof Error ? err.message : 'accès refusé'}`])
    }
  }

  function stopRecording(): void {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false
    mediaRecorderRef.current?.stop()
  }

  async function finishRecording(): Promise<void> {
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) {
      setHudState({ state: 'idle' })
      return
    }
    setHudState({ state: 'thinking', detail: 'Transcription...' })
    try {
      const buffer = await blob.arrayBuffer()
      const text = (await window.gaia.voice.transcribe(buffer)).trim()
      if (!text) {
        setHudState({ state: 'idle' })
        return
      }
      // Le texte transcrit traverse le pipeline de chat existant sans branche spéciale (spec V2 vocal).
      await runChatExchange(text, text, undefined, true)
    } catch (err) {
      pushToasts([`⚠ Transcription : ${err instanceof Error ? err.message : 'erreur'}`])
      setHudState({ state: 'idle' })
    }
  }

  useEffect(() => {
    const offStart = window.gaia.voice.onPttStart(() => void startRecording())
    const offStop = window.gaia.voice.onPttStop(() => stopRecording())
    return () => {
      offStart()
      offStop()
    }
  }, [])

  function pushToasts(labels: string[]): void {
    const newToasts = labels.map((text) => ({ id: nextToastId++, text }))
    setToasts((prev) => [...prev, ...newToasts])
    for (const toast of newToasts) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 4000)
    }
  }

  async function handleConnectLinear(): Promise<void> {
    if (linearConnected) return
    try {
      await window.gaia.auth.linear.connect()
      setLinearConnected(await window.gaia.auth.linear.status())
    } catch (err) {
      pushToasts([`⚠ Linear : ${err instanceof Error ? err.message : 'erreur inconnue'}`])
    }
  }

  async function handleConnectGoogleCalendar(): Promise<void> {
    if (googleCalendarConnected) return
    try {
      await window.gaia.auth.googleCalendar.connect()
      setGoogleCalendarConnected(await window.gaia.auth.googleCalendar.status())
    } catch (err) {
      pushToasts([`⚠ Google Calendar : ${err instanceof Error ? err.message : 'erreur inconnue'}`])
    }
  }

  /**
   * Point d'entrée unique du pipeline de chat (spec V2 vocal) : le texte transcrit par la voix
   * appelle exactement cette même fonction que le texte tapé, sans branche spéciale — seul
   * `isVoice` change (transmis à l'IPC pour déclencher la synthèse phrase par phrase côté main).
   * Le flux de deltas (chat:textChunk) fait grandir une bulle assistant "en cours" au fil de la
   * génération, bénéfice direct pour le texte tapé autant que support de la synthèse vocale.
   */
  async function runChatExchange(
    displayText: string,
    sendText: string,
    attachments: Attachment[] | undefined,
    isVoice = false
  ): Promise<void> {
    setMessages((prev) => [...prev, { role: 'user', text: displayText }])
    setIsSending(true)
    if (isVoice) ttsActiveRef.current = false

    let streamed = ''
    const unsubscribe = window.gaia.chat.onTextChunk((delta) => {
      streamed += delta
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        const bubble = { role: 'assistant' as const, text: streamed, streaming: true }
        return last?.streaming ? [...prev.slice(0, -1), bubble] : [...prev, bubble]
      })
    })

    try {
      const reply = await window.gaia.chat.send(sendText, attachments, isVoice)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        const bubble = { role: 'assistant' as const, text: reply.text, model: reply.model, imageDataUri: reply.imageDataUri }
        return last?.streaming ? [...prev.slice(0, -1), bubble] : [...prev, bubble]
      })
      setActiveModel(reply.model)
      pushToasts(reply.taskActions.map((action) => `✓ Ajouté : ${action}`))
      refreshIntegrationStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      setMessages((prev) => [...prev, { role: 'assistant', text: `⚠ ${message}` }])
    } finally {
      unsubscribe()
      setIsSending(false)
      if (isVoice) {
        // Laisse "responding" actif si la synthèse vocale a démarré (spec 4) — la file audio
        // repasse elle-même à idle une fois la dernière phrase jouée. Sinon (pas de voix Piper
        // configurée, échec silencieux), repli sur idle après une brève marge.
        setTimeout(() => {
          if (!ttsActiveRef.current) setHudState({ state: 'idle' })
        }, 500)
      } else {
        setHudState({ state: 'idle' })
      }
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const text = input.trim()
    if ((!text && pendingAttachments.length === 0) || isSending) return

    const docxTexts = pendingAttachments.filter((item) => item.kind === 'docx')
    const attachments = pendingAttachments
      .filter((item): item is PendingItem & { id: number; kind: 'image' | 'pdf' } => item.kind !== 'docx')
      .map(({ id: _id, name: _name, ...att }) => att)
    const docxPrefix = docxTexts.map((d) => `[Contenu de ${d.name}]\n${d.text}`).join('\n\n')
    const finalText = docxPrefix ? `${docxPrefix}\n\n${text}` : text

    setInput('')
    setPendingAttachments([])
    await runChatExchange(text || `[${pendingAttachments.length} fichier(s)]`, finalText, attachments)
  }

  const stateLabel =
    hudState.state === 'thinking'
      ? (hudState.detail ?? 'réflexion...')
      : hudState.state === 'responding'
        ? 'réponse...'
        : hudState.state === 'listening'
          ? "à l'écoute..."
          : 'en veille'

  return (
    <>
      <div className="titlebar">
        <div className="dot" />
        <span>GAIA</span>
      </div>

      <div className="statusbar">
        <div className="stat">
          <span className="label">MODÈLE_ACTIF</span>
          <span className="value">{(activeModel ?? 'claude-sonnet-5').includes('haiku') ? 'HAIKU-4.5' : 'SONNET-5'}</span>
        </div>
        <div className="stat">
          <span className="label">TÂCHES_AUJOURD&apos;HUI</span>
          <span className="value">{hudBadge ?? '--'}</span>
        </div>
        <div className="stat right">
          <span className="label">LOCAL_TIME</span>
          <Clock />
        </div>
      </div>

      <div className="body">
        <div className="sidebar">
          <button type="button" className="nav-item active" onClick={() => setMessages([])}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nouvelle conversation
          </button>

          <div className="section-label">HISTORIQUE</div>
          {messages
            .filter((m) => m.role === 'user')
            .slice(-5)
            .reverse()
            .map((m, i) => (
              <div key={i} className="history-item">
                {m.text}
              </div>
            ))}

          <div className="section-label">INTÉGRATIONS</div>
          <button type="button" className="nav-item" onClick={handleConnectLinear}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
              <rect x="4" y="4" width="16" height="16" rx="3" />
            </svg>
            Linear
            <span className={`status-dot ${linearConnected ? 'on' : ''}`} />
          </button>
          <div className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h11" />
            </svg>
            Google Tasks
            <span className={`status-dot ${googleTasksConnected ? 'on' : ''}`} />
          </div>
          <button type="button" className="nav-item" onClick={handleConnectGoogleCalendar}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Google Calendar
            <span className={`status-dot ${googleCalendarConnected ? 'on' : ''}`} />
          </button>

          <div className="section-label">SYSTÈME</div>
          <button type="button" className="nav-item" onClick={() => setShowProfile(true)}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.04 1.56V21a2 2 0 01-4 0v-.09A1.7 1.7 0 008.96 19a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1.04H3a2 2 0 010-4h.09A1.7 1.7 0 004.6 8.6a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H9a1.7 1.7 0 001.04-1.56V3a2 2 0 014 0v.09a1.7 1.7 0 001.04 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.56 1.04H21a2 2 0 010 4h-.09a1.7 1.7 0 00-1.56 1.04z" />
            </svg>
            Paramètres
          </button>
        </div>

        <div className="main" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          {messages.length === 0 ? (
            <div className="stage">
              <NetworkCanvas hudState={hudState.state} />
              <div className="core-label">
                <div className="name">GAIA</div>
                <div className="state">{stateLabel}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="stage-mini">
                <NetworkCanvas hudState={hudState.state} />
                <div className="core-label">
                  <div className="name">GAIA</div>
                  <div className="state">{stateLabel}</div>
                </div>
              </div>
              <ChatPanel messages={messages} />
            </>
          )}

          {pendingAttachments.length > 0 && (
            <div className="attachments">
              {pendingAttachments.map((att) => (
                <span key={att.id} className="attachment-chip">
                  {att.kind === 'image' ? '🖼' : '📄'} {att.name}
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <form className="inputbar" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={handlePaste}
              placeholder="Demande quelque chose à Gaia... (glisse-dépose ou colle une image/PDF)"
              disabled={isSending}
            />
            <button
              type="button"
              className={`iconbtn mic ${hudState.state === 'listening' ? 'active' : ''}`}
              title="Maintenir pour parler (push-to-talk)"
              onPointerDown={() => void startRecording()}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" />
              </svg>
            </button>
            <button type="submit" className="iconbtn send">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <Toasts toasts={toasts} />

      {(showProfile || isOnboarding) && (
        <ProfileScreen
          isOnboarding={isOnboarding && !showProfile}
          onClose={() => {
            setShowProfile(false)
            setIsOnboarding(false)
          }}
          onIntegrationsChanged={refreshIntegrationStatus}
        />
      )}
    </>
  )
}
