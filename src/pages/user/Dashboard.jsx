import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, query, where } from "firebase/firestore"
import { cachedGetDocs, TTL_LONG, TTL_SHORT } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import QuizCard from "../../components/QuizCard"
import {
  Search, SlidersHorizontal, X, Trophy,
  GraduationCap, BookOpen, Megaphone, Globe
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
      
      

        {/* Announcements — pinned first, then regular */}
        {[...visibleAnn]
          .filter(a => !(a.expiresAt && new Date(a.expiresAt) < new Date())) // hide expired
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

        {/* ── SEARCH + FILTERS ── */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search quizzes..."
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-700 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={13} className="text-gray-600" />
            <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400 focus:outline-none cursor-pointer">
              <option value="all">All Levels</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            {categories.length > 0 && (
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400 focus:outline-none cursor-pointer">
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {hasFilters && (
              <button onClick={() => { setSearch(""); setDiffFilter("all"); setCatFilter("all") }}
                className="text-xs text-gray-500 hover:text-white border border-gray-800 px-2.5 py-2 rounded-xl transition flex items-center gap-1">
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* ── SECTION TABS — rendered as soon as we know batch count ── */}
        {(hasBatches || freeQuizzes.length > 0 || attemptedFree.length > 0) && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setActiveSection("all")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                activeSection === "all"
                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                  : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
              }`}
            >
              <BookOpen size={13} /> All Quizzes
            </button>
            {batchSections.map(s => (
              <button
                key={s.batch.id}
                onClick={() => setActiveSection(s.batch.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                  activeSection === s.batch.id
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
                }`}
              >
                <GraduationCap size={13} /> {s.batch.name}
                <span className={`text-xs font-black ml-0.5 ${activeSection === s.batch.id ? "text-purple-500" : "text-gray-700"}`}>
                  {s.quizzes.length}
                </span>
              </button>
            ))}
            {(freeQuizzes.length > 0 || attemptedFree.length > 0) && (
              <button
                onClick={() => setActiveSection("__free__")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                  activeSection === "__free__"
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
                }`}
              >
                <Globe size={13} /> Free
                <span className={`text-xs font-black ml-0.5 ${activeSection === "__free__" ? "text-cyan-500" : "text-gray-700"}`}>
                  {unattemptedFree.length + attemptedFree.length}
                </span>
              </button>
            )}
          </div>
        )}

        {/* ── PHASE 1 SKELETON — shown until first data arrives ── */}
        {loading ? (
          <>
            <SkeletonSection count={3} />
            <SkeletonSection count={4} />
          </>
        ) : (
          <>
            {/* ── BATCH QUIZ SECTIONS ── */}
            {(activeSection === "all" || batchSections.some(s => s.batch.id === activeSection)) &&
              (activeSection === "all" ? batchSections : shownBatchSections).map(({ batch, quizzes }) => {
              const filtered = quizzes.filter(({ quiz }) => matchFilters(quiz))
              if (filtered.length === 0 && hasFilters) return null
              return (
                <section key={batch.id} className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <GraduationCap size={15} className="text-purple-400" />
                    <h2 className="text-base font-bold text-white">{batch.name}</h2>
                    <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold">Batch</span>
                    <span className="text-xs text-gray-600 ml-1">{filtered.length} quiz{filtered.length !== 1 ? "zes" : ""}</span>
                    <button onClick={() => navigate("/batches")} className="ml-auto text-xs text-gray-600 hover:text-purple-400 transition flex items-center gap-1">
                      Batch details
                    </button>
                  </div>
                  {filtered.length === 0 ? (
                    <div className="border border-dashed border-gray-800 rounded-2xl p-8 text-center">
                      <p className="text-gray-600 text-sm">No quizzes assigned yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filtered.map(({ quiz, attempted, bestScore, rank, attemptCount }) => (
                        <QuizCard key={quiz.id} quiz={quiz} attempted={attempted} bestScore={bestScore} rank={rank} attemptCount={attemptCount} batchId={batch.id} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}

            {/* ── FREE QUIZZES ── Phase 2 shows skeleton until loaded ── */}
            {(activeSection === "all" || activeSection === "__free__") && (
              !phase2Done ? (
                <SkeletonSection count={4} />
              ) : (
                <>
                  {(filteredFree.length > 0 || (!hasFilters && unattemptedFree.length === 0 && attemptedFree.length === 0 && batchSections.length === 0)) && (
                    <section className="mb-10">
                      <div className="flex items-center gap-2 mb-4">
                        <Globe size={14} className="text-cyan-400" />
                        <h2 className="text-base font-bold text-white">Available Quizzes</h2>
                        <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold">{filteredFree.length}</span>
                        <span className="text-xs text-gray-600 ml-1">Free for everyone</span>
                      </div>
                      {filteredFree.length === 0 && !hasFilters ? (
                        <div className="border border-dashed border-gray-800 rounded-2xl p-10 text-center">
                          <Trophy size={32} className="mx-auto text-gray-700 mb-3" />
                          <p className="text-gray-500 text-sm">No new quizzes right now. Check back soon!</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {filteredFree.map(q => (
                            <QuizCard key={q.id} quiz={q} attempted={false} isNew={isNew(q)} />
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {filteredAttemptedFree.length > 0 && (
                    <section className="mb-10">
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen size={14} className="text-gray-400" />
                        <h2 className="text-base font-bold text-white">Attempted Quizzes</h2>
                        <span className="text-xs bg-gray-700 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full font-bold">{filteredAttemptedFree.length}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredAttemptedFree.map(({ quiz, bestScore, rank, attemptCount }) => (
                          <QuizCard key={quiz.id} quiz={quiz} attempted bestScore={bestScore} rank={rank} attemptCount={attemptCount} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )
            )}

            {/* Empty state */}
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