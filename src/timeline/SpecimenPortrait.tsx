import type { PortraitSpec } from '../../shared/timeline';

/**
 * 「当时的模样」：纯渲染组件 —— 只把服务端给的 PortraitSpec 画成 SVG。
 * 同一份描述符永远画出同一张图（描述符本身是确定性数据）。
 */
export function SpecimenPortrait({ portrait, size = 180 }: { portrait: PortraitSpec; size?: number }) {
  const id = `p${portrait.seed}`;
  const c = portrait.color;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="标本形态复原图">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#0e302b" />
          <stop offset="100%" stopColor="#05120f" />
        </radialGradient>
        <radialGradient id={`${id}-cell`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="35%" stopColor={c} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c} stopOpacity="0.7" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="192" height="192" rx="14" fill={`url(#${id}-bg)`} stroke={c} strokeOpacity="0.35" />
      {/* 视场刻度，像显微镜 */}
      <g stroke={c} strokeOpacity="0.25" strokeWidth="1">
        <line x1="100" y1="14" x2="100" y2="24" />
        <line x1="100" y1="176" x2="100" y2="186" />
        <line x1="14" y1="100" x2="24" y2="100" />
        <line x1="176" y1="100" x2="186" y2="100" />
      </g>
      <g transform={`rotate(${portrait.seed % 360} 100 100)`}>{renderShape(portrait, `${id}-cell`)}</g>
      <text x="14" y="190" fontSize="9" fill="#7dbdae" fontFamily="monospace">
        {portrait.shape} · {portrait.sizeUm} µm · {portrait.membrane}
      </text>
    </svg>
  );
}

function renderShape(p: PortraitSpec, fill: string) {
  const stroke = p.membrane === 'double' || p.membrane === 'envelope' ? '#eafffb' : 'rgba(255,255,255,0.35)';
  const sw = p.membrane === 'double' ? 3 : p.membrane === 'envelope' ? 2.5 : 1.2;
  switch (p.shape) {
    case 'rod':
      return (
        <g>
          <rect x="55" y="80" width="90" height="40" rx="20" fill={`url(#${fill})`} stroke={stroke} strokeWidth={sw} />
          {p.membrane === 'double' && <rect x="62" y="87" width="76" height="26" rx="13" fill="none" stroke="#eafffb" strokeOpacity="0.5" strokeWidth="1" />}
        </g>
      );
    case 'coccus':
      return (
        <g>
          <circle cx="100" cy="100" r="42" fill={`url(#${fill})`} stroke={stroke} strokeWidth={sw} />
          <circle cx="100" cy="100" r="33" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1" />
        </g>
      );
    case 'spiral':
      return (
        <path d="M45 110 C 65 70, 85 130, 100 100 S 135 70, 155 110" fill="none" stroke={`url(#${fill})`} strokeWidth="16" strokeLinecap="round" />
      );
    case 'filament':
      return (
        <g stroke={stroke} strokeWidth={sw}>
          {Array.from({ length: 9 }).map((_, i) => (
            <rect key={i} x={48 + i * 11.6} y="88" width="11" height="24" rx="3" fill={`url(#${fill})`} strokeWidth="1" />
          ))}
        </g>
      );
    case 'colony':
      return (
        <g>
          {[[80, 85, 22], [118, 82, 26], [100, 112, 30], [72, 116, 18], [130, 114, 18]].map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill={`url(#${fill})`} stroke={stroke} strokeWidth={sw * 0.7} opacity={0.92} />
          ))}
        </g>
      );
    case 'spheromorph':
    default:
      return (
        <g>
          <circle cx="100" cy="100" r="44" fill={`url(#${fill})`} stroke={stroke} strokeWidth={sw} />
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={100 + Math.cos(a) * 44}
                y1={100 + Math.sin(a) * 44}
                x2={100 + Math.cos(a) * 58}
                y2={100 + Math.sin(a) * 58}
                stroke={p.color}
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}
          <circle cx="100" cy="100" r="34" fill="none" stroke="#fff" strokeOpacity="0.2" strokeDasharray="3 4" />
        </g>
      );
  }
}
