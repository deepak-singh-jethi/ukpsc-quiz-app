import { useEffect, useState } from "react"
import { db } from "../../firebase/config"
import { collection, addDoc, updateDoc, deleteDoc, doc, orderBy, query } from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import { Plus, Trash2, Eye, EyeOff, Megaphone, Pin, Clock, ChevronDown, X, Zap } from "lucide-react"
import toast from "react-hot-toast"

// ── Types ──────────────────────────────────────────────────────────────────
const TYPES = {
  info:    { label: "Info",    emoji: "ℹ️",  bg: "bg-cyan-500/10",   border: "border-cyan-500/25",   text: "text-cyan-300",   dot: "bg-cyan-400" },
  success: { label: "Success", emoji: "✅",  bg: "bg-emerald-500/10",border: "border-emerald-500/25",text: "text-emerald-300",dot: "bg-emerald-400" },
  warning: { label: "Warning", emoji: "⚠️",  bg: "bg-amber-500/10",  border: "border-amber-500/25",  text: "text-amber-300",  dot: "bg-amber-400" },
  urgent:  { label: "Urgent",  emoji: "🚨",  bg: "bg-rose-500/10",   border: "border-rose-500/25",   text: "text-rose-300",   dot: "bg-rose-400" },
}

// ── Predefined templates ───────────────────────────────────────────────────
const TEMPLATES = [
  {
    label: "New Quiz Live",
    icon: "🎯",
    type: "success",
    pinned: false,
    message: "🎯 New quiz is now live! Check it out on your dashboard and test your preparation.",
  },
  {
    label: "Exam Alert",
    icon: "📅",
    type: "urgent",
    pinned: true,
    message: "📅 Important: Exam dates announced. Check the schedule and plan your preparation accordingly.",
  },
  {
    label: "Results Out",
    icon: "🏆",
    type: "success",
    pinned: false,
    message: "🏆 Results are out! Check the leaderboard to see your rank and performance.",
  },
  {
    label: "Maintenance",
    icon: "🔧",
    type: "warning",
    pinned: true,
    message: "🔧 Scheduled maintenance on [DATE] from [TIME]. The platform will be temporarily unavailable.",
  },
  {
    label: "Motivational",
    icon: "💪",
    type: "info",
    pinned: false,
    message: "💪 Keep going! Consistency is the key to success. Attempt at least one quiz today.",
  },
  {
    label: "New Batch Open",
    icon: "🎓",
    type: "info",
    pinned: false,
    message: "🎓 New batch enrollment is now open! Contact us to join and access exclusive content.",
  },
  {
    label: "Holiday Break",
    icon: "🎉",
    type: "info",
    pinned: false,
    message: "🎉 Platform will be on holiday from [DATE] to [DATE]. New content drops after the break!",
  },
  {
    label: "Tip of the Day",
    icon: "💡",
    type: "info",
    pinned: false,
    message: "💡 Study tip: Revise previously attempted quizzes before moving to new topics for better retention.",
  },
]

