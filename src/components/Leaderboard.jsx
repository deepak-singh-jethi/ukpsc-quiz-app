import { useEffect, useState } from "react"
import { db } from "../firebase/config"
import { collection, query, where, getDocs } from "firebase/firestore"
import { cachedGetDoc, TTL_LONG } from "../firebase/firestoreCache"
import { Trophy, Clock, AlertTriangle } from "lucide-react"
import {
  fetchLeaderboardEntries,
  fetchMyLeaderboardEntry,
} from "../firebase/leaderboardService"

const _lbCache = new Map()
const LB_TTL   = 60_000
function getCached(k) {
  const e = _lbCache.get(k)
  if (!e || Date.now() > e.expiresAt) { _lbCache.delete(k); return null }
  return e.data
}
function setCache(k, d) { _lbCache.set(k, { data: d, expiresAt: Date.now() + LB_TTL }) }

// leaderboardKey may be "batch_{batchId}_{quizId}", "free_{quizId}", or plain quizId.
// We parse it back to figure out which quizAttempts to scan and how to filter.
function parseLeaderboardKey(leaderboardKey) {
  if (leaderboardKey.startsWith("batch_")) {
    // "batch_{batchId}_{quizId}" — batchId and quizId may both contain underscores,
    // so we split on the first two underscores only.
    const withoutPrefix = leaderboardKey.slice("batch_".length)      // "{batchId}_{quizId}"
    const firstUnderscore = withoutPrefix.indexOf("_")
    const batchId = withoutPrefix.slice(0, firstUnderscore)
    const quizId  = withoutPrefix.slice(firstUnderscore + 1)
    return { quizId, batchId, isFree: false }
  }
  if (leaderboardKey.startsWith("free_")) {
    return { quizId: leaderboardKey.slice("free_".length), batchId: null, isFree: true }
  }
  return { quizId: leaderboardKey, batchId: null, isFree: false }
}

async function fetchLeaderboardFromAttempts(leaderboardKey) {
  const { quizId, batchId } = parseLeaderboardKey(leaderboardKey)
  // Always query by quizId only — no compound index needed.
  // Filter by batchId in memory to scope the leaderboard correctly.
  const snap = await getDocs(query(collection(db, "quizAttempts"), where("quizId", "==", quizId)))
  const all   = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const scoped = batchId ? all.filter(a => a.batchId === batchId) : all
  const first  = scoped.filter(a => (a.attemptNumber ?? 1) === 1)

  const missingIds = [...new Set(first.filter(a => !a.userName).map(a => a.userId))]
  const fallback   = {}
  if (missingIds.length) {
    const { doc } = await import("firebase/firestore")
    await Promise.all(missingIds.map(async uid => {
      try {
        const u = await cachedGetDoc(doc(db, "users", uid), { ttl: TTL_LONG })
        if (u) fallback[uid] = u.name || u.email || "Unknown"
      } catch { fallback[uid] = "Unknown" }
    }))
  }

  const entries = first.map(a => ({
    id:          a.id,
    userId:      a.userId,
    displayName: a.userName || fallback[a.userId] || "Unknown",
    score:       a.score ?? 0,
    maxScore:    a.maxScore || a.totalQ || 1,
    date:        a.date,
    timeTaken:   a.timeTaken   ?? null,
    tabSwitches: a.tabSwitches ?? 0,
  }))

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aT = a.timeTaken ?? Infinity
    const bT = b.timeTaken ?? Infinity
    if (aT !== bT) return aT - bT
    return new Date(a.date) - new Date(b.date)
  })

  return entries.slice(0, 10).map((e, i) => ({ ...e, rank: i + 1 }))
}

