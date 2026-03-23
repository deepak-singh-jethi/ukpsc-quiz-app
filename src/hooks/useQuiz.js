/**
 * useQuiz.js — Client-Side Quiz Caching Hook (Improvement #4)
 *
 * ─── THE PROBLEM ─────────────────────────────────────────────────────────────
 *
 * Current flow (Quiz.jsx):
 *   User opens quiz → getDoc(quizSets/<id>) + getDocs(questions) → renders.
 *   User navigates to Dashboard → navigates back to same quiz:
 *   → getDoc(quizSets/<id>) + getDocs(questions) AGAIN → 1 + N reads wasted.
 *
 *   With 50 questions per quiz and 10,000 daily users each visiting a quiz
 *   twice: 10,000 × 51 × 2 = 1,020,000 wasted reads per day from repeat visits.
 *
 * ─── THE SOLUTION: TWO-LAYER CACHE ──────────────────────────────────────────
 *
 * Layer 1 — Module-level Map (in-memory, per tab):
 *   The fastest possible cache. Zero serialization cost.
 *   Lives for the duration of the browser tab.
 *   Shared across all component instances — if Dashboard and QuizDetail both
 *   try to load quiz "abc123", only one Firestore read happens.
 *
 * Layer 2 — sessionStorage (persists across React re-mounts):
 *   When a user navigates away and React unmounts the component, the module-level
 *   Map might still hold the data (since modules persist in the tab), but
 *   sessionStorage provides a safety net for cases where the module is
 *   re-initialized (e.g., fast refresh in development, HMR).
 *   sessionStorage is cleared automatically when the browser tab is closed —
 *   no stale quiz data leaks between sessions.
 *
 * ─── CACHE KEY DESIGN ────────────────────────────────────────────────────────
 *   quiz:meta:{quizId}       → the quizSets doc (title, timing, settings)
 *   quiz:questions:{quizId}  → the questions subcollection array
 *
 *   Separating meta from questions allows Dashboard/QuizDetail to load only
 *   the meta doc (for cards/previews) without the full question payload.
 *
 * ─── TTL STRATEGY ────────────────────────────────────────────────────────────
 *   Quiz metadata: 10 minutes (rarely changes mid-session)
 *   Questions:     5 minutes (could be edited by admin between attempts)
 *
 *   If an admin edits a quiz while a student is mid-session, the cache
 *   will serve stale questions for up to 5 minutes. This is acceptable
 *   because: (a) the student is probably already on the quiz page, and
 *   (b) forceRefresh:true can be passed to bypass the cache if needed.
 */

import { useState, useEffect, useRef } from "react"
import { db } from "../firebase/config"
import { doc, getDoc, getDocs, collection, query, orderBy } from "firebase/firestore"

// ─── Cache configuration ──────────────────────────────────────────────────────
// TTL_META is 60s so quiz publish/unpublish status reaches students within ~60s.
// Previously 10 min — caused stale quiz data when admin changed status mid-session.
const TTL_META      =  1 * 60 * 1000   // 60 s  — quiz metadata (status changes)
const TTL_QUESTIONS =  5 * 60 * 1000   // 5 min — questions (stable once published)

// ─── Layer 1: Module-level in-memory store ────────────────────────────────────
// Persists for the lifetime of the browser tab.
const _memCache = new Map()

function memGet(key) {
  const entry = _memCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { _memCache.delete(key); return null }
  return entry.value
}
function memSet(key, value, ttl) {
  _memCache.set(key, { value, expiresAt: Date.now() + ttl })
}

// ─── Layer 2: sessionStorage helpers ─────────────────────────────────────────
function storageGet(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() > entry.expiresAt) { sessionStorage.removeItem(key); return null }
    return entry.value
  } catch {
    return null
  }
}
function storageSet(key, value, ttl) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ value, expiresAt: Date.now() + ttl }))
  } catch {
    // sessionStorage can throw if storage quota is exceeded (rare, but safe to ignore)
  }
}

