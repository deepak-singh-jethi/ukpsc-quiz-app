import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { db } from "../../firebase/config"
import { collection, addDoc, writeBatch, doc } from "firebase/firestore"
import { useAuth } from "../../context/AuthContext"
import AdminLayout from "../../components/AdminLayout"
import { Upload, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react"
import toast from "react-hot-toast"

export default function QuizUpload() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState([])
  const [error, setError] = useState("")
  const [step, setStep] = useState("upload") // upload | configure
  const [expandedQ, setExpandedQ] = useState(null)
  const [saving, setSaving] = useState(false)
  const [meta, setMeta] = useState({
    title: "",
    description: "",
    category: "",
    difficulty: "medium",
    timePerQ: 20,
  })

  function handleFile(e) {
    setError("")
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!Array.isArray(data) || data.length === 0) throw new Error("JSON must be a non-empty array")
        const errors = []
        data.forEach((q, i) => {
          if (!q.question) errors.push(`Q${i + 1}: missing "question"`)
          if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`Q${i + 1}: "options" must be array of 4`)
          else q.options.forEach((o, j) => {
            if (!o.text) errors.push(`Q${i + 1} option ${j + 1}: missing "text"`)
            if (!o.explanation) errors.push(`Q${i + 1} option ${j + 1}: missing "explanation"`)
          })
          if (q.correct === undefined || q.correct < 0 || q.correct > 3) errors.push(`Q${i + 1}: "correct" must be 0-3`)
        })
        if (errors.length > 0) throw new Error(errors.slice(0, 3).join("\n") + (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""))
        setQuestions(data)
        setMeta(m => ({
          ...m,
          title: data[0]?.category ? `${data[0].category} Quiz` : "",
          category: data[0]?.category || "",
          difficulty: data[0]?.difficulty || "medium",
        }))
        setStep("configure")
      } catch (err) {
        setError(err.message)
      }
    }
    reader.readAsText(file)
  }

  async function handleSave(status) {
    if (!meta.title.trim()) return toast.error("Please enter a title")
    setSaving(true)
    try {
      const quizRef = await addDoc(collection(db, "quizSets"), {
        title: meta.title.trim(),
        description: meta.description.trim(),
        category: meta.category.trim(),
        difficulty: meta.difficulty,
        timePerQ: Number(meta.timePerQ),
        createdBy: currentUser.uid,
        createdAt: new Date().toISOString(),
        status,
        publishAt: null,
        questionCount: questions.length,
      })

      // Save questions as subcollection
      const batch = writeBatch(db)
      questions.forEach((q, i) => {
        const qRef = doc(collection(db, "quizSets", quizRef.id, "questions"))
        batch.set(qRef, { ...q, order: i })
      })
      await batch.commit()

      toast.success(status === "published" ? "Quiz published!" : "Saved as draft!")
      navigate("/admin/quizzes")
    } catch (e) {
      console.error(e)
      toast.error("Failed to save")
    }
    setSaving(false)
  }

  return (
    <AdminLayout>
      <div className="p-8 max-w-3xl">
        <button onClick={() => navigate("/admin/quizzes")} className="text-gray-400 hover:text-white text-sm mb-6 flex items-center gap-1 transition">
          ← Back to Quiz Manager
        </button>
        <h2 className="text-2xl font-bold text-white mb-8">Upload New Quiz</h2>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
            <label className="block w-full border-2 border-dashed border-gray-700 hover:border-cyan-400 rounded-xl p-12 cursor-pointer transition text-center">
              <Upload size={32} className="mx-auto mb-3 text-gray-500" />
              <p className="text-gray-300 font-medium">Click to upload JSON file</p>
              <p className="text-gray-600 text-sm mt-1">Must follow the quiz schema</p>
              <input type="file" accept=".json" onChange={handleFile} className="hidden" />
            </label>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm whitespace-pre-line">
                <XCircle size={14} className="inline mr-2" />{error}
              </div>
            )}

            {/* Schema reference */}
            <div className="mt-6 bg-gray-950 rounded-xl p-4 text-xs text-gray-500">
              <p className="text-gray-300 font-semibold mb-2">Required JSON schema:</p>
              <pre className="leading-relaxed">{`[
  {
    "question": "What is the capital of India?",
    "options": [
      { "text": "Mumbai", "explanation": "Mumbai is the financial capital." },
      { "text": "Delhi", "explanation": "New Delhi is the national capital." },
      { "text": "Kolkata", "explanation": "Was capital until 1911." },
      { "text": "Chennai", "explanation": "Capital of Tamil Nadu." }
    ],
    "correct": 1,
    "category": "GK",
    "difficulty": "easy"
  }
]`}</pre>
            </div>
          </div>
        )}

        {/* Step 2: Configure + Preview */}
        {step === "configure" && (
          <div className="space-y-6">
            {/* Meta form */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h3 className="text-lg font-bold text-white mb-4">Quiz Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-gray-400 text-sm mb-1 block">Title *</label>
                  <input value={meta.title} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g. Uttarakhand GK Set 1" />
                </div>
                <div className="col-span-2">
                  <label className="text-gray-400 text-sm mb-1 block">Description</label>
                  <input value={meta.description} onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
                    placeholder="Short description..." />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Category</label>
                  <input value={meta.category} onChange={e => setMeta(m => ({ ...m, category: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g. GK, Science" />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Difficulty</label>
                  <select value={meta.difficulty} onChange={e => setMeta(m => ({ ...m, difficulty: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Time per Question (seconds)</label>
                  <input type="number" min={5} max={120} value={meta.timePerQ}
                    onChange={e => setMeta(m => ({ ...m, timePerQ: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none" />
                </div>
                <div className="flex items-end">
                  <div className="text-gray-400 text-sm bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 w-full">
                    📝 {questions.length} questions loaded
                  </div>
                </div>
              </div>
            </div>

            {/* Questions preview */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h3 className="text-lg font-bold text-white mb-4">Questions Preview</h3>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="border border-gray-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition"
                    >
                      <span className="text-sm text-gray-300">
                        <span className="text-cyan-400 font-bold mr-2">Q{i + 1}.</span>
                        {q.question.length > 80 ? q.question.slice(0, 80) + "..." : q.question}
                      </span>
                      {expandedQ === i ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                    </button>
                    {expandedQ === i && (
                      <div className="px-4 pb-4 space-y-2">
                        {q.options.map((o, j) => (
                          <div key={j} className={`text-sm px-3 py-2 rounded-lg flex items-start gap-2 ${j === q.correct ? "bg-green-500/10 border border-green-500/20 text-green-300" : "bg-gray-800 text-gray-400"}`}>
                            <span className="font-bold mt-0.5">{["A","B","C","D"][j]}.</span>
                            <div>
                              <p>{o.text}</p>
                              <p className="text-xs opacity-70 mt-0.5">{o.explanation}</p>
                            </div>
                            {j === q.correct && <CheckCircle size={14} className="ml-auto mt-0.5 text-green-400 shrink-0" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setStep("upload")} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-3 rounded-xl transition">
                ← Change File
              </button>
              <button onClick={() => handleSave("draft")} disabled={saving}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium px-5 py-3 rounded-xl transition disabled:opacity-50">
                {saving ? "Saving..." : "Save as Draft"}
              </button>
              <button onClick={() => handleSave("published")} disabled={saving}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-5 py-3 rounded-xl transition disabled:opacity-50">
                {saving ? "Publishing..." : "Publish Now 🚀"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
