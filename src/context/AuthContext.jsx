/**
 * AuthContext.jsx — Real-Time Auth with onSnapshot (Improvement #2)
 *
 * ─── WHAT CHANGED FROM THE ORIGINAL ─────────────────────────────────────────
 *
 * BEFORE (getDoc — one-time read):
 *   onAuthStateChanged fires → getDoc(users/<uid>) → set state → done.
 *   Problem: If an admin bans a user AFTER they're already logged in, the ban
 *   won't take effect until the user refreshes or logs out and back in.
 *   The in-memory cache made this even worse — a cached banned:false would
 *   persist for the entire session.
 *
 * AFTER (onSnapshot — real-time listener):
 *   onAuthStateChanged fires → onSnapshot(users/<uid>) → set state.
 *   Now: any change to the user's Firestore document (role change, ban toggle)
 *   is pushed to the client immediately. A banned user is kicked out within
 *   seconds of an admin toggling the flag — without a page reload.
 *
 * READ COST ANALYSIS:
 *   - onSnapshot counts as 1 read when the listener is first attached.
 *   - Each subsequent push from Firestore (when the doc actually changes)
 *     also counts as 1 read. But changes to a user doc are rare (only when
 *     admin modifies role/ban), so the real-world cost is nearly identical
 *     to the old getDoc approach.
 *   - We REMOVED the in-memory _userProfileCache that was delaying ban
 *     enforcement. The onSnapshot listener IS the cache — it holds the
 *     latest known state in React state with zero extra reads.
 *
 * LISTENER LIFECYCLE:
 *   onAuthStateChanged fires:
 *     user logged IN  → start onSnapshot for users/<uid>
 *     user logged OUT → unsubscribeProfile() to detach the listener
 *   This prevents memory leaks and avoids listener accumulation on
 *   repeated sign-in/sign-out cycles.
 *
 * ─── FUTURE IMPROVEMENT: Firebase Custom Auth Claims ──────────────────────────
 *
 * To reduce Firestore reads to ZERO for auth checks, use Custom Claims:
 *
 * CONCEPT:
 *   Firebase Auth tokens (JWTs) can carry arbitrary key-value pairs called
 *   "custom claims" set server-side via the Admin SDK. Example:
 *     admin.auth().setCustomUserClaims(uid, { role: "admin", banned: false })
 *
 *   The claim is embedded in the ID token that is refreshed every hour.
 *   Your client reads it via:
 *     const { role, banned } = (await user.getIdTokenResult()).claims
 *
 *   No Firestore read required at all — the role is IN the JWT.
 *
 * MIGRATION STEPS:
 *   1. Write a Firebase Cloud Function triggered on users/{uid} write:
 *      exports.syncClaimsOnUserWrite = functions.firestore
 *        .document("users/{uid}")
 *        .onWrite(async (change, context) => {
 *          const data = change.after.data()
 *          await admin.auth().setCustomUserClaims(context.params.uid, {
 *            role:   data.role   ?? "user",
 *            banned: data.banned ?? false,
 *          })
 *        })
 *
 *   2. In AuthContext, replace onSnapshot with:
 *      onAuthStateChanged(auth, async (user) => {
 *        if (!user) { ... clear state ... return }
 *        const { claims } = await user.getIdTokenResult(true) // force-refresh
 *        if (claims.banned) { signOut(auth); return }
 *        setUserRole(claims.role ?? "user")
 *        setCurrentUser(user)
 *        setLoading(false)
 *      })
 *
 *   3. In ProtectedRoute, read role from claims instead of Firestore.
 *
 *   TRADE-OFF: Claims are only refreshed when the token refreshes (~1 hour).
 *   A ban won't take effect instantly unless you force a token refresh on
 *   the client — which requires the client to be online and call
 *   user.getIdToken(true). For near-instant bans, keep onSnapshot but use
 *   claims for role-based routing (the cheaper, more frequent operation).
 */

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { auth, db } from "../firebase/config"
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth"
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore"
import { clearCache } from "../firebase/firestoreCache"

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [currentUser,  setCurrentUser]  = useState(null)
  const [userRole,     setUserRole]     = useState(null)
  const [userProfile,  setUserProfile]  = useState(null)
  const [userBanned,   setUserBanned]   = useState(false)
  const [loading,      setLoading]      = useState(true)

  // Holds the unsubscribe function for the active profile listener.
  // Using a ref (not state) so we can call it without triggering re-renders.
  const unsubscribeProfileRef = useRef(null)

  // ── Internal: attach a real-time listener to users/<uid> ──────────────────
  function attachProfileListener(uid) {
    // Always detach any previous listener first to prevent duplicates
    // (can happen if onAuthStateChanged fires twice in StrictMode).
    if (unsubscribeProfileRef.current) {
      unsubscribeProfileRef.current()
      unsubscribeProfileRef.current = null
    }

    const userDocRef = doc(db, "users", uid)

    const unsub = onSnapshot(
      userDocRef,
      // ── onNext: called immediately with current data, then on every change ─
      (snap) => {
        if (!snap.exists()) {
          // Document deleted — sign out defensively
          signOut(auth)
          return
        }

        const data = snap.data()
        const profile = { uid, ...data }

        // ── Real-time ban enforcement ────────────────────────────────────────
        // If an admin toggles banned:true, this callback fires within ~1s.
        // We immediately sign the user out — no polling, no page refresh needed.
        if (data.banned) {
          console.warn("[AuthContext] User is banned. Signing out.")
          signOut(auth) // triggers onAuthStateChanged → clears state below
          setUserBanned(true)
          return
        }

        // ── Update React state with latest profile data ──────────────────────
        clearLoadingTimeout()  // snapshot arrived — cancel the safety timeout
        setUserRole(data.role ?? "user")
        setUserProfile(profile)
        setUserBanned(false)
        setLoading(false)
      },

      // ── onError: listener detached by Firestore (e.g., permissions change) ─
      (error) => {
        console.error("[AuthContext] Profile listener error:", error.code)
        // Don't sign out on permission errors — the user may have just been
        // created and rules haven't propagated yet. Just log and continue.
        clearLoadingTimeout()
        setLoading(false)
      }
    )

    unsubscribeProfileRef.current = unsub
  }

  // ── Internal: detach profile listener and clear all state ─────────────────
  function detachProfileListener() {
    if (unsubscribeProfileRef.current) {
      unsubscribeProfileRef.current()
      unsubscribeProfileRef.current = null
    }
    setCurrentUser(null)
    setUserRole(null)
    setUserProfile(null)
    setUserBanned(false)
    // Clear the Firestore query cache so stale data doesn't persist after
    // a different user logs in on the same device.
    clearCache()
  }

  // ── Safety timeout ref — prevents loading from hanging forever ────────────
  const loadingTimeoutRef = useRef(null)

  function clearLoadingTimeout() {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }
  }

  // ── Main auth state observer ───────────────────────────────────────────────
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user)
        // ── Critical: set loading=true before snapshot arrives ──────────────
        // Between setCurrentUser() and the first onSnapshot callback there is
        // a brief window where currentUser is set but userRole is still null
        // (cleared by the previous logout). ProtectedRoute sees
        // adminOnly && null !== "admin" → true → redirects admin to /dashboard.
        // Setting loading=true here holds ProtectedRoute in null-render mode
        // until onSnapshot fires and sets the correct role.
        // onSnapshot callback sets loading=false once role is known.
        setLoading(true)

        // ── Safety net: if onSnapshot never fires (network issue, Firestore
        // rules blocking the read, cold-start timeout), release the loading
        // gate after 8 seconds so the app doesn't hang on a blank screen.
        clearLoadingTimeout()
        loadingTimeoutRef.current = setTimeout(() => {
          console.warn("[AuthContext] Profile snapshot timed out — releasing loading gate")
          setLoading(false)
        }, 8000)

        attachProfileListener(user.uid)
      } else {
        // User logged out — clean up everything.
        clearLoadingTimeout()
        detachProfileListener()
        setLoading(false)
      }
    })

    // Cleanup: detach both listeners when the AuthProvider unmounts
    return () => {
      unsubscribeAuth()
      clearLoadingTimeout()
      if (unsubscribeProfileRef.current) {
        unsubscribeProfileRef.current()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth actions ───────────────────────────────────────────────────────────
  async function signup(email, password, name) {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await setDoc(doc(db, "users", result.user.uid), {
      name,
      email: email.toLowerCase().trim(),  // always lowercase — ensures email search works
      role:     "user",
      joinDate: new Date().toISOString(),
      banned:   false,
    })
    // onAuthStateChanged will fire and attachProfileListener() will be called
    // automatically — no manual state setting needed here.
    return result
  }

  async function login(email, password) {
    // We intentionally do NOT check banned here — onSnapshot handles it
    // automatically once the listener attaches after sign-in.
    return signInWithEmailAndPassword(auth, email, password)
  }

  async function googleSignIn() {
    const provider = new GoogleAuthProvider()
    const result   = await signInWithPopup(auth, provider)
    const uid      = result.user.uid

    const userRef  = doc(db, "users", uid)
    const existing = await getDoc(userRef)

    if (existing.exists()) {
      // User already has a profile — only update display name and email.
      // NEVER write role or banned here: that would overwrite admin→user.
      await updateDoc(userRef, {
        name:  result.user.displayName ?? existing.data().name,
        email: result.user.email,
      })
    } else {
      // First-time Google sign-in — safe to create full profile with defaults.
      await setDoc(userRef, {
        name:     result.user.displayName,
        email:    result.user.email,
        role:     "user",
        joinDate: new Date().toISOString(),
        banned:   false,
      })
    }
    return result
  }

  function logout() {
    return signOut(auth)
    // detachProfileListener() runs automatically via onAuthStateChanged
  }

  // Exposed so Profile.jsx can update the name and trigger a listener push
  async function updateProfileName(name) {
    if (!currentUser) return
    await updateDoc(doc(db, "users", currentUser.uid), { name: name.trim() })
    // onSnapshot will fire with the new data and update userProfile in state.
    // No manual cache invalidation or state update needed.
  }

  const value = {
    currentUser,
    userRole,
    userProfile,
    userBanned,
    loading,
    signup,
    login,
    googleSignIn,
    logout,
    updateProfileName,
  }

  // Block rendering until we know the auth + profile state.
  // The onSnapshot callback sets loading:false after the first profile read.
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
