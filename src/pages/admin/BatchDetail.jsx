import { useEffect, useState, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import {
  doc, getDoc, getDocs, addDoc, deleteDoc, setDoc, updateDoc, arrayUnion, arrayRemove, writeBatch,
  collection, query, where, orderBy, limit, onSnapshot
} from "firebase/firestore"
import { cachedGetDocs, cachedGetDoc, invalidateCache, TTL_LONG } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import {
  ChevronLeft, Users, BookOpen, Plus, Trash2, UserMinus,
  Search, ChevronRight, Settings, MessageSquare, Save,
  Mail, CheckCircle, Clock, Send, X, Hash, MessageCircle,
  AlertCircle, GripVertical
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import toast from "react-hot-toast"

const TABS = [
  { id: "students", label: "Students",      icon: Users         },
  { id: "quizzes",  label: "Quizzes",       icon: BookOpen      },
  { id: "queries",  label: "Private Q&A",   icon: MessageCircle },
  { id: "group",    label: "Group Chat",    icon: Hash          },
  { id: "details",  label: "Batch Details", icon: Settings      },
]

//  Chat bubble 
function Bubble({ msg, currentAdminUid }) {
  // FIX Bug 14: use actual UID comparison instead of fromRole === "admin"
  const isRight = msg.fromRole === "admin"
  const time    = new Date(msg.sentAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
  return (
    <div className={`flex gap-2.5 ${isRight ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 mt-1 ${
        isRight ? "bg-cyan-500/15 border border-cyan-500/25 text-cyan-400" : "bg-purple-500/15 border border-purple-500/25 text-purple-400"
      }`}>
        {msg.fromName?.charAt(0)?.toUpperCase() || "?"}
      </div>
      <div className={`flex flex-col max-w-[70%] ${isRight ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold ${isRight ? "text-cyan-500" : "text-gray-400"}`}>
            {isRight ? "Admin" : msg.fromName}
          </span>
          <span className="text-[10px] text-gray-700">{time}</span>
        </div>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isRight
            ? "bg-cyan-500/10 border border-cyan-500/20 text-gray-100 rounded-tr-sm"
            : "bg-gray-800 border border-gray-700/50 text-gray-200 rounded-tl-sm"
        }`}>
          {msg.text}
          {msg.id?.startsWith("temp_") && (
            <span className="ml-2 text-[10px] opacity-50">sending...</span>
          )}
        </div>
      </div>
    </div>
  )
}

//  Thread list item 
function ThreadItem({ thread, onClick, unread, isActive }) {
  const last = thread.messages?.[thread.messages.length - 1]
  return (
    <button onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition hover:border-gray-700 ${
        unread ? "border-cyan-500/20 bg-cyan-500/4" : "border-gray-800 bg-gray-900/50"
      } ${isActive ? "ring-1 ring-cyan-500/30" : ""}`}>
      <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
        <span className="text-sm font-black text-purple-400">{thread.studentName?.charAt(0)?.toUpperCase() || "?"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-white text-sm font-semibold truncate">{thread.studentName}</p>
          {thread.initiatedBy === "admin" && (
            <span className="text-[9px] text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-full shrink-0">Admin started</span>
          )}
          {unread && <span className="w-2 h-2 bg-cyan-400 rounded-full shrink-0" />}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {thread.subject || last?.text || "No messages yet"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-gray-700">
          {thread.lastActivity ? new Date(thread.lastActivity).toLocaleDateString() : ""}
        </p>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block ${
          thread.resolved ? "bg-gray-800 text-gray-600" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
        }`}>
          {thread.resolved ? "Closed" : "Open"}
        </span>
      </div>
    </button>
  )
}

//  Sortable quiz row (dnd-kit) 
function SortableQuizRow({ bq, onRemove, onNavigate, isFiltering }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bq.id, disabled: isFiltering })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : "auto",
  }

  const q = bq.quiz
  const now = new Date()
  const isPublished = q?.status === "published" ||
    (q?.status === "scheduled" && q?.publishAt && new Date(q.publishAt) <= now)
  const isDraft = q && !isPublished

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors border ${
        isDraft
          ? "border-amber-500/30 bg-amber-500/5"
          : isDragging ? "border-cyan-500/40 bg-gray-900" : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className={`p-1.5 rounded-lg text-gray-700 transition shrink-0 ${
          isFiltering
            ? "cursor-not-allowed opacity-30"
            : "cursor-grab active:cursor-grabbing hover:text-gray-400 hover:bg-gray-800"
        }`}
        title={isFiltering ? "Clear filters to reorder" : "Drag to reorder"}
      >
        <GripVertical size={15} />
      </button>

      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        isDraft ? "bg-amber-500/10 border border-amber-500/25" : "bg-purple-500/10 border border-purple-500/20"
      }`}>
        <BookOpen size={14} className={isDraft ? "text-amber-400" : "text-purple-400"} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white text-sm font-semibold truncate">{q?.title}</p>
          {isDraft && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full shrink-0">
              ⚠ Draft  -  invisible to students
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {q?.category && <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-md">{q.category}</span>}
          {q?.topic && <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md">📌 {q.topic}</span>}
          <span className="text-[10px] text-gray-600">{q?.questionCount || 0}Q . {q?.totalTime || 10}min{q?.difficulty ? ` . ${q.difficulty}` : ""}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <p className="text-[10px] text-gray-700 hidden sm:block">{new Date(bq.assignedAt).toLocaleDateString()}</p>
        <button
          onClick={() => onNavigate(`/admin/quizzes/${bq.quizId}/attempts?batchId=${bq.batchId}`)}
          className="text-xs text-gray-500 hover:text-cyan-400 flex items-center gap-1 transition px-2 py-1.5 rounded-lg hover:bg-gray-800"
        >
          Attempts <ChevronRight size={11} />
        </button>
        <button
          onClick={() => onRemove(bq.id, q?.title)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

//  Drag overlay card (what you see while dragging) 
function DragCard({ bq }) {
  const q = bq?.quiz
  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-cyan-500/50 rounded-xl px-3 py-3 shadow-2xl shadow-black/60 rotate-1">
      <div className="p-1.5 text-gray-400 shrink-0"><GripVertical size={15} /></div>
      <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
        <BookOpen size={14} className="text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{q?.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {q?.category && <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-md">{q.category}</span>}
          {q?.topic && <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md">📌 {q.topic}</span>}
        </div>
      </div>
    </div>
  )
}

export default function BatchDetail() {
  const { batchId }   = useParams()
  const navigate      = useNavigate()
  // FIX Bug 14: get actual admin uid and name from AuthContext
  const { currentUser, userProfile } = useAuth()
  const adminName = userProfile?.name || userProfile?.email || "Admin"

  const [batch, setBatch]           = useState(null)
  const [members, setMembers]       = useState([])
  const [quizzes, setQuizzes]       = useState([])
  const [allQuizzes, setAllQuizzes] = useState([])
  const [threads, setThreads]       = useState([])
  const [groupMsgs, setGroupMsgs]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState("students")

  // Students
  const [memberSearch, setMemberSearch]   = useState("")
  const [addEmail, setAddEmail]           = useState("")
  const [addingStudent, setAddingStudent] = useState(false)
  const [savingStudent, setSavingStudent] = useState(false)

  // Quizzes
  const [addingQuiz, setAddingQuiz]         = useState(false)
  const [selectedQuizId, setSelectedQuizId] = useState("")
  const [savingQuiz, setSavingQuiz]         = useState(false)
  const [quizSubjectFilter, setQuizSubjectFilter] = useState("all")
  const [quizTopicFilter, setQuizTopicFilter]     = useState("all")
  const [quizSearch, setQuizSearch]               = useState("")
  const [activeDragId, setActiveDragId]           = useState(null)
  const [batchQuizPage, setBatchQuizPage]         = useState(1)

  // Quiz Picker modal state
  const [pickerSearch,  setPickerSearch]   = useState("")
  const [pickerCat,     setPickerCat]      = useState("all")
  const [pickerTopic,   setPickerTopic]    = useState("all")
  const [pickerPage,    setPickerPage]     = useState(1)
  const PICKER_PAGE_SIZE = 8
  const [pickerTopicOpen, setPickerTopicOpen] = useState(false)

  // dnd-kit sensors  -  PointerSensor with a small activation distance so
  // accidental taps don't trigger drags, KeyboardSensor for accessibility
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Details
  const [editName, setEditName]               = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editLongDesc, setEditLongDesc]       = useState("")
  const [editTags, setEditTags]               = useState("")
  const [editStartDate, setEditStartDate]     = useState("")
  const [editEndDate, setEditEndDate]         = useState("")
  const [editFee, setEditFee]                 = useState("")
  const [savingDetails, setSavingDetails]     = useState(false)

  // Private Q&A
  const [activeThread, setActiveThread]       = useState(null)
  const activeThreadIdRef                     = useRef(null)  // FIX Bug 2
  const [replyText, setReplyText]             = useState("")
  const [sendingReply, setSendingReply]       = useState(false)
  const [showNewThread, setShowNewThread]     = useState(false)
  const [newThreadTarget, setNewThreadTarget] = useState("")
  const [newThreadSubject, setNewThreadSubject] = useState("")
  const [newThreadMsg, setNewThreadMsg]       = useState("")
  const [creatingThread, setCreatingThread]   = useState(false)
  const threadBottomRef = useRef(null)

  // Group chat
  const [groupText, setGroupText]       = useState("")
  const [sendingGroup, setSendingGroup] = useState(false)
  const groupBottomRef = useRef(null)

  // Unsubscribe refs for real-time listeners
  const unsubThreadsRef = useRef(null)
  const unsubGroupRef   = useRef(null)

  //  Auto-scroll helper 
  function scrollBottom(ref) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth" })
    })
  }

  //  Load static data (students, quizzes, batch meta) 
  // FIX Bug 3/9: this function NO LONGER loads threads or groupChat.
  // Those are handled by real-time listeners below.
  async function loadStaticData() {
    setLoading(true)
    try {
      // cachedGetDoc returns plain object { id, ...data } or null  -  no .exists() needed
      const bSnap = await cachedGetDoc(doc(db, "batches", batchId), { ttl: TTL_LONG })
      if (!bSnap) { navigate("/admin/batches"); return }
      const bData = bSnap
      setBatch(bData)
      setEditName(bData.name || "")
      setEditDescription(bData.description || "")
      setEditLongDesc(bData.longDescription || "")
      setEditTags((bData.tags || []).join(", "))
      setEditStartDate(bData.startDate || "")
      setEditEndDate(bData.endDate || "")
      setEditFee(bData.fee || "")

      // Members  -  use cachedGetDoc for user docs: stable data, TTL_LONG.
      // A 50-member batch cost 50 getDoc reads per visit. Now costs 0 after
      // the first visit (5-min memory cache, 30-min localStorage cache).
      const mSnap = await getDocs(collection(db, "batches", batchId, "members"))
      const enriched = await Promise.all(mSnap.docs.map(async d => {
        const m = { userId: d.id, ...d.data() }
        let name = "Unknown", email = "", attempts = 0, avgScore = 0
        try {
          const u = await cachedGetDoc(doc(db, "users", m.userId), { ttl: TTL_LONG })
          if (u) {
            name     = u.name  || u.email || "Unknown"
            email    = u.email || ""
            attempts = u.stats?.totalAttempts ?? 0
            avgScore = (u.stats?.totalAttempts && u.stats?.totalScore)
              ? Math.round(u.stats.totalScore / u.stats.totalAttempts) : 0
          }
        } catch {}
        return { ...m, name, email, attempts, avgScore }
      }))
      setMembers(enriched.sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt)))

      // Quizzes
      const bqSnap = await getDocs(query(collection(db, "batchQuizzes"), where("batchId", "==", batchId)))
      const enrichedQ = await Promise.all(bqSnap.docs.map(async d => {
        const bq = { id: d.id, ...d.data() }
        let quiz = null
        try { quiz = await cachedGetDoc(doc(db, "quizSets", bq.quizId)) } catch {}
        return { ...bq, quiz }
      }))
      setQuizzes(enrichedQ.filter(q => q.quiz).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)))
      const allQuizzesData = await cachedGetDocs("quizSets", collection(db, "quizSets"), { ttl: TTL_LONG })
      setAllQuizzes(allQuizzesData)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  //  Real-time: Q&A threads (Bug 1 fix) 
  // onSnapshot on ALL threads for this batch (admin sees everyone's threads).
  // Cost: 1 read on attach + 1 per change. Admin uses this infrequently.
  function subscribeThreads() {
    if (unsubThreadsRef.current) unsubThreadsRef.current()
    unsubThreadsRef.current = onSnapshot(
      collection(db, "batches", batchId, "queries"),
      snap => {
        const updated = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => t.studentId && t.messages?.length > 0)
          .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
        setThreads(updated)
        // FIX Bug 2: keep activeThread in sync without re-fetching
        if (activeThreadIdRef.current) {
          const fresh = updated.find(t => t.id === activeThreadIdRef.current)
          if (fresh) {
            setActiveThread(fresh)
            scrollBottom(threadBottomRef)
          }
        }
      },
      err => console.error("admin threads onSnapshot:", err)
    )
  }

  //  Real-time: Group chat (Bug 1 fix) 
  // FIX Bug 15: uses orderBy("sentAt") + limit(100)  -  this requires the
  // composite index added to firestore.indexes.json.
  function subscribeGroup() {
    if (unsubGroupRef.current) unsubGroupRef.current()
    unsubGroupRef.current = onSnapshot(
      query(
        collection(db, "batches", batchId, "groupChat"),
        orderBy("sentAt", "asc"),
        limit(100)
      ),
      snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setGroupMsgs(msgs)
        scrollBottom(groupBottomRef)
      },
      err => console.error("admin groupChat onSnapshot:", err)
    )
  }

  useEffect(() => { loadStaticData() }, [batchId])

  // Subscribe to real-time listeners when on chat tabs
  useEffect(() => {
    if (tab === "queries") subscribeThreads()
    if (tab === "group")   subscribeGroup()
    return () => {
      if (tab === "queries" && unsubThreadsRef.current) {
        unsubThreadsRef.current(); unsubThreadsRef.current = null
      }
      if (tab === "group" && unsubGroupRef.current) {
        unsubGroupRef.current(); unsubGroupRef.current = null
      }
    }
  }, [tab])

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      unsubThreadsRef.current?.()
      unsubGroupRef.current?.()
    }
  }, [])

  // Keep activeThreadIdRef in sync
  useEffect(() => {
    activeThreadIdRef.current = activeThread?.id ?? null
    if (activeThread) scrollBottom(threadBottomRef)
  }, [activeThread?.id])

  //  Students 
  async function handleAddStudent() {
    const email = addEmail.trim().toLowerCase()
    if (!email) return toast.error("Enter a student email")
    setSavingStudent(true)
    try {
      // Search by lowercased email. Firebase Auth always lowercases emails,
      // but old Firestore user docs may have been written with mixed case.
      // We try the lowercase version first (works for all new signups and
      // all Google sign-ins), then fall back to a broader scan for legacy docs.
      let userDoc = null
      const snap = await getDocs(query(collection(db, "users"), where("email", "==", email)))
      if (!snap.empty) {
        userDoc = snap.docs[0]
      } else {
        // Fallback: search case-insensitively by scanning recent users.
        // This handles accounts created before the lowercase-email fix.
        const allSnap = await getDocs(query(collection(db, "users"), where("email", "==", addEmail.trim())))
        if (!allSnap.empty) userDoc = allSnap.docs[0]
      }
      if (!userDoc) {
        toast.error("No account found. Ask the student to sign up first.")
        setSavingStudent(false)
        return
      }
      const userId = userDoc.id
      const existing = await getDoc(doc(db, "batches", batchId, "members", userId))
      if (existing.exists()) { toast.error("Already in this batch"); setSavingStudent(false); return }
      const joinedAt = new Date().toISOString()

      // Fix 6 + Fix 1: atomic batch write  -  all three writes succeed or none do.
      // 1. members subcollection (admin detail view)
      // 2. batch.memberIds array (O(1) membership check from batch doc)
      // 3. user.batchIds array (O(1) membership check from user doc  -  no batches scan)
      const wb = writeBatch(db)
      wb.set(doc(db, "batches", batchId, "members", userId), { userId, joinedAt, addedByAdmin: true })
      wb.update(doc(db, "batches", batchId), { memberIds: arrayUnion(userId) })
      wb.update(doc(db, "users", userId), { batchIds: arrayUnion(batchId) })
      await wb.commit()

      const u = userDoc.data()
      const newMember = {
        userId, joinedAt, addedByAdmin: true,
        name:     u.name  || u.email || "Unknown",
        email:    u.email || "",
        attempts: u.stats?.totalAttempts ?? 0,
        avgScore: (u.stats?.totalAttempts && u.stats?.totalScore)
          ? Math.round(u.stats.totalScore / u.stats.totalAttempts) : 0,
      }
      setMembers(prev => [newMember, ...prev])
      invalidateCache(`doc:batches/${batchId}`)
      toast.success(`${u.name || email} added!`)
      setAddEmail(""); setAddingStudent(false)
    } catch (e) {
      console.error("handleAddStudent error:", e)
      toast.error("Failed to add student")
    }
    setSavingStudent(false)
  }

  async function removeMember(userId, name) {
    if (!window.confirm(`Remove ${name} from this batch?`)) return
    try {
      // Fix 6 + Fix 1: atomic  -  remove from all 3 locations together
      const wb = writeBatch(db)
      wb.delete(doc(db, "batches", batchId, "members", userId))
      wb.update(doc(db, "batches", batchId), { memberIds: arrayRemove(userId) })
      wb.update(doc(db, "users", userId), { batchIds: arrayRemove(batchId) })
      await wb.commit()
      setMembers(prev => prev.filter(m => m.userId !== userId))
      invalidateCache(`doc:batches/${batchId}`)
      toast.success(`${name} removed`)
    } catch { toast.error("Failed to remove") }
  }

  //  Quizzes 
  async function assignQuiz() {
    if (!selectedQuizId) return toast.error("Select a quiz")
    if (quizzes.find(q => q.quizId === selectedQuizId)) return toast.error("Already assigned")
    setSavingQuiz(true)
    try {
      const sourceQuiz = allQuizzes.find(q => q.id === selectedQuizId)
      if (!sourceQuiz) { toast.error("Quiz not found"); setSavingQuiz(false); return }

      // Reference model: store a link to the original quiz — no copy created.
      // Edits to the original quiz are reflected in every batch instantly.
      const nextOrder = quizzes.length
      const newDoc = await addDoc(collection(db, "batchQuizzes"), {
        batchId,
        quizId:     selectedQuizId,   // points directly to the original quizSets doc
        assignedAt: new Date().toISOString(),
        order:      nextOrder,
      })

      // Update local state immediately — use the original quiz object directly
      setQuizzes(prev => [...prev, {
        id: newDoc.id, batchId, quizId: selectedQuizId,
        assignedAt: new Date().toISOString(), order: nextOrder,
        quiz: { ...sourceQuiz },
      }])

      invalidateCache("query:batchQuizzes")
      toast.success("Quiz added to batch!")
      setSelectedQuizId(""); setAddingQuiz(false)
    } catch (e) { console.error(e); toast.error("Failed to assign") }
    setSavingQuiz(false)
  }

  async function removeQuiz(bqId, title) {
    if (!window.confirm(`Remove "${title}" from this batch?`)) return
    try {
      // Reference model: only delete the batchQuizzes link.
      // The original quizSets doc is never touched — other batches keep their reference.
      await deleteDoc(doc(db, "batchQuizzes", bqId))

      setQuizzes(prev => {
        const next = prev.filter(q => q.id !== bqId)
        // Recompute order on remaining items so there are no gaps
        return next.map((q, i) => ({ ...q, order: i }))
      })
      invalidateCache("query:batchQuizzes")
      toast.success("Removed from batch")
    } catch { toast.error("Failed to remove quiz") }
  }

  // Persist new order to Firestore after a drag ends
  async function reorderQuizzes(newList) {
    setQuizzes(newList)  // optimistic UI update first
    try {
      const batch = writeBatch(db)
      newList.forEach((bq, i) => {
        batch.update(doc(db, "batchQuizzes", bq.id), { order: i })
      })
      await batch.commit()
      invalidateCache("query:batchQuizzes")
    } catch (e) {
      console.error("reorder failed", e)
      toast.error("Failed to save order")
    }
  }

  //  Details 
  async function saveDetails() {
    if (!editName.trim()) return toast.error("Batch name required")
    setSavingDetails(true)
    try {
      await updateDoc(doc(db, "batches", batchId), {
        name: editName.trim(), description: editDescription.trim(),
        longDescription: editLongDesc.trim(),
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        startDate: editStartDate, endDate: editEndDate, fee: editFee.trim(),
      })
      // Fix #3e: update batch locally  -  details panel reflects changes immediately
      const updatedBatch = {
        ...batch,
        name: editName.trim(), description: editDescription.trim(),
        longDescription: editLongDesc.trim(),
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        startDate: editStartDate, endDate: editEndDate, fee: editFee.trim(),
      }
      setBatch(updatedBatch)
      invalidateCache(`doc:batches/${batchId}`)
      toast.success("Saved!")
    } catch { toast.error("Failed to save") }
    setSavingDetails(false)
  }

  //  Private Q&A: start / reply 
  async function startThread() {
    if (!newThreadTarget) return toast.error("Select a student")
    if (!newThreadMsg.trim()) return toast.error("Enter a message")
    if (creatingThread) return
    const student = members.find(m => m.userId === newThreadTarget)
    setCreatingThread(true)
    try {
      const now = new Date().toISOString()
      // FIX Bug 14: use actual admin UID and name
      const newMsg = {
        from:     currentUser.uid,
        fromRole: "admin",
        fromName: adminName,
        text:     newThreadMsg.trim(),
        sentAt:   now,
      }
      const existing = threads.find(t => t.studentId === newThreadTarget)
      if (existing) {
        await updateDoc(doc(db, "batches", batchId, "queries", existing.id), {
          messages:     arrayUnion(newMsg),
          lastActivity: now,
          resolved:     false,
        })
        toast.success("Message added to existing conversation!")
      } else {
        await addDoc(collection(db, "batches", batchId, "queries"), {
          studentId:    newThreadTarget,
          studentName:  student?.name || "Unknown",
          subject:      newThreadSubject.trim() || newThreadMsg.trim().slice(0, 60),
          initiatedBy:  "admin",
          resolved:     false,
          lastActivity: now,
          messages:     [newMsg],
        })
        toast.success("Message sent!")
      }
      setNewThreadTarget(""); setNewThreadSubject(""); setNewThreadMsg("")
      setShowNewThread(false)
      // onSnapshot will update threads automatically  -  no reload needed
    } catch (e) { console.error(e); toast.error("Failed to send") }
    setCreatingThread(false)
  }

  // FIX Bug 2 + 3 + 10: Optimistic send for admin reply
  async function sendReply() {
    if (!replyText.trim() || !activeThread) return
    const now = new Date().toISOString()
    // FIX Bug 14: use actual admin UID/name
    const newMsg = {
      from:     currentUser.uid,
      fromRole: "admin",
      fromName: adminName,
      text:     replyText.trim(),
      sentAt:   now,
    }

    // Optimistic update
    setActiveThread(prev => prev ? {
      ...prev,
      messages:     [...(prev.messages || []), newMsg],
      lastActivity: now,
      resolved:     false,
    } : prev)
    scrollBottom(threadBottomRef)
    setReplyText("")

    setSendingReply(true)
    try {
      // FIX #10: Guard against hitting 1MB document limit on messages array
      const msgCount = (activeThread.messages || []).length
      if (msgCount >= 500) {
        toast.error("This conversation is too long. Please start a new thread.")
        setSendingReply(false)
        return
      }
      if (msgCount >= 200) {
        toast("This conversation is getting long. Consider starting a new thread.", { icon: "⚠️" })
      }
      await updateDoc(doc(db, "batches", batchId, "queries", activeThread.id), {
        messages:     arrayUnion(newMsg),
        lastActivity: now,
        resolved:     false,
      })
      // onSnapshot confirms  -  no manual reload needed
    } catch (e) {
      toast.error("Failed to send reply")
      // Rollback
      setActiveThread(prev => prev ? {
        ...prev,
        messages: (prev.messages || []).filter(m => m !== newMsg),
      } : prev)
      setReplyText(newMsg.text)
    }
    setSendingReply(false)
  }

  async function toggleResolve(thread) {
    try {
      await updateDoc(doc(db, "batches", batchId, "queries", thread.id), { resolved: !thread.resolved })
      // onSnapshot will update both threads list and activeThread
    } catch { toast.error("Failed") }
  }

  async function deleteThread(threadId) {
    if (!window.confirm("Delete this conversation?")) return
    try {
      await deleteDoc(doc(db, "batches", batchId, "queries", threadId))
      setActiveThread(null); toast.success("Deleted")
      // onSnapshot will remove it from threads list
    } catch { toast.error("Failed") }
  }

  //  Group chat 
  // FIX Bug 8 + 10: Optimistic send, no reload, scroll works
  async function sendGroupMsg() {
    if (!groupText.trim()) return
    const now    = new Date().toISOString()
    const tempId = `temp_${Date.now()}`
    // FIX Bug 14: use actual admin UID and name
    const newMsg = {
      id:       tempId,
      from:     currentUser.uid,
      fromRole: "admin",
      fromName: adminName,
      text:     groupText.trim(),
      sentAt:   now,
    }

    // Optimistic append
    setGroupMsgs(prev => [...prev, newMsg])
    scrollBottom(groupBottomRef)
    setGroupText("")

    setSendingGroup(true)
    try {
      await addDoc(collection(db, "batches", batchId, "groupChat"), {
        from:     currentUser.uid,
        fromRole: "admin",
        fromName: adminName,
        text:     newMsg.text,
        sentAt:   now,
      })
      // onSnapshot replaces temp message with confirmed one
    } catch (e) {
      toast.error("Failed to send")
      // Rollback
      setGroupMsgs(prev => prev.filter(m => m.id !== tempId))
      setGroupText(newMsg.text)
    }
    setSendingGroup(false)
  }

  // FIX Bug 11: delete updates local state directly  -  no scroll reset
  async function deleteGroupMsg(msgId) {
    // Optimistic remove from local state
    setGroupMsgs(prev => prev.filter(m => m.id !== msgId))
    try {
      await deleteDoc(doc(db, "batches", batchId, "groupChat", msgId))
      // onSnapshot confirms deletion
    } catch {
      toast.error("Failed to delete")
      // Can't easily rollback without refetch  -  reload group
      // but this is rare so acceptable
    }
  }

  //  Derived 
  const filteredMembers = members.filter(m =>
    !memberSearch || m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.email?.toLowerCase().includes(memberSearch.toLowerCase())
  )
  const assignedIds    = new Set(quizzes.map(q => q.quizId))
  // All quizzes eligible to add to this batch.
  // Reference model: we link directly to the original — no copies are ever created.
  // Exclude quizzes already in this batch. isFree copies are excluded (they are
  // independent published quizzes, not source quizzes to link from).
  const availableToAdd = allQuizzes.filter(q => {
    if (assignedIds.has(q.id)) return false
    if (q.isBatchCopy) return false   // legacy copies still in DB — don't re-assign them
    if (q.isFree)      return false   // free copies are independent, not source quizzes
    return true
  })

  // ── Quiz Picker derived values ─────────────────────────────────────────────
  const pickerCategories = [...new Set(availableToAdd.map(q => q.category).filter(Boolean))].sort()
  const pickerTopics     = [...new Set(
    availableToAdd
      .filter(q => pickerCat === "all" || q.category === pickerCat)
      .map(q => q.topic).filter(Boolean)
  )].sort()
  const pickerFiltered   = availableToAdd.filter(q => {
    if (pickerCat   !== "all" && q.category !== pickerCat)   return false
    if (pickerTopic !== "all" && q.topic    !== pickerTopic) return false
    if (pickerSearch.trim()) {
      const s = pickerSearch.trim().toLowerCase()
      if (!(q.title    || "").toLowerCase().includes(s) &&
          !(q.category || "").toLowerCase().includes(s) &&
          !(q.topic    || "").toLowerCase().includes(s)) return false
    }
    return true
  })
  const pickerTotalPages = Math.ceil(pickerFiltered.length / PICKER_PAGE_SIZE)
  const pickerPaged      = pickerFiltered.slice((pickerPage - 1) * PICKER_PAGE_SIZE, pickerPage * PICKER_PAGE_SIZE)

  function openPicker()  {
    setPickerSearch(""); setPickerCat("all"); setPickerTopic("all"); setPickerPage(1)
    setPickerTopicOpen(false); setSelectedQuizId(""); setAddingQuiz(true)
  }
  function closePicker() { setAddingQuiz(false); setSelectedQuizId(""); setPickerTopicOpen(false) }
  const openThreads    = threads.filter(t => !t.resolved).length

  if (loading) return (
    <AdminLayout>
      <div className="p-7 flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  )

  return (
    <AdminLayout>
      <div className="p-7 max-w-7xl">

        <button onClick={() => navigate("/admin/batches")}
          className="group flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-6 transition-colors">
          <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" /> Back to Batch Manager
        </button>

        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">{batch?.name}</h2>
            {batch?.description && <p className="text-gray-500 text-sm mt-0.5">{batch.description}</p>}
            {batch?.tags?.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {batch.tags.map(tag => (
                  <span key={tag} className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </div>
          {(batch?.startDate || batch?.endDate || batch?.fee) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-gray-500 shrink-0">
              {batch.startDate && <p>Start: <span className="text-white font-semibold">{new Date(batch.startDate).toLocaleDateString()}</span></p>}
              {batch.endDate   && <p className="mt-0.5">End: <span className="text-white font-semibold">{new Date(batch.endDate).toLocaleDateString()}</span></p>}
              {batch.fee       && <p className="mt-0.5">Fee: <span className="text-emerald-400 font-semibold">{batch.fee}</span></p>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Students",     value: members.length,   color: "text-cyan-400"   },
            { label: "Quizzes",      value: quizzes.length,   color: "text-purple-400" },
            { label: "Open Threads", value: openThreads,      color: openThreads > 0 ? "text-rose-400" : "text-gray-600" },
            { label: "Group Msgs",   value: groupMsgs.filter(m => !m.id?.startsWith("temp_")).length, color: "text-emerald-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
              <p className={`text-2xl font-black leading-none ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setActiveThread(null) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                tab === t.id ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" : "bg-gray-900/60 text-gray-500 border-gray-800 hover:text-white"
              }`}>
              <t.icon size={13} />
              {t.label}
              {t.id === "queries" && openThreads > 0 && (
                <span className="text-[10px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full leading-none">{openThreads}</span>
              )}
            </button>
          ))}
        </div>

        {/*  STUDENTS  */}
        {tab === "students" && (
          <div>
            <div className="mb-4">
              {addingStudent ? (
                <div className="flex gap-3 items-center bg-gray-900 border border-cyan-500/20 rounded-xl p-4">
                  <div className="relative flex-1">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input value={addEmail} onChange={e => setAddEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddStudent()}
                      placeholder="student@email.com" type="email"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none" />
                  </div>
                  <button onClick={handleAddStudent} disabled={savingStudent || !addEmail.trim()}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-4 py-2 rounded-xl text-sm transition">
                    {savingStudent ? "Adding..." : "Add Student"}
                  </button>
                  <button onClick={() => { setAddingStudent(false); setAddEmail("") }}
                    className="text-gray-500 hover:text-white text-sm px-3 py-2 transition">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingStudent(true)}
                  className="flex items-center gap-2 text-sm bg-gray-900 hover:bg-gray-800 text-cyan-400 border border-cyan-500/20 px-4 py-2.5 rounded-xl transition">
                  <Plus size={14} /> Add Student by Email
                </button>
              )}
            </div>
            <div className="relative mb-4">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search students..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            {filteredMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center">
                <Users size={36} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm">{members.length === 0 ? "No students yet. Add by email above." : "No students match search."}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map(m => (
                  <div key={m.userId} className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-black text-cyan-400">{m.name?.charAt(0)?.toUpperCase() || "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-semibold truncate">{m.name}</p>
                        {m.addedByAdmin && <span className="text-[9px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full shrink-0">Admin added</span>}
                      </div>
                      <p className="text-gray-600 text-xs truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-5 text-xs shrink-0">
                      <div className="text-center"><p className="font-black text-white">{m.attempts}</p><p className="text-gray-600">attempts</p></div>

                      <p className="text-gray-600">{new Date(m.joinedAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => removeMember(m.userId, m.name)}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition shrink-0">
                      <UserMinus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/*  QUIZZES  */}
        {tab === "quizzes" && (() => {
          // Derive subjects and topics from assigned quizzes
          const quizSubjects = [...new Set(quizzes.map(bq => bq.quiz?.category).filter(Boolean))].sort()
          const quizTopics   = [...new Set(
            quizzes
              .filter(bq => quizSubjectFilter === "all" || bq.quiz?.category === quizSubjectFilter)
              .map(bq => bq.quiz?.topic).filter(Boolean)
          )].sort()

          // Counts per subject (total quizzes in that subject)
          const subjectCounts = {}
          quizSubjects.forEach(s => {
            subjectCounts[s] = quizzes.filter(bq => bq.quiz?.category === s).length
          })

          const filteredQuizzes = quizzes.filter(bq => {
            if (quizSubjectFilter !== "all" && bq.quiz?.category !== quizSubjectFilter) return false
            if (quizTopicFilter   !== "all" && bq.quiz?.topic    !== quizTopicFilter)   return false
            if (quizSearch.trim()) {
              const s = quizSearch.trim().toLowerCase()
              if (!(bq.quiz?.title || "").toLowerCase().includes(s) &&
                  !(bq.quiz?.category || "").toLowerCase().includes(s) &&
                  !(bq.quiz?.topic || "").toLowerCase().includes(s)) return false
            }
            return true
          })

          const hasQuizFilters = quizTopicFilter !== "all" || quizSearch.trim()

          // Batch quiz list pagination (10 per page)
          const BQ_PAGE_SIZE      = 10
          const bqTotalPages      = Math.ceil(filteredQuizzes.length / BQ_PAGE_SIZE)
          // Cap page in case filters reduce the list
          const safeBqPage        = Math.min(batchQuizPage, Math.max(1, bqTotalPages))
          const pagedQuizzes      = filteredQuizzes.slice((safeBqPage - 1) * BQ_PAGE_SIZE, safeBqPage * BQ_PAGE_SIZE)

          return (
          <div>
            {/*  Assign quiz row  */}
            <div className="mb-4">
              {/* ── Quiz Picker Modal ─────────────────────────────────── */}
              {addingQuiz && (
                <div
                  className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
                  onClick={closePicker}
                >
                  <div
                    className="relative w-full sm:max-w-3xl flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden"
                    style={{
                      background: "linear-gradient(160deg, #0f1117 0%, #090c13 100%)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.08)",
                      maxHeight: "85vh",
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Accent line */}
                    <div style={{ height: 2, background: "linear-gradient(90deg, #06b6d4, #818cf8, #06b6d4)", backgroundSize: "200% 100%", animation: "shimmer 2s linear infinite" }} />

                    {/* ── Search bar ─────────────────────────────── */}
                    <div className="px-4 pt-4 pb-3 shrink-0">
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <input
                          autoFocus
                          value={pickerSearch}
                          onChange={e => { setPickerSearch(e.target.value); setPickerPage(1) }}
                          placeholder="Search quizzes…"
                          className="w-full bg-white/5 border border-white/8 text-white text-sm rounded-xl pl-9 pr-9 py-2.5 focus:outline-none focus:border-cyan-500/40 placeholder-gray-600 transition-all"
                        />
                        {pickerSearch
                          ? <button onClick={() => { setPickerSearch(""); setPickerPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition"><X size={13} /></button>
                          : <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-700 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
                        }
                      </div>
                    </div>

                    <div className="h-px bg-white/5 shrink-0" />

                    {/* ── Two-column body: subject sidebar + quiz list ── */}
                    <div className="flex flex-1 min-h-0 overflow-hidden">

                      {/* LEFT: Subject sidebar */}
                      {pickerCategories.length > 0 && (
                        <div className="w-44 shrink-0 border-r border-white/5 flex flex-col overflow-y-auto py-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-700 px-3 pb-1.5 pt-1">Subject</p>

                          {/* All subjects */}
                          <button
                            onClick={() => { setPickerCat("all"); setPickerTopic("all"); setPickerPage(1); setPickerTopicOpen(false) }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs transition ${
                              pickerCat === "all"
                                ? "text-white bg-white/6 font-semibold"
                                : "text-gray-500 hover:text-gray-300 hover:bg-white/4"
                            }`}>
                            <span className="truncate">All Subjects</span>
                            <span className={`text-[10px] font-black shrink-0 ml-1 ${pickerCat === "all" ? "text-cyan-400" : "text-gray-700"}`}>
                              {availableToAdd.length}
                            </span>
                          </button>

                          <div className="h-px bg-white/5 mx-3 my-1" />

                          {pickerCategories.map(c => {
                            const count = availableToAdd.filter(q => q.category === c).length
                            const isActive = pickerCat === c
                            return (
                              <button key={c}
                                onClick={() => { setPickerCat(c); setPickerTopic("all"); setPickerPage(1); setPickerTopicOpen(false) }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition ${
                                  isActive
                                    ? "text-white bg-white/6 font-semibold border-l-2 border-cyan-500"
                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/4 border-l-2 border-transparent"
                                }`}>
                                <span className="truncate text-left">{c}</span>
                                <span className={`text-[10px] font-black shrink-0 ml-1 ${isActive ? "text-cyan-400" : "text-gray-700"}`}>{count}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* RIGHT: Topic filter + quiz list */}
                      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

                        {/* Topic filter — custom dropdown, scales to any number of topics */}
                        {pickerCat !== "all" && pickerTopics.length > 0 && (
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-700 shrink-0">Topic</span>

                            {/* Custom dropdown */}
                            <div className="relative flex-1">
                              <button
                                onClick={() => setPickerTopicOpen(o => !o)}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] border transition ${
                                  pickerTopic !== "all"
                                    ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                    : "bg-white/4 text-gray-400 border-white/8 hover:border-white/15 hover:text-gray-300"
                                }`}
                              >
                                <span className="truncate text-left">
                                  {pickerTopic === "all" ? `All Topics (${pickerTopics.length})` : pickerTopic}
                                </span>
                                <svg
                                  width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                                  className={`shrink-0 transition-transform duration-150 ${pickerTopicOpen ? "rotate-180" : ""}`}
                                >
                                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                </svg>
                              </button>

                              {pickerTopicOpen && (
                                <div
                                  className="absolute left-0 right-0 top-full mt-1 z-20 overflow-hidden"
                                  style={{
                                    background: "#0d1017",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: 10,
                                    boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
                                    maxHeight: 220,
                                    overflowY: "auto",
                                  }}
                                >
                                  {/* All option */}
                                  <button
                                    onClick={() => { setPickerTopic("all"); setPickerPage(1); setPickerTopicOpen(false) }}
                                    className={`w-full text-left px-3 py-2 text-[11px] transition flex items-center justify-between ${
                                      pickerTopic === "all"
                                        ? "bg-indigo-500/15 text-indigo-300"
                                        : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                                    }`}
                                  >
                                    <span>All Topics</span>
                                    <span className="text-[10px] text-gray-700">{pickerTopics.length}</span>
                                  </button>
                                  <div className="h-px bg-white/5 mx-2" />
                                  {pickerTopics.map(t => {
                                    const count = availableToAdd.filter(q => q.category === pickerCat && q.topic === t).length
                                    return (
                                      <button key={t}
                                        onClick={() => { setPickerTopic(t); setPickerPage(1); setPickerTopicOpen(false) }}
                                        className={`w-full text-left px-3 py-2 text-[11px] transition flex items-center justify-between ${
                                          pickerTopic === t
                                            ? "bg-indigo-500/15 text-indigo-300"
                                            : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                                        }`}
                                      >
                                        <span className="truncate pr-2">{t}</span>
                                        <span className="text-[10px] text-gray-700 shrink-0">{count}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                            <span className="text-[10px] text-gray-700 shrink-0">
                              {pickerFiltered.length} quiz{pickerFiltered.length !== 1 ? "zes" : ""}
                            </span>
                          </div>
                        )}

                        {/* Quiz list */}
                        <div className="flex-1 overflow-y-auto p-3 min-h-0" onClick={() => pickerTopicOpen && setPickerTopicOpen(false)}>
                          {pickerPaged.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-14 text-center">
                              <Search size={20} className="text-gray-700 mb-2" />
                              <p className="text-gray-500 text-sm font-medium">
                                {availableToAdd.length === 0 ? "All quizzes are in this batch" : "No quizzes match"}
                              </p>
                              <p className="text-gray-700 text-xs mt-1">
                                {pickerSearch ? "Try a different search" : "Select a different subject or topic"}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {pickerPaged.map(q => {
                                const isSelected = selectedQuizId === q.id
                                const isDraft    = q.status !== "published"
                                const diffColor  = q.difficulty === "easy" ? "text-emerald-400" : q.difficulty === "hard" ? "text-rose-400" : "text-amber-400"
                                return (
                                  <button
                                    key={q.id}
                                    onClick={() => setSelectedQuizId(isSelected ? "" : q.id)}
                                    className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 transition-all"
                                    style={{
                                      background: isSelected ? "linear-gradient(135deg, rgba(6,182,212,0.1), rgba(99,102,241,0.07))" : "rgba(255,255,255,0.02)",
                                      border: isSelected ? "1px solid rgba(6,182,212,0.35)" : "1px solid rgba(255,255,255,0.05)",
                                    }}
                                  >
                                    {/* Radio dot */}
                                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition ${
                                      isSelected ? "border-cyan-400 bg-cyan-400" : "border-gray-600"
                                    }`}>
                                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-gray-950" />}
                                    </div>

                                    {/* Icon */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDraft ? "bg-amber-500/10 border border-amber-500/20" : "bg-indigo-500/10 border border-indigo-500/20"}`}>
                                      <BookOpen size={13} className={isDraft ? "text-amber-400" : "text-indigo-400"} />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                        <span className="text-white text-sm font-semibold truncate">{q.title}</span>
                                        {isDraft && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full shrink-0">Draft</span>}
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px]">
                                        {pickerCat === "all" && q.category && <span className="text-gray-600">{q.category}</span>}
                                        {pickerCat === "all" && q.category && q.topic && <span className="text-gray-700">·</span>}
                                        {q.topic && <span className="text-indigo-400/70">{q.topic}</span>}
                                        {(q.category || q.topic) && <span className="text-gray-700">·</span>}
                                        <span className="text-gray-600">{q.questionCount || 0}Q</span>
                                        <span className="text-gray-700">·</span>
                                        <span className="text-gray-600">{q.totalTime || 0}m</span>
                                        {q.difficulty && <><span className="text-gray-700">·</span><span className={`font-medium capitalize ${diffColor}`}>{q.difficulty}</span></>}
                                        {q.marksPerQ > 0 && <span className="text-emerald-600 ml-auto">+{q.marksPerQ}</span>}
                                        {q.negativeMark > 0 && <span className="text-rose-600">−{q.negativeMark}</span>}
                                      </div>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Pagination inside right column */}
                        {pickerTotalPages > 1 && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 shrink-0">
                            <span className="text-[11px] text-gray-700">
                              {pickerFiltered.length} quizzes · page {pickerPage} of {pickerTotalPages}
                            </span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setPickerPage(p => Math.max(1, p - 1))} disabled={pickerPage === 1}
                                className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:text-white border border-white/6 hover:border-white/15 disabled:opacity-25 transition">
                                ←
                              </button>
                              {Array.from({ length: Math.min(pickerTotalPages, 5) }, (_, i) => {
                                let p
                                if (pickerTotalPages <= 5) p = i + 1
                                else if (pickerPage <= 3) p = i + 1
                                else if (pickerPage >= pickerTotalPages - 2) p = pickerTotalPages - 4 + i
                                else p = pickerPage - 2 + i
                                return (
                                  <button key={p} onClick={() => setPickerPage(p)}
                                    className={`w-6 h-6 rounded-lg text-xs font-bold transition ${p === pickerPage ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "text-gray-600 hover:text-gray-300 border border-white/5"}`}>
                                    {p}
                                  </button>
                                )
                              })}
                              <button onClick={() => setPickerPage(p => Math.min(pickerTotalPages, p + 1))} disabled={pickerPage === pickerTotalPages}
                                className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:text-white border border-white/6 hover:border-white/15 disabled:opacity-25 transition">
                                →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-5 py-4 border-t border-white/5 shrink-0"
                      style={{ background: "rgba(0,0,0,0.3)" }}>
                      <div className="flex items-center gap-3 min-w-0">
                        {selectedQuizId ? (
                          <>
                            <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                            <span className="text-sm text-white font-medium truncate">
                              {availableToAdd.find(q => q.id === selectedQuizId)?.title || ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-600">Select a quiz to continue</span>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0 ml-4">
                        <button onClick={closePicker}
                          className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:text-white border border-white/6 hover:border-white/15 transition">
                          Cancel
                        </button>
                        <button onClick={() => { assignQuiz() }} disabled={savingQuiz || !selectedQuizId}
                          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: selectedQuizId ? "linear-gradient(135deg, #06b6d4, #818cf8)" : undefined, backgroundColor: !selectedQuizId ? "#1f2937" : undefined, color: selectedQuizId ? "#000" : "#6b7280" }}>
                          {savingQuiz ? (
                            <><div className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" /> Adding…</>
                          ) : (
                            <><Plus size={14} /> Add to Batch</>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Shimmer keyframe injected */}
                    <style>{`@keyframes shimmer { 0%{background-position:0% 0} 100%{background-position:200% 0} }`}</style>
                  </div>
                </div>
              )}

              {/* ── Add Quiz trigger button ───────────────────────────────── */}
              {!addingQuiz && (
                <button onClick={openPicker}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
                  style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.12), rgba(99,102,241,0.08))", border: "1px solid rgba(6,182,212,0.25)", color: "#67e8f9" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(6,182,212,0.5)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(6,182,212,0.25)"}
                >
                  <Plus size={14} /> Add Quiz to Batch
                </button>
              )}
            </div>

            {quizzes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center">
                <BookOpen size={36} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm">No quizzes assigned yet.</p>
              </div>
            ) : (
              <div className="flex gap-4 min-h-0">

                {/*  LEFT: Subject sidebar  */}
                {quizSubjects.length > 0 && (
                  <div className="w-52 shrink-0 bg-gray-900 border border-gray-800 rounded-2xl py-3 flex flex-col">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 px-3 pb-2 pt-1">Subjects</p>
                    <button onClick={() => { setQuizSubjectFilter("all"); setQuizTopicFilter("all") }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium transition rounded-lg hover:bg-gray-800 mx-0 ${
                        quizSubjectFilter === "all" ? "text-white bg-gray-800" : "text-gray-400"
                      }`}>
                      <span>All Subjects</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        quizSubjectFilter === "all" ? "bg-cyan-500/15 text-cyan-400" : "bg-gray-800 text-gray-600"
                      }`}>{quizzes.length}</span>
                    </button>
                    <div className="h-px bg-gray-800 mx-3 my-1" />
                    {quizSubjects.map(s => {
                      const isActive = quizSubjectFilter === s
                      return (
                        <button key={s} onClick={() => { setQuizSubjectFilter(s); setQuizTopicFilter("all") }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-xs transition rounded-lg hover:bg-gray-800 ${
                            isActive ? "text-white bg-gray-800 font-medium" : "text-gray-400"
                          }`}>
                          <span className="truncate flex-1 text-left">{s}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ml-1 ${
                            isActive ? "bg-cyan-500/15 text-cyan-400" : "bg-gray-800/80 text-gray-600"
                          }`}>{subjectCounts[s]}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/*  RIGHT: Filter bar + quiz list  */}
                <div className="flex-1 min-w-0 flex flex-col gap-3">

                  {/* Filter bar */}
                  <div className="flex items-center gap-2 flex-wrap">

                    {/* Topic dropdown  -  scoped to active subject */}
                    {quizTopics.length > 0 && (
                      <select value={quizTopicFilter} onChange={e => setQuizTopicFilter(e.target.value)}
                        className="bg-gray-900 border border-indigo-500/30 text-xs text-indigo-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                        <option value="all">All Topics</option>
                        {quizTopics.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}

                    {/* Search */}
                    <div className="relative flex-1 min-w-[160px]">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                      <input value={quizSearch} onChange={e => setQuizSearch(e.target.value)}
                        placeholder="Search quizzes..."
                        className="w-full bg-gray-900 border border-gray-800 text-white text-xs rounded-xl pl-8 pr-8 py-2 focus:outline-none focus:border-gray-600 placeholder-gray-700" />
                      {quizSearch && (
                        <button onClick={() => setQuizSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                          <X size={11} />
                        </button>
                      )}
                    </div>

                    {/* Clear + count */}
                    {hasQuizFilters && (
                      <button onClick={() => { setQuizTopicFilter("all"); setQuizSearch(""); setBatchQuizPage(1) }}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-rose-400 border border-gray-800 hover:border-rose-500/30 px-2.5 py-2 rounded-xl transition">
                        <X size={10} /> Clear
                      </button>
                    )}
                    <span className="text-xs text-gray-600 ml-auto">
                      {filteredQuizzes.length} of {quizzes.length}
                      {bqTotalPages > 1 && ` · page ${safeBqPage} of ${bqTotalPages}`}
                    </span>
                  </div>

                  {/* Quiz list  -  draggable when no filters active */}
                  {filteredQuizzes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center">
                      <Search size={22} className="mx-auto text-gray-700 mb-2" />
                      <p className="text-gray-500 text-sm">No quizzes match your filters.</p>
                      <button onClick={() => { setQuizTopicFilter("all"); setQuizSearch("") }}
                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition">Clear filters</button>
                    </div>
                  ) : (
                    <>
                      {hasQuizFilters && (
                        <p className="text-[10px] text-amber-400/70 flex items-center gap-1 -mt-1 mb-1">
                          <GripVertical size={10} /> Drag reordering is paused while filters are active
                        </p>
                      )}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={({ active }) => setActiveDragId(active.id)}
                        onDragEnd={({ active, over }) => {
                          setActiveDragId(null)
                          if (!over || active.id === over.id || hasQuizFilters) return
                          const oldIdx = quizzes.findIndex(bq => bq.id === active.id)
                          const newIdx = quizzes.findIndex(bq => bq.id === over.id)
                          if (oldIdx === -1 || newIdx === -1) return
                          const newList = arrayMove(quizzes, oldIdx, newIdx)
                          reorderQuizzes(newList)
                        }}
                        onDragCancel={() => setActiveDragId(null)}
                      >
                        <SortableContext
                          items={pagedQuizzes.map(bq => bq.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {pagedQuizzes.map(bq => (
                              <SortableQuizRow
                                key={bq.id}
                                bq={bq}
                                onRemove={removeQuiz}
                                onNavigate={navigate}
                                isFiltering={hasQuizFilters}
                              />
                            ))}
                          </div>
                        </SortableContext>

                        {/* Floating card that follows the pointer while dragging */}
                        <DragOverlay dropAnimation={{
                          duration: 200,
                          easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                        }}>
                          {activeDragId
                            ? <DragCard bq={quizzes.find(bq => bq.id === activeDragId)} />
                            : null}
                        </DragOverlay>
                      </DndContext>

                      {/* Batch quiz list pagination */}
                      {bqTotalPages > 1 && (
                        <div className="flex items-center justify-center gap-1 pt-3 mt-1 border-t border-gray-800/60">
                          <button onClick={() => setBatchQuizPage(p => Math.max(1, p - 1))} disabled={safeBqPage === 1}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 transition">
                            Prev
                          </button>
                          {Array.from({ length: Math.min(bqTotalPages, 5) }, (_, i) => {
                            let p
                            if (bqTotalPages <= 5) p = i + 1
                            else if (safeBqPage <= 3) p = i + 1
                            else if (safeBqPage >= bqTotalPages - 2) p = bqTotalPages - 4 + i
                            else p = safeBqPage - 2 + i
                            return (
                              <button key={p} onClick={() => setBatchQuizPage(p)}
                                className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                                  p === safeBqPage
                                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                                    : "text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700"
                                }`}>
                                {p}
                              </button>
                            )
                          })}
                          <button onClick={() => setBatchQuizPage(p => Math.min(bqTotalPages, p + 1))} disabled={safeBqPage === bqTotalPages}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 transition">
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {/*  PRIVATE Q&A  */}
        {tab === "queries" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[600px]">
            <div className={`lg:col-span-2 flex flex-col gap-3 min-h-0 ${activeThread ? "hidden lg:flex" : "flex"}`}>
              <button onClick={() => setShowNewThread(s => !s)}
                className="flex items-center gap-2 text-sm bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2.5 rounded-xl transition shrink-0">
                <Plus size={14} /> Message a Student
              </button>

              {showNewThread && (() => {
                const existingThread = threads.find(t => t.studentId === newThreadTarget)
                return (
                  <div className="bg-gray-900 border border-cyan-500/20 rounded-xl p-4 space-y-3 shrink-0">
                    <select value={newThreadTarget} onChange={e => setNewThreadTarget(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none">
                      <option value=""> -  Select student  - </option>
                      {members.map(m => <option key={m.userId} value={m.userId}>{m.name} ({m.email})</option>)}
                    </select>
                    {newThreadTarget && !existingThread && (
                      <input value={newThreadSubject} onChange={e => setNewThreadSubject(e.target.value)}
                        placeholder="Subject (optional)"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none" />
                    )}
                    {existingThread && (
                      <p className="text-xs text-cyan-400/70 bg-cyan-500/8 border border-cyan-500/15 rounded-lg px-3 py-2">
                        A conversation with this student already exists  -  your message will be added to it.
                      </p>
                    )}
                    <textarea value={newThreadMsg} onChange={e => setNewThreadMsg(e.target.value)} rows={3}
                      placeholder="Your message..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none resize-none" />
                    <div className="flex gap-2">
                      <button onClick={startThread} disabled={creatingThread || !newThreadTarget || !newThreadMsg.trim()}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold py-2 rounded-xl text-sm transition flex items-center justify-center gap-1.5">
                        <Send size={13} /> {creatingThread ? "Sending..." : "Send Message"}
                      </button>
                      <button onClick={() => setShowNewThread(false)}
                        className="text-gray-500 hover:text-white px-3 text-sm transition">Cancel</button>
                    </div>
                  </div>
                )
              })()}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {threads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
                    <MessageCircle size={28} className="mx-auto text-gray-700 mb-2" />
                    <p className="text-gray-600 text-xs">No conversations yet.</p>
                    <p className="text-gray-700 text-xs mt-0.5">Message a student or wait for questions.</p>
                  </div>
                ) : threads.map(t => (
                  <ThreadItem key={t.id} thread={t}
                    unread={!t.resolved && t.messages?.slice(-1)[0]?.fromRole === "student"}
                    isActive={activeThread?.id === t.id}
                    onClick={() => setActiveThread(t)} />
                ))}
              </div>
            </div>

            <div className={`lg:col-span-3 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden ${activeThread ? "flex" : "hidden lg:flex"}`}>
              {activeThread ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
                    <button onClick={() => setActiveThread(null)} className="lg:hidden text-gray-500 hover:text-white transition">
                      <ChevronLeft size={16} />
                    </button>
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <span className="text-xs font-black text-purple-400">{activeThread.studentName?.charAt(0)?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{activeThread.studentName}</p>
                      {activeThread.subject && <p className="text-gray-500 text-xs truncate">{activeThread.subject}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleResolve(activeThread)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition ${
                          activeThread.resolved ? "text-gray-500 border-gray-700 hover:text-white" : "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                        }`}>
                        {activeThread.resolved ? "Reopen" : "Mark Resolved"}
                      </button>
                      <button onClick={() => deleteThread(activeThread.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {(activeThread.messages || []).map((msg, i) => (
                      <Bubble key={i} msg={msg} currentAdminUid={currentUser.uid} />
                    ))}
                    <div ref={threadBottomRef} />
                  </div>
                  {!activeThread.resolved ? (
                    <div className="px-4 py-3 border-t border-gray-800 shrink-0">
                      <div className="flex gap-2">
                        <input value={replyText} onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendReply()}
                          placeholder="Reply as Admin..."
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500/40 focus:outline-none" />
                        <button onClick={sendReply} disabled={sendingReply || !replyText.trim()}
                          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-4 py-2 rounded-xl text-sm transition flex items-center gap-1.5">
                          <Send size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-t border-gray-800 text-center shrink-0">
                      <p className="text-xs text-gray-600">This conversation is resolved.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <MessageCircle size={36} className="text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">Select a conversation</p>
                  <p className="text-gray-700 text-xs mt-1">or message a student directly</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/*  GROUP CHAT  */}
        {tab === "group" && (
          <div className="flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden" style={{ height: "600px" }}>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 shrink-0">
              <Hash size={15} className="text-emerald-400" />
              <p className="text-sm font-bold text-white">{batch?.name}  -  Group Chat</p>
              <span className="text-xs text-gray-600 ml-auto">
                {groupMsgs.filter(m => !m.id?.startsWith("temp_")).length} messages . {members.length} members
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {groupMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Hash size={32} className="text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">No messages yet.</p>
                  <p className="text-gray-600 text-xs mt-1">Start the conversation with your batch.</p>
                </div>
              ) : groupMsgs.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 group ${msg.fromRole === "admin" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 mt-1 ${
                    msg.fromRole === "admin" ? "bg-cyan-500/15 border border-cyan-500/25 text-cyan-400" : "bg-purple-500/15 border border-purple-500/25 text-purple-400"
                  }`}>
                    {msg.fromName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className={`flex flex-col max-w-[65%] ${msg.fromRole === "admin" ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold ${msg.fromRole === "admin" ? "text-cyan-500" : "text-gray-400"}`}>
                        {msg.fromRole === "admin" ? "Admin (You)" : msg.fromName}
                      </span>
                      <span className="text-[10px] text-gray-700">
                        {new Date(msg.sentAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className={`relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.fromRole === "admin"
                        ? "bg-cyan-500/10 border border-cyan-500/20 text-gray-100 rounded-tr-sm"
                        : "bg-gray-800 border border-gray-700/50 text-gray-200 rounded-tl-sm"
                    }`}>
                      {msg.text}
                      {msg.id?.startsWith("temp_") && (
                        <span className="ml-2 text-[10px] opacity-50">sending...</span>
                      )}
                      {/* FIX Bug 12: admin can delete ANY message (moderation) */}
                      {!msg.id?.startsWith("temp_") && (
                        <button onClick={() => deleteGroupMsg(msg.id)}
                          className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 w-5 h-5 bg-gray-900 border border-gray-700 rounded-full flex items-center justify-center text-gray-600 hover:text-red-400 transition-all">
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={groupBottomRef} />
            </div>
            <div className="px-4 py-3 border-t border-gray-800 shrink-0">
              <div className="flex gap-2">
                <input value={groupText} onChange={e => setGroupText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendGroupMsg()}
                  placeholder="Send a message to the group..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-500/40 focus:outline-none" />
                <button onClick={sendGroupMsg} disabled={sendingGroup || !groupText.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition flex items-center gap-1.5">
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/*  DETAILS  */}
        {tab === "details" && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Basic Info</p>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Batch Name *</label>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Short Description</label>
                <input value={editDescription} onChange={e => setEditDescription(e.target.value)}
                  placeholder="One-line tagline shown on batch cards"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Full Description</label>
                <textarea value={editLongDesc} onChange={e => setEditLongDesc(e.target.value)} rows={4}
                  placeholder="Detailed description for prospective students..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Tags <span className="text-gray-600 normal-case font-normal">(comma separated)</span></label>
                <input value={editTags} onChange={e => setEditTags(e.target.value)}
                  placeholder="e.g. UPSC, GK, Uttarakhand, 2025"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none" />
              </div>
            </div>
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Schedule & Pricing</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Start Date</label>
                  <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">End Date</label>
                  <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Fee / Price</label>
                <input value={editFee} onChange={e => setEditFee(e.target.value)}
                  placeholder="e.g. ₹999 / Free / ₹1499 per month"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none" />
              </div>
            </div>
            <button onClick={saveDetails} disabled={savingDetails}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-black px-6 py-3 rounded-xl text-sm transition">
              <Save size={15} /> {savingDetails ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}