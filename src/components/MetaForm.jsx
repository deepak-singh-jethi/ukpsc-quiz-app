// Shared MetaForm used by both QuizCreate and QuizEditor
export default function MetaForm({ meta, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="text-gray-400 text-sm mb-1 block">Quiz Title *</label>
        <input value={meta.title} onChange={e => onChange("title", e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
          placeholder="e.g. Uttarakhand GK Set 1" />
      </div>
      <div className="col-span-2">
        <label className="text-gray-400 text-sm mb-1 block">Description</label>
        <input value={meta.description} onChange={e => onChange("description", e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
          placeholder="Short description" />
      </div>
      <div>
        <label className="text-gray-400 text-sm mb-1 block">Category</label>
        <input value={meta.category} onChange={e => onChange("category", e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
          placeholder="e.g. GK, Science" />
      </div>
      <div>
        <label className="text-gray-400 text-sm mb-1 block">Difficulty</label>
        <select value={meta.difficulty} onChange={e => onChange("difficulty", e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div>
        <label className="text-gray-400 text-sm mb-1 block">Total Time (minutes) *</label>
        <input type="number" min={1} max={180} value={meta.totalTime}
          onChange={e => onChange("totalTime", e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none" />
      </div>
      <div>
        <label className="text-gray-400 text-sm mb-1 block">
          Expiry Date <span className="text-gray-600 text-xs">— optional</span>
        </label>
        <input type="datetime-local" value={meta.expiryDate || ""}
          onChange={e => onChange("expiryDate", e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none" />
      </div>

      {/* Marking Scheme */}
      <div className="col-span-2 pt-2 border-t border-gray-800">
        <p className="text-gray-400 text-sm font-medium mb-3">Marking Scheme</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">
              Marks for Correct <span className="text-green-400">+</span>
            </label>
            <input type="number" min={0.25} max={10} step={0.25} value={meta.marksPerQ}
              onChange={e => onChange("marksPerQ", parseFloat(e.target.value) || 1)}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">
              Negative Marking <span className="text-red-400">−</span>
              <span className="text-gray-600 text-xs ml-1">0 = no penalty</span>
            </label>
            <input type="number" min={0} max={5} step={0.25} value={meta.negativeMark}
              onChange={e => onChange("negativeMark", parseFloat(e.target.value) || 0)}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-cyan-400 focus:outline-none" />
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-600 bg-gray-800/50 rounded-lg px-3 py-2">
          Example: {meta.totalTime ? `${meta.marksPerQ} × correct − ${meta.negativeMark} × wrong` : "—"}
          {" · "}Max = {((meta.marksPerQ || 1) * 5).toFixed(2)} for 5 questions
        </div>
      </div>
    </div>
  )
}
