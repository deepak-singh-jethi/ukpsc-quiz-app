import { Component, useEffect, useState } from "react"

// ── Error illustration — animated broken circle SVG ───────────────────────────
function BrokenOrb() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t) }, [])

  return (
    <div className="relative w-48 h-48 mx-auto mb-10" aria-hidden>
      {/* Outer ring — broken into arcs */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background faint ring */}
        <circle cx="100" cy="100" r="80" fill="none" stroke="#1f2937" strokeWidth="1" />

        {/* Arc 1 — large, top-right */}
        <path d="M 100 20 A 80 80 0 0 1 168 140"
          fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" filter="url(#glow)"
          style={{
            strokeDasharray: 220,
            strokeDashoffset: mounted ? 0 : 220,
            transition: "stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)",
          }} />

        {/* Arc 2 — small, bottom-left */}
        <path d="M 32 140 A 80 80 0 0 1 68 26"
          fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" filter="url(#glow)"
          style={{
            strokeDasharray: 120,
            strokeDashoffset: mounted ? 0 : 120,
            transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1) 0.2s",
          }} />

        {/* Gap fills — tiny glitch dots at the breaks */}
        <circle cx="100" cy="20" r="3" fill="#f87171"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease 0.9s" }} />
        <circle cx="168" cy="140" r="3" fill="#f87171"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease 1s" }} />
        <circle cx="32" cy="140" r="2" fill="#6366f1"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease 1.1s" }} />
        <circle cx="68" cy="26" r="2" fill="#6366f1"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease 1.2s" }} />

        {/* Inner cross — minimal, centered */}
        <line x1="100" y1="70" x2="100" y2="130"
          stroke="#374151" strokeWidth="1" strokeLinecap="round"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease 0.6s" }} />
        <line x1="70" y1="100" x2="130" y2="100"
          stroke="#374151" strokeWidth="1" strokeLinecap="round"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease 0.7s" }} />

        {/* Center dot */}
        <circle cx="100" cy="100" r="4" fill="#22d3ee"
          style={{
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.3s ease 0.8s",
            filter: "drop-shadow(0 0 6px #22d3ee)",
          }} />

        {/* Orbit particle */}
        <circle cx="100" cy="20" r="2.5" fill="#22d3ee" opacity="0.6"
          style={{ transformOrigin: "100px 100px", animation: mounted ? "orbit 6s linear infinite" : "none" }} />
      </svg>

      {/* Centre number */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-black tabular-nums select-none"
          style={{
            fontFamily: "'Georgia', serif",
            letterSpacing: "-2px",
            color: "transparent",
            WebkitTextStroke: "1px #374151",
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.6s ease 0.5s",
          }}>500</span>
      </div>
    </div>
  )
}

// ── Inner screen ──────────────────────────────────────────────────────────────
function ErrorScreen({ error, onReset }) {
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), 50); return () => clearTimeout(t) }, [])

  function handleBack() {
    onReset()
    window.location.href = "/dashboard"
  }

  const ease = "cubic-bezier(0.16,1,0.3,1)"

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6 relative overflow-hidden">
      <style>{`
        @keyframes orbit {
          from { transform: rotate(0deg) translateY(-80px) rotate(0deg) }
          to   { transform: rotate(360deg) translateY(-80px) rotate(-360deg) }
        }
        @keyframes drift {
          0%,100% { transform: translateY(0px) }
          50%      { transform: translateY(-12px) }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.15 }
          100% { transform: scale(1.5); opacity: 0 }
        }
      `}</style>

      {/* Background — large ghost "500" watermark */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <span className="text-[22rem] font-black leading-none"
          style={{
            fontFamily: "'Georgia', serif",
            color: "transparent",
            WebkitTextStroke: "1px #111827",
            letterSpacing: "-12px",
            opacity: vis ? 1 : 0,
            transition: `opacity 1.2s ease`,
          }}>500</span>
      </div>

      {/* Diagonal accent line — top-left to bottom-right */}
      <div aria-hidden className="absolute pointer-events-none"
        style={{
          top: "-5%", left: "55%",
          width: "1px",
          height: "130%",
          background: "linear-gradient(180deg, transparent 0%, #22d3ee18 30%, #22d3ee30 50%, #22d3ee18 70%, transparent 100%)",
          transform: "rotate(18deg)",
          transformOrigin: "top center",
          opacity: vis ? 1 : 0,
          transition: `opacity 1s ease 0.3s`,
        }} />

      {/* Pulsing ring behind orb */}
      <div aria-hidden className="absolute pointer-events-none"
        style={{
          width: "240px", height: "240px",
          border: "1px solid #22d3ee20",
          borderRadius: "50%",
          top: "50%", left: "50%",
          transform: "translate(-50%, -58%)",
          animation: "pulse-ring 3s ease-out infinite",
        }} />

      {/* Content card */}
      <div className="relative z-10 max-w-sm w-full text-center">

        {/* Orb */}
        <div style={{ animation: vis ? "drift 5s ease-in-out infinite" : "none" }}>
          <BrokenOrb />
        </div>

        {/* Label */}
        <div style={{
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(16px)",
          transition: `opacity 0.7s ${ease} 0.3s, transform 0.7s ${ease} 0.3s`,
        }}>
          <div className="inline-flex items-center gap-2 mb-5">
            <div className="h-px w-6 bg-gray-700" />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-600">
              unexpected error
            </span>
            <div className="h-px w-6 bg-gray-700" />
          </div>
        </div>

        {/* Headline */}
        <div style={{
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(20px)",
          transition: `opacity 0.7s ${ease} 0.45s, transform 0.7s ${ease} 0.45s`,
        }}>
          <h1 className="text-4xl font-black text-white mb-3 leading-tight"
            style={{ fontFamily: "'Georgia', serif", letterSpacing: "-1.5px" }}>
            Something<br />broke.
          </h1>
        </div>

        {/* Body */}
        <div style={{
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(20px)",
          transition: `opacity 0.7s ${ease} 0.6s, transform 0.7s ${ease} 0.6s`,
        }}>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            An unexpected error stopped this page from loading.
            Your quiz progress and scores are safe.
          </p>
        </div>

        {/* Dev error pill */}
        {process.env.NODE_ENV === "development" && error && (
          <div style={{
            opacity: vis ? 1 : 0,
            transition: `opacity 0.5s ease 0.7s`,
          }}>
            <div className="bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-2.5 mb-6 text-left">
              <p className="text-[10px] font-mono text-red-400/60 uppercase tracking-widest mb-1">error</p>
              <p className="text-xs font-mono text-red-400/80 truncate">{error.toString().slice(0, 68)}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(16px)",
          transition: `opacity 0.7s ${ease} 0.75s, transform 0.7s ${ease} 0.75s`,
        }}>
          <div className="flex flex-col gap-2.5">
            <button onClick={handleBack}
              className="w-full bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-gray-950 font-black py-3.5 rounded-2xl transition-all duration-150 text-sm tracking-wide">
              Back to Dashboard
            </button>
            <button onClick={() => window.location.reload()}
              className="w-full bg-transparent hover:bg-gray-800/60 text-gray-500 hover:text-gray-300 font-semibold py-3 rounded-2xl transition-all duration-150 text-sm border border-gray-800 hover:border-gray-700">
              Reload page
            </button>
          </div>

          {/* Footer note */}
          <p className="text-gray-700 text-xs mt-6 font-mono">
            err · {new Date().toLocaleTimeString()} · boundary caught
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Class component (ErrorBoundary must be a class) ───────────────────────────
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error)
    console.error("[ErrorBoundary] Component stack:", info.componentStack)
  }

  handleReset() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onReset={this.handleReset} />
    }
    return this.props.children
  }
}