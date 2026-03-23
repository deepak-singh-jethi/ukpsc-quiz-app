import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { db } from "../../firebase/config"
import {
  collection, getDocs, addDoc, deleteDoc,
  doc, query, orderBy, where
} from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import { Plus, Users, BookOpen, Trash2, ChevronRight } from "lucide-react"
import toast from "react-hot-toast"

export default function BatchManager() {
  const navigate = useNavigate()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", description: "" })
  // member counts per batch
  const [memberCounts, setMemberCounts] = useState({})

  async function load() {
    setLoading(true)
    try {
      // cachedGetDocs: batches list is stable — 5-min memory + 30-min localStorage.
      // Member counts loaded in parallel — also cached per batch key.
      const data = await cachedGetDocs(
        "batches",
        query(collection(db, "batches"), orderBy("createdAt", "desc")),
        { ttl: TTL_LONG }
      )
      setBatches(data)

      const counts = {}
      await Promise.all(data.map(async b => {
        try {
          const members = await cachedGetDocs(
            `batchMembers:${b.id}`,
            collection(db, "batches", b.id, "members"),
            { ttl: TTL_LONG }
          )
          counts[b.id] = members.length
        } catch { counts[b.id] = 0 }
      }))
      setMemberCounts(counts)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!form.name.trim()) return toast.error("Batch name is required")
    setSaving(true)
    try {
      await addDoc(collection(db, "batches"), {
        name: form.name.trim(),
        description: form.description.trim(),
        active: true,
        createdAt: new Date().toISOString(),
      })
      toast.success("Batch created!")
      invalidateCache("query:batches")  // force fresh list on next load
      setForm({ name: "", description: "" })
      setShowForm(false)
      load()
    } catch (e) { toast.error("Failed to create batch") }
    setSaving(false)
  }

  async function handleDelete(batch) {
    if (!window.confirm(`Delete batch "${batch.name}"? Students will lose access.`)) return
    try {
      await deleteDoc(doc(db, "batches", batch.id))
      toast.success("Batch deleted")
      invalidateCache("query:batches")
      load()
    } catch { toast.error("Failed to delete") }
  }

  return (
    <AdminLayout>
      <div className="p-7 max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Batch Manager</h2>
            <p className="text-gray-500 text-sm mt-0.5">Create and manage student batches</p>
          </div>
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2.5 rounded-xl transition text-sm"
          >
            <Plus size={15} /> New Batch
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-gray-900 border border-cyan-500/20 rounded-2xl p-5 mb-6">
            <h3 className="text-sm font-bold text-white mb-4">Create New Batch</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1.5 block">
                  Batch Name *
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. RO/ARO 2025"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1.5 block">
                  Description
                </label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Revenue Officer prep batch"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-gray-900 font-bold px-5 py-2 rounded-xl text-sm transition"
              >
                {saving ? "Creating..." : "Create Batch"}
              </button>
              <button
                onClick={() => { setShowForm(false); setForm({ name: "", description: "" }) }}
                className="bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium px-5 py-2 rounded-xl text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Batches list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-800 rounded-2xl animate-pulse" />)}
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 p-16 text-center">
            <Users size={40} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-semibold">No batches yet</p>
            <p className="text-gray-600 text-sm mt-1">Create your first batch to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map(batch => (
              <div key={batch.id}
                className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-gray-700 transition"
              >
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-bold text-base truncate">{batch.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      batch.active ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-gray-500 bg-gray-800 border-gray-700"
                    }`}>
                      {batch.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {batch.description && (
                    <p className="text-gray-500 text-xs mb-2 truncate">{batch.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {memberCounts[batch.id] ?? "—"} students
                    </span>
                    <span className="text-gray-700">·</span>
                    <span>Created {new Date(batch.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>


                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/admin/batches/${batch.id}`)}
                    className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 px-3 py-2 rounded-xl transition"
                  >
                    Manage <ChevronRight size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(batch)}
                    className="p-2 rounded-xl hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition"
                    title="Delete batch"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
