import { useState, useEffect } from "react"
import { useAuth } from "../../context/AuthContext"
import { db, auth } from "../../firebase/config"
import { doc, updateDoc } from "firebase/firestore"
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth"
import Navbar from "../../components/Navbar"
import { User, Lock, Save, Trophy, Target, Flame, ClipboardList, Eye, EyeOff } from "lucide-react"
import toast from "react-hot-toast"

export default function Profile() {
  //  Optimisation: read from AuthContext cached profile instead of getDoc 
  // The original code did getDoc(users/<uid>) on every Profile mount.
  // userProfile is already fetched and cached in AuthContext at login,
  // giving us name/role/joinDate for free.
  const { currentUser, userProfile } = useAuth()
  // Stats come from userProfile.stats (updated live via AuthContext onSnapshot)

  const [name, setName] = useState(userProfile?.name || "")
  const [savingName, setSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const isGoogle = currentUser?.providerData?.[0]?.providerId === "google.com"

  // Sync name input if userProfile changes (e.g. after context re-load)
  useEffect(() => {
    if (userProfile?.name && !name) setName(userProfile.name)
  }, [userProfile])



  async function handleSaveName() {
    if (!name.trim()) return toast.error("Name cannot be empty")
    setSavingName(true)
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { name: name.trim() })
      await updateProfile(auth.currentUser, { displayName: name.trim() })
      // onSnapshot in AuthContext automatically picks up the name change
      toast.success("Name updated!")
    } catch (e) { console.error(e); toast.error("Failed to update name") }
    setSavingName(false)
  }

  async function handleChangePassword() {
    if (!currentPassword) return toast.error("Enter your current password")
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters")
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match")
    setSavingPassword(true)
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
      await reauthenticateWithCredential(auth.currentUser, credential)
      await updatePassword(auth.currentUser, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Password changed successfully!")
    } catch (e) {
      if (e.code === "auth/wrong-password") toast.error("Current password is incorrect")
      else toast.error("Failed to change password")
    }
    setSavingPassword(false)
  }

  // Use cached profile values  -  no getDoc needed
  const displayName  = name || userProfile?.name || " - "
  const role         = userProfile?.role || "user"
  const joinDate     = userProfile?.joinDate

  // Stats from userProfile.stats  -  populated after Phase 3 deploy.
  // Shows zeros until user submits their next quiz (stats written on each submission).
  const s        = userProfile?.stats || {}
  const hasStats = !!(s.totalAttempts)
  const avgScore = hasStats && s.firstAttempts && s.firstTotalScore
    ? Math.round(s.firstTotalScore / s.firstAttempts) : 0
  const statCards = [
    { label: "Quizzes Taken", value: s.totalAttempts ?? 0,     icon: ClipboardList, color: "text-cyan-400" },
    { label: "Best Score",    value: `${s.bestScore ?? 0}%`,   icon: Trophy,        color: "text-yellow-400" },
    { label: "Best Streak",   value: ` ${s.bestStreak ?? 0}`, icon: Flame,        color: "text-orange-400" },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 py-10">

        <div className="mb-8">
          <h2 className="text-2xl font-black">My Profile</h2>
          <p className="text-gray-400 mt-1">Manage your account and view your stats</p>
        </div>

        {/* Avatar + basic info */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <span className="text-2xl font-black text-white">
              {(displayName || currentUser?.email || "?").charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-white font-bold text-lg">{userProfile?.name || " - "}</p>
            <p className="text-gray-500 text-sm">{currentUser?.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-gray-700 text-gray-400"
              }`}>
                {role}
              </span>
              {joinDate && (
                <span className="text-gray-600 text-xs">
                  Joined {new Date(joinDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats  -  from userProfile.stats, no Firestore read needed */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <Icon size={16} className={`mx-auto mb-2 ${color}`} />
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-gray-600 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Update Name */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-cyan-400" />
            <h3 className="font-bold text-white">Display Name</h3>
          </div>
          <div className="flex gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none text-sm"
              placeholder="Your name"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || !name.trim()}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold px-4 py-2.5 rounded-lg transition text-sm disabled:opacity-50">
              <Save size={14} /> {savingName ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Change Password  -  only for email users */}
        {!isGoogle ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={16} className="text-cyan-400" />
              <h3 className="font-bold text-white">Change Password</h3>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <label className="text-gray-400 text-xs mb-1 block">Current Password</label>
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none text-sm pr-10"
                  placeholder="********"
                />
                <button onClick={() => setShowCurrent(s => !s)}
                  className="absolute right-3 top-7 text-gray-500 hover:text-gray-300 transition">
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="relative">
                <label className="text-gray-400 text-xs mb-1 block">New Password</label>
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none text-sm pr-10"
                  placeholder="Min 6 characters"
                />
                <button onClick={() => setShowNew(s => !s)}
                  className="absolute right-3 top-7 text-gray-500 hover:text-gray-300 transition">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none text-sm"
                  placeholder="********"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 rounded-xl transition text-sm disabled:opacity-40">
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Lock size={16} className="text-gray-600" />
              <h3 className="font-bold text-gray-500">Password</h3>
            </div>
            <p className="text-gray-600 text-sm">
              You signed in with Google. Password management is handled by Google.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
