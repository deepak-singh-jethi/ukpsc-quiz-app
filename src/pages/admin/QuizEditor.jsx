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

// ─── Quiz Details Modal ───────────────────────────────────────────────────────
function QuizDetailsModal({ meta, onChange, questionCount, onClose }) {
  const [draft, setDraft] = useState({ ...meta })
  const issues = metaIssues(draft)

  function set(f, v) { setDraft(d => ({ ...d, [f]: v })) }

  function handleApply() {
    if (!draft.title?.trim()) return toast.error("Title is required")
    if (!draft.totalTime)     return toast.error("Duration is required")
    Object.keys(draft).forEach(f => onChange(f, draft[f]))
    onClose()
  }

  const diff = DIFF_CFG[draft.difficulty] || DIFF_CFG.medium

  const Field = ({ label, labelCls = "text-gray-400", children }) => (
    <div>
      <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${labelCls}`}>{label}</label>
      {children}
    </div>
  )

  const inputCls = (err) =>
    `w-full bg-[#0d1117] text-white rounded-lg px-3 py-2.5 border focus:outline-none text-sm placeholder-gray-600 transition ${
      err ? "border-amber-500/50 focus:border-amber-400" : "border-white/8 focus:border-cyan-500/50"
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#0a0d13] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Settings2 size={14} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Quiz Details</h2>
              <p className="text-[10px] text-gray-500">{questionCount} questions · changes apply on modal close</p>
            </div>
          </div>
          {issues.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
              <AlertTriangle size={9} /> {issues.length} required
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Title */}
          <Field label={<>Title <span className="text-red-400 normal-case">*</span></>}>
            <input value={draft.title || ""} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Uttarakhand GK Set 1"
              className={inputCls(!draft.title?.trim())}
              autoFocus
            />
          </Field>

          {/* Description */}
          <Field label="Description" labelCls="text-gray-500">
            <input value={draft.description || ""} onChange={e => set("description", e.target.value)}
              placeholder="Short description shown to students — optional"
              className={inputCls(false)}
            />
          </Field>

          {/* Subject + Topic */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={<><Tag size={9} className="inline mr-0.5" />Subject</>}>
              <input value={draft.category || ""} onChange={e => set("category", e.target.value)}
                placeholder="e.g. GK, Science"
                className={inputCls(false)}
              />
            </Field>
            <Field label={<><Tag size={9} className="inline mr-0.5" />Topic</>} labelCls="text-indigo-400/80">
              <input value={draft.topic || ""} onChange={e => set("topic", e.target.value)}
                placeholder="e.g. Mughal Empire"
                className="w-full bg-[#0d1117] text-white rounded-lg px-3 py-2.5 border border-indigo-500/25 focus:border-indigo-500/50 focus:outline-none text-sm placeholder-gray-600 transition"
              />
            </Field>
          </div>

          {/* Difficulty + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={<><BarChart2 size={9} className="inline mr-0.5" />Difficulty</>}>
              <div className="flex gap-1.5">
                {["easy","medium","hard"].map(d => (
                  <button key={d} onClick={() => set("difficulty", d)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                      draft.difficulty === d
                        ? d === "easy"   ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        : d === "medium" ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                                         : "bg-rose-500/20 border-rose-500/40 text-rose-300"
                        : "bg-white/4 border-white/8 text-gray-500 hover:bg-white/8 hover:text-gray-300"
                    }`}>
                    {d === "easy" ? "Easy" : d === "medium" ? "Med" : "Hard"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={<><Clock size={9} className="inline mr-0.5" />Duration (min) <span className="text-red-400">*</span></>}>
              <input type="number" min={1} max={180} value={draft.totalTime || ""} onChange={e => set("totalTime", e.target.value)}
                placeholder="60"
                className={inputCls(!draft.totalTime)}
              />
            </Field>
          </div>

          {/* Marking scheme */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={<><Zap size={9} className="inline mr-0.5 text-emerald-400" /><span className="text-emerald-400">+</span> Correct</>}>
              <input type="number" min={0.25} max={10} step={0.25} value={draft.marksPerQ || ""} onChange={e => set("marksPerQ", parseFloat(e.target.value) || 1)}
                className={inputCls(false)}
              />
            </Field>
            <Field label={<><Minus size={9} className="inline mr-0.5 text-rose-400" /><span className="text-rose-400">−</span> Wrong</>}>
              <input type="number" min={0} max={5} step={0.25} value={draft.negativeMark ?? ""} onChange={e => set("negativeMark", parseFloat(e.target.value) || 0)}
                className={inputCls(false)}
              />
            </Field>
            <Field label={<><CalendarClock size={9} className="inline mr-0.5" />Expiry</>}>
              <input type="datetime-local" value={draft.expiryDate || ""} onChange={e => set("expiryDate", e.target.value)}
                className="w-full bg-[#0d1117] text-white rounded-lg px-3 py-2.5 border border-white/8 focus:border-cyan-500/50 focus:outline-none text-xs transition"
              />
            </Field>
          </div>

          {/* Score preview */}
          <div className="flex items-center justify-between bg-white/4 border border-white/6 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-400 font-bold">+{draft.marksPerQ || 1} correct</span>
              <span className="text-gray-600">·</span>
              <span className="text-rose-400 font-bold">−{draft.negativeMark || 0} wrong</span>
            </div>
            <div className="text-xs text-gray-500">
              Max score: <span className="text-white font-bold">{((draft.marksPerQ || 1) * questionCount).toFixed(2)}</span> pts
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/8 bg-white/2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition">
            Cancel
          </button>
          <button onClick={handleApply}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-gray-900 transition">
            <CheckCircle size={12} /> Apply Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Compact Quiz Details Bar (Col 1 top) ─────────────────────────────────────
function QuizDetailsBar({ meta, onEdit, questionCount }) {
  const issues = metaIssues(meta)
  const diff   = DIFF_CFG[meta?.difficulty] || DIFF_CFG.medium

  return (
    <div className={`border-b shrink-0 ${issues.length > 0 ? "border-amber-500/25" : "border-gray-800/60"}`}>
      <button
        onClick={onEdit}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/3 transition-colors group ${
          issues.length > 0 ? "bg-amber-500/3" : ""
        }`}
      >
        {/* Icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          issues.length > 0
            ? "bg-amber-500/12 border border-amber-500/25"
            : "bg-gray-800/70 border border-gray-700/40 group-hover:border-cyan-500/30 group-hover:bg-cyan-500/8"
        }`}>
          {issues.length > 0
            ? <AlertTriangle size={12} className="text-amber-400" />
            : <Settings2 size={12} className="text-gray-400 group-hover:text-cyan-400 transition-colors" />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate max-w-[88px]">
              {meta.title || <span className="text-gray-600 italic font-normal">Untitled</span>}
            </span>
            {issues.length > 0 && (
              <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded-full shrink-0">
                !{issues.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] font-semibold flex items-center gap-0.5 ${diff.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${diff.dot}`}/>
              {meta.difficulty || "medium"}
            </span>
            <span className="text-gray-700 text-[9px]">·</span>
            <span className="text-[9px] text-gray-500">{meta.totalTime || "—"}m</span>
            <span className="text-gray-700 text-[9px]">·</span>
            <span className="text-[9px] text-emerald-400 font-bold">+{meta.marksPerQ || 1}</span>
            {(meta.negativeMark || 0) > 0 && (
              <span className="text-[9px] text-rose-400 font-bold">−{meta.negativeMark}</span>
            )}
          </div>
        </div>

        {/* Edit hint */}
        <span className="text-[9px] text-gray-600 group-hover:text-cyan-500 transition-colors shrink-0 font-medium">Edit ›</span>
      </button>
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

// Option accent colours — matches QuizCreate OPT
const OPT_COLORS = [
  { tag: "bg-sky-500",    hdr: "bg-sky-500/8"    },
  { tag: "bg-violet-500", hdr: "bg-violet-500/8" },
  { tag: "bg-amber-500",  hdr: "bg-amber-500/8"  },
  { tag: "bg-rose-500",   hdr: "bg-rose-500/8"   },
]

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function QuizEditor() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [meta, setMeta]           = useState(null)
  const [questions, setQuestions] = useState([])
  const [activeQ, setActiveQ]     = useState(0)
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
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
        // auto-open modal if required fields are missing
        if (!data.title?.trim() || !data.totalTime) setDetailsOpen(true)
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

        {/* ══ BODY: 3-col layout matching QuizCreate ══ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ══ COL 1: Quiz details accordion + Question palette ══ */}
          <div className="w-48 shrink-0 border-r border-gray-800/70 flex flex-col overflow-hidden bg-gray-950">

          {/* Quiz details compact bar */}
            {meta && (
              <QuizDetailsBar meta={meta} onEdit={() => setDetailsOpen(true)} questionCount={questions.length} />
            )}

            {/* Palette header */}
            <div className="px-3 py-2.5 border-b border-gray-800/60 shrink-0 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{questions.length} Questions</p>
              <button onClick={addQuestion} title="Add question"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-cyan-400 hover:text-white hover:bg-cyan-500/20 border border-cyan-500/25 transition">
                <Plus size={13}/>
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/40 shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-sm bg-emerald-500/70 inline-block"/>Done</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-sm bg-amber-500/70 inline-block"/>Partial</span>
            </div>

            {/* Number grid — 3 per row */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="grid grid-cols-3 gap-1.5">
                {questions.map((q, i) => {
                  const st  = qStatus(q)
                  const cur = i === activeQ
                  return (
                    <button key={i}
                      onClick={() => setActiveQ(i)}
                      title={q.question ? q.question.slice(0, 60) : `Q${i+1}`}
                      className={`w-full aspect-square rounded-lg flex items-center justify-center text-sm font-black border transition-all ${
                        cur
                          ? "bg-cyan-500 border-cyan-400 text-gray-900 shadow-md shadow-cyan-500/30 scale-105 z-10 relative"
                          : st === "complete"
                          ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                          : st === "incomplete"
                          ? "bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                      }`}>
                      {i + 1}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Delete current question */}
            {questions.length > 1 && (
              <div className="border-t border-gray-800/60 px-2.5 py-2 shrink-0">
                <button onClick={() => removeQuestion(activeQ)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/8 border border-rose-500/15 hover:border-rose-500/30 rounded-lg py-2 transition">
                  <Trash2 size={12}/> Del Q{activeQ + 1}
                </button>
              </div>
            )}

            {/* Footer hint */}
            <div className="border-t border-gray-800/60 px-3 py-2 shrink-0">
              <p className="text-[9px] text-gray-700">Min 3 · Max 100 · ← → navigate</p>
            </div>
          </div>

          {/* ══ COL 2: Question text editor + question list ══ */}
          {currentQ ? (
            <div className="flex flex-col border-r border-gray-800/70 min-h-0 min-w-0" style={{ width: "32%" }}>

              {/* Col2 header: Q number + status badge */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-gray-950/80 shrink-0 gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black border transition-all ${
                    st === "complete"
                      ? "bg-emerald-500 border-emerald-400 text-white shadow-sm shadow-emerald-500/30"
                      : "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                  }`}>
                    {st === "complete" ? <CheckCircle size={11}/> : activeQ + 1}
                  </div>
                  <span className="text-sm font-bold text-white">Question</span>
                  {st && st !== "complete" && (
                    <span className="text-[10px] text-amber-400/80 bg-amber-500/8 border border-amber-500/20 px-1.5 py-0.5 rounded-full">incomplete</span>
                  )}
                  {st === "complete" && (
                    <span className="text-[10px] text-emerald-400/80 bg-emerald-500/8 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">ready ✓</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setActiveQ(q => Math.max(0, q - 1))}
                    disabled={activeQ === 0}
                    className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-800/80 border border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-25 transition"
                  ><ChevronLeft size={12}/></button>
                  <span className="text-xs text-gray-600 tabular-nums">{activeQ+1}/{questions.length}</span>
                  <button
                    onClick={() => setActiveQ(q => Math.min(questions.length - 1, q + 1))}
                    disabled={activeQ === questions.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-800/80 border border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-25 transition"
                  ><ChevronRight size={12}/></button>
                </div>
              </div>

              {/* Question textarea — 40% height */}
              <div className="p-2.5 shrink-0" style={{ height: "40%" }}>
                <textarea
                  value={currentQ.question}
                  onChange={e => updateQuestion(activeQ, "question", e.target.value)}
                  placeholder="Type your question here…"
                  className="w-full h-full bg-[#0d1117] text-white text-sm rounded-lg px-3.5 py-3 border border-white/8 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 placeholder-gray-600 transition-all resize-none leading-relaxed"
                />
              </div>

              {/* Question list header */}
              <div className="border-t border-gray-800/60 bg-gray-950/80 shrink-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/40">
                  <p className="text-sm font-bold text-gray-300">All Questions · {questions.length}</p>
                  <button onClick={addQuestion}
                    className="flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 px-2.5 py-1 rounded-lg transition border border-cyan-500/20 hover:border-cyan-500/40">
                    <Plus size={11}/> Add
                  </button>
                </div>
              </div>

              {/* Question list — scrollable */}
              <div ref={rightRef} className="flex-1 overflow-y-auto min-h-0">
                {questions.map((qItem, i) => {
                  const isCurrent  = i === activeQ
                  const isComplete = qStatus(qItem) === "complete"
                  const isPartial  = qItem.question.trim() && !isComplete
                  const firstLine  = qItem.question.split("\n").find(l => l.trim()) || ""
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveQ(i)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-all ${
                        isCurrent
                          ? "bg-cyan-500/10 border-l-2 border-l-cyan-500"
                          : "hover:bg-white/3 border-l-2 border-l-transparent"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                        isCurrent ? "bg-cyan-400" : isComplete ? "bg-emerald-400" : isPartial ? "bg-amber-400" : "bg-gray-700"
                      }`}/>
                      <span className={`text-xs font-black shrink-0 w-6 tabular-nums mt-0.5 ${
                        isCurrent ? "text-cyan-300" : isComplete ? "text-emerald-400" : isPartial ? "text-amber-400" : "text-gray-500"
                      }`}>{i+1}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`text-sm block truncate leading-snug ${
                          isCurrent ? "text-white font-medium" : isComplete ? "text-gray-200" : "text-gray-400"
                        }`}>
                          {firstLine || <em className="opacity-40 text-xs">Empty question</em>}
                        </span>
                      </span>
                      {isComplete && (
                        <span className={`text-xs font-black shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
                          isCurrent ? "bg-cyan-500/30 text-cyan-300" : "bg-emerald-500/20 text-emerald-400"
                        }`}>{OPTION_LABELS[qItem.correct]}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* No questions state */
            <div className="flex flex-col items-center justify-center flex-1 text-center p-10">
              <div className="w-14 h-14 rounded-2xl bg-gray-800/50 border border-gray-700/40 flex items-center justify-center mb-4">
                <Plus size={20} className="text-gray-600" />
              </div>
              <p className="text-gray-300 font-semibold mb-1">No questions yet</p>
              <p className="text-gray-600 text-sm mb-5">Add a question to get started.</p>
              <button onClick={addQuestion}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-5 py-2.5 rounded-xl transition text-sm">
                <Plus size={14}/> Add First Question
              </button>
            </div>
          )}

          {/* ══ COL 3: Options 2×2 grid ══ */}
          {currentQ && (
            <div className="flex flex-col min-h-0 overflow-hidden flex-1 min-w-0">
              {/* Col3 header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-gray-950/80 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Options</span>
                  <span className="text-xs text-gray-400">answer + explanation</span>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400/80 bg-cyan-500/8 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  <span className="font-black">A B C D</span> to mark correct
                </span>
              </div>

              {/* 2×2 grid — fills full height */}
              <div className="flex-1 grid grid-cols-2 grid-rows-2 min-h-0 overflow-hidden">
                {currentQ.options.map((o, j) => {
                  const isCorrect = j === currentQ.correct
                  const c = OPT_COLORS[j]
                  const borderR = j === 0 || j === 2 ? "border-r border-gray-800/60" : ""
                  const borderB = j < 2 ? "border-b border-gray-800/60" : ""
                  return (
                    <div key={j} className={`flex flex-col min-h-0 overflow-hidden transition-colors ${borderR} ${borderB} ${isCorrect ? "bg-emerald-500/4" : ""}`}>
                      {/* Option header — click to mark correct */}
                      <button
                        type="button"
                        onClick={() => updateQuestion(activeQ, "correct", j)}
                        title={isCorrect ? "Correct answer" : "Click to mark as correct answer"}
                        className={`flex items-center gap-2 px-3 py-2 shrink-0 w-full text-left transition-colors ${
                          isCorrect ? "bg-emerald-500/12 hover:bg-emerald-500/18" : `${c.hdr} hover:bg-white/5`
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                          isCorrect ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30" : `${c.tag} text-white`
                        }`}>{OPTION_LABELS[j]}</span>
                        <span className={`text-xs font-bold flex-1 ${isCorrect ? "text-emerald-300" : "text-gray-500"}`}>
                          {isCorrect ? "✓ Correct answer" : <span className="text-gray-600">Mark as correct</span>}
                        </span>
                        {isCorrect
                          ? <CheckCircle size={12} className="text-emerald-400 shrink-0"/>
                          : <span className="text-[10px] text-gray-700 shrink-0">click</span>
                        }
                      </button>

                      {/* Input fields */}
                      <div className="flex-1 flex flex-col gap-1.5 px-2.5 pb-2.5 pt-2 min-h-0">
                        <input
                          value={o.text}
                          onChange={e => updateOption(activeQ, j, "text", e.target.value)}
                          placeholder="Answer text…"
                          className={`w-full bg-[#0d1117] rounded-lg px-2.5 py-2 text-sm border focus:outline-none focus:ring-1 placeholder-gray-600 transition-all shrink-0 ${
                            isCorrect
                              ? "text-emerald-200 border-emerald-500/25 focus:border-emerald-400/50 focus:ring-emerald-500/10"
                              : "text-gray-200 border-white/8 focus:border-white/20 focus:ring-white/5"
                          }`}
                        />
                        <div className="flex-1 flex flex-col min-h-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 shrink-0">Explanation</p>
                          <textarea
                            value={o.explanation}
                            onChange={e => updateOption(activeQ, j, "explanation", e.target.value)}
                            placeholder="Why is this option correct/wrong?"
                            className={`flex-1 w-full bg-[#0d1117] rounded-lg px-2.5 py-1.5 text-xs border focus:outline-none focus:ring-1 placeholder-gray-600 transition-all resize-none leading-relaxed min-h-0 ${
                              isCorrect
                                ? "text-emerald-300/80 border-emerald-500/20 focus:border-emerald-400/40 focus:ring-emerald-500/8"
                                : "text-gray-400 border-white/6 focus:border-white/15 focus:ring-white/4"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
        {/* Quiz Details Modal */}
        {detailsOpen && meta && (
          <QuizDetailsModal
            meta={meta}
            onChange={handleMetaChange}
            questionCount={questions.length}
            onClose={() => setDetailsOpen(false)}
          />
        )}

      </div>
    </AdminLayout>
  )
}
