import { Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

// FIX: ProtectedRoute now waits for AuthContext to finish its initial
// auth check before making any redirect decision.
//
// BEFORE: currentUser starts as null (AuthContext loading: true).
//   ProtectedRoute sees null → redirects to /login immediately.
//   Firebase then resolves auth → redirects back to the intended page.
//   Result: visible login page flash on every page refresh.
//
// AFTER: while loading is true we render null (blank, not a flash).
//   Once AuthContext has resolved (onAuthStateChanged + onSnapshot fired),
//   loading becomes false and we make the correct one-time redirect decision.
//
// AuthContext guarantees loading turns false after the first profile read,
// so this null render is always brief (~100-300ms, one Firestore read).
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { currentUser, userRole, loading } = useAuth()

  // Still resolving auth — render nothing to avoid a flash redirect
  if (loading) return null

  if (!currentUser) return <Navigate to="/login" replace />
  if (adminOnly && userRole !== "admin") return <Navigate to="/dashboard" replace />
  return children
}
