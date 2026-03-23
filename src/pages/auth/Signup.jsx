import { useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { Link } from "react-router-dom"


  function friendlyAuthError(err) {
    const code = err?.code || ""
    if (code.includes("wrong-password") || code.includes("invalid-credential"))
      return "Incorrect email or password. Please try again."
    if (code.includes("user-not-found"))
      return "No account found with this email. Please sign up first."
    if (code.includes("email-already-in-use"))
      return "An account with this email already exists. Try logging in."
    if (code.includes("too-many-requests"))
      return "Too many failed attempts. Please wait a few minutes and try again."
    if (code.includes("network-request-failed"))
      return "Network error. Check your connection and try again."
    if (code.includes("popup-closed-by-user"))
      return "Sign-in window was closed. Please try again."
    return err?.message || "Something went wrong. Please try again."
  }
export default function Signup() {
  const { signup, googleSignIn } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setError("")
    if (password !== confirm) return setError("Passwords do not match")
    if (password.length < 6) return setError("Password must be at least 6 characters")
    setLoading(true)
    try {
      await signup(email, password, name)
      // App.jsx signup route redirects by role once snapshot fires
    } catch (err) {
      setError(friendlyAuthError(err))
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setError("")
    try {
      await googleSignIn()
      // App.jsx signup route redirects by role once snapshot fires
    } catch (err) {
      setError(friendlyAuthError(err))
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyan-400">Quiz App 🚀</h1>
          <p className="text-gray-400 mt-2">Create your account</p>
        </div>
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>
        )}
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-gray-300 text-sm font-medium mb-1 block">Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-cyan-400 focus:outline-none"
              placeholder="Your Name" required />
          </div>
          <div>
            <label className="text-gray-300 text-sm font-medium mb-1 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-cyan-400 focus:outline-none"
              placeholder="you@example.com" required />
          </div>
          <div>
            <label className="text-gray-300 text-sm font-medium mb-1 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-cyan-400 focus:outline-none"
              placeholder="••••••••" required />
          </div>
          <div>
            <label className="text-gray-300 text-sm font-medium mb-1 block">Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-cyan-400 focus:outline-none"
              placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold py-3 rounded-lg transition disabled:opacity-50">
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-gray-600" />
          <span className="px-4 text-gray-500 text-sm">or</span>
          <div className="flex-1 border-t border-gray-600" />
        </div>
        <button onClick={handleGoogle}
          className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 rounded-lg flex items-center justify-center gap-3 transition">
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" />
          Continue with Google
        </button>
        <p className="text-center text-gray-400 mt-6 text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-cyan-400 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
