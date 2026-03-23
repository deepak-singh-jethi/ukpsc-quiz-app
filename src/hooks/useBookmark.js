// src/hooks/useBookmark.js
// Reusable hook — call anywhere to toggle a question bookmark
import { useState, useEffect } from "react"
import { db } from "../firebase/config"
import {
  collection, query, where, getDocs,
  addDoc, deleteDoc, doc
} from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_LONG } from "../firebase/firestoreCache"

export function useBookmark(userId) {
  const [bookmarkedIds, setBookmarkedIds] = useState({}) // key: questionKey → bookmarkDocId

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        // Sprint 3 Fix B: TTL_LONG (5 min) + revalidate:true + localStorage persistence.
        // Cache key "bookmarks:{uid}" matches the PERSIST_PREFIX_TTL prefix "query:bookmarks:"
        // so it's written to localStorage on first load and survives page refresh.
        //
        // Lifecycle:
        //   Cold (no localStorage): Firestore fetch → stored in localStorage → shown instantly
        //   Warm (within 5 min):    localStorage hit → shown in ~0ms → background revalidate
        //                           fires only if data is > 3 min old (60% of 5 min TTL)
        //   Toggle bookmark:        invalidateCache() wipes memory + localStorage immediately
        //                           → next load always hits Firestore fresh
        //
        // Result: bookmarks appear instantly on every page load after the first visit.
        // User's own add/remove always reflects immediately via optimistic local state.
        const data = await cachedGetDocs(
          `bookmarks:${userId}`,
          query(collection(db, "bookmarks"), where("userId", "==", userId)),
          {
            ttl: TTL_LONG,
            revalidate: true,
            onUpdate: (fresh) => {
              const map = {}
              fresh.forEach(d => { map[d.questionKey] = d.id })
              setBookmarkedIds(map)
            },
          }
        )
        const map = {}
        data.forEach(d => { map[d.questionKey] = d.id })
        setBookmarkedIds(map)
      } catch (e) { console.error(e) }
    }
    load()
  }, [userId])

  function isBookmarked(questionKey) {
    return !!bookmarkedIds[questionKey]
  }

  async function toggleBookmark({ questionKey, question, options, correct, selected, quizTitle, quizId, attemptId }) {
    if (!userId) return
    if (bookmarkedIds[questionKey]) {
      // Remove
      try {
        await deleteDoc(doc(db, "bookmarks", bookmarkedIds[questionKey]))
        setBookmarkedIds(prev => { const n = { ...prev }; delete n[questionKey]; return n })
        invalidateCache(`query:bookmarks:${userId}`)
      } catch (e) { console.error(e) }
    } else {
      // Add
      try {
        const ref = await addDoc(collection(db, "bookmarks"), {
          userId, questionKey, question, options, correct,
          selected: selected ?? -1,
          quizTitle: quizTitle || "",
          quizId: quizId || "",
          attemptId: attemptId || "",
          savedAt: new Date().toISOString(),
        })
        setBookmarkedIds(prev => ({ ...prev, [questionKey]: ref.id }))
        invalidateCache(`query:bookmarks:${userId}`)
      } catch (e) { console.error(e) }
    }
  }

  return { isBookmarked, toggleBookmark }
}