function fmtTime(secs) {
  if (secs == null) return null
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`
}

function fmtScore(score) {
  return Number.isInteger(score) ? score : Number(score?.toFixed(2))
}

const RANK_MEDAL = ["text-yellow-400", "text-gray-300", "text-orange-400"]

export default function Leaderboard({ quizId, leaderboardKey: leaderboardKeyProp, currentUserId, compact = false }) {
  // Accept either leaderboardKey (new) or quizId (backward compat for QuizAttempts admin view)
  const leaderboardKey = leaderboardKeyProp || quizId
  const [entries, setEntries] = useState([])
  const [myEntry, setMyEntry] = useState(null)
  const [myRank,  setMyRank]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!leaderboardKey) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        let ranked = getCached(leaderboardKey)
        if (!ranked) {
          ranked = await fetchLeaderboardEntries(leaderboardKey, 10)
          if (ranked.length === 0) ranked = await fetchLeaderboardFromAttempts(leaderboardKey)
          // Only cache non-empty results — empty means data may not be written yet
          if (ranked.length > 0) setCache(leaderboardKey, ranked)
        }
        if (cancelled) return
        setEntries(ranked)
        const inTop = ranked.find(e => e.userId === currentUserId)
        if (inTop) {
          setMyEntry(inTop); setMyRank(inTop.rank)
        } else if (currentUserId) {
          const mine = await fetchMyLeaderboardEntry(leaderboardKey, currentUserId)
          if (!cancelled && mine) { setMyEntry(mine); setMyRank(mine.rank) }
        }
      } catch (e) { console.error("Leaderboard error:", e) }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [leaderboardKey, currentUserId])

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-1/3 mb-4" />
      {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-800 rounded-xl mb-2" />)}
    </div>
  )

  const hasTime = entries.some(e => e.timeTaken != null)
  const hasTabs = entries.some(e => (e.tabSwitches ?? 0) > 0)

  function Row({ e, i, isOutsider = false }) {
    const isMe    = e.userId === currentUserId
    const tStr    = fmtTime(e.timeTaken)
    const rankNum = isOutsider ? myRank : (e.rank ?? i + 1)
    const rankCls = isOutsider ? "text-gray-500" : (RANK_MEDAL[i] || "text-gray-500")
    return (
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800/40 last:border-0 transition-colors ${
        isMe ? "bg-cyan-500/6 border-l-2 border-l-cyan-500" : "hover:bg-gray-800/20"
      }`}>
        {/* Rank */}
        <span className={`w-6 text-center text-xs font-black shrink-0 ${rankCls}`}>
          #{rankNum}
        </span>

        {/* Name + date */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate leading-tight ${isMe ? "text-cyan-300" : "text-white"}`}>
            {e.displayName}
            {isMe && <span className="text-[10px] text-cyan-600 ml-1.5 font-normal">you</span>}
          </p>
          {e.date && (
            <p className="text-[10px] text-gray-600 mt-0.5 leading-none">
              {new Date(e.date).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
            </p>
          )}
        </div>

        {/* Time */}
        {hasTime && (
          <span className="text-[11px] tabular-nums shrink-0 w-16 text-right">
            {tStr
              ? <span className="text-gray-400 flex items-center gap-0.5 justify-end"><Clock size={9} className="shrink-0"/>{tStr}</span>
              : <span className="text-gray-700">-</span>
            }
          </span>
        )}

        {/* Tab switches */}
        {hasTabs && (e.tabSwitches ?? 0) > 0 && (
          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5 shrink-0">
            <AlertTriangle size={9}/>{e.tabSwitches}
          </span>
        )}

        {/* Score - inline, single line */}
        <div className="text-right shrink-0 min-w-[48px]">
          <span className="text-sm font-black tabular-nums text-white">{fmtScore(e.score)}</span>
          <span className="text-[10px] text-gray-600 tabular-nums">/{e.maxScore}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <Trophy size={13} className="text-yellow-400 shrink-0" />
        <span className="font-bold text-white text-sm">Leaderboard</span>
        <span className="ml-auto text-[10px] text-gray-600">1st attempt only</span>
      </div>

      {entries.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Trophy size={22} className="mx-auto text-gray-700 mb-2" />
          <p className="text-gray-600 text-sm">No attempts yet. Be the first!</p>
        </div>
      ) : (
        <div>
          {entries.map((e, i) => <Row key={e.id || e.userId} e={e} i={i} />)}

          {/* User outside top 10 */}
          {myRank && myRank > 10 && myEntry && (
            <>
              <div className="px-4 py-1.5 text-center">
                <span className="text-[10px] text-gray-700">. . .</span>
              </div>
              <Row e={myEntry} i={myRank - 1} isOutsider />
            </>
          )}
        </div>
      )}
    </div>
  )
}