// ─── Public cache invalidation (call after admin edits a quiz) ────────────────
/**
 * Clears both cache layers for a specific quiz.
 * Call this from QuizEditor.jsx after saving changes, so the next load
 * fetches fresh data from Firestore.
 */
export function invalidateQuizCache(quizId) {
  const metaKey = `quiz:meta:${quizId}`
  const qKey    = `quiz:questions:${quizId}`
  _memCache.delete(metaKey)
  _memCache.delete(qKey)
  try { sessionStorage.removeItem(metaKey) } catch {}
  try { sessionStorage.removeItem(qKey)    } catch {}
}

// ─── Core fetch with two-layer cache ─────────────────────────────────────────
async function fetchWithCache(key, fetcher, ttl) {
  // Check Layer 1 (memory — fastest)
  const fromMem = memGet(key)
  if (fromMem !== null) return { data: fromMem, source: "memory" }

  // Check Layer 2 (sessionStorage — survives HMR reloads)
  const fromStorage = storageGet(key)
  if (fromStorage !== null) {
    memSet(key, fromStorage, ttl) // backfill memory cache
    return { data: fromStorage, source: "storage" }
  }

  // Cache miss — fetch from Firestore
  const data = await fetcher()
  memSet(key, data, ttl)
  storageSet(key, data, ttl)
  return { data, source: "firestore" }
}

// ─── Main hook ────────────────────────────────────────────────────────────────
/**
 * useQuiz — fetch and cache quiz metadata + questions
 *
 * Usage:
 *   const { quiz, questions, loading, error } = useQuiz(id)
 *
 * @param {string}  quizId        - Firestore document ID of the quiz
 * @param {boolean} loadQuestions - Whether to also fetch the questions subcollection
 *                                  Set to false on QuizDetail (only needs metadata)
 * @param {boolean} forceRefresh  - Bypass cache and fetch fresh from Firestore
 */
export function useQuiz(quizId, { loadQuestions = true, forceRefresh = false } = {}) {
  const [quiz,      setQuiz]      = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Track which quizId we've already loaded to avoid duplicate fetches
  // when the component re-renders without the quizId changing.
  const loadedForRef = useRef(null)

  useEffect(() => {
    if (!quizId) return
    // Skip if we already loaded this quiz and forceRefresh isn't set
    if (loadedForRef.current === quizId && !forceRefresh) return

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const metaKey = `quiz:meta:${quizId}`
        const qKey    = `quiz:questions:${quizId}`

        // Optionally bypass cache
        if (forceRefresh) {
          invalidateQuizCache(quizId)
        }

        // ── Fetch quiz metadata ──────────────────────────────────────────────
        const { data: quizData, source: metaSource } = await fetchWithCache(
          metaKey,
          async () => {
            const snap = await getDoc(doc(db, "quizSets", quizId))
            if (!snap.exists()) throw new Error("Quiz not found")
            return { id: snap.id, ...snap.data() }
          },
          TTL_META
        )

        if (cancelled) return

        if (process.env.NODE_ENV === "development") {
          console.debug(`[useQuiz] meta source="${metaSource}" quizId="${quizId}"`)
        }

        setQuiz(quizData)

        // ── Fetch questions (optional) ───────────────────────────────────────
        if (loadQuestions) {
          const { data: questionsData, source: qSource } = await fetchWithCache(
            qKey,
            async () => {
              const snap = await getDocs(
                query(collection(db, "quizSets", quizId, "questions"), orderBy("order"))
              )
              return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            },
            TTL_QUESTIONS
          )

          if (cancelled) return

          if (process.env.NODE_ENV === "development") {
            console.debug(`[useQuiz] questions source="${qSource}" count=${questionsData.length}`)
          }

          setQuestions(questionsData)
        }

        loadedForRef.current = quizId
      } catch (e) {
        if (!cancelled) {
          console.error("[useQuiz] Fetch failed:", e)
          setError(e.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [quizId, loadQuestions, forceRefresh])

  return { quiz, questions, loading, error }
}
