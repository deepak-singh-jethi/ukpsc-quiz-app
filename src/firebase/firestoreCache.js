// src/firebase/firestoreCache.js
//
// Two-layer cache: memory (per tab) + localStorage (survives page refresh).
//
// TTL behaviour:
//   TTL_SHORT        (60 s)   — quiz attempts, batch docs, batchQuizzes
//   TTL_LONG         (5 min)  — batch membership memory cache
//   TTL_QUIZ_SETS    (2 min)  — quizSets localStorage
//   TTL_BATCH        (60 s)   — batch docs + batchQuizzes localStorage (Sprint 3 Fix A)
//                               60s acceptable: a newly assigned quiz appears within 1 min
//   TTL_BATCH_QUIZ   (5 min)  — legacy batchQuizzes (kept for other callers)
//   TTL_ANNOUNCE     (10 min) — announcements localStorage
//   TTL_BOOKMARKS    (5 min)  — bookmarks localStorage (Sprint 3 Fix B)
//                               invalidateCache() on every toggle wipes this immediately,
//                               so users never see stale bookmarks after their own actions.
//                               The 5-min window only applies to passive reads across sessions.
//
// STALE-WHILE-REVALIDATE with CONDITIONAL REVALIDATION:
//   revalidate: true only fires a background Firestore fetch when cache age
//   exceeds REVALIDATE_THRESHOLD × ttl. Fresh cache hits pay zero extra reads.
//
// On logout, call clearCache() to wipe both layers.

const TTL_SHORT      = 60_000           // 60 s
const TTL_LONG       = 5  * 60_000      // 5 min
const TTL_QUIZ_SETS  = 2  * 60_000      // 2 min localStorage
const TTL_BATCH      = 60_000           // 60 s localStorage — Sprint 3 Fix A
const TTL_BATCH_QUIZ = 5  * 60_000      // 5 min localStorage (legacy)
const TTL_ANNOUNCE   = 10 * 60_000      // 10 min localStorage
const TTL_BOOKMARKS  = 5  * 60_000      // 5 min localStorage — Sprint 3 Fix B

const REVALIDATE_THRESHOLD = 0.6

// ── Per-key localStorage TTL map ───────────────────────────────────────────
const PERSIST_TTL = {
  "query:quizSets":      TTL_QUIZ_SETS,
  "query:batchQuizzes":  TTL_BATCH_QUIZ,
  "query:announcements": TTL_ANNOUNCE,
  "query:allBatches":    TTL_BATCH,      // Batches page — all batch stubs, 60s (Sprint 3 Batches fix)
}

// ── Prefix-based localStorage TTL — covers dynamic keys like bookmarks:{uid} ─
const PERSIST_PREFIX_TTL = [
  { prefix: "doc:batches/",      ttl: TTL_BATCH      },  // Sprint 3 Fix A
  { prefix: "query:batches:",    ttl: TTL_BATCH      },  // Sprint 3 Fix A — user batch docs
  { prefix: "query:batchQuiz:",  ttl: TTL_BATCH      },  // Sprint 3 Fix A — user batchQuizzes
  { prefix: "query:bookmarks:",  ttl: TTL_BOOKMARKS  },  // Sprint 3 Fix B
]

function getPersistTtl(key) {
  if (PERSIST_TTL[key] !== undefined) return PERSIST_TTL[key]
  for (const { prefix, ttl } of PERSIST_PREFIX_TTL) {
    if (key.startsWith(prefix)) return ttl
  }
  return null  // null = don't persist
}

// ── One-time migration: purge legacy stale data ────────────────────────────
;(function purgeStaleData() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith("fsc:")) {
        try {
          const e = JSON.parse(localStorage.getItem(k) || "{}")
          if (!e.expiresAt || Date.now() > e.expiresAt) localStorage.removeItem(k)
        } catch { localStorage.removeItem(k) }
      }
    }
  } catch {}
})()

const _mem = new Map()

// ── Memory helpers — now track cachedAt for Fix 7 ─────────────────────────
function memGet(key) {
  const e = _mem.get(key)
  if (!e) return null
  if (Date.now() > e.expiresAt) { _mem.delete(key); return null }
  return e  // return full entry so callers can inspect cachedAt
}
function memSet(key, value, ttl) {
  _mem.set(key, { value, expiresAt: Date.now() + ttl, cachedAt: Date.now(), ttl })
}

// ── localStorage helpers ───────────────────────────────────────────────────
function lsKey(key) { return "fsc:" + key }

