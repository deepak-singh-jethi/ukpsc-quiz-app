import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore"
import Navbar from "../../components/Navbar"
import { useBookmark } from "../../hooks/useBookmark"
import {
  ChevronLeft, ChevronRight,
  CheckCircle, XCircle, MinusCircle, Flame,
  RotateCcw, Bookmark, Target, BookOpen, X,
} from "lucide-react"
import Leaderboard from "../../components/Leaderboard"
import { getLeaderboardKey } from "../../firebase/leaderboardService"


function fmtTime(secs) {
  if (secs == null) return null
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2,"0")}s` : `${s}s`
}

//  Module-level regex constants (never inline regex in JSX) 
const RE_STATEMENT  = /\n\d+\.\s/
const RE_ASSERTION  = /^अभिकथन\s*\(A\)\s*[:\-]?\s*/
const RE_REASON     = /^कारण\s*\(R\)\s*[:\-]?\s*/

//  Question type detection 
function detectQType(text) {
  if (text.includes("सूची-I") || text.includes("List-I") || text.includes("Column-I")) return "match"
  if (text.includes("अभिकथन (A)") || text.includes("Assertion (A)") || text.includes("नीचे दो कथन दिए गए हैं")) return "ar"
  if (text.includes("कथनों पर विचार") || RE_STATEMENT.test(text)) return "statement"
  return "direct"
}

const Q_TYPE_BADGE = {
  match:     { label: "सूची",   cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  ar:        { label: "A / R",  cls: "text-amber-400  bg-amber-500/10  border-amber-500/20"  },
  statement: { label: "कथन",   cls: "text-sky-400    bg-sky-500/10    border-sky-500/20"     },
  direct:    { label: "Direct", cls: "text-gray-500   bg-gray-800      border-gray-700"       },
}

//  Smart question body renderer 
function QuestionBody({ text }) {
  const lines   = (text || "").split("\n")
  const isMatch = text.includes("सूची-I") || text.includes("List-I")
  const isAR    = text.includes("अभिकथन (A)") || text.includes("Assertion (A)") || text.includes("नीचे दो कथन दिए गए हैं")

  if (isMatch) {
    let intro = "", secA = [], secB = [], curSec = "intro", colALabel = "सूची-I", colBLabel = "सूची-II"
    for (const line of lines) {
      const t = line.trim(); if (!t) { if (curSec === "A") curSec = "B"; continue }
      if (t.startsWith("सूची-II") || t.startsWith("List-II")) { colBLabel = t; curSec = "B"; continue }
      if (t.startsWith("सूची-I")  || t.startsWith("List-I"))  { colALabel = t; curSec = "A"; continue }
      if (curSec === "intro") intro = t; else if (curSec === "A") secA.push(t); else secB.push(t)
    }
    return (
      <div>
        {intro && <p className="text-white text-sm font-medium mb-3">{intro}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-900/80 border border-cyan-500/20 rounded-xl p-3">
            <p className="text-cyan-400 text-[10px] font-bold mb-2 uppercase tracking-wide">{colALabel}</p>
            {secA.map((l, i) => <p key={i} className="text-gray-300 text-xs py-0.5 leading-relaxed">{l}</p>)}
          </div>
          <div className="bg-gray-900/80 border border-violet-500/20 rounded-xl p-3">
            <p className="text-violet-400 text-[10px] font-bold mb-2 uppercase tracking-wide">{colBLabel}</p>
            {secB.map((l, i) => <p key={i} className="text-gray-300 text-xs py-0.5 leading-relaxed">{l}</p>)}
          </div>
        </div>
      </div>
    )
  }

  if (isAR) {
    const aLine = lines.find(l => l.trim().startsWith("अभिकथन") || l.trim().startsWith("Assertion"))
    const rLine = lines.find(l => l.trim().startsWith("कारण")   || l.trim().startsWith("Reason"))
    const intro = lines[0]?.includes("नीचे दो कथन") ? lines[0].trim() : null
    const rest  = lines.filter(l => l.trim() && l !== aLine && l !== rLine && !l.includes("नीचे दो कथन"))
    return (
      <div className="space-y-2">
        {intro && <p className="text-gray-400 text-xs">{intro}</p>}
        {aLine && (
          <div className="bg-amber-500/6 border border-amber-500/20 rounded-xl px-3 py-2.5">
            <span className="text-amber-400 text-[10px] font-black uppercase tracking-wider block mb-1">अभिकथन (A)</span>
            <p className="text-gray-200 text-xs leading-relaxed">{aLine.replace(RE_ASSERTION, "")}</p>
          </div>
        )}
        {rLine && (
          <div className="bg-blue-500/6 border border-blue-500/20 rounded-xl px-3 py-2.5">
            <span className="text-blue-400 text-[10px] font-black uppercase tracking-wider block mb-1">कारण (R)</span>
            <p className="text-gray-200 text-xs leading-relaxed">{rLine.replace(RE_REASON, "")}</p>
          </div>
        )}
        {rest.map((l, i) => <p key={i} className="text-gray-300 text-xs font-medium">{l}</p>)}
      </div>
    )
  }

  return (
    <div className="text-white text-sm font-medium leading-relaxed space-y-0.5">
      {lines.map((line, li) =>
        line.trim() === "" ? <br key={li} /> : <p key={li}>{line}</p>
      )}
    </div>
  )
}

//  Main component 
export default function AttemptReview() {
  const { attemptId } = useParams()
  const navigate      = useNavigate()
  const { currentUser } = useAuth()
  const { isBookmarked, toggleBookmark } = useBookmark(currentUser?.uid)

  const [attempt,      setAttempt]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState("incorrect")
  const [activeIdx,    setActiveIdx]    = useState(0)

  const [allAttempts,  setAllAttempts]  = useState([])  // all attempts by this user on this quiz
  const [dropOpen,     setDropOpen]     = useState(false)
  const [retestMode,   setRetestMode]   = useState(false)
  const [retestAnswers, setRetestAnswers] = useState({})   // key: "tabId_idx" → selected option index
  const [reviewModal,  setReviewModal]  = useState(null)  // null | { ans, qNum }
  const dropRef = useRef(null)
  useEffect(() => {
    function handleClick(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false) }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Reset active question + retest state when tab changes
  useEffect(() => { setActiveIdx(0); setRetestAnswers({}) }, [activeTab])

  useEffect(() => {
    async function loadAttempt() {
      try {
        const snap = await getDoc(doc(db, "quizAttempts", attemptId))
        if (!snap.exists()) { navigate(-1); return }
        setAttempt({ id: snap.id, ...snap.data() })
      } catch (e) { console.error("Failed to load attempt:", e) }
      setLoading(false)
    }
    loadAttempt()
  }, [attemptId])

  useEffect(() => {
    if (!attempt?.quizId || !currentUser?.uid) return
    async function loadSiblingAttempts() {
      try {
        const snap = await getDocs(query(
          collection(db, "quizAttempts"),
          where("quizId", "==", attempt.quizId),
          where("userId", "==", currentUser.uid)
        ))
        const sorted = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.attemptNumber ?? 1) - (b.attemptNumber ?? 1))
        setAllAttempts(sorted)
      } catch (e) { console.error("Sibling attempts fetch failed:", e) }
    }
    loadSiblingAttempts()
  }, [attempt?.quizId, currentUser?.uid])



  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!attempt) return null

  const { answers = [], score, totalQ, streak, quizTitle, date, attemptNumber } = attempt
  const attempted  = answers.filter(a => a.selected !== -1 && a.selected !== undefined && a.selected !== null).length
  const skipped    = totalQ - attempted
  const correct    = answers.filter(a => a.selected === a.correct).length
  const incorrect  = attempted - correct
  const accuracy   = attempted > 0 ? Math.round((correct / attempted) * 100) : 0
  const marksPerQ  = attempt.marksPerQ   || 1
  const negMark    = attempt.negativeMark || 0
  const maxMarks   = attempt.maxScore    || (totalQ * marksPerQ)
  const totalMarks = score ?? (correct * marksPerQ) - (incorrect * negMark)
  const pct        = Math.round((totalMarks / maxMarks) * 100)
  const isFirst    = (attemptNumber ?? 1) === 1

  const pctColor  = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400"
  const pctBorder = pct >= 80 ? "border-emerald-500/30" : pct >= 60 ? "border-amber-500/30" : "border-rose-500/30"
  const pctBg     = pct >= 80 ? "bg-emerald-500/8" : pct >= 60 ? "bg-amber-500/8" : "bg-rose-500/8"

  const correctAnswers   = answers.filter(a => a.selected === a.correct)
  const incorrectAnswers = answers.filter(a => a.selected !== a.correct && a.selected !== -1 && a.selected !== undefined && a.selected !== null)
  const skippedAnswers   = answers.filter(a => a.selected === -1 || a.selected === undefined || a.selected === null)

  // FIX #18: contextual focus message
  function getFocusMsg() {
    if (incorrect === 0 && skipped === 0) return { icon: "", msg: "Perfect score! Every answer correct.", color: "text-emerald-400" }
    if (incorrect >= 5)  return { icon: "", msg: `${incorrect} wrong answers to review  -  expand each to see why.`, color: "text-rose-400" }
    if (incorrect > 0)   return { icon: "", msg: `${incorrect} incorrect answer${incorrect > 1 ? "s" : ""}  -  check the explanations below.`, color: "text-amber-400" }
    return { icon: "", msg: `You skipped ${skipped} questions. Try them on a retry.`, color: "text-gray-400" }
  }
  const focus = getFocusMsg()

  // FIX #3: tabs as primary navigation
  const TABS = [
    { id: "incorrect", label: "Incorrect", count: incorrect, icon: XCircle,     color: "text-rose-400",    activeBg: "bg-rose-500/10",    activeBorder: "border-rose-500/40",    barColor: "bg-rose-500"    },
    { id: "correct",   label: "Correct",   count: correct,   icon: CheckCircle, color: "text-emerald-400", activeBg: "bg-emerald-500/10", activeBorder: "border-emerald-500/40", barColor: "bg-emerald-500" },
    { id: "skipped",   label: "Skipped",   count: skipped,   icon: MinusCircle, color: "text-gray-400",    activeBg: "bg-gray-800",       activeBorder: "border-gray-600",       barColor: "bg-gray-500"    },
  ]

  const tabAnswers  = activeTab === "correct" ? correctAnswers : activeTab === "incorrect" ? incorrectAnswers : skippedAnswers

  function getQNum(ans) { return answers.findIndex(a => a.question === ans.question) + 1 }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-4">

        {/* HEADER */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/50 px-5 py-3 mb-4">
          <div className="flex items-center gap-3">

            {/* Back */}
            <button onClick={() => navigate(-1)}
              className="group flex items-center gap-1 text-gray-500 hover:text-white text-xs transition-colors shrink-0">
              <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" /> Back
            </button>

            {/* Title + meta - centered */}
            <div className="flex-1 min-w-0 text-center">
              <div className="flex items-center justify-center gap-2 mb-0.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  isFirst
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                    : "bg-violet-500/10 text-violet-400 border-violet-500/20"
                }`}>
                  {isFirst ? "1st Attempt" : `Retry #${(attemptNumber ?? 2) - 1}`}
                </span>
                <span className="text-gray-600 text-[11px]">{new Date(date).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}</span>
              </div>
              <h1 className="text-base font-black text-white tracking-tight leading-tight truncate">{quizTitle || "Quiz"}</h1>
            </div>

            {/* Score + retry */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className={`text-2xl font-black leading-none ${pctColor}`}>
                  {Number.isInteger(totalMarks) ? totalMarks : Number(totalMarks.toFixed(2))}
                  <span className="text-sm font-semibold text-gray-600">/{maxMarks}</span>
                </p>
                <p className="text-[10px] text-gray-600">marks</p>
              </div>
              <button
                onClick={() => navigate(`/quiz/${attempt.quizId}${attempt.batchId ? `?batchId=${attempt.batchId}` : ""}`)}
                className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2.5 rounded-xl text-sm transition group">
                <RotateCcw size={13} className="group-hover:rotate-180 transition-transform duration-500" />
                Retry
              </button>

            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-3 flex flex-col gap-3">

            {/* ATTEMPT SWITCHER - dropdown */}
            {allAttempts.length > 1 && (() => {
              const firstA   = allAttempts.find(a => a.attemptNumber === 1)
              const curScore = Number.isInteger(attempt.score ?? 0) ? (attempt.score ?? 0) : Number((attempt.score ?? 0).toFixed(2))
              const fScore   = firstA ? (Number.isInteger(firstA.score ?? 0) ? (firstA.score ?? 0) : Number((firstA.score ?? 0).toFixed(2))) : null
              const aMax     = attempt.maxScore || attempt.totalQ || 1
              return (
                <div className="relative" ref={dropRef}>
                  {/* Trigger button */}
                  <button
                    onClick={() => setDropOpen(o => !o)}
                    className="flex items-center gap-3 w-full bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl px-4 py-2.5 transition-all group">

                    {/* Left: current attempt label */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest shrink-0">Attempt</span>
                      <span className="text-sm font-black text-white">
                        {attempt.attemptNumber === 1 ? "1st" : `#${attempt.attemptNumber}`}
                      </span>
                      {attempt.attemptNumber === 1 && (
                        <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">1ST</span>
                      )}
                      <span className={`text-base font-black tabular-nums ml-1 ${
                        (attempt.score ?? 0) >= aMax * 0.8 ? "text-emerald-400"
                        : (attempt.score ?? 0) >= aMax * 0.6 ? "text-amber-400"
                        : (attempt.score ?? 0) > 0 ? "text-rose-400"
                        : "text-gray-500"
                      }`}>{curScore}<span className="text-xs font-normal text-gray-600">/{aMax}</span></span>
                    </div>

                    {/* Right: first attempt reference + chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                      {firstA && attempt.attemptNumber !== 1 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-600 border-l border-gray-800 pl-3">
                          <span className="text-amber-500/70 font-bold text-[9px]">1ST</span>
                          <span className="tabular-nums font-semibold">{fScore}/{aMax}</span>
                        </div>
                      )}
                      <ChevronRight size={14} className={`text-gray-600 group-hover:text-gray-400 transition-transform ${dropOpen ? "rotate-90" : ""}`} />
                    </div>
                  </button>

                  {/* Dropdown */}
                  {dropOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden z-20 shadow-xl">
                      {allAttempts.map(a => {
                        const isCurrent = a.id === attempt.id
                        const isFirst   = a.attemptNumber === 1
                        const aScore    = a.score ?? 0
                        const aMax2     = a.maxScore || a.totalQ || 1
                        const sStr      = Number.isInteger(aScore) ? aScore : Number(aScore.toFixed(2))
                        const sColor    = aScore >= aMax2 * 0.8 ? "text-emerald-400" : aScore >= aMax2 * 0.6 ? "text-amber-400" : aScore > 0 ? "text-rose-400" : "text-gray-500"
                        return (
                          <button key={a.id}
                            onClick={() => { setDropOpen(false); if (!isCurrent) navigate(`/attempt/${a.id}`) }}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                              isCurrent ? "bg-cyan-500/8 border-l-2 border-cyan-500" : "hover:bg-gray-800/60 border-l-2 border-transparent"
                            }`}>
                            {/* Attempt label */}
                            <div className="flex items-center gap-2 w-20 shrink-0">
                              {isFirst
                                ? <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">1ST</span>
                                : <span className="text-xs font-bold text-gray-500">#{a.attemptNumber}</span>
                              }
                              {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                            </div>
                            {/* Score */}
                            <span className={`text-base font-black tabular-nums ${sColor}`}>
                              {sStr}<span className="text-xs font-normal text-gray-600">/{aMax2}</span>
                            </span>
                            {/* Date */}
                            <span className="ml-auto text-[11px] text-gray-600">
                              {new Date(a.date).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                            </span>
                            {isCurrent && <span className="text-[10px] text-cyan-500 font-semibold">viewing</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/*  FILTER TABS + Reattempt toggle  */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-2">
              {TABS.map(t => {
                const Icon   = t.icon
                const active = activeTab === t.id
                return (
                  <button key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                      active
                        ? `${t.activeBg} ${t.color} ${t.activeBorder} shadow-sm`
                        : "border-gray-800 text-gray-500 hover:text-gray-300 bg-gray-900/60 hover:border-gray-700"
                    }`}>
                    <Icon size={14} />
                    {t.label}
                    <span className={`text-sm font-black px-1.5 py-0.5 rounded-md ${active ? "bg-black/20" : "text-gray-700"}`}>
                      {t.count}
                    </span>
                  </button>
                )
              })}
              </div>
              {/* Reattempt animated toggle switch */}
              <button
                onClick={() => { setRetestMode(m => !m); setRetestAnswers({}) }}
                title={retestMode ? "Exit reattempt mode" : "Reattempt questions without seeing answers"}
                className="flex items-center gap-2.5 shrink-0 pl-3 pr-2.5 py-2 rounded-xl border transition-all duration-200"
                style={{
                  background:   retestMode ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor:  retestMode ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.08)",
                  boxShadow:    retestMode ? "0 0 12px rgba(245,158,11,0.15)" : "none",
                }}>
                {/* Label */}
                <span className="text-xs font-bold tracking-wide transition-colors duration-200"
                  style={{ color: retestMode ? "rgb(252,211,77)" : "rgb(107,114,128)" }}>
                  Reattempt
                </span>
                {/* Toggle pill */}
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
            </div>

            {tabAnswers.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-12 text-center">
                <CheckCircle size={28} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm font-medium">No {activeTab} answers</p>
                {activeTab === "incorrect" && <p className="text-gray-700 text-xs mt-1">You got everything right!</p>}
              </div>
            ) : (() => {
              const ans       = tabAnswers[activeIdx] || tabAnswers[0]
              const qNum      = getQNum(ans)
              const isCorr    = ans.selected === ans.correct
              const isSkip    = ans.selected === -1 || ans.selected === undefined || ans.selected === null
              const qType     = detectQType(ans.question || "")
              const typeBadge = Q_TYPE_BADGE[qType]
              const markVal   = isSkip ? " - " : isCorr ? `+${marksPerQ}` : negMark > 0 ? `-${negMark}` : "0"
              const markColor = isSkip ? "text-gray-500" : isCorr ? "text-emerald-400" : "text-rose-400"
              const allLines  = (ans.question || "").split("\n").filter(l => l.trim())
              const safeIdx   = Math.min(activeIdx, tabAnswers.length - 1)

              return (
                <>
                  {/*  QUESTION NUMBER GRID  */}
                  <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                        {tabAnswers.length} question{tabAnswers.length !== 1 ? "s" : ""}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[10px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Correct</span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />Wrong</span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-gray-600 inline-block" />Skipped</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tabAnswers.map((a, idx) => {
                        const out   = a.selected === a.correct ? "correct" : (a.selected === -1 || a.selected === undefined || a.selected === null) ? "skip" : "wrong"
                        const isCur = idx === safeIdx
                        const n     = getQNum(a)
                        return (
                          <button key={idx} onClick={() => setActiveIdx(idx)}
                            title={`Q${n}`}
                            className={`w-8 h-8 rounded-lg text-xs font-black border transition-all ${
                              isCur
                                ? out === "correct" ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30 scale-110"
                                : out === "wrong"   ? "bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/30 scale-110"
                                : "bg-gray-500 border-gray-400 text-white shadow-md scale-110"
                                : out === "correct" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30"
                                : out === "wrong"   ? "bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/30"
                                : "bg-gray-800/60 border-gray-700/40 text-gray-500 hover:bg-gray-700/60"
                            }`}>
                            {n}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Nav + card wrapper - buttons float left/right aligned to top of card */}
                  <div className="relative">
                    <button
                      onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                      disabled={safeIdx === 0}
                      className="absolute -left-5 top-3 z-10 w-9 h-9 rounded-xl border border-gray-700 bg-gray-900 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition">
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setActiveIdx(i => Math.min(tabAnswers.length - 1, i + 1))}
                      disabled={safeIdx === tabAnswers.length - 1}
                      className="absolute -right-5 top-3 z-10 w-9 h-9 rounded-xl border border-gray-700 bg-gray-900 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition">
                      <ChevronRight size={18} />
                    </button>

                  {/*  QUESTION CARD  */}
                  <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">

                      {/* Thin outcome strip */}
                      <div className={`h-0.5 w-full ${
                        isSkip ? "bg-gray-700" : isCorr ? "bg-emerald-500" : "bg-rose-500"
                      }`} />

                      <div className="p-5">
                        {/* Meta row: Q number - type - spacer - counter - marks - bookmark */}
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xs font-bold text-gray-500">Q{qNum}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none ${typeBadge.cls}`}>{typeBadge.label}</span>
                          <span className="flex-1" />
                          <span className="text-[11px] text-gray-600 tabular-nums">{safeIdx + 1}/{tabAnswers.length}</span>
                          <span className={`text-sm font-black tabular-nums ${markColor}`}>{markVal}</span>
                          <div role="button" tabIndex={0}
                            onClick={() => toggleBookmark({
                              questionKey: `${attempt.quizId}_${qNum}`, question: ans.question,
                              options: ans.options, correct: ans.correct, selected: ans.selected,
                              quizTitle: attempt.quizTitle, quizId: attempt.quizId, attemptId: attempt.id,
                            })}
                            className={`p-1 rounded cursor-pointer transition-colors ${
                              isBookmarked(`${attempt.quizId}_${qNum}`)
                                ? "text-amber-400"
                                : "text-gray-600 hover:text-amber-400"
                            }`}>
                            <Bookmark size={13} className={isBookmarked(`${attempt.quizId}_${qNum}`) ? "fill-current" : ""} />
                          </div>
                        </div>

                        {/* Question text */}
                        <div className="mb-5">
                          {(qType === "match" || qType === "ar" || qType === "statement") ? (
                            <QuestionBody text={ans.question || ""} />
                          ) : (
                            <div className="text-white text-sm leading-relaxed space-y-1">
                              {allLines.map((line, li) => <p key={li}>{line}</p>)}
                            </div>
                          )}
                        </div>

                        {/* Options */}
                        {ans.options && (() => {
                          const retestKey      = `${activeTab}_${safeIdx}`
                          const retestSelected = retestAnswers[retestKey] ?? null
                          const retestRevealed = retestSelected !== null

                          if (retestMode) {
                            // ── RETEST MODE: clean options, student picks, then reveal ──
                            return (
                              <div className="space-y-2">
                                {!retestRevealed && (
                                  <p className="text-[11px] text-amber-400/70 mb-3 flex items-center gap-1.5">
                                    <Target size={11} /> Select your answer
                                  </p>
                                )}
                                {ans.options.map((o, k) => {
                                  const letter = ["A","B","C","D"][k]
                                  const isCorrOpt = k === ans.correct
                                  const isPickedOpt = k === retestSelected

                                  // Before answer: neutral clickable
                                  // After answer: colour coded
                                  let optStyle = "border border-gray-800 bg-gray-900/60 text-gray-300 hover:border-gray-600 cursor-pointer"
                                  let dotStyle = "bg-gray-800 text-gray-500"
                                  let icon = null

                                  if (retestRevealed) {
                                    if (isCorrOpt) {
                                      optStyle = "border border-emerald-500/35 bg-emerald-500/10 text-white"
                                      dotStyle = "bg-emerald-500 text-white"
                                      icon = <CheckCircle size={14} className="shrink-0 mt-0.5 text-emerald-400" />
                                    } else if (isPickedOpt) {
                                      optStyle = "border border-rose-500/35 bg-rose-500/10 text-rose-200"
                                      dotStyle = "bg-rose-500 text-white"
                                      icon = <XCircle size={14} className="shrink-0 mt-0.5 text-rose-400" />
                                    } else {
                                      optStyle = "border border-transparent text-gray-600"
                                      dotStyle = "bg-gray-800 text-gray-600"
                                    }
                                  }

                                  return (
                                    <div key={k}>
                                      <div
                                        onClick={() => {
                                          if (!retestRevealed)
                                            setRetestAnswers(prev => ({ ...prev, [retestKey]: k }))
                                        }}
                                        className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all ${optStyle}`}
                                      >
                                        <span className={`shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black ${dotStyle}`}>
                                          {letter}
                                        </span>
                                        <p className="flex-1 text-sm leading-relaxed">{o.text}</p>
                                        {icon}
                                      </div>
                                      {/* Explanation shows after revealing for correct option */}
                                      {retestRevealed && isCorrOpt && o.explanation && (
                                        <p className="mt-1 mx-8 text-xs leading-relaxed text-emerald-400/80">{o.explanation}</p>
                                      )}
                                    </div>
                                  )
                                })}
                                {retestRevealed && (() => {
                                  const origSelected = ans.selected  // what they picked in the original quiz
                                  const origIsSkipped = origSelected === -1 || origSelected === undefined || origSelected === null
                                  const origLetter = !origIsSkipped ? ["A","B","C","D"][origSelected] : null
                                  const origText   = !origIsSkipped && ans.options?.[origSelected]
                                    ? (typeof ans.options[origSelected] === "string" ? ans.options[origSelected] : ans.options[origSelected].text)
                                    : null
                                  return (
                                    <>
                                      <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${
                                        retestSelected === ans.correct
                                          ? "bg-emerald-500/10 text-emerald-400"
                                          : "bg-rose-500/10 text-rose-400"
                                      }`}>
                                        {retestSelected === ans.correct ? "✓ Correct!" : "✗ Wrong — see correct answer above"}
                                        <button
                                          onClick={() => setRetestAnswers(prev => { const n = {...prev}; delete n[retestKey]; return n })}
                                          className="ml-auto text-[10px] opacity-60 hover:opacity-100 underline transition">
                                          Try again
                                        </button>
                                      </div>
                                      {/* Original answer hint */}
                                      <div className="mt-1.5 px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/50 text-[11px] text-gray-500 flex items-center gap-2">
                                        <span className="shrink-0 text-gray-600">Your original answer:</span>
                                        {origIsSkipped ? (
                                          <span className="text-gray-600 italic">Skipped</span>
                                        ) : (
                                          <span className={`font-semibold flex items-center gap-1.5 ${
                                            origSelected === ans.correct ? "text-emerald-400" : "text-rose-400"
                                          }`}>
                                            <span className="w-4 h-4 rounded text-[10px] font-black flex items-center justify-center bg-gray-700">
                                              {origLetter}
                                            </span>
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

                          // ── REVIEW MODE (default): original coloured display ──
                          return (
                            <div className="space-y-2">
                              {ans.options.map((o, k) => {
                                const isCorrOpt = k === ans.correct
                                const isSelOpt  = k === ans.selected
                                const isWrong   = isSelOpt && !isCorrOpt
                                const letter    = ["A","B","C","D"][k]
                                return (
                                  <div key={k}>
                                    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl ${
                                      isCorrOpt ? "bg-emerald-500/10 border border-emerald-500/25"
                                      : isWrong  ? "bg-rose-500/10 border border-rose-500/25"
                                      : "border border-transparent"
                                    }`}>
                                      <span className={`shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black ${
                                        isCorrOpt ? "bg-emerald-500 text-white"
                                        : isWrong  ? "bg-rose-500 text-white"
                                        : "bg-gray-800 text-gray-500"
                                      }`}>{letter}</span>
                                      <p className={`flex-1 text-sm leading-relaxed ${
                                        isCorrOpt ? "text-white font-medium"
                                        : isWrong  ? "text-rose-200"
                                        : "text-gray-500"
                                      }`}>{o.text}</p>
                                      {isCorrOpt && <CheckCircle size={14} className="shrink-0 mt-0.5 text-emerald-400" />}
                                      {isWrong  && <XCircle    size={14} className="shrink-0 mt-0.5 text-rose-400" />}
                                    </div>
                                    {(isCorrOpt || isSelOpt) && o.explanation && (
                                      <p className={`mt-1 mx-8 text-xs leading-relaxed ${
                                        isCorrOpt ? "text-emerald-400/80" : "text-rose-400/80"
                                      }`}>{o.explanation}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {/* View All Explanations button — only show if not in retest mode and at least one option has explanation */}
                        {!retestMode && ans.options && ans.options.some(o => o.explanation) && (
                          <div className="mt-4 pt-4 border-t border-gray-800/60">
                            <button
                              onClick={() => setReviewModal({ ans, qNum })}
                              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/35 text-cyan-400 text-xs font-semibold transition-all group">
                              <BookOpen size={13} className="group-hover:scale-110 transition-transform" />
                              View All Explanations
                            </button>
                          </div>
                        )}
                      </div>
                  </div>
                  </div>
                </>
              )
            })()}
          </div>

          {/* RIGHT — Leaderboard (same component as QuizDetail) */}
          <div className="lg:col-span-2 lg:sticky lg:top-6 lg:pl-3 space-y-3">
            <Leaderboard
              leaderboardKey={
                attempt.leaderboardKey
                  || getLeaderboardKey(attempt.quizId, { batchId: attempt.batchId || null, isFree: false })
              }
              currentUserId={currentUser.uid}
            />
            {(streak ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 px-1">
                <Flame size={11} className="text-orange-400 shrink-0" />
                <span className="text-orange-400/70 text-[11px]">{streak} question streak this attempt</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DEEP REVIEW MODAL ── */}
      {reviewModal && (() => {
        const { ans, qNum } = reviewModal
        const isCorr    = ans.selected === ans.correct
        const isSkip    = ans.selected === -1 || ans.selected === undefined || ans.selected === null
        const qType     = detectQType(ans.question || "")
        const typeBadge = Q_TYPE_BADGE[qType]
        const LETTERS   = ["A", "B", "C", "D"]

        // Outcome accent colours (reused across header strip + badge)
        const accentCls = isSkip
          ? { strip: "bg-gray-700", badge: "text-gray-400 bg-gray-800/80 border-gray-700", label: "Skipped" }
          : isCorr
            ? { strip: "bg-emerald-500", badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", label: "Correct ✓" }
            : { strip: "bg-rose-500",    badge: "text-rose-400 bg-rose-500/10 border-rose-500/25",          label: "Incorrect ✗" }

        // Render question body inside modal — same smart renderer but with slightly larger text
        function ModalQuestionBody() {
          const text  = ans.question || ""
          const lines = text.split("\n")
          const isMatchQ = text.includes("सूची-I") || text.includes("List-I")
          const isARQ    = text.includes("अभिकथन (A)") || text.includes("Assertion (A)") || text.includes("नीचे दो कथन दिए गए हैं")
          const isStmtQ  = text.includes("कथनों पर विचार") || RE_STATEMENT.test(text)

          if (isMatchQ) {
            let intro = "", secA = [], secB = [], curSec = "intro", colALabel = "सूची-I", colBLabel = "सूची-II"
            for (const line of lines) {
              const t = line.trim(); if (!t) { if (curSec === "A") curSec = "B"; continue }
              if (t.startsWith("सूची-II") || t.startsWith("List-II")) { colBLabel = t; curSec = "B"; continue }
              if (t.startsWith("सूची-I")  || t.startsWith("List-I"))  { colALabel = t; curSec = "A"; continue }
              if (curSec === "intro") intro = t; else if (curSec === "A") secA.push(t); else secB.push(t)
            }
            return (
              <div className="space-y-3">
                {intro && <p className="text-white text-sm font-semibold leading-relaxed">{intro}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-950/60 border border-cyan-500/20 rounded-xl p-3.5">
                    <p className="text-cyan-400 text-[10px] font-black mb-2.5 uppercase tracking-widest">{colALabel}</p>
                    {secA.map((l, i) => <p key={i} className="text-gray-300 text-xs py-0.5 leading-relaxed">{l}</p>)}
                  </div>
                  <div className="bg-gray-950/60 border border-violet-500/20 rounded-xl p-3.5">
                    <p className="text-violet-400 text-[10px] font-black mb-2.5 uppercase tracking-widest">{colBLabel}</p>
                    {secB.map((l, i) => <p key={i} className="text-gray-300 text-xs py-0.5 leading-relaxed">{l}</p>)}
                  </div>
                </div>
              </div>
            )
          }

          if (isARQ) {
            const aLine = lines.find(l => l.trim().startsWith("अभिकथन") || l.trim().startsWith("Assertion"))
            const rLine = lines.find(l => l.trim().startsWith("कारण")   || l.trim().startsWith("Reason"))
            const intro = lines[0]?.includes("नीचे दो कथन") ? lines[0].trim() : null
            const rest  = lines.filter(l => l.trim() && l !== aLine && l !== rLine && !l.includes("नीचे दो कथन"))
            return (
              <div className="space-y-2.5">
                {intro && <p className="text-gray-400 text-xs leading-relaxed">{intro}</p>}
                {aLine && (
                  <div className="bg-amber-500/6 border border-amber-500/20 rounded-xl px-4 py-3">
                    <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest block mb-1.5">अभिकथन (A)</span>
                    <p className="text-gray-200 text-sm leading-relaxed">{aLine.replace(RE_ASSERTION, "")}</p>
                  </div>
                )}
                {rLine && (
                  <div className="bg-blue-500/6 border border-blue-500/20 rounded-xl px-4 py-3">
                    <span className="text-blue-400 text-[10px] font-black uppercase tracking-widest block mb-1.5">कारण (R)</span>
                    <p className="text-gray-200 text-sm leading-relaxed">{rLine.replace(RE_REASON, "")}</p>
                  </div>
                )}
                {rest.map((l, i) => <p key={i} className="text-gray-300 text-sm font-medium leading-relaxed">{l}</p>)}
              </div>
            )
          }

          if (isStmtQ) {
            // Split out numbered statements and the stem
            const stmtLines = []
            const otherLines = []
            lines.forEach(l => {
              const t = l.trim()
              if (!t) return
              if (/^\d+[\.\)]/.test(t)) stmtLines.push(t)
              else otherLines.push(t)
            })
            return (
              <div className="space-y-2.5">
                {otherLines.map((l, i) => <p key={i} className="text-white text-sm font-semibold leading-relaxed">{l}</p>)}
                {stmtLines.length > 0 && (
                  <div className="bg-sky-500/5 border border-sky-500/15 rounded-xl px-4 py-3 space-y-2">
                    {stmtLines.map((l, i) => (
                      <div key={i} className="flex gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-md bg-sky-500/15 text-sky-400 text-[10px] font-black flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-gray-200 text-sm leading-relaxed">{l.replace(/^\d+[\.\)]\s*/, "")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          // Direct question
          return (
            <div className="space-y-0.5">
              {lines.map((line, li) =>
                line.trim() === "" ? <br key={li} /> : <p key={li} className="text-white text-sm leading-relaxed">{line}</p>
              )}
            </div>
          )
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4"
            onClick={() => setReviewModal(null)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />

            {/* Modal panel */}
            <div
              className="relative w-full lg:max-w-3xl bg-gray-900 border border-gray-700/50 rounded-t-3xl lg:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] lg:max-h-[90vh] lg:[height:fit-content]"
              style={{ boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Outcome colour strip */}
              <div className={`h-1 w-full rounded-t-3xl lg:rounded-t-2xl shrink-0 ${accentCls.strip}`} />

              {/* Drag handle — mobile only */}
              <div className="flex justify-center pt-2 pb-0.5 lg:hidden shrink-0">
                <div className="w-9 h-1 rounded-full bg-gray-700/80" />
              </div>

              {/* ── HEADER ── */}
              <div className="px-5 pt-3 pb-3 border-b border-gray-800/70 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black text-gray-400 tracking-wide">Q{qNum}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border leading-none ${typeBadge.cls}`}>{typeBadge.label}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border leading-none ${accentCls.badge}`}>{accentCls.label}</span>
                  <button onClick={() => setReviewModal(null)}
                    className="ml-auto p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800/80 transition-colors">
                    <X size={15} />
                  </button>
                </div>
                <ModalQuestionBody />
              </div>

              {/* ── BODY ── */}
              <div className="overflow-y-auto flex-1 min-h-0 px-5 py-3 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-2">All Options &amp; Explanations</p>

                {ans.options.map((o, k) => {
                  const isCorrOpt = k === ans.correct
                  const isSelOpt  = k === ans.selected
                  const isWrong   = isSelOpt && !isCorrOpt
                  const letter    = LETTERS[k]
                  const optText   = typeof o === "string" ? o : o.text
                  const expl      = typeof o === "string" ? null : o.explanation

                  const cardBorder = isCorrOpt ? "border-emerald-500/35" : isWrong ? "border-rose-500/35" : "border-gray-800/50"
                  const headerBg   = isCorrOpt ? "bg-emerald-500/8"      : isWrong ? "bg-rose-500/8"      : "bg-gray-800/20"
                  const explBg     = isCorrOpt ? "bg-emerald-500/5 border-emerald-500/12 text-emerald-300/85"
                                   : isWrong   ? "bg-rose-500/5 border-rose-500/12 text-rose-300/75"
                                   : "bg-gray-900/50 border-gray-800/40 text-gray-500"
                  const dotBg  = isCorrOpt ? "bg-emerald-500 text-white" : isWrong ? "bg-rose-500 text-white" : "bg-gray-800 text-gray-500"
                  const textCls = isCorrOpt ? "text-white font-medium" : isWrong ? "text-rose-200" : "text-gray-500"

                  return (
                    <div key={k} className={`rounded-lg border overflow-hidden ${cardBorder}`}>
                      {/* Option row */}
                      <div className={`flex items-center gap-2.5 px-3 py-2 ${headerBg}`}>
                        <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${dotBg}`}>
                          {letter}
                        </span>
                        <p className={`flex-1 text-xs leading-snug ${textCls}`}>{optText}</p>
                        <span className="shrink-0 flex items-center gap-1">
                          {isCorrOpt && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle size={13} />
                              {isSelOpt && <span className="text-[10px] font-bold text-emerald-400/70">Your answer</span>}
                            </span>
                          )}
                          {isWrong && (
                            <span className="flex items-center gap-1 text-rose-400">
                              <XCircle size={13} />
                              <span className="text-[10px] font-bold text-rose-400/70">Your answer</span>
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Explanation */}
                      {expl ? (
                        <div className={`px-3 py-2 border-t text-[11px] leading-relaxed ${explBg}`}>
                          <span className={`inline-block text-[8px] font-black uppercase tracking-widest mr-1.5 ${
                            isCorrOpt ? "text-emerald-500/60" : isWrong ? "text-rose-500/60" : "text-gray-600"
                          }`}>Explanation —</span>
                          {expl}
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 border-t border-gray-800/30 bg-gray-900/30 flex items-center gap-1.5">
                          <MinusCircle size={9} className="text-gray-700 shrink-0" />
                          <p className="text-[10px] text-gray-700 italic">No explanation</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── FOOTER ── */}
              <div className="px-5 py-2.5 border-t border-gray-800/60 shrink-0 flex items-center gap-3">
                <p className="text-[10px] text-gray-600 flex-1">
                  {ans.options.filter(o => (typeof o === "object" && o.explanation)).length} of {ans.options.length} options have explanations
                </p>
                <button
                  onClick={() => setReviewModal(null)}
                  className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
