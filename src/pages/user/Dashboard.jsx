import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, query, where } from "firebase/firestore"
import { cachedGetDocs, TTL_LONG, TTL_SHORT } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import {
  Search, X, AlertTriangle, ChevronRight, ChevronDown,
  RotateCcw, CheckCircle2, GraduationCap, Globe, Trophy,
  BookOpen, Zap, Clock, CalendarDays
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

function isPublished(q) {
  if (q.status === "published") return true
  if (q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= new Date()) return true
  return false
}

function scoreColor(s) {
  if (s >= 80) return "text-emerald-400"
  if (s >= 60) return "text-amber-400"
  return "text-rose-400"
}

function scoreBadge(s) {
  if (s >= 80) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
  if (s >= 60) return "bg-amber-500/10 text-amber-400 border border-amber-500/25"
  return "bg-rose-500/10 text-rose-400 border border-rose-500/25"
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
  if (diff < 86400)  return "Added today"
  if (diff < 172800) return "Added yesterday"
  if (diff < 604800) return `Added ${Math.floor(diff / 86400)}d ago`
  return `Added ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-800" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-gray-800 rounded w-40" />
          <div className="h-2.5 bg-gray-800 rounded w-20" />
        </div>
      </div>
      <div className="h-1 bg-gray-800 rounded-full" />
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-800" />
          <div className="h-3 bg-gray-800 rounded flex-1" />
          <div className="h-3 bg-gray-800 rounded w-10" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO PANEL (left sidebar on desktop, top card on mobile)
// ─────────────────────────────────────────────────────────────────────────────

function HeroPanel({ currentUser, totalAttempted, avgScore, needsRetryCount, streakDays, batchSections, navigate }) {
  const initial = (currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || "U").toUpperCase()
  const firstName = currentUser?.displayName?.split(" ")[0] || currentUser?.email?.split("@")[0] || "Student"

  return (
    <div className="space-y-3">
      {/* Profile card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-white">{initial}</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">नमस्ते, {firstName} 👋</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">UKPSC / UKSSSC Prep</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-800/60 rounded-xl p-2.5 text-center">
            <div className="text-lg font-semibold text-cyan-400 tabular-nums">{totalAttempted}</div>
            <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">Attempted</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-2.5 text-center">
            <div className={`text-lg font-semibold tabular-nums ${avgScore !== null ? scoreColor(avgScore) : "text-gray-700"}`}>
              {avgScore !== null ? `${avgScore}%` : "—"}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">Avg score</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-2.5 text-center">
            <div className={`text-lg font-semibold tabular-nums ${needsRetryCount > 0 ? "text-amber-400" : "text-gray-700"}`}>
              {needsRetryCount}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">Retry</div>
          </div>
        </div>

        {/* Streak */}
        <div className="mt-3 pt-3 border-t border-gray-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">This week</span>
            <span className="text-[10px] text-gray-600">{streakDays}d streak</span>
          </div>
          <div className="flex gap-1">
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-1.5 rounded-full ${
                  i < streakDays
                    ? i === streakDays - 1
                      ? "bg-cyan-400 ring-1 ring-cyan-400/40 ring-offset-1 ring-offset-gray-900"
                      : "bg-cyan-500/60"
                    : "bg-gray-800"
                }`} />
                <span className="text-[9px] text-gray-700">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Batch progress (sidebar) */}
      {batchSections.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">My Batches</span>
            <button onClick={() => navigate("/batches")} className="text-[10px] text-gray-600 hover:text-cyan-400 transition">
              All →
            </button>
          </div>
          <div className="space-y-3">
            {batchSections.map(({ batch, quizzes }) => {
              const att   = quizzes.filter(q => q.attempted).length
              const total = quizzes.length
              const pct   = total > 0 ? Math.round((att / total) * 100) : 0
              return (
                <div key={batch.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-gray-400 truncate flex-1 mr-2">{batch.name}</span>
                    <span className="text-[10px] text-gray-600 tabular-nums shrink-0">{att}/{total}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-purple-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider block mb-2.5">Quick links</span>
        <div className="space-y-0.5">
          {[
            { label: "History",   path: "/history",   color: "text-cyan-400"   },
            { label: "Bookmarks", path: "/bookmarks", color: "text-amber-400"  },
            { label: "Batches",   path: "/batches",   color: "text-purple-400" },
          ].map(({ label, path, color }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-800/60 transition group"
            >
              <span className={`text-xs font-medium ${color}`}>{label}</span>
              <ChevronRight size={11} className="text-gray-700 group-hover:text-gray-500 transition" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENT
// ─────────────────────────────────────────────────────────────────────────────

function AnnouncementBanner({ ann, onDismiss }) {
  const cfg = {
    warning: { wrap: "bg-amber-500/8 border-amber-500/20",    dot: "bg-amber-400",   text: "text-amber-200"   },
    success: { wrap: "bg-emerald-500/8 border-emerald-500/20", dot: "bg-emerald-400", text: "text-emerald-200" },
    urgent:  { wrap: "bg-rose-500/8 border-rose-500/20",      dot: "bg-rose-400",    text: "text-rose-200"    },
    info:    { wrap: "bg-blue-500/8 border-blue-500/20",      dot: "bg-blue-400",    text: "text-blue-200"    },
  }
  const c = cfg[ann.type] || cfg.info
  return (
    <div className={`border rounded-xl flex items-start gap-2.5 px-3.5 py-2.5 ${c.wrap}`}>
      {ann.pinned && <span className="text-[11px] shrink-0 mt-0.5">📌</span>}
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${c.dot}`} />
      <p className={`flex-1 text-xs leading-relaxed ${c.text}`}>{ann.message}</p>
      <button onClick={() => onDismiss(ann.id)} className={`shrink-0 ${c.text} opacity-40 hover:opacity-80 transition ml-1`}>
        <X size={11} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BUCKET HEADER (inside a card)
// ─────────────────────────────────────────────────────────────────────────────

function BucketHeader({ icon: Icon, label, count, colorClass }) {
  return (
    <div className={`flex items-center gap-1.5 px-4 py-2 border-y border-gray-800/50 bg-gray-950/30 ${colorClass}`}>
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
  const DIFF = { easy: "text-emerald-500", medium: "text-amber-500", hard: "text-rose-500" }
  const added = addedAgo(quiz.createdAt)
  return (
    <button
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors text-left group"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-gray-700 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-300 truncate group-hover:text-white transition-colors leading-tight">{quiz.title}</p>
        <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
          <span className="text-[11px] text-gray-700">
            {quiz.questionCount || 0}Q · {quiz.totalTime || 10}m
            {quiz.negativeMark > 0 && <span className="text-rose-700/70 ml-1">−{quiz.negativeMark}</span>}
          </span>
          {added && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-700">
              <CalendarDays size={9} />{added}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[10px] font-semibold shrink-0 capitalize ${DIFF[quiz.difficulty] || DIFF.medium}`}>
        {quiz.difficulty || "Med"}
      </span>
      <span className="text-[11px] font-semibold text-purple-400 flex items-center gap-0.5 shrink-0 group-hover:gap-1.5 transition-all whitespace-nowrap">
        Start <ChevronRight size={11} />
      </span>
    </button>
  )
}

function RowRetry({ quiz, bestScore, attemptCount, lastAttemptAt, batchId, navigate }) {
  return (
    <button
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-500/5 transition-colors text-left group"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white truncate leading-tight">{quiz.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-gray-700">{attemptCount} {attemptCount === 1 ? "attempt" : "attempts"}</span>
          {lastAttemptAt && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-700">
              <Clock size={9} />{timeAgo(lastAttemptAt)}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[11px] font-semibold rounded px-1.5 py-0.5 shrink-0 ${scoreBadge(bestScore)}`}>
        {bestScore}%
      </span>
      <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1 shrink-0 group-hover:gap-1.5 transition-all whitespace-nowrap">
        <RotateCcw size={10} /> Retry
      </span>
    </button>
  )
}

function RowDone({ quiz, bestScore, attemptCount, rank, lastAttemptAt, batchId, navigate }) {
  return (
    <button
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/25 transition-colors text-left group"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600/60 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-500 truncate leading-tight group-hover:text-gray-300 transition-colors">{quiz.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {rank && <span className="text-[10px] text-gray-700">#{rank} rank</span>}
          <span className="text-[10px] text-gray-700">{attemptCount} {attemptCount === 1 ? "attempt" : "attempts"}</span>
          {lastAttemptAt && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-700">
              <Clock size={9} />{timeAgo(lastAttemptAt)}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[11px] font-semibold rounded px-1.5 py-0.5 shrink-0 ${scoreBadge(bestScore)}`}>
        {bestScore}%
      </span>
      <ChevronRight size={11} className="text-gray-700 group-hover:text-gray-400 transition shrink-0" />
    </button>
  )
}

function ShowMore({ open, setOpen, total, shown }) {
  if (total <= shown) return null
  return (
    <button
      onClick={() => setOpen(o => !o)}
      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-gray-700 hover:text-gray-400 hover:bg-gray-800/30 transition border-t border-gray-800/30"
    >
      <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      {open ? "Show less" : `Show ${total - shown} more completed`}
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Batch header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
          <GraduationCap size={13} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-white truncate leading-tight">{batch.name}</h2>
          <p className="text-[10px] text-gray-600 mt-0.5">{totalCount} quizzes</p>
        </div>
        <button onClick={() => navigate("/batches")} className="text-[10px] text-gray-600 hover:text-purple-400 transition shrink-0 whitespace-nowrap">
          Details →
        </button>
      </div>

      {/* Progress */}
      <div className="px-4 pb-3.5 flex items-center gap-2.5">
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-cyan-500" : "bg-purple-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-700 tabular-nums shrink-0">{doneCount}/{totalCount}</span>
        {avg !== null && (
          <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${scoreColor(avg)}`}>avg {avg}%</span>
        )}
      </div>

      {/* 1. UP NEXT */}
      {upNext.length > 0 && (
        <>
          <BucketHeader icon={Zap} label="Up next" count={upNext.length} colorClass="text-cyan-500" />
          <div className="divide-y divide-gray-800/30">
            {upNext.map(({ quiz }) => (
              <RowUpNext key={quiz.id} quiz={quiz} batchId={batch.id} navigate={navigate} />
            ))}
          </div>
        </>
      )}

      {/* 2. NEEDS ATTENTION */}
      {needsRetry.length > 0 && (
        <>
          <BucketHeader icon={AlertTriangle} label="Needs attention" count={needsRetry.length} colorClass="text-amber-500" />
          <div className="divide-y divide-gray-800/30">
            {needsRetry.map(({ quiz, bestScore, attemptCount, lastAttemptAt }) => (
              <RowRetry key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} lastAttemptAt={lastAttemptAt} batchId={batch.id} navigate={navigate} />
            ))}
          </div>
        </>
      )}

      {/* 3. COMPLETED */}
      {done.length > 0 && (
        <>
          <BucketHeader icon={CheckCircle2} label="Completed" count={done.length} colorClass="text-gray-600" />
          <div className="divide-y divide-gray-800/20">
            {(doneOpen ? done : done.slice(0, PREVIEW)).map(({ quiz, bestScore, attemptCount, rank, lastAttemptAt }) => (
              <RowDone key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} rank={rank} lastAttemptAt={lastAttemptAt} batchId={batch.id} navigate={navigate} />
            ))}
          </div>
          <ShowMore open={doneOpen} setOpen={setDoneOpen} total={done.length} shown={PREVIEW} />
        </>
      )}

      {/* All done */}
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
// FREE SECTION CARD
// ─────────────────────────────────────────────────────────────────────────────

function FreeCard({ upNext, done, navigate }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const PREVIEW = 3
  if (upNext.length === 0 && done.length === 0) return null
  const total = upNext.length + done.length
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <Globe size={13} className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-white leading-tight">Free Quizzes</h2>
          <p className="text-[10px] text-gray-600 mt-0.5">Open to all students</p>
        </div>
        <span className="text-[10px] text-gray-700 tabular-nums shrink-0">{done.length}/{total}</span>
      </div>

      <div className="px-4 pb-3.5">
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-cyan-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {upNext.length > 0 && (
        <>
          <BucketHeader icon={BookOpen} label="Available" count={upNext.length} colorClass="text-cyan-500" />
          <div className="divide-y divide-gray-800/30">
            {upNext.map(q => <RowUpNext key={q.id} quiz={q} batchId={null} navigate={navigate} />)}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <BucketHeader icon={CheckCircle2} label="Completed" count={done.length} colorClass="text-gray-600" />
          <div className="divide-y divide-gray-800/20">
            {(doneOpen ? done : done.slice(0, PREVIEW)).map(({ quiz, bestScore, attemptCount, rank, lastAttemptAt }) => (
              <RowDone key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} rank={rank} lastAttemptAt={lastAttemptAt} batchId={null} navigate={navigate} />
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

  // ── DATA FETCH (same Firestore reads as original) ──────────────────────────
  useEffect(() => {
    if (!currentUser) return

    function runPhase2(allQuizzes) {
      try {
        const published = allQuizzes.filter(isPublished)
        setFreeQuizzes(published.filter(q => q.isFree === true))
        setPhase2Done(true)
      } catch (e) {
        console.error("Phase 2 error:", e)
        setPhase2Done(true)
      }
    }

    async function phase1() {
      try {
        const [allQuizzes, announceData, attSnap] = await Promise.all([
          cachedGetDocs(
            "quizSets",
            collection(db, "quizSets"),
            { ttl: TTL_LONG, revalidate: true, onUpdate: (fresh) => runPhase2(fresh) }
          ),
          cachedGetDocs(
            "query:announcements",
            query(collection(db, "announcements"), where("active", "==", true)),
            { ttl: TTL_LONG, revalidate: true, onUpdate: (fresh) => setAnnouncements(fresh) }
          ).catch(() => []),
          cachedGetDocs(
            "myAttempts:" + currentUser.uid,
            query(collection(db, "quizAttempts"), where("userId", "==", currentUser.uid)),
            { ttl: TTL_SHORT }
          ),
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
            cachedGetDocs(
              batchKey,
              query(collection(db, "batches"), where("__name__", "in", userBatchIds.slice(0, 30))),
              { ttl: TTL_SHORT, revalidate: true }
            ),
            cachedGetDocs(
              bqKey,
              query(collection(db, "batchQuizzes"), where("batchId", "in", userBatchIds.slice(0, 30))),
              { ttl: TTL_SHORT, revalidate: true }
            ),
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
                return {
                  quiz,
                  attempted: !!stats,
                  bestScore: stats?.best ?? null,
                  rank: rankFor(quiz.id),
                  attemptCount: stats?.count ?? 0,
                  lastAttemptAt: stats?.lastAt ?? null,
                }
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
        console.error("Phase 1 error:", e)
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
  const { totalAttempted, avgScore, needsRetryCount, streakDays } = useMemo(() => {
    const uniq = new Set(allAttempts.map(a => a.quizId))
    const firstAttempts = allAttempts.filter(a => (a.attemptNumber ?? 1) === 1)
    const avgScore = firstAttempts.length > 0
      ? Math.round(firstAttempts.reduce((s, a) => s + (a.score / (a.maxScore || a.totalQ || 1)) * 100, 0) / firstAttempts.length)
      : null

    let needsRetryCount = 0
    for (const { quizzes } of batchSections) {
      needsRetryCount += quizzes.filter(q => q.attempted && q.bestScore < 70).length
    }

    const today = new Date()
    const dow = today.getDay()
    let streakDays = 0
    for (let i = 0; i <= dow; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toDateString()
      const hit = allAttempts.some(a => {
        if (!a.submittedAt) return false
        const ad = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt)
        return ad.toDateString() === key
      })
      if (hit) streakDays++
      else if (i > 0) break
    }

    return { totalAttempted: uniq.size, avgScore, needsRetryCount, streakDays }
  }, [allAttempts, batchSections])

  // ── FILTER HELPERS ─────────────────────────────────────────────────────────
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

  const attemptedFreeIds  = new Set(attemptedFree.map(a => a.quiz.id))
  const freeUpNextRaw     = freeQuizzes.filter(q => !attemptedFreeIds.has(q.id) && matchSearch(q.title, q.category))
  const freeDoneRaw       = attemptedFree.filter(({ quiz }) => matchSearch(quiz.title, quiz.category))
  const filteredFreeUpNext = activeTab === "completed" ? [] : freeUpNextRaw
  const filteredFreeDone   = activeTab === "pending"   ? [] : freeDoneRaw

  const visibleAnn = announcements
    .filter(a => !dismissedIds.includes(a.id) && !(a.expiresAt && new Date(a.expiresAt) < new Date()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  const isEmpty = phase2Done && freeQuizzes.length === 0 && attemptedFree.length === 0 && batchSections.length === 0

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/*
        Full-width container up to screen-xl (1280px).
        lg+ → 2 columns: sticky 272px sidebar + scrollable main area
        < lg → single column, hero panel shown above content
      */}
      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-5 pb-24 sm:pb-8">
        <div className="flex gap-5 items-start">

          {/* ── STICKY SIDEBAR (desktop only) ───────────────────────────────── */}
          <aside className="hidden lg:block w-68 shrink-0 sticky top-[72px]" style={{ width: "272px" }}>
            {phase1Done
              ? <HeroPanel
                  currentUser={currentUser}
                  totalAttempted={totalAttempted}
                  avgScore={avgScore}
                  needsRetryCount={needsRetryCount}
                  streakDays={streakDays}
                  batchSections={batchSections}
                  navigate={navigate}
                />
              : <div className="space-y-3">
                  <div className="h-52 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />
                  <div className="h-28 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />
                </div>
            }
          </aside>

          {/* ── MAIN CONTENT AREA ───────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 space-y-3">

            {/* Mobile hero (shows above on small screens) */}
            {phase1Done && (
              <div className="lg:hidden">
                <HeroPanel
                  currentUser={currentUser}
                  totalAttempted={totalAttempted}
                  avgScore={avgScore}
                  needsRetryCount={needsRetryCount}
                  streakDays={streakDays}
                  batchSections={batchSections}
                  navigate={navigate}
                />
              </div>
            )}

            {/* Announcements */}
            {visibleAnn.map(ann => (
              <AnnouncementBanner key={ann.id} ann={ann} onDismiss={dismissAnnouncement} />
            ))}

            {/* Search bar */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search quizzes…"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-8 pr-8 py-2.5 text-sm text-white placeholder-gray-700 focus:border-gray-700 focus:outline-none transition"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Tab pills */}
            <div className="flex gap-2">
              {[
                { key: "all",       label: "All" },
                { key: "pending",   label: "Pending" },
                { key: "completed", label: "Completed" },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`text-xs font-semibold px-4 py-1.5 rounded-full border transition ${
                    activeTab === tab.key
                      ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                      : "bg-transparent border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Skeleton state */}
            {!phase1Done ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                {/* BATCH CARDS — Order inside: Up Next → Needs Attention → Completed */}
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
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      upNext={upNext}
                      needsRetry={needsRetry}
                      done={done}
                      doneCount={doneCount}
                      totalCount={filtered.length}
                      avg={avg}
                      navigate={navigate}
                    />
                  )
                })}

                {/* FREE QUIZZES */}
                {!phase2Done ? (
                  <SkeletonCard />
                ) : (
                  <FreeCard
                    upNext={filteredFreeUpNext}
                    done={filteredFreeDone}
                    navigate={navigate}
                  />
                )}

                {/* EMPTY STATE */}
                {isEmpty && (
                  <div className="text-center py-20">
                    <div className="text-5xl mb-4">🎯</div>
                    <h3 className="text-base font-semibold text-white mb-1">No quizzes yet</h3>
                    <p className="text-sm text-gray-600">Your admin hasn't published any quizzes yet.</p>
                  </div>
                )}
              </>
            )}
          </main>

        </div>
      </div>
    </div>
  )
}
