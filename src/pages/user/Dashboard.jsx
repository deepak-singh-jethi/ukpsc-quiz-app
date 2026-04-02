import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, query, where } from "firebase/firestore"
import { cachedGetDocs, TTL_LONG, TTL_SHORT } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import QuizCard from "../../components/QuizCard"
import {
  Search, X, Trophy,
  GraduationCap, BookOpen, Globe,
  AlertTriangle, ChevronRight, ChevronDown, Zap, CheckCircle2, RotateCcw
} from "lucide-react"

function isNew(quiz) {
  if (!quiz.createdAt) return false
  return (new Date() - new Date(quiz.createdAt)) < 7 * 24 * 60 * 60 * 1000
}

// ── Skeleton components ─────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-gray-800 rounded-xl" />
        <div className="w-16 h-5 bg-gray-800 rounded-full" />
      </div>
      <div className="h-4 bg-gray-800 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-800 rounded w-1/2 mb-4" />
      <div className="h-3 bg-gray-800 rounded w-full" />
    </div>
  )
}

function SkeletonSection({ count = 4 }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-8 bg-gray-800 rounded-full animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </section>
  )
}

// ── Score ring SVG ────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 36 }) {
  const r = 14, cx = 18, cy = 18
  const circ = 2 * Math.PI * r
  const dash  = ((score || 0) / 100) * circ
  const color = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "#f87171"
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" />
      <text x="18" y="22" textAnchor="middle" fontSize="8" fontWeight="800" fill={color}>{score}%</text>
    </svg>
  )
}

// ── Compact row for "Up Next" quizzes ─────────────────────────────────────────
function QuizRow({ quiz, batchId, navigate }) {
  const DIFF = { easy: "text-green-400", medium: "text-yellow-400", hard: "text-red-400" }
  return (
    <div
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-800/60 bg-gray-900/40 hover:border-cyan-500/30 hover:bg-gray-900/80 cursor-pointer transition-all group"
    >
      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
        <BookOpen size={13} className="text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">{quiz.title}</p>
        <p className="text-[11px] text-gray-600 mt-0.5">
          {quiz.questionCount || 0}Q · {quiz.totalTime || 10}m
          {quiz.negativeMark > 0 && <span className="text-red-600 ml-1.5">-{quiz.negativeMark}</span>}
        </p>
      </div>
      <span className={`text-[10px] font-bold capitalize shrink-0 ${DIFF[quiz.difficulty] || DIFF.medium}`}>
        {quiz.difficulty || "medium"}
      </span>
      <span className="text-cyan-400 text-xs font-semibold flex items-center gap-0.5 shrink-0 group-hover:gap-1.5 transition-all">
        Start <ChevronRight size={12} />
      </span>
    </div>
  )
}

// ── Compact row for "Done" quizzes ────────────────────────────────────────────
function DoneRow({ quiz, bestScore, attemptCount, rank, batchId, navigate }) {
  return (
    <div
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-800/40 bg-gray-900/20 hover:border-gray-700 hover:bg-gray-900/60 cursor-pointer transition-all group"
    >
      <ScoreRing score={bestScore} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 truncate group-hover:text-white transition-colors">{quiz.title}</p>
        <p className="text-[11px] text-gray-600 mt-0.5">{attemptCount} {attemptCount === 1 ? "attempt" : "attempts"}{rank ? ` · #${rank} rank` : ""}</p>
      </div>
      <span className="text-gray-600 text-xs flex items-center gap-0.5 shrink-0 group-hover:text-gray-400 transition-all">
        View <ChevronRight size={12} />
      </span>
    </div>
  )
}

