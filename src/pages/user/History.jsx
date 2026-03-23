import { useEffect, useState, useMemo } from "react"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, query, where, orderBy, limit } from "firebase/firestore"
import { cachedGetDocs, TTL_SHORT } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import {
  ChevronRight, Trophy, CheckCircle, XCircle,
  Flame, GraduationCap, Globe, Search, X, Calendar,
  ChevronLeft, ChevronDown
} from "lucide-react"
import { useNavigate } from "react-router-dom"


const PAGE_SIZE = 10

// ── date helpers ──────────────────────────────────────────────────────────────
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function todayStart()  { return startOfDay(new Date()) }
function weekStart()   { const d = todayStart(); d.setDate(d.getDate() - 6); return d }

export default function History() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()

  const [attempts,       setAttempts]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [groups,         setGroups]         = useState([])

  // ── filters ──
  const [activeSection,  setActiveSection]  = useState("all")
  const [search,         setSearch]         = useState("")
  const [category,       setCategory]       = useState("all")
  const [topic,          setTopic]          = useState("all")
  const [statusFilter,   setStatusFilter]   = useState("all")   // all | first | pass | fail
  const [dateFilter,     setDateFilter]     = useState("all")   // all | today | week | custom
  const [dateFrom,       setDateFrom]       = useState("")
  const [dateTo,         setDateTo]         = useState("")


  // ── pagination ──
  const [page, setPage] = useState(1)


  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, "quizAttempts"),
          where("userId", "==", currentUser.uid),
          orderBy("date", "desc"),
          limit(200)
        )
        const data = await cachedGetDocs(
          `myAttempts:${currentUser.uid}`,
          q,
          {
            ttl: TTL_SHORT,
            revalidate: true,
            onUpdate: (fresh) => { setAttempts(fresh); buildGroups(fresh) },
          }
        )
        setAttempts(data)
        buildGroups(data)

      } catch (e) { console.error("History load error:", e) }
      setLoading(false)
    }

    function buildGroups(data) {
      const map = {}
      data.forEach(a => {
        const key = a.batchId || "__free__"
        if (!map[key]) map[key] = { batchId: a.batchId || null, batchName: a.batchName || null, attempts: [] }
        map[key].attempts.push(a)
      })
      setGroups(Object.values(map))
    }

    load()
  }, [currentUser])

  // reset page whenever any filter changes
  useEffect(() => { setPage(1) }, [activeSection, search, category, topic, statusFilter, dateFilter, dateFrom, dateTo])

  // ── derived filter options ────────────────────────────────────────────────
  const categories = useMemo(() =>
    [...new Set(attempts.map(a => a.category).filter(Boolean))].sort()
  , [attempts])

  const topics = useMemo(() => {
    const src = category === "all" ? attempts : attempts.filter(a => a.category === category)
    return [...new Set(src.map(a => a.topic).filter(Boolean))].sort()
  }, [attempts, category])

  function handleCategoryChange(val) { setCategory(val); setTopic("all") }

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...attempts]

    // 1. section
    if (activeSection === "__free__") list = list.filter(a => !a.batchId)
    else if (activeSection !== "all") list = list.filter(a => a.batchId === activeSection)

    // 2. status
    if (statusFilter === "first") list = list.filter(a => (a.attemptNumber ?? 1) === 1)

    // 3. category
    if (category !== "all") list = list.filter(a => a.category === category)

    // 4. topic
    if (topic !== "all") list = list.filter(a => a.topic === topic)

    // 5. date
    if (dateFilter === "today") {
      const start = todayStart()
      list = list.filter(a => new Date(a.date) >= start)
    } else if (dateFilter === "week") {
      const start = weekStart()
      list = list.filter(a => new Date(a.date) >= start)
    } else if (dateFilter === "custom" && dateFrom) {
      const from = startOfDay(new Date(dateFrom))
      const to   = dateTo ? new Date(new Date(dateTo).setHours(23,59,59,999)) : new Date()
      list = list.filter(a => { const d = new Date(a.date); return d >= from && d <= to })
    }

    // 6. search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(a => (a.quizTitle || "").toLowerCase().includes(q))
    }

    return list
  }, [attempts, activeSection, statusFilter, category, topic, dateFilter, dateFrom, dateTo, search])

  // ── pagination ────────────────────────────────────────────────────────────
  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage     = Math.min(page, totalPages)
  const paginated    = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasActiveFilters =
    statusFilter !== "all" || category !== "all" || topic !== "all" ||
    search.trim() !== "" || dateFilter !== "all"

  function clearFilters() {
    setStatusFilter("all"); setCategory("all"); setTopic("all")
    setSearch(""); setDateFilter("all"); setDateFrom(""); setDateTo("")
  }

  // ── no longer need STATUS_FILTERS / DATE_FILTERS arrays as chips ──

  // ─────────────────────────────────────────────────────────────────────────────
  function AttemptRow({ a, idx }) {
    const maxScore = a.maxScore || a.totalQ
    const pct      = Math.round((a.score / maxScore) * 100)
    const isFirst  = (a.attemptNumber ?? 1) === 1
    const answers  = a.answers || []
    const corr     = answers.filter(x => x.selected === x.correct).length
    const att      = answers.filter(x => x.selected !== -1 && x.selected != null).length
    const incorr   = att - corr
    const pctColor = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400"
    const pctBg    = pct >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : pct >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-rose-500/10 border-rose-500/20"

    return (
      <button
        onClick={() => navigate(`/attempt/${a.id}`)}
        className="group w-full text-left rounded-xl border border-gray-800/80 bg-gray-900/50 hover:bg-gray-800/60 hover:border-gray-700 transition-all duration-150 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* score badge */}
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center font-black border shrink-0 ${pctBg} ${pctColor}`}>
            <span className="text-sm leading-none">{pct}%</span>
            <span className="text-[10px] opacity-60 mt-0.5">{a.score}/{maxScore}</span>
          </div>

          {/* main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-white font-semibold text-sm truncate">{a.quizTitle || "Quiz"}</p>

              {/* attempt badge */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                isFirst
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "bg-gray-800 text-gray-500 border border-gray-700"
              }`}>
                {isFirst ? "1st" : `Retry #${a.attemptNumber - 1}`}
              </span>

              {/* batch / free badge (only in All view) */}
              {activeSection === "all" && a.batchName && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-0.5 shrink-0">
                  <GraduationCap size={8} /> {a.batchName}
                </span>
              )}
              {activeSection === "all" && !a.batchId && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-gray-800 text-gray-500 border border-gray-700 flex items-center gap-0.5 shrink-0">
                  <Globe size={8} /> Free
                </span>
              )}

              {/* category + topic */}
              {a.category && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800/80 text-gray-500 border border-gray-700/50 shrink-0">
                  {a.category}
                </span>
              )}
              {a.topic && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                  📌 {a.topic}
                </span>
              )}
            </div>

            {/* stat row */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {answers.length > 0 && <>
                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle size={10}/> {corr}</span>
                <span className="flex items-center gap-1 text-rose-600"><XCircle size={10}/> {incorr}</span>
              </>}
              {a.streak > 0 && <span className="flex items-center gap-1 text-orange-600"><Flame size={10}/> {a.streak}</span>}
              <span>{new Date(a.date).toLocaleString()}</span>
            </div>
          </div>



          <ChevronRight size={13} className="text-gray-700 group-hover:text-gray-400 transition-all shrink-0" />
        </div>

        {/* progress bar */}
        <div className="h-0.5 bg-gray-800">
          <div className={`h-full ${pct >= 80 ? "bg-emerald-500/40" : pct >= 60 ? "bg-amber-500/40" : "bg-rose-500/40"}`}
            style={{ width: `${pct}%`, transition: "width 0.5s ease" }} />
        </div>
      </button>
    )
  }

  // ── Pagination controls ───────────────────────────────────────────────────
  function Pagination() {
    if (totalPages <= 1) return null

    // build page numbers with ellipsis
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (safePage > 3) pages.push("…")
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i)
      if (safePage < totalPages - 2) pages.push("…")
      pages.push(totalPages)
    }

    return (
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">
          Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={13} />
          </button>

          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-gray-700 text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold border transition ${
                  p === safePage
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                    : "border-gray-800 text-gray-500 hover:text-white hover:border-gray-600"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Quiz History</h1>
            <p className="text-gray-500 text-sm mt-0.5">Click any attempt to review answers</p>
          </div>
          {filtered.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── Section tabs (batch / free) ── */}
        {groups.some(g => g.batchId) && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setActiveSection("all")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold border transition ${
                activeSection === "all"
                  ? "bg-gray-700 text-white border-gray-600"
                  : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
              }`}
            >
              All
              <span className={`font-black text-[10px] ${activeSection === "all" ? "text-gray-300" : "text-gray-700"}`}>
                {attempts.length}
              </span>
            </button>

            {groups.map(g => (
              <button
                key={g.batchId || "__free__"}
                onClick={() => setActiveSection(g.batchId || "__free__")}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold border transition ${
                  activeSection === (g.batchId || "__free__")
                    ? g.batchId
                      ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                      : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                    : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
                }`}
              >
                {g.batchId ? <GraduationCap size={11} /> : <Globe size={11} />}
                {g.batchId ? (g.batchName || "Batch") : "Free Quizzes"}
                <span className={`font-black text-[10px] ${
                  activeSection === (g.batchId || "__free__")
                    ? g.batchId ? "text-purple-500" : "text-cyan-500"
                    : "text-gray-700"
                }`}>
                  {g.attempts.length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Filter bar ── */}
        {attempts.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 mb-5 space-y-3">

            {/* Single row: Search + all dropdowns + clear */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search quiz name…"
                  className="w-full bg-gray-950 border border-gray-800 text-white text-xs rounded-lg pl-7 pr-7 py-2 focus:outline-none focus:border-gray-600 placeholder-gray-700"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Subject */}
              <div className="relative">
                <select
                  value={category}
                  onChange={e => handleCategoryChange(e.target.value)}
                  className={`appearance-none bg-gray-950 border text-xs rounded-lg pl-3 pr-7 py-2 focus:outline-none cursor-pointer transition ${
                    category !== "all"
                      ? "border-cyan-500/40 text-cyan-300 focus:border-cyan-500/60"
                      : "border-gray-800 text-gray-400 focus:border-gray-600"
                  }`}
                >
                  <option value="all">All Subjects</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              </div>

              {/* Topic — only when topics exist */}
              {topics.length > 0 && (
                <div className="relative">
                  <select
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    className={`appearance-none bg-gray-950 border text-xs rounded-lg pl-3 pr-7 py-2 focus:outline-none cursor-pointer transition ${
                      topic !== "all"
                        ? "border-indigo-500/40 text-indigo-300 focus:border-indigo-500/60"
                        : "border-indigo-500/20 text-indigo-400 focus:border-indigo-500/40"
                    }`}
                  >
                    <option value="all">All Topics</option>
                    {topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-500/50 pointer-events-none" />
                </div>
              )}

              {/* Date */}
              <div className="relative">
                <select
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className={`appearance-none bg-gray-950 border text-xs rounded-lg pl-3 pr-7 py-2 focus:outline-none cursor-pointer transition ${
                    dateFilter !== "all"
                      ? "border-violet-500/40 text-violet-300 focus:border-violet-500/60"
                      : "border-gray-800 text-gray-400 focus:border-gray-600"
                  }`}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="custom">Date Range</option>
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              </div>

              {/* Attempt type */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className={`appearance-none bg-gray-950 border text-xs rounded-lg pl-3 pr-7 py-2 focus:outline-none cursor-pointer transition ${
                    statusFilter !== "all"
                      ? "border-amber-500/40 text-amber-300 focus:border-amber-500/60"
                      : "border-gray-800 text-gray-400 focus:border-gray-600"
                  }`}
                >
                  <option value="all">All Attempts</option>
                  <option value="first">1st Attempts Only</option>
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              </div>

              {/* Clear all */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-rose-400 border border-gray-800 hover:border-rose-500/30 px-2.5 py-2 rounded-lg transition"
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>

            {/* Custom date range inputs — shown below when "Date Range" selected */}
            {dateFilter === "custom" && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Calendar size={12} className="text-violet-500/60 shrink-0" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-gray-950 border border-gray-800 text-xs text-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 cursor-pointer [color-scheme:dark]"
                />
                <span className="text-gray-700 text-xs">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  min={dateFrom}
                  className="bg-gray-950 border border-gray-800 text-xs text-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 cursor-pointer [color-scheme:dark]"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Attempt list ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
            <Trophy size={36} className="mx-auto text-gray-700 mb-3" />
            {attempts.length === 0 ? (
              <>
                <p className="text-gray-400 text-sm">No attempts yet.</p>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="mt-4 flex items-center justify-center gap-2 mx-auto bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-6 py-2.5 rounded-xl transition text-sm"
                >
                  Take a Quiz <ChevronRight size={16} className="-mr-1" />
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm">No attempts match your filters.</p>
                <button onClick={clearFilters} className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition">
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* grouped or flat list */}
            {activeSection === "all" && groups.some(g => g.batchId) ? (
              <div className="space-y-6">
                {groups.map(group => {
                  const rows = paginated.filter(a =>
                    group.batchId ? a.batchId === group.batchId : !a.batchId
                  )
                  if (rows.length === 0) return null
                  return (
                    <div key={group.batchId || "__free__"}>
                      <div className="flex items-center gap-2 mb-3">
                        {group.batchId ? (
                          <>
                            <div className="w-5 h-5 rounded-md bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
                              <GraduationCap size={11} className="text-purple-400" />
                            </div>
                            <p className="text-xs font-bold text-purple-400 uppercase tracking-widest">{group.batchName || "Batch"}</p>
                            <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-full font-semibold">Batch</span>
                          </>
                        ) : (
                          <>
                            <div className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                              <Globe size={11} className="text-cyan-400" />
                            </div>
                            <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Free Quizzes</p>
                            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded-full font-semibold">Open</span>
                          </>
                        )}
                        <span className="text-gray-700 text-xs ml-auto">{rows.length} shown</span>
                      </div>
                      <div className="space-y-2">
                        {rows.map((a, idx) => <AttemptRow key={a.id} a={a} idx={idx} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {paginated.map((a, idx) => <AttemptRow key={a.id} a={a} idx={idx} />)}
              </div>
            )}

            <Pagination />
          </>
        )}

      </div>
    </div>
  )
}