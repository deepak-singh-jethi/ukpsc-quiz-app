import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { db } from "../../firebase/config"
import { collection, getDocs, deleteDoc, doc, updateDoc, addDoc, writeBatch, orderBy, query } from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Clock, Users, Copy,
  Search, LayoutGrid, List, Calendar, X, Tag, Globe,
  Layers, MoreVertical
} from "lucide-react"
import toast from "react-hot-toast"

const STATUS_CFG = {
  published: { label: "Published", dot: "bg-emerald-400", text: "text-emerald-400", badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", stripe: "bg-emerald-500/50" },
  draft:     { label: "Draft",     dot: "bg-gray-500",    text: "text-gray-400",    badge: "text-gray-400 bg-white/4 border-white/8",                   stripe: "bg-gray-700/60"   },
  scheduled: { label: "Scheduled", dot: "bg-amber-400",   text: "text-amber-400",   badge: "text-amber-400 bg-amber-500/10 border-amber-500/20",         stripe: "bg-amber-500/50"  },
  expired:   { label: "Expired",   dot: "bg-rose-400",    text: "text-rose-400",    badge: "text-rose-400 bg-rose-500/10 border-rose-500/20",             stripe: "bg-rose-500/30"   },
}
const DIFF_CFG = {
  easy:   { label: "Easy",   cls: "text-emerald-400" },
  medium: { label: "Medium", cls: "text-amber-400"   },
  hard:   { label: "Hard",   cls: "text-rose-400"    },
}
const QM_PAGE_SIZE = 20

function Modal({ open, onClose, children, maxW = "max-w-sm" }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxW} bg-[#0a0d13] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden`}>
        {children}
      </div>
    </div>
  )
}