function lsGet(key) {
  try {
    const raw = localStorage.getItem(lsKey(key))
    if (!raw) return null
    const e = JSON.parse(raw)
    if (Date.now() > e.expiresAt) { localStorage.removeItem(lsKey(key)); return null }
    return e  // return full entry (has cachedAt + ttl for Fix 7)
  } catch { return null }
}

function lsSet(key, value, ttl) {
  try {
    const payload = JSON.stringify({ value, expiresAt: Date.now() + ttl, cachedAt: Date.now(), ttl })
    if (payload.length > 800_000) return
    localStorage.setItem(lsKey(key), payload)
  } catch {}
}

// ── Unified get — returns full entry with metadata ─────────────────────────
function cacheGet(key) {
  const m = memGet(key)
  if (m !== null) return m
  const persistTtl = getPersistTtl(key)
  if (persistTtl !== null) {
    const l = lsGet(key)
    if (l !== null) {
      memSet(key, l.value, Math.max(0, l.expiresAt - Date.now()))
      return l
    }
  }
  return null
}

function cacheSet(key, value, ttl) {
  memSet(key, value, ttl)
  const persistTtl = getPersistTtl(key)
  if (persistTtl !== null) lsSet(key, value, persistTtl)
}

// ── Fix 7: Should we fire background revalidation? ────────────────────────
// Only revalidate if data is older than REVALIDATE_THRESHOLD fraction of its TTL.
// This prevents a background Firestore read on every single cache hit.
function shouldRevalidate(entry) {
  if (!entry?.cachedAt || !entry?.ttl) return true  // no metadata → always revalidate
  const age = Date.now() - entry.cachedAt
  return age > REVALIDATE_THRESHOLD * entry.ttl
}

// ── Public API ─────────────────────────────────────────────────────────────
export function invalidateCache(keyOrPrefix) {
  for (const key of _mem.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) _mem.delete(key)
  }
  try {
    const lsPrefix = lsKey(keyOrPrefix)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (k === lsPrefix || k.startsWith(lsPrefix))) localStorage.removeItem(k)
    }
  } catch {}
}

export function clearCache() {
  _mem.clear()
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith("fsc:")) localStorage.removeItem(k)
    }
  } catch {}
}

/**
 * Cached getDoc with conditional stale-while-revalidate.
 * @param {import("firebase/firestore").DocumentReference} docRef
 * @param {{ ttl?: number, revalidate?: boolean, onUpdate?: (data: any) => void }} opts
 */
export async function cachedGetDoc(docRef, { ttl = TTL_LONG, revalidate = false, onUpdate } = {}) {
  const key   = `doc:${docRef.path}`
  const entry = cacheGet(key)

  if (entry !== null) {
    // Fix 7: only fire background fetch if data is stale enough
    if (revalidate && shouldRevalidate(entry)) {
      ;(async () => {
        try {
          const { getDoc } = await import("firebase/firestore")
          const snap   = await getDoc(docRef)
          const result = snap.exists() ? { id: snap.id, ...snap.data() } : null
          cacheSet(key, result, ttl)
          onUpdate?.(result)
        } catch {}
      })()
    }
    return entry.value
  }

  const { getDoc } = await import("firebase/firestore")
  const snap   = await getDoc(docRef)
  const result = snap.exists() ? { id: snap.id, ...snap.data() } : null
  cacheSet(key, result, ttl)
  return result
}

/**
 * Cached getDocs with conditional stale-while-revalidate.
 * @param {string} cacheKey
 * @param {import("firebase/firestore").Query} q
 * @param {{ ttl?: number, revalidate?: boolean, onUpdate?: (data: any[]) => void }} opts
 */
export async function cachedGetDocs(cacheKey, q, { ttl = TTL_SHORT, revalidate = false, onUpdate } = {}) {
  const key   = `query:${cacheKey}`
  const entry = cacheGet(key)

  if (entry !== null) {
    // Fix 7: only revalidate if data is old enough to warrant a fresh fetch
    if (revalidate && shouldRevalidate(entry)) {
      ;(async () => {
        try {
          const { getDocs } = await import("firebase/firestore")
          const snap   = await getDocs(q)
          const result = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          cacheSet(key, result, ttl)
          onUpdate?.(result)
        } catch {}
      })()
    }
    return entry.value
  }

  const { getDocs } = await import("firebase/firestore")
  const snap   = await getDocs(q)
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  cacheSet(key, result, ttl)
  return result
}

export { TTL_SHORT, TTL_LONG }
