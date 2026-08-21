import { useEffect, useState } from 'react'

type Message = { role: 'user' | 'assistant'; text: string }

function Sphere(): React.JSX.Element {
  return (
    <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/5 shadow-[0_0_60px_rgba(34,211,238,0.25)]">
      <div className="h-24 w-24 animate-pulse rounded-full border border-cyan-400/40" />
      <div className="absolute h-28 w-28 rounded-full border border-cyan-400/10" />
    </div>
  )
}

function Sidebar(): React.JSX.Element {
  const [linearConnected, setLinearConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.gaia.auth.linear.status().then(setLinearConnected)
  }, [])

  async function handleConnectLinear(): Promise<void> {
    setIsConnecting(true)
    setError(null)
    try {
      await window.gaia.auth.linear.connect()
      setLinearConnected(await window.gaia.auth.linear.status())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <aside className="flex w-56 flex-col gap-3 border-r border-white/5 p-4 text-sm text-white/50">
      <span className="text-xs uppercase tracking-widest text-cyan-400/70">Gaia</span>
      <button
        type="button"
        onClick={handleConnectLinear}
        disabled={linearConnected || isConnecting}
        className="rounded-lg border border-white/10 px-3 py-2 text-left text-white/70 hover:border-cyan-400/40 disabled:opacity-50"
      >
        {linearConnected ? '✓ Linear connecté' : isConnecting ? 'Connexion…' : 'Connecter Linear'}
      </button>
      {error && <span className="text-xs text-red-400">⚠ {error}</span>}
    </aside>
  )
}

function Transcript({ messages }: { messages: Message[] }): React.JSX.Element {
  return (
    <div className="flex w-full max-w-xl flex-1 flex-col gap-2 overflow-y-auto px-6 py-4 text-sm">
      {messages.map((message, index) => (
        <div
          key={index}
          className={
            message.role === 'user'
              ? 'self-end rounded-2xl bg-cyan-400/10 px-4 py-2 text-white'
              : 'self-start rounded-2xl bg-white/5 px-4 py-2 text-white/80'
          }
        >
          {message.text}
        </div>
      ))}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const text = input.trim()
    if (!text || isSending) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setIsSending(true)

    try {
      const reply = await window.gaia.chat.send(text)
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      setMessages((prev) => [...prev, { role: 'assistant', text: `⚠ ${message}` }])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex h-screen w-screen bg-[#05070a] text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col items-center">
        <div className="flex flex-shrink-0 items-center justify-center pt-8">
          <Sphere />
        </div>
        <Transcript messages={messages} />
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-3 border-t border-white/5 p-4">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Demande quelque chose à Gaia…"
            disabled={isSending}
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50"
          />
        </form>
      </div>
    </div>
  )
}
