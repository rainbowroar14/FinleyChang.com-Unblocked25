import { COLS, ROWS, COLORS, COLOR_NAMES, DIRS, createMatch, step } from './logic.js'

const URL = 'https://pntixrcmuhorvpcrhmim.supabase.co'
const KEY = 'sb_publishable_imt_ECRX2UEGTipRK9oWow_nhaLSRv8'
const CELL = 28

const lobby = document.getElementById('lobby')
const waiting = document.getElementById('waiting')
const play = document.getElementById('play')
const nameInput = document.getElementById('name')
const roomInput = document.getElementById('room')
const codeEl = document.getElementById('code')
const tag = document.getElementById('tag')
const errorEl = document.getElementById('error')
const playersEl = document.getElementById('players')
const scoreEl = document.getElementById('score')
const startButton = document.getElementById('start')
const againButton = document.getElementById('again')
const waitEl = document.getElementById('wait')
const banner = document.getElementById('banner')
const canvas = document.getElementById('board')
canvas.width = COLS * CELL
canvas.height = ROWS * CELL
const ctx = canvas.getContext('2d')

const myId = localStorage.getItem('snake-id') || crypto.randomUUID()
localStorage.setItem('snake-id', myId)
nameInput.value = localStorage.getItem('snake-name') || ''

let channel = null
let hosting = false
let hostId = ''
let roomCode = ''
let match = null
let timer = 0
const desired = {}

function myName() {
  const name = nameInput.value.trim().slice(0, 16)
  return name || 'Player'
}

function showError(text) {
  errorEl.hidden = !text
  errorEl.textContent = text
}

function alphabetCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i += 1) code += letters[Math.floor(Math.random() * letters.length)]
  return code
}

function roster() {
  if (!channel) return []
  const people = []
  for (const [id, metas] of Object.entries(channel.presenceState())) {
    const meta = metas[0] || {}
    people.push({ id, name: meta.name || 'Player', host: Boolean(meta.host), at: Number(meta.at) || 0 })
  }
  people.sort((a, b) => Number(b.host) - Number(a.host) || a.at - b.at)
  return people
}

function paintRoster(list, target, inGame) {
  target.replaceChildren()
  list.forEach((person, index) => {
    const snake = match && match.snakes.find((item) => item.id === person.id)
    const item = document.createElement('li')
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    const color = snake ? snake.color : COLORS[index] || '#8d8a82'
    swatch.style.setProperty('--c', snake && !snake.alive ? '#8d8a82' : color)
    const label = document.createElement('span')
    const role = person.host ? ' · host' : ''
    if (snake && !snake.alive) {
      item.className = 'dead'
      label.textContent = person.name + role + ' · dead'
    } else if (snake) {
      label.textContent = person.name + role + ' · ' + snake.body.length
    } else if (index < 4) {
      label.textContent = person.name + role + (inGame ? '' : ' · ' + COLOR_NAMES[index])
    } else {
      label.textContent = person.name + ' · watching'
    }
    item.append(swatch, label)
    target.appendChild(item)
  })
}

function refreshLobby() {
  const people = roster()
  paintRoster(people.slice(0, 4).concat(people.slice(4)), playersEl, false)
  const count = Math.min(4, people.length)
  startButton.hidden = !hosting
  startButton.disabled = count < 2
  startButton.textContent = count < 2 ? 'Need 2 players' : 'Start ' + count + ' players'
  if (hosting) {
    waitEl.textContent = count < 2
      ? 'Room ' + roomCode + '. Share the code, then press Start.'
      : 'Room ' + roomCode + '. Apples on the board: ' + count + '.'
  } else waitEl.textContent = 'Waiting for the host to start.'
}

