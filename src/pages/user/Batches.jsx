import { useEffect, useState, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import {
  collection, query, where, doc,
  addDoc, updateDoc, arrayUnion, onSnapshot, orderBy, limit
} from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG, TTL_SHORT } from "../../firebase/firestoreCache"
import Navbar from "../../components/Navbar"
import QuizCard from "../../components/QuizCard"
import toast from "react-hot-toast"
import {
  GraduationCap, BookOpen, ChevronRight, Lock, CheckCircle,
  ArrowLeft, Star, Zap, Trophy, Target, Send, Hash,
  MessageCircle, ChevronLeft, X, Search, Filter,
  CheckSquare, Circle
} from "lucide-react"

//  Chat bubble 
function Bubble({ msg, currentUserId }) {
  const isRight = msg.fromRole === "admin" || msg.from === currentUserId
  const time    = new Date(msg.sentAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
  return (
    <div className={`flex gap-2.5 ${isRight ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 mt-1 ${
        msg.fromRole === "admin" ? "bg-cyan-500/15 border border-cyan-500/25 text-cyan-400" : "bg-purple-500/15 border border-purple-500/25 text-purple-400"
      }`}>
        {msg.fromName?.charAt(0)?.toUpperCase() || "?"}
      </div>
      <div className={`flex flex-col max-w-[72%] ${isRight ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold ${msg.fromRole === "admin" ? "text-cyan-500" : "text-purple-400"}`}>
            {msg.fromRole === "admin" ? "Instructor" : msg.fromName}
          </span>
          <span className="text-[10px] text-gray-700">{time}</span>
        </div>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          msg.fromRole === "admin"
            ? "bg-cyan-500/10 border border-cyan-500/20 text-gray-100 rounded-tr-sm"
            : "bg-gray-800 border border-gray-700/50 text-gray-200 rounded-tl-sm"
        }`}>
          {msg.text}
        </div>
      </div>
    </div>
  )
}

//  Batch Landing Page (unjoined) 
function BatchLanding({ batch, onBack }) {
  const quizCount = batch.quizzes?.length || 0
  const features = [
    { icon: BookOpen,  text: `${quizCount} curated quiz${quizCount !== 1 ? "zes" : ""}` },
    { icon: Target,    text: "Detailed performance analytics" },
    { icon: Trophy,    text: "Batch leaderboard & rankings" },
    { icon: Zap,       text: "Structured exam preparation" },
  ]
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack}
          className="group flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-8 transition-colors">
          <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
          Back to Batches
        </button>
        <div className="relative rounded-3xl overflow-hidden border border-gray-800 mb-6"
          style={{ background: "linear-gradient(135deg, #0d1520 0%, #111827 60%, #0a1628 100%)" }}>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)", transform: "translate(30%,-30%)" }} />
          <div className="relative p-8">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center mb-5">
              <GraduationCap size={26} className="text-purple-400" />
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">{batch.name}</h1>
                <p className="text-gray-400 text-sm leading-relaxed max-w-lg">
                  {batch.longDescription || batch.description || "A comprehensive exam preparation batch designed to help you crack the exam with structured quizzes, detailed analytics and expert-curated content."}
                </p>
              </div>
              <div className="shrink-0 bg-gray-800/60 border border-gray-700/40 rounded-2xl px-5 py-3 text-center">
                <p className="text-2xl font-black text-purple-400">{quizCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">Quizzes</p>
              </div>
            </div>
            {batch.tags?.length > 0 && (
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {batch.tags.map(t => <span key={t} className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {features.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2.5 bg-gray-800/40 rounded-xl px-4 py-3 border border-gray-700/30">
                  <Icon size={14} className="text-purple-400 shrink-0" />
                  <span className="text-sm text-gray-300">{text}</span>
                </div>
              ))}
            </div>
            {(batch.fee || batch.startDate) && (
              <div className="flex gap-3 mb-4 flex-wrap">
                {batch.fee && <span className="text-sm font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">💰 {batch.fee}</span>}
                {batch.startDate && <span className="text-sm text-gray-400 bg-gray-800 border border-gray-700 px-3 py-1 rounded-full">📅 Starts {new Date(batch.startDate).toLocaleDateString()}</span>}
              </div>
            )}
            <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-2xl px-5 py-4">
              <Lock size={18} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-amber-400 font-bold text-sm">Enrollment Required</p>
                <p className="text-gray-500 text-xs mt-0.5">Contact your instructor to get enrolled in this batch.</p>
              </div>
            </div>
          </div>
        </div>
        {(batch.quizzes?.length || 0) > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Quizzes in this batch</p>
            <div className="space-y-2">
              {(Array.isArray(batch.quizzes) ? batch.quizzes : []).slice(0, 4).map((q, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 opacity-50 select-none">
                  <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                    <Lock size={12} className="text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-400 flex-1 truncate filter blur-sm">{q.title}</p>
                  <span className="text-xs text-gray-600">{q.questionCount || 0}Q</span>
                </div>
              ))}
              {(Array.isArray(batch.quizzes) ? batch.quizzes : []).length > 4 && <p className="text-xs text-gray-600 text-center pt-1">+{(Array.isArray(batch.quizzes) ? batch.quizzes : []).length - 4} more quizzes</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

//  Joined Batch Detail 
function JoinedBatchDetail({ batch, myAttempts, currentUser, currentUserName, onBack }) {
  const navigate = useNavigate()

  //  Safe quizzes alias  -  defined first, before any hooks that use it 
  // Handles null, undefined, {}, or any non-array value from cache/Firestore
  const safeQuizzes = Array.isArray(batch.quizzes) ? batch.quizzes : []

  //  Derived quiz data 
  const batchQuizIds  = useMemo(() => new Set(safeQuizzes.map(q => q.id)), [safeQuizzes])
  const batchAttempts = useMemo(() => myAttempts.filter(a => batchQuizIds.has(a.quizId)), [myAttempts, batchQuizIds])

  const quizStats = useMemo(() => {
    const map = {}
    batchAttempts.forEach(a => {
      if (!map[a.quizId]) map[a.quizId] = { best: 0, count: 0 }
      const pct = Math.round((a.score / (a.maxScore || a.totalQ)) * 100)
      map[a.quizId].best  = Math.max(map[a.quizId].best, pct)
      map[a.quizId].count++
    })
    return map
  }, [batchAttempts])

  const attemptedIds = useMemo(() => new Set(Object.keys(quizStats)), [quizStats])
  const doneCount    = safeQuizzes.filter(q => attemptedIds.has(q.id)).length
  const totalCount   = safeQuizzes.length
  const progress     = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const batchAvg = useMemo(() => {
    const firsts = batchAttempts.filter(a => (a.attemptNumber ?? 1) === 1)
    if (!firsts.length) return null
    return Math.round(firsts.reduce((s, a) => s + (a.score / (a.maxScore || a.totalQ)) * 100, 0) / firsts.length)
  }, [batchAttempts])

  const bestStreak = useMemo(() =>
    batchAttempts.length ? Math.max(...batchAttempts.map(a => a.streak || 0)) : 0
  , [batchAttempts])

  //  Subject sidebar data 
  const subjectMap = useMemo(() => {
    const map = {}
    safeQuizzes.forEach(q => {
      const cat = q.category || "Other"
      if (!map[cat]) map[cat] = { total: 0, done: 0 }
      map[cat].total++
      if (attemptedIds.has(q.id)) map[cat].done++
    })
    return map
  }, [safeQuizzes, attemptedIds])

  const subjects = useMemo(() => Object.keys(subjectMap).sort(), [subjectMap])

  //  Filters 
  const [activeTab,     setActiveTab]     = useState("quizzes")
  const [activeSubject, setActiveSubject] = useState("all")
  const [activeTopic,   setActiveTopic]   = useState("all")
  const [quizFilter,    setQuizFilter]    = useState("todo")
  const [search,        setSearch]        = useState("")
  const [visibleCount,  setVisibleCount]  = useState(10)

  // Topics scoped to the active subject
  const topics = useMemo(() => {
    const source = activeSubject === "all"
      ? safeQuizzes
      : safeQuizzes.filter(q => (q.category || "Other") === activeSubject)
    return [...new Set(source.map(q => q.topic).filter(Boolean))].sort()
  }, [batch.quizzes, activeSubject])

  // Reset topic when subject changes
  function handleSubjectChange(val) { setActiveSubject(val); setActiveTopic("all"); setVisibleCount(10) }

  const visibleQuizzes = useMemo(() => {
    // Respect admin-set order  -  do not re-sort by done/undone (that changes positions unexpectedly)
    let list = [...safeQuizzes]
    if (activeSubject !== "all")  list = list.filter(q => (q.category || "Other") === activeSubject)
    if (activeTopic   !== "all")  list = list.filter(q => q.topic === activeTopic)
    if (quizFilter === "todo")    list = list.filter(q => !attemptedIds.has(q.id))
    if (quizFilter === "done")    list = list.filter(q => attemptedIds.has(q.id))
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(q => (q.title || "").toLowerCase().includes(s))
    }
    return list
  }, [safeQuizzes, attemptedIds, activeSubject, activeTopic, quizFilter, search])

  const todoCnt = safeQuizzes.filter(q =>
    !attemptedIds.has(q.id) &&
    (activeSubject === "all" || (q.category || "Other") === activeSubject) &&
    (activeTopic   === "all" || q.topic === activeTopic)
  ).length
  const doneCnt = safeQuizzes.filter(q =>
    attemptedIds.has(q.id) &&
    (activeSubject === "all" || (q.category || "Other") === activeSubject) &&
    (activeTopic   === "all" || q.topic === activeTopic)
  ).length

  //  Chat state 
  // FIX Bug 2: activeThread is kept in sync via a ref to the current thread id
  // so we can update it when onSnapshot fires
  const [threads,       setThreads]       = useState([])
  const [activeThread,  setActiveThread]  = useState(null)
  const activeThreadIdRef                 = useRef(null)   // FIX Bug 2
  const [replyText,     setReplyText]     = useState("")
  const [sendingReply,  setSendingReply]  = useState(false)
  const [newQuestion,   setNewQuestion]   = useState("")
  const [sendingNew,    setSendingNew]    = useState(false)
  const threadBottomRef = useRef(null)

  const [groupMsgs,     setGroupMsgs]     = useState([])
  const [groupText,     setGroupText]     = useState("")
  const [sendingGroup,  setSendingGroup]  = useState(false)
  const groupBottomRef  = useRef(null)

  //  Unsubscribe refs 
  const unsubThreadsRef = useRef(null)
  const unsubGroupRef   = useRef(null)

  //  Auto-scroll helper 
  function scrollBottom(ref) {
    // Use requestAnimationFrame so DOM has painted before we scroll
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth" })
    })
  }

  //  Real-time: Private Q&A threads (Bug 1 fix) 
  // onSnapshot on the student's own threads  -  reads only this student's docs.
  // Cost: 1 read on attach + 1 read per change. Very cheap since threads change
  // only when someone sends a message, which is intentional user activity.
  function subscribeThreads() {
    if (unsubThreadsRef.current) unsubThreadsRef.current()   // detach old listener
    const q = query(
      collection(db, "batches", batch.id, "queries"),
      where("studentId", "==", currentUser.uid)
    )
    unsubThreadsRef.current = onSnapshot(q, snap => {
      const updated = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.studentId && t.messages?.length > 0)
        .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      setThreads(updated)

      // FIX Bug 2: if we have an open thread, keep it in sync with the latest data
      if (activeThreadIdRef.current) {
        const fresh = updated.find(t => t.id === activeThreadIdRef.current)
        if (fresh) {
          setActiveThread(fresh)
          scrollBottom(threadBottomRef)
        }
      }
    }, err => console.error("threads onSnapshot:", err))
  }

  //  Real-time: Group chat (Bug 1 fix) 
  // onSnapshot on the last 100 group messages ordered by sentAt.
  // Using limit(100) avoids downloading the entire chat history on every reconnect.
  // Cost: 1 read per new message sent by anyone in the batch.
  function subscribeGroup() {
    if (unsubGroupRef.current) unsubGroupRef.current()
    const q = query(
      collection(db, "batches", batch.id, "groupChat"),
      orderBy("sentAt", "asc"),
      limit(100)
    )
    unsubGroupRef.current = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setGroupMsgs(msgs)
      scrollBottom(groupBottomRef)
    }, err => console.error("groupChat onSnapshot:", err))
  }

  // Subscribe / unsubscribe as the active tab changes
  useEffect(() => {
    if (activeTab === "qa")    subscribeThreads()
    if (activeTab === "group") subscribeGroup()

    // Cleanup: detach listeners when leaving the tab
    return () => {
      if (activeTab === "qa" && unsubThreadsRef.current) {
        unsubThreadsRef.current()
        unsubThreadsRef.current = null
      }
      if (activeTab === "group" && unsubGroupRef.current) {
        unsubGroupRef.current()
        unsubGroupRef.current = null
      }
    }
  }, [activeTab])

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      unsubThreadsRef.current?.()
      unsubGroupRef.current?.()
    }
  }, [])

  // Keep activeThreadIdRef in sync with activeThread state
  useEffect(() => {
    activeThreadIdRef.current = activeThread?.id ?? null
    if (activeThread) scrollBottom(threadBottomRef)
  }, [activeThread?.id])

  //  Submit new question 
  async function submitNewQuestion() {
    const q = newQuestion.trim()
    if (!q) return
    setSendingNew(true)
    try {
      const now = new Date().toISOString()
      await addDoc(collection(db, "batches", batch.id, "queries"), {
        studentId:    currentUser.uid,
        studentName:  currentUserName,
        subject:      q.slice(0, 60),
        initiatedBy:  "student",
        resolved:     false,
        lastActivity: now,
        // FIX Bug 13 note: messages stored as array. Max guard: UI warns at 200+ msgs.
        // Full migration to subcollection is a separate task.
        messages: [{
          from:     currentUser.uid,
          fromRole: "student",
          fromName: currentUserName,
          text:     q,
          sentAt:   now,
        }],
      })
      setNewQuestion("")
      // onSnapshot will update threads automatically  -  no manual reload needed (Bug 3 fix)
    } catch (e) { console.error(e) }
    setSendingNew(false)
  }

  //  Send reply 
  // FIX Bug 2 + Bug 3: Optimistic update  -  append to local activeThread immediately,
  // then write to Firestore. onSnapshot will confirm/correct within ~1s.
  async function sendReply() {
    if (!replyText.trim() || !activeThread) return
    const now = new Date().toISOString()
    const newMsg = {
      from:     currentUser.uid,
      fromRole: "student",
      fromName: currentUserName,
      text:     replyText.trim(),
      sentAt:   now,
    }

    // Optimistic update  -  show message instantly (Bug 10 fix)
    setActiveThread(prev => prev ? {
      ...prev,
      messages:     [...(prev.messages || []), newMsg],
      lastActivity: now,
    } : prev)
    scrollBottom(threadBottomRef)
    setReplyText("")

    setSendingReply(true)
    try {
      // FIX #10: Guard against 1MB document limit
      const msgCount = (activeThread.messages || []).length
      if (msgCount >= 500) {
        toast.error("Conversation too long. Please ask a new question.")
        setSendingReply(false)
        return
      }
      await updateDoc(doc(db, "batches", batch.id, "queries", activeThread.id), {
        messages:     arrayUnion(newMsg),
        lastActivity: now,
      })
      // onSnapshot will sync the confirmed state  -  no manual getDoc needed (Bug 3 fix)
    } catch (e) {
      console.error(e)
      // Rollback optimistic update on error
      setActiveThread(prev => prev ? {
        ...prev,
        messages: prev.messages.filter(m => m !== newMsg),
      } : prev)
      setReplyText(newMsg.text)
    }
    setSendingReply(false)
  }

  //  Send group message 
  // FIX Bug 8 + Bug 10: Optimistic append  -  message appears instantly.
  // onSnapshot confirms within ~1s. No manual reload. Scroll works reliably.
  async function sendGroupMsg() {
    if (!groupText.trim()) return
    const now = new Date().toISOString()
    const tempId = `temp_${Date.now()}`
    const newMsg = {
      id:       tempId,
      from:     currentUser.uid,
      fromRole: "student",
      fromName: currentUserName,
      text:     groupText.trim(),
      sentAt:   now,
    }

    // Optimistic append (Bug 10 fix)
    setGroupMsgs(prev => [...prev, newMsg])
    scrollBottom(groupBottomRef)
    setGroupText("")

    setSendingGroup(true)
    try {
      // FIX Bug 14: from is actual user UID, not hardcoded string
      await addDoc(collection(db, "batches", batch.id, "groupChat"), {
        from:     currentUser.uid,
        fromRole: "student",
        fromName: currentUserName,
        text:     newMsg.text,
        sentAt:   now,
      })
      // onSnapshot will replace the temp message with the real one
    } catch (e) {
      console.error(e)
      // Rollback on error
      setGroupMsgs(prev => prev.filter(m => m.id !== tempId))
      setGroupText(newMsg.text)
    }
    setSendingGroup(false)
  }

  //  hasUnread: last message is from admin and thread is open 
  // FIX Bug 4: was checking fromRole === "admin" which is correct direction,
  // but we also need !resolved to be meaningful
  const hasUnread = threads.some(t =>
    !t.resolved && t.messages?.slice(-1)[0]?.fromRole === "admin"
  )

  function scoreCfg(pct) {
    if (pct >= 80) return "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
    if (pct >= 60) return "bg-amber-500/10   border-amber-500/25   text-amber-400"
    return               "bg-rose-500/10    border-rose-500/25    text-rose-400"
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      <Navbar />
      <div className="flex-1 overflow-hidden max-w-7xl mx-auto w-full px-6 pt-3 flex flex-col min-h-0">

        <button onClick={onBack}
          className="group flex items-center gap-1.5 text-gray-500 hover:text-white text-xs mb-3 transition-colors">
          <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" /> Back to Batches
        </button>

        {/*  Compact header bar  */}
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 mb-3 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
            <GraduationCap size={14} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-black text-white tracking-tight">{batch.name}</h1>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Enrolled</span>
              {batch.description && <span className="text-gray-500 text-xs hidden sm:block truncate max-w-xs">{batch.description}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            <div className="flex items-center gap-1">
              <span className="font-black text-amber-400">{totalCount - doneCount}</span>
              <span className="text-gray-600 text-[10px]">to do</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-black text-emerald-400">{doneCount}</span>
              <span className="text-gray-600 text-[10px]">done</span>
            </div>
            {bestStreak > 0 && (
              <div className="flex items-center gap-1">
                <span className="font-black text-orange-400">{bestStreak}</span>
                <span className="text-gray-600 text-[10px]">streak</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-white">{doneCount}<span className="text-gray-600 font-normal">/{totalCount}</span></span>
              <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/*  Tabs + content  */}
        <div className="flex flex-col flex-1 min-h-0">
        <div className="flex gap-2 mb-2 flex-wrap flex-shrink-0">
          {[
            { id: "quizzes", label: "Quizzes",        icon: BookOpen,      count: totalCount },
            { id: "qa",      label: "Ask Instructor", icon: MessageCircle, count: null, badge: hasUnread },
            { id: "group",   label: "Group Chat",     icon: Hash,          count: null },
          ].map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id); setActiveThread(null) }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-semibold border transition ${
                activeTab === t.id
                  ? t.id === "group" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : t.id === "qa"  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/30"
                  : "bg-gray-900 text-gray-500 border-gray-800 hover:text-white"
              }`}>
              <t.icon size={13} />
              {t.label}
              {t.count !== null && <span className={`text-xs font-black ${activeTab === t.id ? "" : "text-gray-700"}`}>{t.count}</span>}
              {t.badge && <span className="w-2 h-2 bg-cyan-400 rounded-full" />}
            </button>
          ))}
        </div>

        {/*  Quizzes tab  */}
        {activeTab === "quizzes" && (
          totalCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-800 p-14 text-center">
              <BookOpen size={32} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">No quizzes assigned yet.</p>
            </div>
          ) : (
            <div className="flex gap-3 min-h-0 flex-1">

              {/* ── Sidebar ── */}
              {subjects.length > 0 && (
                <div className="hidden sm:flex w-48 shrink-0 flex-col gap-px overflow-y-auto">
                  <button onClick={() => handleSubjectChange("all")}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition ${
                      activeSubject === "all" ? "bg-gray-800 text-white font-semibold" : "text-gray-500 hover:text-gray-300 hover:bg-gray-900"
                    }`}>
                    <span>All Subjects</span>
                    <span className={`text-[10px] font-bold tabular-nums ${
                      doneCount === totalCount && totalCount > 0 ? "text-emerald-400"
                      : doneCount > 0 ? "text-amber-400" : "text-gray-600"
                    }`}>{doneCount}/{totalCount}</span>
                  </button>
                  <div className="h-px bg-gray-800/60 my-1 mx-1" />
                  {subjects.map(cat => {
                    const { done, total } = subjectMap[cat]
                    const isActive = activeSubject === cat
                    return (
                      <button key={cat} onClick={() => handleSubjectChange(cat)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition ${
                          isActive ? "bg-gray-800 text-white font-semibold" : "text-gray-500 hover:text-gray-300 hover:bg-gray-900"
                        }`}>
                        <span className="truncate flex-1 text-left mr-2">{cat}</span>
                        <span className={`text-[10px] font-bold tabular-nums shrink-0 ${
                          done === total && total > 0 ? "text-emerald-400"
                          : done > 0 ? "text-amber-400" : "text-gray-600"
                        }`}>{done}/{total}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── Main content ── */}
              <div className="flex-1 min-w-0 flex flex-col min-h-0">

                {/* Mobile subject pills */}
                {subjects.length > 0 && (
                  <div className="sm:hidden flex items-center gap-1.5 flex-wrap mb-2 pb-2 border-b border-gray-800 flex-shrink-0">
                    <button onClick={() => handleSubjectChange("all")}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition font-medium ${activeSubject === "all" ? "bg-gray-700 text-white border-gray-600" : "bg-gray-900 text-gray-400 border-gray-800"}`}>
                      All
                    </button>
                    {subjects.map(cat => (
                      <button key={cat} onClick={() => handleSubjectChange(cat)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition ${activeSubject === cat ? "bg-purple-500/15 text-purple-400 border-purple-500/30" : "bg-gray-900 text-gray-400 border-gray-800"}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Filter bar ── */}
                <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                  {/* All / To Do / Done pills */}
                  <div className="flex gap-0.5 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
                    {[
                      { id: "all",  label: "All",   count: activeSubject === "all" ? totalCount : (subjectMap[activeSubject]?.total || 0) },
                      { id: "todo", label: "To Do", count: todoCnt },
                      { id: "done", label: "Done",  count: doneCnt },
                    ].map(f => (
                      <button key={f.id} onClick={() => { setQuizFilter(f.id); setVisibleCount(10) }}
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md transition ${
                          quizFilter === f.id
                            ? f.id === "done"  ? "bg-emerald-500/15 text-emerald-400"
                            : f.id === "todo"  ? "bg-amber-500/15 text-amber-400"
                            : "bg-gray-700 text-white"
                          : "text-gray-500 hover:text-gray-300"
                        }`}>
                        {f.label}
                        <span className={`tabular-nums text-[10px] font-black ${quizFilter === f.id ? "" : "text-gray-700"}`}>{f.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* Topic compact select — only when topics exist */}
                  {topics.length > 0 && (
                    <select value={activeTopic} onChange={e => { setActiveTopic(e.target.value); setVisibleCount(10) }}
                      className="bg-gray-900 border border-gray-800 text-[11px] text-gray-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/40 cursor-pointer max-w-[140px] truncate">
                      <option value="all">All Topics</option>
                      {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}

                  {/* Search — flex-1 takes remaining space */}
                  <div className="relative flex-1 min-w-0">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(10) }}
                      placeholder="Search quizzes…"
                      className="w-full bg-gray-900 border border-gray-800 text-white text-[11px] rounded-lg pl-7 pr-6 py-1.5 focus:outline-none focus:border-gray-600 placeholder-gray-700" />
                    {search && (
                      <button onClick={() => { setSearch(""); setVisibleCount(10) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
                        <X size={10} />
                      </button>
                    )}
                  </div>

                  {/* Clear — only when non-default filters active */}
                  {(quizFilter !== "todo" || activeTopic !== "all" || search) && (
                    <button onClick={() => { setQuizFilter("todo"); setSearch(""); setActiveTopic("all"); setVisibleCount(10) }}
                      className="shrink-0 text-[11px] text-gray-600 hover:text-rose-400 transition flex items-center gap-0.5">
                      <X size={10} /> Clear
                    </button>
                  )}
                </div>

                {/* ── Quiz list ── */}
                <div className="overflow-y-auto flex-1 min-h-0">
                  {visibleQuizzes.length === 0 ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-10 text-center">
                      <Search size={22} className="mx-auto text-gray-700 mb-2" />
                      <p className="text-gray-500 text-sm">No quizzes match.</p>
                      <button onClick={() => { setQuizFilter("todo"); setSearch(""); setActiveTopic("all"); setVisibleCount(10) }}
                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition">Clear filters</button>
                    </div>
                  ) : (() => {
                    // When "All" selected, split into pending + done groups for visual separation
                    const sliced = visibleQuizzes.slice(0, visibleCount)
                    const pending = quizFilter === "all" ? sliced.filter(q => !attemptedIds.has(q.id)) : (quizFilter === "todo" ? sliced : [])
                    const done    = quizFilter === "all" ? sliced.filter(q =>  attemptedIds.has(q.id)) : (quizFilter === "done" ? sliced : [])
                    const showGroups = quizFilter === "all" && (pending.length > 0 && done.length > 0)

                    const renderCard = (q) => {
                      const stats  = quizStats[q.id]
                      const isDone = !!stats
                      const pct    = stats?.best ?? null
                      return (
                        <div key={q.id}
                          onClick={() => navigate(`/quiz/${q.id}/detail${batch.id ? `?batchId=${batch.id}` : ''}`)}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-all border ${
                            isDone
                              ? "bg-gray-900/40 border-gray-800/60 hover:border-gray-700"
                              : "bg-gray-900 border-cyan-500/20 hover:border-cyan-500/40"
                          }`}
                          style={{ minHeight: 52 }}
                        >
                          {/* Score / pending indicator */}
                          {isDone ? (
                            <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 border font-black ${scoreCfg(pct)}`}>
                              <span className="text-xs leading-none">{pct}%</span>
                              {stats.count > 1 && <span className="text-[8px] opacity-50 mt-px">{stats.count}×</span>}
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-cyan-500/20 bg-cyan-500/5">
                              <span className="text-cyan-500/60 text-lg leading-none">›</span>
                            </div>
                          )}

                          {/* Title + meta row */}
                          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                            <p className={`text-xs font-semibold leading-none truncate ${isDone ? "text-gray-400" : "text-white"}`}>
                              {q.title}
                            </p>
                            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                              {q.category && <span className="text-[10px] text-gray-600 shrink-0">{q.category}</span>}
                              {q.topic && <>
                                <span className="text-gray-700 text-[10px] shrink-0">·</span>
                                <span className="text-[10px] text-indigo-400/80 truncate min-w-0">{q.topic}</span>
                              </>}
                              <span className="text-gray-700 text-[10px] shrink-0">·</span>
                              <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">{q.questionCount || 0}Q</span>
                              <span className="text-gray-700 text-[10px] shrink-0">·</span>
                              <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">{q.totalTime || 0}m</span>
                            </div>
                          </div>

                          {/* Action */}
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/quiz/${q.id}${batch.id ? `?batchId=${batch.id}` : ''}`) }}
                            className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg transition ${
                              isDone ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-cyan-500 hover:bg-cyan-400 text-gray-950"
                            }`}>
                            {isDone ? "Retry" : "Start →"}
                          </button>
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-1 pb-2">
                        {showGroups ? (
                          <>
                            {/* Pending group */}
                            {pending.length > 0 && (
                              <>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/60 px-1 pt-1 pb-0.5">
                                  Pending · {todoCnt}
                                </p>
                                <div className="space-y-1">
                                  {pending.map(renderCard)}
                                </div>
                              </>
                            )}
                            {/* Done group */}
                            {done.length > 0 && (
                              <>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60 px-1 pt-3 pb-0.5">
                                  Completed · {doneCnt}
                                </p>
                                <div className="space-y-1">
                                  {done.map(renderCard)}
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          sliced.map(renderCard)
                        )}

                        {/* Load More */}
                        {visibleCount < visibleQuizzes.length ? (
                          <button onClick={() => setVisibleCount(c => c + 10)}
                            className="w-full mt-2 py-2 rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-800 text-gray-500 hover:text-white text-[11px] font-semibold transition flex items-center justify-center gap-1.5">
                            Load more
                            <span className="text-gray-700 font-normal">({visibleQuizzes.length - visibleCount} left)</span>
                          </button>
                        ) : visibleQuizzes.length > 10 ? (
                          <p className="text-[10px] text-gray-700 text-center pt-2">All {visibleQuizzes.length} shown</p>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        )}

        {/*  Ask Instructor  */}
        {activeTab === "qa" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">
            <div className={`lg:col-span-2 flex flex-col gap-3 min-h-0 ${activeThread ? "hidden lg:flex" : "flex"}`}>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">New Question</p>
                <div className="flex gap-2">
                  <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && submitNewQuestion()}
                    placeholder="Ask your instructor anything..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500/40 focus:outline-none" />
                  <button onClick={submitNewQuestion} disabled={sendingNew || !newQuestion.trim()}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-3 py-2 rounded-xl text-sm transition">
                    <Send size={13} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {threads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
                    <MessageCircle size={24} className="mx-auto text-gray-700 mb-2" />
                    <p className="text-gray-600 text-xs">Ask your first question above!</p>
                  </div>
                ) : threads.map(t => {
                  const last   = t.messages?.[t.messages.length - 1]
                  const unread = !t.resolved && last?.fromRole === "admin"
                  return (
                    <button key={t.id} onClick={() => setActiveThread(t)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition hover:border-gray-700 ${
                        unread ? "border-cyan-500/20 bg-cyan-500/4" : "border-gray-800 bg-gray-900/50"
                      } ${activeThread?.id === t.id ? "ring-1 ring-cyan-500/30" : ""}`}>
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <MessageCircle size={13} className="text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-white text-xs font-semibold truncate flex-1">{t.subject}</p>
                          {unread && <span className="w-2 h-2 bg-cyan-400 rounded-full shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-600 truncate">{last?.text || ""}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${
                        t.resolved ? "bg-gray-800 text-gray-600" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {t.resolved ? "Closed" : "Open"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={`lg:col-span-3 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden min-h-0 ${activeThread ? "flex" : "hidden lg:flex"}`}>
              {activeThread ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
                    <button onClick={() => setActiveThread(null)} className="lg:hidden text-gray-500 hover:text-white"><ChevronLeft size={16} /></button>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{activeThread.subject}</p>
                      <p className="text-gray-600 text-xs">{activeThread.messages?.length || 0} messages</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      activeThread.resolved ? "bg-gray-800 text-gray-600 border-gray-700" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {activeThread.resolved ? "Resolved" : "Open"}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
                    {(activeThread.messages || []).map((msg, i) => (
                      <Bubble key={i} msg={msg} currentUserId={currentUser.uid} />
                    ))}
                    <div ref={threadBottomRef} />
                  </div>
                  {!activeThread.resolved ? (
                    <div className="px-4 py-3 border-t border-gray-800 shrink-0">
                      <div className="flex gap-2">
                        <input value={replyText} onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendReply()} placeholder="Reply..."
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500/40 focus:outline-none" />
                        <button onClick={sendReply} disabled={sendingReply || !replyText.trim()}
                          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-4 py-2 rounded-xl text-sm transition">
                          <Send size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-t border-gray-800 text-center shrink-0">
                      <p className="text-xs text-gray-600">This conversation has been resolved.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <MessageCircle size={32} className="text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">Select a conversation</p>
                  <p className="text-gray-700 text-xs mt-1">or ask a new question on the left</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/*  Group Chat  */}
        {activeTab === "group" && (
          <div className="flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden flex-1 min-h-0">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 shrink-0">
              <Hash size={14} className="text-emerald-400" />
              <p className="text-sm font-bold text-white">{batch.name}  -  Group Discussion</p>
              <span className="text-xs text-gray-600 ml-auto">{groupMsgs.length} messages</span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              {groupMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Hash size={28} className="text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">No messages yet.</p>
                </div>
              ) : groupMsgs.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.from === currentUser.uid ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 mt-1 ${
                    msg.fromRole === "admin" ? "bg-cyan-500/15 border border-cyan-500/25 text-cyan-400" : "bg-purple-500/15 border border-purple-500/25 text-purple-400"
                  }`}>
                    {msg.fromName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className={`flex flex-col max-w-[65%] ${msg.from === currentUser.uid ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold ${msg.fromRole === "admin" ? "text-cyan-500" : msg.from === currentUser.uid ? "text-purple-400" : "text-gray-400"}`}>
                        {msg.fromRole === "admin" ? "Instructor" : msg.from === currentUser.uid ? "You" : msg.fromName}
                      </span>
                      <span className="text-[10px] text-gray-700">
                        {new Date(msg.sentAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.fromRole === "admin" ? "bg-cyan-500/10 border border-cyan-500/20 text-gray-100 rounded-tr-sm"
                      : msg.from === currentUser.uid ? "bg-purple-500/10 border border-purple-500/20 text-gray-100 rounded-tr-sm"
                      : "bg-gray-800 border border-gray-700/50 text-gray-200 rounded-tl-sm"
                    }`}>
                      {msg.text}
                      {/* Show sending indicator for optimistic messages */}
                      {msg.id?.startsWith("temp_") && (
                        <span className="ml-2 text-[10px] opacity-50">sending...</span>
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
                  placeholder="Message the group..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-500/40 focus:outline-none" />
                <button onClick={sendGroupMsg} disabled={sendingGroup || !groupText.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition">
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
        </div>{/* end tabs+content wrapper */}

      </div>
    </div>
  )
}

//  Main Batches Page 
export default function Batches() {
  const { currentUser, userProfile } = useAuth()
  const navigate = useNavigate()

  const [myBatches, setMyBatches]               = useState([])
  const [availableBatches, setAvailableBatches] = useState([])
  const [myAttempts, setMyAttempts]             = useState([])
  const [loading, setLoading]                   = useState(true)
  const [selectedBatch, setSelectedBatch]       = useState(null)
  const [mounted, setMounted]                   = useState(false)

  const currentUserName = userProfile?.name || userProfile?.email || currentUser?.email || "Student"

  useEffect(() => {
    async function load() {
      try {
        const userBatchIds = userProfile?.batchIds || []
        const now2 = new Date()

        //  Step 1: 3 parallel fetches, all cached 
        // allBatchStubs   -  all batch docs (tiny, ~200B each). Cached 5 min.
        //                  Needed for "available to join" listing.
        //                  Key: "allBatches"  -  shared across users, safe because
        //                  batch metadata (name, description) changes rarely.
        // allQuizzes      -  already cached globally (quizSets, 2 min LS)
        // myAttempts      -  per-user, 60s memory cache
        const [allBatchStubs, allQuizzes, aSnap] = await Promise.all([
          cachedGetDocs(
            "allBatches",
            collection(db, "batches"),
            { ttl: TTL_LONG, revalidate: true }
          ),
          cachedGetDocs("quizSets", collection(db, "quizSets"), { ttl: TTL_SHORT }),
          cachedGetDocs("myAttempts:" + currentUser.uid,
            query(collection(db, "quizAttempts"), where("userId", "==", currentUser.uid)),
            { ttl: TTL_SHORT }
          ),
        ])
        setMyAttempts(aSnap)

        const publishedQuizzes = allQuizzes.filter(q => {
          if (q.status === "published") return true
          if (q.status === "scheduled" && q.publishAt && new Date(q.publishAt) <= now2) return true
          return false
        })

        //  Step 2: batchQuizzes  -  only for the user's own batches 
        // Was: N getDocs(batchQuizzes where batchId==X) for EVERY batch.
        // Now: 1 filtered query covering only userBatchIds, cached 60s.
        // Users with no batches skip this entirely (0 reads).
        let myBatchQuizDocs = []
        let myBatchDocs     = []

        if (userBatchIds.length > 0) {
          const CHUNK = 30
          const chunks = []
          for (let i = 0; i < userBatchIds.length; i += CHUNK) {
            chunks.push(userBatchIds.slice(i, i + CHUNK))
          }

          // Stable cache key based on sorted batchIds  -  misses correctly when
          // membership changes (batchIds array updated via writeBatch on add/remove)
          const batchKey = `batches:${[...userBatchIds].sort().join(",")}`
          const bqKey    = `batchQuiz:${[...userBatchIds].sort().join(",")}`

          const [fetchedBatchDocs, fetchedBatchQuizDocs] = await Promise.all([
            // Fetch only user's batch docs  -  not all batches (allBatchStubs covers that)
            cachedGetDocs(
              batchKey,
              query(collection(db, "batches"), where("__name__", "in", userBatchIds.slice(0, 30))),
              { ttl: TTL_SHORT, revalidate: true }
            ),
            // Fetch batchQuizzes for user's batches only
            cachedGetDocs(
              bqKey,
              query(collection(db, "batchQuizzes"), where("batchId", "in", userBatchIds.slice(0, 30))),
              { ttl: TTL_SHORT, revalidate: true }
            ),
          ])
          myBatchDocs     = fetchedBatchDocs
          myBatchQuizDocs = fetchedBatchQuizDocs
        }

        //  Step 3: Build joined batches (user's batches with full quiz data) 
        const joined = myBatchDocs
          .filter(batch => {
            // Double-check membership via batch.memberIds (Fix 6)
            const memberIds = batch.memberIds || []
            return memberIds.includes(currentUser.uid) || userBatchIds.includes(batch.id)
          })
          .map(batch => {
            const batchQuizDocs = myBatchQuizDocs
              .filter(bq => bq.batchId === batch.id)
            const quizzes = batchQuizDocs
              .map(bq => {
                const quiz = publishedQuizzes.find(q => q.id === bq.quizId)
                if (!quiz) return null
                return { ...quiz, _bqOrder: bq.order ?? 9999 }
              })
              .filter(Boolean)
              .sort((a, b) => a._bqOrder - b._bqOrder)
            return { ...batch, quizzes: Array.isArray(quizzes) ? quizzes : [] }
          })

        //  Step 4: Available batches  -  from the cached stubs 
        // allBatchStubs has all batches; filter out the user's own.
        // No batchQuizzes needed for listing  -  the "join" card only shows
        // batch name, description, and member count (all on the batch doc).
        const available = allBatchStubs.filter(b => !userBatchIds.includes(b.id))

        setMyBatches(joined)
        setAvailableBatches(available)
      } catch (e) { console.error("Batches load error:", e) }
      setLoading(false)
      setTimeout(() => setMounted(true), 40)
    }
    load()
  }, [currentUser, userProfile])

  if (selectedBatch) {
    if (selectedBatch.joined) {
      return (
        <JoinedBatchDetail
          batch={selectedBatch.batch}
          myAttempts={myAttempts}
          currentUser={currentUser}
          currentUserName={currentUserName}
          onBack={() => setSelectedBatch(null)}
        />
      )
    }
    return <BatchLanding batch={selectedBatch.batch} onBack={() => setSelectedBatch(null)} />
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-6" style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.3s ease" }}>
          <h1 className="text-2xl font-black text-white tracking-tight">Batches</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your enrolled batches and available programs</p>
        </div>
        {myBatches.length > 0 && (
          <section className="mb-8" style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.35s ease 0.05s" }}>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={14} className="text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Enrolled</h2>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">{myBatches.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {myBatches.map((batch, idx) => {
                const att      = new Set(myAttempts.map(a => a.quizId))
                const batchSafeQuizzes = Array.isArray(batch.quizzes) ? batch.quizzes : []
                const done     = batchSafeQuizzes.filter(q => att.has(q.id)).length
                const total    = batchSafeQuizzes.length
                const progress = total > 0 ? Math.round((done / total) * 100) : 0
                return (
                  <div key={batch.id} onClick={() => setSelectedBatch({ batch, joined: true })}
                    className="group bg-gray-900 border border-gray-800 hover:border-purple-500/40 rounded-2xl p-5 cursor-pointer transition-all duration-200"
                    style={{ opacity: mounted ? 1 : 0, transition: `opacity 0.3s ease ${idx * 0.06}s` }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <GraduationCap size={18} className="text-purple-400" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Enrolled</span>
                    </div>
                    <h3 className="text-white font-bold text-sm mb-1 truncate group-hover:text-purple-300 transition-colors">{batch.name}</h3>
                    {batch.description && <p className="text-gray-500 text-xs mb-3 line-clamp-2">{batch.description}</p>}
                    <div className="mt-auto pt-3 border-t border-gray-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-600">{done}/{total} quizzes done</span>
                        <span className="text-xs font-bold text-purple-400">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: mounted ? `${progress}%` : "0%" }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
        {availableBatches.length > 0 && (
          <section style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.35s ease 0.1s" }}>
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-amber-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Available Programs</h2>
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">{availableBatches.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {availableBatches.map((batch, idx) => (
                <div key={batch.id} onClick={() => setSelectedBatch({ batch, joined: false })}
                  className="group bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-2xl p-5 cursor-pointer transition-all duration-200 relative overflow-hidden"
                  style={{ opacity: mounted ? 1 : 0, transition: `opacity 0.3s ease ${idx * 0.06}s` }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/3 to-transparent pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <GraduationCap size={18} className="text-amber-400" />
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500/80 bg-amber-500/8 border border-amber-500/15 px-2 py-0.5 rounded-full">
                        <Lock size={8} /> Enroll to Access
                      </div>
                    </div>
                    <h3 className="text-white font-bold text-sm mb-1 truncate group-hover:text-amber-300 transition-colors">{batch.name}</h3>
                    {batch.description && <p className="text-gray-500 text-xs mb-3 line-clamp-2">{batch.description}</p>}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                      <span className="text-xs text-gray-600">{(Array.isArray(batch.quizzes) ? batch.quizzes : []).length} quiz{(Array.isArray(batch.quizzes) ? batch.quizzes : []).length !== 1 ? "zes" : ""}</span>
                      <span className="text-xs text-amber-400 flex items-center gap-1 group-hover:gap-1.5 transition-all">View details <ChevronRight size={11} /></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {myBatches.length === 0 && availableBatches.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-800 p-16 text-center">
            <GraduationCap size={40} className="mx-auto text-gray-700 mb-4" />
            <p className="text-gray-400 font-semibold">No batches available yet</p>
            <p className="text-gray-600 text-sm mt-1">Check back soon or contact your instructor.</p>
          </div>
        )}
      </div>
    </div>
  )
}
