import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, addDoc, writeBatch, doc } from "firebase/firestore"
import { invalidateCache, cachedGetDocs, TTL_LONG } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import {
  PenLine, Plus, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, ArrowLeft,
  Clock, FileJson, Send, Save, ChevronRight, ChevronLeft, ArrowRight,
  Check, RotateCcw, BookOpen, Sparkles, Target, FileText, Eye,
  Hash, Zap, Minus, Calendar, BarChart2
} from "lucide-react"
import toast from "react-hot-toast"

// ─── Constants ────────────────────────────────────────────────────────────────
const BLANK_OPTION = { text: "", explanation: "" }
const mkBlankQ = () => ({
  question: "",
  options: [0,1,2,3].map(() => ({ ...BLANK_OPTION })),
  correct: 0,
})
const SAMPLE_JSON = [
  {
    question: "What is the capital of Uttarakhand?",
    options: [
      { text: "Dehradun",  explanation: "Dehradun is the capital of Uttarakhand since 2000." },
      { text: "Haridwar",  explanation: "Haridwar is a holy city but not the capital." },
      { text: "Nainital",  explanation: "Nainital is the high court seat, not the capital." },
      { text: "Rishikesh", explanation: "Rishikesh is famous for yoga but not the capital." },
    ],
    correct: 0, category: "Uttarakhand GK", difficulty: "easy",
  },
]
const DIFF = {
  easy:   { label: "Easy",   cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-400" },
  medium: { label: "Medium", cls: "text-amber-400 bg-amber-500/10 border-amber-500/30",       dot: "bg-amber-400"   },
  hard:   { label: "Hard",   cls: "text-rose-400 bg-rose-500/10 border-rose-500/30",           dot: "bg-rose-400"    },
}
const LABELS = ["A","B","C","D"]

// Option accent colours
const OPT = [
  { tag: "bg-sky-500",    txt: "text-sky-400",    border: "border-sky-500/25",    hdr: "bg-sky-500/8"    },
  { tag: "bg-violet-500", txt: "text-violet-400", border: "border-violet-500/25", hdr: "bg-violet-500/8" },
  { tag: "bg-amber-500",  txt: "text-amber-400",  border: "border-amber-500/25",  hdr: "bg-amber-500/8"  },
  { tag: "bg-rose-500",   txt: "text-rose-400",   border: "border-rose-500/25",   hdr: "bg-rose-500/8"   },
]

function isQComplete(q) {
  return !!(q.question.trim() && q.options.every(o => o.text.trim() && o.explanation.trim()))
}

// ─── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, message, confirmLabel="Confirm", confirmCls="bg-rose-500 hover:bg-rose-400", onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative bg-[#0f1420] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-sm mx-4 p-5">
        <h3 className="text-sm font-bold text-white mb-1.5">{title}</h3>
        <p className="text-xs text-gray-400 leading-relaxed mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white bg-white/6 hover:bg-white/10 border border-white/8 transition">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition ${confirmCls}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Shared field styles ────────────────────────────────────────────────────
const F  = "w-full bg-[#0d1117] text-white text-sm rounded-lg px-3 py-2.5 border border-white/8 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 placeholder-gray-600 transition-all"
const FL = "block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5"

// ─── Step bar ─────────────────────────────────────────────────────────────────
function StepBar({ step, setStep, meta, questions }) {
  const detailsOk   = !!(meta.title.trim() && Number(meta.totalTime) > 0)
  const qDone       = questions.filter(isQComplete).length
  const questionsOk = questions.length >= 3 && qDone === questions.length
  const steps = [
    { id:0, icon:FileText, label:"Details",   sub: detailsOk ? meta.title.slice(0,20) : "Title · timing · marks", done:detailsOk },
    { id:1, icon:Target,   label:"Questions", sub: questions.length===0 ? "Add questions" : `${qDone}/${questions.length} ready`, done:questionsOk },
    { id:2, icon:Eye,      label:"Review",    sub:"Publish or draft", done:false },
  ]
  return (
    <div className="flex items-center gap-0.5">
      {steps.map((s, idx) => (
        <div key={s.id} className="flex items-center">
          <button onClick={() => setStep(s.id)}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              step===s.id ? "bg-white/8" : "hover:bg-white/4"
            }`}>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-all ${
              s.done        ? "bg-emerald-500 shadow-emerald-500/40 shadow-md"
              : step===s.id ? "bg-indigo-500 shadow-indigo-500/40 shadow-md"
                            : "bg-white/6 border border-white/10"
            }`}>
              {s.done ? <Check size={11} className="text-white"/> : <s.icon size={11} className={step===s.id?"text-white":"text-gray-500"}/>}
            </div>
            <div className="hidden sm:block text-left">
              <p className={`text-xs font-bold leading-none ${step===s.id?"text-white":"text-gray-500"}`}>{s.label}</p>
              <p className={`text-[10px] mt-0.5 leading-none truncate max-w-[110px] ${s.done?"text-emerald-400":"text-gray-600"}`}>{s.sub}</p>
            </div>
          </button>
          {idx < 2 && <div className={`w-4 h-px mx-0.5 ${steps[idx].done?"bg-emerald-500/40":"bg-white/8"}`}/>}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Quiz Details ──────────────────────────────────────────────────────
function StepDetails({ meta, onChange, onNext, hints }) {
  const ok = !!(meta.title.trim() && Number(meta.totalTime) > 0)
  const filteredTopics = hints.topics.filter(t =>
    !meta.category.trim() || hints.topicsByCategory[meta.category.trim()]?.has(t)
  )
  const mPQ = Number(meta.marksPerQ) || 1
  const nM  = Number(meta.negativeMark) || 0
  const marksWarning = nM > mPQ

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 w-full">
        <div className="mb-6">
          <h2 className="text-base font-bold text-white">Quiz Details</h2>
          <p className="text-xs text-gray-500 mt-0.5">Set title, timing and scoring before adding questions</p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {/* Left */}
          <div className="space-y-4">
            <div>
              <label className={FL}>Title <span className="text-indigo-400 normal-case font-normal tracking-normal">required</span></label>
              <input value={meta.title} onChange={e=>onChange("title",e.target.value)}
                placeholder="e.g. Uttarakhand GK — Set 1" autoFocus
                className={`${F} text-sm font-medium ${!meta.title.trim()?"border-amber-500/40":""}`}/>
              {!meta.title.trim() && <p className="flex items-center gap-1 text-[10px] text-amber-400 mt-1"><AlertTriangle size={9}/> Required</p>}
            </div>
            <div>
              <label className={FL}>Description <span className="text-gray-600 normal-case font-normal tracking-normal">optional</span></label>
              <textarea value={meta.description} onChange={e=>onChange("description",e.target.value)}
                placeholder="Brief description shown to students…" rows={3} className={`${F} resize-none`}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FL}>Subject</label>
                <input value={meta.category} onChange={e=>{onChange("category",e.target.value);onChange("topic","")}}
                  placeholder="e.g. Uttarakhand GK" list="hint-categories" autoComplete="off" className={F}/>
                <datalist id="hint-categories">{hints.categories.map(c=><option key={c} value={c}/>)}</datalist>
              </div>
              <div>
                <label className={FL}>Difficulty</label>
                <div className="grid grid-cols-3 gap-1">
                  {Object.entries(DIFF).map(([key,cfg])=>(
                    <button key={key} type="button" onClick={()=>onChange("difficulty",key)}
                      className={`py-2 rounded-lg border text-[10px] font-bold transition-all ${
                        meta.difficulty===key ? `${cfg.cls}` : "border-white/8 text-gray-600 hover:text-gray-400"
                      }`}>
                      <span className={`block w-1.5 h-1.5 rounded-full mx-auto mb-0.5 ${meta.difficulty===key?cfg.dot:"bg-gray-700"}`}/>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={FL}>Topic <span className="text-gray-600 normal-case font-normal tracking-normal">optional</span></label>
              <input value={meta.topic} onChange={e=>onChange("topic",e.target.value)}
                placeholder="e.g. Chapter 3 — Mughal Empire" list="hint-topics" autoComplete="off" className={F}/>
              <datalist id="hint-topics">{filteredTopics.map(t=><option key={t} value={t}/>)}</datalist>
            </div>
          </div>
          {/* Right */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FL}><span className="flex items-center gap-1"><Clock size={8}/> Duration (min) <span className="text-indigo-400 font-normal normal-case tracking-normal ml-1">req.</span></span></label>
                <input type="number" min={1} max={180} value={meta.totalTime}
                  onChange={e=>onChange("totalTime",e.target.value)}
                  className={`${F} ${(!meta.totalTime||Number(meta.totalTime)<=0)?"border-amber-500/40":""}`}/>
              </div>
              <div>
                <label className={FL}><span className="flex items-center gap-1"><Calendar size={8}/> Expires</span></label>
                <input type="datetime-local" value={meta.expiryDate||""} onChange={e=>onChange("expiryDate",e.target.value)} className={F}/>
              </div>
            </div>
            <div>
              <label className={FL}><span className="flex items-center gap-1"><BarChart2 size={8}/> Marking Scheme</span></label>
              <div className="bg-[#0d1117] border border-white/8 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-emerald-400 font-bold mb-1.5 flex items-center gap-1"><Zap size={9}/> Correct</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-black text-sm">+</span>
                      <input type="number" min={0.25} max={10} step={0.25} value={meta.marksPerQ}
                        onChange={e=>onChange("marksPerQ",parseFloat(e.target.value)||1)} className={`${F} py-2`}/>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-400 font-bold mb-1.5 flex items-center gap-1"><Minus size={9}/> Wrong</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-rose-400 font-black text-sm">−</span>
                      <input type="number" min={0} max={5} step={0.25} value={meta.negativeMark}
                        onChange={e=>onChange("negativeMark",parseFloat(e.target.value)||0)} className={`${F} py-2`}/>
                    </div>
                  </div>
                </div>
                {marksWarning && (
                  <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={10} className="text-amber-400 shrink-0"/>
                    <p className="text-[10px] text-amber-400">Negative mark exceeds correct mark</p>
                  </div>
                )}
                <div className="flex items-center justify-between bg-white/4 rounded-lg px-3 py-2 text-[10px]">
                  <span className="text-gray-500 font-mono">+{mPQ} correct · −{nM} wrong</span>
                  <span className="text-white font-bold">Max = {mPQ} × N</span>
                </div>
              </div>
            </div>
            {ok && (
              <div className="bg-indigo-500/6 border border-indigo-500/20 rounded-lg px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400/60 mb-1.5">Preview</p>
                <p className="text-sm font-bold text-white truncate mb-2">{meta.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {meta.difficulty && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DIFF[meta.difficulty]?.cls}`}>{DIFF[meta.difficulty]?.label}</span>}
                  {meta.category && <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/8">{meta.category}</span>}
                  <span className="text-[10px] text-gray-500 flex items-center gap-1"><Clock size={8}/> {meta.totalTime}m</span>
                  <span className="text-[10px] text-emerald-400">+{mPQ}</span>
                  {nM>0 && <span className="text-[10px] text-rose-400">−{nM}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-white/6 pt-5">
          <p className="text-xs text-gray-600">You can always return to edit these details</p>
          <button onClick={onNext} disabled={!ok}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl text-sm transition shadow-lg shadow-indigo-500/20">
            Next: Questions <ArrowRight size={14}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Question type detection ───────────────────────────────────────────────────
function detectQType(text) {
  if (text.includes("सूची-I") || text.includes("List-I") || text.includes("Column-I")) return "match"
  if (text.includes("अभिकथन (A)") || text.includes("Assertion (A)")) return "ar"
  if (text.includes("कथनों पर विचार") || text.match(/\n\d+\.\s/)) return "statement"
  return "direct"
}

// ─── Match builder ─────────────────────────────────────────────────────────────
const MATCH_LABELS_A = ["क", "ख", "ग", "घ"]
const MATCH_LABELS_B = ["1", "2", "3", "4"]
const mkMatchState = () => ({
  intro: "सूची-I को सूची-II से सुमेलित कीजिए:",
  listALabel: "सूची-I", listBLabel: "सूची-II",
  colA: ["", "", "", ""], colB: ["", "", "", ""],
})
function matchStateToQuestion(m) {
  const aLines = m.colA.map((v,i) => v.trim() ? `${MATCH_LABELS_A[i]}. ${v.trim()}` : null).filter(Boolean)
  const bLines = m.colB.map((v,i) => v.trim() ? `${MATCH_LABELS_B[i]}. ${v.trim()}` : null).filter(Boolean)
  return [m.intro.trim(), m.listALabel.trim(), ...aLines, "", m.listBLabel.trim(), ...bLines].join("\n")
}
function questionToMatchState(text) {
  const m = mkMatchState(); const lines = text.split("\n"); let section = "intro"
  for (const line of lines) {
    const t = line.trim(); if (!t) { if (section==="A") section="B"; continue }
    if (t.startsWith("सूची-II") || t.startsWith("List-II")) { m.listBLabel=t; section="B"; continue }
    if (t.startsWith("सूची-I")  || t.startsWith("List-I"))  { m.listALabel=t; section="A"; continue }
    if (section==="intro") { m.intro=t; continue }
    const mA = t.match(/^([कखगघ])[.)]\s*(.+)/); const mB = t.match(/^(\d)[.)]\s*(.+)/)
    if (section==="A" && mA) { const i=MATCH_LABELS_A.indexOf(mA[1]); if(i>=0) m.colA[i]=mA[2] }
    else if (section==="B" && mB) { const i=parseInt(mB[1])-1; if(i>=0&&i<4) m.colB[i]=mB[2] }
  }
  return m
}

function MatchBuilder({ value, onChange }) {
  const [st, setSt] = useState(() =>
    value && value.includes("सूची-I") ? questionToMatchState(value) : mkMatchState()
  )
  function upd(ns) { setSt(ns); onChange(matchStateToQuestion(ns)) }
  return (
    <div className="space-y-2 h-full flex flex-col">
      <input value={st.intro} onChange={e=>upd({...st,intro:e.target.value})}
        className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500/40 placeholder-gray-500 transition shrink-0"
        placeholder="सूची-I को सूची-II से सुमेलित कीजिए:"/>
      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
        <div className="bg-[#0d1117] border border-sky-500/20 rounded-lg overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-sky-500/15 bg-sky-500/5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"/>
            <input value={st.listALabel} onChange={e=>upd({...st,listALabel:e.target.value})}
              className="flex-1 bg-transparent text-sky-400 text-[11px] font-bold focus:outline-none" placeholder="सूची-I"/>
          </div>
          <div className="p-2 space-y-1.5 flex-1">
            {st.colA.map((v,i)=>(
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-[10px] font-black text-sky-400 shrink-0">{MATCH_LABELS_A[i]}</span>
                <input value={v} onChange={e=>{const c=[...st.colA];c[i]=e.target.value;upd({...st,colA:c})}}
                  placeholder={`Item ${MATCH_LABELS_A[i]}`}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-500/40 placeholder-gray-500"/>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#0d1117] border border-violet-500/20 rounded-lg overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-violet-500/15 bg-violet-500/5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400"/>
            <input value={st.listBLabel} onChange={e=>upd({...st,listBLabel:e.target.value})}
              className="flex-1 bg-transparent text-violet-400 text-[11px] font-bold focus:outline-none" placeholder="सूची-II"/>
          </div>
          <div className="p-2 space-y-1.5 flex-1">
            {st.colB.map((v,i)=>(
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-[10px] font-black text-violet-400 shrink-0">{MATCH_LABELS_B[i]}</span>
                <input value={v} onChange={e=>{const c=[...st.colB];c[i]=e.target.value;upd({...st,colB:c})}}
                  placeholder={`Value ${MATCH_LABELS_B[i]}`}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-violet-500/40 placeholder-gray-500"/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── JSON Preview Item ─────────────────────────────────────────────────────────
function JsonPreviewItem({ q, index }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-white/8 rounded-lg overflow-hidden hover:border-white/12 transition-colors">
      <button onClick={()=>setExpanded(e=>!e)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/3 transition">
        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
          isQComplete(q)?"bg-emerald-500/20 border border-emerald-500/30":"bg-amber-500/20 border border-amber-500/30"
        }`}>
          {isQComplete(q)?<CheckCircle size={9} className="text-emerald-400"/>:<AlertTriangle size={9} className="text-amber-400"/>}
        </div>
        <span className="text-[10px] font-bold text-indigo-400 shrink-0">Q{index+1}</span>
        <span className="text-sm text-gray-300 flex-1 truncate">{q.question.split("\n").find(l=>l.trim())||q.question}</span>
        {expanded?<ChevronUp size={11} className="text-gray-600"/>:<ChevronDown size={11} className="text-gray-600"/>}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-white/6 pt-2.5">
          <div className="text-sm text-gray-300 leading-relaxed">
            {q.question.split("\n").map((line,li)=>line.trim()===""?<br key={li}/>:<p key={li}>{line}</p>)}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {q.options.map((o,j)=>(
              <div key={j} className={`text-xs rounded-lg px-3 py-2 border ${
                j===q.correct?"bg-emerald-500/10 border-emerald-500/25 text-emerald-300":"bg-white/3 border-white/8 text-gray-500"
              }`}>
                <span className="font-black mr-1">{LABELS[j]}.</span>{o.text}
                <p className="opacity-60 mt-0.5 text-[10px]">{o.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Question Card — 3-column layout: number strip | question+list | options ───
function QuestionCard({ q, index, onChange, questions, activeIdx, setActiveIdx, addQuestion, removeQuestion, total }) {
  const [qType, setQType] = useState(() => detectQType(q.question))
  const [typeModal, setTypeModal] = useState(null) // {targetType}
  function updateOption(optIdx, field, val) {
    onChange(index, "options", q.options.map((o,j) => j===optIdx ? {...o,[field]:val} : o))
  }
  function handleTypeChange(t) {
    if (t === qType) return
    // If question has content, warn before wiping
    if (q.question.trim() && t !== "match") {
      setTypeModal({ targetType: t })
      return
    }
    applyTypeChange(t)
  }
  function applyTypeChange(t) {
    setQType(t)
    if (t==="match") onChange(index,"question",matchStateToQuestion(mkMatchState()))
    else onChange(index,"question","")
    setTypeModal(null)
  }
  const complete = isQComplete(q)
  const TYPE_TABS = [
    {id:"direct",label:"Direct"},{id:"statement",label:"कथन"},{id:"ar",label:"A/R"},{id:"match",label:"सूची"},
  ]

  return (
    <div className="flex h-full min-h-0 overflow-hidden w-full">

      {/* ══ COL 1: Question palette — wider, 3-per-row, big buttons ══ */}
      <div className="w-48 shrink-0 border-r border-white/6 flex flex-col bg-[#070a0f] min-h-0">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-white/6 shrink-0 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{total} Questions</p>
          <button onClick={addQuestion} title="Add question"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-indigo-400 hover:text-white hover:bg-indigo-500/20 border border-indigo-500/25 transition">
            <Plus size={13}/>
          </button>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-white/4">
          <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-sm bg-emerald-500/70 inline-block"/>Done</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-sm bg-amber-500/70 inline-block"/>Partial</span>
        </div>
        {/* Scrollable number buttons — 3 per row, large */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="grid grid-cols-3 gap-1.5">
            {questions.map((qItem, i) => {
              const isComplete = isQComplete(qItem)
              const isPartial  = qItem.question.trim() && !isComplete
              const isCurrent  = i === activeIdx
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  title={qItem.question ? qItem.question.split("\n")[0].slice(0,60) : `Q${i+1}`}
                  className={`w-full aspect-square rounded-lg flex items-center justify-center text-sm font-black border transition-all ${
                    isCurrent
                      ? "bg-indigo-500 border-indigo-400 text-white shadow-md shadow-indigo-500/30 scale-105 z-10 relative"
                      : isComplete
                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                      : isPartial
                      ? "bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                  }`}
                >
                  {i+1}
                </button>
              )
            })}
          </div>
        </div>
        {/* Footer: Delete current */}
        {total > 1 && (
          <div className="border-t border-white/6 px-2.5 py-2 shrink-0">
            <button onClick={() => removeQuestion(activeIdx)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/8 border border-rose-500/15 hover:border-rose-500/30 rounded-lg py-2 transition">
              <Trash2 size={12}/> Del Q{activeIdx+1}
            </button>
          </div>
        )}
      </div>

      {/* ══ COL 2: Question editor (top) + Question list (bottom) ══ */}
      <div className="flex flex-col border-r border-white/6 min-h-0 min-w-0" style={{width:"32%"}}>

        {/* Panel header: Q number + status + type tabs — bigger, readable */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/6 bg-[#0a0d13] shrink-0 gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black border transition-all ${
              complete ? "bg-emerald-500 border-emerald-400 text-white shadow-sm shadow-emerald-500/30" : "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
            }`}>
              {complete ? <Check size={11}/> : index+1}
            </div>
            <span className="text-sm font-bold text-white">Question</span>
            {!complete && <span className="text-[10px] text-amber-400/80 bg-amber-500/8 border border-amber-500/20 px-1.5 py-0.5 rounded-full">incomplete</span>}
            {complete && <span className="text-[10px] text-emerald-400/80 bg-emerald-500/8 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">ready ✓</span>}
          </div>
          {/* Type selector — readable 11px text */}
          <div className="flex gap-0.5 bg-white/4 rounded-lg p-0.5 border border-white/8">
            {TYPE_TABS.map(t=>(
              <button key={t.id} onClick={()=>handleTypeChange(t.id)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  qType===t.id ? "bg-indigo-500 text-white shadow-sm" : "text-gray-400 hover:text-gray-200 hover:bg-white/4"
                }`}>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Question textarea — 40% height, readable */}
        <div className="p-2.5 shrink-0" style={{height:"40%"}}>
          {qType==="match" ? (
            <div className="h-full overflow-y-auto">
              <MatchBuilder value={q.question} onChange={v=>onChange(index,"question",v)}/>
            </div>
          ) : (
            <textarea
              value={q.question}
              onChange={e=>onChange(index,"question",e.target.value)}
              placeholder={
                qType==="statement"
                  ? "निम्नलिखित कथनों पर विचार कीजिए:\n1. पहला कथन…\n2. दूसरा कथन…\nकौन सा/से सही है/हैं?"
                  : qType==="ar"
                  ? "अभिकथन (A): …\nकारण (R): …\nसही विकल्प चुनें:"
                  : "Type your question here…"
              }
              className="w-full h-full bg-[#0d1117] text-white text-sm rounded-lg px-3.5 py-3 border border-white/8 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 placeholder-gray-600 transition-all resize-none leading-relaxed"
            />
          )}
        </div>

        {/* Question list header */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-b border-white/6 bg-[#0a0d13] shrink-0">
          <p className="text-sm font-bold text-gray-300">All Questions · {total}</p>
          <button onClick={addQuestion}
            className="flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-2.5 py-1 rounded-lg transition border border-indigo-500/20 hover:border-indigo-500/40">
            <Plus size={11}/> Add
          </button>
        </div>

        {/* Question list — larger, readable rows */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="py-1">
            {questions.map((qItem, i) => {
              const isComplete = isQComplete(qItem)
              const isPartial  = qItem.question.trim() && !isComplete
              const isCurrent  = i === activeIdx
              const firstLine  = qItem.question.split("\n").find(l=>l.trim()) || ""
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all ${
                    isCurrent
                      ? "bg-indigo-500/10 border-l-2 border-l-indigo-500"
                      : "hover:bg-white/3 border-l-2 border-l-transparent"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    isCurrent   ? "bg-indigo-400"
                    :isComplete ? "bg-emerald-400"
                    :isPartial  ? "bg-amber-400"
                    :"bg-gray-700"
                  }`}/>
                  <span className={`text-xs font-black shrink-0 w-6 tabular-nums ${
                    isCurrent?"text-indigo-300":isComplete?"text-emerald-400":isPartial?"text-amber-400":"text-gray-500"
                  }`}>{i+1}</span>
                  <span className={`text-sm flex-1 truncate leading-snug ${
                    isCurrent?"text-white font-medium":isComplete?"text-gray-200":"text-gray-400"
                  }`}>
                    {firstLine || <em className="opacity-40 text-xs">Empty question</em>}
                  </span>
                  {isComplete && <span className={`text-xs font-black shrink-0 w-5 h-5 rounded flex items-center justify-center ${
                    isCurrent ? "bg-indigo-500/30 text-indigo-300" : "bg-emerald-500/20 text-emerald-400"
                  }`}>{LABELS[qItem.correct]}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══ COL 3: 4 options as 2×2 grid — fills remaining space ══ */}
      <div className="flex flex-col min-h-0 overflow-hidden flex-1 min-w-0">
        {/* Panel header — clear instruction */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/6 bg-[#0a0d13] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Options</span>
            <span className="text-xs text-gray-400">answer + explanation</span>
          </div>
          {/* Prominent hint */}
          <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-400/80 bg-indigo-500/8 border border-indigo-500/20 px-2 py-0.5 rounded-full">
            <span className="font-black">A B C D</span> to mark correct
          </span>
        </div>

        {/* 2×2 grid — fills full remaining height */}
        <div className="flex-1 grid grid-cols-2 grid-rows-2 min-h-0 overflow-hidden">
          {q.options.map((o, j) => {
            const isCorrect = j === q.correct
            const c = OPT[j]
            const borderR = j===0||j===2 ? "border-r border-white/6" : ""
            const borderB = j<2 ? "border-b border-white/6" : ""
            return (
              <div key={j} className={`flex flex-col min-h-0 overflow-hidden transition-colors ${borderR} ${borderB} ${
                isCorrect ? "bg-emerald-500/4" : ""
              }`}>
                {/* Option header — click to mark correct */}
                <button
                  type="button"
                  onClick={()=>onChange(index,"correct",j)}
                  title={isCorrect ? "Correct answer" : "Click to mark as correct answer"}
                  className={`flex items-center gap-2 px-3 py-2 shrink-0 w-full text-left transition-colors ${
                    isCorrect ? "bg-emerald-500/12 hover:bg-emerald-500/18" : `${c.hdr} hover:bg-white/5`
                  }`}
                >
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                    isCorrect ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30" : `${c.tag} text-white`
                  }`}>{LABELS[j]}</span>
                  <span className={`text-xs font-bold flex-1 ${isCorrect ? "text-emerald-300" : "text-gray-500"}`}>
                    {isCorrect ? "✓ Correct answer" : <span className="text-gray-600 group-hover:text-gray-400">Mark as correct</span>}
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
                    onChange={e=>updateOption(j,"text",e.target.value)}
                    placeholder="Answer text…"
                    className={`w-full bg-[#0d1117] rounded-lg px-2.5 py-2 text-sm border focus:outline-none focus:ring-1 placeholder-gray-600 transition-all shrink-0 ${
                      isCorrect
                        ? "text-emerald-200 border-emerald-500/25 focus:border-emerald-400/50 focus:ring-emerald-500/10"
                        : "text-gray-200 border-white/8 focus:border-white/20 focus:ring-white/5"
                    }`}
                  />
                  {/* Explanation label + textarea */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 shrink-0">Explanation</p>
                    <textarea
                      value={o.explanation}
                      onChange={e=>updateOption(j,"explanation",e.target.value)}
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
      {/* Type change confirm modal */}
      {typeModal && (
        <ConfirmModal
          open={true}
          title={`Switch to ${typeModal.targetType === "statement" ? "कथन" : typeModal.targetType === "ar" ? "A/R" : typeModal.targetType === "match" ? "सूची" : "Direct"} type?`}
          message="Switching question type will clear the current question text. This cannot be undone."
          confirmLabel="Yes, switch & clear"
          confirmCls="bg-indigo-500 hover:bg-indigo-400"
          onConfirm={() => applyTypeChange(typeModal.targetType)}
          onCancel={() => setTypeModal(null)}
        />
      )}
    </div>
  )
}

// ─── Step 2: Questions ─────────────────────────────────────────────────────────
function StepQuestions({ questions, setQuestions, mode, setMode, onNext, onBack }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [jsonError, setJsonError] = useState("")
  const [jsonDragging, setJsonDragging] = useState(false)
  const [jsonStep, setJsonStep] = useState("upload")
  const [modeConfirm, setModeConfirm] = useState(null) // {targetMode}
  const [parseConfirm, setParseConfirm] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // {index}

  const done  = questions.filter(isQComplete).length
  const total = questions.length
  const ready = total >= 3 && done === total
  const safeIdx  = Math.min(activeIdx, Math.max(0, total - 1))
  const currentQ = questions[safeIdx]

  function updateQuestion(i, field, value) {
    setQuestions(qs => qs.map((q,idx) => idx===i ? {...q,[field]:value} : q))
  }
  function addQuestion() {
    if (total>=100) return toast.error("Maximum 100 questions allowed")
    setQuestions(qs => [...qs, mkBlankQ()])
    setActiveIdx(total)
  }
  function removeQuestion(i) {
    if (total<=1) return toast.error("Minimum 1 question required")
    setDeleteConfirm({ index: i })
  }
  function doRemove(i) {
    setQuestions(qs=>qs.filter((_,idx)=>idx!==i))
    setActiveIdx(prev=>Math.min(prev, total-2))
    setDeleteConfirm(null)
  }
  function downloadSample() {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON,null,2)],{type:"application/json"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a"); a.href=url; a.download="sample-quiz.json"; a.click()
    URL.revokeObjectURL(url)
  }
  function parseFileActual(file) {
    setJsonError(""); if(!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if(!Array.isArray(data)||!data.length) throw new Error("JSON must be a non-empty array")
        if(data.length<3)   throw new Error("Minimum 3 questions required")
        if(data.length>100) throw new Error("Maximum 100 questions allowed")
        const errs=[]
        data.forEach((q,i)=>{
          if(!q.question) errs.push(`Q${i+1}: missing "question"`)
          if(!Array.isArray(q.options)||q.options.length!==4) errs.push(`Q${i+1}: need exactly 4 options`)
          else q.options.forEach((o,j)=>{
            if(!o.text)        errs.push(`Q${i+1} opt${j+1}: missing "text"`)
            if(!o.explanation) errs.push(`Q${i+1} opt${j+1}: missing "explanation"`)
          })
          if(q.correct===undefined||q.correct<0||q.correct>3) errs.push(`Q${i+1}: "correct" must be 0–3`)
        })
        if(errs.length) throw new Error(errs.slice(0,5).join("\n")+(errs.length>5?`\n…+${errs.length-5} more`:""))
        setQuestions(data); setActiveIdx(0); setJsonStep("preview")
      } catch(err){ setJsonError(err.message) }
    }
    reader.readAsText(file)
  }
  function parseFile(file) {
    if(!file) return
    if(jsonStep==="preview"&&questions.length>0) {
      setPendingFile(file); setParseConfirm(true); return
    }
    parseFileActual(file)
  }
  function handleFile(e)     { const f=e.target.files[0]; e.target.value=""; parseFile(f) }
  function handleDrop(e)     { e.preventDefault(); setJsonDragging(false); parseFile(e.dataTransfer.files[0]) }
  function handleDragOver(e) { e.preventDefault(); setJsonDragging(true) }
  function handleDragLeave() { setJsonDragging(false) }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="px-4 py-2 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#0a0d13]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Questions</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            ready?"text-emerald-400 bg-emerald-500/10 border-emerald-500/25":"text-gray-500 bg-white/4 border-white/8"
          }`}>{done}/{total} ready</span>
          {total>0&&total<3 && (
            <span className="text-xs text-amber-400 bg-amber-500/8 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Need {3-total} more
            </span>
          )}
          {mode==="manual" && (
            <div className="flex items-center gap-1 ml-1">
              <button onClick={addQuestion}
                className="flex items-center gap-1 text-xs font-bold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/30 px-2 py-1 rounded-lg transition">
                <Plus size={11}/> Add Q
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-white/4 border border-white/8 rounded-lg p-0.5">
            {[{id:"manual",icon:PenLine,label:"Manual"},{id:"json",icon:FileJson,label:"JSON"}].map(({id,icon:Icon,label})=>(
              <button key={id} onClick={()=>{
                if(id==="json"&&mode==="manual"&&questions.some(q=>q.question.trim()||q.options.some(o=>o.text.trim()))) {
                  setModeConfirm({ targetMode: id }); return
                }
                setMode(id)
                if(id==="json") { setJsonStep("upload"); setQuestions([]) }
                if(id==="manual") { setJsonStep("upload"); setJsonError(""); if(questions.length===0){setQuestions([mkBlankQ()]);setActiveIdx(0)} }
              }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  mode===id?"bg-indigo-500 text-white shadow-sm":"text-gray-500 hover:text-gray-300"
                }`}>
                <Icon size={12}/>{label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* Manual mode */}
        {mode==="manual" && (
          total===0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                <BookOpen size={22} className="text-indigo-400"/>
              </div>
              <p className="text-white font-bold mb-1">No questions yet</p>
              <p className="text-gray-500 text-sm mb-5">Add your first question to get started.</p>
              <button onClick={addQuestion}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-lg shadow-indigo-500/25">
                <Plus size={13}/> Add First Question
              </button>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* QuestionCard now owns all 3 columns internally */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {currentQ && (
                  <QuestionCard
                    key={safeIdx}
                    q={currentQ}
                    index={safeIdx}
                    onChange={updateQuestion}
                    questions={questions}
                    activeIdx={safeIdx}
                    setActiveIdx={setActiveIdx}
                    addQuestion={addQuestion}
                    removeQuestion={removeQuestion}
                    total={total}
                  />
                )}
              </div>
            </div>
          )
        )}

        {/* JSON: upload */}
        {mode==="json" && jsonStep==="upload" && (
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-xl mx-auto space-y-4">
              <label onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                className={`block w-full border-2 border-dashed rounded-2xl p-10 cursor-pointer text-center transition-all ${
                  jsonDragging?"border-indigo-500/60 bg-indigo-500/8":"border-white/10 hover:border-indigo-500/40 hover:bg-white/2"
                }`}>
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto mb-3 transition-all ${
                  jsonDragging?"bg-indigo-500/20 border-indigo-500/40":"bg-white/4 border-white/8"
                }`}>
                  <FileJson size={20} className={jsonDragging?"text-indigo-400":"text-gray-500"}/>
                </div>
                <p className="text-sm font-bold text-white mb-1">{jsonDragging?"Drop to upload":"Drop JSON here, or click to browse"}</p>
                <p className="text-xs text-gray-600">.json · 3–100 questions</p>
                <input type="file" accept=".json" onChange={handleFile} className="hidden"/>
              </label>
              <div className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-white">Download sample JSON</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">See the required format</p>
                </div>
                <button onClick={downloadSample}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 px-3 py-1.5 rounded-lg transition">
                  Download
                </button>
              </div>
              {jsonError && (
                <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl px-4 py-3 flex gap-3">
                  <XCircle size={13} className="text-rose-400 shrink-0 mt-0.5"/>
                  <pre className="text-xs text-rose-400 whitespace-pre-wrap font-mono">{jsonError}</pre>
                </div>
              )}
              <div className="bg-white/2 border border-white/6 rounded-xl p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">JSON Format</p>
                <pre className="text-[10px] text-gray-500 font-mono leading-relaxed">{`[
  {
    "question": "Your question text",
    "options": [
      { "text": "Option A", "explanation": "Why A…" },
      { "text": "Option B", "explanation": "Why B…" },
      { "text": "Option C", "explanation": "…" },
      { "text": "Option D", "explanation": "…" }
    ],
    "correct": 0
  }
]`}</pre>
              </div>
            </div>
          </div>
        )}

        {/* JSON: preview */}
        {mode==="json" && jsonStep==="preview" && total>0 && (
          <div className="flex-1 overflow-y-auto px-8 py-5">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400"/>
                  <p className="text-sm text-white font-bold">{total} questions loaded</p>
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">All valid ✓</span>
                </div>
                <button onClick={()=>{setQuestions([]);setJsonStep("upload")}}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white bg-white/4 hover:bg-white/8 border border-white/8 px-3 py-1.5 rounded-lg transition">
                  <RotateCcw size={10}/> Change file
                </button>
              </div>
              <div className="space-y-2">
                {questions.map((q,i)=><JsonPreviewItem key={i} q={q} index={i}/>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <ConfirmModal
          open={true}
          title={`Remove Question ${deleteConfirm.index+1}?`}
          message="This question and all its answer data will be permanently deleted. This cannot be undone."
          confirmLabel="Delete Question"
          confirmCls="bg-rose-500 hover:bg-rose-400"
          onConfirm={()=>doRemove(deleteConfirm.index)}
          onCancel={()=>setDeleteConfirm(null)}
        />
      )}
      {/* Mode switch confirm modal */}
      {modeConfirm && (
        <ConfirmModal
          open={true}
          title="Switch to JSON mode?"
          message={`Switching to JSON will discard all ${questions.length} manually entered question${questions.length!==1?"s":""}. This cannot be undone.`}
          confirmLabel="Yes, discard & switch"
          confirmCls="bg-rose-500 hover:bg-rose-400"
          onConfirm={()=>{
            setMode(modeConfirm.targetMode)
            setJsonStep("upload"); setQuestions([]); setModeConfirm(null)
          }}
          onCancel={()=>setModeConfirm(null)}
        />
      )}
      {/* Replace file confirm modal */}
      {parseConfirm && (
        <ConfirmModal
          open={true}
          title="Replace loaded questions?"
          message={`This will replace ${questions.length} loaded question${questions.length!==1?"s":""} with the new file. This cannot be undone.`}
          confirmLabel="Yes, replace"
          confirmCls="bg-rose-500 hover:bg-rose-400"
          onConfirm={()=>{ setParseConfirm(false); if(pendingFile){ const f=pendingFile; setPendingFile(null); parseFileActual(f) } }}
          onCancel={()=>{ setParseConfirm(false); setPendingFile(null) }}
        />
      )}
      {/* Bottom nav */}
      <div className="px-4 py-2.5 border-t border-white/6 flex items-center justify-between shrink-0 bg-[#0a0d13]">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition">
          <ArrowLeft size={12}/> Back to Details
        </button>
        <button onClick={onNext} disabled={!ready}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2 rounded-xl text-sm transition shadow-lg shadow-indigo-500/20">
          Review & Save <ArrowRight size={13}/>
        </button>
      </div>
    </div>
  )
}

// ─── Review item ───────────────────────────────────────────────────────────────
function ReviewItem({ q, index }) {
  const [expanded, setExpanded] = useState(false)
  const complete = isQComplete(q)
  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      complete?"border-white/8 hover:border-white/12":"border-amber-500/25 hover:border-amber-500/35"
    }`}>
      <button onClick={()=>setExpanded(e=>!e)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/3 transition">
        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
          complete?"bg-emerald-500/20 border border-emerald-500/30":"bg-amber-500/15 border border-amber-500/25"
        }`}>
          {complete?<CheckCircle size={9} className="text-emerald-400"/>:<AlertTriangle size={9} className="text-amber-400"/>}
        </div>
        <span className="text-xs font-bold text-gray-500 shrink-0">Q{index+1}</span>
        <span className="text-sm text-gray-300 flex-1 truncate">
          {(q.question||"Empty question").split("\n").find(l=>l.trim())||"Empty question"}
        </span>
        {expanded?<ChevronUp size={11} className="text-gray-600"/>:<ChevronDown size={11} className="text-gray-600"/>}
      </button>
      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-1.5 border-t border-white/6 pt-2.5">
          {q.options.map((o,j)=>(
            <div key={j} className={`text-xs rounded-lg px-3 py-2 border ${
              j===q.correct?"bg-emerald-500/10 border-emerald-500/20 text-emerald-300":"bg-white/3 border-white/6 text-gray-500"
            }`}>
              <span className="font-black mr-1">{LABELS[j]}.</span>
              {o.text||<em className="opacity-40">empty</em>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 3: Review & Save ─────────────────────────────────────────────────────
function StepReview({ meta, questions, saving, onSave, onBack }) {
  const done = questions.filter(isQComplete).length
  const canPublish = done===questions.length && questions.length>=3 && meta.title.trim() && Number(meta.totalTime)>0
  const mPQ = Number(meta.marksPerQ)||1
  const nM  = Number(meta.negativeMark)||0
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-5">
          <div className="bg-indigo-500/6 border border-indigo-500/20 rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400/60 mb-2">Quiz Summary</p>
            <h3 className="text-lg font-bold text-white mb-2">{meta.title}</h3>
            {meta.description && <p className="text-sm text-gray-400 mb-3 leading-relaxed">{meta.description}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {meta.difficulty && <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${DIFF[meta.difficulty]?.cls}`}>{DIFF[meta.difficulty]?.label}</span>}
              {meta.category && <span className="text-xs text-gray-400 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full">{meta.category}</span>}
              {meta.topic && <span className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">📌 {meta.topic}</span>}
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10}/> {meta.totalTime}m</span>
              <span className="text-xs text-gray-500">{questions.length} questions</span>
              <span className="text-xs text-emerald-400 font-semibold">+{mPQ}</span>
              {nM>0&&<span className="text-xs text-rose-400 font-semibold">−{nM}</span>}
            </div>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-white">Questions ready</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                done===questions.length?"text-emerald-400 bg-emerald-500/10 border-emerald-500/25":"text-amber-400 bg-amber-500/10 border-amber-500/25"
              }`}>{done}/{questions.length}</span>
            </div>
            {done<questions.length && <p className="text-xs text-amber-400">{questions.length-done} incomplete — cannot publish</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">Questions</p>
            <div className="space-y-2">
              {questions.map((q,i)=><ReviewItem key={i} q={q} index={i}/>)}
            </div>
          </div>
        </div>
      </div>
      <div className="px-8 py-4 border-t border-white/6 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition">
            <ArrowLeft size={13}/> Back to Questions
          </button>
          <div className="flex items-center gap-3">
            <button onClick={()=>onSave("draft")} disabled={saving||!meta.title.trim()}
              className="flex items-center gap-2 bg-white/6 hover:bg-white/10 disabled:opacity-40 text-gray-300 font-bold px-5 py-2.5 rounded-xl text-sm border border-white/8 transition">
              <Save size={12}/> Save as Draft
            </button>
            <button onClick={()=>onSave("published")} disabled={saving||!canPublish}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl text-sm transition shadow-lg shadow-indigo-500/25">
              <Send size={13}/> {saving?"Publishing…":"Publish Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function QuizCreate() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [step,      setStep]      = useState(0)
  const [saving,    setSaving]    = useState(false)
  const [mode,      setMode]      = useState("manual")
  const [meta,      setMeta]      = useState({
    title:"", description:"", category:"", topic:"", difficulty:"medium",
    totalTime:10, expiryDate:"", marksPerQ:1, negativeMark:0,
  })
  const [questions, setQuestions] = useState([mkBlankQ()])
  const [hints, setHints] = useState({ categories:[], topics:[], topicsByCategory:{} })

  useEffect(() => {
    const hasWork = meta.title.trim() || questions.some(q=>q.question.trim()||q.options.some(o=>o.text.trim()))
    function beforeUnload(e) { if(hasWork){ e.preventDefault(); e.returnValue="" } }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [meta.title, questions])

  useEffect(() => {
    async function loadHints() {
      try {
        const quizzes = await cachedGetDocs("quizSets", collection(db,"quizSets"), { ttl: TTL_LONG })
        const catSet={}, topSet=new Set(), topicsByCategory={}
        quizzes.forEach(q => {
          if(q.category?.trim()) {
            catSet[q.category.trim()]=true
            if(q.topic?.trim()) {
              if(!topicsByCategory[q.category.trim()]) topicsByCategory[q.category.trim()]=new Set()
              topicsByCategory[q.category.trim()].add(q.topic.trim())
            }
          }
          if(q.topic?.trim()) topSet.add(q.topic.trim())
        })
        setHints({ categories:Object.keys(catSet).sort(), topics:[...topSet].sort(), topicsByCategory })
      } catch(e) { console.error("hints load failed",e) }
    }
    loadHints()
  }, [])

  function handleMetaChange(field, value) { setMeta(m=>({...m,[field]:value})) }

  function validate(status) {
    if(!meta.title.trim())               { toast.error("Quiz title is required"); return false }
    const t = Number(meta.totalTime)
    if(!t||t<=0)                         { toast.error("Duration must be > 0"); return false }
    if(t>180)                            { toast.error("Duration cannot exceed 180 minutes"); return false }
    const mPQ=Number(meta.marksPerQ)||1, nM=Number(meta.negativeMark)||0
    if(nM>mPQ)                           { toast.error(`Negative mark (${nM}) > marks per question (${mPQ})`); return false }
    if(meta.expiryDate && new Date(meta.expiryDate)<=new Date()) { toast.error("Expiry date must be in the future"); return false }
    if(questions.length<3)               { toast.error("Minimum 3 questions required"); return false }
    if(questions.length>100)             { toast.error("Maximum 100 questions allowed"); return false }
    if(status==="published") {
      for(let i=0;i<questions.length;i++){
        const q=questions[i]
        if(!q.question.trim()) { toast.error(`Q${i+1}: Question text is empty`); return false }
        for(let j=0;j<4;j++){
          if(!q.options[j].text.trim())        { toast.error(`Q${i+1} Option ${LABELS[j]}: text is empty`); return false }
          if(!q.options[j].explanation.trim()) { toast.error(`Q${i+1} Option ${LABELS[j]}: explanation is empty`); return false }
        }
      }
    }
    return true
  }

  async function handleSave(status) {
    if(!validate(status)) return
    setSaving(true)
    try {
      const quizRef = await addDoc(collection(db,"quizSets"),{
        title:        meta.title.trim(),
        description:  meta.description.trim(),
        category:     meta.category.trim(),
        topic:        meta.topic.trim(),
        difficulty:   meta.difficulty,
        totalTime:    Math.max(1,Math.floor(Number(meta.totalTime))),
        marksPerQ:    Number(meta.marksPerQ)||1,
        negativeMark: Number(meta.negativeMark)||0,
        createdBy:    currentUser.uid,
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
        status,
        publishAt:    null,
        questionCount:questions.length,
        expiryDate:   meta.expiryDate ? new Date(meta.expiryDate).toISOString() : null,
      })
      const batch = writeBatch(db)
      questions.forEach((q,i)=>{
        const {category,difficulty,...rest}=q
        batch.set(doc(collection(db,"quizSets",quizRef.id,"questions")),{...rest,order:i})
      })
      await batch.commit()
      invalidateCache("query:quizSets")
      toast.success(status==="published"?"Quiz published! 🚀":"Saved as draft!")
      navigate("/admin/quizzes")
    } catch(e){ console.error(e); toast.error("Failed to save quiz") }
    setSaving(false)
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-screen overflow-hidden bg-[#080b10]">

        {/* Top bar — slim, fixed height */}
        <div className="flex items-center gap-0 px-3 border-b border-white/6 shrink-0 bg-[#080b10]/95 backdrop-blur-sm" style={{height:52}}>
          <button onClick={()=>navigate("/admin/quizzes")}
            className="flex items-center gap-1 text-gray-500 hover:text-white text-xs transition group px-2 py-1.5 rounded-lg hover:bg-white/4 shrink-0">
            <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform"/> Back
          </button>
          <div className="h-3 w-px bg-white/8 mx-2 shrink-0"/>
          <StepBar step={step} setStep={setStep} meta={meta} questions={questions}/>
          <div className="flex-1"/>

        </div>

        {step===0 && <StepDetails meta={meta} onChange={handleMetaChange} onNext={()=>setStep(1)} hints={hints}/>}
        {step===1 && <StepQuestions questions={questions} setQuestions={setQuestions} mode={mode} setMode={setMode} onNext={()=>setStep(2)} onBack={()=>setStep(0)}/>}
        {step===2 && <StepReview meta={meta} questions={questions} saving={saving} onSave={handleSave} onBack={()=>setStep(1)}/>}
      </div>
    </AdminLayout>
  )
}
