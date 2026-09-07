import { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export interface PortfolioPieChartDatum {
  isin: string
  name: string
  value: number
}

interface PortfolioPieChartProps {
  data: PortfolioPieChartDatum[]
  innerRadius: number
  outerRadius: number
  height: number
  labelOffset: number
  nameWordsPerLine: number
  fontSize: number
}

export const PORTFOLIO_CHART_COLORS = [
  '#7C9CBF', // soft blue
  '#8EBA9F', // soft green
  '#E8B98A', // soft peach
  '#D4A5A5', // soft rose
  '#B4A3D8', // soft lavender
  '#E5A9C3', // soft pink
  '#88C5D1', // soft cyan
  '#D9B38C', // soft tan
  '#B5C99A', // soft sage
  '#A9B4D6', // soft periwinkle
  '#98C9C0', // soft teal
  '#E3B8C5', // soft mauve
]

const SMALL_SLICE_THRESHOLD = 5
const SMALL_ELBOW_OFFSET = 15
const SMALL_LABEL_OFFSET = 70
const SMALL_ROW_HEIGHT = 34
const LABEL_EDGE_MARGIN = 8
const MIN_LABEL_TEXT_WIDTH = 40
const MIN_OUTER_RADIUS_RATIO = 0.6
// Conservative estimate of average glyph width as a fraction of font size --
// deliberately generous (real text is often narrower) since underestimating
// available width just truncates a character early, while overestimating it
// lets text clip past the container edge.
const CHAR_WIDTH_RATIO = 0.7
const RADIAN = Math.PI / 180

function wrapName(name: string, wordsPerLine: number): string[] {
  const words = name.split(' ')
  const lines: string[] = []
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '))
  }
  return lines
}

type SmallSlice = {
  index: number
  name: string
  percentage: number
  edgeX: number
  edgeY: number
  color: string
  side: 'left' | 'right'
}