// ── Preview card (mirrors user Dashboard render) ───────────────────────────
function PreviewCard({ form }) {
  const t = TYPES[form.type] || TYPES.info
  if (!form.message.trim()) return null
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Preview — as seen by students</p>
      <div className={`rounded-2xl border ${t.bg} ${t.border} overflow-hidden`}>
        {form.pinned && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-white/5 bg-white/3">
            <Pin size={9} className={t.text} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${t.text} opacity-70`}>Pinned</span>
          </div>
        )}
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${t.bg} border ${t.border}`}>
            <Megaphone size={13} className={t.text} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm leading-relaxed ${t.text}`}>{form.message}</p>
            {form.expiresAt && (
              <p className="text-[11px] text-gray-600 mt-1.5 flex items-center gap-1">
                <Clock size={9} /> Expires {new Date(form.expiresAt).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
              </p>
            )}
          </div>
          <button className="shrink-0 text-gray-700 hover:text-gray-400 transition p-1">
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Announcements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [form, setForm] = useState({ message: "", type: "info", pinned: false, expiresAt: "" })
  const MAX_CHARS = 280

  async function load() {
    try {
      const data = await cachedGetDocs(
        "announcements",
        query(collection(db, "announcements"), orderBy("createdAt", "desc")),
        { ttl: TTL_LONG }
      )
      setAnnouncements(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function applyTemplate(t) {
    setForm({ message: t.message, type: t.type, pinned: t.pinned, expiresAt: "" })
    setShowTemplates(false)
    setShowForm(true)
  }

  function resetForm() {
    setForm({ message: "", type: "info", pinned: false, expiresAt: "" })
    setShowForm(false)
    setShowTemplates(false)
  }

  async function handleCreate() {
    if (!form.message.trim()) return toast.error("Message is required")
    if (form.message.length > MAX_CHARS) return toast.error(`Max ${MAX_CHARS} characters`)
    setSaving(true)
    try {
      await addDoc(collection(db, "announcements"), {
        message:   form.message.trim(),
        type:      form.type,
        pinned:    form.pinned,
        active:    true,
        expiresAt: form.expiresAt || null,
        createdAt: new Date().toISOString(),
      })
      toast.success("Announcement posted!")
      invalidateCache("query:announcements")
      resetForm()
      load()
    } catch { toast.error("Failed to post") }
    setSaving(false)
  }

  async function toggleActive(ann) {
    try {
      await updateDoc(doc(db, "announcements", ann.id), { active: !ann.active })
      toast.success(ann.active ? "Hidden from users" : "Shown to users")
      invalidateCache("query:announcements")
      load()
    } catch { toast.error("Failed") }
  }

  async function togglePin(ann) {
    try {
      await updateDoc(doc(db, "announcements", ann.id), { pinned: !ann.pinned })
      toast.success(ann.pinned ? "Unpinned" : "Pinned to top")
      invalidateCache("query:announcements")
      load()
    } catch { toast.error("Failed") }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this announcement?")) return
    try {
      await deleteDoc(doc(db, "announcements", id))
      toast.success("Deleted")
      invalidateCache("query:announcements")
      load()
    } catch { toast.error("Failed") }
  }

  const activeCount = announcements.filter(a => a.active).length
  const charsLeft   = MAX_CHARS - form.message.length

  return (
    <AdminLayout>
      <div className="p-7">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Announcements</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Broadcast messages to all users on their dashboard
              {activeCount > 0 && <> · <span className="text-emerald-400">{activeCount} active</span></>}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowTemplates(s => !s); setShowForm(false) }}
              className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition ${
                showTemplates
                  ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                  : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:border-gray-600"
              }`}>
              <Zap size={14} /> Templates
            </button>
            <button
              onClick={() => { setShowForm(s => !s); setShowTemplates(false) }}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2.5 rounded-xl transition text-sm">
              <Plus size={14} /> New
            </button>
          </div>
        </div>

        {/* Templates panel */}
        {showTemplates && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Quick Templates — click to use</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {TEMPLATES.map(t => (
                <button key={t.label} onClick={() => applyTemplate(t)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-800/60 border border-gray-700/60 hover:border-gray-600 hover:bg-gray-800 transition text-center group">
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition leading-tight">{t.label}</span>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${TYPES[t.type].bg} ${TYPES[t.type].text} border ${TYPES[t.type].border}`}>
                    {t.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compose form */}
        {showForm && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-white">Compose Announcement</p>
              <button onClick={resetForm} className="text-gray-600 hover:text-gray-400 transition p-1"><X size={15}/></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: inputs */}
            <div className="space-y-4">
              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Message</label>
                  <span className={`text-[11px] font-semibold ${charsLeft < 40 ? charsLeft < 10 ? "text-rose-400" : "text-amber-400" : "text-gray-600"}`}>
                    {charsLeft} left
                  </span>
                </div>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  rows={4}
                  placeholder="Write a clear, concise message for your students…"
                  className="w-full bg-gray-800/80 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-cyan-500/50 focus:outline-none text-sm resize-none leading-relaxed placeholder-gray-700"
                />
              </div>

              {/* Type + Pin + Expiry row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                {/* Type */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Type</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(TYPES).map(([key, t]) => (
                      <button key={key} onClick={() => setForm(f => ({ ...f, type: key }))}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          form.type === key ? `${t.bg} ${t.border} ${t.text}` : "border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
                        }`}>
                        <span>{t.emoji}</span> {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pin */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Visibility</label>
                  <button onClick={() => setForm(f => ({ ...f, pinned: !f.pinned }))}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition text-sm font-semibold ${
                      form.pinned
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        : "bg-gray-800/60 border-gray-700 text-gray-500 hover:text-gray-300"
                    }`}>
                    <Pin size={13} className={form.pinned ? "fill-current" : ""}/>
                    {form.pinned ? "Pinned to top" : "Pin to top?"}
                  </button>
                  <p className="text-[10px] text-gray-700 mt-1.5 px-1">Pinned = shown above other content</p>
                </div>

                {/* Expiry */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                    Auto-expire <span className="text-gray-700 normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full bg-gray-800/60 text-gray-300 rounded-xl px-3 py-2 border border-gray-700 focus:border-cyan-500/50 focus:outline-none text-sm"
                  />
                  <p className="text-[10px] text-gray-700 mt-1.5 px-1">Hides automatically on this date</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 transition">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={saving || !form.message.trim() || charsLeft < 0}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-bold py-2.5 rounded-xl transition text-sm">
                  {saving ? "Posting…" : "Post Announcement"}
                </button>
              </div>
            </div>

            {/* RIGHT: live preview */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-3">Live Preview — as students see it</p>
              {form.message.trim()
                ? <PreviewCard form={form} />
                : (
                  <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center">
                    <Megaphone size={20} className="mx-auto text-gray-700 mb-2" />
                    <p className="text-gray-700 text-xs">Start typing to see preview</p>
                  </div>
                )
              }
            </div>
          </div>
        </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse"/>)}
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-gray-900 border border-dashed border-gray-800 rounded-2xl p-16 text-center">
            <Megaphone size={28} className="mx-auto text-gray-700 mb-3"/>
            <p className="text-gray-500 text-sm font-medium">No announcements yet</p>
            <p className="text-gray-700 text-xs mt-1">Use a template or compose a new message above</p>
            <button onClick={() => setShowTemplates(true)}
              className="mt-4 flex items-center gap-1.5 mx-auto text-xs text-violet-400 hover:text-violet-300 border border-violet-500/20 bg-violet-500/8 px-3 py-1.5 rounded-lg transition">
              <Zap size={11}/> Browse templates
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Pinned first */}
            {[...announcements].sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map(ann => {
              const t = TYPES[ann.type] || TYPES.info
              const isExpired = ann.expiresAt && new Date(ann.expiresAt) < new Date()
              return (
                <div key={ann.id}
                  className={`border rounded-2xl overflow-hidden transition ${
                    !ann.active || isExpired
                      ? "border-gray-800 bg-gray-900/40 opacity-55"
                      : ann.pinned
                        ? `${t.border} bg-gray-900`
                        : "border-gray-800 bg-gray-900 hover:border-gray-700"
                  }`}>

                  {/* Pinned header strip */}
                  {ann.pinned && ann.active && (
                    <div className={`flex items-center gap-1.5 px-4 py-1.5 border-b ${t.border} bg-white/2`}>
                      <Pin size={9} className={`${t.text} fill-current`}/>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${t.text} opacity-80`}>Pinned</span>
                      <span className="ml-auto text-[10px] text-gray-700">Shown at top of user dashboard</span>
                    </div>
                  )}

                  <div className="flex items-start gap-3 px-4 py-3.5">
                    {/* Type indicator */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${t.bg} ${t.border}`}>
                      <span className="text-sm">{t.emoji}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm leading-relaxed">{ann.message}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.bg} ${t.border} ${t.text}`}>
                          {t.label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isExpired    ? "bg-gray-800 text-gray-600" :
                          ann.active   ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                         "bg-gray-800 text-gray-500"
                        }`}>
                          {isExpired ? "Expired" : ann.active ? "Live" : "Hidden"}
                        </span>
                        {ann.expiresAt && !isExpired && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-1">
                            <Clock size={9}/>
                            Expires {new Date(ann.expiresAt).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-700">
                          {new Date(ann.createdAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => togglePin(ann)}
                        className={`p-2 rounded-lg transition ${ann.pinned ? "text-amber-400 hover:bg-amber-500/10" : "text-gray-600 hover:text-amber-400 hover:bg-gray-800"}`}
                        title={ann.pinned ? "Unpin" : "Pin to top"}>
                        <Pin size={13} className={ann.pinned ? "fill-current" : ""}/>
                      </button>
                      <button onClick={() => toggleActive(ann)}
                        className={`p-2 rounded-lg transition ${ann.active ? "text-gray-500 hover:text-amber-400 hover:bg-gray-800" : "text-gray-700 hover:text-emerald-400 hover:bg-gray-800"}`}
                        title={ann.active ? "Hide from users" : "Show to users"}>
                        {ann.active ? <EyeOff size={13}/> : <Eye size={13}/>}
                      </button>
                      <button onClick={() => handleDelete(ann.id)}
                        className="p-2 rounded-lg text-gray-700 hover:text-rose-400 hover:bg-rose-500/8 transition"
                        title="Delete">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}