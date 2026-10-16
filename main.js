import { COLS, ROWS, COLORS, COLOR_NAMES, DIRS, createMatch, step, markDead } from './logic.js?v=2'
import { createTtt, place } from './ttt.js?v=1'
import { createStealth } from './stealth.js?v=1'

const URL = 'https://pntixrcmuhorvpcrhmim.supabase.co'
const KEY = 'sb_publishable_imt_ECRX2UEGTipRK9oWow_nhaLSRv8'
const CELL = 32
const GAME_LABEL = { snake: 'Snake', ttt: 'Tic Tac Toe', stealth: 'Stealth' }

const lobby = document.getElementById('lobby')
const waiting = document.getElementById('waiting')
const play = document.getElementById('play')
const nameInput = document.getElementById('name')
const roomInput = document.getElementById('room')
const codeEl = document.getElementById('code')
const tag = document.getElementById('tag')
const mark = document.getElementById('mark')
const errorEl = document.getElementById('error')
const playersEl = document.getElementById('players')
const scoreEl = document.getElementById('score')
const startButton = document.getElementById('start')
const againButton = document.getElementById('again')
const waitEl = document.getElementById('wait')
const banner = document.getElementById('banner')
const helpEl = document.getElementById('help')
const pad = document.getElementById('pad')
const grid = document.getElementById('grid')
const canvas = document.getElementById('board')
canvas.width = COLS * CELL
canvas.height = ROWS * CELL
const ctx = canvas.getContext('2d')

const myId = localStorage.getItem('snake-id') || crypto.randomUUID()
localStorage.setItem('snake-id', myId)
nameInput.value = localStorage.getItem('snake-name') || ''

let channel = null
let lobbyChannel = null
let client = null
let lobbyClient = null
let advertised = ''
let hosting = false
let publicGame = false
let hostId = ''
let roomCode = ''
let roomGame = 'snake'
let joinedAt = 0
let match = null
let timer = 0
let picked = 'snake'
const desired = {}
const gamesEl = document.getElementById('games')
const gamesEmpty = document.getElementById('games-empty')

function gameClient() {
  const lib = window.supabase
  if (!lib || !lib.createClient) return null
  if (!client) client = lib.createClient(URL, KEY)
  return client
}

function lobbyRealtime() {
  const lib = window.supabase
  if (!lib || !lib.createClient) return null
  if (!lobbyClient) lobbyClient = lib.createClient(URL, KEY)
  return lobbyClient
}

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

function gameOf(value) {
  if (value === 'ttt' || value === 'stealth') return value
  return 'snake'
}

function maxPlayers() {
  return roomGame === 'ttt' ? 2 : 4
}

