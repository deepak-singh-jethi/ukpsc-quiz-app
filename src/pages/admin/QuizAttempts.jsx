import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { db } from "../../firebase/config"
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore"
import AdminLayout from "../../components/AdminLayout"
import Leaderboard from "../../components/Leaderboard"
import { ChevronRight, ChevronLeft, Users, CheckCircle, XCircle, MinusCircle, TrendingUp, Download } from "lucide-react"

//  Excel download 
// Uses SheetJS (xlsx) loaded from CDN via dynamic import  -  no bundle overhead
async function downloadQuizReport(quiz, attempts) {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs")

  const pct = (score, max) => max > 0 ? Math.max(0, Math.min(100, Math.round((score / max) * 100))) : 0
  const fmtTime = (secs) => {
    if (secs == null) return "N/A"
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}m ${s.toString().padStart(2,"0")}s`
  }

  // Sort: first by score desc, then by timeTaken asc (less time = better rank)
  // Attempts with no timeTaken sort to the bottom within the same score bucket
  const sorted = [...attempts].sort((a, b) => {
    const aScore = a.score ?? 0
    const bScore = b.score ?? 0
    if (bScore !== aScore) return bScore - aScore
    const aTime = a.timeTaken ?? Infinity
    const bTime = b.timeTaken ?? Infinity
    return aTime - bTime
  })

  const maxScore = quiz?.marksPerQ
    ? (quiz.questionCount || attempts[0]?.totalQ || 0) * (quiz.marksPerQ || 1)
    : (attempts[0]?.maxScore || attempts[0]?.totalQ || 0)

  //  Sheet 1: Leaderboard 
  const lbRows = sorted.map((a, i) => ({
    "Rank":           i + 1,
    "Student Name":   a.userName || "Unknown",
    "Score":          a.score ?? 0,
    "Max Score":      a.maxScore || a.totalQ || maxScore,
    "Percentage (%)": pct(a.score ?? 0, a.maxScore || a.totalQ || maxScore),
    "Time Taken":     fmtTime(a.timeTaken),
    "Time Taken (s)": a.timeTaken ?? "",
    "Attempt #":      a.attemptNumber ?? 1,
    "Streak":         a.streak ?? 0,
    "Tab Switches":   a.tabSwitches ?? 0,
    "Batch":          a.batchName || "",
    "Date":           a.date ? new Date(a.date).toLocaleString("en-IN") : "",
    "Result":         pct(a.score ?? 0, a.maxScore || a.totalQ || maxScore) >= 60 ? "PASS" : "FAIL",
  }))

  //  Sheet 2: First attempts only (for clean leaderboard) 
  const firstOnly = sorted.filter(a => (a.attemptNumber ?? 1) === 1)
  const firstRows = firstOnly.map((a, i) => ({
    "Rank":           i + 1,
    "Student Name":   a.userName || "Unknown",
    "Score":          a.score ?? 0,
    "Max Score":      a.maxScore || a.totalQ || maxScore,
    "Percentage (%)": pct(a.score ?? 0, a.maxScore || a.totalQ || maxScore),
    "Time Taken":     fmtTime(a.timeTaken),
    "Time Taken (s)": a.timeTaken ?? "",
    "Streak":         a.streak ?? 0,
    "Tab Switches":   a.tabSwitches ?? 0,
    "Batch":          a.batchName || "",
    "Date":           a.date ? new Date(a.date).toLocaleString("en-IN") : "",
    "Result":         pct(a.score ?? 0, a.maxScore || a.totalQ || maxScore) >= 60 ? "PASS" : "FAIL",
  }))

  //  Sheet 3: Summary stats 
  const first     = attempts.filter(a => (a.attemptNumber ?? 1) === 1)
  const avgPct    = first.length > 0
    ? Math.round(first.reduce((s, a) => s + pct(a.score ?? 0, a.maxScore || a.totalQ || maxScore), 0) / first.length)
    : 0
  const passCount = first.filter(a => pct(a.score ?? 0, a.maxScore || a.totalQ || maxScore) >= 60).length
  const withTime  = first.filter(a => a.timeTaken != null)
  const avgTime   = withTime.length > 0
    ? Math.round(withTime.reduce((s, a) => s + a.timeTaken, 0) / withTime.length)
    : null

  const summaryRows = [
    { "Metric": "Quiz Title",           "Value": quiz?.title || "Unknown" },
    { "Metric": "Total Attempts",       "Value": attempts.length },
    { "Metric": "Unique Students",      "Value": new Set(attempts.map(a => a.userId)).size },
    { "Metric": "First Attempts",       "Value": first.length },
    { "Metric": "Avg Score (1st att.)", "Value": `${avgPct} / 100 marks` },
    { "Metric": "Pass Rate (>=60%)",    "Value": first.length > 0 ? `${Math.round(passCount / first.length * 100)}%` : "N/A" },
    { "Metric": "Pass Count",           "Value": passCount },
    { "Metric": "Fail Count",           "Value": first.length - passCount },
    { "Metric": "Avg Time Taken",       "Value": fmtTime(avgTime) },
    { "Metric": "Total Time (min)",     "Value": quiz?.totalTime ?? "N/A" },
    { "Metric": "Report Generated",     "Value": new Date().toLocaleString("en-IN") },
  ]

  //  Build workbook 
  const wb  = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(lbRows)
  const ws2 = XLSX.utils.json_to_sheet(firstRows.length ? firstRows : [{ "Note": "No first attempts yet" }])
  const ws3 = XLSX.utils.json_to_sheet(summaryRows)

  // Column widths
  const setWidths = (ws, widths) => { ws["!cols"] = widths.map(w => ({ wch: w })) }
  setWidths(ws1, [6, 25, 8, 10, 14, 12, 14, 10, 8, 12, 18, 22, 8])
  setWidths(ws2, [6, 25, 8, 10, 14, 12, 14, 8, 12, 18, 22, 8])
  setWidths(ws3, [30, 25])

  XLSX.utils.book_append_sheet(wb, ws1, "All Attempts")
  XLSX.utils.book_append_sheet(wb, ws2, "1st Attempts (Leaderboard)")
  XLSX.utils.book_append_sheet(wb, ws3, "Summary")

  const safeTitle = (quiz?.title || "quiz").replace(/[^a-z0-9]/gi, "_").slice(0, 40)
  const datePart  = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${safeTitle}_report_${datePart}.xlsx`)
}

