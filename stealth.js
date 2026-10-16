export const FOV = Math.PI / 4

const WIDTH = 480
const HEIGHT = 480
const TURN = 2.4
const SPEED = 112
const BULLET_SPEED = 340

const WALLS = [
  { x: 0, y: 0, w: 480, h: 18 },
  { x: 0, y: 462, w: 480, h: 18 },
  { x: 0, y: 0, w: 18, h: 480 },
  { x: 462, y: 0, w: 18, h: 480 },
  { x: 150, y: 18, w: 22, h: 210 },
  { x: 150, y: 190, w: 160, h: 22 },
  { x: 290, y: 18, w: 22, h: 110 },
  { x: 290, y: 250, w: 22, h: 212 },
  { x: 70, y: 330, w: 180, h: 22 },
  { x: 330, y: 150, w: 132, h: 22 },
  { x: 330, y: 150, w: 22, h: 170 },
]

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

export function rayDistance(x, y, angle, rects, max) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let best = max
  const segments = rects === WALLS ? SEGMENTS : segmentsOf(rects)
  segments.forEach((segment) => {
    const hit = raySegment(x, y, dx, dy, segment[0], segment[1], segment[2], segment[3])
    if (hit !== null && hit < best) best = hit
  })
  return best
}

export function canSee(x, y, angle, tx, ty, rects) {
  const aim = Math.atan2(ty - y, tx - x)
  if (Math.abs(wrap(aim - angle)) > FOV / 2) return false
  const dist = Math.hypot(tx - x, ty - y)
  return rayDistance(x, y, aim, rects, dist) >= dist - 0.5
}

function hitsRect(x, y, radius, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w))
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy < radius * radius
}

function slide(body, dx, dy, rects) {
  body.x += dx
  if (rects.some((rect) => hitsRect(body.x, body.y, body.r, rect))) body.x -= dx
  body.y += dy
  if (rects.some((rect) => hitsRect(body.x, body.y, body.r, rect))) body.y -= dy
}

function vision(x, y, angle, segments) {
  const half = FOV / 2
  const angles = [angle - half, angle + half]
  segments.forEach((segment) => {
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
    const dist = rayDistance(x, y, aim, WALLS, 900)
    points.push({ x: x + Math.cos(aim) * dist, y: y + Math.sin(aim) * dist })
  })
  return points
}

const SEGMENTS = segmentsOf(WALLS)

function makeGuard(x, y, path) {
  return {
    x,
    y,
    r: 11,
    a: Math.atan2(path[1].y - y, path[1].x - x),
    path,
    to: 1,
    cool: 0.4,
    alive: true,
  }
}

function makeWorld() {
  return {
    over: '',
    cool: 0,
    player: { x: 48, y: 400, r: 9, a: -Math.PI / 2 },
    guards: [
      makeGuard(78, 90, [{ x: 78, y: 90 }, { x: 78, y: 250 }]),
      makeGuard(360, 78, [{ x: 360, y: 78 }, { x: 430, y: 78 }]),
      makeGuard(390, 400, [{ x: 390, y: 400 }, { x: 390, y: 280 }]),
    ],
    bullets: [],
  }
}

function nearSegment(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy || 1
  let t = ((px - x1) * dx + (py - y1) * dy) / len
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t))
}

function shoot(world, x, y, angle, fromGuard) {
  world.bullets.push({
    x: x + Math.cos(angle) * 16,
    y: y + Math.sin(angle) * 16,
    a: angle,
    fromGuard,
  })
}

