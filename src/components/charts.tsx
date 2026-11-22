interface Slice {
  label: string;
  value: number;
  color: string;
}

/**
 * 手写 SVG 环形图。
 *
 * 为什么不用 ECharts / Chart.js：
 * 这里只需要两个图，引一个 300KB+ 的库，首屏成本和"能不能改"都不划算。
 * 用 stroke-dasharray 画环，30 行就够，还能精确控制动画与配色。
 */
export function Donut({
  data,
  size = 148,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="状态分布">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={thickness}
          opacity={0.45}
        />
        {total > 0 &&
          data.map((item) => {
            const length = (item.value / total) * circumference;
            const visible = Math.max(length - 2, 0);
            const el = (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={thickness}
                strokeDasharray={`${visible} ${circumference - visible}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += length;
            return el;
          })}
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          fill="var(--text)"
          fontSize={size * 0.2}
          fontWeight={700}
        >
          {centerValue ?? total}
        </text>
        <text x="50%" y="62%" textAnchor="middle" fill="var(--muted)" fontSize={size * 0.085}>
          {centerLabel ?? '总计'}
        </text>
      </svg>

      <ul className="donut-legend">
        {data.map((item) => (
          <li key={item.label}>
            <span className="dot" style={{ background: item.color }} />
            <span className="label">{item.label}</span>
            <span className="value">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 柱状图：用 CSS 而不是 SVG 画。
 *
 * 原因是文字：SVG 缩放会把字号一起拉变形，要么糊要么大小失控；
 * 而"数字必须清晰可读"在图表里优先级最高。柱子用 div 画，标签就是正常 DOM。
 * （环形图相反 —— 它没有文字缩放问题，SVG 的 stroke-dasharray 反而最省事。）
 */
export function Bars({
  data,
  height = 150,
  color = 'var(--accent)',
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="bars" style={{ height }}>
      <div className="bars-plot">
        {data.map((item) => (
          <div className="bars-col" key={item.label}>
            <span className="bars-value">{item.value > 0 ? item.value : ''}</span>
            <div
              className="bars-bar"
              style={{
                height: `${Math.max((item.value / max) * 100, item.value > 0 ? 6 : 2)}%`,
                background: item.value > 0 ? color : 'var(--border)',
              }}
            />
            <span className="bars-label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
