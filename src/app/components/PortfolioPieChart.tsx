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
// The small-slice label column must sit farther from the ring than the
// inline (big-slice) labels do, or the two systems' text can interleave
// and overlap even when there's no overlap in occupied vertical space.
const LABEL_OFFSET_SEPARATION = 10
// Extra clearance added around the small-slice stack's occupied vertical
// span when deciding whether a same-side inline label needs to be nudged
// out of the way.
const STACK_EDGE_BUFFER = 6
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

type BigSlice = {
  index: number
  x: number
  y: number
  color: string
  percentage: number
  lines: string[]
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

  // Declared fresh on every render of this component, so they never carry
  // state across renders; `renderLabel` below closes over this instance.
  // Both big- and small-slice labels are collected here rather than
  // rendered immediately, so the final pass (triggered by the last index)
  // can lay them out with awareness of each other's position and avoid
  // overlap between the two label systems.
  const smallSlices: SmallSlice[] = []
  const bigSlices: BigSlice[] = []

  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, index, name, value } = props
    if (index === 0) {
      smallSlices.length = 0
      bigSlices.length = 0
    }
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0
    const color = PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]
    const isLastIndex = index === data.length - 1

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
      bigSlices.push({ index, x, y, color, percentage, lines, side: isRightSide ? 'right' : 'left' })
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

    if (!isLastIndex) {
      return null
    }

    const leftSlices = smallSlices.filter(s => s.side === 'left').sort((a, b) => a.edgeY - b.edgeY)
    const rightSlices = smallSlices.filter(s => s.side === 'right').sort((a, b) => a.edgeY - b.edgeY)

    const stackRange = (slices: SmallSlice[]): [number, number] | null => {
      if (slices.length === 0) return null
      const startY = cy - ((slices.length - 1) * SMALL_ROW_HEIGHT) / 2
      return [
        startY - SMALL_ROW_HEIGHT / 2 - STACK_EDGE_BUFFER,
        startY + (slices.length - 1) * SMALL_ROW_HEIGHT + SMALL_ROW_HEIGHT / 2 + STACK_EDGE_BUFFER,
      ]
    }
    const stackRanges = { left: stackRange(leftSlices), right: stackRange(rightSlices) }

    const renderBigLabels = () =>
      bigSlices.map(slice => {
        const range = stackRanges[slice.side]
        const halfHeight = (slice.lines.length + 1) * (fontSize + 1) / 2
        let y = slice.y
        if (range) {
          const [stackTop, stackBottom] = range
          if (y + halfHeight > stackTop && y - halfHeight < stackBottom) {
            const distAbove = Math.abs(stackTop - halfHeight - y)
            const distBelow = Math.abs(stackBottom + halfHeight - y)
            y = distAbove <= distBelow ? stackTop - halfHeight : stackBottom + halfHeight
          }
        }
        const textAnchor = slice.side === 'right' ? 'start' : 'end'

        return (
          <text
            key={`big-${slice.index}`}
            x={slice.x}
            y={y}
            fill={slice.color}
            textAnchor={textAnchor}
            dominantBaseline="central"
            fontSize={fontSize}
          >
            {slice.lines.map((line, lineIndex) => (
              <tspan key={lineIndex} x={slice.x} dy={lineIndex === 0 ? 0 : fontSize + 1}>
                {line}
              </tspan>
            ))}
            <tspan x={slice.x} dy={fontSize + 1}>
              {slice.percentage.toFixed(1)}%
            </tspan>
          </text>
        )
      })

    const renderSmallGroup = (slices: SmallSlice[], sideSign: 1 | -1) => {
      const maxReachFromCenter = cx - LABEL_EDGE_MARGIN
      const minLabelOffsetFloor = Math.max(SMALL_ELBOW_OFFSET + 5, labelOffset + LABEL_OFFSET_SEPARATION)
      const maxLabelOffset = Math.max(
        maxReachFromCenter - effectiveOuterRadius - MIN_LABEL_TEXT_WIDTH,
        minLabelOffsetFloor
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
        <g>{renderBigLabels()}</g>
        <g>
          {renderSmallGroup(leftSlices, -1)}
          {renderSmallGroup(rightSlices, 1)}
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