function step(world, dt, held, fire) {
  if (world.over) return
  const player = world.player
  if (held.left) player.a -= TURN * dt
  if (held.right) player.a += TURN * dt
  const move = (held.forward ? 1 : 0) - (held.back ? 1 : 0)
  if (move) slide(player, Math.cos(player.a) * SPEED * move * dt, Math.sin(player.a) * SPEED * move * dt, WALLS)
  world.cool = Math.max(0, world.cool - dt)
  if (fire && world.cool <= 0) {
    world.cool = 0.28
    shoot(world, player.x, player.y, player.a, false)
  }

  world.guards.forEach((guard) => {
    if (!guard.alive) return
    const spot = canSee(guard.x, guard.y, guard.a, player.x, player.y, WALLS)
    guard.cool = Math.max(0, guard.cool - dt)
    if (Math.hypot(guard.x - player.x, guard.y - player.y) < guard.r + player.r) world.over = 'lose'
    if (spot) {
      guard.a = Math.atan2(player.y - guard.y, player.x - guard.x)
      if (guard.cool <= 0) {
        guard.cool = 0.85
        shoot(world, guard.x, guard.y, guard.a, true)
      }
      return
    }
    const point = guard.path[guard.to]
    const dx = point.x - guard.x
    const dy = point.y - guard.y
    const dist = Math.hypot(dx, dy) || 1
    guard.a = Math.atan2(dy, dx)
    const stepDist = Math.min(dist, 42 * dt)
    guard.x += (dx / dist) * stepDist
    guard.y += (dy / dist) * stepDist
    if (dist < 4) guard.to = (guard.to + 1) % guard.path.length
    if (Math.hypot(guard.x - player.x, guard.y - player.y) < guard.r + player.r) world.over = 'lose'
  })

  world.bullets = world.bullets.filter((bullet) => {
    const dist = BULLET_SPEED * dt
    const travel = rayDistance(bullet.x, bullet.y, bullet.a, WALLS, dist)
    const used = Math.min(dist, travel)
    const nx = bullet.x + Math.cos(bullet.a) * used
    const ny = bullet.y + Math.sin(bullet.a) * used
    if (!bullet.fromGuard) {
      const hit = world.guards.find((guard) => guard.alive && nearSegment(bullet.x, bullet.y, nx, ny, guard.x, guard.y) < guard.r + 3)
      if (hit) {
        hit.alive = false
        return false
      }
    } else if (nearSegment(bullet.x, bullet.y, nx, ny, player.x, player.y) < player.r + 3) {
      world.over = 'lose'
      return false
    }
    if (travel < dist - 0.1) return false
    bullet.x = nx
    bullet.y = ny
    return true
  })

  if (!world.over && world.guards.every((guard) => !guard.alive)) world.over = 'win'
}

function draw(ctx, world) {
  const player = world.player
  const points = vision(player.x, player.y, player.a, segmentsOf(WALLS))
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#070907'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(player.x, player.y)
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
  world.guards.forEach((guard) => {
    ctx.fillStyle = guard.alive ? '#d24a32' : '#3c4038'
    ctx.fillRect(guard.x - 8, guard.y - 8, 16, 16)
    if (!guard.alive) return
    ctx.fillStyle = '#1a100e'
    ctx.fillRect(guard.x + Math.cos(guard.a) * 6 - 2, guard.y + Math.sin(guard.a) * 6 - 2, 4, 4)
  })
  world.bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.fromGuard ? '#e7c56a' : '#f4efe4'
    ctx.fillRect(bullet.x - 2, bullet.y - 2, 4, 4)
  })
  ctx.restore()
  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.rotate(player.a)
  ctx.fillStyle = '#f4efe4'
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(-8, 7)
  ctx.lineTo(-5, 0)
  ctx.lineTo(-8, -7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function createStealth(canvas, onReport) {
  const ctx = canvas.getContext('2d')
  const held = { forward: false, back: false, left: false, right: false }
  let world = makeWorld()
  let raf = 0
  let last = 0
  let running = false
  let fire = false

  function report() {
    onReport({
      over: world.over,
      left: world.guards.filter((guard) => guard.alive).length,
    })
  }

  function loop(now) {
    if (!running) return
    const dt = Math.min(0.032, (now - last) / 1000 || 0)
    last = now
    const shot = fire
    fire = false
    step(world, dt, held, shot)
    draw(ctx, world)
    report()
    raf = requestAnimationFrame(loop)
  }

  canvas.addEventListener('pointerdown', () => {
    if (running && !world.over) fire = true
  })

  return {
    start() {
      world = makeWorld()
      running = true
      fire = false
      last = performance.now()
      cancelAnimationFrame(raf)
      report()
      raf = requestAnimationFrame(loop)
    },
    hold(name, down) {
      if (name in held) held[name] = down
    },
    shoot() {
      if (running && !world.over) fire = true
    },
  }
}
