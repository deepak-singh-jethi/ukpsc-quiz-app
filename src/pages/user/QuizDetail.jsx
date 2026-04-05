import { useEffect, useState } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { db } from "../../firebase/config"
import { doc, collection, getDocs, query, where } from "firebase/firestore"
import { cachedGetDoc, TTL_LONG } from "../../firebase/firestoreCache"
import { getLeaderboardKey } from "../../firebase/leaderboardService"
import Navbar from "../../components/Navbar"
import Leaderboard from "../../components/Leaderboard"
import {
  BookOpen, Clock, Play, RotateCcw, ChevronRight,
  Calendar, AlertCircle, Zap, Target,
  CheckCircle, XCircle, Flame, GraduationCap, Globe
} from "lucide-react"

const DIFF_CONFIG = {
  easy:   { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", dot: "bg-emerald-400" },
  medium: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/25",   dot: "bg-amber-400"   },
  hard:   { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/25",    dot: "bg-rose-400"    },
}

export default function QuizDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const batchId = searchParams.get("batchId")
  const [batchName, setBatchName] = useState(null)

  useEffect(() => {
    if (!batchId) return
    cachedGetDoc(doc(db, "batches", batchId), { ttl: TTL_LONG })
      .then(b => b && setBatchName(b.name || null))
      .catch(() => {})
  }, [batchId])
  const { currentUser } = useAuth()

  const [quiz, setQuiz] = useState(null)
  const [myAttempts, setMyAttempts] = useState([])
  const [loading, setLoading] = useState(true)

  const isExpired    = quiz?.expiryDate && new Date(quiz.expiryDate) < new Date()
  const hasAttempted = myAttempts.length > 0

  const firstAttempt = myAttempts.find(a => (a.attemptNumber ?? 1) === 1)
  const bestAttempt  = hasAttempted
    ? myAttempts.reduce((best, a) => {
        const aScore    = a.score / (a.maxScore || a.totalQ)
        const bestScore = best.score / (best.maxScore || best.totalQ)
        return aScore > bestScore ? a : best
      })
    : null

  const bestPct       = bestAttempt ? Math.round((bestAttempt.score / (bestAttempt.maxScore || bestAttempt.totalQ)) * 100) : null
  const firstAnswers  = firstAttempt?.answers || []
  const firstCorrect  = firstAnswers.filter(a => a.selected === a.correct).length
  const firstAttempted = firstAnswers.filter(a => a.selected !== -1 && a.selected != null).length
  const firstAccuracy = firstAttempted > 0 ? Math.round((firstCorrect / firstAttempted) * 100) : 0
  const bestStreak    = hasAttempted ? Math.max(...myAttempts.map(a => a.streak || 0)) : 0

  useEffect(() => {
    async function load() {
      try {
        const [quizSnap, attSnap] = await Promise.all([
          cachedGetDoc(doc(db, "quizSets", id), { ttl: TTL_LONG }),
          getDocs(
            query(
              collection(db, "quizAttempts"),
              where("userId", "==", currentUser.uid),
              where("quizId", "==", id)   // compound query — requires composite index on (userId, quizId)
            )
          ),
        ])

        if (!quizSnap) { navigate("/dashboard"); return }

        // Guard: redirect if quiz is not published (draft, scheduled-future, or expired-status)
        // Scheduled quizzes whose publishAt has passed are treated as published.
        const now = new Date()
        const isPublished =
          quizSnap.status === "published" ||
          (quizSnap.status === "scheduled" && quizSnap.publishAt && new Date(quizSnap.publishAt) <= now)
        if (!isPublished) { navigate("/dashboard"); return }

        setQuiz(quizSnap)

        const all = attSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          // No client-side filter needed — Firestore returns only this quiz's attempts
          .sort((a, b) => new Date(b.date) - new Date(a.date))
        setMyAttempts(all)
      } catch (e) {
        console.error("QuizDetail load error:", e)
        navigate("/dashboard")
      }
      setLoading(false)    }
    load()
  }, [id, currentUser])

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const diff        = DIFF_CONFIG[quiz?.difficulty] || DIFF_CONFIG.medium
  const scoreColor  = bestPct >= 80 ? "text-emerald-400" : bestPct >= 60 ? "text-amber-400" : "text-rose-400"
  const scoreBorder = bestPct >= 80 ? "border-emerald-500/20" : bestPct >= 60 ? "border-amber-500/20" : "border-rose-500/20"
  const scoreBg     = bestPct >= 80 ? "bg-emerald-500/8" : bestPct >= 60 ? "bg-amber-500/8" : "bg-rose-500/8"

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 sm:pb-6">

        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          className="group flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-5 transition-colors"
        >
          <ChevronRight size={13} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>

        {/* ── HERO ── */}
        <div
          className="relative rounded-2xl border border-gray-800/80 overflow-hidden mb-5 px-4 py-4 sm:px-7 sm:py-5"
          style={{
            background: "linear-gradient(120deg, #0d1520 0%, #111827 60%, #0a1628 100%)",
            opacity: 1,
            transform: "translateY(0)",
            transition: "opacity 0.35s ease, transform 0.35s ease",
          }}
        >
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)" }} />

          <div className="relative flex flex-col gap-4">
            {/* Tags row — always its own line so they never compete with the title */}
            <div className="flex items-center gap-2 flex-wrap">
              {quiz.category && (
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
                  {quiz.category}
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${diff.color} ${diff.bg} ${diff.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${diff.dot}`} />
                {quiz.difficulty || "medium"}
              </span>
              {isExpired && (
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                  Expired
                </span>
              )}
              {batchId ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <GraduationCap size={10} /> {batchName || "Batch Quiz"}
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] bg-gray-800 text-gray-500 border border-gray-700 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Globe size={10} /> Free Quiz
                </span>
              )}
            </div>

            {/* Title + meta + button — stacked column on mobile, row on sm+ */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug mb-2 break-words">
                  {quiz.title}
                </h1>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <BookOpen size={11} className="text-gray-500" /> {quiz.questionCount || 0} questions
                  </span>
                  <span className="text-gray-700">·</span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={11} className="text-gray-500" /> {quiz.totalTime || 10} min
                  </span>
                  {quiz.marksPerQ && <>
                    <span className="text-gray-700">·</span>
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                      <Zap size={10} /> +{quiz.marksPerQ} correct
                    </span>
                  </>}
                  {quiz.negativeMark > 0 && <>
                    <span className="text-gray-700">·</span>
                    <span className="text-xs text-rose-400 font-semibold">−{quiz.negativeMark} wrong</span>
                  </>}
                  {quiz.expiryDate && <>
                    <span className="text-gray-700">·</span>
                    <span className={`flex items-center gap-1 text-xs font-semibold ${isExpired ? "text-red-400" : "text-orange-400"}`}>
                      <Calendar size={10} />
                      {isExpired ? "Expired" : "Closes"} {new Date(quiz.expiryDate).toLocaleDateString()}
                    </span>
                  </>}
                </div>

                {quiz.description && (
                  <p className="text-gray-500 text-xs mt-2 leading-relaxed max-w-xl">{quiz.description}</p>
                )}
              </div>

              {/* CTA — full-width on mobile, auto-width on sm+ */}
              <div className="shrink-0 sm:self-center w-full sm:w-auto">
                {isExpired ? (
                  <div className="flex items-center justify-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm w-full sm:w-auto">
                    <AlertCircle size={14} /> Expired
                  </div>
                ) : !hasAttempted ? (
                  <button
                    onClick={() => navigate(`/quiz/${id}${batchId ? `?batchId=${batchId}` : ''}`)}
                    className="group w-full sm:w-auto bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-black px-8 py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 text-sm"
                  >
                    <Play size={15} className="group-hover:scale-110 transition-transform" />
                    Start Quiz
                  </button>
                ) : (
                  <button
                    onClick={() => navigate(`/quiz/${id}${batchId ? `?batchId=${batchId}` : ''}`)}
                    className="group w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-gray-700 hover:border-gray-600 text-sm"
                  >
                    <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                    Retry Quiz
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TWO-COLUMN LAYOUT ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

          <div className="lg:col-span-3 space-y-4">

            {hasAttempted && (
              <div
                className="grid grid-cols-3 gap-3"
                style={{
                  opacity: 1,
                  transform: "translateY(0)",
                  transition: "opacity 0.35s ease 0.08s, transform 0.35s ease 0.08s",
                }}
              >
                <div className={`rounded-2xl border p-4 ${scoreBg} ${scoreBorder}`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Score</p>
                  <p className={`text-2xl font-black leading-none ${scoreColor}`}>{bestPct}<span className="text-sm font-medium text-gray-500">%</span></p>
                  <p className="text-xs text-gray-500 mt-1">{bestAttempt.score}/{bestAttempt.maxScore || bestAttempt.totalQ} marks</p>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Accuracy</p>
                  <p className="text-2xl font-black leading-none text-white">{firstAccuracy}<span className="text-sm font-medium text-gray-500">%</span></p>
                  <p className="text-xs text-gray-500 mt-1">{firstCorrect}/{firstAttempted} answered</p>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Best Streak</p>
                  <p className="text-2xl font-black leading-none text-orange-400">{bestStreak}</p>
                  <p className="text-xs text-gray-500 mt-1">{myAttempts.length} attempt{myAttempts.length > 1 ? "s" : ""}</p>
                </div>
              </div>
            )}

            {hasAttempted && (
              <div
                style={{
                  opacity: 1,
                  transform: "translateY(0)",
                  transition: "opacity 0.35s ease 0.12s, transform 0.35s ease 0.12s",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">My Attempts</p>
                  <span className="text-xs text-gray-700">{myAttempts.length} total</span>
                </div>

                <div className="space-y-2">
                  {myAttempts.map((a, idx) => {
                    const maxScore   = a.maxScore || a.totalQ
                    const pct        = Math.round((a.score / maxScore) * 100)
                    const isFirst    = (a.attemptNumber ?? 1) === 1
                    const aCorrect   = (a.answers || []).filter(x => x.selected === x.correct).length
                    const aAttempted = (a.answers || []).filter(x => x.selected !== -1 && x.selected != null).length
                    const aIncorrect = aAttempted - aCorrect
                    const pctColor   = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400"
                    const pctBg      = pct >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : pct >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-rose-500/10 border-rose-500/20"

                    return (
                      <button
                        key={a.id}
                        onClick={() => navigate(`/attempt/${a.id}`)}
                        className="group w-full text-left rounded-xl border border-gray-800/80 bg-gray-900/50 hover:bg-gray-800/60 hover:border-gray-700 transition-all duration-150 overflow-hidden"
                        style={{
                          opacity: 1,
                          transition: `opacity 0.3s ease ${0.15 + idx * 0.05}s, background 0.15s, border-color 0.15s`,
                        }}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center font-black border shrink-0 ${pctBg} ${pctColor}`}>
                            <span className="text-sm leading-none">{pct}%</span>
                            <span className="text-[9px] opacity-60 mt-0.5">{a.score}/{maxScore}</span>
                          </div>

                          <div className="shrink-0">
                            {isFirst ? (
                              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold">
                                🏆 1st
                              </span>
                            ) : (
                              <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700/50 px-2 py-0.5 rounded-full font-semibold">
                                Retry #{a.attemptNumber - 1}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle size={10} /> {aCorrect}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-rose-400">
                              <XCircle size={10} /> {aIncorrect}
                            </span>
                            {a.streak > 0 && (
                              <span className="flex items-center gap-1 text-xs text-orange-400">
                                <Flame size={10} /> {a.streak}
                              </span>
                            )}
                            <span className="text-xs text-gray-600 ml-auto truncate">
                              {new Date(a.date).toLocaleString()}
                            </span>
                          </div>

                          <ChevronRight size={13} className="text-gray-700 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>

                        <div className="h-0.5 bg-gray-800/80">
                          <div
                            className={`h-full ${pct >= 80 ? "bg-emerald-500/40" : pct >= 60 ? "bg-amber-500/40" : "bg-rose-500/40"}`}
                            style={{ width: `${pct}%`, transition: `width 0.6s ease ${0.2 + idx * 0.06}s` }}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {!hasAttempted && !isExpired && (
              <div
                className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 text-center"
                style={{ opacity: 1, transition: "opacity 0.35s ease 0.08s" }}
              >
                <Target size={28} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm">You haven't attempted this quiz yet.</p>
                <p className="text-gray-600 text-xs mt-1">Your stats and rank will appear here after your first attempt.</p>
              </div>
            )}
          </div>

          {/* RIGHT — Leaderboard sticky */}
          <div
            className="lg:col-span-2 lg:sticky lg:top-6"
            style={{
              opacity: 1,
              transform: "translateY(0)",
              transition: "opacity 0.35s ease 0.1s, transform 0.35s ease 0.1s",
            }}
          >
            <Leaderboard
              leaderboardKey={getLeaderboardKey(id, { batchId, isFree: quiz?.isFree ?? false })}
              currentUserId={currentUser.uid}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
