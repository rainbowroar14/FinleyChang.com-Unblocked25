export const WIDTH = 640
export const HEIGHT = 720
export const BOT_ID = 'chain-bot'
export const CHAIN_LEN = 100
export const SIZE = 28

const GRAVITY = 2100
const JUMP = -640
const MOVE = 250
const MAX_FALL = 980
const CHAIN_PULL = 0.55

export const PLATFORMS = [
  { x: 0, y: 680, w: 640, h: 40 },
  { x: 40, y: 580, w: 160, h: 16 },
  { x: 280, y: 520, w: 140, h: 16 },
  { x: 460, y: 450, w: 150, h: 16 },
  { x: 120, y: 390, w: 150, h: 16 },
  { x: 340, y: 320, w: 160, h: 16 },
  { x: 40, y: 250, w: 150, h: 16 },
  { x: 260, y: 180, w: 160, h: 16 },
  { x: 450, y: 110, w: 150, h: 16 },
  { x: 180, y: 50, w: 180, h: 16 },
]

const STARTS = [
  { x: 200, y: 680 - SIZE },
  { x: 280, y: 680 - SIZE },
]

const COLORS = ['#3b82f6', '#e23d3d']

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function resolvePlatforms(body, prevY) {
  body.grounded = false
  for (const plat of PLATFORMS) {
    const overX = body.x < plat.x + plat.w && body.x + body.w > plat.x
    if (!overX) continue
    const feet = body.y + body.h
    const wasAbove = prevY + body.h <= plat.y + 2
    if (body.vy >= 0 && wasAbove && feet >= plat.y - 1 && feet <= plat.y + 12) {
      body.y = plat.y - body.h
      body.vy = 0
      body.grounded = true
      continue
    }
    if (!overlaps(body, plat)) continue
    if (body.vy < 0 && prevY >= plat.y + plat.h - 2) {
      body.y = plat.y + plat.h
      body.vy = 0
      continue
    }
    const overlapL = body.x + body.w - plat.x
    const overlapR = plat.x + plat.w - body.x
    if (overlapL < overlapR) body.x = plat.x - body.w
    else body.x = plat.x + plat.w
  }
  if (body.x < 0) body.x = 0
  if (body.x + body.w > WIDTH) body.x = WIDTH - body.w
}

function separatePlayers(a, b) {
  if (!overlaps(a, b)) return
  const overlapX = Math.min(a.x + a.w - b.x, b.x + b.w - a.x)
  const overlapY = Math.min(a.y + a.h - b.y, b.y + b.h - a.y)
  if (overlapX < overlapY) {
    const push = overlapX / 2
    if (a.x < b.x) {
      a.x -= push
      b.x += push
    } else {
      a.x += push
      b.x -= push
    }
  } else {
    const push = overlapY / 2
    if (a.y < b.y) {
      a.y -= push
      b.y += push
      if (b.vy > 0) {
        b.vy = 0
        b.grounded = true
      }
    } else {
      a.y += push
      b.y -= push
      if (a.vy > 0) {
        a.vy = 0
        a.grounded = true
      }
    }
  }
}

function enforceChain(a, b) {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  const dx = bx - ax
  const dy = by - ay
  const dist = Math.hypot(dx, dy) || 0.0001
  if (dist <= CHAIN_LEN) return
  const excess = dist - CHAIN_LEN
  const nx = dx / dist
  const ny = dy / dist
  const pull = excess * CHAIN_PULL * 0.5
  a.x += nx * pull
  a.y += ny * pull
  b.x -= nx * pull
  b.y -= ny * pull
  const alongA = a.vx * nx + a.vy * ny
  const alongB = b.vx * nx + b.vy * ny
  if (alongA > 0) {
    a.vx -= nx * alongA * 0.35
    a.vy -= ny * alongA * 0.35
  }
  if (alongB < 0) {
    b.vx -= nx * alongB * 0.35
    b.vy -= ny * alongB * 0.35
  }
}

export function createChainMatch(players) {
  const seats = players.slice(0, 2)
  return {
    kind: 'chain',
    over: false,
    camY: 200,
    time: 0,
    players: seats.map((person, index) => {
      const spawn = STARTS[index]
      return {
        id: person.id,
        name: person.name || 'Player',
        color: COLORS[index],
        x: spawn.x,
        y: spawn.y,
        w: SIZE,
        h: SIZE,
        vx: 0,
        vy: 0,
        facing: index === 0 ? 1 : -1,
        grounded: true,
        walk: 0,
      }
    }),
  }
}

