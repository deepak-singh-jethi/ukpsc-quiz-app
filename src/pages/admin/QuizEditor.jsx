import { useEffect, useState, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { db } from "../../firebase/config"
import { invalidateCache } from "../../firebase/firestoreCache"
import { doc, getDoc, updateDoc, collection, getDocs, writeBatch, orderBy, query } from "firebase/firestore"
import AdminLayout from "../../components/AdminLayout"
import {
  Plus, Trash2, Save, ChevronDown,
  CheckCircle, Circle, AlertCircle,
  Clock, Tag, BarChart2, CalendarClock, Zap, Minus,
  BookOpen, ArrowLeft, Hash, Settings2, AlertTriangle,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import toast from "react-hot-toast"

// ─────────────────────────────────────────────────────────────────────────────
const BLANK_OPTION = { text: "", explanation: "" }
const BLANK_Q = {
  question: "",
  options: [{ ...BLANK_OPTION }, { ...BLANK_OPTION }, { ...BLANK_OPTION }, { ...BLANK_OPTION }],
  correct: 0,
}
const OPTION_LABELS  = ["A", "B", "C", "D"]
const OPTION_COLORS  = ["cyan", "violet", "amber", "rose"]
const DIFF_CFG = {
  easy:   { dot: "bg-emerald-400", text: "text-emerald-400", badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  medium: { dot: "bg-amber-400",   text: "text-amber-400",   badge: "text-amber-400 bg-amber-500/10 border-amber-500/20"     },
  hard:   { dot: "bg-rose-400",    text: "text-rose-400",    badge: "text-rose-400 bg-rose-500/10 border-rose-500/20"         },
}

function metaIssues(meta) {
  const out = []
  if (!meta?.title?.trim()) out.push("title")
  if (!meta?.totalTime)     out.push("duration")
  return out
}
function qStatus(q) {
  if (!q.question.trim()) return "empty"
  if (q.options.some(o => !o.text.trim() || !o.explanation.trim())) return "incomplete"
  return "complete"
}

// ─── Collapsible Quiz Details ─────────────────────────────────────────────────
function QuizDetailsAccordion({ meta, onChange, questionCount }) {
  const issues   = metaIssues(meta)
  const hasIssue = issues.length > 0
  const [open, setOpen] = useState(hasIssue)
  useEffect(() => { if (hasIssue) setOpen(true) }, [hasIssue])

  const diff = DIFF_CFG[meta?.difficulty] || DIFF_CFG.medium

  return (
    <div className={`border-b transition-colors duration-200 ${hasIssue ? "border-amber-500/25" : "border-gray-800/60"}`}>

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/20 transition-colors ${hasIssue ? "bg-amber-500/4" : ""}`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          hasIssue ? "bg-amber-500/12 border border-amber-500/25" : "bg-gray-800/70 border border-gray-700/40"
        }`}>
          {hasIssue ? <AlertTriangle size={12} className="text-amber-400" /> : <Settings2 size={12} className="text-gray-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">Quiz Details</span>
            {hasIssue && (
              <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                {issues.length} missing
              </span>
            )}
          </div>
          {/* Collapsed pill summary */}
          {!open && !hasIssue && (
            <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
              <span className="text-[10px] text-gray-400 truncate max-w-[160px] font-medium">{meta.title}</span>
              {meta.category && <><span className="text-gray-700 text-[10px]">·</span><span className="text-[10px] text-gray-500">{meta.category}</span></>}
              <span className="text-gray-700 text-[10px]">·</span>
              <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${diff.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${diff.dot}`} />{meta.difficulty}
              </span>
              <span className="text-gray-700 text-[10px]">·</span>
              <span className="text-[10px] text-gray-500">{meta.totalTime || 10}m</span>
              <span className="text-gray-700 text-[10px]">·</span>
              <span className="text-[10px] text-emerald-400 font-semibold">+{meta.marksPerQ || 1}</span>
              {(meta.negativeMark || 0) > 0 && <span className="text-[10px] text-rose-400 font-semibold">−{meta.negativeMark}</span>}
            </div>
          )}
        </div>
        <ChevronDown size={13} className={`text-gray-600 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* ── Body ── */}
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input value={meta.title || ""} onChange={e => onChange("title", e.target.value)}
              placeholder="e.g. Uttarakhand GK Set 1"
              className={`w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border focus:outline-none text-sm placeholder-gray-600 transition ${
                !meta.title?.trim() ? "border-amber-500/40 focus:border-amber-400" : "border-gray-700/60 focus:border-cyan-500/50"
              }`}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
              Description <span className="text-gray-600 normal-case font-normal tracking-normal ml-1">— optional</span>
            </label>
            <input value={meta.description || ""} onChange={e => onChange("description", e.target.value)}
              placeholder="Short description shown to students"
              className="w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none text-sm placeholder-gray-600 transition"
            />
          </div>

          {/* Row: Category · Topic · Difficulty · Duration */}
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-1">
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5"><Tag size={9}/>Subject</label>
              <input value={meta.category || ""} onChange={e => onChange("category", e.target.value)}
                placeholder="e.g. GK, Science"
                className="w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none text-sm placeholder-gray-600 transition"
              />
            </div>
            <div className="col-span-1">
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400/80 mb-1.5"><Tag size={9}/>Topic</label>
              <input value={meta.topic || ""} onChange={e => onChange("topic", e.target.value)}
                placeholder="e.g. Ch.3 Mughal Empire"
                className="w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border border-indigo-500/30 focus:border-indigo-500/50 focus:outline-none text-sm placeholder-gray-600 transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5"><BarChart2 size={9}/>Diff</label>
              <select value={meta.difficulty || "medium"} onChange={e => onChange("difficulty", e.target.value)}
                className="w-full bg-gray-800/60 text-white rounded-lg px-2.5 py-2 border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none text-sm cursor-pointer transition">
                <option value="easy">Easy</option>
                <option value="medium">Med</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5"><Clock size={9}/>Min <span className="text-red-400">*</span></label>
              <input type="number" min={1} max={180} value={meta.totalTime || ""} onChange={e => onChange("totalTime", e.target.value)}
                className={`w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border focus:outline-none text-sm transition ${
                  !meta.totalTime ? "border-amber-500/40 focus:border-amber-400" : "border-gray-700/60 focus:border-cyan-500/50"
                }`}
              />
            </div>
          </div>

          {/* Row: Expiry · +Correct · −Wrong */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5"><CalendarClock size={9}/>Expiry</label>
              <input type="datetime-local" value={meta.expiryDate || ""} onChange={e => onChange("expiryDate", e.target.value)}
                className="w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none text-xs transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                <Zap size={9} className="text-emerald-400"/><span className="text-emerald-400">+</span>Correct
              </label>
              <input type="number" min={0.25} max={10} step={0.25} value={meta.marksPerQ || ""} onChange={e => onChange("marksPerQ", parseFloat(e.target.value) || 1)}
                className="w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border border-gray-700/60 focus:border-emerald-500/40 focus:outline-none text-sm transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                <Minus size={9} className="text-rose-400"/><span className="text-rose-400">−</span>Wrong
              </label>
              <input type="number" min={0} max={5} step={0.25} value={meta.negativeMark ?? ""} onChange={e => onChange("negativeMark", parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800/60 text-white rounded-lg px-3 py-2 border border-gray-700/60 focus:border-rose-500/40 focus:outline-none text-sm transition"
              />
            </div>
          </div>

          {/* Scoring preview */}
          <div className="flex items-center justify-between bg-gray-800/40 border border-gray-700/25 rounded-lg px-3 py-2 text-[11px]">
            <span className="text-gray-500">
              <span className="text-emerald-400 font-bold">+{meta.marksPerQ || 1}</span> correct ·{" "}
              <span className="text-rose-400 font-bold">−{meta.negativeMark || 0}</span> wrong
            </span>
            <span className="text-gray-500">
              Max: <span className="text-white font-bold">{((meta.marksPerQ || 1) * questionCount).toFixed(2)}</span> pts
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Question List Row — compact, single-line ─────────────────────────────────
function QuestionRow({ q, index, isActive, onClick, onDelete }) {
  const st = qStatus(q)
  const stIcon = {
    complete:   <CheckCircle size={11} className="text-emerald-400 shrink-0" />,
    incomplete: <AlertCircle size={11} className="text-amber-400 shrink-0" />,
    empty:      <Circle      size={11} className="text-gray-600 shrink-0" />,
  }[st]

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl mb-0.5 transition-all duration-150 ${
        isActive
          ? "bg-cyan-500/10 border border-cyan-500/20"
          : "border border-transparent hover:bg-gray-800/50 hover:border-gray-700/40"
      }`}
    >
      {/* Number badge */}
      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 transition ${
        isActive ? "bg-cyan-500 text-gray-900" : "bg-gray-800 text-gray-500"
      }`}>
        {index + 1}
      </span>

      {/* Status icon */}
      {stIcon}

      {/* Question text — single line truncate */}
      <span className={`flex-1 text-[11px] truncate transition-colors ${
        isActive ? "text-white font-medium" : q.question ? "text-gray-300" : "text-gray-600 italic"
      }`}>
        {q.question || "Untitled question"}
      </span>

      {/* Correct answer indicator */}
      <span className={`text-[10px] font-black shrink-0 w-4 h-4 rounded flex items-center justify-center ${
        isActive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/25" : "bg-gray-800 text-gray-600"
      }`}>
        {OPTION_LABELS[q.correct]}
      </span>

      {/* Delete — hover reveal */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(index) }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all shrink-0 -mr-1"
        title="Remove"
      >
        <Trash2 size={10} />
      </button>
    </button>
  )
}

// ─── Option Card — 2×2 grid, click header to mark correct ────────────────────
function OptionCard({ option, index, isCorrect, onMarkCorrect, onTextChange, onExplChange }) {
  const color = OPTION_COLORS[index]

  const activeRing = {
    cyan:   "border-cyan-500/40 bg-cyan-500/5",
    violet: "border-violet-500/40 bg-violet-500/5",
    amber:  "border-amber-500/40 bg-amber-500/5",
    rose:   "border-rose-500/40 bg-rose-500/5",
  }[color]

  const labelActive = {
    cyan:   "bg-cyan-500 text-gray-900 border-cyan-500",
    violet: "bg-violet-500 text-white border-violet-500",
    amber:  "bg-amber-500 text-gray-900 border-amber-500",
    rose:   "bg-rose-500 text-white border-rose-500",
  }[color]

  const correctRing = isCorrect
    ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm shadow-emerald-500/10"
    : activeRing

  return (
    <div className={`rounded-xl border transition-all duration-150 overflow-hidden ${correctRing}`}>
      {/* Card header — click to mark correct */}
      <button
        onClick={onMarkCorrect}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors ${
          isCorrect ? "bg-emerald-500/8 hover:bg-emerald-500/12" : "hover:bg-gray-800/30"
        }`}
        title={isCorrect ? "Correct answer" : "Click to mark as correct"}
      >
        <span className={`w-6 h-6 rounded-md border flex items-center justify-center text-[11px] font-black shrink-0 transition-all ${
          isCorrect
            ? "bg-emerald-500 border-emerald-500 text-gray-900"
            : `bg-transparent border-gray-600 text-gray-500 group-hover:${labelActive}`
        }`}>
          {OPTION_LABELS[index]}
        </span>
        <span className={`text-[10px] font-bold flex-1 text-left transition-colors ${isCorrect ? "text-emerald-400" : "text-gray-500"}`}>
          Option {OPTION_LABELS[index]}
        </span>
        {isCorrect ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded-full">
            <CheckCircle size={9} /> Correct
          </span>
        ) : (
          <span className="text-[10px] text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
            Mark correct
          </span>
        )}
      </button>

      {/* Inputs */}
      <div className="px-3.5 pb-3 space-y-2">
        <input
          value={option.text}
          onChange={e => onTextChange(e.target.value)}
          placeholder={`Answer text for option ${OPTION_LABELS[index]}…`}
          className="w-full bg-gray-900/50 text-white rounded-lg px-3 py-2 border border-gray-700/40 focus:border-cyan-500/50 focus:bg-gray-900/80 focus:outline-none text-sm placeholder-gray-600 transition"
        />
        <div className="flex items-start gap-2">
          <span className="text-[10px] text-gray-600 font-bold mt-2.5 shrink-0 select-none">WHY</span>
          <input
            value={option.explanation}
            onChange={e => onExplChange(e.target.value)}
            placeholder="Explanation shown after answer is revealed…"
            className="flex-1 bg-gray-900/30 text-gray-400 rounded-lg px-3 py-2 border border-gray-700/25 focus:border-cyan-500/40 focus:bg-gray-900/60 focus:outline-none text-xs placeholder-gray-600 transition"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Question Editor (right panel) ───────────────────────────────────────────
function QuestionEditor({ q, qi, onChange, onOptionChange }) {
  return (
    <div className="space-y-5">

      {/* Question text */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
          Question
        </label>
        <textarea
          value={q.question}
          onChange={e => onChange(qi, "question", e.target.value)}
          rows={3}
          placeholder="Type your question here…"
          className="w-full bg-gray-800/50 text-white rounded-xl px-4 py-3 border border-gray-700/60 focus:border-cyan-500/50 focus:bg-gray-800/80 focus:outline-none text-sm leading-relaxed resize-none placeholder-gray-600 transition"
        />
      </div>

      {/* Options — 2×2 grid, click header to mark correct */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Options & Explanations
          </label>
          <span className="text-[10px] text-gray-600 bg-gray-800/60 border border-gray-700/30 px-2 py-0.5 rounded-full">
            Click option header to mark correct
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {q.options.map((o, j) => (
            <OptionCard
              key={j}
              option={o}
              index={j}
              isCorrect={j === q.correct}
              onMarkCorrect={() => onChange(qi, "correct", j)}
              onTextChange={v => onOptionChange(qi, j, "text", v)}
              onExplChange={v => onOptionChange(qi, j, "explanation", v)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function QuizEditor() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [meta, setMeta]           = useState(null)
  const [questions, setQuestions] = useState([])
  const [activeQ, setActiveQ]     = useState(0)
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const rightRef = useRef(null)

  // Keyboard nav: ← → arrow keys
  const handleKey = useCallback((e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return
    if (e.key === "ArrowLeft")  setActiveQ(q => Math.max(0, q - 1))
    if (e.key === "ArrowRight") setActiveQ(q => Math.min(questions.length - 1, q + 1))
  }, [questions.length])

  useEffect(() => {
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [handleKey])

  useEffect(() => {
    async function load() {
      try {
        const quizSnap = await getDoc(doc(db, "quizSets", id))
        if (!quizSnap.exists()) { toast.error("Quiz not found"); navigate("/admin/quizzes"); return }
        const data = quizSnap.data()
        setMeta({
          id: quizSnap.id, ...data,
          expiryDate:   data.expiryDate ? new Date(data.expiryDate).toISOString().slice(0, 16) : "",
          marksPerQ:    data.marksPerQ    ?? 1,
          negativeMark: data.negativeMark ?? 0,
        })
        const qSnap = await getDocs(query(collection(db, "quizSets", id, "questions"), orderBy("order")))
        setQuestions(qSnap.docs.map(d => ({ _id: d.id, ...d.data() })))
      } catch (e) { console.error(e); toast.error("Failed to load quiz") }
      setLoading(false)
    }
    load()
  }, [id])

  function handleMetaChange(f, v) { setMeta(m => ({ ...m, [f]: v })) }
  function updateQuestion(i, field, value) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
  }
  function updateOption(qi, oi, field, value) {
    setQuestions(qs => qs.map((q, idx) => {
      if (idx !== qi) return q
      return { ...q, options: q.options.map((o, j) => j === oi ? { ...o, [field]: value } : o) }
    }))
  }
  function addQuestion() {
    if (questions.length >= 100) return toast.error("Maximum 100 questions allowed")
    const idx = questions.length
    setQuestions(qs => [...qs, { ...BLANK_Q, options: BLANK_Q.options.map(o => ({ ...o })) }])
    setActiveQ(idx)
    setTimeout(() => rightRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 50)
  }
  function removeQuestion(i) {
    if (questions.length <= 3) return toast.error("Minimum 3 questions required")
    if (!window.confirm("Remove this question?")) return
    const next = questions.filter((_, idx) => idx !== i)
    setQuestions(next)
    setActiveQ(Math.min(activeQ, next.length - 1))
  }

  async function handleSave() {
    if (!meta.title?.trim())  return toast.error("Quiz title is required")
    if (questions.length < 3) return toast.error("Minimum 3 questions required")
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question.trim()) return toast.error(`Q${i + 1}: question text is empty`)
      for (let j = 0; j < 4; j++) {
        if (!q.options[j]?.text.trim())        return toast.error(`Q${i + 1} option ${j + 1}: text is empty`)
        if (!q.options[j]?.explanation.trim()) return toast.error(`Q${i + 1} option ${j + 1}: explanation is empty`)
      }
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, "quizSets", id), {
        title:         meta.title.trim(),
        description:   meta.description?.trim() || "",
        category:      meta.category?.trim()    || "",
        topic:         meta.topic?.trim()        || "",
        difficulty:    meta.difficulty,
        totalTime:     Number(meta.totalTime  || 10),
        questionCount: questions.length,
        expiryDate:    meta.expiryDate ? new Date(meta.expiryDate).toISOString() : null,
        marksPerQ:     Number(meta.marksPerQ)    || 1,
        negativeMark:  Number(meta.negativeMark) || 0,
      })
      const existing = await getDocs(collection(db, "quizSets", id, "questions"))
      const b1 = writeBatch(db); existing.docs.forEach(d => b1.delete(d.ref)); await b1.commit()
      const b2 = writeBatch(db)
      questions.forEach((q, i) => {
        const { _id, ...data } = q
        b2.set(doc(collection(db, "quizSets", id, "questions")), { ...data, order: i })
      })
      await b2.commit()
      // FIX #5: Invalidate cache so Dashboard/Batches show updated quiz data immediately
      invalidateCache("query:quizSets")
      invalidateCache(`doc:quizSets/${id}`)
      toast.success("Quiz saved!")
      navigate("/admin/quizzes")
    } catch (e) { console.error(e); toast.error("Failed to save") }
    setSaving(false)
  }

  if (loading) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-screen">
        <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  )

  const currentQ      = questions[activeQ]
  const completeCount = questions.filter(q => qStatus(q) === "complete").length
  const issues        = metaIssues(meta)
  const diffBadge     = (DIFF_CFG[meta.difficulty] || DIFF_CFG.medium).badge

  const st = currentQ ? qStatus(currentQ) : null
  const stBadge = {
    complete:   "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    incomplete: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    empty:      "text-gray-500 bg-gray-800 border-gray-700",
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-screen overflow-hidden bg-gray-950">

        {/* ══ TOP BAR ══ */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-800/80 shrink-0 bg-gray-950/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate("/admin/quizzes")}
              className="group flex items-center gap-1.5 text-gray-500 hover:text-white text-sm transition-colors shrink-0">
              <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" /> Back
            </button>
            <div className="w-px h-4 bg-gray-800 shrink-0" />
            <BookOpen size={13} className="text-cyan-400 shrink-0" />
            <h1 className="text-white font-bold text-sm truncate max-w-[200px] lg:max-w-xs">
              {meta.title || <span className="text-gray-600 italic font-normal">Untitled Quiz</span>}
            </h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${diffBadge}`}>
              {meta.difficulty || "medium"}
            </span>
            {meta.category && (
              <span className="hidden lg:block text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full shrink-0">
                {meta.category}
              </span>
            )}
            {meta.topic && (
              <span className="hidden lg:block text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">
                {meta.topic}
              </span>
            )}
            {issues.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">
                <AlertTriangle size={9} /> {issues.length} issue{issues.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-2.5">
              <span className="text-xs">
                <span className="text-white font-bold">{completeCount}</span>
                <span className="text-gray-600">/{questions.length} ready</span>
              </span>
              <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: questions.length ? `${(completeCount / questions.length) * 100}%` : "0%" }} />
              </div>
            </div>
            <div className="w-px h-4 bg-gray-800 hidden sm:block" />
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-4 py-2 rounded-xl transition text-sm">
              <Save size={13} /> {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </header>

        {/* ══ BODY ══ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ═ LEFT 40%: Details + Question list ═ */}
          <aside className="w-[40%] shrink-0 border-r border-gray-800/70 flex flex-col overflow-hidden bg-gray-950">

            {meta && (
              <QuizDetailsAccordion meta={meta} onChange={handleMetaChange} questionCount={questions.length} />
            )}

            {/* Question number grid — fast jump for 100+ questions */}
            <div className="px-3 pt-2 pb-1 border-b border-gray-800/40">
              <div className="flex flex-wrap gap-1">
                {questions.map((q, i) => {
                  const st  = qStatus(q)
                  const cur = i === activeQ
                  return (
                    <button key={i}
                      onClick={() => { setActiveQ(i); rightRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }}
                      title={q.question ? q.question.slice(0, 60) : `Q${i+1}`}
                      className={`w-7 h-7 rounded-md text-[10px] font-black border transition-all ${
                        cur
                          ? "bg-cyan-500 border-cyan-400 text-gray-900 shadow-sm shadow-cyan-500/30 scale-110"
                          : st === "complete"
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30"
                          : st === "incomplete"
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25"
                          : "bg-gray-800/60 border-gray-700/40 text-gray-500 hover:bg-gray-700/60"
                      }`}>
                      {i + 1}
                    </button>
                  )
                })}
                {/* Add button inline in grid */}
                <button onClick={addQuestion}
                  className="w-7 h-7 rounded-md text-[10px] font-black border border-dashed border-cyan-500/30 text-cyan-500/60 hover:border-cyan-500/60 hover:text-cyan-400 hover:bg-cyan-500/8 transition"
                  title="Add question">
                  +
                </button>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-1.5 pb-1">
                <span className="flex items-center gap-1 text-[9px] text-gray-600"><span className="w-2 h-2 rounded-sm bg-emerald-500/50 inline-block"/>Done</span>
                <span className="flex items-center gap-1 text-[9px] text-gray-600"><span className="w-2 h-2 rounded-sm bg-amber-500/50 inline-block"/>Partial</span>
                <span className="flex items-center gap-1 text-[9px] text-gray-600"><span className="w-2 h-2 rounded-sm bg-gray-700 inline-block"/>Empty</span>
              </div>
            </div>

            {/* Questions header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60 shrink-0">
              <div className="flex items-center gap-2">
                <Hash size={11} className="text-gray-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Questions</span>
                <span className="text-[10px] font-black text-white bg-gray-800 border border-gray-700/50 px-1.5 py-0.5 rounded-md tabular-nums leading-none">
                  {questions.length}
                </span>
              </div>
              <button onClick={addQuestion}
                className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/8 hover:bg-cyan-500/15 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg transition">
                <Plus size={11} /> Add
              </button>
            </div>

            {/* Question list — single-line compact rows */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {questions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-28 text-center px-4">
                  <p className="text-gray-600 text-xs">No questions yet.</p>
                  <button onClick={addQuestion} className="mt-2 text-cyan-400 text-xs hover:underline">Add first question</button>
                </div>
              ) : questions.map((q, i) => (
                <QuestionRow
                  key={i} q={q} index={i} isActive={i === activeQ}
                  onClick={() => { setActiveQ(i); rightRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }}
                  onDelete={removeQuestion}
                />
              ))}
            </div>

            {/* Footer — keyboard hint + min/max */}
            <div className="border-t border-gray-800/60 px-4 py-2.5 shrink-0 flex items-center justify-between">
              <p className="text-[9px] text-gray-700">Min 3 · Max 100 questions</p>
              <p className="text-[9px] text-gray-700 hidden sm:block">← → keys to navigate</p>
            </div>
          </aside>

          {/* ═ RIGHT 60%: Question Editor ═ */}
          <main className="w-[60%] flex flex-col overflow-hidden">
            {currentQ ? (
              <>
                {/* Sub-header: minimal, functional */}
                <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800/60 shrink-0 bg-gray-950/80">
                  <div className="flex items-center gap-3">
                    {/* Prev button */}
                    <button
                      onClick={() => { setActiveQ(q => Math.max(0, q - 1)); rightRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }}
                      disabled={activeQ === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800/80 border border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-25 transition"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    {/* Q number */}
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-sm font-black text-cyan-400 tabular-nums">
                        {activeQ + 1}
                      </span>
                      <span className="text-[11px] text-gray-600 tabular-nums">/ {questions.length}</span>
                    </div>

                    {/* Next button */}
                    <button
                      onClick={() => { setActiveQ(q => Math.min(questions.length - 1, q + 1)); rightRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }}
                      disabled={activeQ === questions.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800/80 border border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-25 transition"
                    >
                      <ChevronRight size={14} />
                    </button>

                    {/* Status badge */}
                    {st && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stBadge[st]}`}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </span>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeQuestion(activeQ)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-500 hover:text-red-400 hover:bg-red-500/8 hover:border-red-500/20 text-xs font-medium transition"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>

                {/* Editor scroll area — reduced horizontal padding, no extra centering margin */}
                <div ref={rightRef} className="flex-1 overflow-y-auto px-6 py-5">
                  <QuestionEditor
                    q={currentQ}
                    qi={activeQ}
                    onChange={updateQuestion}
                    onOptionChange={updateOption}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                <div className="w-14 h-14 rounded-2xl bg-gray-800/50 border border-gray-700/40 flex items-center justify-center mb-4">
                  <Plus size={20} className="text-gray-600" />
                </div>
                <p className="text-gray-300 font-semibold mb-1">No questions yet</p>
                <p className="text-gray-600 text-sm mb-5">Add a question using the left panel.</p>
                <button onClick={addQuestion}
                  className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-5 py-2.5 rounded-xl transition text-sm">
                  <Plus size={14} /> Add First Question
                </button>
              </div>
            )}
          </main>

        </div>
      </div>
    </AdminLayout>
  )
}