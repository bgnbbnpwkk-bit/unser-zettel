// Generates app icons as PNG files using only built-in Node.js (zlib).
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

// ── CRC32 ────────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()
const crc32 = buf => {
  let c = 0xFFFFFFFF
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ── PNG writer ───────────────────────────────────────────────────────────────
function makePNG(size, draw) {
  const pixels = new Uint8Array(size * size * 4)
  draw(pixels, size)

  const rows = []
  for (let y = 0; y < size; y++) {
    rows.push(0) // filter: None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      rows.push(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])
    }
  }
  const comp = deflateSync(Buffer.from(rows), { level: 6 })
  const u32 = n => { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(n >>> 0); return b }
  const chunk = (t, d) => {
    const tb = Buffer.from(t), db = Buffer.isBuffer(d) ? d : Buffer.from(d)
    return Buffer.concat([u32(db.length), tb, db, u32(crc32(Buffer.concat([tb, db])))])
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', comp),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
function blend(buf, w, x, y, r, g, b, a) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || x >= w || y < 0 || y >= w) return
  const i = (y * w + x) * 4
  const sa = a / 255, da = buf[i + 3] / 255, oa = sa + da * (1 - sa)
  if (oa < 0.001) return
  buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / oa)
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa)
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa)
  buf[i + 3] = Math.round(oa * 255)
}

function fillRect(buf, w, x, y, rw, rh, r, g, b, a = 255) {
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++)
      blend(buf, w, x + dx, y + dy, r, g, b, a)
}

function fillCircle(buf, w, cx, cy, rad, r, g, b, a = 255) {
  const r2 = rad * rad
  for (let dy = -rad; dy <= rad; dy++)
    for (let dx = -rad; dx <= rad; dx++)
      if (dx * dx + dy * dy <= r2)
        blend(buf, w, cx + dx, cy + dy, r, g, b, a)
}

// ── Icon design ──────────────────────────────────────────────────────────────
function drawIcon(buf, s) {
  // Background: dark purple radial gradient
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x - s / 2) / s, dy = (y - s / 2) / s
      const t = Math.min(Math.sqrt(dx * dx + dy * dy) * 2.4, 1)
      blend(buf, s, x, y,
        Math.round(22 - 13 * t),
        Math.round(17 - 9 * t),
        Math.round(46 - 24 * t), 255)
    }
  }

  // Purple glow blob (top-center)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x - s * 0.52) / s, dy = (y - s * 0.30) / s
      const d = Math.sqrt(dx * dx + dy * dy)
      const a = Math.max(0, (0.42 - d) / 0.42) * 60
      if (a > 0.5) blend(buf, s, x, y, 129, 140, 248, Math.round(a))
    }
  }

  // Pink glow blob (bottom-left)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x - s * 0.26) / s, dy = (y - s * 0.72) / s
      const d = Math.sqrt(dx * dx + dy * dy)
      const a = Math.max(0, (0.34 - d) / 0.34) * 42
      if (a > 0.5) blend(buf, s, x, y, 251, 113, 133, Math.round(a))
    }
  }

  // ── Shopping cart (white) ────────────────────────────────────────────────
  const W = 255

  const bx = Math.round(s * 0.182)       // basket left
  const bw = Math.round(s * 0.636)       // basket width
  const by = Math.round(s * 0.282)       // basket top
  const bh = Math.round(s * 0.348)       // basket height
  const tk = Math.max(2, Math.round(s * 0.037)) // line thickness

  // Basket frame
  fillRect(buf, s, bx,          by,           bw, tk, W, W, W)  // top
  fillRect(buf, s, bx,          by + bh - tk, bw, tk, W, W, W)  // bottom
  fillRect(buf, s, bx,          by,           tk, bh, W, W, W)  // left
  fillRect(buf, s, bx + bw - tk, by,          tk, bh, W, W, W)  // right

  // Inner vertical dividers (subtle)
  const lw = Math.max(1, Math.round(tk * 0.55))
  fillRect(buf, s, Math.round(bx + bw / 3),   by + tk, lw, bh - tk * 2, W, W, W, 120)
  fillRect(buf, s, Math.round(bx + bw * 2/3), by + tk, lw, bh - tk * 2, W, W, W, 120)

  // Handle: vertical post (left) + horizontal bar
  const postH     = Math.round(s * 0.108)
  const handleBarW = Math.round(bw * 0.71)

  fillRect(buf, s, bx, by - postH, tk, postH + tk, W, W, W)          // post
  fillRect(buf, s, bx, by - postH, handleBarW, tk, W, W, W)           // bar
  // Round end-cap
  fillCircle(buf, s,
    bx + handleBarW, by - postH + Math.round(tk / 2),
    Math.round(tk / 2), W, W, W)

  // Wheels
  const wr  = Math.max(3, Math.round(s * 0.064))
  const whr = Math.max(1, Math.round(wr * 0.42))
  const wy  = Math.round(by + bh + wr * 0.84)
  const w1x = Math.round(bx + bw * 0.21)
  const w2x = Math.round(bx + bw * 0.77)

  // Approximate background color at wheel position (dark center of gradient)
  const bg = 13, gg = 10, bb2 = 27

  fillCircle(buf, s, w1x, wy, wr,  W,   W,   W,   255)
  fillCircle(buf, s, w2x, wy, wr,  W,   W,   W,   255)
  fillCircle(buf, s, w1x, wy, whr, bg,  gg,  bb2, 255)
  fillCircle(buf, s, w2x, wy, whr, bg,  gg,  bb2, 255)
}

// ── Generate all sizes ───────────────────────────────────────────────────────
const targets = {
  512: 'icon-512.png',
  192: 'icon-192.png',
  180: 'apple-touch-icon.png',
  96:  'favicon-96x96.png',
}

for (const [size, name] of Object.entries(targets)) {
  writeFileSync(`public/${name}`, makePNG(Number(size), drawIcon))
  console.log(`✓  ${name}  (${size}×${size})`)
}