function ConfirmModal({ open, icon, title, message, confirmLabel, confirmCls = "bg-rose-500 hover:bg-rose-400 text-white", onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel}>
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs text-gray-400 leading-relaxed mt-1.5">{message}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/8 bg-white/2">
        <button onClick={onCancel}
          className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition">
          Cancel
        </button>
        <button onClick={onConfirm}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${confirmCls}`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

function ScheduleModal({ open, onClose, onConfirm, date, setDate }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Clock size={15} className="text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Schedule Publish</h3>
          <p className="text-xs text-gray-500 mt-0.5">Quiz goes live automatically at the chosen time.</p>
        </div>
      </div>
      <div className="px-5 pb-4">
        <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
          className="w-full bg-[#0d1117] text-white rounded-xl px-4 py-2.5 border border-white/8 focus:border-amber-500/50 focus:outline-none text-sm" />
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/8 bg-white/2">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition">
          Cancel
        </button>
        <button onClick={onConfirm}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-gray-900 transition">
          <Clock size={11} /> Schedule
        </button>
      </div>
    </Modal>
  )
}

export default function QuizManager() {
  const navigate = useNavigate()

  const [quizzes,    setQuizzes]    = useState([])
  const [batches,    setBatches]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState("grid")
  const [search,     setSearch]     = useState("")
  const [catFilter,  setCatFilter]  = useState("all")
  const [topicFilter,setTopicFilter]= useState("all")
  const [levelFilter,setLevelFilter]= useState("all")
  const [batchFilter,setBatchFilter]= useState("none")
  const [statusTab,  setStatusTab]  = useState("all")
  const [page,       setPage]       = useState(1)
  const [menuOpen,   setMenuOpen]   = useState(null)

  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [scheduleDate,   setScheduleDate]   = useState("")
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [dupTarget,      setDupTarget]      = useState(null)
  const [freeTarget,     setFreeTarget]     = useState(null)
  const [duplicating,    setDuplicating]    = useState(null)
  const [makingFree,     setMakingFree]     = useState(null)

  async function loadQuizzes() {
    setLoading(true)
    try {
      const [data, batchSnap] = await Promise.all([
        cachedGetDocs("quizSets", query(collection(db, "quizSets"), orderBy("createdAt", "desc")), { ttl: TTL_LONG }),
        getDocs(collection(db, "batches")),
      ])
      setQuizzes(data)
      setBatches(batchSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const now = new Date()
      const toPublish = data.filter(q => q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= now)
      if (toPublish.length > 0) {
        await Promise.all(toPublish.map(q => updateDoc(doc(db, "quizSets", q.id), { status: "published", publishAt: null })))
        invalidateCache("query:quizSets")
        setQuizzes(await cachedGetDocs("quizSets", query(collection(db, "quizSets"), orderBy("createdAt", "desc")), { ttl: TTL_LONG }))
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { loadQuizzes() }, [])

  function getEffectiveStatus(q) {
    const now = new Date()
    if (q.expiryDate && new Date(q.expiryDate) < now) return "expired"
    if (q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= now) return "published"
    return q.status || "draft"
  }

  async function doDelete() {
    const { id, title } = deleteTarget
    setDeleteTarget(null)
    try { await deleteDoc(doc(db, "quizSets", id)); invalidateCache("query:quizSets"); toast.success(`Deleted`); loadQuizzes() }
    catch { toast.error("Failed to delete") }
  }
  async function handlePublish(id) {
    try { await updateDoc(doc(db, "quizSets", id), { status: "published", publishAt: null }); invalidateCache("query:quizSets"); toast.success("Published!"); loadQuizzes() }
    catch { toast.error("Failed") }
  }
  async function handleUnpublish(id) {
    try { await updateDoc(doc(db, "quizSets", id), { status: "draft" }); invalidateCache("query:quizSets"); toast.success("Unpublished"); loadQuizzes() }
    catch { toast.error("Failed") }
  }
  async function handleSchedule() {
    if (!scheduleDate) return toast.error("Pick a date and time")
    const publishAt = new Date(scheduleDate).toISOString()
    if (new Date(publishAt) <= new Date()) return toast.error("Must be in the future")
    try {
      await updateDoc(doc(db, "quizSets", scheduleTarget), { status: "scheduled", publishAt })
      invalidateCache("query:quizSets"); toast.success("Scheduled!"); setScheduleTarget(null); setScheduleDate(""); loadQuizzes()
    } catch { toast.error("Failed") }
  }
  async function doDuplicate() {
    const quiz = dupTarget; setDupTarget(null); setDuplicating(quiz.id)
    try {
      const { id: _old, ...meta } = quiz
      const newRef = await addDoc(collection(db, "quizSets"), { ...meta, title: `${quiz.title} (Copy)`, status: "draft", createdAt: new Date().toISOString(), publishAt: null, expiryDate: null })
      const qSnap = await getDocs(collection(db, "quizSets", quiz.id, "questions"))
      if (qSnap.docs.length > 0) {
        const batch = writeBatch(db)
        qSnap.docs.forEach(qDoc => batch.set(doc(collection(db, "quizSets", newRef.id, "questions")), qDoc.data()))
        await batch.commit()
      }
      invalidateCache("query:quizSets"); toast.success("Duplicated as draft!"); loadQuizzes()
    } catch (e) { console.error(e); toast.error("Failed to duplicate") }
    setDuplicating(null)
  }
  async function doMakeFree() {
    const quiz = freeTarget; setFreeTarget(null)
    const existing = quizzes.find(q => q.isFree && q.sourceQuizId === quiz.id)
    if (existing) { toast(`Free copy already exists: "${existing.title}"`, { icon: "ℹ️" }); return }
    setMakingFree(quiz.id)
    try {
      const { id: _old, isFree: _f, sourceQuizId: _s, ...meta } = quiz
      const freeRef = await addDoc(collection(db, "quizSets"), { ...meta, title: `${quiz.title} (Free)`, status: "published", isFree: true, sourceQuizId: quiz.id, createdAt: new Date().toISOString(), publishAt: null, expiryDate: null })
      const qSnap = await getDocs(collection(db, "quizSets", quiz.id, "questions"))
      if (qSnap.docs.length > 0) {
        const batch = writeBatch(db)
        qSnap.docs.forEach(qDoc => batch.set(doc(collection(db, "quizSets", freeRef.id, "questions")), qDoc.data()))
        await batch.commit()
      }
      invalidateCache("query:quizSets"); toast.success("Free copy published! All users can now see it."); loadQuizzes()
    } catch (e) { console.error(e); toast.error("Failed to create free copy") }
    setMakingFree(null)
  }

  const allWithStatus = useMemo(() => quizzes.map(q => ({ ...q, _status: getEffectiveStatus(q) })), [quizzes])
  const categories = useMemo(() => [...new Set(allWithStatus.map(q => q.category).filter(Boolean))].sort(), [allWithStatus])
  const topics = useMemo(() => {
    const src = catFilter === "all" ? allWithStatus : allWithStatus.filter(q => q.category === catFilter)
    return [...new Set(src.map(q => q.topic).filter(Boolean))].sort()
  }, [allWithStatus, catFilter])
  const statusCounts = useMemo(() => {
    const c = { all: allWithStatus.length, published: 0, draft: 0, scheduled: 0, expired: 0 }
    allWithStatus.forEach(q => { if (c[q._status] !== undefined) c[q._status]++ })
    return c
  }, [allWithStatus])
  const visible = useMemo(() => {
    let list = allWithStatus
    if (statusTab   !== "all")  list = list.filter(q => q._status    === statusTab)
    if (catFilter   !== "all")  list = list.filter(q => q.category   === catFilter)
    if (topicFilter !== "all")  list = list.filter(q => q.topic      === topicFilter)
    if (levelFilter !== "all")  list = list.filter(q => q.difficulty === levelFilter)
    if (batchFilter === "none") list = list.filter(q => !q.isBatchCopy)
    else if (batchFilter !== "all") list = list.filter(q => q.isBatchCopy && q.batchId === batchFilter)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(q => (q.title||"").toLowerCase().includes(s) || (q.category||"").toLowerCase().includes(s) || (q.topic||"").toLowerCase().includes(s))
    }
    return list
  }, [allWithStatus, statusTab, catFilter, topicFilter, levelFilter, batchFilter, search])
  const grouped = useMemo(() => {
    if (statusTab !== "all") return [{ label: null, status: statusTab, items: visible }]
    const order = ["published","scheduled","draft","expired"], map = {}
    order.forEach(s => { map[s] = [] })
    visible.forEach(q => { if (map[q._status]) map[q._status].push(q) })
    return order.filter(s => map[s].length > 0).map(s => ({ label: STATUS_CFG[s]?.label, status: s, items: map[s] }))
  }, [visible, statusTab])
  const groupedPaged = useMemo(() => {
    const offset = (page - 1) * QM_PAGE_SIZE
    const flat = grouped.flatMap(g => g.items.map(q => ({ ...q, _groupLabel: g.label, _groupStatus: g.status })))
    const pageItems = flat.slice(offset, offset + QM_PAGE_SIZE)
    const map = {}
    pageItems.forEach(q => {
      const key = q._groupStatus || "all"
      if (!map[key]) map[key] = { label: q._groupLabel, status: q._groupStatus, items: [] }
      map[key].items.push(q)
    })
    return Object.values(map)
  }, [grouped, page])
  const totalPages = Math.ceil(visible.length / QM_PAGE_SIZE)
  const hasFilters = search.trim() || catFilter !== "all" || topicFilter !== "all" || levelFilter !== "all" || (batchFilter !== "all" && batchFilter !== "none")
  function clearFilters() { setSearch(""); setCatFilter("all"); setTopicFilter("all"); setLevelFilter("all"); setBatchFilter("none"); setPage(1) }
  function handleCatChange(val) { setCatFilter(val); setTopicFilter("all") }

  // ── Card ──────────────────────────────────────────────────────────────────────
  function QuizCard({ q }) {
    const st   = q._status
    const cfg  = STATUS_CFG[st] || STATUS_CFG.draft
    const diff = DIFF_CFG[q.difficulty]
    const isExp  = st === "expired"
    const isDraft= st === "draft"
    const isSch  = st === "scheduled"
    const isOpen = menuOpen === q.id

    return (
      <div
        onClick={() => isOpen && setMenuOpen(null)}
        className={`relative flex flex-col bg-[#0c0f18] border rounded-xl overflow-hidden transition-all duration-150
          ${isOpen ? "z-10" : ""}
          ${isExp ? "opacity-55 border-white/5" : isDraft ? "border-white/6 hover:border-white/10" : "border-white/8 hover:border-white/14"}
        `}
      >
        {/* Top status stripe */}
        <div className={`h-[2px] w-full ${cfg.stripe}`} />

        <div className="flex flex-col flex-1 p-3 gap-2">

          {/* Title + badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className={`text-[13px] font-semibold leading-snug flex-1 min-w-0 line-clamp-2 ${isExp || isDraft ? "text-gray-300" : "text-white"}`}>
              {q.title}
            </h3>
            <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border mt-0.5 ${cfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>

          {/* Subject + Topic — only if present, compact */}
          {(q.category || q.topic) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {q.category && (
                <span className="text-[10px] text-gray-500 bg-white/4 border border-white/6 px-1.5 py-0.5 rounded-md truncate max-w-[80px]">
                  {q.category}
                </span>
              )}
              {q.topic && (
                <span className="flex items-center gap-0.5 text-[10px] text-indigo-400/80 bg-indigo-500/6 border border-indigo-500/12 px-1.5 py-0.5 rounded-md truncate max-w-[100px]">
                  <Tag size={7} />{q.topic}
                </span>
              )}
              {q.isFree && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/18 px-1.5 py-0.5 rounded-md">
                  <Globe size={7} />Free
                </span>
              )}
              {q.isBatchCopy && q.batchName && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/18 px-1.5 py-0.5 rounded-md truncate max-w-[80px]">
                  <Layers size={7} />{q.batchName}
                </span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            {diff && <span className={`font-semibold ${diff.cls}`}>{diff.label}</span>}
            {diff && <span className="text-white/10">·</span>}
            <span className="tabular-nums">{q.questionCount || 0}Q</span>
            <span className="text-white/10">·</span>
            <span className="tabular-nums">{q.totalTime || 0}m</span>
            {q.marksPerQ > 0 && <><span className="text-white/10">·</span><span className="text-emerald-600">+{q.marksPerQ}</span></>}
            {q.negativeMark > 0 && <span className="text-rose-600">−{q.negativeMark}</span>}
            {/* Date hints pushed right */}
            {isSch && q.publishAt && (
              <span className="ml-auto flex items-center gap-0.5 text-amber-400/70 text-[10px]"><Clock size={8}/>{new Date(q.publishAt).toLocaleDateString()}</span>
            )}
            {!isExp && !isSch && q.expiryDate && (
              <span className="ml-auto flex items-center gap-0.5 text-orange-400/70 text-[10px]"><Calendar size={8}/>{new Date(q.expiryDate).toLocaleDateString()}</span>
            )}
            {isExp && q.expiryDate && (
              <span className="ml-auto flex items-center gap-0.5 text-rose-400/60 text-[10px]"><Calendar size={8}/>Exp {new Date(q.expiryDate).toLocaleDateString()}</span>
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5 -mx-3 px-3">
            <div className="flex items-center gap-0">
              <button
                onClick={e => { e.stopPropagation(); navigate(`/admin/quizzes/${q.id}`) }}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/8 px-2 py-1.5 rounded-lg transition"
              ><Pencil size={10}/>Edit</button>

              <button
                onClick={e => { e.stopPropagation(); navigate(`/admin/quizzes/${q.id}/attempts`) }}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-violet-400 hover:bg-violet-500/8 px-2 py-1.5 rounded-lg transition"
              ><Users size={10}/>Attempts</button>

              {!isExp && (st === "published"
                ? <button onClick={e => { e.stopPropagation(); handleUnpublish(q.id) }}
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-amber-400 hover:bg-amber-500/8 px-2 py-1.5 rounded-lg transition"
                  ><EyeOff size={10}/>Unpublish</button>
                : <button onClick={e => { e.stopPropagation(); handlePublish(q.id) }}
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/8 px-2 py-1.5 rounded-lg transition"
                  ><Eye size={10}/>Publish</button>
              )}
            </div>

            {/* ⋮ More */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(isOpen ? null : q.id) }}
                className="p-1.5 rounded-lg text-gray-700 hover:text-white hover:bg-white/8 transition"
              ><MoreVertical size={13}/></button>

              {isOpen && (
                <div
                  onClick={e => e.stopPropagation()}
                  className="absolute right-0 bottom-full mb-1 w-46 bg-[#0d1117] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden py-1"
                >
                  <button onClick={() => { setDupTarget(q); setMenuOpen(null) }} disabled={duplicating === q.id}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition text-left disabled:opacity-40">
                    {duplicating === q.id ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/> : <Copy size={12}/>}
                    Duplicate
                  </button>
                  {st === "published" && !q.isFree && (
                    <button onClick={() => { setFreeTarget(q); setMenuOpen(null) }} disabled={makingFree === q.id}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-cyan-400 hover:bg-cyan-500/8 hover:text-cyan-300 transition text-left disabled:opacity-40">
                      {makingFree === q.id ? <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/> : <Globe size={12}/>}
                      Make Free for All
                    </button>
                  )}
                  {st !== "published" && !isExp && (
                    <button onClick={() => { setScheduleTarget(q.id); setMenuOpen(null) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition text-left">
                      <Clock size={12}/> Schedule Publish
                    </button>
                  )}
                  <div className="h-px bg-white/6 my-1"/>
                  <button onClick={() => { setDeleteTarget({ id: q.id, title: q.title }); setMenuOpen(null) }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-400 hover:bg-rose-500/8 hover:text-rose-300 transition text-left">
                    <Trash2 size={12}/> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List Row ──────────────────────────────────────────────────────────────────
  function QuizRow({ q }) {
    const st   = q._status
    const cfg  = STATUS_CFG[st] || STATUS_CFG.draft
    const diff = DIFF_CFG[q.difficulty]
    const isExp = st === "expired"
    return (
      <tr className={`border-b border-white/5 hover:bg-white/2 transition ${isExp ? "opacity-55" : ""}`}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}/>
            <span className="font-medium text-sm text-white truncate max-w-[220px]">{q.title}</span>
            {q.isFree && <span className="shrink-0 text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Globe size={8}/>Free</span>}
            {q.isBatchCopy && q.batchName && <span className="shrink-0 text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Layers size={8}/>{q.batchName}</span>}
          </div>
          {q.description && <div className="text-xs text-gray-600 truncate max-w-[220px] mt-0.5 ml-3.5">{q.description}</div>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">{q.category || "—"}</td>
        <td className="px-4 py-3">
          {q.topic ? <span className="text-[11px] text-indigo-400 bg-indigo-500/8 px-2 py-0.5 rounded-md border border-indigo-500/15">{q.topic}</span> : <span className="text-gray-700 text-xs">—</span>}
        </td>
        <td className="px-4 py-3">
          {diff ? <span className={`text-xs font-medium ${diff.cls}`}>{diff.label}</span> : <span className="text-gray-700 text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{q.questionCount || 0}</td>
        <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{q.totalTime || 0}m</td>
        <td className="px-4 py-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
        </td>
        <td className="px-4 py-3 text-xs">
          {q.expiryDate ? <span className={isExp ? "text-rose-400" : "text-orange-400"}>{new Date(q.expiryDate).toLocaleDateString()}</span> : <span className="text-gray-700">—</span>}
        </td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-0.5">
            <button onClick={() => navigate(`/admin/quizzes/${q.id}/attempts`)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-violet-400 transition" title="Attempts"><Users size={13}/></button>
            <button onClick={() => navigate(`/admin/quizzes/${q.id}`)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-cyan-400 transition" title="Edit"><Pencil size={13}/></button>
            <button onClick={() => setDupTarget(q)} disabled={duplicating === q.id} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-amber-400 transition disabled:opacity-40" title="Duplicate">
              {duplicating === q.id ? <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/> : <Copy size={13}/>}
            </button>
            {st === "published" && !q.isFree && (
              <button onClick={() => setFreeTarget(q)} disabled={makingFree === q.id} className="p-1.5 rounded-lg hover:bg-cyan-500/8 text-gray-600 hover:text-cyan-400 transition disabled:opacity-40" title="Make Free">
                {makingFree === q.id ? <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/> : <Globe size={13}/>}
              </button>
            )}
            {!isExp && (st === "published"
              ? <button onClick={() => handleUnpublish(q.id)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-amber-400 transition" title="Unpublish"><EyeOff size={13}/></button>
              : <button onClick={() => handlePublish(q.id)}   className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-emerald-400 transition" title="Publish"><Eye size={13}/></button>
            )}
            {st !== "published" && !isExp && (
              <button onClick={() => setScheduleTarget(q.id)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-orange-400 transition" title="Schedule"><Clock size={13}/></button>
            )}
            <button onClick={() => setDeleteTarget({ id: q.id, title: q.title })} className="p-1.5 rounded-lg hover:bg-rose-500/8 text-gray-600 hover:text-rose-400 transition" title="Delete"><Trash2 size={13}/></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl" onClick={() => menuOpen && setMenuOpen(null)}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Quiz Manager</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {quizzes.length} quizzes
              {statusCounts.published > 0 && <> · <span className="text-emerald-400">{statusCounts.published} live</span></>}
              {statusCounts.draft > 0     && <> · <span className="text-gray-400">{statusCounts.draft} draft</span></>}
              {statusCounts.scheduled > 0 && <> · <span className="text-amber-400">{statusCounts.scheduled} scheduled</span></>}
            </p>
          </div>
          <button onClick={() => navigate("/admin/quizzes/create")}
            className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2 rounded-xl transition text-sm whitespace-nowrap">
            <Plus size={14}/> New Quiz
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {[
            { id: "all",       label: "All",       count: statusCounts.all       },
            { id: "published", label: "Published", count: statusCounts.published },
            { id: "draft",     label: "Drafts",    count: statusCounts.draft     },
            { id: "scheduled", label: "Scheduled", count: statusCounts.scheduled },
            { id: "expired",   label: "Expired",   count: statusCounts.expired   },
          ].filter(t => t.id === "all" || t.count > 0).map(t => {
            const active = statusTab === t.id
            const activeCls = { all: "bg-white/8 text-white border-white/12", published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", draft: "bg-white/5 text-gray-300 border-white/8", scheduled: "bg-amber-500/10 text-amber-400 border-amber-500/20", expired: "bg-rose-500/10 text-rose-400 border-rose-500/20" }
            return (
              <button key={t.id} onClick={() => { setStatusTab(t.id); setPage(1) }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${active ? activeCls[t.id] : "bg-transparent text-gray-500 border-transparent hover:text-white hover:bg-white/4"}`}>
                {t.label}
                <span className={`text-[10px] font-black tabular-nums ${active ? "" : "text-gray-700"}`}>{t.count}</span>
              </button>
            )
          })}
        </div>

        {/* Filter toolbar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[150px] max-w-[220px]">
            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quizzes..."
              className="w-full bg-[#0d1117] border border-white/8 text-white text-xs rounded-xl pl-8 pr-8 py-2 focus:outline-none focus:border-white/15 placeholder-gray-700"/>
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition"><X size={11}/></button>}
          </div>
          <select value={catFilter} onChange={e => handleCatChange(e.target.value)}
            className="bg-[#0d1117] border border-white/8 text-xs text-gray-400 rounded-xl px-3 py-2 focus:outline-none cursor-pointer hover:border-white/12 transition">
            <option value="all">All Subjects</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {topics.length > 0 && (
            <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
              className="bg-[#0d1117] border border-indigo-500/25 text-xs text-indigo-300 rounded-xl px-3 py-2 focus:outline-none cursor-pointer">
              <option value="all">All Topics</option>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
            className="bg-[#0d1117] border border-white/8 text-xs text-gray-400 rounded-xl px-3 py-2 focus:outline-none cursor-pointer hover:border-white/12 transition">
            <option value="all">All Levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          {batches.length > 0 && (
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
              className={`bg-[#0d1117] border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer ${batchFilter !== "none" ? "border-violet-500/35 text-violet-300" : "border-white/8 text-gray-400"}`}>
              <option value="none">Original Quizzes Only</option>
              <option value="all">All Quizzes</option>
              <optgroup label="── Filter by Batch">
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </optgroup>
            </select>
          )}
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-rose-400 border border-white/6 hover:border-rose-500/25 px-2.5 py-2 rounded-xl transition">
              <X size={11}/> Clear
            </button>
          )}
          <div className="flex gap-1 ml-auto bg-[#0d1117] border border-white/8 rounded-xl p-1">
            <button onClick={() => setView("grid")} className={`p-1.5 rounded-lg transition ${view==="grid" ? "bg-white/10 text-white" : "text-gray-600 hover:text-white"}`} title="Grid"><LayoutGrid size={13}/></button>
            <button onClick={() => setView("list")} className={`p-1.5 rounded-lg transition ${view==="list" ? "bg-white/10 text-white" : "text-gray-600 hover:text-white"}`} title="List"><List size={13}/></button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-[#0c0f18] border border-white/6 rounded-xl p-3 animate-pulse">
                <div className="h-3.5 bg-white/5 rounded w-3/4 mb-2"/>
                <div className="h-2.5 bg-white/4 rounded w-1/2 mb-3"/>
                <div className="h-px bg-white/4 mb-2.5"/>
                <div className="h-2.5 bg-white/4 rounded w-1/3"/>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-[#0d1117] border border-white/6 rounded-2xl p-16 text-center">
            <div className="w-12 h-12 bg-white/4 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search size={20} className="text-gray-600"/>
            </div>
            <p className="text-gray-400 font-semibold mb-1">{quizzes.length === 0 ? "No quizzes yet" : "No quizzes match your filters"}</p>
            <p className="text-gray-600 text-sm mb-5">{quizzes.length === 0 ? "Create your first quiz to get started" : "Try adjusting the search or filters"}</p>
            {quizzes.length === 0
              ? <button onClick={() => navigate("/admin/quizzes/create")} className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-6 py-2.5 rounded-xl transition text-sm">Create First Quiz</button>
              : <button onClick={clearFilters} className="text-cyan-400 hover:text-cyan-300 text-sm transition">Clear all filters</button>
            }
          </div>
        ) : view === "grid" ? (
          <div className="space-y-5">
            {groupedPaged.map(({ label, status, items }) => (
              <div key={status || "all"}>
                {label && statusTab === "all" && (
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CFG[status]?.dot || "bg-gray-500"}`}/>
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${STATUS_CFG[status]?.text || "text-gray-400"}`}>{label}</span>
                    <span className="text-gray-700 text-[11px] font-bold">{items.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map(q => <QuizCard key={q.id} q={q}/>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#0d1117] border border-white/8 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/6">
                    {["Title","Subject","Topic","Level","Q's","Time","Status","Expires","Actions"].map(h => (
                      <th key={h} className={`text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest py-3 ${h==="Title"||h==="Actions" ? "px-5" : "px-4"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedPaged.flatMap(g => g.items).map(q => <QuizRow key={q.id} q={q}/>)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {visible.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-xs text-gray-600">Page {page} of {totalPages} · {visible.length} quizzes</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/8 text-gray-400 hover:text-white hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition">Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p
                if (totalPages <= 7) p = i + 1
                else if (page <= 4) p = i + 1
                else if (page >= totalPages - 3) p = totalPages - 6 + i
                else p = page - 3 + i
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition ${p===page ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "text-gray-500 hover:text-gray-300 border border-white/6 hover:border-white/12"}`}>{p}</button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/8 text-gray-400 hover:text-white hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <ConfirmModal
        open={!!deleteTarget}
        icon={<Trash2 size={15} className="text-rose-400"/>}
        title={`Delete "${deleteTarget?.title}"?`}
        message="This quiz and all its questions will be permanently deleted. This cannot be undone."
        confirmLabel={<><Trash2 size={11}/> Delete Quiz</>}
        confirmCls="bg-rose-500 hover:bg-rose-400 text-white"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        open={!!dupTarget}
        icon={<Copy size={15} className="text-amber-400"/>}
        title={`Duplicate "${dupTarget?.title}"?`}
        message="A copy will be created as a draft. You can edit and publish it independently."
        confirmLabel={<><Copy size={11}/> Duplicate</>}
        confirmCls="bg-amber-500 hover:bg-amber-400 text-gray-900"
        onConfirm={doDuplicate}
        onCancel={() => setDupTarget(null)}
      />
      <ConfirmModal
        open={!!freeTarget}
        icon={<Globe size={15} className="text-cyan-400"/>}
        title={`Make free copy of "${freeTarget?.title}"?`}
        message="A new independent quiz will be published and immediately visible to all users on their Dashboard."
        confirmLabel={<><Globe size={11}/> Make Free</>}
        confirmCls="bg-cyan-500 hover:bg-cyan-400 text-gray-900"
        onConfirm={doMakeFree}
        onCancel={() => setFreeTarget(null)}
      />
      <ScheduleModal
        open={!!scheduleTarget}
        onClose={() => { setScheduleTarget(null); setScheduleDate("") }}
        onConfirm={handleSchedule}
        date={scheduleDate}
        setDate={setScheduleDate}
      />
    </AdminLayout>
  )
}
