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
const LABEL_EDGE_MARGIN = 8
const MIN_LABEL_TEXT_WIDTH = 40
const MIN_OUTER_RADIUS_RATIO = 0.5
// Conservative estimate of average glyph width as a fraction of font size --
// deliberately generous (real text is often narrower) since underestimating
// available width just truncates a character early, while overestimating it
// lets text clip past the container edge.
const CHAR_WIDTH_RATIO = 0.7
const RADIAN = Math.PI / 180

// Small-slice labels get a reserved strip above the donut instead of side
// columns, so their connector lines never have to reach across the donut
// and their text gets the chart's full width to work with instead of a
// narrow side margin. This sizes that reservation conservatively (as if
// every label needed a full row); the labels themselves usually need much
// less than that, since they hug the ring wherever they can -- see
// `renderBand` below.
const MIN_BAND_ITEM_WIDTH = 90
const BAND_ITEM_GAP = 8
const BAND_TOP_PADDING = 8
const BAND_BOTTOM_PADDING = 8
// Extra breathing room added on top of an inline label's own estimated
// height when checking how much vertical clearance the ring needs above
// and below it.
const INLINE_LABEL_HEIGHT_BUFFER = 10

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
  // Where this slice's label would sit if it just used the same
  // ring-hugging formula as a big-slice inline label (own angle, radius =
  // effectiveOuterRadius + labelOffset). Doubles as the elbow connector's
  // bend point: the line follows the slice's true direction out to here,
  // then bends toward wherever collision resolution actually placed it.
  naturalX: number
  naturalY: number
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

  const totalValue = data.reduce((sum, item) => sum + item.value, 0)
  const percentageOf = (value: number) => (totalValue > 0 ? (value / totalValue) * 100 : 0)

  // How many small-slice labels need a spot in the band, and how they're
  // arranged into rows -- computed up front from `data` alone, so the
  // band's reserved height (and therefore the ring's center and radius)
  // is known before the ring itself renders.
  const smallCount = data.filter(item => percentageOf(item.value) <= SMALL_SLICE_THRESHOLD).length
  const effectiveContainerWidth = containerWidth > 0 ? containerWidth : outerRadius * 2 + labelOffset * 4
  const itemsPerRow = smallCount > 0
    ? Math.max(1, Math.min(smallCount, Math.floor(effectiveContainerWidth / MIN_BAND_ITEM_WIDTH)))
    : 0
  const bandRows = smallCount > 0 ? Math.ceil(smallCount / itemsPerRow) : 0
  const bandRowHeight = 2 * (fontSize + 1) + 10 // name line + percentage line, plus gap to the next row
  const bandHeight = smallCount > 0 ? BAND_TOP_PADDING + bandRows * bandRowHeight + BAND_BOTTOM_PADDING : 0

  // Shrink the donut so it fits both the container's width and whatever
  // vertical room is left below the band. Falls back to the full
  // configured radius until the container has been measured.
  const verticalRoomBelowBand = height - bandHeight
  const desiredOuterRadiusFromWidth = containerWidth > 0
    ? containerWidth / 2 - LABEL_EDGE_MARGIN - MIN_LABEL_TEXT_WIDTH
    : outerRadius
  // A big-slice inline label anchored near the bottom of the ring is the
  // tallest thing that needs to fit before the container's own bottom
  // edge. Its text block is NOT centered on its anchor point -- the first
  // tspan is centered there (dominantBaseline="central"), but every
  // subsequent line is offset further down by `dy`, so a label with
  // `n` total visual lines (wrapped name lines + 1 percentage line)
  // extends about `(n-1) * (fontSize+1) + fontSize/2` below its anchor
  // and only about `fontSize/2` above it. The downward extent is what
  // can push past the container edge, so that's what constrains the
  // ring's radius here.
  const bigSliceNameLines = data
    .filter(item => percentageOf(item.value) > SMALL_SLICE_THRESHOLD)
    .map(item => wrapName(item.name, nameWordsPerLine).length)
  const maxBigSliceLines = bigSliceNameLines.length > 0 ? Math.max(...bigSliceNameLines) : 1
  const inlineLabelDownwardExtent = maxBigSliceLines * (fontSize + 1) + fontSize / 2 + INLINE_LABEL_HEIGHT_BUFFER
  const desiredOuterRadiusFromHeight = containerWidth > 0
    ? verticalRoomBelowBand / 2 - labelOffset - inlineLabelDownwardExtent
    : outerRadius
  const minOuterRadius = outerRadius * MIN_OUTER_RADIUS_RATIO
  const effectiveOuterRadius = Math.min(
    outerRadius,
    Math.max(Math.min(desiredOuterRadiusFromWidth, desiredOuterRadiusFromHeight), minOuterRadius)
  )
  const radiusScale = effectiveOuterRadius / outerRadius
  const effectiveInnerRadius = innerRadius * radiusScale

  // Center the ring in the space below the reserved band (or dead center
  // of the whole height when there's no band, i.e. no small slices).
  const ringCenterY = bandHeight + verticalRoomBelowBand / 2
  const cyPercent = `${(ringCenterY / height) * 100}%`

  // Small slices (<=5%) always land at the tail of `data` -- callers sort
  // their data descending by value before passing it in, so once a slice
  // drops to/below the threshold every slice after it is small too. Rotate
  // the whole pie so that run's angular midpoint sits at the top (12
  // o'clock), right under the band where its labels live, instead of
  // wherever it happens to fall by default.
  let cumulativeDegrees = 0
  let smallRunStartIndex = data.length
  for (let i = 0; i < data.length; i++) {
    if (percentageOf(data[i].value) <= SMALL_SLICE_THRESHOLD) {
      smallRunStartIndex = i
      break
    }
    cumulativeDegrees += percentageOf(data[i].value) * 3.6
  }
  const rotationOffset = smallRunStartIndex < data.length
    ? 90 - (cumulativeDegrees + 360) / 2
    : 0

  // Declared fresh on every render of this component, so they never carry
  // state across renders; `renderLabel` below closes over this instance.
  // Both big- and small-slice labels are collected here rather than
  // rendered immediately, so the final pass (triggered by the last index)
  // can lay all of them out together.
  const smallSlices: SmallSlice[] = []
  const bigSlices: BigSlice[] = []

  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, index, name, value } = props
    if (index === 0) {
      smallSlices.length = 0
      bigSlices.length = 0
    }
    const percentage = percentageOf(value)
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
      const naturalRadius = effectiveOuterRadius + labelOffset
      const naturalX = cx + naturalRadius * Math.cos(-midAngle * RADIAN)
      const naturalY = cy + naturalRadius * Math.sin(-midAngle * RADIAN)
      smallSlices.push({ index, name, percentage, edgeX, edgeY, color, naturalX, naturalY })
    }

    if (!isLastIndex) {
      return null
    }

    const renderBigLabels = () =>
      bigSlices.map(slice => (
        <text
          key={`big-${slice.index}`}
          x={slice.x}
          y={slice.y}
          fill={slice.color}
          textAnchor={slice.side === 'right' ? 'start' : 'end'}
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
      ))

    // Order left-to-right by each slice's actual horizontal position so
    // connector lines never cross each other.
    const orderedSmall = [...smallSlices].sort((a, b) => a.edgeX - b.edgeX)
    const bandWidth = cx * 2

    const naturalYs = orderedSmall.map(slice => slice.naturalY)
    const minLabelVerticalGap = bandRowHeight

    // The small-slice run is bordered by two big-slice labels: the largest
    // slice (bigSlices[0]) wraps around to sit next to the run's leftmost
    // (rank 0) member, and whichever big slice immediately precedes the
    // run in the data sits next to its rightmost member. Thin slices are
    // usually angularly tight, so hugging the ring at each one's own angle
    // isn't automatically safe -- without a real ceiling here, a flank
    // label can be pushed (or simply start) close enough to the ring to
    // land on top of that neighbour's label.
    const leftNeighbor = bigSlices[0]
    const rightNeighbor = bigSlices[bigSlices.length - 1]
    const leftBoundaryY = leftNeighbor ? leftNeighbor.y - minLabelVerticalGap : Infinity
    const rightBoundaryY = rightNeighbor ? rightNeighbor.y - minLabelVerticalGap : Infinity

    let centerIdx = 0
    for (let i = 1; i < naturalYs.length; i++) {
      if (naturalYs[i] < naturalYs[centerIdx]) centerIdx = i
    }

    // Each flank is anchored to its real boundary first, then resolution
    // cascades inward toward the run's most central slice -- a label is
    // only pushed further from the ring than its own natural angle gives
    // it when the gap to its already-placed, more-flankward neighbour
    // demands it. Anchoring at the boundary (rather than working outward
    // from the centre) is what keeps a crowded run from ever overrunning
    // the neighbouring big-slice labels on either side.
    const leftPass = naturalYs.slice()
    leftPass[0] = Math.min(naturalYs[0], leftBoundaryY)
    for (let i = 1; i <= centerIdx; i++) {
      leftPass[i] = Math.min(naturalYs[i], leftPass[i - 1] - minLabelVerticalGap)
    }
    const rightPass = naturalYs.slice()
    rightPass[rightPass.length - 1] = Math.min(naturalYs[naturalYs.length - 1], rightBoundaryY)
    for (let i = naturalYs.length - 2; i >= centerIdx; i--) {
      rightPass[i] = Math.min(naturalYs[i], rightPass[i + 1] - minLabelVerticalGap)
    }
    const finalYs = naturalYs.map((_, i) => {
      if (i < centerIdx) return leftPass[i]
      if (i > centerIdx) return rightPass[i]
      return Math.min(leftPass[i], rightPass[i])
    })
    const minAllowedY = BAND_TOP_PADDING + fontSize / 2

    // Each label's own even-split slot (see labelX below) is only a
    // position, not a truncation budget: a short neighbour like "Battery"
    // doesn't use its whole slot, and that slack is real room a longer
    // name next to it can borrow. Estimate how much width each label
    // actually needs so a neighbour's truncation limit can be based on
    // what it truly occupies rather than an even share it may not need.
    const idealTextWidths = orderedSmall.map(slice =>
      Math.max(slice.name.length, `${slice.percentage.toFixed(1)}%`.length) * fontSize * CHAR_WIDTH_RATIO
    )

    const renderBand = () =>
      orderedSmall.map((slice, i) => {
        // Horizontal position is each label's rank among ALL small slices,
        // spread evenly across the full band width, so left-to-right order
        // always matches the sorted slices regardless of how the heights
        // above worked out.
        const slotWidth = bandWidth / orderedSmall.length
        const labelX = slotWidth * (i + 0.5)
        const labelY = Math.max(finalYs[i], minAllowedY)
        const leftGap = i === 0
          ? labelX - LABEL_EDGE_MARGIN
          : slotWidth - idealTextWidths[i - 1] / 2 - BAND_ITEM_GAP
        const rightGap = i === orderedSmall.length - 1
          ? bandWidth - LABEL_EDGE_MARGIN - labelX
          : slotWidth - idealTextWidths[i + 1] / 2 - BAND_ITEM_GAP
        const availableWidth = Math.max(Math.min(leftGap, rightGap) * 2, MIN_LABEL_TEXT_WIDTH)
        const maxCharsBand = Math.max(Math.floor(availableWidth / (fontSize * CHAR_WIDTH_RATIO)), 3)
        const truncatedName = slice.name.length > maxCharsBand
          ? `${slice.name.slice(0, maxCharsBand - 1)}…`
          : slice.name
        const percentageText = `${slice.percentage.toFixed(1)}%`
        // The name line is centered on labelY, but the percentage line
        // sits below it (offset by fontSize+1) and extends about another
        // fontSize/2 past its own anchor -- approaching from below the
        // whole block (rather than midway through it) keeps the line from
        // cutting across the percentage text.
        const labelBlockBottom = labelY + (fontSize + 1) + fontSize / 2 + 2
        const dx = labelX - slice.naturalX
        const blockCenterY = labelY + (fontSize + 1) / 2
        // The elbow's second segment only reads as "pointing down into the
        // block" when it's actually steeper than it is wide. Once a label
        // has hugged the ring far enough sideways that the segment runs
        // more horizontal than vertical, ending below the block makes the
        // line double back on itself -- ending at the block's near side
        // edge instead, level with its vertical centre, reads as the line
        // pointing straight at the label. Only the run's two flank slices
        // actually hug the ring at big-slice height, though -- an interior
        // slice's rank-based x can land far enough from its own natural
        // angle to look "mostly horizontal" by the same test while it's
        // still conceptually stacked above its slice, not off to the side,
        // so restrict the side approach to those flanks.
        const isFlank = i === 0 || i === orderedSmall.length - 1
        const isMostlyHorizontal = isFlank && Math.abs(dx) > Math.abs(blockCenterY - slice.naturalY)
        let targetX = labelX
        let targetY = labelBlockBottom
        if (isMostlyHorizontal) {
          const halfBlockWidth = Math.max(truncatedName.length, percentageText.length) * fontSize * CHAR_WIDTH_RATIO / 2
          targetX = dx > 0 ? labelX - halfBlockWidth : labelX + halfBlockWidth
          targetY = blockCenterY
        }

        return (
          <g key={`small-${slice.index}`}>
            <path
              d={`M ${slice.edgeX} ${slice.edgeY} L ${slice.naturalX} ${slice.naturalY} L ${targetX} ${targetY}`}
              fill="none"
              stroke={slice.color}
              strokeWidth={1.5}
            />
            <text
              x={labelX}
              y={labelY}
              fill={slice.color}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
            >
              <tspan x={labelX} dy={0}>
                {truncatedName}
              </tspan>
              <tspan x={labelX} dy={fontSize + 1}>
                {percentageText}
              </tspan>
            </text>
          </g>
        )
      })

    return (
      <>
        <g>{renderBigLabels()}</g>
        <g>{renderBand()}</g>
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
            cy={cyPercent}
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
