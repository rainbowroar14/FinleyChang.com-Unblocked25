export const FOV = Math.PI / 4
export const WIDTH = 480
export const HEIGHT = 480

const SPEED = 128
const BULLET_SPEED = 360

export const WALLS = [
  { x: 0, y: 0, w: 480, h: 18 },
  { x: 0, y: 462, w: 480, h: 18 },
  { x: 0, y: 0, w: 18, h: 480 },
  { x: 462, y: 0, w: 18, h: 480 },
  { x: 150, y: 18, w: 22, h: 120 },
  { x: 150, y: 190, w: 160, h: 22 },
  { x: 290, y: 18, w: 22, h: 80 },
  { x: 290, y: 250, w: 22, h: 212 },
  { x: 70, y: 330, w: 180, h: 22 },
  { x: 330, y: 150, w: 80, h: 22 },
  { x: 330, y: 150, w: 22, h: 170 },
]

const STARTS = [
  { x: 48, y: 420, a: -Math.PI / 2 },
  { x: 430, y: 60, a: Math.PI / 2 },
]

const COLORS = ['#f4efe4', '#e23d3d']

function wrap(angle) {
  const turn = Math.PI * 2
  let next = (angle + Math.PI) % turn
  if (next < 0) next += turn
  return next - Math.PI
}

function segmentsOf(rects) {
  const segments = []
  rects.forEach((rect) => {
    const x2 = rect.x + rect.w
    const y2 = rect.y + rect.h
    segments.push([rect.x, rect.y, x2, rect.y])
    segments.push([x2, rect.y, x2, y2])
    segments.push([x2, y2, rect.x, y2])
    segments.push([rect.x, y2, rect.x, rect.y])
  })
  return segments
}

const SEGMENTS = segmentsOf(WALLS)

function raySegment(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1
  const sy = y2 - y1
  const den = dx * sy - dy * sx
  if (Math.abs(den) < 1e-8) return null
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / den
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den
  if (t > 0 && u >= 0 && u <= 1) return t
  return null
}

export function rayDistance(x, y, angle, max) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let best = max
  SEGMENTS.forEach((segment) => {
    const hit = raySegment(x, y, dx, dy, segment[0], segment[1], segment[2], segment[3])
    if (hit !== null && hit < best) best = hit
  })
  return best
}

export function canSee(x, y, angle, tx, ty) {
  const aim = Math.atan2(ty - y, tx - x)
  if (Math.abs(wrap(aim - angle)) > FOV / 2) return false
  const dist = Math.hypot(tx - x, ty - y)
  return rayDistance(x, y, aim, dist) >= dist - 0.5
}

function hitsRect(x, y, radius, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w))
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy < radius * radius
}

function slide(body, dx, dy) {
  body.x += dx
  if (WALLS.some((rect) => hitsRect(body.x, body.y, body.r, rect))) body.x -= dx
  body.y += dy
  if (WALLS.some((rect) => hitsRect(body.x, body.y, body.r, rect))) body.y -= dy
}

function vision(x, y, angle) {
  const half = FOV / 2
  const angles = [angle - half, angle + half]
  SEGMENTS.forEach((segment) => {
    for (let end = 0; end < 2; end += 1) {
      const aim = Math.atan2(segment[end * 2 + 1] - y, segment[end * 2] - x)
      if (Math.abs(wrap(aim - angle)) > half) continue
      angles.push(aim - 0.0008, aim, aim + 0.0008)
    }
  })
  angles.sort((a, b) => wrap(a - angle) - wrap(b - angle))
  const points = []
  let previous = null
  angles.forEach((aim) => {
    if (Math.abs(wrap(aim - angle)) > half + 0.001) return
    if (previous !== null && Math.abs(wrap(aim - previous)) < 0.00001) return
    previous = aim
    const dist = rayDistance(x, y, aim, 900)
    points.push({ x: x + Math.cos(aim) * dist, y: y + Math.sin(aim) * dist })
  })
  return points
}

function nearSegment(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy || 1
  let t = ((px - x1) * dx + (py - y1) * dy) / len
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t))
}

export const BOT_ID = 'stealth-bot'

export function createStealthMatch(players) {
  const seats = players.slice(0, 2)
  return {
    kind: 'stealth',
    over: false,
    winner: null,
    players: seats.map((person, index) => {
      const spawn = STARTS[index]
      return {
        id: person.id,
        name: person.name || 'Player',
        color: COLORS[index],
        x: spawn.x,
        y: spawn.y,
        r: 9,
        a: spawn.a,
        cool: 0,
        alive: true,
      }
    }),
    bullets: [],
  }
}