export default function QuizAttempts() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const defaultBatchId = searchParams.get("batchId") || null
  const navigate = useNavigate()
  const [quiz, setQuiz]           = useState(null)
  const [attempts, setAttempts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState("all")
  const [activeTab, setActiveTab] = useState("attempts")
  const [downloading, setDownloading] = useState(false)
  // "overall" | "free" | batchId string
  const [selectedContext, setSelectedContext] = useState(defaultBatchId || "overall")
  const [attemptsPage, setAttemptsPage] = useState(1)
  const ATTEMPTS_PAGE_SIZE = 10

  async function handleDownload() {
    if (!attempts.length) return
    setDownloading(true)
    try {
      await downloadQuizReport(quiz, attempts)
    } catch (e) {
      console.error("Excel export failed:", e)
    }
    setDownloading(false)
  }

  useEffect(() => {
    async function load() {
      try {
        //  Fetch quiz doc and attempts in parallel 
        const [quizSnap, attSnap] = await Promise.all([
          getDoc(doc(db, "quizSets", id)),
          getDocs(query(collection(db, "quizAttempts"), where("quizId", "==", id))),
        ])

        if (quizSnap.exists()) setQuiz({ id: quizSnap.id, ...quizSnap.data() })

        const data = attSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(b.date) - new Date(a.date))

        //  Optimisation: eliminate N+1 user doc reads 
        // userName is stored on each attempt doc at submit time (see Quiz.jsx).
        // We only fall back to /users reads for legacy attempts that pre-date
        // this change, and batch those with Promise.all instead of doing them
        // sequentially (original: await inside a .map with Promise.all, fine).
        const missingIds = [...new Set(data.filter(a => !a.userName).map(a => a.userId))]
        const userMap = {}

        if (missingIds.length > 0) {
          await Promise.all(
            missingIds.map(async uid => {
              try {
                const uSnap = await getDoc(doc(db, "users", uid))
                if (uSnap.exists()) {
                  userMap[uid] = uSnap.data().name || uSnap.data().email || "Unknown"
                }
              } catch {
                userMap[uid] = "Unknown"
              }
            })
          )
        }

        setAttempts(data.map(a => ({
          ...a,
          // Prefer stored userName; only fall back to fetched map for old docs
          userName: a.userName || userMap[a.userId] || "Unknown",
        })))
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [id])


  // Derive available contexts from attempt data
  const batchContexts = (() => {
    const map = {}
    attempts.forEach(a => {
      if (a.batchId && !map[a.batchId]) map[a.batchId] = a.batchName || a.batchId
    })
    return Object.entries(map).map(([bId, name]) => ({ batchId: bId, name }))
  })()
  const hasFreeAttempts = attempts.some(a => !a.batchId && a.leaderboardKey?.startsWith("free_"))

  // Filter attempts to the selected context
  const contextAttempts = (() => {
    if (selectedContext === "overall") return attempts
    if (selectedContext === "free") return attempts.filter(a => !a.batchId)
    return attempts.filter(a => a.batchId === selectedContext)
  })()

  // Reset filter to "all" whenever context changes (prevents showing 0 results)
  const filtered = contextAttempts.filter(a => {
    if (filter === "first")  return a.attemptNumber === 1
    if (filter === "retry")  return (a.attemptNumber || 1) > 1
    if (filter === "pass")   return (a.score / (a.maxScore || a.totalQ || 1)) >= 0.6
    if (filter === "fail")   return (a.score / (a.maxScore || a.totalQ || 1)) < 0.6
    return true
  })
  const totalAttemptPages = Math.ceil(filtered.length / ATTEMPTS_PAGE_SIZE)
  const safePage          = Math.min(attemptsPage, Math.max(1, totalAttemptPages))
  const pagedAttempts     = filtered.slice((safePage - 1) * ATTEMPTS_PAGE_SIZE, safePage * ATTEMPTS_PAGE_SIZE)
  const firstAttempts = contextAttempts.filter(a => a.attemptNumber === 1)
  const uniqueUsers   = new Set(contextAttempts.map(a => a.userId)).size
  // Avg score in raw marks (not %), pass/fail counts — scoped to first attempts
  const maxPossible   = firstAttempts.length > 0 ? (firstAttempts[0].maxScore || firstAttempts[0].totalQ || 0) : 0
  const avgScore      = firstAttempts.length > 0
    ? +(firstAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / firstAttempts.length).toFixed(1)
    : 0
  const passCount     = firstAttempts.filter(a => (a.score / (a.maxScore || a.totalQ || 1)) >= 0.6).length
  const failCount     = firstAttempts.length - passCount

  // Pass/fail counts for ALL contextAttempts (not just first) for filter badges
  const allPassCount  = contextAttempts.filter(a => (a.score / (a.maxScore || a.totalQ || 1)) >= 0.6).length
  const allFailCount  = contextAttempts.length - allPassCount

  const questionStats = (() => {
    const allAnswers = firstAttempts.flatMap(a => a.answers || [])
    if (allAnswers.length === 0) return []

    const qMap = {}
    firstAttempts.forEach(attempt => {
      (attempt.answers || []).forEach((ans, idx) => {
        const key = ans.question || `Q${idx+1}`
        if (!qMap[key]) qMap[key] = { question: ans.question, options: ans.options, correct: ans.correct, idx, responses: [] }
        qMap[key].responses.push(ans.selected)
      })
    })

    return Object.values(qMap).map(q => {
      const total    = q.responses.length
      const correct  = q.responses.filter(r => r === q.correct).length
      const skipped  = q.responses.filter(r => r === -1 || r === null || r === undefined).length
      const incorrect= total - correct - skipped
      const pct      = total > 0 ? Math.round((correct / total) * 100) : 0
      const optionCounts = [0,1,2,3].map(i => q.responses.filter(r => r === i).length)
      return { ...q, total, correct, incorrect, skipped, pct, optionCounts }
    }).sort((a, b) => a.pct - b.pct)
  })()

  const maxQuizAttempts = Math.max(...(quizStats => quizStats.map(q => q.total))(questionStats), 1)

  return (
    <AdminLayout>
      <div className="p-7 max-w-7xl">

        <button onClick={() => navigate("/admin/quizzes")}
          className="group flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-6 transition-colors">
          <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
          Back to Quiz Manager
        </button>

        {quiz && (
          <div className="mb-5">
            {/* Title row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">{quiz.title}</h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  {contextAttempts.length} attempt{contextAttempts.length !== 1 ? "s" : ""}
                  {selectedContext !== "overall" && <> · <button onClick={() => setSelectedContext("overall")} className="text-gray-600 hover:text-gray-400 underline underline-offset-2 transition text-xs">View all</button></>}
                </p>
              </div>
              <button
                onClick={handleDownload}
                disabled={loading || downloading || !contextAttempts.length}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all
                  bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-500/40
                  disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Download size={14} className={downloading ? "animate-bounce" : ""} />
                {downloading ? "Generating..." : "Download Report"}
              </button>
            </div>

            {/* Context selector — dropdown */}
            {!loading && (batchContexts.length > 0 || hasFreeAttempts) && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedContext}
                  onChange={e => { setSelectedContext(e.target.value); setFilter("all"); setAttemptsPage(1) }}
                  className={`bg-gray-900 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition ${
                    selectedContext === "overall"
                      ? "border-gray-700 text-gray-300 focus:border-gray-500"
                      : selectedContext === "free"
                        ? "border-cyan-500/40 text-cyan-300 focus:border-cyan-500/60"
                        : "border-violet-500/40 text-violet-300 focus:border-violet-500/60"
                  }`}
                >
                  <option value="overall">Overall · {attempts.length} attempts</option>
                  {hasFreeAttempts && (
                    <option value="free">🌐 Free · {attempts.filter(a => !a.batchId).length} attempts</option>
                  )}
                  {batchContexts.length > 0 && (
                    <optgroup label="── Batches">
                      {batchContexts.map(({ batchId: bId, name }) => (
                        <option key={bId} value={bId}>{name} · {attempts.filter(a => a.batchId === bId).length} attempts</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {selectedContext !== "overall" && (
                  <button onClick={() => { setSelectedContext("overall"); setFilter("all"); setAttemptsPage(1) }}
                    className="text-xs text-gray-600 hover:text-gray-400 transition">
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/6 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Total Attempts</p>
            <p className="text-2xl font-black leading-none text-cyan-400">{loading ? "—" : contextAttempts.length}</p>
          </div>
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/6 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Unique Students</p>
            <p className="text-2xl font-black leading-none text-purple-400">{loading ? "—" : uniqueUsers}</p>
          </div>
          <div className="rounded-2xl border border-gray-700/50 bg-gray-800/40 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Avg Score</p>
            {loading ? (
              <p className="text-2xl font-black leading-none text-gray-400">—</p>
            ) : firstAttempts.length > 0 ? (
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-black leading-none text-white">{avgScore}</p>
                {maxPossible > 0 && <p className="text-sm text-gray-500 font-semibold">/ {maxPossible}</p>}
                <p className="text-[10px] text-gray-600 ml-1">1st attempts</p>
              </div>
            ) : (
              <p className="text-2xl font-black leading-none text-gray-600">—</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-5">
          {[
            { id: "attempts",  label: "User Attempts" },
            { id: "questions", label: "Question Analytics" },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                activeTab === t.id
                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                  : "bg-gray-900/60 text-gray-500 border-gray-800 hover:text-white"
              }`}>
              {t.id === "attempts" ? <Users size={13} /> : <TrendingUp size={13} />}
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "attempts" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <div className="flex gap-2 mb-4 flex-wrap">
                {[
                  { id: "all",   label: "All",          count: contextAttempts.length },
                  { id: "first", label: "1st Attempts",  count: contextAttempts.filter(a => a.attemptNumber === 1).length },
                  { id: "retry", label: "Retries",       count: contextAttempts.filter(a => (a.attemptNumber || 1) > 1).length },
                  { id: "pass",  label: "Passed",        count: allPassCount, accent: "emerald" },
                  { id: "fail",  label: "Failed",        count: allFailCount, accent: "rose"    },
                ].map(f => (
                  <button key={f.id} onClick={() => { setFilter(f.id); setAttemptsPage(1) }}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition border ${
                      filter === f.id
                        ? f.accent === "emerald" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : f.accent === "rose"  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                        : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
                    }`}>
                    {f.label}
                    <span className={`text-[10px] font-black ${filter === f.id ? "opacity-70" : "text-gray-700"}`}>{f.count}</span>
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-12 text-center">
                  <Users size={32} className="mx-auto text-gray-700 mb-3" />
                  <p className="text-gray-500">No attempts yet</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedAttempts.map((a, idx) => {
                      const maxScore = a.maxScore || a.totalQ
                      const pct = Math.round((a.score / maxScore) * 100)
                      const pctColor = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400"
                      const pctBg    = pct >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : pct >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-rose-500/10 border-rose-500/20"
                      return (
                        <button key={a.id} onClick={() => navigate(`/attempt/${a.id}`)}
                          className="group w-full text-left rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/60 hover:border-gray-700 transition-all overflow-hidden"
                        >
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black border shrink-0 ${pctBg} ${pctColor}`}>
                              <span className="text-sm leading-none">{a.score}</span>
                              <span className="text-[9px] opacity-60 mt-0.5">/{maxScore}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-white text-sm font-semibold truncate">{a.userName}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${a.attemptNumber === 1 ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "bg-gray-800 text-gray-500"}`}>
                                  {a.attemptNumber === 1 ? "1st" : `Retry #${a.attemptNumber - 1}`}
                                </span>
                                {pct >= 60
                                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">Pass</span>
                                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">Fail</span>
                                }
                              </div>
                              <p className="text-gray-500 text-xs">{a.score}/{maxScore} marks · {a.streak || 0} streak{a.timeTaken != null ? ` · ${Math.floor(a.timeTaken/60)}m ${a.timeTaken%60}s` : ""} · {new Date(a.date).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-1 text-gray-600 text-xs shrink-0 group-hover:text-gray-400">
                              Review <ChevronRight size={12} />
                            </div>
                          </div>
                          <div className="h-0.5 bg-gray-800">
                            <div className={`h-full ${pct >= 80 ? "bg-emerald-500/40" : pct >= 60 ? "bg-amber-500/40" : "bg-rose-500/40"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Pagination */}
                  {totalAttemptPages > 1 && (
                    <div className="flex items-center justify-between mt-4 px-1">
                      <p className="text-xs text-gray-600">
                        {filtered.length} attempts · page {safePage} of {totalAttemptPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setAttemptsPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 transition">
                          Prev
                        </button>
                        {Array.from({ length: Math.min(totalAttemptPages, 5) }, (_, i) => {
                          let p
                          if (totalAttemptPages <= 5) p = i + 1
                          else if (safePage <= 3) p = i + 1
                          else if (safePage >= totalAttemptPages - 2) p = totalAttemptPages - 4 + i
                          else p = safePage - 2 + i
                          return (
                            <button key={p} onClick={() => setAttemptsPage(p)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                                p === safePage
                                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                                  : "text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700"
                              }`}>
                              {p}
                            </button>
                          )
                        })}
                        <button onClick={() => setAttemptsPage(p => Math.min(totalAttemptPages, p + 1))} disabled={safePage === totalAttemptPages}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 transition">
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="lg:sticky lg:top-6">
              <Leaderboard
                leaderboardKey={
                  selectedContext === "overall" ? id
                  : selectedContext === "free"    ? `free_${id}`
                  : `batch_${selectedContext}_${id}`
                }
                currentUserId={null}
                compact
              />
            </div>
          </div>
        )}

        {activeTab === "questions" && (
          <div>
            {loading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />)}</div>
            ) : questionStats.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-12 text-center">
                <TrendingUp size={32} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500">No first-attempt data yet to analyse.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {questionStats.map((q, i) => {
                  const barColor  = q.pct >= 70 ? "bg-emerald-500" : q.pct >= 40 ? "bg-amber-500" : "bg-rose-500"
                  const pctColor  = q.pct >= 70 ? "text-emerald-400" : q.pct >= 40 ? "text-amber-400" : "text-rose-400"
                  const diff      = q.pct >= 70 ? "Easy" : q.pct >= 40 ? "Medium" : "Hard"
                  const diffColor = q.pct >= 70 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : q.pct >= 40 ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    : "text-rose-400 bg-rose-500/10 border-rose-500/20"

                  return (
                    <div key={i}
                      className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-3.5 overflow-hidden"
                      style={{ opacity: 1, transition: `opacity 0.25s ease ${i * 0.04}s` }}
                    >
                      <div className="flex items-center gap-3 mb-2.5">
                        <span className="text-xs font-black text-gray-500 shrink-0 w-6">Q{i+1}</span>
                        <p className="text-sm text-white font-medium flex-1 truncate">{q.question}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${diffColor}`}>{diff}</span>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          <span className="text-emerald-600">? {q.correct}</span>
                          <span className="text-rose-600">? {q.incorrect}</span>
                          {q.skipped > 0 && <span className="text-gray-600"> -  {q.skipped}</span>}
                        </div>
                        <span className={`text-sm font-black shrink-0 w-20 text-right ${pctColor}`}>{q.pct}% correct</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} transition-all duration-700`}
                          style={{ width: `${q.pct}%`, transitionDelay: `${i * 0.04}s` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </AdminLayout>
  )
}