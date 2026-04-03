import { useEffect, useState, useRef, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, getDocs, addDoc, updateDoc, doc, query, where, getCountFromServer, increment, runTransaction } from "firebase/firestore"
import Leaderboard from "../../components/Leaderboard"
import Navbar from "../../components/Navbar"
import { ChevronRight, ChevronLeft, Flag, RotateCcw, Send } from "lucide-react"
import { useQuiz } from "../../hooks/useQuiz"
import { writeLeaderboardEntry, getLeaderboardKey } from "../../firebase/leaderboardService"
import { invalidateCache, cachedGetDoc, TTL_LONG } from "../../firebase/firestoreCache"
import QuizMobile from "./QuizMobile"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])
  return isMobile
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

const STATUS_STYLE = {
  not_visited:     "bg-gray-800 border-gray-700 text-gray-500",
  not_answered:    "bg-red-500/20 border-red-500/40 text-red-400",
  answered:        "bg-green-500/20 border-green-500/40 text-green-400",
  marked:          "bg-purple-500/20 border-purple-500/40 text-purple-400",
  marked_answered: "bg-purple-500/30 border-purple-500 text-purple-300",
}

//  Lobby 
function Lobby({ quiz, questions, onStart, wrongOnly = false }) {
  const totalSec    = (quiz.totalTime   || 10) * 60
  const marksPerQ   = quiz.marksPerQ    || 1
  const negativeMark= quiz.negativeMark || 0

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <div className="text-center mb-6">
            {wrongOnly ? (
              <span className="text-xs font-semibold uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full">
                Retry — Wrong Answers Only
              </span>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full">
                {quiz.category || "Quiz"}
              </span>
            )}
            <h1 className="text-2xl font-black text-white mt-3 mb-2">{quiz.title}</h1>
            {wrongOnly
              ? <p className="text-rose-400/80 text-sm">Practising {questions.length} question{questions.length !== 1 ? "s" : ""} you got wrong. No timer — take your time.</p>
              : quiz.description && <p className="text-gray-400 text-sm">{quiz.description}</p>
            }
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-cyan-400">{questions.length}</p>
              <p className="text-gray-500 text-xs mt-1">Questions</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-orange-400">{formatTime(totalSec)}</p>
              <p className="text-gray-500 text-xs mt-1">Duration</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-green-400">+{marksPerQ}</p>
              <p className="text-gray-500 text-xs mt-1">Correct</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-red-400">{negativeMark > 0 ? `-${negativeMark}` : "0"}</p>
              <p className="text-gray-500 text-xs mt-1">Wrong</p>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
            <p className="text-gray-400 text-xs font-semibold mb-3 uppercase tracking-wider">Question Status Legend</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { style: STATUS_STYLE.answered,        label: "Answered" },
                { style: STATUS_STYLE.not_answered,    label: "Not Answered" },
                { style: STATUS_STYLE.marked,          label: "Marked for Review" },
                { style: STATUS_STYLE.marked_answered, label: "Answered + Marked" },
                { style: STATUS_STYLE.not_visited,     label: "Not Visited" },
              ].map(({ style, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-md border flex items-center justify-center text-xs font-bold ${style}`}>1</span>
                  <span className="text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => {
              // Request full-screen before starting — gracefully falls back if browser denies
              try {
                const el = document.documentElement
                if (el.requestFullscreen) el.requestFullscreen()
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
              } catch {}
              onStart()
            }}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-black py-4 rounded-xl transition text-lg">
            Start Quiz →
          </button>
          <p className="text-gray-600 text-xs mt-3 text-center">Opens in full-screen · Timer starts immediately.</p>
        </div>
      </div>
    </div>
  )
}

//  Engine 
// FIX: The previous version had "return null // placeholder" here which caused
// the pure black screen. This is the complete, working Engine implementation
// restored from the original Quiz.jsx.
function Engine({ quiz, questions, onFinish, wrongOnly = false, bookmarkMode = false }) {
  const totalSeconds  = (quiz.totalTime   || 10) * 60
  const marksPerQ     = quiz.marksPerQ    || 1
  const negativeMark  = quiz.negativeMark || 0

  const isMobile = useIsMobile()

  //  Fix #2: sessionStorage draft key  -  unique per quiz 
  // On every answer change and timer tick we persist state so the student
  // can refresh the page without losing their work.
  const DRAFT_KEY = `quiz_draft_${quiz.id}`

  // Restore from sessionStorage if a valid draft exists for this quiz
  function loadDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return null
      const draft = JSON.parse(raw)
      // Sanity checks: must be same quiz, same question count, not expired
      if (draft.quizId !== quiz.id) return null
      if (draft.qStates?.length !== questions.length) return null
      const elapsed = Math.floor((Date.now() - draft.savedAt) / 1000)
      const remaining = draft.timeLeft - elapsed
      if (remaining <= 0) return null   // time already ran out
      return { qStates: draft.qStates, timeLeft: remaining, current: draft.current ?? 0 }
    } catch { return null }
  }

  const draft = loadDraft()

  const [timeLeft,    setTimeLeft]    = useState(draft?.timeLeft ?? totalSeconds)
  const [current,     setCurrent]     = useState(draft?.current  ?? 0)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640)
  const [qStates,     setQStates]     = useState(
    draft?.qStates ?? questions.map(() => ({ selected: null, marked: false }))
  )
  // Fix #1: track tab switches for admin transparency
  const [tabSwitches,   setTabSwitches]  = useState(0)
  const [hiddenBanner,  setHiddenBanner] = useState(false)
  const [submitWarning, setSubmitWarning] = useState(false)  // inline confirm instead of window.confirm

  const timerRef      = useRef(null)
  const finishedRef   = useRef(false)
  const qStatesRef    = useRef(qStates)
  const tabHideRef    = useRef(null)  // timestamp when tab was hidden
  const tabSwitchRef  = useRef(0)
  qStatesRef.current  = qStates

  //  Fix #2: persist draft to sessionStorage on every state change 
  useEffect(() => {
    if (finishedRef.current) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        quizId:   quiz.id,
        qStates,
        timeLeft,
        current,
        savedAt:  Date.now(),
      }))
    } catch { /* sessionStorage full  -  ignore, don't break quiz */ }
  }, [qStates, timeLeft, current])

  //  Fix #1: pause timer when tab is hidden 
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        // Tab hidden  -  pause the timer, record when it was hidden
        clearInterval(timerRef.current)
        timerRef.current = null
        tabHideRef.current = Date.now()
        tabSwitchRef.current += 1
        setTabSwitches(n => n + 1)
        setHiddenBanner(true)
      } else {
        // Tab visible again  -  subtract elapsed hidden time from timeLeft
        setHiddenBanner(false)
        if (tabHideRef.current) {
          const hiddenSecs = Math.floor((Date.now() - tabHideRef.current) / 1000)
          tabHideRef.current = null
          setTimeLeft(t => {
            const adjusted = Math.max(0, t - hiddenSecs)
            if (adjusted <= 0) {
              // Time ran out while hidden  -  submit immediately
              handleSubmit()
              return 0
            }
            return adjusted
          })
        }
        // Restart the interval
        if (!finishedRef.current) {
          timerRef.current = setInterval(() => {
            setTimeLeft(t => {
              if (t <= 1) {
                clearInterval(timerRef.current)
                handleSubmit()
                return 0
              }
              return t - 1
            })
          }, 1000)
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Main timer interval
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          handleSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getStatus(i) {
    const s = qStates[i]
    if (i === current && s.selected === null && !s.marked) return "not_visited"
    if (s.marked && s.selected !== null) return "marked_answered"
    if (s.marked) return "marked"
    if (s.selected !== null) return "answered"
    if (i < current) return "not_answered"
    return "not_visited"
  }

  function selectOption(optIdx) {
    setQStates(prev => prev.map((s, i) => i === current ? { ...s, selected: optIdx } : s))
  }

  function clearResponse() {
    setQStates(prev => prev.map((s, i) => i === current ? { ...s, selected: null } : s))
  }

  function toggleMark() {
    setQStates(prev => prev.map((s, i) => i === current ? { ...s, marked: !s.marked } : s))
  }

  function saveAndNext() {
    if (current < questions.length - 1) setCurrent(c => c + 1)
    else setCurrent(0) // last question -> wrap to Q1 for review
  }

  function handleSubmit() {
    if (finishedRef.current) return
    finishedRef.current = true
    clearInterval(timerRef.current)

    // Fix #2: clear the saved draft so a refresh after submit goes to lobby
    try { sessionStorage.removeItem(DRAFT_KEY) } catch {}

    // Exit full-screen when quiz ends
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen()
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
      }
    } catch {}

    const states = qStatesRef.current
    let streak = 0, bestStreak = 0

    const answers = questions.map((q, i) => {
      const selected  = states[i].selected
      const isCorrect = selected === q.correct
      if (isCorrect) { streak++; bestStreak = Math.max(bestStreak, streak) }
      else streak = 0
      return {
        question: q.question,
        options:  q.options,
        correct:  q.correct,
        selected: selected === null ? -1 : selected,
      }
    })

    const correct   = answers.filter(a => a.selected === a.correct).length
    const attempted = answers.filter(a => a.selected !== -1).length
    const incorrect = attempted - correct
    const score     = (correct * marksPerQ) - (incorrect * negativeMark)
    const maxScore  = questions.length * marksPerQ

    // Pass tabSwitches and timeTaken (seconds elapsed) so both are stored on attempt doc
    const timeTaken = totalSeconds - timeLeft
    onFinish({ score, maxScore, answers, bestStreak, marksPerQ, negativeMark,
               tabSwitches: tabSwitchRef.current, timeTaken })
  }

  function confirmSubmit() {
    const answered   = qStates.filter(s => s.selected !== null).length
    const unanswered = questions.length - answered
    if (unanswered > 0) {
      setSubmitWarning(true)   // show inline warning instead of blocking window.confirm
      return
    }
    handleSubmit()
  }

  const q            = questions[current]
  const currentState = qStates[current]
  const isLowTime    = timeLeft <= 60
  const answered     = qStates.filter(s => s.selected !== null).length
  const marked       = qStates.filter(s => s.marked).length
  const notVisited   = qStates.filter((s, i) => i > current && s.selected === null && !s.marked).length

  // ── Mobile: render dedicated mobile component ─────────────────────────────
  if (isMobile) {
    return (
      <QuizMobile
        quiz={quiz}
        questions={questions}
        current={current}
        setCurrent={setCurrent}
        qStates={qStates}
        timeLeft={timeLeft}
        isLowTime={isLowTime}
        wrongOnly={wrongOnly}
        bookmarkMode={bookmarkMode}
        hiddenBanner={hiddenBanner}
        tabSwitches={tabSwitches}
        submitWarning={submitWarning}
        setSubmitWarning={setSubmitWarning}
        marksPerQ={marksPerQ}
        negativeMark={negativeMark}
        selectOption={selectOption}
        clearResponse={clearResponse}
        toggleMark={toggleMark}
        saveAndNext={saveAndNext}
        confirmSubmit={confirmSubmit}
        handleSubmit={handleSubmit}
        getStatus={getStatus}
      />
    )
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Fix #1: Tab-hidden warning banner */}
      {hiddenBanner && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-6 py-2 flex items-center justify-center gap-2 shrink-0">
          <span className="text-amber-400 text-xs font-bold uppercase tracking-wide">
            (!) Timer paused  -  return to this tab to continue. Tab switches: {tabSwitches}
          </span>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-3 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-bold text-white truncate text-sm">{quiz.title}</h1>
          {wrongOnly && (
            <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-full shrink-0">
              Wrong Only · {questions.length}Q
            </span>
          )}
          {bookmarkMode && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full shrink-0">
              📌 Bookmarks · {questions.length}Q
            </span>
          )}
          {quiz.category && !wrongOnly && !bookmarkMode && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded hidden sm:block">
              {quiz.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 font-black text-xl px-4 py-1.5 rounded-lg ${
              isLowTime ? "text-red-400 bg-red-500/10 animate-pulse" : "text-cyan-400 bg-cyan-500/10"
            }`}>
              {formatTime(timeLeft)}
            </div>
            {tabSwitches > 0 && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full font-semibold" title="Tab switches detected">
                {tabSwitches} switch{tabSwitches > 1 ? "es" : ""}
              </span>
            )}
          </div>
          <button onClick={confirmSubmit}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2 rounded-lg transition text-sm">
            <Send size={14} /> Submit
          </button>
        </div>
      </div>

      {/* Inline submit warning  -  replaces window.confirm */}
      {submitWarning && (() => {
        const answered   = qStates.filter(s => s.selected !== null).length
        const unanswered = questions.length - answered
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Send size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Submit quiz?</p>
                  <p className="text-amber-400 text-xs mt-0.5">{unanswered} question{unanswered !== 1 ? "s" : ""} unanswered</p>
                </div>
              </div>
              <p className="text-gray-400 text-xs mb-5 leading-relaxed">
                You still have {unanswered} unanswered question{unanswered !== 1 ? "s" : ""}. Unanswered questions score 0. Are you sure you want to submit now?
              </p>
              <div className="flex gap-2">
                <button onClick={() => setSubmitWarning(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm font-semibold transition">
                  Go back
                </button>
                <button onClick={() => { setSubmitWarning(false); handleSubmit() }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-gray-900 text-sm font-bold transition">
                  Submit anyway
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      <div className="flex flex-1 overflow-hidden">
        {/* Question area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-gray-900/50 border-b border-gray-800 px-3 sm:px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="font-semibold text-white">Question No. {current + 1}</span>
              <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded font-bold">
                +{marksPerQ}
              </span>
              {negativeMark > 0 && (
                <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-bold">
                  -{negativeMark}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
            {/* Smart question renderer  -  handles all 4 question types */}
            {(() => {
              const text = q.question || ""
              const isMatch = text.includes("सूची-I") || text.includes("List-I") || text.includes("Column-I")
              const isAR    = text.includes("अभिकथन (A)") || text.includes("Assertion (A)") || text.includes("नीचे दो कथन दिए गए हैं")
              const lines   = text.split("\n")

              if (isMatch) {
                // सूची (Match-the-list)  -  render two columns side by side
                let intro="", secA=[], secB=[], curSec="intro", colALabel="सूची-I", colBLabel="सूची-II"
                for (const line of lines) {
                  const t = line.trim(); if (!t) { if(curSec==="A") curSec="B"; continue }
                  if (t.startsWith("सूची-II") || t.startsWith("List-II") || t.startsWith("Column-II")) { colBLabel=t; curSec="B"; continue }
                  if (t.startsWith("सूची-I")  || t.startsWith("List-I")  || t.startsWith("Column-I"))  { colALabel=t; curSec="A"; continue }
                  if (curSec==="intro") intro=t
                  else if (curSec==="A") secA.push(t)
                  else secB.push(t)
                }
                return (
                  <div className="mb-8">
                    {intro && <p className="text-white text-base font-medium mb-4">{intro}</p>}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-900 border border-cyan-500/20 rounded-xl p-4">
                        <p className="text-cyan-400 text-xs font-bold mb-3 uppercase tracking-wide">{colALabel}</p>
                        <div className="space-y-2">
                          {secA.map((l,i) => <p key={i} className="text-gray-200 text-sm">{l}</p>)}
                        </div>
                      </div>
                      <div className="bg-gray-900 border border-violet-500/20 rounded-xl p-4">
                        <p className="text-violet-400 text-xs font-bold mb-3 uppercase tracking-wide">{colBLabel}</p>
                        <div className="space-y-2">
                          {secB.map((l,i) => <p key={i} className="text-gray-200 text-sm">{l}</p>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              if (isAR) {
                // Assertion-Reason  -  render A and R as distinct labelled blocks, then trailing instruction
                const aLine = lines.find(l => l.trim().startsWith("अभिकथन") || l.trim().startsWith("Assertion"))
                const rLine = lines.find(l => l.trim().startsWith("कारण")   || l.trim().startsWith("Reason"))
                const rest  = lines.filter(l => l.trim() && l!==aLine && l!==rLine && !l.includes("नीचे दो कथन"))
                return (
                  <div className="mb-8 space-y-3">
                    {lines[0]?.includes("नीचे दो कथन") && <p className="text-gray-400 text-sm">{lines[0].trim()}</p>}
                    {aLine && (
                      <div className="bg-gray-900 border border-amber-500/20 rounded-xl px-4 py-3">
                        <span className="text-amber-400 text-[11px] font-bold uppercase tracking-wider block mb-1">अभिकथन (A)</span>
                        <p className="text-gray-200 text-sm leading-relaxed">{aLine.replace(/^अभिकथन\s*\(A\)\s*[:\-]?\s*/,"").replace(/^Assertion\s*\(A\)\s*[:\-]?\s*/,"")}</p>
                      </div>
                    )}
                    {rLine && (
                      <div className="bg-gray-900 border border-blue-500/20 rounded-xl px-4 py-3">
                        <span className="text-blue-400 text-[11px] font-bold uppercase tracking-wider block mb-1">कारण (R)</span>
                        <p className="text-gray-200 text-sm leading-relaxed">{rLine.replace(/^कारण\s*\(R\)\s*[:\-]?\s*/,"").replace(/^Reason\s*\(R\)\s*[:\-]?\s*/,"")}</p>
                      </div>
                    )}
                    {rest.map((l,i) => <p key={i} className="text-gray-300 text-sm font-medium">{l}</p>)}
                  </div>
                )
              }

              // Default  -  plain / statement (कथन)  -  preserve all newlines as-is
              return (
                <div className="text-white text-base font-medium leading-relaxed mb-8 space-y-1">
                  {lines.map((line,li) =>
                    line.trim()==="" ? <br key={li}/> : <p key={li}>{line}</p>
                  )}
                </div>
              )
            })()}
            <div className="space-y-3">
              {q.options.map((opt, i) => {
                const isSelected = currentState.selected === i
                return (
                  <div key={i} onClick={() => selectOption(i)}
                    className={`flex items-start gap-4 px-5 py-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-gray-800 bg-gray-900 hover:border-gray-600"
                    }`}>
                    <span className={`shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition ${
                      isSelected
                        ? "border-cyan-500 bg-cyan-500 text-gray-900"
                        : "border-gray-600 text-gray-500"
                    }`}>
                      {["A","B","C","D"][i]}
                    </span>
                    <div className={`text-sm leading-relaxed pt-1 ${isSelected ? "text-white" : "text-gray-300"}`}>
                      {opt.text.split("\n").map((line, li) =>
                        line.trim() === "" ? <br key={li} /> : <p key={li}>{line}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-gray-900 border-t border-gray-800 px-3 sm:px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={toggleMark}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  currentState.marked
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}>
                <Flag size={14} />
                {currentState.marked ? "Marked" : "Mark for Review"}
              </button>
              <button onClick={clearResponse}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-400 hover:text-white transition">
                <RotateCcw size={14} /> Clear
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => current > 0 && setCurrent(c => c - 1)}
                disabled={current === 0}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-400 hover:text-white transition disabled:opacity-30">
                <ChevronLeft size={14} /> Prev
              </button>
              <button onClick={saveAndNext}
                className="flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-gray-900 transition">
                {current === questions.length - 1
                  ? <><RotateCcw size={13} /> Back to Q1</>
                  : <>Save & Next <ChevronRight size={14} /></>
                }
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className={`${sidebarOpen ? "w-72" : "w-0"} bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden transition-all duration-200 shrink-0`}>
          {sidebarOpen && (
            <>
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-white font-semibold text-sm">Question Palette</p>
              </div>
              <div className="px-4 py-3 border-b border-gray-800 space-y-2">
                {[
                  { style: STATUS_STYLE.answered,     label: "Answered",     count: answered },
                  { style: STATUS_STYLE.marked,       label: "Marked",       count: marked },
                  { style: STATUS_STYLE.not_visited,  label: "Not Visited",  count: notVisited },
                  { style: STATUS_STYLE.not_answered, label: "Not Answered", count: questions.length - answered - notVisited },
                ].map(({ style, label, count }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded border flex items-center justify-center text-xs font-bold ${style}`}>
                        {count}
                      </span>
                      <span className="text-gray-400 text-xs">{label}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-b border-gray-800">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Section: Test</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((_, i) => {
                    const status = getStatus(i)
                    return (
                      <button key={i} onClick={() => setCurrent(i)}
                        className={`w-10 h-10 rounded-lg border text-sm font-bold transition ${STATUS_STYLE[status]} ${
                          i === current ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-900" : ""
                        }`}>
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="p-4 border-t border-gray-800">
                <button onClick={confirmSubmit}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-black py-3 rounded-xl transition">
                  Submit Test
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-12 bg-gray-700 hover:bg-gray-600 flex items-center justify-center rounded-l-lg transition z-10"
          style={{ right: sidebarOpen ? "288px" : "0px" }}>
          {sidebarOpen
            ? <ChevronRight size={12} className="text-gray-300" />
            : <ChevronLeft  size={12} className="text-gray-300" />}
        </button>
      </div>
    </div>
  )
}

//  Result 
function Result({ quiz, quizId, result, attemptNumber, attemptId, savingAttempt, saveError, onRetrySave, onRetry, wrongOnly = false, bookmarkMode = false, activeQuestions = [] }) {
  const navigate = useNavigate()
  const { score, maxScore, answers, bestStreak, marksPerQ = 1, negativeMark = 0 } = result
  const totalQ    = answers.length
  const attempted = answers.filter(a => a.selected !== -1).length
  const correct   = answers.filter(a => a.selected === a.correct).length
  const incorrect = attempted - correct
  const skipped   = totalQ - attempted
  const scoreDisplay = Number.isInteger(score) ? score : Number(score.toFixed(2))

  const scoreColor = score >= maxScore * 0.8 ? "text-emerald-400"
                   : score >= maxScore * 0.6 ? "text-amber-400"
                   : score >  0              ? "text-rose-400"
                   : "text-gray-400"

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-10">

        {/* Result card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 text-center mb-4">
          <p className="text-gray-500 text-sm mb-1">{quiz.title}</p>
          {attemptNumber > 1 && (
            <span className="inline-block text-[11px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full mb-4">
              Attempt #{attemptNumber}
            </span>
          )}
          <div className="my-5">
            <p className={`text-6xl font-black leading-none ${scoreColor}`}>
              {scoreDisplay}
              <span className="text-2xl font-semibold text-gray-600">/{maxScore}</span>
            </p>
            <p className="text-gray-600 text-xs mt-2">marks</p>
          </div>
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className="text-emerald-400 font-bold">{correct}</span>
            <span className="text-gray-700 text-xs">correct</span>
            <span className="text-gray-700 text-xs">.</span>
            <span className="text-rose-400 font-bold">{incorrect}</span>
            <span className="text-gray-700 text-xs">wrong</span>
            <span className="text-gray-700 text-xs">.</span>
            <span className="text-gray-500 font-bold">{skipped}</span>
            <span className="text-gray-700 text-xs">skipped</span>
            {bestStreak > 0 && (
              <>
                <span className="text-gray-700 text-xs">.</span>
                <span className="text-orange-400 font-bold">{bestStreak}</span>
                <span className="text-gray-700 text-xs">streak</span>
              </>
            )}
          </div>
        </div>

        {/* Saving animation - full card, replaces buttons while saving */}
        {savingAttempt ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-8 text-center">
            {/* Three bouncing dots */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {[0,1,2].map(i => (
                <div key={i}
                  className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                  style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
            <p className="text-white text-sm font-semibold">Saving your score</p>
            <p className="text-gray-600 text-xs mt-1">Hang on just a second...</p>
            <style>{`
              @keyframes bounce {
                0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
                40% { transform: translateY(-8px); opacity: 1; }
              }
            `}</style>
          </div>
        ) : (
          <>
            {saveError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 mb-3">
                <p className="text-rose-400 text-sm mb-2">{saveError}</p>
                <button onClick={onRetrySave}
                  className="text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 px-3 py-1.5 rounded-lg transition">
                  Retry Save
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {attemptId && !wrongOnly && !bookmarkMode && (
                <button onClick={() => navigate(`/attempt/${attemptId}`)}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold py-3.5 rounded-xl transition text-sm">
                  Review Answers
                </button>
              )}
              <button onClick={onRetry}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition text-sm">
                {wrongOnly ? "Retry Wrong Again" : bookmarkMode ? "Practice Again" : "Retry Quiz"}
              </button>
              <button onClick={() => navigate("/dashboard")}
                className="w-full bg-gray-900 hover:bg-gray-800 text-gray-500 hover:text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
                Back to Dashboard
              </button>
            </div>
          </>
        )}

        {/* ── Inline answer review for wrongOnly / bookmarkMode ── */}
        {(wrongOnly || bookmarkMode) && activeQuestions.length > 0 && (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1">
              {wrongOnly ? "Questions Reviewed" : "Bookmark Questions"}
            </p>
            {activeQuestions.map((q, idx) => {
              const ans      = result.answers[idx]
              const selected = ans?.selected ?? -1
              const correct  = q.correct
              const isCorrect= selected === correct
              const isSkipped= selected === -1
              const statusColor = isSkipped ? "border-gray-700 bg-gray-900" : isCorrect ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
              const badge = isSkipped ? "Skipped" : isCorrect ? "Correct ✓" : "Wrong ✗"
              const badgeColor = isSkipped ? "text-gray-500 bg-gray-800" : isCorrect ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
              return (
                <div key={idx} className={`rounded-xl border p-4 ${statusColor}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-white text-sm font-medium leading-relaxed flex-1">{q.question}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>{badge}</span>
                  </div>
                  <div className="space-y-1.5">
                    {(q.options || []).map((opt, oi) => {
                      const optText   = typeof opt === "string" ? opt : opt.text || ""
                      const isCorrectOpt  = oi === correct
                      const isSelectedOpt = oi === selected
                      const optStyle = isCorrectOpt
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : isSelectedOpt && !isCorrectOpt
                          ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                          : "border-gray-800 text-gray-500"
                      return (
                        <div key={oi} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs ${optStyle}`}>
                          <span className={`w-5 h-5 rounded-full border flex items-center justify-center font-bold shrink-0 text-[10px] ${
                            isCorrectOpt ? "border-emerald-500 text-emerald-400" :
                            isSelectedOpt ? "border-rose-500 text-rose-400" :
                            "border-gray-700 text-gray-600"
                          }`}>
                            {["A","B","C","D"][oi]}
                          </span>
                          <span className="flex-1">{optText}</span>
                          {isCorrectOpt  && <span className="text-emerald-400 font-bold shrink-0">✓</span>}
                          {isSelectedOpt && !isCorrectOpt && <span className="text-rose-400 font-bold shrink-0">✗</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

//  Main QuizPage 
export default function QuizPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const batchId   = searchParams.get("batchId")
  const wrongOnly    = searchParams.get("wrongOnly") === "true"
  const bookmarkMode = searchParams.get("bookmarkMode") === "true"
  const [batchName, setBatchName] = useState(null)

  // Fetch batch name once when batchId is known  -  used to tag the attempt doc
  useEffect(() => {
    if (!batchId) return
    cachedGetDoc(doc(db, "batches", batchId), { ttl: TTL_LONG })
      .then(b => b && setBatchName(b.name || null))
      .catch(() => {})
  }, [batchId])

  // wrongOnly: indices of questions the student got wrong, passed as ?wrong=0,3,7
  const wrongIndices = useMemo(() => {
    const raw = searchParams.get("wrong")
    if (!wrongOnly || !raw) return null
    try { return new Set(raw.split(",").map(Number)) }
    catch { return null }
  }, [wrongOnly, searchParams])

  const { currentUser, userProfile } = useAuth()

  const [screen,         setScreen]         = useState("lobby")
  const [result,         setResult]         = useState(null)
  const [attemptNumber,  setAttemptNumber]  = useState(1)
  const [savedAttemptId, setSavedAttemptId] = useState(null)
  const [savingAttempt,  setSavingAttempt]  = useState(false)  // FIX: show saving spinner
  const [saveError,      setSaveError]      = useState(null)   // FIX: surface save failures
  const [savedLbKey,     setSavedLbKey]     = useState(null)   // leaderboardKey stored after finish

  // useQuiz hook: caches quiz + questions in memory and sessionStorage.
  // Repeat visits to the same quiz cost 0 Firestore reads.
  const { quiz: firestoreQuiz, questions: firestoreQuestions, loading: firestoreLoading, error } = useQuiz(
    bookmarkMode ? null : id,
    { loadQuestions: !bookmarkMode }
  )

  // In bookmarkMode, build quiz + questions from sessionStorage
  const bookmarkQuiz = bookmarkMode ? (() => {
    try {
      const title = sessionStorage.getItem("bookmark_quiz_title") || "Bookmark Practice"
      return { id: "bookmarks", title, category: "Bookmarks", totalTime: 30, marksPerQ: 1, negativeMark: 0 }
    } catch { return null }
  })() : null

  const bookmarkQuestions = bookmarkMode ? (() => {
    try { return JSON.parse(sessionStorage.getItem("bookmark_quiz_questions") || "[]") }
    catch { return [] }
  })() : []

  const quiz      = bookmarkMode ? bookmarkQuiz      : firestoreQuiz
  const questions = bookmarkMode ? bookmarkQuestions : firestoreQuestions
  const loading   = bookmarkMode ? false             : firestoreLoading

  // userName from AuthContext cache  -  no extra getDoc needed
  const userName = userProfile?.name || currentUser?.displayName || currentUser?.email || ""

  // Redirect if quiz not found
  if (error) { navigate("/dashboard"); return null }

  // Optimized: 3 targeted queries instead of fetching all attempts.
  // All queries are scoped to the current context (batchId if in a batch,
  // otherwise global) so nextNum and rank are correct per leaderboard scope.
  async function getAttemptMetadata(myScore, myMaxScore) {
    try {
      // Query 1: This user's attempts for this quiz IN THIS CONTEXT
      // Scoping by batchId ensures attempt #1 in Batch A is independent
      // of attempt #1 in Batch B or as a free/open quiz.
      const myAttemptsSnap = await getDocs(
        batchId
          ? query(collection(db, "quizAttempts"),
              where("quizId",  "==", id),
              where("userId",  "==", currentUser.uid),
              where("batchId", "==", batchId))
          : query(collection(db, "quizAttempts"),
              where("quizId", "==", id),
              where("userId", "==", currentUser.uid))
      )
      const nextNum = myAttemptsSnap.size + 1

      // Rank is only meaningful on a user's first attempt in this context
      if (nextNum !== 1) return { nextNum, rank: null, totalParticipants: null }

      // Query 2: Count total unique participants in this context (first attempts only)
      const totalSnap = await getCountFromServer(
        batchId
          ? query(collection(db, "quizAttempts"),
              where("quizId",        "==", id),
              where("attemptNumber", "==", 1),
              where("batchId",       "==", batchId))
          : query(collection(db, "quizAttempts"),
              where("quizId",        "==", id),
              where("attemptNumber", "==", 1))
      )
      const totalParticipants = totalSnap.data().count + 1

      // Query 3: Count participants who scored strictly higher in this context
      const betterSnap = await getCountFromServer(
        batchId
          ? query(collection(db, "quizAttempts"),
              where("quizId",        "==", id),
              where("attemptNumber", "==", 1),
              where("batchId",       "==", batchId),
              where("score",         ">",  myScore))
          : query(collection(db, "quizAttempts"),
              where("quizId",        "==", id),
              where("attemptNumber", "==", 1),
              where("score",         ">",  myScore))
      )
      const rank = betterSnap.data().count + 1

      return { nextNum, rank, totalParticipants }
    } catch {
      return { nextNum: 1, rank: null, totalParticipants: null }
    }
  }

  async function handleFinish(res) {
    setResult(res)
    setSaveError(null)      // FIX: clear any previous error
    setSavingAttempt(true)  // FIX: show saving indicator
    setScreen("result")
    try {
      // Compute leaderboard key here — quiz is guaranteed loaded by the time
      // the user finishes, and id/batchId are stable URL-derived values.
      const leaderboardKey = getLeaderboardKey(id, { batchId, isFree: quiz?.isFree ?? false })
      setSavedLbKey(leaderboardKey)   // persist for Result render

      const { nextNum, rank, totalParticipants } = await getAttemptMetadata(res.score, res.maxScore)
      setAttemptNumber(nextNum)

      const ref = await addDoc(collection(db, "quizAttempts"), {
        userId:            currentUser.uid,
        quizId:            id,
        quizTitle:         quiz.title,
        score:             res.score,
        maxScore:          res.maxScore,
        pct:               (res.maxScore > 0) ? (res.score / res.maxScore) * 100 : 0,
        totalQ:            res.answers.length,
        streak:            res.bestStreak,
        category:          quiz.category || "",
        topic:             quiz.topic    || "",
        date:              new Date().toISOString(),
        attemptNumber:     nextNum,
        marksPerQ:         res.marksPerQ,
        negativeMark:      res.negativeMark,
        answers:           res.answers,
        userName,
        rank,
        totalParticipants,
        batchId:        batchId        || null,
        batchName:      batchName      || null,
        leaderboardKey: leaderboardKey || null,   // scoped key for leaderboard reads
        tabSwitches:    res.tabSwitches ?? 0,   // stored for admin review
        timeTaken:      res.timeTaken    ?? null, // seconds elapsed; null for legacy attempts
      })
      setSavedAttemptId(ref.id)

      // Write public leaderboard summary  -  first attempts only.
      // FIX: was incorrectly passing `quizId` (undefined) instead of `id`.
      if (nextNum === 1) {
        await writeLeaderboardEntry({
          leaderboardKey,
          userId:            currentUser.uid,
          displayName:       userName,
          score:             res.score,
          maxScore:          res.maxScore,
          rank,
          totalParticipants,
          date:              new Date().toISOString(),
          timeTaken:         res.timeTaken  ?? null,
          tabSwitches:       res.tabSwitches ?? 0,
        })
      }

      //  Update stats summary on the user doc 
      // Profile and History read these stats at 0 cost via AuthContext onSnapshot.
      const myPctForStats = res.maxScore > 0 ? (res.score / res.maxScore) * 100 : 0
      const isPassing     = myPctForStats >= 60
      const isExcellent   = myPctForStats >= 80
      const isGood        = myPctForStats >= 60 && myPctForStats < 80
      // avgScore is derived: Math.round(totalScore / totalAttempts)  -  no transaction needed
      // FIX: Only write fields that actually change  -  no increment(0) waste.
      // On a retry, firstAttempts/firstTotalScore/failCount never change.
      // passCount/excellentCount/goodCount only increment when true.
      // Fix #2: runTransaction for bestStreak + bestScore so concurrent
      // submissions from multiple devices can't silently drop a higher value.
      // The transaction reads the live doc value, compares, then writes  - 
      // all in one atomic operation. Other fields use increment() which is
      // already atomic and doesn't need a transaction.
      const userRef = doc(db, "users", currentUser.uid)
      await runTransaction(db, async tx => {
        const userSnap = await tx.get(userRef)
        const live = userSnap.data()?.stats || {}
        const statsUpdate = {
          "stats.totalAttempts": increment(1),
          "stats.totalScore":    increment(Math.round(myPctForStats)),
          // Atomic compare-and-set: read live value inside transaction
          "stats.bestStreak": Math.max(live.bestStreak ?? 0, res.bestStreak ?? 0),
          "stats.bestScore":  Math.max(live.bestScore  ?? 0, Math.round(myPctForStats)),
        }
        if (nextNum === 1) {
          statsUpdate["stats.firstAttempts"]   = increment(1)
          statsUpdate["stats.firstTotalScore"] = increment(Math.round(myPctForStats))
          if (!isPassing) statsUpdate["stats.failCount"] = increment(1)
        }
        if (isPassing)   statsUpdate["stats.passCount"]      = increment(1)
        if (isExcellent) statsUpdate["stats.excellentCount"] = increment(1)
        if (isGood)      statsUpdate["stats.goodCount"]      = increment(1)
        tx.update(userRef, statsUpdate)
      })
      // Invalidate the per-user attempts cache so Dashboard/Batches
      // fetch fresh data on next load after this new attempt.
      invalidateCache("query:myAttempts:" + currentUser.uid)

    } catch (e) {
      console.error("Failed to save attempt:", e)
      setSaveError("Your score was calculated but couldn't be saved. Tap Retry Save to try again.")
    } finally {
      setSavingAttempt(false)  // FIX: always clear saving state
    }
  }

  function handleRetry() {
    setResult(null)
    setSavedAttemptId(null)
    setScreen("lobby")
  }

  // Compute active question set — must be before any conditional returns
  const activeQuestions = (wrongOnly && wrongIndices && wrongIndices.size > 0)
    ? questions.filter((_, i) => wrongIndices.has(i))
    : questions

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading quiz...</p>
      </div>
    </div>
  )

  //  Guard: block access if quiz is not available 
  // This runs after loading so quiz is guaranteed non-null here.
  // QuizDetail correctly shows expired/unpublished state, but a user can
  // bypass it by navigating directly to /quiz/:id.
  if (quiz) {
    const now = new Date()
    const isPublished = quiz.status === "published" ||
      (quiz.status === "scheduled" && quiz.publishAt && new Date(quiz.publishAt) <= now)
    const isExpired = quiz.expiryDate && new Date(quiz.expiryDate) < now

    if (!isPublished || isExpired) {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
          <div className="text-center max-w-sm mx-auto px-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">{isExpired ? "" : ""}</span>
            </div>
            <h2 className="text-xl font-black text-white mb-2">
              {isExpired ? "Quiz Expired" : "Quiz Not Available"}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {isExpired
                ? "This quiz has closed and is no longer accepting submissions."
                : "This quiz is not currently available. It may be scheduled for a future date."}
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-6 py-2.5 rounded-xl transition text-sm"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )
    }
  }

  if (screen === "lobby")  return <Lobby  quiz={quiz} questions={activeQuestions} onStart={() => setScreen("quiz")} wrongOnly={wrongOnly} />
  if (screen === "quiz")   return <Engine quiz={quiz} questions={activeQuestions} onFinish={handleFinish} wrongOnly={wrongOnly} bookmarkMode={bookmarkMode} />
  // FIX: retry save without re-taking the quiz
  async function retrySave() {
    if (!result) return
    setSaveError(null)
    setSavingAttempt(true)
    try {
      // Compute fresh here — same reason as handleFinish
      const leaderboardKey = getLeaderboardKey(id, { batchId, isFree: quiz?.isFree ?? false })
      //  Duplicate-save guard 
      // The first save may have succeeded server-side but the client never
      // got the response (network drop after write). Before creating a new
      // document, check if one already exists for this user+quiz session.
      // We look for an attempt created in the last 5 minutes  -  tight enough
      // to avoid false-positives on genuine retries from the lobby screen.
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const existingSnap = await getDocs(
        query(
          collection(db, "quizAttempts"),
          where("userId", "==", currentUser.uid),
          where("quizId", "==", id),
          where("date", ">", fiveMinAgo)
        )
      )
      if (!existingSnap.empty) {
        // Attempt was actually saved  -  use the existing doc ID
        const existingId = existingSnap.docs[0].id
        setSavedAttemptId(existingId)
        setSaveError(null)
        invalidateCache("query:myAttempts:" + currentUser.uid)
        toast.success("Score was already saved!")
        return
      }

      // No existing attempt found  -  safe to create
      const { nextNum, rank, totalParticipants } = await getAttemptMetadata(result.score, result.maxScore)
      const ref = await addDoc(collection(db, "quizAttempts"), {
        userId: currentUser.uid, quizId: id, quizTitle: quiz.title,
        score: result.score, maxScore: result.maxScore,
        pct: result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0,
        totalQ: result.answers.length, streak: result.bestStreak,
        category: quiz.category || "", topic: quiz.topic || "", date: new Date().toISOString(),
        attemptNumber: nextNum, marksPerQ: result.marksPerQ,
        negativeMark: result.negativeMark, answers: result.answers,
        userName, rank, totalParticipants,
        batchId: batchId || null, batchName: batchName || null,
        leaderboardKey: leaderboardKey || null,
        tabSwitches: result.tabSwitches ?? 0,
      })
      setSavedAttemptId(ref.id)
      invalidateCache("query:myAttempts:" + currentUser.uid)
      toast.success("Score saved!")
    } catch (e) {
      console.error(e)
      setSaveError("Still couldn't save. Check your connection and try again.")
    } finally {
      setSavingAttempt(false)
    }
  }

  if (screen === "result") return (
    <Result
      quiz={quiz}
      quizId={id}
      leaderboardKey={savedLbKey}
      result={result}
      attemptNumber={attemptNumber}
      attemptId={savedAttemptId}
      savingAttempt={savingAttempt}
      saveError={saveError}
      onRetrySave={retrySave}
      onRetry={handleRetry}
      wrongOnly={wrongOnly}
      bookmarkMode={bookmarkMode}
      activeQuestions={activeQuestions}
    />
  )
}