/**
 * QuizMobile.jsx
 * Dedicated mobile quiz engine — rendered instead of the desktop Engine
 * when window width < 640px. Shares all state/logic via props from Quiz.jsx.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │  Header: title · timer · submit  │  fixed top
 *   ├─────────────────────────────────┤
 *   │  Sub-bar: Q#  +mark  /total      │  fixed
 *   ├─────────────────────────────────┤
 *   │                                  │
 *   │       Question text              │  scrollable
 *   │       Options (full-width)       │
 *   │                                  │
 *   ├─────────────────────────────────┤
 *   │  ← Prev  [Clear] [Mark] Next →  │  fixed bottom bar
 *   └─────────────────────────────────┘
 *   Bottom Sheet (palette) slides up on palette button tap
 */

import { useState, useRef } from "react"
import {
  ChevronLeft, ChevronRight, Flag, Send, RotateCcw,
  LayoutGrid, X
} from "lucide-react"

const STATUS_STYLE = {
  not_visited:     "bg-gray-800 border-gray-700 text-gray-500",
  not_answered:    "bg-red-500/20 border-red-500/40 text-red-400",
  answered:        "bg-green-500/20 border-green-500/40 text-green-400",
  marked:          "bg-purple-500/20 border-purple-500/40 text-purple-400",
  marked_answered: "bg-purple-500/30 border-purple-500 text-purple-300",
}

