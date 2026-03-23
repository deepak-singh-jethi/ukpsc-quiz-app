import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { db } from "../../firebase/config"
import { collection, getDocs, deleteDoc, doc, updateDoc, addDoc, writeBatch, orderBy, query, where } from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Clock, Users, Copy,
  Search, LayoutGrid, List, Calendar, X, ChevronRight, Tag, Globe,
  Layers
} from "lucide-react"
import toast from "react-hot-toast"

const STATUS_CONFIG = {
  published: { label: "Published", bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/25" },
  draft:     { label: "Draft",     bg: "bg-gray-800",       text: "text-gray-400",    border: "border-gray-700"       },
  scheduled: { label: "Scheduled", bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/25"   },
  expired:   { label: "Expired",   bg: "bg-rose-500/15",    text: "text-rose-400",    border: "border-rose-500/25"    },
}

const DIFF_CONFIG = {
  easy:   { label: "Easy",   color: "text-emerald-400" },
  medium: { label: "Medium", color: "text-amber-400"   },
  hard:   { label: "Hard",   color: "text-rose-400"    },
}

export default function QuizManager() {
  const navigate  = useNavigate()
  const [quizzes, setQuizzes]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [view,    setView]            = useState("grid")
  const [search,  setSearch]          = useState("")
  const [catFilter, setCatFilter]     = useState("all")
  const [topicFilter, setTopicFilter] = useState("all")
  const [levelFilter, setLevelFilter] = useState("all")
  const [statusTab, setStatusTab]     = useState("all")
  const [scheduleModal, setScheduleModal] = useState(null)
  const [scheduleDate,  setScheduleDate]  = useState("")
  const [duplicating, setDuplicating]     = useState(null)
  const [menuOpen,    setMenuOpen]        = useState(null)
  const [batches,     setBatches]         = useState([])  // all batches for filter
  const [page,        setPage]            = useState(1)

  const QM_PAGE_SIZE = 20
  const [batchFilter, setBatchFilter]     = useState("none") // "all" | "none" | batchId

  async function loadQuizzes() {
    setLoading(true)
    try {
      const [data, batchSnap] = await Promise.all([
        cachedGetDocs(
          "quizSets",
          query(collection(db, "quizSets"), orderBy("createdAt", "desc")),
          { ttl: TTL_LONG }
        ),
        getDocs(collection(db, "batches")),
      ])
      setQuizzes(data)
      setBatches(batchSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const now = new Date()
      const toPublish = data.filter(q =>
        q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= now
      )
      if (toPublish.length > 0) {
        await Promise.all(toPublish.map(q =>
          updateDoc(doc(db, "quizSets", q.id), { status: "published", publishAt: null })
        ))
        invalidateCache("query:quizSets")
        const fresh = await cachedGetDocs(
          "quizSets",
          query(collection(db, "quizSets"), orderBy("createdAt", "desc")),
          { ttl: TTL_LONG }
        )
        setQuizzes(fresh)
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

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    try { await deleteDoc(doc(db, "quizSets", id)); invalidateCache("query:quizSets"); toast.success("Deleted"); loadQuizzes() }
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
      await updateDoc(doc(db, "quizSets", scheduleModal), { status: "scheduled", publishAt })
      invalidateCache("query:quizSets"); toast.success("Scheduled!"); setScheduleModal(null); setScheduleDate(""); loadQuizzes()
    } catch { toast.error("Failed") }
  }
  async function handleDuplicate(quiz) {
    if (!window.confirm(`Duplicate "${quiz.title}"? A copy will be created as a draft.`)) return
    setDuplicating(quiz.id)
    try {
      const { id: _old, ...meta } = quiz
      const newRef = await addDoc(collection(db, "quizSets"), {
        ...meta, title: `${quiz.title} (Copy)`, status: "draft",
        createdAt: new Date().toISOString(), publishAt: null, expiryDate: null,
      })
      const qSnap = await getDocs(collection(db, "quizSets", quiz.id, "questions"))
      if (qSnap.docs.length > 0) {
        const batch = writeBatch(db)
        qSnap.docs.forEach(qDoc => batch.set(doc(collection(db, "quizSets", newRef.id, "questions")), qDoc.data()))
        await batch.commit()
      }
      invalidateCache("query:quizSets"); toast.success(`Duplicated as draft!`); loadQuizzes()
    } catch (e) { console.error(e); toast.error("Failed to duplicate") }
    setDuplicating(null)
  }

  // ── Make Free: creates a published copy with isFree:true ─────────────────
  // The copy is independent — deleting/editing the original doesn't affect it.
  // It shows in every user's Dashboard "Available Quizzes" section.
  const [makingFree, setMakingFree] = useState(null)  // quizId being processed

  async function handleMakeFree(quiz) {
    const existing = quizzes.find(q => q.isFree && q.sourceQuizId === quiz.id)
    if (existing) {
      toast(`A free copy already exists: "${existing.title}"`, { icon: "ℹ️" })
      return
    }
    if (!window.confirm(`Make a free public copy of "${quiz.title}"?\n\nA new independent quiz will be created and immediately available to all users on the Dashboard.`)) return
    setMakingFree(quiz.id)
    try {
      const { id: _old, isFree: _f, sourceQuizId: _s, ...meta } = quiz
      const freeRef = await addDoc(collection(db, "quizSets"), {
        ...meta,
        title:        `${quiz.title} (Free)`,
        status:       "published",
        isFree:       true,
        sourceQuizId: quiz.id,
        createdAt:    new Date().toISOString(),
        publishAt:    null,
        expiryDate:   null,
      })
      // Deep-copy all questions
      const qSnap = await getDocs(collection(db, "quizSets", quiz.id, "questions"))
      if (qSnap.docs.length > 0) {
        const batch = writeBatch(db)
        qSnap.docs.forEach(qDoc =>
          batch.set(doc(collection(db, "quizSets", freeRef.id, "questions")), qDoc.data())
        )
        await batch.commit()
      }
      invalidateCache("query:quizSets")
      toast.success("Free copy published! 🌐 All users can now see it on their Dashboard.")
      loadQuizzes()
    } catch (e) { console.error(e); toast.error("Failed to create free copy") }
    setMakingFree(null)
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const allWithStatus = useMemo(() => quizzes.map(q => ({ ...q, _status: getEffectiveStatus(q) })), [quizzes])

  const categories = useMemo(() => {
    const cats = [...new Set(allWithStatus.map(q => q.category).filter(Boolean))].sort()
    return cats
  }, [allWithStatus])

  // Topics scoped to the selected category (or all topics if "all categories")
  const topics = useMemo(() => {
    const source = catFilter === "all" ? allWithStatus : allWithStatus.filter(q => q.category === catFilter)
    const ts = [...new Set(source.map(q => q.topic).filter(Boolean))].sort()
    return ts
  }, [allWithStatus, catFilter])

  const statusCounts = useMemo(() => {
    const counts = { all: allWithStatus.length, published: 0, draft: 0, scheduled: 0, expired: 0 }
    allWithStatus.forEach(q => { if (counts[q._status] !== undefined) counts[q._status]++ })
    return counts
  }, [allWithStatus])

  const visible = useMemo(() => {
    let list = allWithStatus
    if (statusTab !== "all")    list = list.filter(q => q._status === statusTab)
    if (catFilter !== "all")    list = list.filter(q => q.category === catFilter)
    if (topicFilter !== "all")  list = list.filter(q => q.topic === topicFilter)
    if (levelFilter !== "all")  list = list.filter(q => q.difficulty === levelFilter)
    // Batch filter
    if (batchFilter === "none") list = list.filter(q => !q.isBatchCopy)
    else if (batchFilter !== "all") list = list.filter(q => q.isBatchCopy && q.batchId === batchFilter)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(q =>
        (q.title || "").toLowerCase().includes(s) ||
        (q.category || "").toLowerCase().includes(s) ||
        (q.topic || "").toLowerCase().includes(s)
      )
    }
    return list
  }, [allWithStatus, statusTab, catFilter, topicFilter, levelFilter, batchFilter, search])

  const grouped = useMemo(() => {
    if (statusTab !== "all") return [{ label: null, items: visible }]
    const order = ["published", "scheduled", "draft", "expired"]
    const map = {}
    order.forEach(s => { map[s] = [] })
    visible.forEach(q => { if (map[q._status]) map[q._status].push(q) })
    return order.filter(s => map[s].length > 0).map(s => ({
      label: STATUS_CONFIG[s]?.label,
      status: s,
      items: map[s],
    }))
  }, [visible, statusTab])

  // Reset to page 1 whenever filters/search/tab change
  const pageKey = `${statusTab}|${catFilter}|${topicFilter}|${levelFilter}|${batchFilter}|${search}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupedPaged = useMemo(() => {
    const offset = (page - 1) * QM_PAGE_SIZE
    // For grid view: paginate within each group proportionally isn't great
    // Flatten, paginate, then re-group
    const flat = grouped.flatMap(g => g.items.map(q => ({ ...q, _groupLabel: g.label, _groupStatus: g.status })))
    const pageItems = flat.slice(offset, offset + QM_PAGE_SIZE)
    // Re-group
    const map = {}
    pageItems.forEach(q => {
      const key = q._groupStatus || "all"
      if (!map[key]) map[key] = { label: q._groupLabel, status: q._groupStatus, items: [] }
      map[key].items.push(q)
    })
    return Object.values(map)
  }, [grouped, page, QM_PAGE_SIZE])

  const totalPages = Math.ceil(visible.length / QM_PAGE_SIZE)

  const hasFilters = search.trim() || catFilter !== "all" || topicFilter !== "all" || levelFilter !== "all" || (batchFilter !== "all" && batchFilter !== "none")

  function clearFilters() { setSearch(""); setCatFilter("all"); setTopicFilter("all"); setLevelFilter("all"); setBatchFilter("none"); setPage(1) }

  // Reset topic filter when category changes
  function handleCatChange(val) { setCatFilter(val); setTopicFilter("all") }

  // ── Card component ────────────────────────────────────────────────────────────
  function QuizCard({ q }) {
    const st      = q._status
    const cfg     = STATUS_CONFIG[st] || STATUS_CONFIG.draft
    const diff    = DIFF_CONFIG[q.difficulty]
    const isDraft = st === "draft"
    const isExp   = st === "expired"
    const isSch   = st === "scheduled"
    const isMenuOpen = menuOpen === q.id

    return (
      <div
        onClick={() => menuOpen && setMenuOpen(null)}
        className={`relative bg-gray-900 border rounded-2xl transition-all duration-150 hover:border-gray-700 ${isMenuOpen ? 'z-10' : ''} ${
          isDraft ? "border-gray-800/50 opacity-85" : isExp ? "border-gray-800/50 opacity-60" : "border-gray-800"
        }`}
      >
        <div className={`h-0.5 w-full rounded-t-2xl ${
          st === "published" ? "bg-emerald-500/50" :
          st === "scheduled" ? "bg-amber-500/50" :
          st === "expired"   ? "bg-rose-500/30" : "bg-gray-700/50"
        }`} />

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <h3 className={`font-semibold text-sm leading-snug flex-1 ${isDraft || isExp ? "text-gray-300" : "text-white"}`}>
              {q.title}
            </h3>
            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {cfg.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {q.isFree && (
              <span className="text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 flex items-center gap-0.5 font-bold">
                <Globe size={8} /> Free
              </span>
            )}
            {q.isBatchCopy && q.batchName && (
              <span className="text-[11px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md border border-violet-500/20 flex items-center gap-0.5 font-bold">
                <Layers size={8} /> {q.batchName}
              </span>
            )}
            {q.sourceQuizId && !q.isFree && !q.isBatchCopy && (
              <span className="text-[11px] text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-md border border-gray-700/40">
                Has free copy
              </span>
            )}
            {q.category && (
              <span className="text-[11px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-md border border-gray-700/60">
                {q.category}
              </span>
            )}
            {q.topic && (
              <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 flex items-center gap-0.5">
                <Tag size={8} /> {q.topic}
              </span>
            )}
            {diff && (
              <span className={`text-[11px] font-medium ${diff.color}`}>{diff.label}</span>
            )}
            <span className="text-[11px] text-gray-600">·</span>
            <span className="text-[11px] text-gray-500">{q.questionCount || 0}Q</span>
            <span className="text-[11px] text-gray-600">·</span>
            <span className="text-[11px] text-gray-500">{q.totalTime || 0}m</span>
            {q.marksPerQ > 0 && (
              <><span className="text-[11px] text-gray-600">·</span>
              <span className="text-[11px] text-emerald-600">+{q.marksPerQ}</span></>
            )}
            {q.negativeMark > 0 && (
              <span className="text-[11px] text-rose-600">−{q.negativeMark}</span>
            )}
          </div>

          {q.expiryDate && !isExp && (
            <div className="flex items-center gap-1 text-[11px] text-orange-400 mb-3">
              <Calendar size={9} /> Closes {new Date(q.expiryDate).toLocaleDateString()}
            </div>
          )}
          {isSch && q.publishAt && (
            <div className="flex items-center gap-1 text-[11px] text-amber-400 mb-3">
              <Clock size={9} /> Publishes {new Date(q.publishAt).toLocaleDateString()}
            </div>
          )}
          {isExp && q.expiryDate && (
            <div className="flex items-center gap-1 text-[11px] text-rose-400/70 mb-3">
              <Calendar size={9} /> Expired {new Date(q.expiryDate).toLocaleDateString()}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-800/80">
            <div className="flex items-center gap-0.5">
              <button
                onClick={e => { e.stopPropagation(); navigate(`/admin/quizzes/${q.id}`) }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-cyan-400 bg-gray-800/60 hover:bg-gray-800 px-2.5 py-1.5 rounded-lg transition font-medium"
                title="Edit quiz">
                <Pencil size={11} /> Edit
              </button>
              <button
                onClick={e => { e.stopPropagation(); navigate(`/admin/quizzes/${q.id}/attempts`) }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-purple-400 bg-gray-800/60 hover:bg-gray-800 px-2.5 py-1.5 rounded-lg transition font-medium"
                title="View attempts">
                <Users size={11} /> Attempts
              </button>
              {!isExp && (st === "published"
                ? <button
                    onClick={e => { e.stopPropagation(); handleUnpublish(q.id) }}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-amber-400 bg-gray-800/60 hover:bg-gray-800 px-2.5 py-1.5 rounded-lg transition font-medium"
                    title="Unpublish">
                    <EyeOff size={11} /> Unpublish
                  </button>
                : <button
                    onClick={e => { e.stopPropagation(); handlePublish(q.id) }}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-emerald-400 bg-gray-800/60 hover:bg-gray-800 px-2.5 py-1.5 rounded-lg transition font-medium"
                    title="Publish">
                    <Eye size={11} /> Publish
                  </button>
              )}
            </div>

            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(isMenuOpen ? null : q.id) }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition"
                title="More actions">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
                </svg>
              </button>

              {isMenuOpen && (
                <div
                  onClick={e => e.stopPropagation()}
                  className="absolute right-0 bottom-full mb-1 w-44 bg-gray-900 border border-gray-700 rounded-xl z-50 overflow-hidden py-1">
                  <button
                    onClick={() => { handleDuplicate(q); setMenuOpen(null) }}
                    disabled={duplicating === q.id}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition text-left disabled:opacity-40">
                    {duplicating === q.id
                      ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      : <Copy size={12} />}
                    Duplicate
                  </button>
                  {/* Make Free — only on published non-free quizzes */}
                  {st === "published" && !q.isFree && (
                    <button
                      onClick={() => { handleMakeFree(q); setMenuOpen(null) }}
                      disabled={makingFree === q.id}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 transition text-left disabled:opacity-40">
                      {makingFree === q.id
                        ? <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        : <Globe size={12} />}
                      Make Free for All
                    </button>
                  )}
                  {st !== "published" && !isExp && (
                    <button
                      onClick={() => { setScheduleModal(q.id); setMenuOpen(null) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition text-left">
                      <Clock size={12} /> Schedule Publish
                    </button>
                  )}
                  <div className="h-px bg-gray-800 my-1" />
                  <button
                    onClick={() => { handleDelete(q.id, q.title); setMenuOpen(null) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition text-left">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List row component ────────────────────────────────────────────────────────
  function QuizRow({ q }) {
    const st  = q._status
    const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.draft
    const diff = DIFF_CONFIG[q.difficulty]
    const isExp = st === "expired"
    return (
      <tr className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition ${isExp ? "opacity-60" : ""}`}>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="font-medium text-sm text-white truncate max-w-xs">{q.title}</div>
            {q.isFree && (
              <span className="shrink-0 text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Globe size={8} /> Free
              </span>
            )}
            {q.isBatchCopy && q.batchName && (
              <span className="shrink-0 text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Layers size={8} /> {q.batchName}
              </span>
            )}
          </div>
          {q.description && <div className="text-xs text-gray-600 truncate max-w-xs mt-0.5">{q.description}</div>}
        </td>
        <td className="px-4 py-3.5 text-xs text-gray-400">{q.category || "—"}</td>
        <td className="px-4 py-3.5">
          {q.topic
            ? <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">{q.topic}</span>
            : <span className="text-gray-700">—</span>}
        </td>
        <td className="px-4 py-3.5">
          {diff ? <span className={`text-xs ${diff.color}`}>{diff.label}</span> : <span className="text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3.5 text-xs text-gray-400">{q.questionCount || 0}</td>
        <td className="px-4 py-3.5 text-xs text-gray-400">{q.totalTime || 0}m</td>
        <td className="px-4 py-3.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        </td>
        <td className="px-4 py-3.5 text-xs">
          {q.expiryDate
            ? <span className={isExp ? "text-rose-400" : "text-orange-400"}>{new Date(q.expiryDate).toLocaleDateString()}</span>
            : <span className="text-gray-700">—</span>}
        </td>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-0.5">
            <button onClick={() => navigate(`/admin/quizzes/${q.id}/attempts`)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-purple-400 transition" title="Attempts">
              <Users size={13} />
            </button>
            <button onClick={() => navigate(`/admin/quizzes/${q.id}`)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-cyan-400 transition" title="Edit">
              <Pencil size={13} />
            </button>
            <button onClick={() => handleDuplicate(q)} disabled={duplicating === q.id}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-amber-400 transition disabled:opacity-40" title="Duplicate">
              {duplicating === q.id
                ? <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                : <Copy size={13} />}
            </button>
            {st === "published" && !q.isFree && (
              <button onClick={() => handleMakeFree(q)} disabled={makingFree === q.id}
                className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-gray-500 hover:text-cyan-400 transition disabled:opacity-40" title="Make Free for All">
                {makingFree === q.id
                  ? <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  : <Globe size={13} />}
              </button>
            )}
            {!isExp && (st === "published"
              ? <button onClick={() => handleUnpublish(q.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-yellow-400 transition" title="Unpublish"><EyeOff size={13} /></button>
              : <button onClick={() => handlePublish(q.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-emerald-400 transition" title="Publish"><Eye size={13} /></button>
            )}
            {st !== "published" && !isExp && (
              <button onClick={() => setScheduleModal(q.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-orange-400 transition" title="Schedule"><Clock size={13} /></button>
            )}
            <button onClick={() => handleDelete(q.id, q.title)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-gray-500 hover:text-rose-400 transition" title="Delete"><Trash2 size={13} /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <AdminLayout>
      <div className="p-7 max-w-7xl">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Quiz Manager</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {quizzes.length} quizzes
              {statusCounts.published > 0 && <> · <span className="text-emerald-400">{statusCounts.published} live</span></>}
              {statusCounts.draft > 0 && <> · <span className="text-gray-400">{statusCounts.draft} draft</span></>}
              {statusCounts.scheduled > 0 && <> · <span className="text-amber-400">{statusCounts.scheduled} scheduled</span></>}
              {quizzes.filter(q => q.isBatchCopy).length > 0 && (
                <> · <span className="text-violet-400/60 text-xs">
                  {quizzes.filter(q => q.isBatchCopy).length} legacy batch copies
                </span></>
              )}
            </p>
          </div>
          <button onClick={() => navigate("/admin/quizzes/create")}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-5 py-2.5 rounded-xl transition text-sm whitespace-nowrap">
            <Plus size={15} /> New Quiz
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          {[
            { id: "all",       label: "All",       count: statusCounts.all },
            { id: "published", label: "Published", count: statusCounts.published },
            { id: "draft",     label: "Drafts",    count: statusCounts.draft },
            { id: "scheduled", label: "Scheduled", count: statusCounts.scheduled },
            { id: "expired",   label: "Expired",   count: statusCounts.expired },
          ].filter(t => t.id === "all" || t.count > 0).map(t => {
            const active = statusTab === t.id
            const colors = {
              all:       active ? "bg-gray-700 text-white border-gray-600" : "",
              published: active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "",
              draft:     active ? "bg-gray-800 text-gray-300 border-gray-700" : "",
              scheduled: active ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "",
              expired:   active ? "bg-rose-500/15 text-rose-400 border-rose-500/30" : "",
            }
            return (
              <button key={t.id} onClick={() => setStatusTab(t.id)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  active ? colors[t.id] : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
                }`}>
                {t.label}
                <span className={`font-black text-[10px] ${active ? "" : "text-gray-700"}`}>{t.count}</span>
              </button>
            )
          })}
        </div>

        {/* Search + filter toolbar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quizzes..."
              className="w-full bg-gray-900 border border-gray-800 text-white text-xs rounded-xl pl-8 pr-8 py-2 focus:outline-none focus:border-gray-600 placeholder-gray-700" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                <X size={11} />
              </button>
            )}
          </div>

          {/* Subject / Category */}
          <select value={catFilter} onChange={e => handleCatChange(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-xs text-gray-400 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-600 cursor-pointer">
            <option value="all">All Subjects</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Topic — only shown when topics exist */}
          {topics.length > 0 && (
            <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
              className="bg-gray-900 border border-indigo-500/30 text-xs text-indigo-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/50 cursor-pointer">
              <option value="all">All Topics</option>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Level */}
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-xs text-gray-400 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-600 cursor-pointer">
            <option value="all">All Levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Batch filter */}
          {batches.length > 0 && (
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
              className={`bg-gray-900 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer ${
                batchFilter !== "none"
                  ? "border-violet-500/40 text-violet-300 focus:border-violet-500/60"
                  : "border-gray-800 text-gray-400 focus:border-gray-600"
              }`}>
              <option value="none">Original Quizzes Only</option>
              <option value="all">All Quizzes (incl. legacy copies)</option>
              <optgroup label="── Filter by Batch Copy">
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </optgroup>
            </select>
          )}

          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-rose-400 border border-gray-800 hover:border-rose-500/30 px-2.5 py-2 rounded-xl transition">
              <X size={11} /> Clear
            </button>
          )}

          <div className="flex gap-1 ml-auto bg-gray-900 border border-gray-800 rounded-xl p-1">
            <button onClick={() => setView("grid")}
              className={`p-1.5 rounded-lg transition ${view === "grid" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white"}`}
              title="Card view">
              <LayoutGrid size={13} />
            </button>
            <button onClick={() => setView("list")}
              className={`p-1.5 rounded-lg transition ${view === "list" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white"}`}
              title="List view">
              <List size={13} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-800 rounded w-1/2 mb-4" />
                <div className="h-px bg-gray-800 mb-3" />
                <div className="h-3 bg-gray-800 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
            <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search size={20} className="text-gray-600" />
            </div>
            <p className="text-gray-400 font-semibold mb-1">
              {quizzes.length === 0 ? "No quizzes yet" : "No quizzes match your filters"}
            </p>
            <p className="text-gray-600 text-sm mb-5">
              {quizzes.length === 0 ? "Create your first quiz to get started" : "Try adjusting the search or filters"}
            </p>
            {quizzes.length === 0
              ? <button onClick={() => navigate("/admin/quizzes/create")}
                  className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-6 py-2.5 rounded-xl transition text-sm">
                  Create First Quiz
                </button>
              : <button onClick={clearFilters} className="text-cyan-400 hover:text-cyan-300 text-sm transition">
                  Clear all filters
                </button>
            }
          </div>
        ) : view === "grid" ? (
          <div className="space-y-6">
            {groupedPaged.map(({ label, status, items }) => (
              <div key={status || "all"}>
                {label && statusTab === "all" && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${STATUS_CONFIG[status]?.text || "text-gray-400"}`}>
                      {label}
                    </span>
                    <span className="text-gray-700 text-xs">{items.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(q => <QuizCard key={q.id} q={q} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {["Title","Subject","Topic","Level","Q's","Time","Status","Expires","Actions"].map(h => (
                      <th key={h} className={`text-left text-[11px] font-semibold text-gray-500 uppercase tracking-widest py-3 ${h === "Title" || h === "Actions" ? "px-5" : "px-4"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedPaged.flatMap(g => g.items).map(q => <QuizRow key={q.id} q={q} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {visible.length > 0 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-xs text-gray-600">
              {hasFilters || statusTab !== "all"
                ? `${visible.length} of ${quizzes.length} quizzes`
                : `${quizzes.length} quizzes`}
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                  Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p
                  if (totalPages <= 7) p = i + 1
                  else if (page <= 4) p = i + 1
                  else if (page >= totalPages - 3) p = totalPages - 6 + i
                  else p = page - 3 + i
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                        p === page
                          ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                          : "text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700"
                      }`}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {scheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-white mb-4">Schedule Publish</h3>
            <p className="text-gray-500 text-xs mb-3">The quiz will automatically go live at the selected time.</p>
            <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-600 focus:border-cyan-400 focus:outline-none text-sm mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setScheduleModal(null); setScheduleDate("") }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl transition text-sm">Cancel</button>
              <button onClick={handleSchedule}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold py-2.5 rounded-xl transition text-sm">Schedule</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}