export function botInput(state, botId) {
  const empty = { w: false, a: false, s: false, d: false, aim: 0, fire: false }
  const bot = state.players.find((player) => player.id === botId)
  const foe = state.players.find((player) => player.id !== botId && player.alive)
  if (!bot || !bot.alive || !foe) return empty
  const aim = Math.atan2(foe.y - bot.y, foe.x - bot.x)
  const see = canSee(bot.x, bot.y, aim, foe.x, foe.y)
  const dx = foe.x - bot.x
  const dy = foe.y - bot.y
  let mx = 0
  let my = 0
  if (see) {
    if (Math.hypot(dx, dy) < 90) {
      mx = dx > 0 ? -1 : 1
      my = dy > 0 ? -1 : 1
    } else {
      mx = dx > 12 ? 1 : dx < -12 ? -1 : 0
      my = dy > 12 ? 1 : dy < -12 ? -1 : 0
    }
  } else {
    mx = dx > 10 ? 1 : dx < -10 ? -1 : 0
    my = dy > 10 ? 1 : dy < -10 ? -1 : 0
    if (Math.abs(dx) > Math.abs(dy) * 1.4) my = 0
    else if (Math.abs(dy) > Math.abs(dx) * 1.4) mx = 0
  }
  return {
    w: my < 0,
    a: mx < 0,
    s: my > 0,
    d: mx > 0,
    aim,
    fire: see,
  }
}

export function stepStealth(state, inputs, dt) {
  if (!state || state.over) return state
  const next = {
    kind: 'stealth',
    over: false,
    winner: null,
    players: state.players.map((player) => ({ ...player })),
    bullets: state.bullets.map((bullet) => ({ ...bullet })),
  }

  next.players.forEach((player) => {
    if (!player.alive) return
    const input = inputs[player.id] || {}
    player.a = typeof input.aim === 'number' ? input.aim : player.a
    let mx = 0
    let my = 0
    if (input.a) mx -= 1
    if (input.d) mx += 1
    if (input.w) my -= 1
    if (input.s) my += 1
    if (mx || my) {
      const len = Math.hypot(mx, my) || 1
      slide(player, (mx / len) * SPEED * dt, (my / len) * SPEED * dt)
    }
    player.cool = Math.max(0, player.cool - dt)
    if (input.fire && player.cool <= 0) {
      player.cool = 0.28
      next.bullets.push({
        x: player.x + Math.cos(player.a) * 14,
        y: player.y + Math.sin(player.a) * 14,
        a: player.a,
        owner: player.id,
      })
    }
  })

  next.bullets = next.bullets.filter((bullet) => {
    const dist = BULLET_SPEED * dt
    const travel = rayDistance(bullet.x, bullet.y, bullet.a, dist)
    const used = Math.min(dist, travel)
    const nx = bullet.x + Math.cos(bullet.a) * used
    const ny = bullet.y + Math.sin(bullet.a) * used
    const hit = next.players.find(
      (player) =>
        player.alive &&
        player.id !== bullet.owner &&
        nearSegment(bullet.x, bullet.y, nx, ny, player.x, player.y) < player.r + 3,
    )
    if (hit) {
      hit.alive = false
      next.over = true
      next.winner = bullet.owner
      return false
    }
    if (travel < dist - 0.1) return false
    bullet.x = nx
    bullet.y = ny
    return true
  })

  return next
}

export function drawStealth(ctx, state, viewerId) {
  const me = state.players.find((player) => player.id === viewerId) || state.players[0]
  if (!me) return
  const points = vision(me.x, me.y, me.a)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#070907'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(me.x, me.y)
  points.forEach((point) => ctx.lineTo(point.x, point.y))
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = '#121a12'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.strokeStyle = '#1c281c'
  ctx.lineWidth = 1
  for (let line = 24; line < WIDTH; line += 24) {
    ctx.beginPath()
    ctx.moveTo(line + 0.5, 0)
    ctx.lineTo(line + 0.5, HEIGHT)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, line + 0.5)
    ctx.lineTo(WIDTH, line + 0.5)
    ctx.stroke()
  }
  WALLS.forEach((wall) => {
    ctx.fillStyle = '#2a3326'
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h)
  })
  state.players.forEach((player) => {
    if (player.id !== me.id && (!player.alive || !canSee(me.x, me.y, me.a, player.x, player.y))) return
    ctx.fillStyle = player.alive ? player.color : '#3c4038'
    ctx.beginPath()
    ctx.arc(player.x, player.y, 8, 0, Math.PI * 2)
    ctx.fill()
    if (!player.alive) return
    ctx.fillStyle = '#1a100e'
    ctx.fillRect(player.x + Math.cos(player.a) * 6 - 2, player.y + Math.sin(player.a) * 6 - 2, 4, 4)
  })
  state.bullets.forEach((bullet) => {
    if (!canSee(me.x, me.y, me.a, bullet.x, bullet.y)) return
    ctx.fillStyle = bullet.owner === me.id ? '#f4efe4' : '#e7c56a'
    ctx.fillRect(bullet.x - 2, bullet.y - 2, 4, 4)
  })
  ctx.restore()
  ctx.save()
  ctx.translate(me.x, me.y)
  ctx.rotate(me.a)
  ctx.fillStyle = me.color
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(-8, 7)
  ctx.lineTo(-5, 0)
  ctx.lineTo(-8, -7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
