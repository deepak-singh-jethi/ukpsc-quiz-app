import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, query, where, getDocs, doc, deleteDoc, limit } from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import { Bookmark, BookmarkX, ChevronRight, Search, Filter, Tag, Target } from "lucide-react"
import { useNavigate } from "react-router-dom"

export default function Bookmarks() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [bookmarks, setBookmarks] = useState([])
  const [filtered, setFiltered]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [filterQuiz, setFilterQuiz] = useState("all")
  const [expandedIds,   setExpandedIds]   = useState(new Set())
  const [retestMode,    setRetestMode]    = useState(false)
  const [retestAnswers, setRetestAnswers] = useState({})  // key: bookmarkId → chosen option index

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function load() {
    try {
      // Sprint 3 Fix B: localStorage persistence — bookmarks appear instantly on refresh.
      // TTL_LONG (5 min) + revalidate:true means:
      //   - Warm visit: localStorage → shown in ~0ms, background revalidate if > 3 min old
      //   - Cold visit: Firestore fetch → written to localStorage for next time
      //   - After toggle: invalidateCache() wipes localStorage → next load always fresh
      // Sorting is client-side (avoids composite Firestore index requirement).
      const raw = await cachedGetDocs(
        `bookmarks:${currentUser.uid}`,
        query(
          collection(db, "bookmarks"),
          where("userId", "==", currentUser.uid),
          limit(100)
        ),
        {
          ttl: TTL_LONG,
          revalidate: true,
          onUpdate: (fresh) => {
            const sorted = [...fresh].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
            setBookmarks(sorted)
            setFiltered(sorted)
          },
        }
      )
      const data = [...raw].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      setBookmarks(data)
      setFiltered(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [currentUser])

  useEffect(() => {
    let result = bookmarks
    if (search) result = result.filter(b =>
      b.question?.toLowerCase().includes(search.toLowerCase()) ||
      b.quizTitle?.toLowerCase().includes(search.toLowerCase())
    )
    if (filterQuiz !== "all") result = result.filter(b => b.quizTitle === filterQuiz)
    setFiltered(result)
  }, [search, filterQuiz, bookmarks])

  async function removeBookmark(bId) {
    try {
      await deleteDoc(doc(db, "bookmarks", bId))
      setBookmarks(prev => prev.filter(b => b.id !== bId))
      invalidateCache(`query:bookmarks:${currentUser.uid}`)
    } catch (e) { console.error(e) }
  }

  const uniqueQuizzes = [...new Set(bookmarks.map(b => b.quizTitle).filter(Boolean))]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 sm:pb-6">

        {/* Header */}
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6"
          style={{ opacity: 1, transition: "opacity 0.3s ease" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Bookmark size={18} className="text-amber-400" />
              <h1 className="text-2xl font-black text-white tracking-tight">Bookmarks</h1>
            </div>
            <p className="text-gray-500 text-sm">Questions you saved for revision</p>
          </div>
          {bookmarks.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setRetestMode(m => !m); setRetestAnswers({}) }}
                title={retestMode ? "Exit retest mode" : "Reattempt bookmarks without seeing answers"}
                className="flex items-center gap-2.5 shrink-0 pl-3 pr-2.5 py-2 rounded-xl border transition-all duration-200"
                style={{
                  background:  retestMode ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor: retestMode ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.08)",
                  boxShadow:   retestMode ? "0 0 12px rgba(245,158,11,0.15)" : "none",
                }}>
                <span className="text-xs font-bold tracking-wide transition-colors duration-200"
                  style={{ color: retestMode ? "rgb(252,211,77)" : "rgb(107,114,128)" }}>
                  Reattempt
                </span>
                <div
                  className="relative rounded-full transition-all duration-200 shrink-0"
                  style={{
                    width: 34, height: 18,
                    background: retestMode
                      ? "linear-gradient(135deg, #f59e0b, #fbbf24)"
                      : "rgba(255,255,255,0.08)",
                    boxShadow: retestMode ? "inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
                  }}>
                  <div
                    className="absolute top-0.5 rounded-full transition-all duration-200"
                    style={{
                      width: 14, height: 14,
                      background: retestMode ? "#fff" : "rgba(255,255,255,0.35)",
                      left: retestMode ? 16 : 2,
                      boxShadow: retestMode ? "0 1px 4px rgba(0,0,0,0.35)" : "none",
                    }}
                  />
                </div>
              </button>
              <span className="text-xs text-gray-500 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full">
                {bookmarks.length} saved
              </span>
            </div>
          )}
        </div>

        {/* Stats strip */}
        {bookmarks.length > 0 && (
          <div
            className="grid grid-cols-3 gap-3 mb-5"
            style={{ opacity: 1, transition: "opacity 0.3s ease 0.05s" }}
          >
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/6 px-4 py-3">
              <p className="text-2xl font-black text-amber-400 leading-none">{bookmarks.length}</p>
              <p className="text-xs font-semibold text-gray-400 mt-1">Total Saved</p>
            </div>
            <div className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3">
              <p className="text-2xl font-black text-white leading-none">{uniqueQuizzes.length}</p>
              <p className="text-xs font-semibold text-gray-400 mt-1">Quizzes Covered</p>
            </div>
            <div className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3">
              <p className="text-2xl font-black text-cyan-400 leading-none">
                {bookmarks.filter(b => {
                  const d = new Date(b.savedAt)
                  const today = new Date()
                  return d.toDateString() === today.toDateString()
                }).length}
              </p>
              <p className="text-xs font-semibold text-gray-400 mt-1">Saved Today</p>
            </div>
          </div>
        )}

        {/* Search + filter */}
        {bookmarks.length > 0 && (
          <div
            className="flex gap-3 mb-5 flex-wrap"
            style={{ opacity: 1, transition: "opacity 0.3s ease 0.08s" }}
          >
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search bookmarks..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-700 focus:outline-none"
              />
            </div>
            {uniqueQuizzes.length > 1 && (
              <div className="flex items-center gap-2">
                <Filter size={13} className="text-gray-600" />
                <select
                  value={filterQuiz}
                  onChange={e => setFilterQuiz(e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Quizzes</option>
                  {uniqueQuizzes.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start">

          {/* LEFT: bookmark list */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/30 p-16 text-center">
                <Bookmark size={40} className="mx-auto text-gray-700 mb-4" />
                <p className="text-gray-400 font-semibold mb-1">No bookmarks yet</p>
                <p className="text-gray-600 text-sm">Tap the bookmark icon on any question during a quiz or review to save it here.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-10 text-center">
                <p className="text-gray-500 text-sm">No bookmarks match your search.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((b, idx) => (
                  <div
                    key={b.id}
                    className="rounded-2xl border border-gray-800/80 bg-gray-900/60 overflow-hidden"
                    style={{
                      opacity: 1,
                      transform: "translateX(0)",
                      transition: `opacity 0.35s ease ${idx * 0.05}s, transform 0.35s ease ${idx * 0.05}s`,
                    }}
                  >
                    {/* Question header */}
                    <div className="px-5 pt-4 pb-3">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Bookmark size={9} /> Saved
                          </span>
                          {b.quizTitle && (
                            <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Tag size={9} /> {b.quizTitle}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-600">
                            {new Date(b.savedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => removeBookmark(b.id)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition"
                          title="Remove bookmark"
                        >
                          <BookmarkX size={15} />
                        </button>
                      </div>

                        {/* Clickable question header */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleExpand(b.id)}
                        onKeyDown={e => e.key === "Enter" && toggleExpand(b.id)}
                        className="flex items-start gap-3 cursor-pointer group/q"
                      >
                        <p className="text-white font-semibold text-sm leading-relaxed flex-1">{b.question}</p>
                        <span className="shrink-0 mt-0.5 text-gray-600 group-hover/q:text-gray-400 transition-colors">
                          {expandedIds.has(b.id)
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                          }
                        </span>
                      </div>

                      {/* Options — shown when expanded, dual mode */}
                      {expandedIds.has(b.id) && b.options && (() => {
                        const retestSelected = retestAnswers[b.id] ?? null
                        const retestRevealed = retestSelected !== null

                        if (retestMode) {
                          return (
                            <div className="space-y-1.5 mt-3">
                              {!retestRevealed && (
                                <p className="text-[11px] text-amber-400/70 mb-2 flex items-center gap-1.5">
                                  <Target size={10} /> Select your answer
                                </p>
                              )}
                              {b.options.map((opt, k) => {
                                const optText    = typeof opt === "string" ? opt : opt.text || ""
                                const optExpl    = typeof opt === "object" ? opt.explanation : null
                                const isCorrOpt  = k === b.correct
                                const isPickedOpt= k === retestSelected
                                let optStyle = "border border-gray-800 bg-gray-900/60 text-gray-300 hover:border-gray-600 cursor-pointer"
                                let dotStyle = "border-gray-700 text-gray-600"
                                let icon = null
                                if (retestRevealed) {
                                  if (isCorrOpt) {
                                    optStyle = "border border-emerald-500/35 bg-emerald-500/10 text-white"
                                    dotStyle = "border-emerald-500 bg-emerald-500 text-white"
                                    icon = <span className="text-emerald-400 text-[10px] font-bold shrink-0">✓</span>
                                  } else if (isPickedOpt) {
                                    optStyle = "border border-rose-500/35 bg-rose-500/10 text-rose-200"
                                    dotStyle = "border-rose-500 bg-rose-500 text-white"
                                    icon = <span className="text-rose-400 text-[10px] font-bold shrink-0">✗</span>
                                  } else {
                                    optStyle = "border border-transparent text-gray-600"
                                  }
                                }
                                return (
                                  <div key={k}>
                                    <div
                                      onClick={() => { if (!retestRevealed) setRetestAnswers(prev => ({ ...prev, [b.id]: k })) }}
                                      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all ${optStyle}`}
                                    >
                                      <span className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border ${dotStyle}`}>
                                        {["A","B","C","D"][k]}
                                      </span>
                                      <p className="flex-1">{optText}</p>
                                      {icon}
                                    </div>
                                    {retestRevealed && isCorrOpt && optExpl && (
                                      <p className="mt-1 mx-8 text-[10px] text-emerald-600 leading-relaxed">{optExpl}</p>
                                    )}
                                  </div>
                                )
                              })}
                              {retestRevealed && (() => {
                                const origSelected  = b.selected
                                const origIsSkipped = origSelected === -1 || origSelected === undefined || origSelected === null
                                const origLetter    = !origIsSkipped ? ["A","B","C","D"][origSelected] : null
                                const origOpt       = !origIsSkipped && b.options?.[origSelected]
                                const origText      = origOpt ? (typeof origOpt === "string" ? origOpt : origOpt.text) : null
                                return (
                                  <>
                                    <div className={`mt-1 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 ${
                                      retestSelected === b.correct
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-rose-500/10 text-rose-400"
                                    }`}>
                                      {retestSelected === b.correct ? "✓ Correct!" : "✗ Wrong — see correct answer above"}
                                      <button
                                        onClick={() => setRetestAnswers(prev => { const n = {...prev}; delete n[b.id]; return n })}
                                        className="ml-auto text-[10px] opacity-60 hover:opacity-100 underline">
                                        Try again
                                      </button>
                                    </div>
                                    <div className="mt-1 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                                      <span className="shrink-0 text-gray-600">Your original answer:</span>
                                      {origIsSkipped ? (
                                        <span className="italic">Skipped</span>
                                      ) : (
                                        <span className={`font-semibold flex items-center gap-1.5 ${
                                          origSelected === b.correct ? "text-emerald-400" : "text-rose-400"
                                        }`}>
                                          <span className="w-4 h-4 rounded text-[10px] font-black flex items-center justify-center bg-gray-700">{origLetter}</span>
                                          {origText}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                          )
                        }

                        // Review mode (default)
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                            {b.options.map((opt, k) => {
                              const optText    = typeof opt === "string" ? opt : opt.text || ""
                              const optExpl    = typeof opt === "object" ? opt.explanation : null
                              const isCorrect  = k === b.correct
                              const wasSelected= k === b.selected
                              const optStyle   = isCorrect
                                ? "border-emerald-500/40 bg-emerald-500/8 text-emerald-200"
                                : wasSelected && !isCorrect
                                ? "border-rose-500/40 bg-rose-500/8 text-rose-200"
                                : "border-gray-700/50 bg-gray-800/30 text-gray-500"
                              const dotStyle   = isCorrect
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : wasSelected
                                ? "border-rose-500 bg-rose-500 text-white"
                                : "border-gray-700 text-gray-600"
                              return (
                                <div key={k} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${optStyle}`}>
                                  <span className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border ${dotStyle}`}>
                                    {["A","B","C","D"][k]}
                                  </span>
                                  <div className="flex-1">
                                    <p>{optText}</p>
                                    {isCorrect && optExpl && (
                                      <p className="text-emerald-600 text-[10px] mt-1">{optExpl}</p>
                                    )}
                                  </div>
                                  {isCorrect && <span className="text-emerald-400 text-[10px] font-bold shrink-0">✓</span>}
                                  {wasSelected && !isCorrect && <span className="text-rose-400 text-[10px] font-bold shrink-0">✗</span>}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Footer: link to attempt */}
                    {b.attemptId && (
                      <button
                        onClick={() => navigate(`/attempt/${b.attemptId}`)}
                        className="w-full flex items-center justify-between px-5 py-2.5 bg-gray-800/40 border-t border-gray-800/80 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition group"
                      >
                        <span>View full attempt review</span>
                        <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: quiz breakdown sticky */}
          {bookmarks.length > 0 && (
            <div
              className="lg:col-span-1 lg:sticky lg:top-6"
              style={{ opacity: 1, transition: "opacity 0.3s ease 0.1s" }}
            >
              <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4">By Quiz</p>
                <div className="space-y-3">
                  {uniqueQuizzes.map(qTitle => {
                    const count = bookmarks.filter(b => b.quizTitle === qTitle).length
                    const pct   = Math.round((count / bookmarks.length) * 100)
                    return (
                      <div key={qTitle}
                        className="cursor-pointer hover:bg-gray-800/40 rounded-lg px-2 py-1.5 -mx-2 transition"
                        onClick={() => setFilterQuiz(filterQuiz === qTitle ? "all" : qTitle)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-400 truncate flex-1">{qTitle}</p>
                          <span className="text-xs font-black text-amber-400 ml-2">{count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500/50 rounded-full transition-all duration-700"
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}