function selectGame(game) {
  picked = gameOf(game)
  localStorage.setItem('game-pick', picked)
  ;['snake', 'ttt', 'stealth'].forEach((id) => {
    const card = document.getElementById('pick-' + id)
    const on = picked === id
    card.classList.toggle('on', on)
    card.setAttribute('aria-pressed', String(on))
  })
  document.getElementById('host').textContent = picked === 'stealth' ? 'Play' : 'Host public'
  roomInput.disabled = picked === 'stealth'
  document.getElementById('join').disabled = picked === 'stealth'
  document.getElementById('blurb').textContent = picked === 'stealth'
    ? 'Stealth is played on this screen. Pick Snake or Tic Tac Toe to host or join.'
    : 'Pick a game to host. Join a row below, or enter a code for the game you picked.'
  if (!channel) {
    mark.textContent = GAME_LABEL[picked]
    tag.textContent = picked === 'ttt'
      ? 'Tic Tac Toe. Host a public game or join one.'
      : picked === 'stealth'
        ? 'Stealth. You only see 45° ahead. Walls block sight and bullets.'
        : 'Snake. Host a public game or join one.'
  }
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
    const snake = match && match.snakes && match.snakes.find((item) => item.id === person.id)
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

function paintWaiting(people) {
  if (roomGame !== 'ttt') {
    paintRoster(people.slice(0, 4).concat(people.slice(4)), playersEl, false)
    return
  }
  playersEl.replaceChildren()
  people.forEach((person, index) => {
    const item = document.createElement('li')
    const label = document.createElement('span')
    const seat = index === 0 ? 'X' : index === 1 ? 'O' : 'watching'
    label.textContent = person.name + (person.host ? ' · host' : '') + ' · ' + seat
    item.append(label)
    playersEl.appendChild(item)
  })
}

function refreshLobby() {
  const people = roster()
  paintWaiting(people)
  const count = Math.min(maxPlayers(), people.length)
  startButton.hidden = !hosting
  startButton.disabled = count < 1
  if (roomGame === 'ttt') {
    startButton.textContent = count <= 1 ? 'Play here' : 'Start'
    if (hosting) {
      waitEl.textContent = count <= 1
        ? 'Room ' + roomCode + '. Wait for an opponent, or play both sides here.'
        : 'Room ' + roomCode + '. X goes first.'
    } else waitEl.textContent = 'Waiting for the host to start.'
  } else {
    startButton.textContent = count <= 1 ? 'Start solo' : 'Start ' + count + ' players'
    if (hosting) {
      waitEl.textContent = count <= 1
        ? 'Room ' + roomCode + '. Start solo, or wait for someone from the list.'
        : 'Room ' + roomCode + '. Apples on the board: ' + count + '.'
    } else waitEl.textContent = 'Waiting for the host to start.'
  }
  if (publicGame && !match) advertise()
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

function showBoard(game) {
  document.getElementById('snake-stage').hidden = game !== 'snake'
  document.getElementById('ttt-stage').hidden = game !== 'ttt'
  document.getElementById('stealth-stage').hidden = game !== 'stealth'
  pad.hidden = game !== 'snake'
  document.getElementById('stealth-pad').hidden = game !== 'stealth'
  helpEl.textContent = game === 'ttt'
    ? 'Tap a square on your turn. Three in a row wins.'
    : game === 'stealth'
      ? 'Arrows or WASD to move and turn. Space or Fire to shoot. You only see 45° ahead.'
      : 'Arrows or WASD. Most fruits wins. Dead snakes stay on the grid.'
  banner.classList.toggle('under', game === 'ttt')
  mark.textContent = GAME_LABEL[game] || 'Games'
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

function tttText(state) {
  const local = state.x.id === state.o.id
  if (!state.over) {
    const side = state.turn === 'x' ? state.x : state.o
    if (local) return side.name + ' plays ' + state.turn.toUpperCase() + '.'
    if (side.id === myId) return 'Your turn.'
    return side.name + "'s turn."
  }
  if (state.winner === 'draw') return 'Draw.'
  const side = state.winner === 'x' ? state.x : state.o
  if (local) return state.winner.toUpperCase() + ' wins.'
  if (side.id === myId) return 'You win.'
  return side.name + ' wins.'
}

function showTtt(state) {
  match = state
  const line = new Set(state.line || [])
  const side = state.turn === 'x' ? state.x : state.o
  const mine = side.id === myId
  grid.querySelectorAll('button').forEach((button) => {
    const index = Number(button.dataset.i)
    const markCell = state.cells[index]
    button.textContent = markCell ? markCell.toUpperCase() : ''
    button.className = (markCell || '') + (line.has(index) ? ' win' : '')
    button.disabled = Boolean(markCell) || state.over || !mine
  })
  scoreEl.replaceChildren()
  ;['x', 'o'].forEach((key) => {
    const player = state[key]
    const item = document.createElement('li')
    if (!state.over && state.turn === key) item.className = 'turn'
    const label = document.createElement('span')
    label.textContent = player.name + ' · ' + key.toUpperCase()
    item.append(label)
    scoreEl.appendChild(item)
  })
  const text = tttText(state)
  banner.hidden = !state.over
  banner.textContent = text
  againButton.hidden = !(hosting && state.over)
  tag.textContent = text
}

function broadcast() {
  if (!channel || !match) return
  channel.send({ type: 'broadcast', event: 'state', payload: match })
}

function tick() {
  if (!hosting || !match || match.over || roomGame !== 'snake') return
  match = step(match, desired)
  showMatch(match)
  broadcast()
  if (match.over) {
    window.clearInterval(timer)
    timer = 0
  }
}

function applyMove(id, index) {
  if (roomGame !== 'ttt' || !match || match.over) return
  const next = place(match, Number(index), id)
  if (next === match) return
  match = next
  showTtt(match)
  broadcast()
}

function begin(players) {
  window.clearInterval(timer)
  timer = 0
  for (const key of Object.keys(desired)) delete desired[key]
  publicGame = false
  advertised = ''
  if (lobbyChannel) lobbyChannel.untrack()
  nameInput.disabled = true
  lobby.hidden = true
  play.hidden = false
  showBoard(roomGame)
  if (roomGame === 'ttt') {
    match = createTtt(players)
    showTtt(match)
    broadcast()
    return
  }
  match = createMatch(players)
  showMatch(match)
  broadcast()
  if (hosting) timer = window.setInterval(tick, 180)
}

function openRoom(code, asHost, isPublic, game) {
  const realtime = gameClient()
  if (!realtime) {
    showError('The game server did not load.')
    return
  }
  if (channel) channel.unsubscribe()
  hosting = asHost
  publicGame = Boolean(isPublic)
  roomCode = code
  roomGame = gameOf(game)
  joinedAt = Date.now()
  channel = realtime.channel((roomGame === 'ttt' ? 'ttt-' : 'snake-') + code, {
    config: { broadcast: { self: false }, presence: { key: myId } },
  })
  channel.on('presence', { event: 'sync' }, () => {
    const host = roster().find((person) => person.host)
    if (host) hostId = host.id
    if (!match) refreshLobby()
  })
  channel.on('presence', { event: 'leave' }, ({ key }) => {
    if (!hosting && key === hostId) tag.textContent = 'The host left.'
    if (hosting && match && !match.over && roomGame === 'snake') {
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
    if (hosting && match && !match.over && roomGame === 'ttt') {
      const other = match.x.id === key ? match.o : match.o.id === key ? match.x : null
      if (other && other.id !== key) {
        match = { ...match, over: true, winner: other === match.x ? 'x' : 'o', line: match.line }
        showTtt(match)
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
    if (hosting || !payload) return
    if (roomGame === 'ttt') {
      if (!payload.cells) return
      if (lobby.hidden === false) {
        lobby.hidden = true
        play.hidden = false
        showBoard('ttt')
      }
      showTtt(payload)
      return
    }
    if (!payload.snakes) return
    if (lobby.hidden === false) {
      lobby.hidden = true
      play.hidden = false
      showBoard('snake')
    }
    showMatch(payload)
  })
  channel.on('broadcast', { event: 'dir' }, ({ payload }) => {
    if (!hosting || roomGame !== 'snake' || !payload || !payload.id || !DIRS[payload.dir]) return
    desired[payload.id] = payload.dir
  })
  channel.on('broadcast', { event: 'move' }, ({ payload }) => {
    if (!hosting || !payload) return
    applyMove(payload.id, payload.index)
  })
  channel.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return
    await channel.track({ name: myName(), host: hosting, at: joinedAt })
    document.getElementById('setup').hidden = true
    waiting.hidden = false
    codeEl.hidden = false
    codeEl.textContent = code
    mark.textContent = GAME_LABEL[roomGame]
    tag.textContent = hosting ? 'You are the host. Leave this tab open.' : 'In room ' + code
    refreshLobby()
    if (publicGame) advertise()
  })
}

function renderGames() {
  if (!lobbyChannel || !gamesEl) return
  const games = []
  for (const [id, metas] of Object.entries(lobbyChannel.presenceState())) {
    const meta = metas[0] || {}
    if (!meta.open || !meta.code || id === myId) continue
    const game = gameOf(meta.game)
    const max = game === 'ttt' ? 2 : 4
    games.push({
      game,
      code: meta.code,
      name: meta.name || 'Player',
      count: Math.max(1, Math.min(max, Number(meta.count) || 1)),
      max,
    })
  }
  games.sort((a, b) => a.game.localeCompare(b.game) || a.code.localeCompare(b.code))
  gamesEl.replaceChildren()
  gamesEmpty.hidden = games.length > 0
  games.forEach((game) => {
    const item = document.createElement('li')
    const label = document.createElement('span')
    label.textContent = game.name + ' · ' + GAME_LABEL[game.game] + ' · ' + game.code + ' · ' + game.count + '/' + game.max
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = game.count >= game.max ? 'Full' : 'Join'
    button.disabled = game.count >= game.max
    button.addEventListener('click', () => {
      saveName()
      showError('')
      selectGame(game.game)
      openRoom(game.code, false, false, game.game)
    })
    item.append(label, button)
    gamesEl.appendChild(item)
  })
}

function advertise() {
  if (!publicGame || match || !roomCode) return
  const count = Math.max(1, Math.min(maxPlayers(), roster().length || 1))
  const payload = { open: true, code: roomCode, name: myName(), count, game: roomGame }
  const next = JSON.stringify(payload)
  if (!lobbyChannel || lobbyChannel.state === 'closed' || lobbyChannel.state === 'errored') {
    advertised = ''
    connectLobby()
    return
  }
  if (lobbyChannel.state !== 'joined') return
  if (next === advertised) return
  advertised = next
  lobbyChannel.track(payload)
}

function connectLobby() {
  const realtime = lobbyRealtime()
  if (!realtime) return
  if (lobbyChannel && (lobbyChannel.state === 'joined' || lobbyChannel.state === 'joining')) return
  if (lobbyChannel) realtime.removeChannel(lobbyChannel)
  lobbyChannel = realtime.channel('snake-lobby', {
    config: { presence: { key: myId } },
  })
  lobbyChannel.on('presence', { event: 'sync' }, renderGames)
  lobbyChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED' && publicGame) advertise()
  })
}

function saveName() {
  localStorage.setItem('snake-name', myName())
}

function steer(dir) {
  if (roomGame !== 'snake' || !match || match.over) return
  const mine = match.snakes.find((snake) => snake.id === myId)
  if (!mine || !mine.alive || !DIRS[dir]) return
  if (hosting) desired[myId] = dir
  else if (channel) channel.send({ type: 'broadcast', event: 'dir', payload: { id: myId, dir } })
}

document.getElementById('pick').addEventListener('click', (event) => {
  const card = event.target.closest('button')
  if (!card || !card.dataset.game) return
  selectGame(card.dataset.game)
})

document.getElementById('host').addEventListener('click', () => {
  saveName()
  showError('')
  if (picked === 'stealth') {
    startStealth()
    return
  }
  openRoom(alphabetCode(), true, true, picked)
})

document.getElementById('join').addEventListener('click', () => {
  const code = roomInput.value.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    showError('Enter the 4 letter code.')
    return
  }
  saveName()
  showError('')
  openRoom(code, false, false, picked)
})

startButton.addEventListener('click', () => {
  if (!hosting || match) return
  const people = roster().slice(0, maxPlayers())
  if (!people.length) return
  channel.send({ type: 'broadcast', event: 'start', payload: { players: people } })
  begin(people)
})

againButton.addEventListener('click', () => {
  if (roomGame === 'stealth') {
    againButton.hidden = true
    banner.hidden = true
    ensureStealth().start()
    return
  }
  if (!hosting || !match) return
  let people = []
  if (roomGame === 'ttt') {
    const sides = match.x.id === match.o.id ? [match.x] : [match.x, match.o]
    people = sides.filter((person) => roster().some((item) => item.id === person.id))
  } else {
    people = match.snakes
      .map((snake) => ({ id: snake.id, name: snake.name }))
      .filter((person) => roster().some((item) => item.id === person.id))
  }
  if (!people.length) {
    tag.textContent = 'Stay in the room to play again.'
    return
  }
  channel.send({ type: 'broadcast', event: 'start', payload: { players: people } })
  begin(people)
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

const STEALTH_KEYS = {
  arrowup: 'forward',
  w: 'forward',
  arrowdown: 'back',
  s: 'back',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
  ' ': 'shoot',
}

let stealthGame = null
let stealthReport = ''

function reportStealth(info) {
  const key = (info.over || 'play') + ':' + info.left
  if (key === stealthReport) return
  stealthReport = key
  scoreEl.replaceChildren()
  const item = document.createElement('li')
  const label = document.createElement('span')
  label.textContent = info.over === 'win' ? 'Floor clear' : info.over === 'lose' ? 'Caught' : 'Guards left · ' + info.left
  item.append(label)
  scoreEl.appendChild(item)
  tag.textContent = info.over === 'win'
    ? 'You cleared the floor.'
    : info.over === 'lose'
      ? 'They saw you.'
      : 'Look ahead. Walls block your view and your shots.'
  banner.hidden = !info.over
  banner.textContent = tag.textContent
  againButton.hidden = !info.over
}

function ensureStealth() {
  if (!stealthGame) stealthGame = createStealth(document.getElementById('stealth'), reportStealth)
  return stealthGame
}

function startStealth() {
  roomGame = 'stealth'
  nameInput.disabled = true
  lobby.hidden = true
  play.hidden = false
  showBoard('stealth')
  stealthReport = ''
  banner.hidden = true
  againButton.hidden = true
  ensureStealth().start()
}

window.addEventListener('keydown', (event) => {
  if (roomGame === 'stealth') {
    const act = STEALTH_KEYS[event.key.toLowerCase()]
    if (!act) return
    event.preventDefault()
    if (act === 'shoot') {
      if (!event.repeat) ensureStealth().shoot()
      return
    }
    ensureStealth().hold(act, true)
    return
  }
  const dir = KEYS[event.key.toLowerCase()]
  if (!dir || roomGame !== 'snake' || !match) return
  event.preventDefault()
  steer(dir)
})

window.addEventListener('keyup', (event) => {
  if (roomGame !== 'stealth') return
  const act = STEALTH_KEYS[event.key.toLowerCase()]
  if (!act || act === 'shoot') return
  ensureStealth().hold(act, false)
})

const stealthPad = document.getElementById('stealth-pad')
stealthPad.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('button')
  if (!button || !button.dataset.act) return
  event.preventDefault()
  button.setPointerCapture(event.pointerId)
  if (button.dataset.act === 'shoot') ensureStealth().shoot()
  else ensureStealth().hold(button.dataset.act, true)
})
stealthPad.addEventListener('pointerup', releaseStealth)
stealthPad.addEventListener('pointercancel', releaseStealth)

function releaseStealth(event) {
  const button = event.target.closest('button')
  if (!button || !button.dataset.act || button.dataset.act === 'shoot') return
  ensureStealth().hold(button.dataset.act, false)
}

pad.addEventListener('click', (event) => {
  const dir = event.target.dataset && event.target.dataset.dir
  if (dir) steer(dir)
})

grid.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button || button.disabled) return
  const index = Number(button.dataset.i)
  if (hosting) applyMove(myId, index)
  else if (channel) channel.send({ type: 'broadcast', event: 'move', payload: { id: myId, index } })
})

nameInput.addEventListener('input', () => {
  if (nameInput.value.length > 16) nameInput.value = nameInput.value.slice(0, 16)
  saveName()
  if (channel && !match) channel.track({ name: myName(), host: hosting, at: joinedAt })
  if (publicGame) advertise()
})

selectGame(localStorage.getItem('game-pick') || 'snake')
connectLobby()
