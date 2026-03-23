import { useEffect, useState, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { db } from "../../firebase/config"
import {
  collection, getDocs, doc, updateDoc,
  query, where, orderBy, limit, startAfter,
  getCountFromServer, writeBatch, arrayUnion, arrayRemove
} from "firebase/firestore"
import AdminLayout from "../../components/AdminLayout"
import { Shield, Ban, Search, Eye, GraduationCap, Plus, X,
         ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown,
         Users, Activity, BookOpen } from "lucide-react"
import toast from "react-hot-toast"

const PAGE_SIZE = 20

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })
}
function daysAgo(d) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}
function isToday(d)     { return daysAgo(d) === 0 }
function isThisWeek(d)  { const n = daysAgo(d); return n !== null && n <= 6 }
function isThisMonth(d) { const n = daysAgo(d); return n !== null && n <= 29 }

function Avatar({ name, size = "md" }) {
  const letter = name?.charAt(0)?.toUpperCase() || "?"
  const colors = [
    ["#06b6d4","#0e7490"], ["#818cf8","#4338ca"], ["#34d399","#059669"],
    ["#fb923c","#ea580c"], ["#f472b6","#db2777"], ["#a78bfa","#7c3aed"],
  ]
  const idx = (name?.charCodeAt(0) || 0) % colors.length
  const [light, dark] = colors[idx]
  const sz = size === "lg" ? "w-11 h-11 text-sm" : "w-9 h-9 text-xs"
  return (
    <div className={`${sz} rounded-xl flex items-center justify-center shrink-0 font-black`}
      style={{ background: `linear-gradient(135deg, ${light}22, ${dark}33)`, border: `1px solid ${light}33`, color: light }}>
      {letter}
    </div>
  )
}

function ActivityDot({ lastActive }) {
  const d = daysAgo(lastActive)
  if (d === null) return <span className="w-2 h-2 rounded-full bg-gray-700 shrink-0" title="Never active" />
  if (d === 0)    return <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.6)]" title="Active today" />
  if (d <= 7)     return <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" title={`Active ${d}d ago`} />
  if (d <= 14)    return <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title={`Active ${d}d ago`} />
  return              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" title={`Active ${d}d ago`} />
}

