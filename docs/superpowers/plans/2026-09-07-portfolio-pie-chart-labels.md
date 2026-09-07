# Portfolio Pie Chart Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every slice of the portfolio pie/donut chart a label with its percentage, including slices too small to fit an inline label today — those get a leader line (with one corner) pointing back to their slice, colored to match the slice.

**Architecture:** Extract the duplicated pie-chart-plus-labels code from `StatisticsPage.tsx` and `StatisticsDialog.tsx` into one shared `PortfolioPieChart` component. That component renders two label styles from the same custom Recharts `label` callback: an inline two-line label (name, then percentage) for slices above a 5% threshold, and a stacked, color-matched leader-line label for slices at or below that threshold, so small slices are never hidden.

**Tech Stack:** React 18, Recharts (`PieChart`/`Pie`/`Cell`), plain SVG (`<path>`, `<text>`, `<tspan>`) for the custom label/leader-line layer, TypeScript, Vite.

**Spec:** No separate spec file — this is a bounded-scope UI enhancement. The design was agreed through chat brainstorming (multiple clarifying questions on percentage placement, file scope, overlap handling, threshold, and connector-line coloring — all confirmed by the user). This plan is the record of that agreement; Global Constraints below carries every value that was pinned down.

## Global Constraints

- `SMALL_SLICE_THRESHOLD = 5` (percent). Slices with `percentage > 5` use the inline label style (unchanged position from today). Slices with `percentage <= 5` use the new leader-line style. This is the same cutoff the old code used to hide labels — it now routes to a visible style instead of `null`.
- Every label (both styles) is two lines: the slice name on top (word-wrapped per the existing per-file rule), the percentage directly below it, formatted as `` `${percentage.toFixed(1)}%` ``.
- Every leader line for a small slice is stroked with **that slice's own color** — the same color used for its label text and its `Cell` fill. No gray/neutral connector lines.
- The leader line has exactly one corner: a segment from the slice's outer edge to an "elbow" point, then a horizontal segment from the elbow into the label. Not a straight line, not multiple bends.
- Small-slice labels are grouped by which half of the circle they fall in (left if the slice's edge x-coordinate is less than the chart center x, right otherwise), then stacked vertically within each group, centered on the chart's vertical center (`cy`), ordered top-to-bottom to match their on-circle order (top-to-bottom by edge y) so lines never cross within a group.
- The color palette (`PORTFOLIO_CHART_COLORS`), in this exact order, moves to the new shared component and both call sites import it from there instead of keeping their own copy:
  ```
  '#7C9CBF', '#8EBA9F', '#E8B98A', '#D4A5A5', '#B4A3D8', '#E5A9C3',
  '#88C5D1', '#D9B38C', '#B5C99A', '#A9B4D6', '#98C9C0', '#E3B8C5'
  ```
- Call-site visual parameters (must reproduce today's inline-label geometry exactly for slices above the threshold):
  - `StatisticsPage.tsx`: `innerRadius=60`, `outerRadius=100`, `height=350`, `labelOffset=25`, `nameWordsPerLine=1`, `fontSize=12`.
  - `StatisticsDialog.tsx`: `innerRadius=70`, `outerRadius=120`, `height=400`, `labelOffset=30`, `nameWordsPerLine=2`, `fontSize=13`.
- This repo has no automated test framework (`package.json` has no `test` script; no Jest/Vitest/Playwright-test config exists). Per-task verification is `npm run build` (TypeScript + Vite build must succeed with no errors). Visual verification is a dedicated Playwright screenshot task (Task 4) — not unit tests.
- Never mutate the live Supabase-backed portfolio data during verification (no adding/editing/deleting real packages through the running app). Task 4 uses a throwaway, network-free mock-data harness for deterministic screenshots, deleted before the task's commit.
- Do not restructure `StatisticsPage.tsx` / `StatisticsDialog.tsx` beyond what's needed to use the new component — their data-aggregation logic and tables are unchanged (the dialog's table has an extra Gain/Loss column; that stays).

---

### Task 1: Create the shared `PortfolioPieChart` component

**Files:**
- Create: `src/app/components/PortfolioPieChart.tsx`

**Interfaces:**
- Produces: `export function PortfolioPieChart(props: PortfolioPieChartProps)`, where
  ```ts
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
  ```
- Produces: `export const PORTFOLIO_CHART_COLORS: string[]` (the 12-color palette from Global Constraints, in that exact order).
- Consumes: nothing from other tasks (this is the first task). `data` items may carry extra fields (callers pass their aggregated objects, which have more properties than `isin`/`name`/`value`) — TypeScript's structural typing allows this for a variable passed as a prop, so no casting is needed.

- [ ] **Step 1: Write the component**

Create `src/app/components/PortfolioPieChart.tsx` with exactly this content:

```tsx
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
```

Note on the accumulator: `smallSlices` is a local `const` inside the component function body, so every render of `PortfolioPieChart` creates a fresh, empty array; `renderLabel` (also redefined every render) closes over that render's array. Recharts calls `renderLabel` once per slice, synchronously, in `data` order, so by the time the last slice's call runs, every small slice from that render has already been pushed. There's no ref or module-level mutable state involved, and nothing persists across renders.

- [ ] **Step 2: Type-check and build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (this file isn't imported anywhere yet, so this just confirms it compiles standalone — Vite/tsc will still typecheck it as part of the module graph once Task 2 imports it, but running the build now catches syntax errors early).

- [ ] **Step 3: Commit**

```bash
git add src/app/components/PortfolioPieChart.tsx
git commit -m "feat: add shared PortfolioPieChart component with leader-line labels"
```

---

### Task 2: Wire `StatisticsPage.tsx` to use `PortfolioPieChart`

**Files:**
- Modify: `src/app/components/StatisticsPage.tsx`

**Interfaces:**
- Consumes: `PortfolioPieChart` and `PORTFOLIO_CHART_COLORS` from `./PortfolioPieChart` (Task 1).

- [ ] **Step 1: Remove the recharts import and local color palette**

In `src/app/components/StatisticsPage.tsx`, replace this line:
```ts
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
```
with:
```ts
import { PortfolioPieChart, PORTFOLIO_CHART_COLORS as COLORS } from './PortfolioPieChart'
```

Then delete the local `COLORS` array declaration (the `const COLORS = [...]` block right below the imports) — the renamed import above replaces it, and every existing `COLORS[index % COLORS.length]` reference in the table further down the file keeps working unchanged.

- [ ] **Step 2: Remove the local `renderLabel` function**

Delete the entire `renderLabel` function (the block starting with `// Custom label for pie chart with word wrapping` and ending at the closing `}` of that function, just before the component's `return`). It's fully replaced by the shared component's internal label logic.

- [ ] **Step 3: Replace the chart markup**

Replace this block:
```tsx
              {/* Pie Chart */}
              <div className="w-full" style={{ minHeight: '350px', height: '350px' }}>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={sortedData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderLabel}
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sortedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
```
with:
```tsx
              {/* Pie Chart */}
              <PortfolioPieChart
                data={sortedData}
                innerRadius={60}
                outerRadius={100}
                height={350}
                labelOffset={25}
                nameWordsPerLine={1}
                fontSize={12}
              />
```

- [ ] **Step 4: Type-check and build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/StatisticsPage.tsx
git commit -m "refactor: use shared PortfolioPieChart in StatisticsPage"
```

---

### Task 3: Wire `StatisticsDialog.tsx` to use `PortfolioPieChart`

**Files:**
- Modify: `src/app/components/StatisticsDialog.tsx`

**Interfaces:**
- Consumes: `PortfolioPieChart` and `PORTFOLIO_CHART_COLORS` from `./PortfolioPieChart` (Task 1).

- [ ] **Step 1: Remove the recharts import and local color palette**

In `src/app/components/StatisticsDialog.tsx`, replace this line:
```ts
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
```
with:
```ts
import { PortfolioPieChart, PORTFOLIO_CHART_COLORS as COLORS } from './PortfolioPieChart'
```

Then delete the local `COLORS` array declaration, same as Task 2 — the existing `COLORS[index % COLORS.length]` references in the table (including the Gain/Loss column swatch) keep working unchanged.

- [ ] **Step 2: Remove the local `renderLabel` function**

Delete the entire `renderLabel` function in this file (same shape as `StatisticsPage.tsx`'s, but with `radius = outerRadius + 30`, `maxWordsPerLine = 2`, `fontSize="13"` — all of that is now handled by `PortfolioPieChart`'s props).

- [ ] **Step 3: Replace the chart markup**

Replace this block:
```tsx
              {/* Pie Chart */}
              <div className="w-full" style={{ minHeight: '400px', height: '400px' }}>
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={sortedData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderLabel}
                      innerRadius={70}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sortedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
```
with:
```tsx
              {/* Pie Chart */}
              <PortfolioPieChart
                data={sortedData}
                innerRadius={70}
                outerRadius={120}
                height={400}
                labelOffset={30}
                nameWordsPerLine={2}
                fontSize={13}
              />
```

- [ ] **Step 4: Type-check and build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/StatisticsDialog.tsx
git commit -m "refactor: use shared PortfolioPieChart in StatisticsDialog"
```

---

### Task 4: Playwright visual verification with screenshots

**Files:**
- Create (temporary, deleted by Step 6 — never committed): `preview.html`, `src/dev-preview.tsx`
- Create (kept, committed): `screenshot/pie-chart-mock-preview.png`, `screenshot/pie-chart-live-app.png`

**Interfaces:**
- Consumes: `PortfolioPieChart` from `src/app/components/PortfolioPieChart.tsx` (Task 1), used directly with mock data — no network calls, no Supabase.

**Why a mock harness instead of the real app:** the real app's chart is fed by live Supabase data (`src/app/App.tsx` fetches from a real backend). That data's slice sizes are whatever the user's actual portfolio happens to contain right now, which may or may not include any slice ≤5% — so it cannot reliably exercise the new leader-line/stacking code path. It would also be unsafe to add/delete real packages through the UI just to manufacture small slices, since that mutates the user's live shared data. Instead, this task renders `PortfolioPieChart` directly with fixed mock data covering both label styles and multi-slice stacking on both sides, screenshots that, then also takes one read-only screenshot of the real running app (no data mutation) as an integration sanity check.

- [ ] **Step 1: Create the mock-data harness**

Create `preview.html` at the repository root with exactly this content:
```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Chart Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev-preview.tsx"></script>
  </body>
</html>
```

Create `src/dev-preview.tsx` with exactly this content:
```tsx
import { createRoot } from 'react-dom/client'
import { PortfolioPieChart } from './app/components/PortfolioPieChart'
import './styles/index.css'

const mockData = [
  { isin: 'A', name: 'Rent', value: 400 },
  { isin: 'B', name: 'Food', value: 250 },
  { isin: 'C', name: 'Bonds', value: 150 },
  { isin: 'D', name: 'Tech Fund', value: 50 },
  { isin: 'E', name: 'Gold', value: 40 },
  { isin: 'F', name: 'Bitcoin ETF', value: 30 },
  { isin: 'G', name: 'REIT', value: 25 },
  { isin: 'H', name: 'Emerging Mkts', value: 25 },
  { isin: 'I', name: 'Small Cap', value: 30 },
]

createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 900, margin: '40px auto' }}>
    <PortfolioPieChart
      data={mockData}
      innerRadius={70}
      outerRadius={120}
      height={400}
      labelOffset={30}
      nameWordsPerLine={2}
      fontSize={13}
    />
  </div>
)
```
(Total is 1000: 3 slices above the 5% threshold — 40%, 25%, 15% — and 6 slices at or below it — 5%, 4%, 3%, 2.5%, 2.5%, 3% — spread around the circle so the stacking logic is exercised on both the left and right sides.)

- [ ] **Step 2: Start the dev server**

Run in background: `npm run dev`
Wait for output containing `Local:   http://localhost:5173/` (or whatever port Vite actually reports — use the reported port, don't assume 5173 if it differs because another process is using it).

- [ ] **Step 3: Screenshot the mock harness**

Using the Playwright browser tools (load them first with `ToolSearch({query: "select:mcp__playwright__browser_navigate,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_console_messages,mcp__playwright__browser_wait_for,mcp__playwright__browser_resize,mcp__playwright__browser_close"})`):

1. Navigate to `http://localhost:5173/preview.html` (substitute the actual port from Step 2).
2. Resize the browser to at least 1000x600 so nothing is clipped.
3. Wait for an `svg` element to be present (the chart has rendered).
4. Read console messages — confirm there are no errors. If there are errors, treat this as a blocker: report them and stop rather than screenshotting a broken render.
5. Create the `screenshot/` directory at the repo root if it doesn't exist.
6. Take a full-page screenshot and save it to `screenshot/pie-chart-mock-preview.png`.
7. Visually confirm in the screenshot: the three big slices (Rent/Food/Bonds) show name+percentage inline with no line; the six small slices show name+percentage connected to their slice by a single-corner line in that slice's own color; the small labels on each side are stacked without overlapping.

- [ ] **Step 4: Screenshot the real app (read-only sanity check)**

1. Navigate to `http://localhost:5173/` (the real app root).
2. Wait for the page to finish loading (the "Loading your portfolio..." spinner to disappear).
3. Click the "Stats" button to open the Statistics view (dialog on desktop-width viewport).
4. Wait for the chart's `svg` to appear.
5. Take a screenshot and save it to `screenshot/pie-chart-live-app.png`.
6. Do not click anything that adds, edits, or deletes a package. This is a read-only check that the real integration (Task 2/3's wiring) renders without errors — the real data's slice sizes are whatever they are; that's fine, it's not what this step verifies.
7. Close the browser (`mcp__playwright__browser_close`).

- [ ] **Step 5: Stop the dev server**

Stop the background `npm run dev` process.

- [ ] **Step 6: Delete the throwaway harness**

```bash
rm preview.html src/dev-preview.tsx
```
Confirm with `git status` that these two files are gone and were never staged (they should not appear at all, since they were never `git add`ed).

- [ ] **Step 7: Commit only the screenshots**

```bash
git add screenshot/pie-chart-mock-preview.png screenshot/pie-chart-live-app.png
git commit -m "test: add Playwright screenshots verifying pie chart leader-line labels"
```

- [ ] **Step 8: Final confirmation**

Run `git status` — expected: clean (no untracked/modified files other than what was just committed). Run `npm run build` one final time — expected: succeeds. Report both screenshot paths in your final report so the controller can relay them.
