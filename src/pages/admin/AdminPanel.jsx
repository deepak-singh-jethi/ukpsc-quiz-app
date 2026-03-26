import { useEffect, useState, useMemo, useCallback } from "react"
import { db } from "../../firebase/config"
import { collection, query, orderBy, limit, getCountFromServer } from "firebase/firestore"
import { cachedGetDocs, invalidateCache, TTL_SHORT } from "../../firebase/firestoreCache"
import AdminLayout from "../../components/AdminLayout"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Users, BookOpen, ClipboardList, TrendingUp, GraduationCap,
  ChevronRight, ArrowUp, ArrowDown, Minus,
  BarChart2, Target, Activity, AlertTriangle,
  RefreshCw, UserX, Layers, Zap, TrendingDown,
  Clock, Award, BookMarked, Bell,
} from "lucide-react"

// pct clamped to [0,100] - prevents negative scores from negative marking
const pct        = (score, max) => max > 0 ? Math.max(0, Math.min(100, Math.round((score / max) * 100))) : 0
const scoreColor = v => v >= 70 ? "text-emerald-400" : v >= 50 ? "text-amber-400" : "text-rose-400"
const scoreBg    = v => v >= 70 ? "bg-emerald-500/50" : v >= 50 ? "bg-amber-500/50" : "bg-rose-500/50"
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function Skeleton({ className = "" }) {
  return <div className={`bg-gray-800/80 animate-pulse rounded-xl ${className}`} />
}

