export default function RangoSelector({ presets, preset, setPreset, desdeInput, setDesdeInput, hastaInput, setHastaInput }) {
  return (
    <div className="rango-selector">
      <select value={preset} onChange={(e) => setPreset(e.target.value)}>
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === 'personalizado' && (
        <>
          <input type="date" value={desdeInput} onChange={(e) => setDesdeInput(e.target.value)} />
          <span>&ndash;</span>
          <input type="date" value={hastaInput} onChange={(e) => setHastaInput(e.target.value)} />
        </>
      )}
    </div>
  );
}
