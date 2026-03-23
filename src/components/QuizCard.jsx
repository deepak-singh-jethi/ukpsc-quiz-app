import { useNavigate } from "react-router-dom"
import { BookOpen, Clock, BarChart2, ChevronRight, Calendar, Sparkles, Globe } from "lucide-react"

const DIFFICULTY_STYLES = {
  easy: "text-green-400 bg-green-500/10 border-green-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  hard: "text-red-400 bg-red-500/10 border-red-500/20",
}

export default function QuizCard({ quiz, attempted = false, bestScore = null, rank = null, attemptCount = 0, isNew = false, batchId = null }) {
  const navigate = useNavigate()
  const isExpired = quiz.expiryDate && new Date(quiz.expiryDate) < new Date()

  return (
    <div
      onClick={() => navigate(`/quiz/${quiz.id}/detail${batchId ? `?batchId=${batchId}` : ''}`)}
      className={`border rounded-2xl p-5 cursor-pointer transition-all duration-200 group relative flex flex-col
        ${attempted
          ? "bg-gray-900 border-gray-700 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5"
          : "bg-gray-900 border-gray-800 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5"
        }`}
    >
      {/* Top badges row */}
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl border shrink-0 ${attempted ? "bg-purple-500/10 border-purple-500/20" : "bg-cyan-500/10 border-cyan-500/20"}`}>
          <BookOpen size={18} className={attempted ? "text-purple-400" : "text-cyan-400"} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {isNew && !attempted && (
            <span className="flex items-center gap-1 text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
              <Sparkles size={10} /> New
            </span>
          )}
          {quiz.isFree && (
            <span className="flex items-center gap-1 text-xs bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 px-2 py-0.5 rounded-full font-bold">
              <Globe size={10} /> Free
            </span>
          )}
          {isExpired && (
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
              Expired
            </span>
          )}
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border capitalize ${DIFFICULTY_STYLES[quiz.difficulty] || DIFFICULTY_STYLES.medium}`}>
            {quiz.difficulty || "medium"}
          </span>
        </div>
      </div>

      {/* Title + description */}
      <h3 className={`font-bold text-base mb-1 transition line-clamp-2 ${attempted ? "text-white group-hover:text-purple-400" : "text-white group-hover:text-cyan-400"}`}>
        {quiz.title}
      </h3>
      {quiz.description && (
        <p className="text-gray-500 text-xs mb-3 line-clamp-1">{quiz.description}</p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-600 mb-3 flex-wrap">
        <span className="flex items-center gap-1">
          <BookOpen size={11} /> {quiz.questionCount || 0}Q
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} /> {quiz.totalTime || 10}m
        </span>
        {quiz.category && (
          <span className="flex items-center gap-1">
            <BarChart2 size={11} /> {quiz.category}
          </span>
        )}
        {quiz.marksPerQ && (
          <span className="text-green-600">+{quiz.marksPerQ}</span>
        )}
        {quiz.negativeMark > 0 && (
          <span className="text-red-600">-{quiz.negativeMark}</span>
        )}
      </div>

      {/* Expiry warning */}
      {quiz.expiryDate && !isExpired && (
        <div className="flex items-center gap-1 text-xs text-orange-400 mb-3">
          <Calendar size={10} />
          Closes {new Date(quiz.expiryDate).toLocaleDateString()}
        </div>
      )}

      {/* Bottom section */}
      <div className="mt-auto pt-3 border-t border-gray-800">
        {attempted ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className={`font-black text-base leading-none ${bestScore >= 80 ? "text-green-400" : bestScore >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                  {bestScore}%
                </p>
                <p className="text-gray-700 text-xs mt-0.5">Best</p>
              </div>
              {rank && (
                <>
                  <div className="w-px h-6 bg-gray-800" />
                  <div className="text-center">
                    <p className="font-black text-base leading-none text-yellow-400">#{rank}</p>
                    <p className="text-gray-700 text-xs mt-0.5">Rank</p>
                  </div>
                </>
              )}
              <div className="w-px h-6 bg-gray-800" />
              <div className="text-center">
                <p className="font-black text-base leading-none text-gray-400">{attemptCount}</p>
                <p className="text-gray-700 text-xs mt-0.5">Tries</p>
              </div>
            </div>
            <span className="text-purple-400 text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              View <ChevronRight size={13} />
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-700">
              {quiz.expiryDate && !isExpired ? `Closes ${new Date(quiz.expiryDate).toLocaleDateString()}` : "Available now"}
            </span>
            <span className="text-cyan-400 text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              Start <ChevronRight size={13} />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
