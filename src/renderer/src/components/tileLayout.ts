import type { Term } from './TermView'

/** How terminals of one workspace are arranged. `grid` balances them into a square-ish grid. */
export type TileMode = 'grid' | 'cols' | 'rows'

/** Columns per row for n terminals: 1 → 1, 2 → 2, 3-4 → 2 (four corners), 5-9 → 3… */
export const columnsFor = (n: number, mode: TileMode): number =>
  mode === 'rows' ? 1 : mode === 'cols' ? Math.max(1, n) : Math.max(1, Math.ceil(Math.sqrt(n)))

export function rowsFor(tiles: Term[], mode: TileMode): Term[][] {
  const cols = columnsFor(tiles.length, mode)
  const rows: Term[][] = []
  for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols))
  return rows
}
