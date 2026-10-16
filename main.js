import { COLS, ROWS, COLORS, COLOR_NAMES, DIRS, createMatch, step, markDead } from './logic.js?v=2'

const URL = 'https://pntixrcmuhorvpcrhmim.supabase.co'
const KEY = 'sb_publishable_imt_ECRX2UEGTipRK9oWow_nhaLSRv8'
const CELL = 32

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
    const fruits = snake ? snake.fruits || 0 : 0
    if (snake && !snake.alive) {
      item.className = 'dead'
      label.textContent = person.name + role + ' · ' + fruits + ' · dead'
    } else if (snake) {
      label.textContent = person.name + role + ' · ' + fruits
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
  startButton.disabled = count < 1
  startButton.textContent = count <= 1 ? 'Start solo' : 'Start ' + count + ' players'
  if (hosting) {
    waitEl.textContent = count <= 1
      ? 'Room ' + roomCode + '. Start solo, or share the code.'
      : 'Room ' + roomCode + '. Apples on the board: ' + count + '.'
  } else waitEl.textContent = 'Waiting for the host to start.'
}

function drawEye(x, y, ox, oy, rotten) {
  const cx = x * CELL + Math.floor(CELL / 2) + ox
  const cy = y * CELL + Math.floor(CELL / 2) + oy
  if (rotten) {
    ctx.fillStyle = '#16140f'
    for (let i = -2; i <= 2; i += 1) {
      ctx.fillRect(cx + i * 2 - 1, cy + i * 2 - 1, 3, 3)
      ctx.fillRect(cx - i * 2 - 1, cy + i * 2 - 1, 3, 3)
    }
    return
  }
  ctx.fillStyle = '#102010'
  ctx.fillRect(cx - 3, cy - 3, 6, 6)
}

function drawSnake(snake) {
  const dead = !snake.alive
  snake.body.forEach((point) => {
    const blot = Math.abs((point.x * 13 + point.y * 7) % 3)
    ctx.fillStyle = dead ? (blot === 0 ? '#5c6552' : blot === 1 ? '#2f382c' : '#8b907f') : snake.color
    ctx.fillRect(point.x * CELL + 2, point.y * CELL + 2, CELL - 4, CELL - 4)
    if (dead) {
      ctx.fillStyle = '#1e261c'
      ctx.fillRect(point.x * CELL + 8, point.y * CELL + 18, 8, 6)
    }
  })
  const head = snake.body[0]
  const face = DIRS[snake.dir] || DIRS.right
  const shift = 7
  drawEye(head.x, head.y, face.x * 2 - face.y * shift, face.y * 2 + face.x * shift, dead)
  drawEye(head.x, head.y, face.x * 2 + face.y * shift, face.y * 2 - face.x * shift, dead)
}

function drawApple(apple) {
  ctx.fillStyle = '#e23b2f'
  ctx.fillRect(apple.x * CELL + 8, apple.y * CELL + 8, CELL - 16, CELL - 14)
  ctx.fillStyle = '#67b33a'
  ctx.fillRect(apple.x * CELL + 16, apple.y * CELL + 4, 4, 6)
}

export function draw(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0c140c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#243024'
  ctx.lineWidth = 1
  for (let x = 0; x <= COLS; x += 1) {
    ctx.beginPath()
    ctx.moveTo(x * CELL + 0.5, 0)
    ctx.lineTo(x * CELL + 0.5, ROWS * CELL)
    ctx.stroke()
  }
  for (let y = 0; y <= ROWS; y += 1) {
    ctx.beginPath()
    ctx.moveTo(0, y * CELL + 0.5)
    ctx.lineTo(COLS * CELL, y * CELL + 0.5)
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
  if (!winner) return 'Tie on fruits.'
  const fruits = winner.fruits || 0
  if (state.snakes.length === 1) return fruits + (fruits === 1 ? ' fruit.' : ' fruits.')
  if (winner.id === myId) return 'You win. ' + fruits + ' fruits.'
  return winner.name + ' wins. ' + fruits + ' fruits.'
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
  if (mine && !mine.alive && !state.over) tag.textContent = 'You are out. They only win once they have more fruits.'
  else if (state.over) tag.textContent = outcomeText(state)
  else if (state.snakes.some((snake) => !snake.alive)) tag.textContent = 'Still going. Most fruits wins.'
  else if (state.snakes.length === 1) tag.textContent = 'Solo. Eat until you crash.'
  else tag.textContent = state.apples.length + ' apples on a 15×15 grid.'
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
    timer = window.setInterval(tick, 180)
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
    if (hosting && match && !match.over) {
      const snake = match.snakes.find((item) => item.id === key && item.alive)
      if (snake) {
        match = markDead(match, key)
        showMatch(match)
        broadcast()
        if (match.over) {
          window.clearInterval(timer)
          timer = 0
        }
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
  if (!people.length) return
  channel.send({ type: 'broadcast', event: 'start', payload: { players: people } })
  begin(people)
})

againButton.addEventListener('click', () => {
  if (!hosting) return
  const people = (match ? match.snakes : []).map((snake) => ({ id: snake.id, name: snake.name }))
  const still = people.filter((person) => roster().some((item) => item.id === person.id))
  if (!still.length) {
    tag.textContent = 'Stay in the room to play again.'
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
