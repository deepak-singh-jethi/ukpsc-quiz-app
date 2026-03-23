import toast from "react-hot-toast"
import UttarPathLogo from "./UttarPathLogo"
import { useNavigate, NavLink } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { LayoutDashboard, History, LogOut, Shield, Bookmark, GraduationCap } from "lucide-react"

export default function Navbar() {
  const { logout, userRole, currentUser } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await logout()
      navigate("/login")
    } catch (e) {
      console.error("Logout failed:", e)
      toast.error("Logout failed, please try again.")
    }
  }

  const initial = (
    currentUser?.displayName?.charAt(0) ||
    currentUser?.email?.charAt(0) ||
    "U"
  ).toUpperCase()

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <div className="cursor-pointer shrink-0" onClick={() => navigate("/dashboard")}>
          <UttarPathLogo size="md" />
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? "text-cyan-400 bg-cyan-500/10" : "text-gray-400 hover:text-white hover:bg-gray-800"}`
            }>
            <LayoutDashboard size={14} /> Dashboard
          </NavLink>
          <NavLink to="/batches"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? "text-purple-400 bg-purple-500/10" : "text-gray-400 hover:text-white hover:bg-gray-800"}`
            }>
            <GraduationCap size={14} /> Batches
          </NavLink>
          <NavLink to="/history"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? "text-cyan-400 bg-cyan-500/10" : "text-gray-400 hover:text-white hover:bg-gray-800"}`
            }>
            <History size={14} /> History
          </NavLink>
          <NavLink to="/bookmarks"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? "text-amber-400 bg-amber-500/10" : "text-gray-400 hover:text-white hover:bg-gray-800"}`
            }>
            <Bookmark size={14} /> Bookmarks
          </NavLink>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {userRole === "admin" && (
          <button onClick={() => navigate("/admin")}
            className="flex items-center gap-1.5 text-sm bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-lg transition">
            <Shield size={13} /> Admin
          </button>
        )}
        <button onClick={() => navigate("/profile")}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <span className="text-xs font-black text-white">{initial}</span>
          </div>
          <span className="text-gray-400 text-sm hidden sm:block group-hover:text-white transition">
            {currentUser?.displayName?.split(" ")[0] || currentUser?.email?.split("@")[0] || "Profile"}
          </span>
        </button>
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition">
          <LogOut size={14} />
        </button>
      </div>
    </nav>
  )
}