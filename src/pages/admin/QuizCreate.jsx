import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { collection, addDoc, writeBatch, doc } from "firebase/firestore"
import { invalidateCache } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import {
  PenLine, Upload, Plus, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Download, AlertTriangle, ArrowLeft,
  Clock, FileJson, Send, Save, ChevronRight, ChevronLeft, ArrowRight,
  Check, RotateCcw, BookOpen
} from "lucide-react"
import toast from "react-hot-toast"

// ─── Constants ────────────────────────────────────────────────────────────────
const BLANK_OPTION   = { text: "", explanation: "" }
const mkBlankQ = () => ({
  question: "",
  options: [0,1,2,3].map(() => ({ ...BLANK_OPTION })),
  correct: 0,
})
const SAMPLE_JSON = [
  {
    question: "निम्नलिखित कथनों पर विचार कीजिए:\n1. 1813 के चार्टर अधिनियम ने ईस्ट इंडिया कंपनी का व्यापारिक एकाधिकार आंशिक रूप से समाप्त किया।\n2. 1833 के चार्टर अधिनियम ने चीन के साथ व्यापार पर भी एकाधिकार समाप्त किया।\nउपर्युक्त में से कौन सा/से कथन सही है/हैं?",
    options: [
      { text: "केवल 1",        explanation: "1813 में एकाधिकार आंशिक रूप से समाप्त हुआ था।" },
      { text: "केवल 2",        explanation: "1833 के अधिनियम ने सभी व्यापारिक एकाधिकार समाप्त किए।" },
      { text: "1 और 2 दोनों", explanation: "पहला कथन ऐतिहासिक रूप से असत्य है।" },
      { text: "न तो 1 न ही 2", explanation: "दूसरा कथन पूरी तरह सत्य है।" },
    ],
    correct: 1, category: "Indian Polity", difficulty: "moderate",
  },
  {
    question: "सूची-I को सूची-II से सुमेलित कीजिए:\nसूची-I\nक. नियंत्रण बोर्ड की स्थापना\nख. सर्वोच्च न्यायालय की स्थापना\nग. ईसाई मिशनरियों को प्रवेश की अनुमति\nघ. विधि सदस्य की नियुक्ति\n\nसूची-II\n1. रेगुलेटिंग एक्ट 1773\n2. पिट्स इंडिया एक्ट 1784\n3. चार्टर एक्ट 1813\n4. चार्टर एक्ट 1833",
    options: [
      { text: "क-2, ख-1, ग-3, घ-4", explanation: "नियंत्रण बोर्ड 1784, सर्वोच्च न्यायालय 1773, मिशनरी 1813, विधि सदस्य 1833।" },
      { text: "क-1, ख-2, ग-3, घ-4", explanation: "नियंत्रण बोर्ड 1773 में नहीं बना था।" },
      { text: "क-2, ख-1, ग-4, घ-3", explanation: "मिशनरियों का प्रवेश 1813 का हिस्सा था।" },
      { text: "क-4, ख-3, ग-2, घ-1", explanation: "यह क्रम पूरी तरह से गलत है।" },
    ],
    correct: 0, category: "Indian Polity", difficulty: "hard",
  },
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
  easy:   { label: "Easy",   cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  medium: { label: "Medium", cls: "text-amber-400   bg-amber-500/10   border-amber-500/30"   },
  hard:   { label: "Hard",   cls: "text-rose-400    bg-rose-500/10    border-rose-500/30"     },
}
// shared field + label styles
const F = "w-full bg-gray-900 text-white text-sm rounded-xl px-4 py-3 border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none placeholder-gray-600 transition"
const L = "block text-xs font-semibold text-gray-400 mb-2"
const LABELS = ["A","B","C","D"]

function isQComplete(q) {
  return !!(q.question.trim() && q.options.every(o => o.text.trim() && o.explanation.trim()))
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ step, setStep, meta, questions }) {
  const detailsOk   = !!(meta.title.trim() && meta.totalTime)
  const qDone       = questions.filter(isQComplete).length
  const questionsOk = questions.length >= 3 && qDone === questions.length

  const steps = [
    { id: 0, label: "Quiz Details",   sub: detailsOk ? meta.title : "Title, timing, marks",    done: detailsOk   },
    { id: 1, label: "Questions",      sub: questions.length === 0 ? "Add questions" : `${qDone}/${questions.length} complete`, done: questionsOk },
    { id: 2, label: "Review & Save",  sub: "Publish or draft",                                   done: false       },
  ]

  return (
    <div className="flex items-center gap-0">
      {steps.map((s, idx) => (
        <div key={s.id} className="flex items-center">
          <button onClick={() => setStep(s.id)}
            className={`flex items-center gap-2.5 px-4 py-3.5 transition ${step === s.id ? "opacity-100" : "opacity-55 hover:opacity-85"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border transition ${
              s.done        ? "bg-emerald-500 border-emerald-500 text-white"
              : step===s.id ? "bg-cyan-500 border-cyan-500 text-gray-900"
                            : "bg-gray-800 border-gray-700 text-gray-500"
            }`}>
              {s.done ? <Check size={10}/> : idx+1}
            </div>
            <div className="text-left">
              <p className={`text-xs font-semibold leading-none ${step===s.id ? "text-white" : "text-gray-400"}`}>{s.label}</p>
              <p className={`text-[10px] mt-0.5 leading-none truncate max-w-[140px] ${s.done ? "text-emerald-400" : "text-gray-600"}`}>{s.sub}</p>
            </div>
          </button>
          {idx < 2 && <div className={`w-8 h-px ${steps[idx].done ? "bg-emerald-500/40" : "bg-gray-800"}`}/>}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Quiz Details — FULL WIDTH two-column ─────────────────────────────
function StepDetails({ meta, onChange, onNext }) {
  const ok = !!(meta.title.trim() && meta.totalTime)

  return (
    <div className="flex-1 overflow-y-auto">
      {/* FIX: full width, two-column layout, no max-w constraint that forces scroll */}
      <div className="px-10 py-8 max-w-5xl mx-auto w-full">

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Quiz Details</h2>
          <p className="text-sm text-gray-500">Give your quiz a title, set the timing and marking scheme.</p>
        </div>

        {/* Two-column grid — left: identity, right: settings */}
        <div className="grid grid-cols-2 gap-8">

          {/* ── Left column: identity ── */}
          <div className="space-y-5">
            <div>
              <label className={L}>Quiz Title <span className="text-cyan-500">*</span></label>
              <input value={meta.title} onChange={e => onChange("title", e.target.value)}
                placeholder="e.g. Uttarakhand GK Set 1" autoFocus
                className={`${F} text-base ${!meta.title.trim() ? "border-amber-500/40" : ""}`}/>
              {!meta.title.trim() && (
                <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={10}/> Required
                </p>
              )}
            </div>

            <div>
              <label className={L}>Description <span className="text-gray-600 font-normal">(optional)</span></label>
              <textarea value={meta.description} onChange={e => onChange("description", e.target.value)}
                placeholder="Short description shown to students…" rows={3}
                className={`${F} resize-none`}/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>Subject / Category</label>
                <input value={meta.category} onChange={e => onChange("category", e.target.value)}
                  placeholder="e.g. History, Science…" className={F}/>
              </div>
              <div>
                <label className={L}>Difficulty</label>
                <select value={meta.difficulty} onChange={e => onChange("difficulty", e.target.value)} className={F}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <label className={L}>Topic / Chapter <span className="text-gray-600 font-normal">(optional)</span></label>
              <input value={meta.topic} onChange={e => onChange("topic", e.target.value)}
                placeholder="e.g. Chapter 3 — Mughal Empire, Polity Unit 2…" className={F}/>
              <p className="text-[10px] text-gray-600 mt-1.5">Helps students filter quizzes by specific chapters or topics within a subject.</p>
            </div>
          </div>

          {/* ── Right column: settings ── */}
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>Total Time (min) <span className="text-cyan-500">*</span></label>
                <input type="number" min={1} max={180} value={meta.totalTime}
                  onChange={e => onChange("totalTime", e.target.value)}
                  className={`${F} ${!meta.totalTime ? "border-amber-500/40" : ""}`}/>
              </div>
              <div>
                <label className={L}>Expiry <span className="text-gray-600 font-normal">(optional)</span></label>
                <input type="datetime-local" value={meta.expiryDate||""} onChange={e => onChange("expiryDate", e.target.value)} className={F}/>
              </div>
            </div>

            <div>
              <label className={L}>Marking Scheme</label>
              <div className="bg-gray-900 border border-gray-700/60 rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-emerald-400 font-semibold mb-2">Correct answer +</p>
                    <input type="number" min={0.25} max={10} step={0.25} value={meta.marksPerQ}
                      onChange={e => onChange("marksPerQ", parseFloat(e.target.value)||1)} className={F}/>
                  </div>
                  <div>
                    <p className="text-xs text-rose-400 font-semibold mb-2">Wrong answer −</p>
                    <input type="number" min={0} max={5} step={0.25} value={meta.negativeMark}
                      onChange={e => onChange("negativeMark", parseFloat(e.target.value)||0)} className={F}/>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs bg-gray-800/60 rounded-lg px-3 py-2">
                  <span className="text-gray-500">{meta.marksPerQ} × correct − {meta.negativeMark} × wrong</span>
                  <span className="text-white font-semibold">Max = {meta.marksPerQ} × Q</span>
                </div>
              </div>
            </div>

            {/* Preview pill */}
            {ok && (
              <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl px-4 py-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Preview</p>
                <p className="text-sm font-semibold text-white truncate mb-1.5">{meta.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DIFF[meta.difficulty]?.cls}`}>
                    {DIFF[meta.difficulty]?.label}
                  </span>
                  {meta.category && <span className="text-[10px] text-gray-500">{meta.category}</span>}
                  {meta.topic && <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">{meta.topic}</span>}
                  <span className="text-[10px] text-gray-600 flex items-center gap-0.5"><Clock size={8}/> {meta.totalTime}m</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-gray-800/50 pt-6">
          <p className="text-xs text-gray-600">You can always come back to edit these</p>
          <button onClick={onNext} disabled={!ok}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-black px-7 py-3 rounded-xl text-sm transition">
            Next: Add Questions <ArrowRight size={15}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Question type detection ──────────────────────────────────────────────────
function detectQType(text) {
  if (text.includes("सूची-I") || text.includes("List-I") || text.includes("Column-I")) return "match"
  if (text.includes("अभिकथन (A)") || text.includes("Assertion (A)") || text.includes("नीचे दो कथन दिए गए हैं")) return "ar"
  if (text.includes("कथनों पर विचार") || text.match(/\\n\d+\.\s/)) return "statement"
  return "direct"
}

// ─── सूची (Match-the-list) Builder ────────────────────────────────────────────
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
    if (t.startsWith("सूची-I") || t.startsWith("List-I"))  { m.listALabel=t; section="A"; continue }
    if (t.startsWith("सूची-II") || t.startsWith("List-II")) { m.listBLabel=t; section="B"; continue }
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
    <div className="space-y-3">
      <input value={st.intro} onChange={e=>upd({...st,intro:e.target.value})} className={F}
        placeholder="सूची-I को सूची-II से सुमेलित कीजिए:" />
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/60 border border-cyan-500/20 rounded-xl p-3 space-y-2">
          <input value={st.listALabel} onChange={e=>upd({...st,listALabel:e.target.value})}
            className="w-full bg-transparent text-cyan-400 text-xs font-bold pb-1.5 border-b border-gray-700/50 focus:outline-none" placeholder="सूची-I"/>
          {st.colA.map((v,i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-black text-cyan-600 w-5 shrink-0">{MATCH_LABELS_A[i]}.</span>
              <input value={v} onChange={e=>{const c=[...st.colA];c[i]=e.target.value;upd({...st,colA:c})}}
                placeholder={`Item ${MATCH_LABELS_A[i]}`}
                className="flex-1 bg-gray-800/60 border border-gray-700/40 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/30 placeholder-gray-600"/>
            </div>
          ))}
        </div>
        <div className="bg-gray-900/60 border border-violet-500/20 rounded-xl p-3 space-y-2">
          <input value={st.listBLabel} onChange={e=>upd({...st,listBLabel:e.target.value})}
            className="w-full bg-transparent text-violet-400 text-xs font-bold pb-1.5 border-b border-gray-700/50 focus:outline-none" placeholder="सूची-II"/>
          {st.colB.map((v,i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-black text-violet-600 w-5 shrink-0">{MATCH_LABELS_B[i]}.</span>
              <input value={v} onChange={e=>{const c=[...st.colB];c[i]=e.target.value;upd({...st,colB:c})}}
                placeholder={`Value ${MATCH_LABELS_B[i]}`}
                className="flex-1 bg-gray-800/60 border border-gray-700/40 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-500/30 placeholder-gray-600"/>
            </div>
          ))}
        </div>
      </div>
      {value && (
        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3 text-[11px] font-mono leading-relaxed">
          <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-1.5">Live preview</p>
          {value.split("\n").map((l,i) => l.trim()==="" ? <br key={i}/> : <p key={i} className="text-gray-400">{l}</p>)}
        </div>
      )}
    </div>
  )
}

// ─── Question card ────────────────────────────────────────────────────────────
function QuestionCard({ q, index, expanded, onToggle, onChange, onRemove, onDone, total, alwaysOpen }) {
  const [qType, setQType] = useState(() => detectQType(q.question))
  function updateOption(optIdx, field, value) {
    onChange(index, "options", q.options.map((o,j) => j===optIdx ? {...o,[field]:value} : o))
  }
  function handleTypeChange(t) {
    setQType(t)
    if (t === "match") onChange(index, "question", matchStateToQuestion(mkMatchState()))
    else if (t !== qType) onChange(index, "question", "")
  }
  const complete = isQComplete(q)
  const TYPE_TABS = [
    { id:"direct",    label:"Direct" },
    { id:"statement", label:"कथन" },
    { id:"ar",        label:"A/R" },
    { id:"match",     label:"सूची (Match)" },
  ]
  const isExpanded = alwaysOpen || expanded
  return (
    <div className={`rounded-2xl border transition-all ${
      isExpanded ? "border-cyan-500/40 bg-gray-900/90"
      : complete ? "border-emerald-500/20 bg-gray-900/30 hover:border-emerald-500/35"
      : "border-gray-700/40 bg-gray-900/20 hover:border-gray-600/50"
    }`}>
      {/* Header — hide toggle if alwaysOpen, show type tabs inline */}
      {alwaysOpen ? (
        <div className="w-full px-4 py-2.5 border-b border-gray-800/50">
          {/* Top row: Q number + type tabs + remove */}
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-xs font-black border ${
              complete ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
            }`}>{complete ? <CheckCircle size={11}/> : index+1}</div>

            {/* Type tabs inline */}
            <div className="flex gap-1 flex-1">
              {TYPE_TABS.map(t => (
                <button key={t.id} onClick={()=>handleTypeChange(t.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                    qType===t.id
                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                      : "border-gray-700/40 text-gray-600 hover:text-gray-300 hover:border-gray-600"
                  }`}>{t.label}
                </button>
              ))}
            </div>

            {total > 1 && (
              <button onClick={e=>{e.stopPropagation();onRemove(index)}}
                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-gray-700 hover:text-rose-400 transition shrink-0">
                <Trash2 size={12}/>
              </button>
            )}
          </div>
          {/* Preview of question text */}
          {q.question.trim() && (
            <p className="text-[11px] text-gray-600 truncate mt-1 pl-8">{q.question.split("\n").find(l=>l.trim())||q.question}</p>
          )}
        </div>
      ) : (
      <div role="button" tabIndex={0} onClick={() => onToggle(index)} onKeyDown={e=>e.key==="Enter"&&onToggle(index)} className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black border ${
          complete ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
          : isExpanded ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
          : "bg-gray-800/60 border-gray-700/40 text-gray-500"
        }`}>{complete ? <CheckCircle size={13}/> : index+1}</div>
        <div className="flex-1 min-w-0">
          {q.question.trim()
            ? <p className="text-sm text-gray-200 truncate">{q.question.split("\n").find(l=>l.trim())||q.question}</p>
            : <p className="text-sm text-gray-600 italic">Question {index+1} — click to edit</p>}
          {complete && (
            <p className="text-[10px] text-emerald-500/60 mt-0.5 truncate">✓ {LABELS[q.correct]} · {q.options[q.correct].text.slice(0,60)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {total > 1 && (
            <button onClick={e=>{e.stopPropagation();onRemove(index)}}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-gray-700 hover:text-rose-400 transition">
              <Trash2 size={12}/>
            </button>
          )}
          {isExpanded ? <ChevronUp size={13} className="text-gray-600"/> : <ChevronRight size={13} className="text-gray-600"/>}
        </div>
      </div>
      )}

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-800/50">

          {/* Question input — type tabs shown in header when alwaysOpen */}
          <div className="pt-4">
            {/* Show type tabs here only when NOT alwaysOpen (collapsed accordion mode) */}
            {!alwaysOpen && (
              <div className="flex gap-1.5 mb-3">
                {TYPE_TABS.map(t => (
                  <button key={t.id} onClick={()=>handleTypeChange(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      qType===t.id
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                        : "border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                    }`}>{t.label}
                  </button>
                ))}
              </div>
            )}
            <label className={L}>
              Question Text <span className="text-cyan-500">*</span>
              {qType==="statement" && <span className="text-gray-600 font-normal ml-2">each line = one statement</span>}
              {qType==="ar"        && <span className="text-gray-600 font-normal ml-2">each line shown as labelled block</span>}
            </label>
            {qType === "match" ? (
              <MatchBuilder value={q.question} onChange={v=>onChange(index,"question",v)}/>
            ) : (
              <textarea value={q.question} onChange={e=>onChange(index,"question",e.target.value)}
                rows={qType==="ar"||qType==="statement" ? 5 : 3}
                placeholder={
                  qType==="statement" ? "निम्नलिखित कथनों पर विचार कीजिए:\n1. पहला कथन…\n2. दूसरा कथन…\nकौन सा/से सही है/हैं?"
                  : qType==="ar"      ? "अभिकथन (A): …\nकारण (R): …\nसही विकल्प चुनें:"
                  : "Type your question here…"
                }
                className={`${F} resize-y text-base`}/>
            )}
          </div>

          {/* Options — click header to mark correct, no separate correct-answer row */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={L} style={{marginBottom:0}}>Options <span className="text-gray-600 font-normal">(answer + explanation)</span></label>
              <span className="text-[10px] text-gray-600 bg-gray-800/60 border border-gray-700/30 px-2 py-0.5 rounded-full">Click option to mark correct</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {q.options.map((o,j) => (
                <div key={j} className={`rounded-xl border transition-all ${
                  j===q.correct ? "border-emerald-500/40 bg-emerald-500/6" : "border-gray-700/50 bg-gray-800/20"
                }`}>
                  {/* Clickable header marks this as correct */}
                  <button
                    type="button"
                    onClick={()=>onChange(index,"correct",j)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-t-xl transition ${
                      j===q.correct ? "bg-emerald-500/10 hover:bg-emerald-500/15" : "hover:bg-gray-700/30"
                    }`}>
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                      j===q.correct ? "bg-emerald-500 text-white" : "bg-gray-700 text-gray-400"
                    }`}>{LABELS[j]}</span>
                    <span className={`text-xs font-semibold flex-1 text-left ${j===q.correct ? "text-emerald-400" : "text-gray-500"}`}>
                      {j===q.correct ? "✓ Correct answer" : "Option — click to mark correct"}
                    </span>
                  </button>
                  <div className="px-3 pb-3 space-y-2">
                    <input value={o.text} onChange={e=>updateOption(j,"text",e.target.value)}
                      placeholder="Answer text *"
                      className={`w-full rounded-lg px-3 py-2 text-sm border bg-gray-900/80 focus:outline-none placeholder-gray-600 transition ${
                        j===q.correct ? "text-emerald-200 border-emerald-500/30 focus:border-emerald-400/60"
                        : "text-gray-200 border-gray-700/50 focus:border-gray-500"
                      }`}/>
                    <input value={o.explanation} onChange={e=>updateOption(j,"explanation",e.target.value)}
                      placeholder="Explanation *"
                      className={`w-full rounded-lg px-3 py-2 text-xs border bg-gray-900/80 focus:outline-none placeholder-gray-600 transition ${
                        j===q.correct ? "text-emerald-300/70 border-emerald-500/20 focus:border-emerald-400/40"
                        : "text-gray-400 border-gray-700/40 focus:border-gray-600"
                      }`}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Done button */}
          <div className="flex items-center justify-between pt-1">
            <span className={`text-xs ${complete ? "text-emerald-400 flex items-center gap-1" : "text-gray-600"}`}>
              {complete ? <><CheckCircle size={11}/> Question complete</> : "Fill all fields to complete"}
            </span>
            <button onClick={()=>onDone(index)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl border transition ${
                complete
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                  : "bg-gray-800/60 border-gray-700/40 text-gray-500 hover:text-gray-300"
              }`}>
              <Check size={11}/> Done editing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── JSON preview item — extracted as component (FIX: no hooks in .map) ───────
function JsonPreviewItem({ q, index }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-emerald-500/20 bg-emerald-500/3 rounded-2xl overflow-hidden">
      <button onClick={()=>setExpanded(e=>!e)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-emerald-500/5 transition">
        <CheckCircle size={13} className="text-emerald-400 shrink-0"/>
        <span className="text-sm text-gray-300 flex-1 truncate">
          <span className="text-cyan-400 font-bold mr-2">Q{index+1}.</span>
          {q.question.split("\n").find(l => l.trim()) || q.question}
        </span>
        {expanded ? <ChevronUp size={12} className="text-gray-600"/> : <ChevronDown size={12} className="text-gray-600"/>}
      </button>
      {expanded && (
        <div className="px-5 pb-4 space-y-3">
          <div className="text-sm text-gray-200 leading-relaxed space-y-0.5">
            {q.question.split("\n").map((line, li) =>
              line.trim() === "" ? <br key={li}/> : <p key={li}>{line}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
          {q.options.map((o,j) => (
            <div key={j} className={`text-xs rounded-xl px-3 py-2.5 ${
              j===q.correct ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-300" : "bg-gray-800/50 text-gray-500"
            }`}>
              <span className="font-black mr-1.5">{LABELS[j]}.</span>{o.text}
              <p className="opacity-60 mt-1">{o.explanation}</p>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 2: Questions ────────────────────────────────────────────────────────
function StepQuestions({ questions, setQuestions, mode, setMode, onNext, onBack }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [jsonError,    setJsonError]    = useState("")
  const [jsonDragging, setJsonDragging] = useState(false)
  const [jsonStep,     setJsonStep]     = useState("upload")

  const done  = questions.filter(isQComplete).length
  const total = questions.length
  const ready = total>=3 && done===total

  function updateQuestion(i, field, value) {
    setQuestions(qs => qs.map((q,idx) => idx===i ? {...q,[field]:value} : q))
  }
  function addQuestion() {
    if (total>=100) return toast.error("Maximum 100 questions allowed")
    const newIdx = total
    setQuestions(qs => [...qs, mkBlankQ()])
    setActiveIdx(newIdx)
  }
  function removeQuestion(i) {
    if (total<=1) return toast.error("Minimum 1 question required")
    if (!window.confirm("Remove this question?")) return
    setQuestions(qs=>qs.filter((_,idx)=>idx!==i))
    setActiveIdx(prev => Math.min(prev, total - 2))
  }

  function downloadSample() {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON,null,2)],{type:"application/json"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a"); a.href=url; a.download="sample-quiz.json"; a.click()
    URL.revokeObjectURL(url)
  }
  function parseFile(file) {
    setJsonError(""); if(!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!Array.isArray(data)||!data.length) throw new Error("JSON must be a non-empty array")
        if (data.length<3)   throw new Error("Minimum 3 questions required")
        if (data.length>100) throw new Error("Maximum 100 questions allowed")
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
        setQuestions(data)
        setActiveIdx(0)
        setJsonStep("preview")
      } catch(err){setJsonError(err.message)}
    }
    reader.readAsText(file)
  }
  function handleFile(e)     { parseFile(e.target.files[0]); e.target.value="" }
  function handleDrop(e)     { e.preventDefault();setJsonDragging(false);parseFile(e.dataTransfer.files[0]) }
  function handleDragOver(e) { e.preventDefault();setJsonDragging(true) }
  function handleDragLeave() { setJsonDragging(false) }

  const safeIdx = Math.min(activeIdx, Math.max(0, total - 1))
  const currentQ = questions[safeIdx]

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub-header */}
      <div className="px-6 py-3 border-b border-gray-800/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-white">Questions</h2>
          <span className={`text-xs font-semibold ${ready?"text-emerald-400":"text-gray-500"}`}>
            {done}/{total} complete
          </span>
          {total>0 && total<3 && <span className="text-xs text-amber-400">· need {3-total} more</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-800/60 border border-gray-700/40 rounded-xl p-1">
            {[{id:"manual",icon:PenLine,label:"Manual"},{id:"json",icon:FileJson,label:"JSON"}].map(({id,icon:Icon,label})=>(
              <button key={id} onClick={()=>{ setMode(id); if(id==="json"){ setJsonStep("upload"); setQuestions([]); } if(id==="manual" && questions.length===0){ setQuestions([mkBlankQ()]); setActiveIdx(0) } }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode===id?"bg-gray-700 text-white":"text-gray-500 hover:text-gray-300"
                }`}>
                <Icon size={12}/>{label}
              </button>
            ))}
          </div>
          {mode==="manual" && (
            <button onClick={addQuestion}
              className="flex items-center gap-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-gray-700/50 px-3 py-1.5 rounded-xl transition">
              <Plus size={13}/> Add
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {mode==="manual" && (
          <div className="flex flex-col h-full">
            {total===0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-gray-800/60 border border-gray-700/40 flex items-center justify-center mb-4">
                  <BookOpen size={26} className="text-gray-600"/>
                </div>
                <p className="text-gray-400 font-semibold mb-1">No questions yet</p>
                <p className="text-gray-600 text-sm mb-5">Add your first question to get started</p>
                <button onClick={addQuestion}
                  className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-6 py-2.5 rounded-xl text-sm transition">
                  <Plus size={14}/> Add First Question
                </button>
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── LEFT: Question number grid panel ── */}
                <div className="w-52 shrink-0 border-r border-gray-800/50 flex flex-col bg-gray-950/40">
                  <div className="px-3 py-2.5 border-b border-gray-800/40 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{total} Q's</span>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[9px] text-gray-600"><span className="w-2 h-2 rounded-sm bg-emerald-500/50 inline-block"/>Done</span>
                      <span className="flex items-center gap-1 text-[9px] text-gray-600"><span className="w-2 h-2 rounded-sm bg-amber-500/50 inline-block"/>Partial</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {questions.map((q, i) => {
                        const complete = isQComplete(q)
                        const partial  = q.question.trim() && !complete
                        const cur      = i === safeIdx
                        return (
                          <button key={i} onClick={() => setActiveIdx(i)}
                            title={q.question ? q.question.split("\n")[0].slice(0, 50) : `Q${i+1}`}
                            className={`w-8 h-8 rounded-lg text-[11px] font-black border transition-all ${
                              cur
                                ? "bg-cyan-500 border-cyan-400 text-gray-900 scale-110 shadow-md shadow-cyan-500/25"
                                : complete
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                                : partial
                                ? "bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/20"
                                : "bg-gray-800/60 border-gray-700/40 text-gray-500 hover:bg-gray-700/60"
                            }`}>
                            {i + 1}
                          </button>
                        )
                      })}
                      <button onClick={addQuestion} title="Add question"
                        className="w-8 h-8 rounded-lg text-[11px] font-black border border-dashed border-cyan-500/30 text-cyan-500/50 hover:border-cyan-500/60 hover:text-cyan-400 hover:bg-cyan-500/8 transition">
                        +
                      </button>
                    </div>
                  </div>
                  {/* Prev/Next at bottom of grid panel */}
                  <div className="border-t border-gray-800/40 px-3 py-2 flex items-center justify-between">
                    <button onClick={() => setActiveIdx(i => Math.max(0, i-1))}
                      disabled={safeIdx===0}
                      className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-25 transition">
                      <ChevronLeft size={14}/>
                    </button>
                    <span className="text-[10px] text-gray-600 tabular-nums font-medium">{safeIdx+1} / {total}</span>
                    <button onClick={() => setActiveIdx(i => Math.min(total-1, i+1))}
                      disabled={safeIdx===total-1}
                      className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-25 transition">
                      <ChevronRight size={14}/>
                    </button>
                  </div>
                </div>

                {/* ── RIGHT: Single question editor ── */}
                <div className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
                  {currentQ && (
                    <QuestionCard
                      key={safeIdx}
                      q={currentQ}
                      index={safeIdx}
                      expanded={true}
                      onToggle={() => {}}
                      onChange={updateQuestion}
                      onRemove={removeQuestion}
                      onDone={() => {}}
                      total={total}
                      alwaysOpen
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {mode==="json" && jsonStep==="upload" && (
          <div className="px-8 py-6 max-w-3xl mx-auto w-full space-y-5">
            <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm font-semibold text-white mb-1">Required JSON schema</p>
                  <p className="text-xs text-gray-500">Download the sample, fill your questions, upload below.</p>
                </div>
                <button onClick={downloadSample}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-gray-700/50 px-3 py-2 rounded-xl transition">
                  <Download size={12}/> Sample
                </button>
              </div>
              <div className="bg-gray-950/80 rounded-xl p-4 font-mono text-[11px] text-gray-500 overflow-x-auto space-y-3">
                <pre className="leading-relaxed">{`[
  {
    "question": "Your question text here?",
    "options": [
      { "text": "Option A", "explanation": "Why A is correct/wrong" },
      { "text": "Option B", "explanation": "Why B is correct/wrong" },
      { "text": "Option C", "explanation": "Why C is correct/wrong" },
      { "text": "Option D", "explanation": "Why D is correct/wrong" }
    ],
    "correct": 0,
    "category": "GK",
    "difficulty": "easy"
  }
]`}</pre>
                <div className="border-t border-gray-800 pt-3 space-y-2">
                  <p className="text-gray-400 font-semibold text-[11px]">📝 Multi-line questions (कथन / सूची type)</p>
                  <p className="text-gray-600 text-[10px] leading-relaxed">Use <span className="text-cyan-400 font-bold">\n</span> inside the question string to break lines. Each <span className="text-cyan-400">\n</span> becomes a new line when shown to the student.</p>
                  <pre className="leading-relaxed text-[10px] text-gray-600">{`"question": "निम्नलिखित कथनों पर विचार कीजिए:\\n1. कथन एक।\\n2. कथन दो।\\nकौन सा सही है?"`}</pre>
                  <p className="text-gray-400 font-semibold text-[11px] pt-1">🔗 Match-the-list (सूची-I / सूची-II type)</p>
                  <pre className="leading-relaxed text-[10px] text-gray-600">{`"question": "सूची-I को सूची-II से सुमेलित कीजिए:\\nसूची-I\\nक. item1\\nख. item2\\n\\nसूची-II\\n1. value1\\n2. value2"`}</pre>
                  <p className="text-gray-600 text-[10px]">Options for match-type: <span className="text-cyan-400">"क-2, ख-1, ग-3, घ-4"</span> etc.</p>
                </div>
              </div>
            </div>
            <label onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
              className={`block w-full border-2 border-dashed rounded-2xl p-12 cursor-pointer text-center transition ${
                jsonDragging?"border-cyan-500/60 bg-cyan-500/5":"border-gray-700/40 hover:border-cyan-500/30 hover:bg-gray-800/20"
              }`}>
              <div className="w-12 h-12 rounded-2xl bg-gray-800/60 border border-gray-700/30 flex items-center justify-center mx-auto mb-4">
                <FileJson size={22} className={jsonDragging?"text-cyan-400":"text-gray-500"}/>
              </div>
              <p className="text-sm font-semibold text-gray-300 mb-1">{jsonDragging?"Drop to upload":"Drop JSON here or click to browse"}</p>
              <p className="text-xs text-gray-600">.json · 3–100 questions</p>
              <input type="file" accept=".json" onChange={handleFile} className="hidden"/>
            </label>
            {jsonError && (
              <div className="bg-rose-500/8 border border-rose-500/20 rounded-2xl px-4 py-3 flex gap-3">
                <XCircle size={14} className="text-rose-400 shrink-0 mt-0.5"/>
                <pre className="text-xs text-rose-400 whitespace-pre-wrap font-mono">{jsonError}</pre>
              </div>
            )}
          </div>
        )}

        {/* FIX: JsonPreviewItem is a proper component — no useState in .map */}
        {mode==="json" && jsonStep==="preview" && total>0 && (
          <div className="px-8 py-5 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">
                <span className="text-white font-semibold">{total} questions</span> loaded
                <span className="text-emerald-400 ml-2">· all valid ✓</span>
              </p>
              <button onClick={()=>{setQuestions([]);setJsonStep("upload")}}
                className="text-xs text-gray-500 hover:text-white transition flex items-center gap-1">
                <RotateCcw size={11}/> Change file
              </button>
            </div>
            <div className="space-y-2">
              {questions.map((q,i)=>(
                <JsonPreviewItem key={i} q={q} index={i}/>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="px-8 py-4 border-t border-gray-800/50 flex items-center justify-between shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition">
          <ArrowLeft size={14}/> Back to Details
        </button>
        <button onClick={onNext} disabled={!ready}
          className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-black px-6 py-2.5 rounded-xl text-sm transition">
          Review & Save <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  )
}

// ─── Step 3: Review & Save ────────────────────────────────────────────────────
// FIX: ReviewItem extracted as component
function ReviewItem({ q, index }) {
  const [expanded, setExpanded] = useState(false)
  const complete = isQComplete(q)
  return (
    <div className={`border rounded-xl overflow-hidden ${complete?"border-emerald-500/20":"border-amber-500/20"}`}>
      <button onClick={()=>setExpanded(e=>!e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/30 transition">
        {complete
          ? <CheckCircle size={13} className="text-emerald-400 shrink-0"/>
          : <AlertTriangle size={13} className="text-amber-400 shrink-0"/>}
        <span className="text-sm text-gray-300 flex-1 truncate">
          <span className="font-bold mr-1.5 text-gray-500">Q{index+1}.</span>
          {(q.question || "Empty question").split("\n").find(l => l.trim()) || "Empty question"}
        </span>
        {expanded ? <ChevronUp size={12} className="text-gray-600"/> : <ChevronDown size={12} className="text-gray-600"/>}
      </button>
      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-1.5">
          {q.options.map((o,j)=>(
            <div key={j} className={`text-xs rounded-lg px-3 py-2 ${
              j===q.correct?"bg-emerald-500/10 border border-emerald-500/20 text-emerald-300":"bg-gray-800/60 text-gray-500"
            }`}>
              <span className="font-black mr-1.5">{LABELS[j]}.</span>
              {o.text||<em className="opacity-40">empty</em>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StepReview({ meta, questions, saving, onSave, onBack }) {
  const done = questions.filter(isQComplete).length
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
          <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6">
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Quiz Summary</p>
            <h3 className="text-lg font-bold text-white mb-2">{meta.title}</h3>
            {meta.description && <p className="text-sm text-gray-500 mb-3">{meta.description}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              {meta.difficulty && <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${DIFF[meta.difficulty]?.cls}`}>{DIFF[meta.difficulty]?.label}</span>}
              {meta.category && <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700/40 px-2.5 py-1 rounded-full">{meta.category}</span>}
              {meta.topic && <span className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">📌 {meta.topic}</span>}
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11}/> {meta.totalTime} min</span>
              <span className="text-xs text-gray-500">{questions.length} questions</span>
              <span className="text-xs text-emerald-400">+{meta.marksPerQ} correct</span>
              {meta.negativeMark>0 && <span className="text-xs text-rose-400">−{meta.negativeMark} wrong</span>}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Questions ({done}/{questions.length})</p>
              {done===questions.length
                ? <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle size={11}/> All complete</span>
                : <span className="text-xs text-amber-400">{questions.length-done} incomplete</span>}
            </div>
            <div className="space-y-2">
              {questions.map((q,i)=><ReviewItem key={i} q={q} index={i}/>)}
            </div>
          </div>
        </div>
      </div>
      <div className="px-8 py-5 border-t border-gray-800/50 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition">
            <ArrowLeft size={14}/> Back to Questions
          </button>
          <div className="flex items-center gap-3">
            <button onClick={()=>onSave("draft")} disabled={saving||!meta.title.trim()}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 font-semibold px-5 py-3 rounded-xl text-sm border border-gray-700/50 transition">
              <Save size={13}/> Save as Draft
            </button>
            <button onClick={()=>onSave("published")} disabled={saving||done!==questions.length||questions.length<3}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-black px-6 py-3 rounded-xl text-sm transition">
              <Send size={14}/> {saving?"Publishing…":"Publish Now"}
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

  function handleMetaChange(field, value) { setMeta(m=>({...m,[field]:value})) }

  function validate() {
    if (!meta.title.trim())     { toast.error("Quiz title is required"); return false }
    if (questions.length<3)     { toast.error("Minimum 3 questions required"); return false }
    if (questions.length>100)   { toast.error("Maximum 100 questions allowed"); return false }
    for (let i=0;i<questions.length;i++) {
      const q=questions[i]
      if (!q.question.trim()) { toast.error(`Q${i+1}: Question text is empty`); return false }
      for (let j=0;j<4;j++) {
        if (!q.options[j].text.trim())        { toast.error(`Q${i+1} Option ${LABELS[j]}: text empty`); return false }
        if (!q.options[j].explanation.trim()) { toast.error(`Q${i+1} Option ${LABELS[j]}: explanation empty`); return false }
      }
    }
    return true
  }

  async function handleSave(status) {
    if (!validate()) return
    setSaving(true)
    try {
      const quizRef = await addDoc(collection(db,"quizSets"),{
        title:         meta.title.trim(),
        description:   meta.description.trim(),
        category:      meta.category.trim(),
        topic:         meta.topic.trim(),
        difficulty:    meta.difficulty,
        totalTime:     Number(meta.totalTime),
        marksPerQ:     Number(meta.marksPerQ)||1,
        negativeMark:  Number(meta.negativeMark)||0,
        createdBy:     currentUser.uid,
        createdAt:     new Date().toISOString(),
        status,
        publishAt:     null,
        questionCount: questions.length,
        expiryDate:    meta.expiryDate ? new Date(meta.expiryDate).toISOString() : null,
      })
      const batch = writeBatch(db)
      questions.forEach((q,i)=>{
        const {category,difficulty,...rest}=q
        batch.set(doc(collection(db,"quizSets",quizRef.id,"questions")),{...rest,order:i})
      })
      await batch.commit()
      // Invalidate quiz list cache so Dashboard and Batches show the new quiz immediately
      invalidateCache("query:quizSets")
      toast.success(status==="published"?"Quiz published! 🚀":"Saved as draft!")
      navigate("/admin/quizzes")
    } catch(e){ console.error(e); toast.error("Failed to save quiz") }
    setSaving(false)
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex items-center gap-0 px-4 border-b border-gray-800/50 shrink-0 bg-gray-950">
          <button onClick={()=>navigate("/admin/quizzes")}
            className="flex items-center gap-1.5 text-gray-500 hover:text-white text-xs transition group px-3 py-4 shrink-0">
            <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform"/> Back
          </button>
          <div className="h-4 w-px bg-gray-800 mx-1 shrink-0"/>
          <StepBar step={step} setStep={setStep} meta={meta} questions={questions}/>
          <div className="flex-1"/>
          <div className="px-3">
            <button onClick={()=>handleSave("draft")} disabled={saving||!meta.title.trim()}
              className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition border border-gray-700/40 bg-gray-800/40 hover:bg-gray-800 px-3.5 py-2 rounded-xl flex items-center gap-1.5">
              <Save size={11}/> Draft
            </button>
          </div>
        </div>

        {step===0 && <StepDetails meta={meta} onChange={handleMetaChange} onNext={()=>setStep(1)}/>}
        {step===1 && <StepQuestions questions={questions} setQuestions={setQuestions} mode={mode} setMode={setMode} onNext={()=>setStep(2)} onBack={()=>setStep(0)}/>}
        {step===2 && <StepReview meta={meta} questions={questions} saving={saving} onSave={handleSave} onBack={()=>setStep(1)}/>}
      </div>
    </AdminLayout>
  )
}