// ── Question renderer (match/AR/default) ──────────────────────────────────────
function QuestionBody({ q }) {
  const text  = q.question || ""
  const lines = text.split("\n")
  const isMatch = text.includes("सूची-I") || text.includes("List-I") || text.includes("Column-I")
  const isAR    = text.includes("अभिकथन (A)") || text.includes("Assertion (A)") || text.includes("नीचे दो कथन दिए गए हैं")

  if (isMatch) {
    let intro = "", secA = [], secB = [], curSec = "intro"
    let colALabel = "सूची-I", colBLabel = "सूची-II"
    for (const line of lines) {
      const t = line.trim()
      if (!t) { if (curSec === "A") curSec = "B"; continue }
      if (t.startsWith("सूची-II") || t.startsWith("List-II") || t.startsWith("Column-II")) { colBLabel = t; curSec = "B"; continue }
      if (t.startsWith("सूची-I")  || t.startsWith("List-I")  || t.startsWith("Column-I"))  { colALabel = t; curSec = "A"; continue }
      if (curSec === "intro") intro = t
      else if (curSec === "A") secA.push(t)
      else secB.push(t)
    }
    return (
      <div className="mb-5">
        {intro && <p className="text-white text-base font-medium mb-3 leading-relaxed">{intro}</p>}
        {/* On mobile, stack the two lists vertically for readability */}
        <div className="flex flex-col gap-2">
          <div className="bg-gray-900 border border-cyan-500/20 rounded-xl p-3">
            <p className="text-cyan-400 text-[10px] font-bold mb-2 uppercase tracking-wide">{colALabel}</p>
            <div className="space-y-1">
              {secA.map((l, i) => <p key={i} className="text-gray-200 text-sm leading-relaxed">{l}</p>)}
            </div>
          </div>
          <div className="bg-gray-900 border border-violet-500/20 rounded-xl p-3">
            <p className="text-violet-400 text-[10px] font-bold mb-2 uppercase tracking-wide">{colBLabel}</p>
            <div className="space-y-1">
              {secB.map((l, i) => <p key={i} className="text-gray-200 text-sm leading-relaxed">{l}</p>)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isAR) {
    const aLine = lines.find(l => l.trim().startsWith("अभिकथन") || l.trim().startsWith("Assertion"))
    const rLine = lines.find(l => l.trim().startsWith("कारण")   || l.trim().startsWith("Reason"))
    const rest  = lines.filter(l => l.trim() && l !== aLine && l !== rLine && !l.includes("नीचे दो कथन"))
    return (
      <div className="mb-5 space-y-2.5">
        {lines[0]?.includes("नीचे दो कथन") && <p className="text-gray-400 text-sm">{lines[0].trim()}</p>}
        {aLine && (
          <div className="bg-gray-900 border border-amber-500/20 rounded-xl px-3 py-2.5">
            <span className="text-amber-400 text-[10px] font-bold uppercase tracking-wider block mb-1">अभिकथन (A)</span>
            <p className="text-gray-200 text-sm leading-relaxed">
              {aLine.replace(/^अभिकथन\s*\(A\)\s*[:\-]?\s*/, "").replace(/^Assertion\s*\(A\)\s*[:\-]?\s*/, "")}
            </p>
          </div>
        )}
        {rLine && (
          <div className="bg-gray-900 border border-blue-500/20 rounded-xl px-3 py-2.5">
            <span className="text-blue-400 text-[10px] font-bold uppercase tracking-wider block mb-1">कारण (R)</span>
            <p className="text-gray-200 text-sm leading-relaxed">
              {rLine.replace(/^कारण\s*\(R\)\s*[:\-]?\s*/, "").replace(/^Reason\s*\(R\)\s*[:\-]?\s*/, "")}
            </p>
          </div>
        )}
        {rest.map((l, i) => <p key={i} className="text-gray-300 text-sm font-medium">{l}</p>)}
      </div>
    )
  }

  // Default / statement
  return (
    <div className="text-white text-base font-medium leading-relaxed mb-5 space-y-1">
      {lines.map((line, li) =>
        line.trim() === "" ? <br key={li} /> : <p key={li}>{line}</p>
      )}
    </div>
  )
}

// ── Mobile Engine ─────────────────────────────────────────────────────────────
export default function QuizMobile({
  quiz,
  questions,
  current, setCurrent,
  qStates,
  timeLeft,
  isLowTime,
  wrongOnly, bookmarkMode,
  hiddenBanner, tabSwitches,
  submitWarning, setSubmitWarning,
  marksPerQ, negativeMark,
  selectOption, clearResponse, toggleMark, saveAndNext,
  confirmSubmit, handleSubmit,
  getStatus,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const scrollRef = useRef(null)

  const q            = questions[current]
  const currentState = qStates[current]
  const answered     = qStates.filter(s => s.selected !== null).length
  const marked       = qStates.filter(s => s.marked).length
  const notAnswered  = qStates.filter((s, i) => i < current && s.selected === null && !s.marked).length

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  function goTo(idx) {
    setCurrent(idx)
    setPaletteOpen(false)
    // scroll question area to top
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function handleNext() {
    saveAndNext()
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function handlePrev() {
    if (current > 0) {
      setCurrent(c => c - 1)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
  }

  const isMarked = currentState.marked

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── Tab-hidden warning ── */}
      {hiddenBanner && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-center gap-2 shrink-0">
          <span className="text-amber-400 text-xs font-bold">⏸ Timer paused — return here to continue</span>
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <div className="bg-gray-900 border-b border-gray-800 px-3 py-2.5 flex items-center gap-2 shrink-0">
        {/* Title */}
        <p className="flex-1 min-w-0 text-xs font-semibold text-gray-300 truncate">
          {wrongOnly ? "Wrong Only" : bookmarkMode ? "📌 Bookmarks" : quiz.title}
        </p>
        {/* Tab switch warning */}
        {tabSwitches > 0 && (
          <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
            {tabSwitches}⚠
          </span>
        )}
        {/* Timer */}
        <div className={`flex items-center font-black text-lg px-3 py-1 rounded-lg shrink-0 ${
          isLowTime ? "text-red-400 bg-red-500/10 animate-pulse" : "text-cyan-400 bg-cyan-500/10"
        }`}>
          {formatTime(timeLeft)}
        </div>
        {/* Submit */}
        <button
          onClick={confirmSubmit}
          className="flex items-center gap-1.5 bg-cyan-500 active:bg-cyan-400 text-gray-900 font-bold px-3 py-2 rounded-lg text-xs shrink-0 transition"
        >
          <Send size={13} /> Submit
        </button>
      </div>

      {/* ── SUB BAR: Q# · marks · progress ── */}
      <div className="bg-gray-900/60 border-b border-gray-800/60 px-3 py-1.5 flex items-center gap-2 shrink-0">
        <span className="text-xs font-bold text-white">Q{current + 1}</span>
        <span className="text-gray-600 text-xs">/ {questions.length}</span>
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden mx-1">
          <div
            className="h-full bg-cyan-500/60 rounded-full transition-all duration-300"
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded font-bold">
          +{marksPerQ}
        </span>
        {negativeMark > 0 && (
          <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">
            -{negativeMark}
          </span>
        )}
        {/* Palette open button */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-1 ml-1 text-[10px] text-gray-400 bg-gray-800 border border-gray-700 px-2 py-1 rounded-lg active:bg-gray-700 transition"
        >
          <LayoutGrid size={11} />
          <span className="text-green-400 font-bold">{answered}</span>
          <span className="text-gray-600">/</span>
          <span className="font-bold">{questions.length}</span>
        </button>
      </div>

      {/* ── SCROLLABLE QUESTION + OPTIONS AREA ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <QuestionBody q={q} />

        {/* Options */}
        <div className="space-y-2.5 pb-4">
          {q.options.map((opt, i) => {
            const isSelected = currentState.selected === i
            const optText = typeof opt === "string" ? opt : opt.text || ""
            return (
              <button
                key={i}
                onClick={() => selectOption(i)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border text-left transition-all duration-150 active:scale-[0.99] ${
                  isSelected
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-gray-800 bg-gray-900 active:border-gray-600"
                }`}
              >
                <span className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold transition ${
                  isSelected
                    ? "border-cyan-500 bg-cyan-500 text-gray-900"
                    : "border-gray-600 text-gray-500"
                }`}>
                  {["A", "B", "C", "D"][i]}
                </span>
                <div className={`text-sm leading-relaxed pt-0.5 ${isSelected ? "text-white" : "text-gray-300"}`}>
                  {optText.split("\n").map((line, li) =>
                    line.trim() === "" ? <br key={li} /> : <p key={li}>{line}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── BOTTOM ACTION BAR ── fixed height, no wrapping ── */}
      <div className="bg-gray-900 border-t border-gray-800 px-3 py-2 flex items-center gap-2 shrink-0 safe-area-inset-bottom" style={{ height: 60 }}>

        {/* ← Prev — icon only, fixed width */}
        <button
          onClick={handlePrev}
          disabled={current === 0}
          className="w-11 h-10 shrink-0 flex items-center justify-center rounded-xl border border-gray-800 bg-gray-900/60 text-gray-400 disabled:opacity-25 active:bg-gray-800 transition"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Clear — icon + text, fixed, only shifts layout when answered */}
        <button
          onClick={clearResponse}
          disabled={currentState.selected === null}
          className="w-16 h-10 shrink-0 flex items-center justify-center gap-1 text-[11px] font-medium border rounded-xl transition disabled:opacity-20 disabled:pointer-events-none border-gray-800 text-gray-500 active:bg-gray-800"
        >
          <X size={11} /> Clear
        </button>

        {/* Mark — flex-1, fixed text, no wrapping */}
        <button
          onClick={toggleMark}
          className={`flex-1 h-10 flex items-center justify-center gap-1.5 text-[11px] font-bold rounded-xl border transition whitespace-nowrap overflow-hidden ${
            isMarked
              ? "bg-purple-500/15 text-purple-400 border-purple-500/30 active:bg-purple-500/25"
              : "bg-gray-900/60 text-gray-500 border-gray-800 active:bg-gray-800"
          }`}
        >
          <Flag size={12} className="shrink-0" />
          <span className="truncate">{isMarked ? "Marked ✓" : "Mark"}</span>
        </button>

        {/* Next → / Q1 — fixed width */}
        <button
          onClick={handleNext}
          className="w-20 h-10 shrink-0 flex items-center justify-center gap-1 bg-cyan-500 active:bg-cyan-400 text-gray-900 font-black rounded-xl text-sm transition"
        >
          {current === questions.length - 1 ? (
            <><RotateCcw size={12} /><span>Q1</span></>
          ) : (
            <><span>Next</span><ChevronRight size={14} /></>
          )}
        </button>
      </div>

      {/* ── SUBMIT WARNING MODAL ── */}
      {submitWarning && (() => {
        const unanswered = questions.length - qStates.filter(s => s.selected !== null).length
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-gray-900 border border-amber-500/30 rounded-t-3xl w-full p-6 shadow-2xl">
              <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Send size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Submit quiz?</p>
                  <p className="text-amber-400 text-xs">{unanswered} question{unanswered !== 1 ? "s" : ""} unanswered</p>
                </div>
              </div>
              <p className="text-gray-400 text-xs mb-5 leading-relaxed">
                You still have {unanswered} unanswered question{unanswered !== 1 ? "s" : ""}. Unanswered questions score 0.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSubmitWarning(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-semibold active:bg-gray-800 transition"
                >
                  Go back
                </button>
                <button
                  onClick={() => { setSubmitWarning(false); handleSubmit() }}
                  className="flex-1 px-4 py-3 rounded-xl bg-cyan-500 active:bg-cyan-400 text-gray-900 text-sm font-bold transition"
                >
                  Submit anyway
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── QUESTION PALETTE BOTTOM SHEET ── */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPaletteOpen(false)}
          />
          {/* Sheet */}
          <div className="relative bg-gray-900 border-t border-gray-700 rounded-t-2xl max-h-[75vh] flex flex-col">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
              <p className="text-white font-bold text-sm">Question Palette</p>
              <button
                onClick={() => setPaletteOpen(false)}
                className="text-gray-500 active:text-white p-1 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 shrink-0 flex-wrap">
              {[
                { style: STATUS_STYLE.answered,     label: "Answered",    count: answered },
                { style: STATUS_STYLE.marked,        label: "Marked",      count: marked },
                { style: STATUS_STYLE.not_answered,  label: "Not Ans.",    count: notAnswered },
                { style: STATUS_STYLE.not_visited,   label: "Not Visited", count: questions.length - answered - marked - notAnswered },
              ].map(({ style, label, count }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] font-bold ${style}`}>
                    {count}
                  </span>
                  <span className="text-gray-500 text-[11px]">{label}</span>
                </div>
              ))}
            </div>

            {/* Number grid — scrollable */}
            <div className="overflow-y-auto flex-1 p-4">
              <div className="grid grid-cols-6 gap-2">
                {questions.map((_, i) => {
                  const status = getStatus(i)
                  const isCur  = i === current
                  return (
                    <button
                      key={i}
                      onClick={() => goTo(i)}
                      className={`h-10 rounded-lg border text-sm font-bold transition ${STATUS_STYLE[status]} ${
                        isCur ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-900 scale-110" : ""
                      }`}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sheet submit */}
            <div className="px-4 pb-6 pt-3 border-t border-gray-800 shrink-0 safe-area-inset-bottom">
              <button
                onClick={() => { setPaletteOpen(false); confirmSubmit() }}
                className="w-full bg-cyan-500 active:bg-cyan-400 text-gray-900 font-black py-3.5 rounded-xl text-sm transition"
              >
                Submit Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