export function botInput(state, botId) {
  const empty = { left: false, right: false, jump: false }
  const bot = state.players.find((player) => player.id === botId)
  const pal = state.players.find((player) => player.id !== botId)
  if (!bot || !pal) return empty
  const mid = (bot.x + bot.w / 2 + pal.x + pal.w / 2) / 2
  const gap = pal.x + pal.w / 2 - (bot.x + bot.w / 2)
  const dist = Math.hypot(gap, pal.y - bot.y)
  let left = false
  let right = false
  let jump = false
  if (dist > CHAIN_LEN * 0.72) {
    if (gap > 8) right = true
    else if (gap < -8) left = true
  } else if (bot.y > pal.y + 20) {
    if (bot.x + bot.w / 2 < mid - 10) right = true
    else if (bot.x + bot.w / 2 > mid + 10) left = true
    else right = Math.sin(state.time * 2) > 0
    jump = bot.grounded
  } else {
    if (Math.abs(gap) > 40) {
      if (gap > 0) right = true
      else left = true
    } else if (bot.grounded && Math.random() < 0.02) jump = true
  }
  if (bot.grounded && bot.x < 30) right = true
  if (bot.grounded && bot.x + bot.w > WIDTH - 30) left = true
  return { left, right, jump }
}

export function stepChain(state, inputs, dt) {
  if (!state || state.over) return state
  const next = {
    ...state,
    time: (state.time || 0) + dt,
    players: state.players.map((player) => ({ ...player })),
  }
  next.players.forEach((player) => {
    const input = inputs[player.id] || {}
    let ax = 0
    if (input.left) ax -= 1
    if (input.right) ax += 1
    if (ax) {
      player.vx = ax * MOVE
      player.facing = ax
      player.walk += dt * 10
    } else {
      player.vx *= Math.pow(0.0008, dt)
      if (Math.abs(player.vx) < 8) player.vx = 0
    }
    if (input.jump && player.grounded) {
      player.vy = JUMP
      player.grounded = false
    }
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt)
    const prevY = player.y
    player.x += player.vx * dt
    player.y += player.vy * dt
    resolvePlatforms(player, prevY)
  })
  if (next.players.length >= 2) {
    separatePlayers(next.players[0], next.players[1])
    enforceChain(next.players[0], next.players[1])
    next.players.forEach((player) => {
      const prevY = player.y
      resolvePlatforms(player, prevY)
    })
    separatePlayers(next.players[0], next.players[1])
    enforceChain(next.players[0], next.players[1])
  }
  const midY =
    next.players.reduce((sum, player) => sum + player.y + player.h / 2, 0) /
    Math.max(1, next.players.length)
  const target = midY - HEIGHT * 0.55
  next.camY += (target - next.camY) * Math.min(1, dt * 6)
  return next
}

function drawCube(ctx, player, time) {
  const { x, y, w, h, color, facing, walk, grounded, vx } = player
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(x, y, w, 6)
  const eyeY = y + 9
  const leftEye = x + (facing >= 0 ? 6 : 8)
  const rightEye = x + (facing >= 0 ? 16 : 18)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(leftEye, eyeY, 6, 6)
  ctx.fillRect(rightEye, eyeY, 6, 6)
  const look = facing >= 0 ? 2 : 0
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(leftEye + look, eyeY + 2, 3, 3)
  ctx.fillRect(rightEye + look, eyeY + 2, 3, 3)
  const bob = grounded && Math.abs(vx) > 20 ? Math.sin(walk * 2.2) * 3 : 0
  const legY = y + h - 2
  ctx.fillStyle = color
  ctx.fillRect(x + 5, legY + Math.max(0, bob), 6, 8)
  ctx.fillRect(x + w - 11, legY + Math.max(0, -bob), 6, 8)
  ctx.fillStyle = 'rgba(15,23,42,0.35)'
  ctx.fillRect(x + 5, legY + 6 + Math.max(0, bob), 6, 3)
  ctx.fillRect(x + w - 11, legY + 6 + Math.max(0, -bob), 6, 3)
  void time
}

function drawChainLinks(ctx, a, b) {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  const links = 10
  ctx.strokeStyle = '#c4b59a'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  for (let i = 1; i < links; i += 1) {
    const t = i / links
    const sway = Math.sin(t * Math.PI) * 4
    const px = ax + (bx - ax) * t
    const py = ay + (by - ay) * t + sway
    ctx.lineTo(px, py)
  }
  ctx.lineTo(bx, by)
  ctx.stroke()
  ctx.strokeStyle = '#8a7a62'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

export function drawChain(ctx, state) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const cam = state.camY || 0
  ctx.save()
  ctx.translate(0, -cam)
  const top = cam - 40
  const bottom = cam + HEIGHT + 40
  const sky = ctx.createLinearGradient(0, top, 0, bottom)
  sky.addColorStop(0, '#87b7e8')
  sky.addColorStop(1, '#d7e8f6')
  ctx.fillStyle = sky
  ctx.fillRect(0, top, WIDTH, HEIGHT + 80)
  PLATFORMS.forEach((plat) => {
    ctx.fillStyle = '#3d4a3a'
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h)
    ctx.fillStyle = '#6f8a5c'
    ctx.fillRect(plat.x, plat.y, plat.w, 5)
  })
  if (state.players.length >= 2) drawChainLinks(ctx, state.players[0], state.players[1])
  state.players.forEach((player) => drawCube(ctx, player, state.time || 0))
  ctx.restore()
}
