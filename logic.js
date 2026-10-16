export const COLS = 15
export const ROWS = 15
export const COLORS = ['#3ddc97', '#5b8cff', '#ff5d73', '#ffb020']
export const COLOR_NAMES = ['Green', 'Blue', 'Pink', 'Amber']

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

const STARTS = [
  { dir: 'right', x: 3, y: 3, back: 'left' },
  { dir: 'left', x: 11, y: 11, back: 'right' },
  { dir: 'down', x: 11, y: 3, back: 'up' },
  { dir: 'up', x: 3, y: 11, back: 'down' },
]

function line(x, y, back, length) {
  const step = DIRS[back]
  const body = []
  for (let i = 0; i < length; i += 1) body.push({ x: x + step.x * i, y: y + step.y * i })
  return body
}

export function createMatch(players, rng = Math.random) {
  const snakes = players.slice(0, 4).map((player, index) => {
    const start = STARTS[index]
    return {
      id: player.id,
      name: player.name,
      color: COLORS[index],
      dir: start.dir,
      body: line(start.x, start.y, start.back, 3),
      alive: true,
      fruits: 0,
    }
  })
  const state = { snakes, apples: [], tick: 0, over: false, winner: null }
  refillApples(state, rng)
  return state
}

function keyOf(point) {
  return point.x + ',' + point.y
}

function occupied(state) {
  const cells = new Set()
  for (const snake of state.snakes) {
    for (const point of snake.body) cells.add(keyOf(point))
  }
  for (const apple of state.apples) cells.add(keyOf(apple))
  return cells
}

function randomEmpty(state, rng) {
  const taken = occupied(state)
  const open = []
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!taken.has(x + ',' + y)) open.push({ x, y })
    }
  }
  if (!open.length) return null
  return open[Math.floor(rng() * open.length)]
}

function refillApples(state, rng) {
  const target = state.snakes.length
  while (state.apples.length > target) state.apples.pop()
  while (state.apples.length < target) {
    const spot = randomEmpty(state, rng)
    if (!spot) break
    state.apples.push(spot)
  }
}

function bestFruit(snakes) {
  return Math.max(...snakes.map((snake) => snake.fruits || 0))
}

export function settle(state) {
  const living = state.snakes.filter((snake) => snake.alive)
  const dead = state.snakes.filter((snake) => !snake.alive)
  if (!dead.length) return state
  const top = bestFruit(state.snakes)
  const leaders = state.snakes.filter((snake) => (snake.fruits || 0) === top)
  if (!living.length) {
    state.over = true
    state.winner = leaders.length === 1 ? leaders[0].id : null
    return state
  }
  const deadTop = bestFruit(dead)
  const ahead = living.filter((snake) => (snake.fruits || 0) > deadTop)
  if (ahead.length === 1) {
    state.over = true
    state.winner = ahead[0].id
  }
  return state
}

export function markDead(state, id) {
  if (state.over) return state
  const snake = state.snakes.find((item) => item.id === id && item.alive)
  if (!snake) return state
  snake.alive = false
  return settle(state)
}

export function step(state, wanted = {}, rng = Math.random) {
  if (state.over) return state
  const snakes = state.snakes.map((snake) => ({
    ...snake,
    body: snake.body.map((point) => ({ ...point })),
  }))
  const apples = state.apples.map((apple) => ({ ...apple }))
  const next = { snakes, apples, tick: state.tick + 1, over: false, winner: null }

  const moves = snakes.map((snake) => {
    if (!snake.alive) return null
    let dir = wanted[snake.id] || snake.dir
    if (!DIRS[dir] || dir === OPPOSITE[snake.dir]) dir = snake.dir
    const head = snake.body[0]
    const stepDir = DIRS[dir]
    return { dir, x: head.x + stepDir.x, y: head.y + stepDir.y }
  })

  const dying = snakes.map(() => false)
  for (let i = 0; i < snakes.length; i += 1) {
    const move = moves[i]
    if (!move) continue
    if (move.x < 0 || move.y < 0 || move.x >= COLS || move.y >= ROWS) dying[i] = true
    for (let j = i + 1; j < snakes.length; j += 1) {
      const other = moves[j]
      if (!other || dying[j]) continue
      if (move.x === other.x && move.y === other.y) {
        dying[i] = true
        dying[j] = true
      }
    }
  }

  const grown = snakes.map((snake, index) => {
    if (!snake.alive || dying[index]) return false
    const move = moves[index]
    return apples.some((apple) => apple.x === move.x && apple.y === move.y)
  })

  const placed = snakes.map((snake, index) => {
    if (!snake.alive || dying[index]) return snake.body
    const move = moves[index]
    const body = [{ x: move.x, y: move.y }, ...snake.body]
    if (!grown[index]) body.pop()
    return body
  })

  const cells = new Map()
  placed.forEach((body, index) => {
    body.forEach((point, part) => {
      const key = keyOf(point)
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push({ index, part })
    })
  })

  for (let i = 0; i < snakes.length; i += 1) {
    if (!snakes[i].alive || dying[i]) continue
    const move = moves[i]
    const hits = cells.get(keyOf(move)) || []
    if (hits.some((hit) => hit.index !== i || hit.part !== 0)) dying[i] = true
  }

  const eaten = []
  for (let i = 0; i < snakes.length; i += 1) {
    const snake = snakes[i]
    if (!snake.alive) continue
    if (dying[i]) {
      snake.alive = false
      continue
    }
    snake.dir = moves[i].dir
    snake.body = placed[i]
    if (grown[i]) {
      snake.fruits = (snake.fruits || 0) + 1
      eaten.push(keyOf(moves[i]))
    }
  }

  next.apples = apples.filter((apple) => !eaten.includes(keyOf(apple)))
  refillApples(next, rng)
  return settle(next)
}