function drawEye(cx, cy, px, py, rotten) {
  if (rotten) {
    ctx.strokeStyle = '#1a1714'
    ctx.lineWidth = Math.max(3, CELL * 0.16)
    ctx.lineCap = 'round'
    const s = CELL * 0.24
    ctx.beginPath()
    ctx.moveTo(cx - s, cy - s)
    ctx.lineTo(cx + s, cy + s)
    ctx.moveTo(cx + s, cy - s)
    ctx.lineTo(cx - s, cy + s)
    ctx.stroke()
    return
  }
  ctx.fillStyle = '#fffaf3'
  ctx.beginPath()
  ctx.arc(cx, cy, CELL * 0.13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.arc(cx + px, cy + py, CELL * 0.06, 0, Math.PI * 2)
  ctx.fill()
}

function drawSnake(snake) {
  const dead = !snake.alive
  snake.body.forEach((point, index) => {
    const cx = point.x * CELL + CELL / 2
    const cy = point.y * CELL + CELL / 2
    const blot = Math.abs((point.x * 13 + point.y * 7) % 4)
    ctx.fillStyle = dead ? (blot === 0 ? '#6d735f' : blot === 1 ? '#3e4638' : '#8a8d84') : snake.color
    ctx.beginPath()
    ctx.arc(cx, cy, index === 0 ? CELL * 0.46 : CELL * 0.4, 0, Math.PI * 2)
    ctx.fill()
    if (dead) {
      ctx.fillStyle = blot % 2 === 0 ? '#2c3328' : '#55604a'
      ctx.beginPath()
      ctx.arc(cx + (blot - 1) * CELL * 0.08, cy + CELL * 0.08, CELL * 0.12, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  const head = snake.body[0]
  const face = DIRS[snake.dir] || DIRS.right
  const hx = head.x * CELL + CELL / 2 + face.x * CELL * 0.08
  const hy = head.y * CELL + CELL / 2 + face.y * CELL * 0.08
  const sideX = -face.y * CELL * 0.16
  const sideY = face.x * CELL * 0.16
  const lookX = face.x * CELL * 0.05
  const lookY = face.y * CELL * 0.05
  drawEye(hx + sideX, hy + sideY, lookX, lookY, dead)
  drawEye(hx - sideX, hy - sideY, lookX, lookY, dead)
}

function drawApple(apple) {
  const cx = apple.x * CELL + CELL / 2
  const cy = apple.y * CELL + CELL / 2 + 1
  ctx.fillStyle = '#e23d3d'
  ctx.beginPath()
  ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd0c8'
  ctx.beginPath()
  ctx.arc(cx - CELL * 0.08, cy - CELL * 0.08, CELL * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6f8f45'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - CELL * 0.26)
  ctx.quadraticCurveTo(cx + CELL * 0.16, cy - CELL * 0.42, cx + CELL * 0.22, cy - CELL * 0.28)
  ctx.stroke()
}

export function draw(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#17140f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(244, 239, 228, 0.05)'
  ctx.lineWidth = 1
  for (let x = 1; x < COLS; x += 1) {
    ctx.beginPath()
    ctx.moveTo(x * CELL, 0)
    ctx.lineTo(x * CELL, ROWS * CELL)
    ctx.stroke()
  }
  for (let y = 1; y < ROWS; y += 1) {
    ctx.beginPath()
    ctx.moveTo(0, y * CELL)
    ctx.lineTo(COLS * CELL, y * CELL)
    ctx.stroke()
  }
  if (!state) return
  state.apples.forEach(drawApple)
  state.snakes.filter((snake) => !snake.alive).forEach(drawSnake)
  state.snakes.filter((snake) => snake.alive).forEach(drawSnake)
}

function outcomeText(state) {
  if (!state || !state.over) return ''
  const winner = state.snakes.find((snake) => snake.id === state.winner)
  if (!winner) return 'Everyone crashed.'
  if (winner.id === myId) return 'You win.'
  return winner.name + ' wins.'
}

function showMatch(state) {
  match = state
  draw(state)
  const mine = state.snakes.find((snake) => snake.id === myId)
  const people = state.snakes.map((snake) => ({
    id: snake.id,
    name: snake.name,
    host: roster().some((person) => person.id === snake.id && person.host),
  }))
  paintRoster(people, scoreEl, true)
  banner.hidden = !state.over
  banner.textContent = outcomeText(state)
  againButton.hidden = !(hosting && state.over)
  if (mine && !mine.alive && !state.over) tag.textContent = 'You are out. Your body stays until the game ends.'
  else if (state.over) tag.textContent = outcomeText(state)
  else tag.textContent = state.apples.length + ' apples. Block someone in and they stay down.'
}

function broadcast() {
  if (!channel || !match) return
  channel.send({ type: 'broadcast', event: 'state', payload: match })
}

function tick() {
  if (!hosting || !match || match.over) return
  match = step(match, desired)
  showMatch(match)
  broadcast()
  if (match.over) {
    window.clearInterval(timer)
    timer = 0
  }
}

function begin(players) {
  match = createMatch(players)
  for (const key of Object.keys(desired)) delete desired[key]
  lobby.hidden = true
  play.hidden = false
  showMatch(match)
  broadcast()
  if (hosting) {
    window.clearInterval(timer)
    timer = window.setInterval(tick, 140)
  }
}

function openRoom(code, asHost) {
  const lib = window.supabase
  if (!lib || !lib.createClient) {
    showError('The game server did not load.')
    return
  }
  if (channel) channel.unsubscribe()
  hosting = asHost
  roomCode = code
  const client = lib.createClient(URL, KEY)
  channel = client.channel('snake-' + code, {
    config: { broadcast: { self: false }, presence: { key: myId } },
  })
  channel.on('presence', { event: 'sync' }, () => {
    const host = roster().find((person) => person.host)
    if (host) hostId = host.id
    if (!match) refreshLobby()
  })
  channel.on('presence', { event: 'leave' }, ({ key }) => {
    if (!hosting && key === hostId) tag.textContent = 'The host left.'
    if (hosting && match) {
      const snake = match.snakes.find((item) => item.id === key && item.alive)
      if (snake) {
        snake.alive = false
        const living = match.snakes.filter((item) => item.alive)
        if (living.length <= 1) {
          match.over = true
          match.winner = living[0] ? living[0].id : null
          window.clearInterval(timer)
          timer = 0
        }
        showMatch(match)
        broadcast()
      }
    }
    if (!match) refreshLobby()
  })
  channel.on('broadcast', { event: 'start' }, ({ payload }) => {
    if (hosting || !payload || !payload.players) return
    begin(payload.players)
  })
  channel.on('broadcast', { event: 'state' }, ({ payload }) => {
    if (hosting || !payload || !payload.snakes) return
    if (lobby.hidden === false) {
      lobby.hidden = true
      play.hidden = false
    }
    showMatch(payload)
  })
  channel.on('broadcast', { event: 'dir' }, ({ payload }) => {
    if (!hosting || !payload || !payload.id || !DIRS[payload.dir]) return
    desired[payload.id] = payload.dir
  })
  channel.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return
    await channel.track({ name: myName(), host: hosting, at: Date.now() })
    document.getElementById('setup').hidden = true
    waiting.hidden = false
    codeEl.hidden = false
    codeEl.textContent = code
    tag.textContent = hosting ? 'You are the host. Leave this tab open.' : 'In room ' + code
    refreshLobby()
  })
}

function steer(dir) {
  if (!match || match.over) return
  const mine = match.snakes.find((snake) => snake.id === myId)
  if (!mine || !mine.alive || !DIRS[dir]) return
  if (hosting) desired[myId] = dir
  else if (channel) channel.send({ type: 'broadcast', event: 'dir', payload: { id: myId, dir } })
}

document.getElementById('host').addEventListener('click', () => {
  localStorage.setItem('snake-name', myName())
  showError('')
  openRoom(alphabetCode(), true)
})

document.getElementById('join').addEventListener('click', () => {
  const code = roomInput.value.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    showError('Enter the 4 letter code.')
    return
  }
  localStorage.setItem('snake-name', myName())
  showError('')
  openRoom(code, false)
})

startButton.addEventListener('click', () => {
  if (!hosting || match) return
  const people = roster().slice(0, 4)
  if (people.length < 2) return
  channel.send({ type: 'broadcast', event: 'start', payload: { players: people } })
  begin(people)
})

againButton.addEventListener('click', () => {
  if (!hosting) return
  const people = (match ? match.snakes : []).map((snake) => ({ id: snake.id, name: snake.name }))
  const still = people.filter((person) => roster().some((item) => item.id === person.id))
  if (still.length < 2) {
    tag.textContent = 'Need 2 players still in the room.'
    return
  }
  channel.send({ type: 'broadcast', event: 'start', payload: { players: still } })
  begin(still)
})

const KEYS = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

window.addEventListener('keydown', (event) => {
  const dir = KEYS[event.key.toLowerCase()]
  if (!dir || !match) return
  event.preventDefault()
  steer(dir)
})

document.getElementById('pad').addEventListener('click', (event) => {
  const dir = event.target.dataset && event.target.dataset.dir
  if (dir) steer(dir)
})

nameInput.addEventListener('input', () => {
  if (nameInput.value.length > 16) nameInput.value = nameInput.value.slice(0, 16)
})
