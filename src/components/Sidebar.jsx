import UttarPathLogo from "./UttarPathLogo"
import toast from "react-hot-toast"
import { NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import {
  LayoutDashboard, BookOpen, Users, LogOut,
  Megaphone, GraduationCap, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen
} from "lucide-react"
import { useState, useEffect } from "react"

const links = [
  { to: "/admin",               label: "Overview",      icon: LayoutDashboard, end: true },
  { to: "/admin/quizzes",       label: "Quiz Manager",  icon: BookOpen },
  { to: "/admin/batches",       label: "Batches",       icon: GraduationCap },
  { to: "/admin/users",         label: "User Manager",  icon: Users },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
]

export default function Sidebar() {
  const { logout } = useAuth()
  const navigate   = useNavigate()

  // Persist collapsed state so it survives navigation
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true" } catch { return false }
  })

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem("sidebar_collapsed", String(next)) } catch {}
      return next
    })
  }

  async function handleLogout() {
    try { await logout(); navigate("/login") }
    catch (e) { console.error("Logout failed:", e); toast.error("Logout failed, please try again.") }
  }

  return (
    <aside className={`${collapsed ? "w-14" : "w-64"} min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 shrink-0`}>

      {/* Header */}
      <div className={`border-b border-gray-800 flex items-center ${collapsed ? "justify-center px-2 py-4" : "justify-between px-5 py-5"}`}>
        {!collapsed && (
          <div>
            <UttarPathLogo size="md" />
            <span className="text-xs text-purple-400 font-semibold uppercase tracking-widest mt-1.5 block">Admin Panel</span>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                collapsed ? "justify-center" : ""
              } ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent"
              }`
            }>
            <Icon size={17} className="shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
            {!collapsed && <ChevronRight size={13} className="opacity-0 group-hover:opacity-60 transition shrink-0" />}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-2 py-3 border-t border-gray-800">
        <button onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all ${collapsed ? "justify-center" : ""}`}>
          <LogOut size={17} className="shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  )
}