function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)
  const active = value !== ""
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap ${
          active
            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
            : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700"
        }`}>
        {selected?.label || label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`}/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-gray-950 border border-gray-700/80 rounded-xl shadow-2xl z-30 min-w-[170px] overflow-hidden py-1">
            {options.map(o => (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full text-left px-3.5 py-2 text-xs transition flex items-center justify-between gap-3 ${
                  o.value === value
                    ? "bg-cyan-500/10 text-cyan-300 font-semibold"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}>
                <span>{o.label}</span>
                {o.value === value && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function UserManager() {
  const navigate = useNavigate()

  const [allUsers,       setAllUsers]       = useState([])
  const [totalCount,     setTotalCount]     = useState(0)
  const [lastDoc,        setLastDoc]        = useState(null)
  const [hasMore,        setHasMore]        = useState(false)
  const [allBatches,     setAllBatches]     = useState([])
  const [userBatches,    setUserBatches]    = useState({})
  const [lastActiveMap,  setLastActiveMap]  = useState({})
  const [attemptMap,     setAttemptMap]     = useState({})

  const [loading,        setLoading]        = useState(true)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [searchInput,    setSearchInput]    = useState("")
  const [search,         setSearch]         = useState("")
  const [filterStatus,   setFilterStatus]   = useState("")
  const [filterBatch,    setFilterBatch]    = useState("")
  const [filterActivity, setFilterActivity] = useState("")
  const [filterJoined,   setFilterJoined]   = useState("")
  const [sort,           setSort]           = useState({ col: "joined", dir: "desc" })
  const [page,           setPage]           = useState(1)
  const [expandedUser,   setExpandedUser]   = useState(null)
  const [addingBatch,    setAddingBatch]    = useState(null)
  const [selectedBatch,  setSelectedBatch]  = useState("")
  const [savingBatch,    setSavingBatch]    = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.toLowerCase().trim()); setPage(1) }, 200)
    return () => clearTimeout(t)
  }, [searchInput])

  async function loadInitial() {
    setLoading(true)
    try {
      const [countSnap, bSnap, usersSnap, attSnap] = await Promise.all([
        getCountFromServer(collection(db, "users")),
        getDocs(collection(db, "batches")),
        getDocs(query(collection(db, "users"), orderBy("joinDate", "desc"), limit(PAGE_SIZE))),
        getDocs(query(collection(db, "quizAttempts"), orderBy("date", "desc"))),
      ])
      setTotalCount(countSnap.data().count)
      const batches = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAllBatches(batches)
      const userData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAllUsers(userData)
      setLastDoc(usersSnap.docs[usersSnap.docs.length - 1] || null)
      setHasMore(usersSnap.docs.length === PAGE_SIZE)
      const laMap = {}, atMap = {}
      attSnap.docs.forEach(d => {
        const { userId, date } = d.data()
        if (!userId) return
        atMap[userId] = (atMap[userId] || 0) + 1
        if (!laMap[userId] || date > laMap[userId]) laMap[userId] = date
      })
      setLastActiveMap(laMap)
      setAttemptMap(atMap)
      const memberships = {}
      await Promise.all(batches.map(async batch => {
        try {
          const mSnap = await getDocs(collection(db, "batches", batch.id, "members"))
          mSnap.docs.forEach(m => {
            const uid = m.id
            if (!memberships[uid]) memberships[uid] = []
            if (!memberships[uid].find(b => b.batchId === batch.id))
              memberships[uid].push({ batchId: batch.id, name: batch.name })
          })
        } catch {}
      }))
      setUserBatches(memberships)
    } catch (e) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { loadInitial() }, [])

  async function loadMore() {
    if (!lastDoc || loadingMore) return
    setLoadingMore(true)
    try {
      const snap = await getDocs(query(collection(db, "users"), orderBy("joinDate","desc"), startAfter(lastDoc), limit(PAGE_SIZE)))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAllUsers(prev => [...prev, ...data])
      setLastDoc(snap.docs[snap.docs.length - 1] || null)
      setHasMore(snap.docs.length === PAGE_SIZE)
      const memberships = { ...userBatches }
      await Promise.all(allBatches.map(async batch => {
        try {
          const mSnap = await getDocs(collection(db, "batches", batch.id, "members"))
          mSnap.docs.forEach(m => {
            const uid = m.id
            if (!memberships[uid]) memberships[uid] = []
            if (!memberships[uid].find(b => b.batchId === batch.id))
              memberships[uid].push({ batchId: batch.id, name: batch.name })
          })
        } catch {}
      }))
      setUserBatches(memberships)
    } catch (e) { console.error(e) }
    setLoadingMore(false)
  }

  const filtered = useMemo(() => {
    let list = allUsers
    if (search) list = list.filter(u => u.name?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search))
    if (filterStatus === "active") list = list.filter(u => !u.banned)
    if (filterStatus === "banned") list = list.filter(u => u.banned)
    if (filterBatch === "none")    list = list.filter(u => !(userBatches[u.id]?.length))
    else if (filterBatch)          list = list.filter(u => userBatches[u.id]?.some(b => b.batchId === filterBatch))
    if (filterActivity === "never")  list = list.filter(u => !lastActiveMap[u.id])
    if (filterActivity === "today")  list = list.filter(u => isToday(lastActiveMap[u.id]))
    if (filterActivity === "silent") list = list.filter(u => { const d = daysAgo(lastActiveMap[u.id]); return d !== null && d >= 14 })
    if (filterJoined === "today")  list = list.filter(u => isToday(u.joinDate))
    if (filterJoined === "week")   list = list.filter(u => isThisWeek(u.joinDate))
    if (filterJoined === "month")  list = list.filter(u => isThisMonth(u.joinDate))
    list = [...list].sort((a, b) => {
      let av, bv
      if (sort.col === "name")       { av = a.name?.toLowerCase() || ""; bv = b.name?.toLowerCase() || "" }
      if (sort.col === "joined")     { av = a.joinDate || ""; bv = b.joinDate || "" }
      if (sort.col === "lastActive") { av = lastActiveMap[a.id] || ""; bv = lastActiveMap[b.id] || "" }
      if (sort.col === "attempts")   { av = attemptMap[a.id] || 0; bv = attemptMap[b.id] || 0 }
      if (av < bv) return sort.dir === "asc" ? -1 : 1
      if (av > bv) return sort.dir === "asc" ?  1 : -1
      return 0
    })
    return list
  }, [allUsers, search, filterStatus, filterBatch, filterActivity, filterJoined, sort, userBatches, lastActiveMap, attemptMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" })
    setPage(1)
  }

  useEffect(() => { setPage(1) }, [search, filterStatus, filterBatch, filterActivity, filterJoined])

  const statsBar = useMemo(() => {
    const todayJoined    = allUsers.filter(u => isToday(u.joinDate)).length
    const inBatch        = allUsers.filter(u => (userBatches[u.id]?.length || 0) > 0).length
    const neverAttempted = allUsers.filter(u => !lastActiveMap[u.id]).length
    return [
      { label: "Total Users",      val: totalCount,     icon: Users,     color: "text-cyan-400",   border: "border-cyan-500/20",   bg: "bg-cyan-500/6",   filter: null },
      { label: "Joined Today",     val: todayJoined,    icon: Plus,      color: "text-emerald-400",border: "border-emerald-500/20",bg: "bg-emerald-500/6",filter: () => { setFilterJoined("today"); setPage(1) } },
      { label: "In a Batch",       val: inBatch,        icon: GraduationCap, color: "text-violet-400", border: "border-violet-500/20", bg: "bg-violet-500/6", filter: null },
      { label: "Never Attempted",  val: neverAttempted, icon: BookOpen,  color: "text-amber-400",  border: "border-amber-500/20",  bg: "bg-amber-500/6",  filter: () => { setFilterActivity("never"); setPage(1) } },
    ]
  }, [allUsers, userBatches, lastActiveMap, totalCount])

  async function toggleBan(user) {
    const newBanned = !user.banned
    try {
      await updateDoc(doc(db, "users", user.id), { banned: newBanned })
      toast.success(newBanned ? `${user.name} banned` : `${user.name} unbanned`)
      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, banned: newBanned } : u))
    } catch { toast.error("Failed") }
  }

  async function toggleRole(user) {
    const newRole = user.role === "admin" ? "user" : "admin"
    if (!window.confirm(`${newRole === "admin" ? "Promote" : "Demote"} ${user.name} to ${newRole}?`)) return
    try {
      await updateDoc(doc(db, "users", user.id), { role: newRole })
      toast.success(`${user.name} is now ${newRole}`)
      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } catch { toast.error("Failed") }
  }

  async function addUserToBatch(userId, userName) {
    if (!selectedBatch) return toast.error("Select a batch")
    if ((userBatches[userId] || []).find(b => b.batchId === selectedBatch)) return toast.error("Already in this batch")
    setSavingBatch(true)
    try {
      const wb = writeBatch(db)
      wb.set(doc(db, "batches", selectedBatch, "members", userId), { userId, joinedAt: new Date().toISOString() })
      wb.update(doc(db, "batches", selectedBatch), { memberIds: arrayUnion(userId) })
      wb.update(doc(db, "users", userId), { batchIds: arrayUnion(selectedBatch) })
      await wb.commit()
      const batch = allBatches.find(b => b.id === selectedBatch)
      toast.success(`${userName} added to batch!`)
      setUserBatches(prev => ({ ...prev, [userId]: [...(prev[userId] || []), { batchId: selectedBatch, name: batch?.name || "Batch" }] }))
      setAddingBatch(null); setSelectedBatch("")
    } catch { toast.error("Failed") }
    setSavingBatch(false)
  }

  async function removeUserFromBatch(userId, userName, batchId, batchName) {
    if (!window.confirm(`Remove ${userName} from "${batchName}"?`)) return
    try {
      const wb = writeBatch(db)
      wb.delete(doc(db, "batches", batchId, "members", userId))
      wb.update(doc(db, "batches", batchId), { memberIds: arrayRemove(userId) })
      wb.update(doc(db, "users", userId), { batchIds: arrayRemove(batchId) })
      await wb.commit()
      toast.success(`Removed from ${batchName}`)
      setUserBatches(prev => ({ ...prev, [userId]: (prev[userId] || []).filter(b => b.batchId !== batchId) }))
    } catch { toast.error("Failed") }
  }

  const hasActiveFilters = search || filterStatus || filterBatch || filterActivity || filterJoined
  function clearFilters() { setSearchInput(""); setFilterStatus(""); setFilterBatch(""); setFilterActivity(""); setFilterJoined(""); setPage(1) }

  function SortBtn({ col, label }) {
    const active = sort.col === col
    return (
      <button onClick={() => handleSort(col)}
        className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition select-none ${
          active ? "text-cyan-400" : "text-gray-600 hover:text-gray-400"
        }`}>
        {label}
        {active ? (sort.dir === "asc" ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={9} className="opacity-50"/>}
      </button>
    )
  }

  return (
    <AdminLayout>
      <div className="p-7 max-w-7xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">User Manager</h2>
            <p className="text-gray-500 text-sm mt-0.5">{totalCount} registered users</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {statsBar.map(s => {
            const Icon = s.icon
            return (
              <button key={s.label}
                onClick={s.filter || undefined}
                className={`rounded-2xl border px-5 py-4 text-left transition group ${s.border} ${s.bg} ${
                  s.filter ? "hover:brightness-110 cursor-pointer" : "cursor-default"
                }`}>
                <div className="flex items-center justify-between mb-3">
                  <Icon size={14} className={`${s.color} opacity-70`} />
                  {s.filter && <span className="text-[10px] text-gray-700 group-hover:text-gray-500 transition">click to filter →</span>}
                </div>
                <p className={`text-2xl font-black leading-none ${s.color}`}>{loading ? "—" : s.val}</p>
                <p className="text-[11px] text-gray-500 mt-1 font-medium">{s.label}</p>
              </button>
            )
          })}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full bg-gray-900 text-white rounded-xl pl-9 pr-4 py-2 text-sm border border-gray-800 focus:border-cyan-500/40 focus:outline-none placeholder-gray-700"/>
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                <X size={12}/>
              </button>
            )}
          </div>

          <FilterDropdown label="Status" value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1) }} options={[
            { value: "",       label: "All status" },
            { value: "active", label: "Active" },
            { value: "banned", label: "Banned" },
          ]}/>

          <FilterDropdown label="Batch" value={filterBatch} onChange={v => { setFilterBatch(v); setPage(1) }} options={[
            { value: "",     label: "All batches" },
            { value: "none", label: "No batch" },
            ...allBatches.map(b => ({ value: b.id, label: b.name })),
          ]}/>

          <FilterDropdown label="Activity" value={filterActivity} onChange={v => { setFilterActivity(v); setPage(1) }} options={[
            { value: "",       label: "All activity" },
            { value: "never",  label: "Never attempted" },
            { value: "today",  label: "Active today" },
            { value: "silent", label: "Gone silent (14d+)" },
          ]}/>

          <FilterDropdown label="Joined" value={filterJoined} onChange={v => { setFilterJoined(v); setPage(1) }} options={[
            { value: "",      label: "Any time" },
            { value: "today", label: "Today" },
            { value: "week",  label: "This week" },
            { value: "month", label: "This month" },
          ]}/>

          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-white border border-gray-800 hover:border-gray-600 px-3 py-2 rounded-xl transition flex items-center gap-1.5">
              <X size={11}/> Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-600">Sort:</span>
            <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
              <SortBtn col="name"       label="Name" />
              <div className="w-px h-3 bg-gray-800"/>
              <SortBtn col="joined"     label="Joined" />
              <div className="w-px h-3 bg-gray-800"/>
              <SortBtn col="lastActive" label="Active" />
              <div className="w-px h-3 bg-gray-800"/>
              <SortBtn col="attempts"   label="Attempts" />
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <p className="text-xs text-gray-600 mb-4">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} of {allUsers.length} loaded
          </p>
        )}

        {/* User list */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-20 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse"/>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
            <Users size={28} className="mx-auto text-gray-700 mb-3"/>
            <p className="text-gray-500 text-sm">No users match the current filters</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {paginated.map(user => {
              const batches   = userBatches[user.id] || []
              const isExp     = expandedUser === user.id
              const isAdding  = addingBatch === user.id
              const notIn     = allBatches.filter(b => !batches.find(ub => ub.batchId === b.id))
              const lastA     = lastActiveMap[user.id]
              const attCount  = attemptMap[user.id] || 0
              const dAgo      = daysAgo(lastA)
              const lastAStr  = lastA ? (dAgo === 0 ? "Today" : dAgo === 1 ? "Yesterday" : `${dAgo}d ago`) : "Never"
              const lastAColor= !lastA ? "text-gray-700" : dAgo === 0 ? "text-emerald-400" : dAgo <= 7 ? "text-gray-300" : dAgo <= 14 ? "text-amber-400" : "text-rose-400"

              return (
                <div key={user.id}
                  className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden transition hover:border-gray-700">

                  {/* Main row */}
                  <div className="flex items-center gap-4 px-4 py-3.5">

                    {/* Avatar + activity dot */}
                    <div className="relative shrink-0">
                      <Avatar name={user.name} />
                      <ActivityDot lastActive={lastA} />
                      <span className="absolute -bottom-0.5 -right-0.5" />
                    </div>

                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm truncate">{user.name || "—"}</span>
                        {/* Role badge */}
                        {user.role === "admin" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25 shrink-0">
                            Admin
                          </span>
                        )}
                        {/* Status badge */}
                        {user.banned && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
                            Banned
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs truncate mt-0.5">{user.email}</p>
                    </div>

                    {/* Stats group */}
                    <div className="hidden lg:flex items-center gap-6 shrink-0">

                      {/* Batches */}
                      <div className="text-center min-w-[80px]">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {batches.length === 0
                            ? <span className="text-[11px] text-gray-700">No batch</span>
                            : batches.slice(0, 2).map(b => (
                                <span key={b.batchId}
                                  className="text-[10px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                                  {b.name}
                                </span>
                              ))
                          }
                          {batches.length > 2 && (
                            <span className="text-[10px] text-gray-600">+{batches.length - 2}</span>
                          )}
                        </div>
                      </div>

                      <div className="w-px h-8 bg-gray-800 shrink-0" />

                      {/* Last active */}
                      <div className="text-center min-w-[72px]">
                        <p className={`text-xs font-semibold ${lastAColor}`}>{lastAStr}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">Last active</p>
                      </div>

                      <div className="w-px h-8 bg-gray-800 shrink-0" />

                      {/* Attempts */}
                      <div className="text-center min-w-[52px]">
                        <p className={`text-sm font-black ${attCount > 0 ? "text-white" : "text-gray-700"}`}>
                          {attCount > 0 ? attCount : "—"}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-0.5">Attempts</p>
                      </div>

                      <div className="w-px h-8 bg-gray-800 shrink-0" />

                      {/* Joined */}
                      <div className="text-center min-w-[80px]">
                        <p className="text-xs text-gray-400 font-medium">{fmtDate(user.joinDate) || "—"}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">Joined</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => navigate(`/admin/users/${user.id}`)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-cyan-400 px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition"
                        title="View history">
                        <Eye size={12}/> <span className="hidden sm:inline">History</span>
                      </button>
                      <button onClick={() => toggleRole(user)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-purple-400 px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition"
                        title={user.role === "admin" ? "Demote to User" : "Promote to Admin"}>
                        <Shield size={12}/> <span className="hidden sm:inline">{user.role === "admin" ? "Demote" : "Promote"}</span>
                      </button>
                      <button onClick={() => toggleBan(user)}
                        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition ${
                          user.banned
                            ? "text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/8"
                            : "text-gray-500 hover:text-rose-400 hover:bg-rose-500/8"
                        }`}
                        title={user.banned ? "Unban" : "Ban"}>
                        <Ban size={12}/> <span className="hidden sm:inline">{user.banned ? "Unban" : "Ban"}</span>
                      </button>
                      <button
                        onClick={() => { setExpandedUser(isExp ? null : user.id); setAddingBatch(null); setSelectedBatch("") }}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition">
                        <GraduationCap size={12}/> <span className="hidden sm:inline">Batches</span>
                        {isExp ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                      </button>
                    </div>
                  </div>

                  {/* Expanded batch panel */}
                  {isExp && (
                    <div className="border-t border-gray-800 bg-gray-800/30 px-5 py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mr-1 shrink-0">Batches</p>

                        {batches.length === 0 && (
                          <span className="text-xs text-gray-600">Not enrolled in any batch</span>
                        )}

                        {batches.map(b => (
                          <div key={b.batchId}
                            className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs px-2.5 py-1 rounded-full">
                            <GraduationCap size={10}/>
                            {b.name}
                            <button onClick={() => removeUserFromBatch(user.id, user.name, b.batchId, b.name)}
                              className="text-violet-600 hover:text-rose-400 transition ml-0.5">
                              <X size={10}/>
                            </button>
                          </div>
                        ))}

                        {notIn.length > 0 && (
                          isAdding ? (
                            <div className="flex items-center gap-2">
                              <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-500/50">
                                <option value="">— Select batch —</option>
                                {notIn.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                              <button onClick={() => addUserToBatch(user.id, user.name)}
                                disabled={savingBatch || !selectedBatch}
                                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-3 py-1.5 rounded-lg text-xs transition">
                                {savingBatch ? "Adding…" : "Add"}
                              </button>
                              <button onClick={() => { setAddingBatch(null); setSelectedBatch("") }}
                                className="text-gray-500 hover:text-white text-xs px-2 py-1.5 transition">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => { setAddingBatch(user.id); setSelectedBatch("") }}
                              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 bg-cyan-500/6 px-2.5 py-1 rounded-lg transition">
                              <Plus size={11}/> Enroll in batch
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer — pagination + load more */}
        {!loading && (
          <div className="flex items-center justify-between mt-5 px-1">
            <p className="text-xs text-gray-600">
              {filtered.length} user{filtered.length !== 1 ? "s" : ""}
              {hasActiveFilters ? " match filters" : " loaded"}
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </p>
            <div className="flex items-center gap-2">
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 transition">
                    Prev
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p = totalPages <= 5 ? i+1 : page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold border transition ${
                          p === page
                            ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                            : "text-gray-500 hover:text-white border-gray-800 hover:border-gray-600"
                        }`}>
                        {p}
                      </button>
                    )
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 transition">
                    Next
                  </button>
                </div>
              )}
              {hasMore && !hasActiveFilters && (
                <button onClick={loadMore} disabled={loadingMore}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-xl transition disabled:opacity-40">
                  {loadingMore
                    ? <><div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/> Loading…</>
                    : <>Load more · {totalCount - allUsers.length} remaining</>
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}