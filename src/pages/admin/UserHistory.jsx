import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { db } from "../../firebase/config"
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore"
import AdminLayout from "../../components/AdminLayout"
import { ChevronRight } from "lucide-react"

export default function UserHistory() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Fix #8: separate try/catch per fetch so a failed user doc read
      // doesn't prevent attempt history from loading (and vice versa).
      try {
        const userSnap = await getDoc(doc(db, "users", uid))
        if (userSnap.exists()) setUser({ id: userSnap.id, ...userSnap.data() })
      } catch (e) { console.error("Failed to load user profile:", e) }

      try {
        const q = query(collection(db, "quizAttempts"), where("userId", "==", uid))
        const snap = await getDocs(q)
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
        setAttempts(data)
      } catch (e) { console.error("Failed to load attempts:", e) }

      setLoading(false)
    }
    load()
  }, [uid])

  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((s, a) => s + (a.score / (a.maxScore || a.totalQ)) * 100, 0) / attempts.length) : 0
  const bestStreak = attempts.length > 0 ? Math.max(...attempts.map(a => a.streak || 0)) : 0

  return (
    <AdminLayout>
      <div className="p-8 max-w-3xl">
        <button onClick={() => navigate("/admin/users")}
          className="text-gray-400 hover:text-white text-sm mb-6 flex items-center gap-1 transition">
          ← Back to Users
        </button>

        {loading ? <p className="text-gray-500">Loading...</p> : (
          <>
            {user && (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">{user.name}</h2>
                    <p className="text-gray-400 text-sm mt-1">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      user.role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-gray-700 text-gray-400"
                    }`}>{user.role}</span>
                    <p className="text-gray-500 text-xs mt-2">Joined {new Date(user.joinDate).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-gray-800 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black text-cyan-400">{attempts.length}</p>
                    <p className="text-gray-500 text-xs mt-1">Quizzes Taken</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black text-green-400">{avgScore}%</p>
                    <p className="text-gray-500 text-xs mt-1">Avg Score</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black text-orange-400">🔥 {bestStreak}</p>
                    <p className="text-gray-500 text-xs mt-1">Best Streak</p>
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-lg font-bold text-white mb-4">Quiz History</h3>
            <p className="text-gray-600 text-xs mb-4">Click any attempt to see full review</p>

            {attempts.length === 0 ? (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-10 text-center text-gray-600">
                No quiz attempts yet.
              </div>
            ) : (
              <div className="space-y-2">
                {attempts.map(a => {
                  const maxScore = a.maxScore || a.totalQ
                  const pct = Math.round((a.score / maxScore) * 100)
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/attempt/${a.id}`)}
                      className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4 hover:bg-gray-800/50 transition">
                      <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black text-sm shrink-0 ${
                        pct >= 60 ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        <span className="text-base leading-none">{pct}%</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium text-sm truncate">{a.quizTitle || "Quiz"}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                            a.attemptNumber === 1 ? "bg-cyan-500/10 text-cyan-400" : "bg-gray-700 text-gray-400"
                          }`}>
                            {a.attemptNumber === 1 ? "1st" : `Retry #${(a.attemptNumber || 1) - 1}`}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs">{a.score}/{maxScore} marks · {new Date(a.date).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs shrink-0">
                        Review <ChevronRight size={13} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
