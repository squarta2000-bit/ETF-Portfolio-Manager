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
  const totalValue = data.reduce((sum, item) => sum + item.value, 0)
  // Declared fresh on every render of this component, so it never carries
  // state across renders; `renderLabel` below closes over this instance.
  const smallSlices: SmallSlice[] = []

  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, index, name, value } = props
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0
    const color = PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]
    const isLastIndex = index === data.length - 1

    let primary: React.ReactNode = null

    if (percentage > SMALL_SLICE_THRESHOLD) {
      const radius = outerRadius + labelOffset
      const x = cx + radius * Math.cos(-midAngle * RADIAN)
      const y = cy + radius * Math.sin(-midAngle * RADIAN)
      const lines = wrapName(name, nameWordsPerLine)

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
      const edgeX = cx + outerRadius * Math.cos(-midAngle * RADIAN)
      const edgeY = cy + outerRadius * Math.sin(-midAngle * RADIAN)
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
      const startY = cy - ((slices.length - 1) * SMALL_ROW_HEIGHT) / 2
      return slices.map((slice, i) => {
        const labelY = startY + i * SMALL_ROW_HEIGHT
        const elbowX = cx + sideSign * (outerRadius + SMALL_ELBOW_OFFSET)
        const labelX = cx + sideSign * (outerRadius + SMALL_LABEL_OFFSET)
        const textAnchor = sideSign === 1 ? 'start' : 'end'
        const textX = labelX + sideSign * 4
        const lines = wrapName(slice.name, nameWordsPerLine)

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
    <div className="w-full" style={{ minHeight: `${height}px`, height: `${height}px` }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            fill="#8884d8"
            dataKey="value"
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