export function PortfolioPieChart({
  data,
  innerRadius,
  outerRadius,
  height,
  labelOffset,
  nameWordsPerLine,
  fontSize,
}: PortfolioPieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Shrink the donut on narrow containers so leader-line labels get real
  // horizontal room instead of relying on truncation. Falls back to the
  // full configured radius until the container has been measured.
  const desiredOuterRadius = containerWidth > 0
    ? containerWidth / 2 - LABEL_EDGE_MARGIN - SMALL_ELBOW_OFFSET - MIN_LABEL_TEXT_WIDTH
    : outerRadius
  const minOuterRadius = outerRadius * MIN_OUTER_RADIUS_RATIO
  const effectiveOuterRadius = Math.min(outerRadius, Math.max(desiredOuterRadius, minOuterRadius))
  const radiusScale = effectiveOuterRadius / outerRadius
  const effectiveInnerRadius = innerRadius * radiusScale

  const totalValue = data.reduce((sum, item) => sum + item.value, 0)

  // Small slices (<=5%) always land at the tail of `data` -- callers sort
  // their data descending by value before passing it in, so once a slice
  // drops to/below the threshold every slice after it is small too. Rotate
  // the whole pie so that run's angular midpoint sits at the top (12
  // o'clock) instead of wherever it happens to fall by default, splitting
  // it across the left and right label columns instead of clustering it
  // entirely on one side.
  let cumulativeDegrees = 0
  let smallRunStartIndex = data.length
  for (let i = 0; i < data.length; i++) {
    const pct = totalValue > 0 ? (data[i].value / totalValue) * 100 : 0
    if (pct <= SMALL_SLICE_THRESHOLD) {
      smallRunStartIndex = i
      break
    }
    cumulativeDegrees += pct * 3.6
  }
  const rotationOffset = smallRunStartIndex < data.length
    ? 90 - (cumulativeDegrees + 360) / 2
    : 0

  // Declared fresh on every render of this component, so it never carries
  // state across renders; `renderLabel` below closes over this instance.
  const smallSlices: SmallSlice[] = []

  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, index, name, value } = props
    if (index === 0) smallSlices.length = 0
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0
    const color = PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]
    const isLastIndex = index === data.length - 1

    let primary: React.ReactNode = null

    if (percentage > SMALL_SLICE_THRESHOLD) {
      const radius = effectiveOuterRadius + labelOffset
      const x = cx + radius * Math.cos(-midAngle * RADIAN)
      const y = cy + radius * Math.sin(-midAngle * RADIAN)
      const isRightSide = x > cx
      const edgeLimit = isRightSide ? cx * 2 - LABEL_EDGE_MARGIN : LABEL_EDGE_MARGIN
      const availableWidth = Math.max(isRightSide ? edgeLimit - x : x - edgeLimit, MIN_LABEL_TEXT_WIDTH)
      const maxCharsInline = Math.max(Math.floor(availableWidth / (fontSize * CHAR_WIDTH_RATIO)), 3)
      const truncateInline = (line: string) =>
        line.length > maxCharsInline ? `${line.slice(0, maxCharsInline - 1)}…` : line
      const lines = wrapName(name, nameWordsPerLine).map(truncateInline)

      primary = (
        <text
          x={x}
          y={y}
          fill={color}
          textAnchor={x > cx ? 'start' : 'end'}
          dominantBaseline="central"
          fontSize={fontSize}
        >
          {lines.map((line, lineIndex) => (
            <tspan key={lineIndex} x={x} dy={lineIndex === 0 ? 0 : fontSize + 1}>
              {line}
            </tspan>
          ))}
          <tspan x={x} dy={fontSize + 1}>
            {percentage.toFixed(1)}%
          </tspan>
        </text>
      )
    } else {
      const edgeX = cx + effectiveOuterRadius * Math.cos(-midAngle * RADIAN)
      const edgeY = cy + effectiveOuterRadius * Math.sin(-midAngle * RADIAN)
      smallSlices.push({
        index,
        name,
        percentage,
        edgeX,
        edgeY,
        color,
        side: edgeX > cx ? 'right' : 'left',
      })
    }

    if (!isLastIndex || smallSlices.length === 0) {
      return primary
    }

    const leftSlices = smallSlices.filter(s => s.side === 'left').sort((a, b) => a.edgeY - b.edgeY)
    const rightSlices = smallSlices.filter(s => s.side === 'right').sort((a, b) => a.edgeY - b.edgeY)

    const renderGroup = (slices: SmallSlice[], sideSign: 1 | -1) => {
      const maxReachFromCenter = cx - LABEL_EDGE_MARGIN
      const maxLabelOffset = Math.max(
        maxReachFromCenter - effectiveOuterRadius - MIN_LABEL_TEXT_WIDTH,
        SMALL_ELBOW_OFFSET + 5
      )
      const effectiveLabelOffset = Math.min(SMALL_LABEL_OFFSET, maxLabelOffset)
      const textAvailableWidth = Math.max(maxReachFromCenter - (effectiveOuterRadius + effectiveLabelOffset), 0)
      const maxChars = Math.max(Math.floor(textAvailableWidth / (fontSize * CHAR_WIDTH_RATIO)), 3)
      const truncate = (line: string) => (line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line)
      const startY = cy - ((slices.length - 1) * SMALL_ROW_HEIGHT) / 2
      return slices.map((slice, i) => {
        const labelY = startY + i * SMALL_ROW_HEIGHT
        const elbowX = cx + sideSign * (effectiveOuterRadius + SMALL_ELBOW_OFFSET)
        const labelX = cx + sideSign * (effectiveOuterRadius + effectiveLabelOffset)
        const textAnchor = sideSign === 1 ? 'start' : 'end'
        const textX = labelX + sideSign * 4
        const lines = wrapName(slice.name, nameWordsPerLine).map(truncate)

        return (
          <g key={`small-${slice.index}`}>
            <path
              d={`M ${slice.edgeX} ${slice.edgeY} L ${elbowX} ${labelY} L ${labelX} ${labelY}`}
              fill="none"
              stroke={slice.color}
              strokeWidth={1.5}
            />
            <text
              x={textX}
              y={labelY}
              fill={slice.color}
              textAnchor={textAnchor}
              dominantBaseline="central"
              fontSize={fontSize}
            >
              {lines.map((line, lineIndex) => (
                <tspan key={lineIndex} x={textX} dy={lineIndex === 0 ? 0 : fontSize + 1}>
                  {line}
                </tspan>
              ))}
              <tspan x={textX} dy={fontSize + 1}>
                {slice.percentage.toFixed(1)}%
              </tspan>
            </text>
          </g>
        )
      })
    }

    return (
      <>
        {primary}
        <g>
          {renderGroup(leftSlices, -1)}
          {renderGroup(rightSlices, 1)}
        </g>
      </>
    )
  }

  return (
    <div ref={containerRef} className="w-full" style={{ minHeight: `${height}px`, height: `${height}px` }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            innerRadius={effectiveInnerRadius}
            outerRadius={effectiveOuterRadius}
            startAngle={rotationOffset}
            endAngle={rotationOffset + 360}
            fill="#8884d8"
            dataKey="value"
            isAnimationActive={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${entry.isin}`} fill={PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
