export const WIDTH = 640
export const HEIGHT = 720
export const BOT_ID = 'chain-bot'
export const CHAIN_LEN = 100
export const SIZE = 28
export const WORLD_MIN_X = -2200
export const WORLD_MAX_X = 720
export const FLOOR_Y = 680

const GRAVITY = 2300
const JUMP = -480
const MOVE = 250
const MAX_FALL = 980
const CHAIN_PULL = 0.55

const SPRITES = {}

/** Walkable hitbox is a thin top slab; sprite hangs below it. */
export const PLATFORMS = [
  // starting ground (right side) — progress goes left / up in short hops
  { x: 120, y: FLOOR_Y, w: 520, h: 22, kind: 'ground', imgH: 110, floor: true },
  { x: -40, y: FLOOR_Y, w: 200, h: 22, kind: 'ground', imgH: 110, floor: true },
  { x: -260, y: 630, w: 200, h: 18, kind: 'stone', imgH: 72 },
  { x: -480, y: 580, w: 180, h: 18, kind: 'wood', imgH: 58 },
  { x: -700, y: 530, w: 190, h: 18, kind: 'rock', imgH: 68 },
  { x: -920, y: 480, w: 170, h: 18, kind: 'stone', imgH: 72 },
  { x: -1140, y: 430, w: 200, h: 18, kind: 'wood', imgH: 58 },
  { x: -1360, y: 380, w: 180, h: 18, kind: 'rock', imgH: 68 },
  { x: -1580, y: 330, w: 200, h: 18, kind: 'stone', imgH: 72 },
  { x: -1800, y: 280, w: 220, h: 18, kind: 'wood', imgH: 58 },
  { x: -2020, y: 230, w: 200, h: 18, kind: 'rock', imgH: 68 },
  { x: WORLD_MIN_X, y: FLOOR_Y + 80, w: WORLD_MAX_X - WORLD_MIN_X, h: 40, kind: 'ground', imgH: 80, floor: true, hidden: true },
]

const STARTS = [
  { x: 420, y: FLOOR_Y - SIZE },
  { x: 480, y: FLOOR_Y - SIZE },
]

const COLORS = ['#3b82f6', '#e23d3d']

