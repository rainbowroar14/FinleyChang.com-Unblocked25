const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function createTtt(players) {
  const x = { id: players[0].id, name: players[0].name || 'Player' }
  const second = players[1]
  const o = second ? { id: second.id, name: second.name || 'Player' } : { id: x.id, name: x.name }
  return {
    cells: ['', '', '', '', '', '', '', '', ''],
    turn: 'x',
    over: false,
    winner: null,
    line: null,
    x,
    o,
  }
}

function resultOf(cells) {
  for (const line of LINES) {
    const [a, b, c] = line
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return { mark: cells[a], line }
  }
  if (cells.every(Boolean)) return { mark: 'draw', line: null }
  return null
}

export function place(state, index, id) {
  if (!state || state.over) return state
  if (!Number.isInteger(index) || index < 0 || index > 8) return state
  if (state.cells[index]) return state
  const side = state.turn === 'x' ? state.x : state.o
  if (!side || side.id !== id) return state
  const cells = state.cells.slice()
  cells[index] = state.turn
  const result = resultOf(cells)
  return {
    cells,
    turn: result ? state.turn : state.turn === 'x' ? 'o' : 'x',
    over: Boolean(result),
    winner: result ? result.mark : null,
    line: result ? result.line : null,
    x: state.x,
    o: state.o,
  }
}
