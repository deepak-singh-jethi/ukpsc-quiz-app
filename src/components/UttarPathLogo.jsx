export default function UttarPathLogo({ size = "md", showTagline = false }) {
  const scale = size === "sm" ? 0.6 : size === "lg" ? 1.4 : 1
  const svgW  = Math.round(56 * scale)
  const svgH  = Math.round(36 * scale)
  const textSz= Math.round(20 * scale)
  const tagSz = Math.round(9  * scale)
  const gap   = Math.round(8  * scale)

  const Mark = () => (
    <svg width={svgW} height={svgH} viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="160" x2="300" y2="160" stroke="#0d5c4d" strokeWidth="6" strokeLinecap="round"/>
      <polygon points="80,160 130,50 180,160" fill="#7bc4a8" stroke="#0d5c4d" strokeWidth="5" strokeLinejoin="round"/>
      <polygon points="130,50 140,70 130,80 120,70" fill="#e8f5f0"/>
      <polygon points="140,160 210,25 280,160" fill="#7bc4a8" stroke="#0d5c4d" strokeWidth="5" strokeLinejoin="round"/>
      <polygon points="210,25 225,55 210,65 195,55" fill="#e8f5f0"/>
      <path d="M 110,140 Q 140,130 160,110 Q 180,90 200,70" fill="none" stroke="#0d5c4d" strokeWidth="5" strokeDasharray="12,8" strokeLinecap="round"/>
      <polygon points="200,70 192,88 208,88" fill="#0d5c4d"/>
    </svg>
  )

  if (size === "icon") return <Mark />

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap }}>
        <Mark />
        <span style={{ fontSize: textSz, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, fontFamily: "inherit" }}>
          <span style={{ color: "#0d5c4d" }}>Uttar</span>
          <span style={{ color: "#2a9d6a" }}>Path</span>
        </span>
      </div>
      {showTagline && (
        <span style={{ display: "block", fontSize: tagSz, fontWeight: 600, letterSpacing: "2.5px", color: "#2a9d6a", opacity: 0.8, marginTop: 3, marginLeft: svgW + gap, textTransform: "uppercase", fontFamily: "inherit" }}>
          Exam Preparation
        </span>
      )}
    </div>
  )
}