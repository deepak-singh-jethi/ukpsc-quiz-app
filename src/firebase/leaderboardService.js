/**
 * leaderboardService.js
 *
 * Leaderboard keys are context-scoped:
 *   batch quiz  → "batch_{batchId}_{quizId}"
 *   free quiz   → "free_{quizId}"
 *   direct/open → quizId  (no prefix — backward-compatible)
 *
 * Ranking rule:
 *   1. Higher score wins
 *   2. Tie on score → lower timeTaken wins (faster is better)
 *   3. Tie on both  → earlier date wins
 *
 * All callers pass a pre-computed leaderboardKey so this service
 * stays simple — it never needs to know about batches or isFree.
 */

import { db } from "../firebase/config"
import {
  doc, setDoc, collection,
  query, orderBy, limit,
  getDocs, getDoc,
} from "firebase/firestore"

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Compute the leaderboard key for a given quiz context.
 *   batchId present            → "batch_{batchId}_{quizId}"
 *   no batchId + isFree=true   → "free_{quizId}"
 *   otherwise                  → quizId  (open / direct)
 */
export function getLeaderboardKey(quizId, { batchId = null, isFree = false } = {}) {
  if (batchId)  return `batch_${batchId}_${quizId}`
  if (isFree)   return `free_${quizId}`
  return quizId
}

// ── write ──────────────────────────────────────────────────────────────────────

// Write a public leaderboard entry after a first attempt.
// leaderboardKey is pre-computed by the caller via getLeaderboardKey().
export async function writeLeaderboardEntry({
  leaderboardKey,
  userId,
  displayName,
  score,
  maxScore,
  rank,
  totalParticipants,
  date,
  timeTaken  = null,
  tabSwitches = 0,
}) {
  try {
    const pct = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : 0

    await setDoc(
      doc(db, "leaderboards", leaderboardKey, "entries", userId),
      {
        displayName:       displayName || "Anonymous",
        score,
        maxScore,
        pct,
        rank:              rank              ?? null,
        totalParticipants: totalParticipants ?? null,
        date,
        userId,
        timeTaken:         timeTaken  ?? null,
        tabSwitches:       tabSwitches ?? 0,
      },
      { merge: false }
    )
  } catch (e) {
    console.warn("[leaderboardService] writeLeaderboardEntry failed:", e.message)
  }
}

// ── read ───────────────────────────────────────────────────────────────────────

// Fetch top N leaderboard entries sorted by: score desc → timeTaken asc → date asc
export async function fetchLeaderboardEntries(leaderboardKey, topN = 10) {
  let docs = []
  try {
    const q = query(
      collection(db, "leaderboards", leaderboardKey, "entries"),
      orderBy("score", "desc"),
      limit(topN + 20)
    )
    const snap = await getDocs(q)
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    // Fallback: fetch all without ordering (handles legacy index issues)
    try {
      const snap = await getDocs(collection(db, "leaderboards", leaderboardKey, "entries"))
      docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { return [] }
  }

  // Sort client-side: score desc → timeTaken asc (null last) → date asc
  docs.sort((a, b) => {
    const aScore = a.score ?? 0
    const bScore = b.score ?? 0
    if (bScore !== aScore) return bScore - aScore
    const aTime = a.timeTaken ?? Infinity
    const bTime = b.timeTaken ?? Infinity
    if (aTime !== bTime) return aTime - bTime
    return new Date(a.date) - new Date(b.date)
  })

  return docs.slice(0, topN).map((entry, i) => ({ ...entry, rank: i + 1 }))
}

// Fetch the current user's own entry (direct doc read, no index needed)
export async function fetchMyLeaderboardEntry(leaderboardKey, userId) {
  const snap = await getDoc(doc(db, "leaderboards", leaderboardKey, "entries", userId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}