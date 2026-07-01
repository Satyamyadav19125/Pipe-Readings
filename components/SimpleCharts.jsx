export function BarChart({ data, height = 260, color = '#0284c7', emptyText = 'No data' }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-slate-400 text-center py-12">{emptyText}</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const padTop = 14;
  const padLeft = 6;
  const padRight = 6;
  const padBottom = 60;
  const barAreaH = height - padTop - padBottom;
  const W = 800;
  const barW = (W - padLeft - padRight) / data.length;
  const innerW = barW * 0.7;
  const gap = barW * 0.3;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ minWidth: Math.max(W, data.length * 80) }} preserveAspectRatio="xMidYMid meet">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p} x1={padLeft} x2={W - padRight} y1={padTop + barAreaH * (1 - p)} y2={padTop + barAreaH * (1 - p)} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * barAreaH;
          const x = padLeft + i * barW + gap / 2;
          const y = padTop + barAreaH - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={innerW} height={h} rx="3" fill={d.color || color} opacity={0.85}>
                <title>{d.label}: {d.value}</title>
              </rect>
              <text x={x + innerW / 2} y={y - 4} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="600">
                {d.value}
              </text>
              <text
                x={x + innerW / 2}
                y={padTop + barAreaH + 14}
                textAnchor="end"
                fontSize="10"
                fill="#475569"
                transform={`rotate(-35 ${x + innerW / 2} ${padTop + barAreaH + 14})`}
              >
                {String(d.label).length > 18 ? String(d.label).slice(0, 16) + '…' : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LineChart({ data, height = 220, color = '#0284c7', emptyText = 'No data' }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-slate-400 text-center py-12">{emptyText}</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 800;
  const pad = { top: 14, right: 14, bottom: 32, left: 30 };
  const innerW = W - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const points = data.map((d, i) => {
    const x = pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = pad.top + innerH - (d.value / max) * innerH;
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x} ${pad.top + innerH} L ${points[0].x} ${pad.top + innerH} Z`;

  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH * (1 - p)} y2={pad.top + innerH * (1 - p)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.left - 4} y={pad.top + innerH * (1 - p) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(max * p)}</text>
          </g>
        ))}
        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color}>
            <title>{p.d.label}: {p.d.value}</title>
          </circle>
        ))}
        {points.map((p, i) => i % labelStep === 0 && (
          <text key={i} x={p.x} y={height - 12} textAnchor="middle" fontSize="9" fill="#64748b">{p.d.label}</text>
        ))}
      </svg>
    </div>
  );
}

export function DonutChart({ data, size = 220, emptyText = 'No data' }) {
  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return <div className="text-sm text-slate-400 text-center py-12">{emptyText}</div>;
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-sm text-slate-400 text-center py-12">{emptyText}</div>;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;
  const innerR = radius * 0.6;

  let startAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4} Z`;
    const slice = { ...d, path, percent: (d.value / total) * 100 };
    startAngle = endAngle;
    return slice;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color}>
            <title>{s.label}: {s.value} ({s.percent.toFixed(1)}%)</title>
          </path>
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="#64748b">total</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded inline-block shrink-0" style={{ background: s.color }} />
            <span className="text-slate-700">{s.label}</span>
            <span className="text-slate-400 tabular-nums">{s.value}</span>
            <span className="text-slate-400 tabular-nums">({s.percent.toFixed(0)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