export function loadChainAssets() {
  const files = {
    ground: 'assets/chain/ground.png',
    stone: 'assets/chain/ledge-stone.png',
    rock: 'assets/chain/ledge-rock.png',
    wood: 'assets/chain/ledge-wood.png',
  }
  return Promise.all(
    Object.entries(files).map(
      ([key, src]) =>
        new Promise((resolve) => {
          if (typeof Image === 'undefined') {
            resolve()
            return
          }
          const img = new Image()
          img.onload = () => {
            SPRITES[key] = img
            resolve()
          }
          img.onerror = () => resolve()
          img.src = src
        }),
    ),
  )
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function overX(a, plat) {
  return a.x < plat.x + plat.w && a.x + a.w > plat.x
}

function clampWorldX(body) {
  if (body.x < WORLD_MIN_X) body.x = WORLD_MIN_X
  if (body.x + body.w > WORLD_MAX_X) body.x = WORLD_MAX_X - body.w
}

function collideX(body) {
  clampWorldX(body)
  for (const plat of PLATFORMS) {
    if (plat.hidden) continue
    if (!overlaps(body, plat)) continue
    const overlapL = body.x + body.w - plat.x
    const overlapR = plat.x + plat.w - body.x
    if (overlapL < overlapR) body.x = plat.x - body.w
    else body.x = plat.x + plat.w
    body.vx = 0
  }
  clampWorldX(body)
}

function collideY(body, prevY) {
  body.grounded = false
  for (const plat of PLATFORMS) {
    if (!overX(body, plat)) continue
    const feet = body.y + body.h
    const prevFeet = prevY + body.h
    if (body.vy >= 0 && prevFeet <= plat.y + 1 && feet >= plat.y) {
      body.y = plat.y - body.h
      body.vy = 0
      body.grounded = true
      continue
    }
    if (body.vy < 0 && prevY >= plat.y + plat.h - 1 && body.y <= plat.y + plat.h) {
      body.y = plat.y + plat.h
      body.vy = 0
      continue
    }
  }
  ejectSolids(body)
}

function ejectSolids(body) {
  for (let pass = 0; pass < 3; pass += 1) {
    let hit = false
    for (const plat of PLATFORMS) {
      if (!overlaps(body, plat)) continue
      hit = true
      const penUp = body.y + body.h - plat.y
      const penDown = plat.y + plat.h - body.y
      const penLeft = body.x + body.w - plat.x
      const penRight = plat.x + plat.w - body.x
      const bodyMid = body.y + body.h * 0.5
      const platMid = plat.y + plat.h * 0.5
      const preferUp = plat.floor || body.vy >= 0 || bodyMid <= platMid || penUp <= penDown
      const minHoriz = Math.min(penLeft, penRight)
      if (preferUp && penUp <= minHoriz + 0.5) {
        body.y = plat.y - body.h
        if (body.vy > 0) body.vy = 0
        body.grounded = true
      } else if (!preferUp && !plat.floor && penDown <= minHoriz + 0.5) {
        body.y = plat.y + plat.h
        if (body.vy < 0) body.vy = 0
      } else if (penLeft < penRight) {
        body.x = plat.x - body.w
        body.vx = 0
      } else {
        body.x = plat.x + plat.w
        body.vx = 0
      }
    }
    if (!hit) break
  }
  clampWorldX(body)
  if (body.y + body.h > FLOOR_Y + 90) {
    body.y = FLOOR_Y + 90 - body.h
    if (body.vy > 0) body.vy = 0
    body.grounded = true
  }
}

function horizOverlap(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
}

function landOnHead(rider, base, dt) {
  rider.y = base.y - rider.h
  if (rider.vy > 0) rider.vy = 0
  rider.grounded = true
  rider.x += base.vx * dt
}

function tryStandOnHead(rider, base, dt) {
  // Still rising from a jump — don't glue back onto the head
  if (rider.vy < -40) return false
  const overlap = horizOverlap(rider, base)
  if (overlap < rider.w * 0.2) return false
  const feet = rider.y + rider.h
  if (feet < base.y - 3 || feet > base.y + 18) return false
  if (rider.y + rider.h * 0.5 > base.y + base.h * 0.55) return false
  landOnHead(rider, base, dt)
  return true
}

function separatePlayers(a, b, dt) {
  if (tryStandOnHead(a, b, dt) || tryStandOnHead(b, a, dt)) {
    ejectSolids(a)
    ejectSolids(b)
    return
  }
  if (!overlaps(a, b)) return
  const overlapX = Math.min(a.x + a.w - b.x, b.x + b.w - a.x)
  const overlapY = Math.min(a.y + a.h - b.y, b.y + b.h - a.y)
  if (overlapX < overlapY) {
    const push = overlapX / 2 + 0.01
    if (a.x < b.x) {
      a.x -= push
      b.x += push
    } else {
      a.x += push
      b.x -= push
    }
    a.vx *= 0.5
    b.vx *= 0.5
  } else if (a.y < b.y) {
    landOnHead(a, b, dt)
  } else {
    landOnHead(b, a, dt)
  }
  ejectSolids(a)
  ejectSolids(b)
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
  const excess = Math.min(dist - CHAIN_LEN, 18)
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
    a.vx -= nx * alongA * 0.45
    a.vy -= ny * alongA * 0.45
  }
  if (alongB < 0) {
    b.vx -= nx * alongB * 0.45
    b.vy -= ny * alongB * 0.45
  }
  ejectSolids(a)
  ejectSolids(b)
}

