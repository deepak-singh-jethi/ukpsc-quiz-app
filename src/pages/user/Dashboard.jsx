import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, query, where } from "firebase/firestore"
import { cachedGetDocs, TTL_LONG, TTL_SHORT } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import {
  Search, X, AlertTriangle, ChevronRight, ChevronDown, ChevronUp,
  RotateCcw, CheckCircle2, GraduationCap, Trophy,
  Zap, Clock, CalendarDays, Target,
  Flame, BookMarked, History, Play,
  RefreshCw
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

function isPublished(q) {
  if (q.status === "published") return true
  if (q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= new Date()) return true
  return false
}

function scoreColorHex(s) {
  if (s >= 80) return "#34d399"
  if (s >= 60) return "#fbbf24"
  return "#f87171"
}

function scoreTailwind(s) {
  if (s >= 80) return "text-emerald-400"
  if (s >= 60) return "text-amber-400"
  return "text-rose-400"
}

function scoreBg(s) {
  if (s >= 80) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
  if (s >= 60) return "bg-amber-500/10 text-amber-400 border border-amber-500/20"
  return "bg-rose-500/10 text-rose-400 border border-rose-500/20"
}

function timeAgo(dateVal) {
  if (!dateVal) return null
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal)
  if (isNaN(d)) return null
  const diff = (Date.now() - d) / 1000
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function addedAgo(dateVal) {
  if (!dateVal) return null
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal)
  if (isNaN(d)) return null
  const diff = (Date.now() - d) / 1000
  if (diff < 86400)  return "Today"
  if (diff < 172800) return "Yesterday"
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE RING
// ─────────────────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 56, stroke = 4 }) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const val = score ?? 0
  const dash = (val / 100) * circ
  const color = scoreColorHex(val)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

function Sk({ className }) {
  return <div className={`animate-pulse bg-gray-800/80 rounded-xl ${className}`} />
}

function SkeletonCard() {
  return (
    <div className="bg-[#0f1117] border border-gray-800/60 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Sk className="w-9 h-9 rounded-xl" />
        <div className="flex-1 space-y-1.5"><Sk className="h-3.5 w-36" /><Sk className="h-2.5 w-20" /></div>
      </div>
      <Sk className="h-1 w-full rounded-full" />
      {[1,2,3].map(i => (
        <div key={i} className="flex items-center gap-3">
          <Sk className="w-2 h-2 rounded-full" /><Sk className="h-3 flex-1" /><Sk className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP LEFT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function DesktopLeftPanel({ currentUser, totalAttempted, avgScore, needsRetryCount, streakDays, batchSections, navigate }) {
  const initial = (currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || "U").toUpperCase()
  const firstName = currentUser?.displayName?.split(" ")[0] || currentUser?.email?.split("@")[0] || "Student"

  return (
    <aside className="hidden lg:flex flex-col gap-3 w-64 shrink-0 sticky top-[69px] overflow-y-auto pb-6"
      style={{ maxHeight: "calc(100vh - 69px)", scrollbarWidth: "none" }}>

      {/* Profile */}
      <div className="bg-[#0f1117] border border-gray-800/70 rounded-2xl p-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/4 rounded-full"
          style={{ transform: "translate(40%, -40%)" }} />
        <div className="flex items-center gap-3 mb-4 relative">
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #22d3ee, #0d9488)" }}>
              <span className="text-base font-black text-white">{initial}</span>
            </div>
            {streakDays >= 3 && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                <Flame size={9} className="text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-600 mb-0.5">नमस्ते 👋</p>
            <h2 className="text-sm font-black text-white truncate">{firstName}</h2>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { val: totalAttempted, label: "Done", cls: "text-cyan-400" },
            { val: avgScore !== null ? `${avgScore}%` : "—", label: "Avg", cls: scoreTailwind(avgScore ?? 0) },
            { val: needsRetryCount, label: "Retry", cls: needsRetryCount > 0 ? "text-amber-400" : "text-gray-700" },
          ].map(({ val, label, cls }) => (
            <div key={label} className="bg-gray-900/60 rounded-xl p-2.5 text-center border border-gray-800/40">
              <div className={`text-base font-black tabular-nums ${cls}`}>{val}</div>
              <div className="text-[10px] text-gray-600 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Streak */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">This week</span>
            <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
              <Flame size={9} />{streakDays}d
            </span>
          </div>
          <div className="flex gap-1">
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className={`w-full h-1.5 rounded-full transition-all duration-500 ${
                  i < streakDays
                    ? i === streakDays - 1 ? "bg-cyan-400" : "bg-cyan-500/50"
                    : "bg-gray-800"
                }`} />
                <span className="text-[9px] text-gray-700 font-medium">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-[#0f1117] border border-gray-800/70 rounded-2xl p-3">
        <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest px-1 mb-2">Navigate</p>
        {[
          { label: "History",   path: "/history",   Icon: History,      cls: "text-cyan-400",   bg: "bg-cyan-500/10" },
          { label: "Bookmarks", path: "/bookmarks", Icon: BookMarked,   cls: "text-amber-400",  bg: "bg-amber-500/10" },
          { label: "Batches",   path: "/batches",   Icon: GraduationCap, cls: "text-violet-400", bg: "bg-violet-500/10" },
        ].map(({ label, path, Icon, cls, bg }) => (
          <button key={path} onClick={() => navigate(path)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-800/60 transition-all group text-left">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={13} className={cls} />
            </div>
            <span className="text-sm text-gray-400 group-hover:text-white transition-colors font-medium">{label}</span>
            <ChevronRight size={11} className="text-gray-700 group-hover:text-gray-400 transition ml-auto" />
          </button>
        ))}
      </div>

      {/* Batch progress */}
      {batchSections.length > 0 && (
        <div className="bg-[#0f1117] border border-gray-800/70 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">Batch Progress</p>
            <button onClick={() => navigate("/batches")} className="text-[10px] text-cyan-500 hover:text-cyan-400 transition font-medium">All →</button>
          </div>
          <div className="space-y-3.5">
            {batchSections.slice(0,4).map(({ batch, quizzes }) => {
              const att = quizzes.filter(q => q.attempted).length
              const total = quizzes.length
              const pct = total > 0 ? Math.round((att / total) * 100) : 0
              return (
                <div key={batch.id}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-gray-400 truncate flex-1 mr-2 font-medium">{batch.name}</span>
                    <span className="text-[10px] text-gray-600 tabular-nums">{att}/{total}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-violet-500"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP RIGHT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function DesktopRightPanel({ avgScore, totalAttempted, needsRetryCount, batchSections, navigate }) {
  const topBatch = batchSections[0]
  const topPct = topBatch
    ? Math.round((topBatch.quizzes.filter(q => q.attempted).length / (topBatch.quizzes.length || 1)) * 100)
    : 0

  return (
    <aside className="hidden xl:flex flex-col gap-3 w-52 shrink-0 sticky top-[69px] overflow-y-auto pb-6"
      style={{ maxHeight: "calc(100vh - 69px)", scrollbarWidth: "none" }}>

      {/* Score ring */}
      <div className="bg-[#0f1117] border border-gray-800/70 rounded-2xl p-4 text-center">
        <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest mb-3">Avg Score</p>
        <div className="relative inline-flex items-center justify-center mb-2">
          <ScoreRing score={avgScore ?? 0} size={72} stroke={5} />
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className={`text-xl font-black tabular-nums ${scoreTailwind(avgScore ?? 0)}`}>
              {avgScore !== null ? avgScore : "—"}
            </span>
            {avgScore !== null && <span className="text-[9px] text-gray-600 -mt-0.5">%</span>}
          </div>
        </div>
        <p className="text-[11px] text-gray-600">
          {avgScore === null ? "No attempts yet" : avgScore >= 80 ? "Excellent 🔥" : avgScore >= 60 ? "Good work!" : "Keep pushing!"}
        </p>
      </div>

      {/* Quick stats */}
      <div className="bg-[#0f1117] border border-gray-800/70 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">Stats</p>
        {[
          { Icon: Target,        label: "Total done",  val: totalAttempted,  cls: "text-cyan-400" },
          { Icon: AlertTriangle, label: "Need retry",  val: needsRetryCount, cls: needsRetryCount > 0 ? "text-amber-400" : "text-gray-700" },
          { Icon: GraduationCap, label: "Batches",     val: batchSections.length, cls: "text-violet-400" },
        ].map(({ Icon, label, val, cls }) => (
          <div key={label} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-800/60 flex items-center justify-center shrink-0">
              <Icon size={12} className={cls} />
            </div>
            <span className="text-xs text-gray-500 flex-1">{label}</span>
            <span className={`text-sm font-black tabular-nums ${cls}`}>{val}</span>
          </div>
        ))}
      </div>

      {/* Top batch */}
      {topBatch && (
        <div className="bg-[#0f1117] border border-gray-800/70 rounded-2xl p-4">
          <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest mb-3">Top Batch</p>
          <p className="text-xs text-white font-bold mb-2 truncate">{topBatch.batch.name}</p>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-1.5">
            <div className={`h-full rounded-full transition-all duration-1000 ${topPct === 100 ? "bg-emerald-500" : "bg-violet-500"}`}
              style={{ width: `${topPct}%` }} />
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-600">{topBatch.quizzes.filter(q=>q.attempted).length} done</span>
            <span className="text-[10px] font-bold text-violet-400">{topPct}%</span>
          </div>
        </div>
      )}
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE HEADER
// ─────────────────────────────────────────────────────────────────────────────

function MobileHeader({ totalAttempted, avgScore, streakDays, remaining }) {
  return (
    <div className="lg:hidden pt-1">
      {/* Stat tiles — greeting row removed */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* Done */}
        <div className="bg-[#111318] border border-gray-800/60 rounded-2xl p-3 text-center">
          <div className="text-[26px] font-black text-cyan-400 tabular-nums leading-none mb-1">{totalAttempted}</div>
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Done</div>
        </div>
        {/* Remaining */}
        <div className="bg-[#111318] border border-gray-800/60 rounded-2xl p-3 text-center">
          <div className={`text-[26px] font-black tabular-nums leading-none mb-1 ${remaining > 0 ? "text-cyan-400" : "text-gray-700"}`}>
            {remaining}
          </div>
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Left</div>
        </div>
        {/* Avg Score */}
        <div className="bg-[#111318] border border-gray-800/60 rounded-2xl p-3 text-center">
          <div className={`text-[26px] font-black tabular-nums leading-none mb-1 ${avgScore !== null ? scoreTailwind(avgScore) : "text-gray-700"}`}>
            {avgScore !== null ? `${avgScore}%` : "—"}
          </div>
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Avg</div>
        </div>
      </div>
      {/* Streak pill — shown only when active */}
      {streakDays >= 1 && (
        <div className="flex justify-end mb-1">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-1 mb-2">
            <Flame size={11} className="text-amber-400" />
            <span className="text-[11px] font-bold text-amber-400">{streakDays}d streak</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE BATCH STRIP
// ─────────────────────────────────────────────────────────────────────────────

function MobileBatchStrip({ batchSections, navigate }) {
  if (!batchSections.length) return null
  const PREVIEW = 2
  const visible = batchSections.slice(0, PREVIEW)
  const hasMore = batchSections.length > PREVIEW
  return (
    <div className="lg:hidden space-y-2">
      {visible.map(({ batch, quizzes }) => {
        const done = quizzes.filter(q => q.attempted).length
        const total = quizzes.length
        const pct = total ? Math.round((done / total) * 100) : 0
        const needsAttention = quizzes.filter(q => q.attempted && q.bestScore < 70).length
        const remaining = total - done
        return (
          <button key={batch.id} onClick={() => navigate("/batches")}
            className="w-full bg-[#111318] border border-gray-800/60 rounded-2xl px-4 py-3 text-left active:border-violet-500/40 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-white font-bold truncate flex-1 mr-3">{batch.name}</span>
              <span className="text-[11px] text-gray-500 tabular-nums shrink-0">{done}/{total}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full mb-2">
              <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-violet-500"}`}
                style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-3">
              {remaining > 0
                ? <span className="text-[11px] text-gray-500">{remaining} remaining</span>
                : <span className="text-[11px] text-emerald-400 font-semibold">All done ✓</span>
              }
              {needsAttention > 0 && (
                <span className="text-[11px] text-amber-400">{needsAttention} need attention</span>
              )}
              <span className="text-[11px] font-black text-violet-400 ml-auto">{pct}%</span>
            </div>
          </button>
        )
      })}
      {hasMore && (
        <button onClick={() => navigate("/batches")}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-gray-600 hover:text-gray-400 active:text-gray-400 transition-colors">
          <GraduationCap size={12} />
          <span>+{batchSections.length - PREVIEW} more batch{batchSections.length - PREVIEW > 1 ? "es" : ""} — see all</span>
          <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENT
// ─────────────────────────────────────────────────────────────────────────────

function AnnouncementBanner({ ann, onDismiss }) {
  const cfg = {
    warning: { wrap: "bg-amber-500/8 border-amber-500/25",    dot: "bg-amber-400",   text: "text-amber-300"   },
    success: { wrap: "bg-emerald-500/8 border-emerald-500/25", dot: "bg-emerald-400", text: "text-emerald-300" },
    urgent:  { wrap: "bg-rose-500/8 border-rose-500/25",      dot: "bg-rose-400",    text: "text-rose-300"    },
    info:    { wrap: "bg-blue-500/8 border-blue-500/25",      dot: "bg-blue-400",    text: "text-blue-300"    },
  }
  const c = cfg[ann.type] || cfg.info
  return (
    <div className={`border rounded-xl flex items-start gap-2.5 px-3.5 py-2.5 ${c.wrap}`}>
      {ann.pinned && <span className="text-[11px] shrink-0 mt-0.5">📌</span>}
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 animate-pulse ${c.dot}`} />
      <p className={`flex-1 text-xs leading-relaxed ${c.text}`}>{ann.message}</p>
      <button onClick={() => onDismiss(ann.id)} className={`shrink-0 ${c.text} opacity-40 hover:opacity-80 transition`}><X size={12} /></button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BUCKET HEADER
// ─────────────────────────────────────────────────────────────────────────────

function BucketHeader({ icon: Icon, label, count, colorClass }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-y border-gray-800/40 ${colorClass}`}>
      <Icon size={10} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      <span className="text-[10px] font-bold opacity-40 ml-0.5">· {count}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ ROWS
// ─────────────────────────────────────────────────────────────────────────────

function RowUpNext({ quiz, batchId, navigate }) {
  const DIFF = { easy: "text-emerald-400", medium: "text-amber-400", hard: "text-rose-400" }
  const added = addedAgo(quiz.createdAt)
  return (
    <button onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors text-left group">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-700 group-hover:bg-cyan-500 transition-colors shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-300 truncate group-hover:text-white transition-colors font-medium">{quiz.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] text-gray-600">{quiz.questionCount || 0}Q · {quiz.totalTime || 10}m</span>
          {quiz.negativeMark > 0 && <span className="text-[10px] text-rose-600/70">−{quiz.negativeMark}</span>}
          {added && <span className="text-[10px] text-gray-700 flex items-center gap-0.5"><CalendarDays size={9} />{added}</span>}
        </div>
      </div>
      <span className={`text-[10px] font-bold shrink-0 capitalize ${DIFF[quiz.difficulty] || DIFF.medium}`}>
        {quiz.difficulty || "Med"}
      </span>
      <ChevronRight size={12} className="text-gray-700 group-hover:text-cyan-400 transition shrink-0" />
    </button>
  )
}

function RowRetry({ quiz, bestScore, attemptCount, lastAttemptAt, batchId, navigate }) {
  return (
    <button onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-500/5 transition-colors text-left group">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white truncate font-medium">{quiz.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-gray-600">{attemptCount} {attemptCount === 1 ? "attempt" : "attempts"}</span>
          {lastAttemptAt && <span className="text-[10px] text-gray-700 flex items-center gap-0.5"><Clock size={9} />{timeAgo(lastAttemptAt)}</span>}
        </div>
      </div>
      <span className={`text-[11px] font-bold rounded-lg px-2 py-0.5 shrink-0 ${scoreBg(bestScore)}`}>{bestScore}%</span>
      <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
        <RefreshCw size={10} /> Retry
      </span>
    </button>
  )
}

function RowDone({ quiz, bestScore, attemptCount, rank, lastAttemptAt, batchId, navigate }) {
  return (
    <button onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20 transition-colors text-left group">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-700/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-500 truncate group-hover:text-gray-300 transition-colors">{quiz.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {rank && <span className="text-[10px] text-gray-700">#{rank}</span>}
          <span className="text-[10px] text-gray-700">{attemptCount}× done</span>
          {lastAttemptAt && <span className="text-[10px] text-gray-700 flex items-center gap-0.5"><Clock size={9} />{timeAgo(lastAttemptAt)}</span>}
        </div>
      </div>
      <span className={`text-[11px] font-bold rounded-lg px-2 py-0.5 shrink-0 ${scoreBg(bestScore)}`}>{bestScore}%</span>
      <ChevronRight size={11} className="text-gray-700 group-hover:text-gray-400 transition shrink-0" />
    </button>
  )
}

function ShowMore({ open, setOpen, total, shown }) {
  if (total <= shown) return null
  return (
    <button onClick={() => setOpen(o => !o)}
      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-gray-600 hover:text-gray-400 hover:bg-gray-800/20 transition border-t border-gray-800/30">
      {open ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> {total - shown} more completed</>}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH CARD
// ─────────────────────────────────────────────────────────────────────────────

function BatchCard({ batch, upNext, needsRetry, done, doneCount, totalCount, avg, navigate }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const PREVIEW = 3
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const allGood = upNext.length === 0 && needsRetry.length === 0 && done.length > 0

  return (
    <div className="bg-[#0f1117] border border-gray-800/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
          <GraduationCap size={14} className="text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-bold text-white truncate">{batch.name}</h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {totalCount} quizzes
            {avg !== null && <> · avg <span className={scoreTailwind(avg)}>{avg}%</span></>}
          </p>
        </div>
        <button onClick={() => navigate("/batches")} className="text-[10px] text-gray-600 hover:text-violet-400 transition shrink-0 font-medium">
          Details →
        </button>
      </div>

      <div className="px-4 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-cyan-500" : "bg-violet-500"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-gray-600 font-bold tabular-nums">{pct}%</span>
          <span className="text-[10px] text-gray-700 tabular-nums">{doneCount}/{totalCount}</span>
        </div>
      </div>

      {upNext.length > 0 && (
        <>
          <BucketHeader icon={Zap} label="Up next" count={upNext.length} colorClass="text-cyan-500" />
          <div className="divide-y divide-gray-800/20">
            {upNext.map(({ quiz }) => <RowUpNext key={quiz.id} quiz={quiz} batchId={batch.id} navigate={navigate} />)}
          </div>
        </>
      )}

      {needsRetry.length > 0 && (
        <>
          <BucketHeader icon={AlertTriangle} label="Needs attention" count={needsRetry.length} colorClass="text-amber-500" />
          <div className="divide-y divide-gray-800/20">
            {needsRetry.map(({ quiz, bestScore, attemptCount, lastAttemptAt }) => (
              <RowRetry key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} lastAttemptAt={lastAttemptAt} batchId={batch.id} navigate={navigate} />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <BucketHeader icon={CheckCircle2} label="Completed" count={done.length} colorClass="text-gray-600" />
          <div className="divide-y divide-gray-800/10">
            {(doneOpen ? done : done.slice(0, PREVIEW)).map(({ quiz, bestScore, attemptCount, rank, lastAttemptAt }) => (
              <RowDone key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} rank={rank} lastAttemptAt={lastAttemptAt} batchId={batch.id} navigate={navigate} />
            ))}
          </div>
          <ShowMore open={doneOpen} setOpen={setDoneOpen} total={done.length} shown={PREVIEW} />
        </>
      )}

      {allGood && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/5 border-t border-emerald-500/10">
          <Trophy size={12} className="text-emerald-400 shrink-0" />
          <p className="text-[11px] text-emerald-400/80">All quizzes completed with good scores!</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FREE CARD
// ─────────────────────────────────────────────────────────────────────────────

function GlobeIcon({ size = 14, className = "" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function FreeCard({ upNext, done, navigate }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const PREVIEW = 3
  if (upNext.length === 0 && done.length === 0) return null
  const total = upNext.length + done.length
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0

  return (
    <div className="bg-[#0f1117] border border-gray-800/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <GlobeIcon className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-bold text-white">Free Quizzes</h2>
          <p className="text-[10px] text-gray-600 mt-0.5">{total} available</p>
        </div>
      </div>

      <div className="px-4 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-cyan-500 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-cyan-400 font-bold">{pct}%</span>
          <span className="text-[10px] text-gray-700">{done.length}/{total}</span>
        </div>
      </div>

      {upNext.length > 0 && (
        <>
          <BucketHeader icon={Zap} label="Up next" count={upNext.length} colorClass="text-cyan-500" />
          <div className="divide-y divide-gray-800/20">
            {upNext.map(({ quiz }) => <RowUpNext key={quiz.id} quiz={quiz} navigate={navigate} />)}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <BucketHeader icon={CheckCircle2} label="Completed" count={done.length} colorClass="text-gray-600" />
          <div className="divide-y divide-gray-800/10">
            {(doneOpen ? done : done.slice(0, PREVIEW)).map(({ quiz, bestScore, attemptCount, rank, lastAttemptAt }) => (
              <RowDone key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} rank={rank} lastAttemptAt={lastAttemptAt} navigate={navigate} />
            ))}
          </div>
          <ShowMore open={doneOpen} setOpen={setDoneOpen} total={done.length} shown={PREVIEW} />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { currentUser, userProfile } = useAuth()
  const navigate = useNavigate()

  const [batchSections, setBatchSections] = useState([])
  const [attemptedFree, setAttemptedFree] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [phase1Done, setPhase1Done]       = useState(false)
  const [freeQuizzes, setFreeQuizzes]     = useState([])
  const [phase2Done, setPhase2Done]       = useState(false)
  const [allAttempts, setAllAttempts]     = useState([])

  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]") } catch { return [] }
  })
  const [search, setSearch]       = useState("")
  const [activeTab, setActiveTab] = useState("all")

  // ── FETCH ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return

    function runPhase2(allQuizzes) {
      try {
        const published = allQuizzes.filter(isPublished)
        setFreeQuizzes(published.filter(q => q.isFree === true))
        setPhase2Done(true)
      } catch (e) { console.error("Phase 2:", e); setPhase2Done(true) }
    }

    async function phase1() {
      try {
        const [allQuizzes, announceData, attSnap] = await Promise.all([
          cachedGetDocs("quizSets", collection(db, "quizSets"),
            { ttl: TTL_LONG, revalidate: true, onUpdate: (f) => runPhase2(f) }),
          cachedGetDocs("query:announcements",
            query(collection(db, "announcements"), where("active", "==", true)),
            { ttl: TTL_LONG, revalidate: true, onUpdate: (f) => setAnnouncements(f) }
          ).catch(() => []),
          cachedGetDocs("myAttempts:" + currentUser.uid,
            query(collection(db, "quizAttempts"), where("userId", "==", currentUser.uid)),
            { ttl: TTL_SHORT }),
        ])

        setAnnouncements(announceData)
        setAllAttempts(attSnap)

        function statsFor(quizId) {
          const mine = attSnap.filter(a => a.quizId === quizId)
          if (!mine.length) return null
          const best = Math.round(Math.max(...mine.map(a => (a.score / (a.maxScore || a.totalQ || 1)) * 100)))
          const lastAt = mine.reduce((latest, a) => {
            if (!latest) return a.submittedAt
            const tD = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0)
            const lD = latest?.toDate ? latest.toDate() : new Date(latest || 0)
            return tD > lD ? a.submittedAt : latest
          }, null)
          return { best, count: mine.length, lastAt }
        }
        function rankFor(quizId) {
          const first = attSnap.find(a => a.quizId === quizId && (a.attemptNumber ?? 1) === 1)
          return first?.rank || null
        }

        const published = allQuizzes.filter(isPublished)
        const userBatchIds = userProfile?.batchIds || []
        const sections = []

        if (userBatchIds.length > 0) {
          const batchKey = `batches:${[...userBatchIds].sort().join(",")}`
          const bqKey    = `batchQuiz:${[...userBatchIds].sort().join(",")}`

          const [allBatchDocs, allBatchQuizDocs] = await Promise.all([
            cachedGetDocs(batchKey, query(collection(db, "batches"), where("__name__", "in", userBatchIds.slice(0, 30))), { ttl: TTL_SHORT, revalidate: true }),
            cachedGetDocs(bqKey, query(collection(db, "batchQuizzes"), where("batchId", "in", userBatchIds.slice(0, 30))), { ttl: TTL_SHORT, revalidate: true }),
          ])

          for (const batch of allBatchDocs) {
            const memberIds = batch.memberIds || []
            if (!memberIds.includes(currentUser.uid) && !userBatchIds.includes(batch.id)) continue
            const batchDocs = allBatchQuizDocs.filter(d => d.batchId === batch.id)
            const quizzes = batchDocs
              .map(bq => {
                const quiz = published.find(q => q.id === bq.quizId)
                if (!quiz) return null
                const stats = statsFor(quiz.id)
                return { quiz, attempted: !!stats, bestScore: stats?.best ?? null, rank: rankFor(quiz.id), attemptCount: stats?.count ?? 0, lastAttemptAt: stats?.lastAt ?? null }
              })
              .filter(Boolean)
            sections.push({ batch, quizzes })
          }
        }
        setBatchSections(sections)

        const seen = new Set()
        const triedFree = []
        for (const a of attSnap) {
          if (seen.has(a.quizId)) continue
          const q = published.find(x => x.id === a.quizId)
          if (!q?.isFree) continue
          seen.add(a.quizId)
          const stats = statsFor(a.quizId)
          triedFree.push({ quiz: q, bestScore: stats?.best ?? null, rank: rankFor(a.quizId), attemptCount: stats?.count ?? 0, lastAttemptAt: stats?.lastAt ?? null })
        }
        setAttemptedFree(triedFree)
        setPhase1Done(true)
        runPhase2(allQuizzes)
      } catch (e) {
        console.error("Phase 1:", e)
        setPhase1Done(true)
      }
    }

    phase1()
  }, [currentUser, userProfile])

  const dismissAnnouncement = useCallback((id) => {
    const next = [...dismissedIds, id]
    setDismissedIds(next)
    localStorage.setItem("dismissedAnnouncements", JSON.stringify(next))
  }, [dismissedIds])

  // ── DERIVED STATS ──────────────────────────────────────────────────────────
  const { totalAttempted, avgScore, needsRetryCount, streakDays, remaining } = useMemo(() => {
    const uniq = new Set(allAttempts.map(a => a.quizId))
    const firstAttempts = allAttempts.filter(a => (a.attemptNumber ?? 1) === 1)
    const avgScore = firstAttempts.length > 0
      ? Math.round(firstAttempts.reduce((s, a) => s + (a.score / (a.maxScore || a.totalQ || 1)) * 100, 0) / firstAttempts.length)
      : null

    let needsRetryCount = 0
    let totalBatchQuizzes = 0
    let doneBatchQuizzes = 0
    for (const { quizzes } of batchSections) {
      needsRetryCount += quizzes.filter(q => q.attempted && q.bestScore < 70).length
      totalBatchQuizzes += quizzes.length
      doneBatchQuizzes += quizzes.filter(q => q.attempted).length
    }
    const remaining = totalBatchQuizzes - doneBatchQuizzes

    const today = new Date()
    const dow = today.getDay()
    let streakDays = 0
    for (let i = 0; i <= dow; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const key = d.toDateString()
      const hit = allAttempts.some(a => {
        if (!a.submittedAt) return false
        const ad = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt)
        return ad.toDateString() === key
      })
      if (hit) streakDays++
      else if (i > 0) break
    }

    return { totalAttempted: uniq.size, avgScore, needsRetryCount, streakDays, remaining }
  }, [allAttempts, batchSections])

  // ── FILTERS ────────────────────────────────────────────────────────────────
  const matchSearch = useCallback((title, category) => {
    if (!search) return true
    const q = search.toLowerCase()
    return title?.toLowerCase().includes(q) || category?.toLowerCase().includes(q)
  }, [search])

  function applyTab(quizzes) {
    if (activeTab === "pending")   return quizzes.filter(q => !q.attempted || q.bestScore < 70)
    if (activeTab === "completed") return quizzes.filter(q => q.attempted && q.bestScore >= 70)
    return quizzes
  }

  const attemptedFreeIds   = new Set(attemptedFree.map(a => a.quiz.id))
  const freeUpNextRaw      = freeQuizzes.filter(q => !attemptedFreeIds.has(q.id) && matchSearch(q.title, q.category))
  const freeDoneRaw        = attemptedFree.filter(({ quiz }) => matchSearch(quiz.title, quiz.category))
  const filteredFreeUpNext = activeTab === "completed" ? [] : freeUpNextRaw
  const filteredFreeDone   = activeTab === "pending"   ? [] : freeDoneRaw

  const visibleAnn = announcements
    .filter(a => !dismissedIds.includes(a.id) && !(a.expiresAt && new Date(a.expiresAt) < new Date()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  const isEmpty = phase2Done && freeQuizzes.length === 0 && attemptedFree.length === 0 && batchSections.length === 0

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">
      <Navbar />

      <div className="max-w-screen-2xl mx-auto w-full px-4 sm:px-6 pt-4 pb-28 sm:pt-6 sm:pb-8">
        <div className="flex gap-5 items-start">

          {/* LEFT PANEL — desktop only */}
          {phase1Done
            ? <DesktopLeftPanel
                currentUser={currentUser} totalAttempted={totalAttempted}
                avgScore={avgScore} needsRetryCount={needsRetryCount}
                streakDays={streakDays} batchSections={batchSections} navigate={navigate}
              />
            : <aside className="hidden lg:flex flex-col gap-3 w-64 shrink-0">
                <Sk className="h-52" /><Sk className="h-32" /><Sk className="h-28" />
              </aside>
          }

          {/* CENTER */}
          <main className="flex-1 min-w-0 space-y-4">

            {/* Mobile header */}
            {phase1Done
              ? <MobileHeader totalAttempted={totalAttempted} avgScore={avgScore} streakDays={streakDays} remaining={remaining} />
              : <div className="lg:hidden space-y-3 pt-1">
                  <div className="grid grid-cols-3 gap-2"><Sk className="h-[72px] rounded-2xl" /><Sk className="h-[72px] rounded-2xl" /><Sk className="h-[72px] rounded-2xl" /></div>
                </div>
            }

            {/* Mobile batch strip */}
            {phase1Done && <MobileBatchStrip batchSections={batchSections} navigate={navigate} />}

            {/* Announcements */}
            {visibleAnn.map(ann => <AnnouncementBanner key={ann.id} ann={ann} onDismiss={dismissAnnouncement} />)}

            {/* Search + Tabs — always side by side */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1 min-w-0">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                  className="w-full bg-[#111318] border border-gray-800/70 rounded-xl pl-8 pr-7 py-2.5 text-[13px] text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none transition" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex gap-0.5 bg-[#111318] border border-gray-800/70 rounded-xl p-1 shrink-0">
                {[
                  { key: "all",       label: "All" },
                  { key: "pending",   label: "Pending" },
                  { key: "completed", label: "Done" },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                      activeTab === tab.key ? "bg-violet-500/20 text-violet-300" : "text-gray-600 active:text-gray-300"
                    }`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            {!phase1Done ? (
              <><SkeletonCard /><SkeletonCard /></>
            ) : (
              <>
                {batchSections.map(({ batch, quizzes }) => {
                  const filtered = applyTab(quizzes.filter(({ quiz }) => matchSearch(quiz.title, quiz.category)))
                  if (!filtered.length) return null
                  const upNext     = filtered.filter(({ attempted }) => !attempted)
                  const needsRetry = filtered.filter(({ attempted, bestScore }) => attempted && bestScore < 70)
                  const done       = filtered.filter(({ attempted, bestScore }) => attempted && bestScore >= 70)
                  const doneCount  = filtered.filter(q => q.attempted).length
                  const avg        = doneCount > 0
                    ? Math.round(filtered.filter(q => q.attempted).reduce((s, q) => s + (q.bestScore || 0), 0) / doneCount)
                    : null
                  return (
                    <BatchCard key={batch.id} batch={batch} upNext={upNext} needsRetry={needsRetry}
                      done={done} doneCount={doneCount} totalCount={filtered.length} avg={avg} navigate={navigate} />
                  )
                })}

                {!phase2Done
                  ? <SkeletonCard />
                  : <FreeCard upNext={filteredFreeUpNext} done={filteredFreeDone} navigate={navigate} />
                }

                {isEmpty && (
                  <div className="text-center py-24">
                    <div className="text-5xl mb-4">🎯</div>
                    <h3 className="text-base font-bold text-white mb-1">No quizzes yet</h3>
                    <p className="text-sm text-gray-600">Your admin hasn't published any quizzes yet.</p>
                  </div>
                )}
              </>
            )}
          </main>

          {/* RIGHT PANEL — xl+ only */}
          {phase1Done
            ? <DesktopRightPanel
                avgScore={avgScore} totalAttempted={totalAttempted}
                needsRetryCount={needsRetryCount} batchSections={batchSections} navigate={navigate}
              />
            : <aside className="hidden xl:flex flex-col gap-3 w-52 shrink-0">
                <Sk className="h-40 rounded-2xl" /><Sk className="h-32 rounded-2xl" />
              </aside>
          }

        </div>
      </div>
    </div>
  )
}
