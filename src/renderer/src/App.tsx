function Sphere(): React.JSX.Element {
  return (
    <div className="relative flex h-56 w-56 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/5 shadow-[0_0_60px_rgba(34,211,238,0.25)]">
      <div className="h-32 w-32 animate-pulse rounded-full border border-cyan-400/40" />
      <div className="absolute h-40 w-40 rounded-full border border-cyan-400/10" />
    </div>
  )
}

function Sidebar(): React.JSX.Element {
  return (
    <aside className="flex w-56 flex-col gap-3 border-r border-white/5 p-4 text-sm text-white/50">
      <span className="text-xs uppercase tracking-widest text-cyan-400/70">Gaia</span>
      <span>Contrôles à venir</span>
    </aside>
  )
}

function InputBar(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-t border-white/5 p-4">
      <input
        type="text"
        placeholder="Demande quelque chose à Gaia…"
        className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50"
      />
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen bg-[#05070a] text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center">
          <Sphere />
        </div>
        <InputBar />
      </div>
    </div>
  )
}