export function createChainMatch(players) {
  const seats = players.slice(0, 2)
  return {
    kind: 'chain',
    over: false,
    camX: 200,
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
        facing: -1,
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
  const gap = pal.x + pal.w / 2 - (bot.x + bot.w / 2)
  const dist = Math.hypot(gap, pal.y - bot.y)
  let left = false
  let right = false
  let jump = false
  if (dist > CHAIN_LEN * 0.72) {
    if (gap > 8) right = true
    else if (gap < -8) left = true
  } else {
    // Prefer climbing left with the route
    left = true
    if (bot.y > pal.y + 24) jump = bot.grounded
    else if (bot.grounded && Math.random() < 0.03) jump = true
  }
  if (bot.grounded && bot.x + bot.w > WORLD_MAX_X - 40) left = true
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
    player.x += player.vx * dt
    collideX(player)
    const prevY = player.y
    player.y += player.vy * dt
    collideY(player, prevY)
  })
  if (next.players.length >= 2) {
    separatePlayers(next.players[0], next.players[1], dt)
    enforceChain(next.players[0], next.players[1])
    separatePlayers(next.players[0], next.players[1], dt)
    enforceChain(next.players[0], next.players[1])
    next.players.forEach((player) => ejectSolids(player))
  }
  const midX =
    next.players.reduce((sum, player) => sum + player.x + player.w / 2, 0) /
    Math.max(1, next.players.length)
  const midY =
    next.players.reduce((sum, player) => sum + player.y + player.h / 2, 0) /
    Math.max(1, next.players.length)
  // Bias camera so the path ahead (left) stays on screen
  const targetX = midX - WIDTH * 0.62
  const targetY = midY - HEIGHT * 0.55
  next.camX = typeof next.camX === 'number' ? next.camX : targetX
  next.camY = typeof next.camY === 'number' ? next.camY : targetY
  next.camX += (targetX - next.camX) * Math.min(1, dt * 5)
  next.camY += (targetY - next.camY) * Math.min(1, dt * 5)
  return next
}

function drawCube(ctx, player) {
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
  const bob = grounded && Math.abs(vx) > 20 ? Math.sin(walk * 2.2) * 2 : 0
  const legH = 6
  const legY = y + h - legH
  ctx.fillStyle = color
  ctx.fillRect(x + 5, legY + Math.max(0, bob) * 0.3, 6, legH)
  ctx.fillRect(x + w - 11, legY + Math.max(0, -bob) * 0.3, 6, legH)
  ctx.fillStyle = 'rgba(15,23,42,0.35)'
  ctx.fillRect(x + 5, legY + legH - 2, 6, 2)
  ctx.fillRect(x + w - 11, legY + legH - 2, 6, 2)
}

function drawChainLinks(ctx, a, b) {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  ctx.strokeStyle = '#c4b59a'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  for (let i = 1; i < 10; i += 1) {
    const t = i / 10
    ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(t * Math.PI) * 4)
  }
  ctx.lineTo(bx, by)
  ctx.stroke()
}

function drawPlatform(ctx, plat) {
  if (plat.hidden) return
  const img = SPRITES[plat.kind]
  const drawH = plat.imgH || 64
  if (img) {
    ctx.drawImage(img, plat.x, plat.y, plat.w, drawH)
  } else {
    ctx.fillStyle = plat.kind === 'wood' ? '#8b5a2b' : plat.kind === 'stone' ? '#6b7280' : '#57534e'
    ctx.fillRect(plat.x, plat.y, plat.w, drawH)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(plat.x, plat.y, plat.w, 6)
  }
}

export function drawChain(ctx, state) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const camX = state.camX || 0
  const camY = state.camY || 0
  ctx.save()
  ctx.translate(-camX, -camY)
  const left = camX - 40
  const top = camY - 40
  const sky = ctx.createLinearGradient(0, top, 0, top + HEIGHT + 80)
  sky.addColorStop(0, '#7eb6e8')
  sky.addColorStop(1, '#d9ebf7')
  ctx.fillStyle = sky
  ctx.fillRect(left, top, WIDTH + 80, HEIGHT + 80)
  PLATFORMS.forEach((plat) => drawPlatform(ctx, plat))
  if (state.players.length >= 2) drawChainLinks(ctx, state.players[0], state.players[1])
  state.players.forEach((player) => drawCube(ctx, player))
  ctx.restore()
}