// ── Needs Retry card ──────────────────────────────────────────────────────────
function RetryRow({ quiz, bestScore, attemptCount, batchId, navigate }) {
  return (
    <div
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ""}`)}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/8 cursor-pointer transition-all group"
    >
      <ScoreRing score={bestScore} size={34} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{quiz.title}</p>
        <p className="text-[11px] text-amber-400/60 mt-0.5">{attemptCount} {attemptCount === 1 ? "attempt" : "attempts"} · needs improvement</p>
      </div>
      <span className="text-amber-400 text-xs font-semibold flex items-center gap-0.5 shrink-0 group-hover:gap-1.5 transition-all">
        <RotateCcw size={11} /> Retry
      </span>
    </div>
  )
}

// ── BatchSection ──────────────────────────────────────────────────────────────
function BatchSection({ batch, needsRetry, upNext, done, totalCount, doneCount, pct, avgScore, hasFilters, navigate }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const DONE_PREVIEW = 4

  if (totalCount === 0 && hasFilters) return null

  return (
    <section className="mb-8">
      {/* ── Command strip ── */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <GraduationCap size={15} className="text-purple-400 shrink-0" />
          <h2 className="text-base font-bold text-white flex-1 min-w-0 truncate">{batch.name}</h2>
          <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold shrink-0">Batch</span>
          <button onClick={() => navigate("/batches")} className="text-xs text-gray-600 hover:text-purple-400 transition shrink-0">
            Details →
          </button>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-cyan-500" : "bg-purple-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0 tabular-nums">{doneCount}/{totalCount} done</span>
          {avgScore !== null && (
            <span className={`text-xs font-bold shrink-0 tabular-nums ${avgScore >= 80 ? "text-emerald-400" : avgScore >= 60 ? "text-amber-400" : "text-rose-400"}`}>
              avg {avgScore}%
            </span>
          )}
          {needsRetry.length > 0 && (
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1 shrink-0">
              <AlertTriangle size={11} /> {needsRetry.length} need retry
            </span>
          )}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-600 text-sm">No quizzes assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── ① Needs Attention ── */}
          {needsRetry.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertTriangle size={12} className="text-amber-400" />
                <span className="text-xs font-black uppercase tracking-widest text-amber-400/80">Needs Attention</span>
                <span className="text-[10px] text-amber-400/40 font-bold bg-amber-500/10 border border-amber-500/15 px-1.5 py-0.5 rounded-full">{needsRetry.length}</span>
              </div>
              <div className="space-y-1.5">
                {needsRetry.map(({ quiz, bestScore, attemptCount }) => (
                  <RetryRow key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} batchId={batch.id} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* ── ② Up Next ── */}
          {upNext.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap size={12} className="text-cyan-400" />
                <span className="text-xs font-black uppercase tracking-widest text-cyan-400/80">Up Next</span>
                <span className="text-[10px] text-cyan-400/40 font-bold bg-cyan-500/10 border border-cyan-500/15 px-1.5 py-0.5 rounded-full">{upNext.length}</span>
              </div>
              <div className="space-y-1.5">
                {upNext.map(({ quiz }) => (
                  <QuizRow key={quiz.id} quiz={quiz} batchId={batch.id} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* ── ③ Completed ── */}
          {done.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <CheckCircle2 size={12} className="text-gray-500" />
                <span className="text-xs font-black uppercase tracking-widest text-gray-600">Completed</span>
                <span className="text-[10px] text-gray-600 font-bold bg-gray-800 border border-gray-700/50 px-1.5 py-0.5 rounded-full">{done.length}</span>
              </div>
              <div className="space-y-1.5">
                {(doneOpen ? done : done.slice(0, DONE_PREVIEW)).map(({ quiz, bestScore, attemptCount, rank }) => (
                  <DoneRow key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} rank={rank} batchId={batch.id} navigate={navigate} />
                ))}
              </div>
              {done.length > DONE_PREVIEW && (
                <button
                  onClick={() => setDoneOpen(o => !o)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-800/60 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-700 transition">
                  <ChevronDown size={12} className={`transition-transform ${doneOpen ? "rotate-180" : ""}`} />
                  {doneOpen ? "Show less" : `Show ${done.length - DONE_PREVIEW} more completed`}
                </button>
              )}
            </div>
          )}

          {/* All done — celebration state */}
          {upNext.length === 0 && needsRetry.length === 0 && done.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <Trophy size={14} className="text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-400/80 font-medium">All quizzes completed with good scores!</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── FreeSection ───────────────────────────────────────────────────────────────
function FreeSection({ upNext, done, hasFilters, navigate }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const DONE_PREVIEW = 4

  if (upNext.length === 0 && done.length === 0) return null

  const doneCount  = done.length
  const totalCount = upNext.length + doneCount

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Globe size={15} className="text-cyan-400 shrink-0" />
          <h2 className="text-base font-bold text-white flex-1">Free Quizzes</h2>
          <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold shrink-0">Open</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-cyan-500 transition-all duration-700"
              style={{ width: `${totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%` }} />
          </div>
          <span className="text-xs text-gray-500 shrink-0 tabular-nums">{doneCount}/{totalCount} done</span>
        </div>
      </div>

      <div className="space-y-5">
        {upNext.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Zap size={12} className="text-cyan-400" />
              <span className="text-xs font-black uppercase tracking-widest text-cyan-400/80">Available</span>
              <span className="text-[10px] text-cyan-400/40 font-bold bg-cyan-500/10 border border-cyan-500/15 px-1.5 py-0.5 rounded-full">{upNext.length}</span>
            </div>
            <div className="space-y-1.5">
              {upNext.map(q => (
                <QuizRow key={q.id} quiz={q} batchId={null} navigate={navigate} />
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <CheckCircle2 size={12} className="text-gray-500" />
              <span className="text-xs font-black uppercase tracking-widest text-gray-600">Completed</span>
              <span className="text-[10px] text-gray-600 font-bold bg-gray-800 border border-gray-700/50 px-1.5 py-0.5 rounded-full">{done.length}</span>
            </div>
            <div className="space-y-1.5">
              {(doneOpen ? done : done.slice(0, DONE_PREVIEW)).map(({ quiz, bestScore, attemptCount, rank }) => (
                <DoneRow key={quiz.id} quiz={quiz} bestScore={bestScore} attemptCount={attemptCount} rank={rank} batchId={null} navigate={navigate} />
              ))}
            </div>
            {done.length > DONE_PREVIEW && (
              <button
                onClick={() => setDoneOpen(o => !o)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-800/60 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-700 transition">
                <ChevronDown size={12} className={`transition-transform ${doneOpen ? "rotate-180" : ""}`} />
                {doneOpen ? "Show less" : `Show ${done.length - DONE_PREVIEW} more completed`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { currentUser, userProfile } = useAuth()
  const navigate = useNavigate()

  // ── Phase 1 state (fast — user-specific data) ──
  const [batchSections, setBatchSections]   = useState([])
  const [attemptedFree, setAttemptedFree]   = useState([])
  const [announcements, setAnnouncements]   = useState([])
  const [phase1Done, setPhase1Done]         = useState(false)

  // ── Phase 2 state (background — free quizzes) ──
  const [freeQuizzes, setFreeQuizzes]       = useState([])
  const [categories, setCategories]         = useState([])
  const [phase2Done, setPhase2Done]         = useState(false)

  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]") } catch { return [] }
  })

  const [search, setSearch]             = useState("")
  const [diffFilter, setDiffFilter]     = useState("all")
  const [catFilter, setCatFilter]       = useState("all")
  const [activeSection, setActiveSection] = useState("all")

  const loading = !phase1Done  // show skeleton until phase 1 done

  useEffect(() => {
    if (!currentUser) return

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 1: Fetch user-specific data — batches + attempts + announcements
    // These are cheap reads (small collections filtered by userId).
    // quizSets served from localStorage cache (instant on refresh).
    // ────────────────────────────────────────────────────────────────────────
    async function phase1() {
      try {
        const now = new Date()

        // Fix 1+3: removed getDocs(batches) from this parallel block.
        // userProfile.batchIds (from AuthContext onSnapshot, already in memory) tells
        // us which batches the user belongs to — zero extra reads.
        const [allQuizzes, announceData, attSnap] = await Promise.all([
          cachedGetDocs(
            "quizSets",
            collection(db, "quizSets"),
            {
              ttl: TTL_LONG,
              revalidate: true,
              onUpdate: (freshQuizzes) => runPhase2(freshQuizzes, currentUser.uid),
            }
          ),
          // Fix 4: announcements cached 10 min in localStorage (they rarely change).
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

        const myAttempts = attSnap
        const attemptedIds = new Set(myAttempts.map(a => a.quizId))

        function statsFor(quizId) {
          const mine = myAttempts.filter(a => a.quizId === quizId)
          if (mine.length === 0) return null
          return {
            best: Math.round(Math.max(...mine.map(a => (a.score / (a.maxScore || a.totalQ)) * 100))),
            count: mine.length,
          }
        }
        function rankFor(quizId) {
          const first = myAttempts.find(a => a.quizId === quizId && (a.attemptNumber ?? 1) === 1)
          return first?.rank || null
        }

        const published = allQuizzes.filter(q => {
          if (q.status === "published") return true
          if (q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= now) return true
          return false
        })

        // ── Fix 1+3: membership from userProfile.batchIds — zero reads ─────
        // batchIds written atomically on add/remove (Fix 1). Already in memory
        // via AuthContext onSnapshot. No getDocs(batches), no N getDoc calls.
        // Fall back gracefully for users added before this fix was deployed.
        const userBatchIds = userProfile?.batchIds || []

        const sections = []
        if (userBatchIds.length > 0) {
          const CHUNK = 30
          const chunks = []
          for (let i = 0; i < userBatchIds.length; i += CHUNK) {
            chunks.push(userBatchIds.slice(i, i + CHUNK))
          }

          // Sprint 3 Fix A: cache batch docs + batchQuizzes with 60s TTL.
          // Key includes a sorted snapshot of the user's batchIds so the cache
          // correctly misses when their batch membership changes.
          const batchKey   = `batches:${[...userBatchIds].sort().join(",")}`
          const bqKey      = `batchQuiz:${[...userBatchIds].sort().join(",")}`

          const [allBatchDocs, allBatchQuizDocs] = await Promise.all([
            cachedGetDocs(
              batchKey,
              // Firestore __name__ trick: fetch docs by their IDs without N getDoc calls
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
            // Fix 6: double-check via batch.memberIds (O(1), no extra read).
            // Accept if either source confirms membership (graceful migration).
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
                }
              })
              .filter(Boolean)
            sections.push({ batch, quizzes })
          }
        }
        setBatchSections(sections)

        // ── Attempted free quizzes ────────────────────────────────────────
        const triedFree = []
        const processedIds = new Set()
        for (const quizId of attemptedIds) {
          if (processedIds.has(quizId)) continue
          const quizMeta = published.find(q => q.id === quizId)
          if (!quizMeta?.isFree) continue
          processedIds.add(quizId)
          if (quizMeta) {
            const stats = statsFor(quizId)
            triedFree.push({ quiz: quizMeta, bestScore: stats?.best ?? null, rank: rankFor(quizId), attemptCount: stats?.count ?? 0 })
          }
        }
        setAttemptedFree(triedFree)

        setPhase1Done(true)

        // ── Kick off phase 2 in background (non-blocking) ────────────────
        runPhase2(allQuizzes, currentUser.uid)

      } catch (e) {
        console.error("Phase 1 error:", e)
        setPhase1Done(true)  // show page even on error
      }
    }

    phase1()
  }, [currentUser, userProfile])

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE 2: Derive free quizzes from already-fetched allQuizzes.
  // No extra Firestore reads — just filters the cached list.
  // Called immediately after phase1 and again if stale-while-revalidate fires.
  // ────────────────────────────────────────────────────────────────────────────
  function runPhase2(allQuizzes, uid) {
    try {
      const now = new Date()
      const published = allQuizzes.filter(q => {
        if (q.status === "published") return true
        if (q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= now) return true
        return false
      })

      // FIX: We no longer fetch the full batchQuizzes collection globally.
      // isFree quizzes are explicitly marked, so we can filter without
      // a global batchQuizzes scan — saving hundreds of reads.
      const freePublished = published.filter(q => q.isFree === true)
      const cats = [...new Set(freePublished.map(q => q.category).filter(Boolean))]
      setCategories(cats)
      setFreeQuizzes(freePublished)
      setPhase2Done(true)
    } catch (e) {
      console.error("Phase 2 error:", e)
      setPhase2Done(true)
    }
  }

  function dismissAnnouncement(id) {
    const next = [...dismissedIds, id]
    setDismissedIds(next)
    localStorage.setItem("dismissedAnnouncements", JSON.stringify(next))
  }

  function matchFilters(quiz) {
    const matchSearch = !search ||
      quiz.title?.toLowerCase().includes(search.toLowerCase()) ||
      quiz.category?.toLowerCase().includes(search.toLowerCase())
    const matchDiff = diffFilter === "all" || quiz.difficulty === diffFilter
    const matchCat  = catFilter === "all" || quiz.category === catFilter
    return matchSearch && matchDiff && matchCat
  }

  const hasFilters = search || diffFilter !== "all" || catFilter !== "all"
  const visibleAnn = announcements.filter(a => !dismissedIds.includes(a.id))

  // Derive attempted IDs to filter free quizzes not yet attempted
  const attemptedFreeIds = new Set(attemptedFree.map(a => a.quiz.id))
  const unattemptedFree = freeQuizzes.filter(q => !attemptedFreeIds.has(q.id))

  const shownBatchSections = activeSection === "all"
    ? batchSections
    : batchSections.filter(s => s.batch.id === activeSection)

  const filteredFree          = unattemptedFree.filter(q => matchFilters(q))
  const filteredAttemptedFree = attemptedFree.filter(({ quiz }) => matchFilters(quiz))
  const hasBatches            = batchSections.length > 0

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── ANNOUNCEMENTS ── */}
        {[...visibleAnn]
          .filter(a => !(a.expiresAt && new Date(a.expiresAt) < new Date()))
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
          .map(ann => {
            const cfg =
              ann.type === "warning" ? { bg: "bg-amber-500/10",   border: "border-amber-500/25",   text: "text-amber-200",   icon: "⚠️" } :
              ann.type === "success" ? { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-200", icon: "✅" } :
              ann.type === "urgent"  ? { bg: "bg-rose-500/10",    border: "border-rose-500/25",    text: "text-rose-200",    icon: "🚨" } :
                                       { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    text: "text-cyan-200",    icon: "ℹ️" }
            return (
              <div key={ann.id} className={`mb-3 rounded-2xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
                {ann.pinned && (
                  <div className={`flex items-center gap-1.5 px-4 py-1 border-b ${cfg.border} bg-black/10`}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className={cfg.text}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text} opacity-70`}>Pinned</span>
                  </div>
                )}
                <div className="flex items-start gap-3 px-4 py-3">
                  <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>
                  <p className={`flex-1 text-sm leading-relaxed ${cfg.text}`}>{ann.message}</p>
                  <button onClick={() => dismissAnnouncement(ann.id)}
                    className={`shrink-0 ${cfg.text} opacity-40 hover:opacity-80 transition p-0.5`}>
                    <X size={13}/>
                  </button>
                </div>
              </div>
            )
          })
        }

        {/* ── SEARCH ── */}
        <div className="relative mb-6">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search quizzes..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-gray-700 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition">
              <X size={13} />
            </button>
          )}
        </div>

        {/* ── SKELETON ── */}
        {loading ? (
          <>
            <SkeletonSection count={3} />
            <SkeletonSection count={4} />
          </>
        ) : (
          <>
            {/* ══════════════════════════════════════════
                BATCH SECTIONS
            ══════════════════════════════════════════ */}
            {shownBatchSections.map(({ batch, quizzes }) => {
              const filtered = quizzes.filter(({ quiz }) => matchFilters(quiz))
              if (filtered.length === 0 && hasFilters) return null

              // Separate into three buckets
              const needsRetry = filtered.filter(({ attempted, bestScore }) => attempted && bestScore < 70)
              const upNext     = filtered.filter(({ attempted }) => !attempted)
              const done       = filtered.filter(({ attempted, bestScore }) => attempted && bestScore >= 70)

              const totalCount  = filtered.length
              const doneCount   = filtered.filter(({ attempted }) => attempted).length
              const pct         = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
              const avgScore    = doneCount > 0
                ? Math.round(filtered.filter(({ attempted }) => attempted).reduce((s, { bestScore }) => s + (bestScore || 0), 0) / doneCount)
                : null

              return (
                <BatchSection
                  key={batch.id}
                  batch={batch}
                  needsRetry={needsRetry}
                  upNext={upNext}
                  done={done}
                  totalCount={totalCount}
                  doneCount={doneCount}
                  pct={pct}
                  avgScore={avgScore}
                  hasFilters={hasFilters}
                  navigate={navigate}
                />
              )
            })}

            {/* ══════════════════════════════════════════
                FREE QUIZZES
            ══════════════════════════════════════════ */}
            {(activeSection === "all" || activeSection === "__free__") && (
              !phase2Done ? (
                <SkeletonSection count={4} />
              ) : (
                <>
                  {(filteredFree.length > 0 || filteredAttemptedFree.length > 0) && (
                    <FreeSection
                      upNext={filteredFree}
                      done={filteredAttemptedFree}
                      hasFilters={hasFilters}
                      navigate={navigate}
                    />
                  )}
                </>
              )
            )}

            {/* ── EMPTY STATE ── */}
            {phase2Done && freeQuizzes.length === 0 && attemptedFree.length === 0 && batchSections.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-xl font-bold text-white mb-2">No quizzes yet</h3>
                <p className="text-gray-500">Your admin hasn't published any quizzes yet.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