function StatCard({ label, value, icon: Icon, color, border, bg, trend, trendLabel, loading, href }) {
  const navigate = useNavigate()
  const handleClick = href ? () => navigate(href) : undefined
  return (
    <div
      onClick={handleClick}
      className={`rounded-2xl border px-5 py-4 ${border} ${bg} flex flex-col gap-3 ${href ? "cursor-pointer hover:brightness-110 transition" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <Icon size={14} className={color} />
      </div>
      {loading
        ? <Skeleton className="h-8 w-20" />
        : <p className={`text-3xl font-black leading-none ${color}`}>{value}</p>}
      {trend !== undefined && !loading && (
        <div className={`flex items-center gap-1 text-[11px] font-semibold ${
          trend > 0 ? "text-emerald-400" : trend < 0 ? "text-rose-400" : "text-gray-500"}`}>
          {trend > 0 ? <ArrowUp size={11}/> : trend < 0 ? <ArrowDown size={11}/> : <Minus size={11}/>}
          <span>{trendLabel || `${Math.abs(trend)}% vs last week`}</span>
        </div>
      )}
    </div>
  )
}

function BarChart({ data, height = 160, colorClass = "bg-cyan-500", loading }) {
  const max    = Math.max(...data.map(d => d.count), 1)
  // Reserve fixed 18px at bottom for labels so every column is the same height
  const LABEL  = 18
  const barMax = height - LABEL
  if (loading) return <Skeleton className="w-full" style={{ height }} />
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max(4, Math.round((d.count / max) * (barMax - 16))) : 0
        return (
          <div key={i} className="flex-1 flex flex-col group" style={{ height }}>
            {/* Top: hover count tooltip */}
            <div className="flex-1 flex flex-col items-center justify-end" style={{ height: barMax - barH - 16 > 0 ? undefined : undefined }}>
              {d.count > 0 && (
                <span className="text-[9px] text-gray-600 mb-1 opacity-0 group-hover:opacity-100 transition font-mono">
                  {d.count}
                </span>
              )}
              <div
                title={`${d.label || i}: ${d.count}`}
                className={`w-full rounded-sm transition-all duration-500 ${
                  d.count > 0 ? `${colorClass} hover:brightness-125` : "bg-transparent"
                }`}
                style={{ height: barH, transitionDelay: `${i * 0.015}s` }}
              />
            </div>
            {/* Bottom: fixed-height label slot  -  always 18px so all bars align */}
            <div style={{ height: LABEL }} className="flex items-end justify-center overflow-hidden">
              {d.label
                ? <p className="text-[9px] text-gray-700 mt-1 text-center leading-tight truncate w-full">{d.label}</p>
                : null
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScoreDistrib({ distrib, total, loading }) {
  const colors  = ["bg-rose-500",    "bg-amber-500",   "bg-cyan-500",    "bg-emerald-500"]
  const txts    = ["text-rose-400",  "text-amber-400", "text-cyan-400",  "text-emerald-400"]
  const borders = ["border-rose-500/20","border-amber-500/20","border-cyan-500/20","border-emerald-500/20"]
  const bgs     = ["bg-rose-500/8",  "bg-amber-500/8", "bg-cyan-500/8",  "bg-emerald-500/8"]
  if (loading) return <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12"/>)}</div>
  return (
    <div className="space-y-2.5">
      {distrib.map((b, i) => {
        const w = total > 0 ? Math.round((b.count / total) * 100) : 0
        return (
          <div key={b.label} className={`rounded-xl border px-4 py-2.5 ${borders[i]} ${bgs[i]}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-bold ${txts[i]}`}>{b.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{w}%</span>
                <span className={`text-xs font-black ${txts[i]}`}>{b.count}</span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-800/60 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colors[i]} transition-all duration-700`}
                style={{ width: `${w}%`, transitionDelay: `${i * 0.08}s` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Action Items card - synthesized recommendations from analytics data
function ActionItems({ items, loading }) {
  if (loading) return <Skeleton className="h-24 w-full" />
  if (!items.length) return null
  const iconMap = { warning: AlertTriangle, info: Zap, success: Award, clock: Clock }
  const colorMap = {
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    info:    "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    clock:   "text-purple-400 bg-purple-500/10 border-purple-500/20",
  }
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-cyan-400" />
        <p className="text-sm font-bold text-white">Action Items</p>
        <span className="ml-auto text-[11px] text-gray-600">{items.length} item{items.length !== 1 ? "s" : ""} need attention</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => {
          const Icon = iconMap[item.type] || Zap
          const cls  = colorMap[item.type] || colorMap.info
          return (
            <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-2.5 ${cls}`}>
              <Icon size={13} className="shrink-0 mt-0.5" />
              <p className="text-xs font-semibold flex-1">{item.text}</p>
              {item.action && (
                <a href={item.href} className="text-[11px] font-bold underline underline-offset-2 shrink-0 hover:opacity-80">
                  {item.action}
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OverviewTab({ stats, dailyData, scoreDistrib, categoryBreakdown, actionItems, isCapped, loading }) {
  const navigate  = useNavigate()
  const [range, setRange] = useState("30d")

  // Slice dailyData based on selected range
  const visibleData = range === "7d"  ? dailyData.slice(-7)
                    : range === "30d" ? dailyData
                    : dailyData  // "all" = full 30 days (max we fetch)

  const thisWeek  = dailyData.slice(-7).reduce((s, d) => s + d.count, 0)
  const lastWeek  = dailyData.slice(-14, -7).reduce((s, d) => s + d.count, 0)
  const weekTrend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null

  const todayCount     = dailyData[dailyData.length - 1]?.count ?? 0
  const yesterdayCount = dailyData[dailyData.length - 2]?.count ?? 0

  const statCards = [
    { label:"Total Users",    value: stats.users,    color:"text-cyan-400",    border:"border-cyan-500/20",    bg:"bg-cyan-500/6",    icon:Users,         href:"/admin/users",    trend: undefined },
    { label:"Quiz Sets",      value: stats.quizzes,  color:"text-purple-400",  border:"border-purple-500/20",  bg:"bg-purple-500/6",  icon:BookOpen,      href:"/admin/quizzes",  trend: undefined },
    { label:"Batches",        value: stats.batches,  color:"text-indigo-400",  border:"border-indigo-500/20",  bg:"bg-indigo-500/6",  icon:GraduationCap, href:"/admin/batches",  trend: undefined },
    {
      label:"Total Attempts", value: stats.attempts,
      color:"text-emerald-400", border:"border-emerald-500/20", bg:"bg-emerald-500/6", icon:ClipboardList,
      trend: weekTrend,
      trendLabel: weekTrend === null ? "First week of data" : `${Math.abs(weekTrend)}% vs last week`,
    },
  ]

  return (
    <div className="space-y-5">
      {isCapped && !loading && (
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-400">Showing most recent 500 attempts only</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Your platform has {stats.attempts.toLocaleString()} total attempts. Analytics reflect only the most recent 500.
              Older quizzes and students may not appear in other tabs.
            </p>
          </div>
        </div>
      )}

      {/* Main Top Section Grid */}
      <div className="flex flex-col gap-5">

        {/* Stat Cards + Daily Attempts Chart */}
        <div className="flex flex-col gap-5">
          {/* Stat Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map(c => <StatCard key={c.label} {...c} loading={loading} />)}
          </div>

          {/* Daily Attempts Chart Row */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 flex flex-col flex-1 min-h-[300px]">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-white">
                {range === "7d" ? "Daily Attempts - Last 7 Days" : "Daily Attempts - Last 30 Days"}
              </p>
              <div className="flex items-center gap-2">
                {/* Range selector */}
                <div className="flex gap-1">
                  {[["7d","7D"],["30d","30D"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setRange(val)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition ${
                        range === val
                          ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                          : "text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-700"
                      }`}>{lbl}</button>
                  ))}
                </div>
                {!loading && (
                  <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-xl px-3 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    <span className="text-[11px] font-bold text-white">{todayCount} today</span>
                    {yesterdayCount > 0 && (
                      <span className={`text-[10px] font-semibold ml-0.5 ${todayCount >= yesterdayCount ? "text-emerald-400" : "text-rose-400"}`}>
                        {todayCount >= yesterdayCount ? "+" : ""}{todayCount - yesterdayCount} vs yday
                      </span>
                    )}
                  </div>
                )}
                {weekTrend !== null && (
                  <span className={`text-[11px] font-bold flex items-center gap-1 ${
                    weekTrend > 0 ? "text-emerald-400" : weekTrend < 0 ? "text-rose-400" : "text-gray-500"}`}>
                    {weekTrend > 0 ? <ArrowUp size={10}/> : weekTrend < 0 ? <ArrowDown size={10}/> : <Minus size={10}/>}
                    {Math.abs(weekTrend)}% this week
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              {visibleData.reduce((s, d) => s + d.count, 0)} attempts in this window
            </p>
            <div className="mt-auto">
              <BarChart data={visibleData} height={160} loading={loading} />
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}

function QuizPerfTab({ quizPerf, totalQuizzes, isCapped, loading }) {
  const navigate = useNavigate()
  const [sort, setSort] = useState("attempts")

  const sorted = useMemo(() => {
    const arr = [...quizPerf]
    if (sort === "attempts") return arr.sort((a, b) => b.attempts - a.attempts)
    if (sort === "avg_desc") return arr.filter(q => q.attempts >= 3).sort((a, b) => b.avg - a.avg)
      .concat(arr.filter(q => q.attempts < 3).sort((a, b) => b.attempts - a.attempts))
    if (sort === "avg_asc")  return arr.filter(q => q.attempts >= 3).sort((a, b) => a.avg - b.avg)
      .concat(arr.filter(q => q.attempts < 3).sort((a, b) => b.attempts - a.attempts))
    if (sort === "retries")  return arr.sort((a, b) => b.retries - a.retries)
    return arr
  }, [quizPerf, sort])

  const maxAttempts = Math.max(...quizPerf.map(q => q.attempts), 1)
  const problemQuizzes = quizPerf.filter(q => q.attempts >= 5 && q.avg < 35)

  const sortBtns = [
    { key:"attempts", label:"Most Attempted" },
    { key:"avg_desc", label:"Best Score" },
    { key:"avg_asc",  label:"Lowest Score" },
    { key:"retries",  label:"Most Retried" },
  ]

  return (
    <div className="space-y-4">

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-white mr-2">Quiz Performance</p>
          <div className="flex gap-1.5 flex-wrap">
            {sortBtns.map(b => (
              <button key={b.key} onClick={() => setSort(b.key)}
                className={`text-[11px] font-semibold px-3 py-1 rounded-lg transition ${
                  sort === b.key
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : "text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700"}`}>
                {b.label}
              </button>
            ))}
          </div>
          {!loading && totalQuizzes > quizPerf.length && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-amber-400">
              <Layers size={11} />
              <span>{totalQuizzes - quizPerf.length} quiz{totalQuizzes - quizPerf.length !== 1 ? "zes" : ""} with 0 attempts</span>
            </div>
          )}
          {(sort === "avg_desc" || sort === "avg_asc") && (
            <span className="text-[10px] text-gray-600 border border-gray-800 rounded-lg px-2 py-1">
              3+ attempt quizzes first
            </span>
          )}
          {isCapped && !loading && (
            <span className="text-[10px] text-gray-600 border border-gray-800 rounded-lg px-2 py-1">
              capped at 500
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14"/>)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center text-gray-600 text-sm">No quiz data yet.</div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            <div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-widest text-gray-600 font-bold">
              <span className="col-span-1">#</span>
              <span className="col-span-4">Quiz</span>
              <span className="col-span-2 text-right">Attempts</span>
              <span className="col-span-2 text-right">Avg Score</span>
              <span className="col-span-2 text-right">Retries</span>
              <span className="col-span-1" />
            </div>
            {sorted.map((q, i) => (
              <div key={q.id}
                onClick={() => navigate(`/admin/quizzes/${q.id}/attempts`)}
                className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-gray-800/30 cursor-pointer transition group">
                <span className="col-span-1 text-xs font-black text-gray-700">#{i+1}</span>
                <div className="col-span-4 min-w-0">
                  <p className="text-sm text-gray-300 font-semibold truncate group-hover:text-white transition">{q.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {q.category && <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{q.category}</span>}
                    <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden max-w-[80px]">
                      <div className="h-full bg-purple-500/50 rounded-full transition-all duration-500"
                        style={{ width: `${(q.attempts / maxAttempts) * 100}%` }} />
                    </div>
                    {q.attempts < 3 && (
                      <span className="text-[9px] text-gray-600 italic">low data</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-sm font-bold text-gray-300">{q.attempts}</span>
                  <p className="text-[10px] text-gray-600">{q.uniqueStudents} students</p>
                </div>
                <div className="col-span-2 text-right">
                  <span className={`text-sm font-black ${q.attempts >= 3 ? "text-gray-300" : "text-gray-600"}`}>{q.avg}</span>
                  {q.attempts >= 3 && (
                    <div className="flex justify-end mt-1">
                      <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${scoreBg(q.avg)}`}
                          style={{ width: `${q.avg}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  <span className={`text-sm font-bold ${q.retries > 5 ? "text-amber-400" : "text-gray-500"}`}>
                    {q.retries}
                  </span>
                  <p className="text-[10px] text-gray-600">retries</p>
                </div>
                <div className="col-span-1 flex justify-end">
                  <ChevronRight size={13} className="text-gray-700 group-hover:text-gray-400 transition" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StudentsTab({ topStudents, strugglingStudents, goneSilent, mostImproved, neverAttempted, batchPerf, loading }) {
  const navigate = useNavigate()
  const medals = ["1st","2nd","3rd"]

  return (
    <div className="space-y-5">


      {!loading && goneSilent.length > 0 && (
        <div className="flex items-center gap-3 bg-purple-500/8 border border-purple-500/20 rounded-2xl px-5 py-3.5">
          <Clock size={18} className="text-purple-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-white">
              {goneSilent.length} student{goneSilent.length !== 1 ? "s" : ""} went silent - no attempts in 14+ days
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {goneSilent.slice(0, 3).map(s => s.name).join(", ")}{goneSilent.length > 3 ? ` and ${goneSilent.length - 3} more` : ""} - were active before but have stopped.
            </p>
          </div>
          <button onClick={() => navigate("/admin/announcements")}
            className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 border border-purple-500/20 hover:border-purple-500/40 rounded-xl px-3 py-1.5 transition shrink-0">
            Re-engage
          </button>
        </div>
      )}

      {!loading && batchPerf.length >= 1 && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={14} className="text-indigo-400" />
            <p className="text-sm font-bold text-white">Batch Performance</p>
            <span className="text-[11px] text-gray-600 ml-auto">avg score . first attempts</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {batchPerf.map(b => (
              <div key={b.batchId}
                onClick={() => navigate(`/admin/batches/${b.batchId}`)}
                className="bg-gray-800/40 rounded-xl px-4 py-3 border border-gray-700/40 cursor-pointer hover:border-gray-600 transition group">
                <p className="text-xs font-semibold text-gray-300 truncate mb-2 group-hover:text-white transition">{b.batchName}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-black leading-none text-gray-300">{b.avg}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{b.attempts} attempts . {b.students} students</p>
                  </div>
                  <div className="w-12 h-12">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="#1f2937" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15" fill="none"
                        stroke={b.avg >= 70 ? "#10b981" : b.avg >= 50 ? "#f59e0b" : "#f43f5e"}
                        strokeWidth="3"
                        strokeDasharray={`${(b.avg / 100) * 94.2} 94.2`}
                        strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(b.avg)}`}
                    style={{ width: `${b.avg}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <Target size={15} className="text-emerald-400" />
            <p className="text-sm font-bold text-white">Top Performers</p>
            <span className="ml-auto text-[11px] text-gray-600">by avg score . 3+ attempts</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14"/>)}</div>
          ) : topStudents.length === 0 ? (
            <div className="p-8 text-center text-gray-600 text-sm">No students with 3+ attempts yet.</div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {topStudents.map((s, i) => (
                <div key={s.uid}
                  onClick={() => navigate(`/admin/users/${s.uid}`)}
                  className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-800/30 cursor-pointer transition group">
                  <span className="text-sm font-black w-8 shrink-0 text-center text-gray-400">{medals[i] || `#${i+1}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-300 truncate group-hover:text-white transition">{s.name}</p>
                    <p className="text-[10px] text-gray-600">{s.attempts} attempts</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-gray-300">{s.attempts}</p>
                    <p className="text-[10px] text-gray-600">attempts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-amber-500/15 bg-gray-900/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-500/15 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400" />
            <p className="text-sm font-bold text-white">Needs Attention</p>
            <span className="ml-auto text-[11px] text-gray-600">avg &lt;50% . 3+ attempts</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14"/>)}</div>
          ) : strugglingStudents.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-emerald-400 font-bold text-sm">All students performing well!</p>
              <p className="text-gray-600 text-xs mt-1">No student with 3+ attempts is below 50% avg.</p>
            </div>
          ) : (
            <div className="divide-y divide-amber-500/10">
              {strugglingStudents.map(s => (
                <div key={s.uid}
                  onClick={() => navigate(`/admin/users/${s.uid}`)}
                  className="px-5 py-3.5 flex items-center gap-3 hover:bg-amber-500/5 cursor-pointer transition group">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-amber-400">{s.avg}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-300 truncate group-hover:text-white transition">{s.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden max-w-[100px]">
                        <div className="h-full bg-rose-500/60 rounded-full" style={{ width: `${s.avg}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-600">{s.attempts} attempts</span>
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-gray-700 group-hover:text-amber-400 transition shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!loading && mostImproved.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/15 bg-gray-900/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-emerald-500/15 flex items-center gap-2">
            <TrendingUp size={15} className="text-emerald-400" />
            <p className="text-sm font-bold text-white">Most Improved</p>
            <span className="ml-auto text-[11px] text-gray-600">first attempt vs latest . 3+ attempts</span>
          </div>
          <div className="divide-y divide-emerald-500/10">
            {mostImproved.map(s => (
              <div key={s.uid}
                onClick={() => navigate(`/admin/users/${s.uid}`)}
                className="px-5 py-3.5 flex items-center gap-3 hover:bg-emerald-500/5 cursor-pointer transition group">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-black text-emerald-400">+{s.improvement}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-300 truncate group-hover:text-white transition">{s.name}</p>
                  <p className="text-[10px] text-gray-600">
                    first: {s.firstScore} marks . latest: {s.latestScore} marks . {s.attempts} attempts
                  </p>
                </div>
                <ChevronRight size={13} className="text-gray-700 group-hover:text-emerald-400 transition shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityTab({ dailyData, weeklyComparison, dowPattern, loading }) {
  const [range, setRange] = useState("30d")
  const visibleData = range === "7d" ? dailyData.slice(-7) : dailyData

  const thisWeek   = dailyData.slice(-7).reduce((s, d) => s + d.count, 0)
  const lastWeek   = dailyData.slice(-14, -7).reduce((s, d) => s + d.count, 0)
  const trend      = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek * 100).toFixed(1) : null
  const trendUp    = trend !== null && Number(trend) >= 0
  const peakDay    = dailyData.reduce((best, d) => d.count > best.count ? d : best, { count: 0, label: " - " })
  const activeDays = dailyData.filter(d => d.count > 0).length
  const avgPerDay  = activeDays > 0 ? Math.round(dailyData.reduce((s, d) => s + d.count, 0) / activeDays) : 0
  const todayCount = dailyData[dailyData.length - 1]?.count ?? 0

  const kpis = [
    { label:"Today",       value: todayCount,                                                sub:"attempts so far",    color:"text-cyan-400" },
    { label:"This Week",   value: thisWeek,                                                  sub:"attempts",           color:"text-cyan-400" },
    { label:"Last Week",   value: lastWeek,                                                  sub:"attempts",           color:"text-gray-400" },
    { label:"Week Trend",  value: trend === null ? "N/A" : `${trendUp ? "+" : ""}${trend}%`, sub: trend === null ? "first week" : "change", color: trend === null ? "text-gray-500" : trendUp ? "text-emerald-400" : "text-rose-400" },
    { label:"Active Days", value: `${activeDays}/30`,                                        sub:"days with activity", color:"text-amber-400" },
    { label:"Daily Avg",   value: avgPerDay,                                                 sub:"on active days",     color:"text-indigo-400" },
  ]

  const maxDow = Math.max(...dowPattern.map(d => d.avg), 1)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3.5">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 font-bold mb-2">{k.label}</p>
            {loading
              ? <Skeleton className="h-7 w-16 mb-1"/>
              : <p className={`text-2xl font-black leading-none ${k.color}`}>{k.value}</p>}
            <p className="text-[10px] text-gray-600 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-white">
            {range === "7d" ? "Attempts Per Day - Last 7 Days" : "Attempts Per Day - Last 30 Days"}
          </p>
          <div className="flex gap-1">
            {[["7d","7D"],["30d","30D"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setRange(val)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition ${
                  range === val
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : "text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-700"
                }`}>{lbl}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-600 mb-5">
          {visibleData.reduce((s, d) => s + d.count, 0)} total attempts . peak {peakDay.count} on {peakDay.label}
        </p>
        <BarChart data={visibleData} height={200} loading={loading} />
      </div>

      {!loading && dowPattern.some(d => d.avg > 0) && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <p className="text-sm font-bold text-white mb-1">Day-of-Week Pattern</p>
          <p className="text-xs text-gray-600 mb-5">Average attempts per day of week over last 30 days - best day to publish new quizzes</p>
          <div className="flex items-end gap-2" style={{ height: 100 }}>
            {dowPattern.map((d, i) => {
              const barH = d.avg > 0 ? Math.max(4, Math.round((d.avg / maxDow) * 72)) : 0
              const isMax = d.avg === maxDow && d.avg > 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end">
                  {d.avg > 0 && (
                    <span className="text-[9px] text-gray-500 mb-1 font-mono">{d.avg.toFixed(1)}</span>
                  )}
                  <div
                    className={`w-full rounded-sm transition-all duration-500 ${
                      isMax ? "bg-cyan-400" : d.avg > 0 ? "bg-cyan-500/50" : "bg-transparent"
                    }`}
                    style={{ height: barH }}
                  />
                  <p className={`text-[10px] mt-1.5 font-semibold ${isMax ? "text-cyan-400" : "text-gray-600"}`}>{d.label}</p>
                </div>
              )
            })}
          </div>
          {maxDow > 0 && (
            <p className="text-[11px] text-cyan-400 mt-3 font-semibold">
              Best day to publish: {dowPattern.find(d => d.avg === maxDow)?.label} - highest average activity
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <p className="text-sm font-bold text-white mb-4">Week-over-Week Comparison</p>
        {loading ? (
          <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24"/>)}</div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {weeklyComparison.map((w, i) => {
              const isLatest = i === weeklyComparison.length - 1
              const prev     = i > 0 ? weeklyComparison[i-1].count : null
              const diff     = prev !== null && prev > 0 ? Math.round((w.count - prev) / prev * 100) : null
              return (
                <div key={i} className={`rounded-xl p-3.5 border ${
                  isLatest ? "border-cyan-500/25 bg-cyan-500/5" : "border-gray-800 bg-gray-800/30"}`}>
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-2">
                    {isLatest ? "This week" : `${weeklyComparison.length - 1 - i}w ago`}
                  </p>
                  <p className={`text-2xl font-black ${isLatest ? "text-cyan-400" : "text-gray-400"}`}>{w.count}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">attempts</p>
                  {w.uniqueStudents !== undefined && (
                    <p className="text-[10px] text-gray-600">{w.uniqueStudents} students</p>
                  )}
                  {diff !== null && (
                    <div className={`flex items-center gap-0.5 text-[10px] font-bold mt-2 ${diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {diff >= 0 ? <ArrowUp size={9}/> : <ArrowDown size={9}/>}
                      {Math.abs(diff)}%
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [attempts,      setAttempts]      = useState([])
  const [counts,        setCounts]        = useState({ users: 0, quizzes: 0, batches: 0, total: 0 })
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [relTime,       setRelTime]       = useState("")

  const activeTab    = searchParams.get("tab") || "overview"
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true })

  const LIMIT = 500

  const analytics = useMemo(() => {
    if (!attempts.length) return null

    const firstAttempts = attempts.filter(a => (a.attemptNumber ?? 1) === 1)
    const avgScore = firstAttempts.length > 0
      ? Math.round(firstAttempts.reduce((s, a) => s + pct(a.score, a.maxScore || a.totalQ), 0) / firstAttempts.length)
      : 0

    const dailyData = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label   = (i % 7 === 0 || i === 0)
        ? d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
        : ""
      dailyData.push({ label, dateStr, count: attempts.filter(a => a.date?.slice(0, 10) === dateStr).length })
    }

    const weeklyComparison = Array.from({ length: 4 }, (_, wi) => {
      const end   = 30 - wi * 7
      const start = Math.max(0, end - 7)
      const weekAttempts = attempts.filter(a => {
        const ds = a.date?.slice(0, 10)
        return dailyData.slice(start, end).some(d => d.dateStr === ds)
      })
      const uniqueStudents = new Set(weekAttempts.map(a => a.userId)).size
      return {
        count: dailyData.slice(start, end).reduce((s, d) => s + d.count, 0),
        uniqueStudents,
      }
    }).reverse()

    const scoreDistrib = [
      { label: "0 - 40%",   min: 0,  max: 40,  count: 0 },
      { label: "40 - 60%",  min: 40, max: 60,  count: 0 },
      { label: "60 - 80%",  min: 60, max: 80,  count: 0 },
      { label: "80 - 100%", min: 80, max: 101, count: 0 },
    ]
    firstAttempts.forEach(a => {
      const p = pct(a.score, a.maxScore || a.totalQ)
      const b = scoreDistrib.find(b => p >= b.min && p < b.max)
      if (b) b.count++
    })

    const categoryMap = {}
    firstAttempts.forEach(a => {
      const cat = a.category || "Uncategorised"
      if (!categoryMap[cat]) categoryMap[cat] = { category: cat, scores: [], attempts: 0 }
      categoryMap[cat].scores.push(pct(a.score, a.maxScore || a.totalQ))
      categoryMap[cat].attempts++
    })
    const categoryBreakdown = Object.values(categoryMap)
      .map(c => ({ ...c, avg: Math.round(c.scores.reduce((s, v) => s + v, 0) / c.scores.length) }))
      .filter(c => c.attempts >= 2)
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 8)

    const quizMap = {}
    attempts.forEach(a => {
      if (!quizMap[a.quizId]) quizMap[a.quizId] = {
        id: a.quizId, title: a.quizTitle || "Unknown", category: a.category || "",
        attempts: 0, uniqueStudents: new Set(), scores: [], retries: 0,
      }
      const q = quizMap[a.quizId]
      q.attempts++
      q.uniqueStudents.add(a.userId)
      q.scores.push(pct(a.score, a.maxScore || a.totalQ))
      if ((a.attemptNumber ?? 1) > 1) q.retries++
    })
    const quizPerf = Object.values(quizMap).map(q => ({
      ...q,
      uniqueStudents: q.uniqueStudents.size,
      avg: q.scores.length > 0 ? Math.round(q.scores.reduce((s, v) => s + v, 0) / q.scores.length) : 0,
    }))

    const studentAttempts = {}
    attempts.forEach(a => {
      if (!studentAttempts[a.userId]) studentAttempts[a.userId] = []
      studentAttempts[a.userId].push(a)
    })

    const allStudents = Object.entries(studentAttempts).map(([uid, atts]) => {
      const sorted      = [...atts].sort((a, b) => new Date(a.date) - new Date(b.date))
      const scores      = atts.map(a => pct(a.score, a.maxScore || a.totalQ))
      const firstScore  = pct(sorted[0].score, sorted[0].maxScore || sorted[0].totalQ)
      const latestScore = pct(sorted[sorted.length-1].score, sorted[sorted.length-1].maxScore || sorted[sorted.length-1].totalQ)
      const lastDate    = new Date(sorted[sorted.length-1].date)
      const daysSince   = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24))
      return {
        uid,
        name:        atts[0].userName || "Unknown",
        attempts:    atts.length,
        scores,
        best:        Math.max(...scores),
        avg:         Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
        firstScore,
        latestScore,
        improvement: latestScore - firstScore,
        daysSince,
      }
    })

    const topStudents        = allStudents.filter(s => s.attempts >= 3).sort((a, b) => b.avg - a.avg).slice(0, 10)
    const strugglingStudents = allStudents.filter(s => s.attempts >= 3 && s.avg < 50).sort((a, b) => a.avg - b.avg).slice(0, 10)
    const mostImproved       = allStudents
      .filter(s => s.attempts >= 3 && s.improvement > 0)
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 5)
    const goneSilent = allStudents
      .filter(s => s.attempts >= 3 && s.daysSince >= 14)
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 10)

    const batchMap = {}
    firstAttempts.forEach(a => {
      if (!a.batchId) return
      if (!batchMap[a.batchId]) batchMap[a.batchId] = {
        batchId: a.batchId, batchName: a.batchName || a.batchId,
        attempts: 0, students: new Set(), scores: [],
      }
      const b = batchMap[a.batchId]
      b.attempts++
      b.students.add(a.userId)
      b.scores.push(pct(a.score, a.maxScore || a.totalQ))
    })
    const batchPerf = Object.values(batchMap)
      .map(b => ({
        ...b,
        students: b.students.size,
        avg: b.scores.length > 0 ? Math.round(b.scores.reduce((s, v) => s + v, 0) / b.scores.length) : 0,
      }))
      .sort((a, b) => b.avg - a.avg)

    const dowCounts = Array(7).fill(0)
    const dowTotals = Array(7).fill(0)
    dailyData.forEach(d => {
      if (!d.dateStr) return
      const dow = new Date(d.dateStr + "T12:00:00").getDay()
      dowCounts[dow]++
      dowTotals[dow] += d.count
    })
    const dowPattern = DAY_LABELS.map((label, i) => ({
      label,
      avg: dowCounts[i] > 0 ? dowTotals[i] / dowCounts[i] : 0,
    }))

    const actionItems = []
    const passRate       = (scoreDistrib.slice(2).reduce((s, b) => s + b.count, 0) / Math.max(1, firstAttempts.length)) * 100
    const problemQuizzes = quizPerf.filter(q => q.attempts >= 5 && q.avg < 35)
    const thisWeekCount  = dailyData.slice(-7).reduce((s, d) => s + d.count, 0)
    const lastWeekCount  = dailyData.slice(-14, -7).reduce((s, d) => s + d.count, 0)
    const weeklyDrop     = lastWeekCount > 0 && thisWeekCount < lastWeekCount * 0.7

    if (goneSilent.length > 0)
      actionItems.push({ type: "clock", text: `${goneSilent.length} student${goneSilent.length > 1 ? "s" : ""} went silent (no activity in 14+ days). Send a re-engagement announcement.`, action: "Announce", href: "/admin/announcements" })
    if (problemQuizzes.length > 0)
      actionItems.push({ type: "warning", text: `${problemQuizzes.length} quiz${problemQuizzes.length > 1 ? "zes" : ""} have very low scores with significant attempts - check question difficulty or scoring config.`, action: "Review", href: "/admin/quizzes" })
    if (weeklyDrop)
      actionItems.push({ type: "warning", text: `Attempts dropped ${Math.round((1 - thisWeekCount / lastWeekCount) * 100)}% vs last week. Consider sending an announcement to re-engage students.`, action: "Announce", href: "/admin/announcements" })
    if (counts.quizzes > 0 && quizPerf.length < counts.quizzes)
      actionItems.push({ type: "info", text: `${counts.quizzes - quizPerf.length} quiz${counts.quizzes - quizPerf.length > 1 ? "zes have" : " has"} 0 attempts - promote them via announcements or batch assignment.`, action: "Manage", href: "/admin/quizzes" })
    if (mostImproved.length > 0)
      actionItems.push({ type: "success", text: `${mostImproved[0].name} improved by +${mostImproved[0].improvement}% from first to latest attempt. Recognise your top improvers!` })

    return {
      avgScore, dailyData, weeklyComparison, scoreDistrib,
      categoryBreakdown, quizPerf, topStudents, strugglingStudents,
      mostImproved, goneSilent, batchPerf,
      dowPattern, actionItems,
    }
  }, [attempts, counts.quizzes])

  const isCapped       = attempts.length >= LIMIT
  const neverAttempted = Math.max(0, counts.users - (attempts.length > 0 ? new Set(attempts.map(a => a.userId)).size : 0))

  const doFetch = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); invalidateCache("adminAttempts") }
    try {
      const [usersCount, quizzesCount, batchesCount, attemptsData, totalAttempts] = await Promise.all([
        getCountFromServer(collection(db, "users")).then(s => s.data().count),
        getCountFromServer(collection(db, "quizSets")).then(s => s.data().count),
        getCountFromServer(collection(db, "batches")).then(s => s.data().count),
        cachedGetDocs(
          "adminAttempts",
          query(collection(db, "quizAttempts"), orderBy("date", "desc"), limit(LIMIT)),
          { ttl: TTL_SHORT, revalidate: !manual, onUpdate: (fresh) => { setAttempts(fresh); setLastRefreshed(new Date()) } }
        ),
        getCountFromServer(collection(db, "quizAttempts")).then(s => s.data().count),
      ])
      setCounts({ users: usersCount, quizzes: quizzesCount, batches: batchesCount, total: totalAttempts })
      setAttempts(attemptsData)
      setLastRefreshed(new Date())
    } catch (e) { console.error("AdminPanel fetch error:", e) }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { doFetch() }, [doFetch])

  useEffect(() => {
    if (!lastRefreshed) return
    function update() {
      const secs = Math.floor((Date.now() - lastRefreshed) / 1000)
      if (secs < 10)      setRelTime("just now")
      else if (secs < 60) setRelTime(`${secs}s ago`)
      else                setRelTime(`${Math.floor(secs / 60)}m ago`)
    }
    update()
    const id = setInterval(update, 10_000)
    return () => clearInterval(id)
  }, [lastRefreshed])

  const stats = {
    users:    counts.users,
    quizzes:  counts.quizzes,
    batches:  counts.batches,
    attempts: counts.total,
  }

  const tabBadges = {}

  const tabs = [
    { id: "overview",  label: "Overview",  icon: BarChart2 },
    { id: "activity",  label: "Activity",  icon: Activity  },
  ]

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Analytics</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Last {LIMIT} attempts
              {isCapped && <span className="text-amber-400"> . capped</span>}
              {lastRefreshed && !loading && <span className="text-gray-600"> . {relTime}</span>}
            </p>
          </div>
          <button onClick={() => doFetch(true)} disabled={loading || refreshing}
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-white border border-gray-800 hover:border-gray-600 rounded-xl px-3 py-2 transition disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {!loading && attempts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 p-16 text-center">
            <BarChart2 size={36} className="mx-auto text-gray-700 mb-4" />
            <p className="text-white font-bold mb-1">No quiz attempts yet</p>
            <p className="text-gray-500 text-sm">Share a quiz with your students to start seeing analytics here.</p>
          </div>
        )}

        {(loading || attempts.length > 0) && (
          <>
            <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-2xl p-1 mb-6 w-fit">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === t.id ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>
                  <t.icon size={14} />
                  {t.label}
                  {tabBadges[t.id] && (
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                      {tabBadges[t.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <OverviewTab
                stats={stats}
                dailyData={analytics?.dailyData ?? []}
                scoreDistrib={analytics?.scoreDistrib ?? []}
                categoryBreakdown={analytics?.categoryBreakdown ?? []}
                actionItems={analytics?.actionItems ?? []}
                isCapped={isCapped}
                loading={loading}
              />
            )}
            {activeTab === "activity" && (
              <ActivityTab
                dailyData={analytics?.dailyData ?? []}
                weeklyComparison={analytics?.weeklyComparison ?? []}
                dowPattern={analytics?.dowPattern ?? []}
                loading={loading}
              />
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
