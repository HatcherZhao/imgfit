import { useRef, useState, useEffect, useCallback } from 'react'

const HANDLE_SIZE = 8
const MIN_SIZE = 4
const HANDLE_HALF = HANDLE_SIZE / 2

const HANDLE_CURSORS = {
  tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize',
  t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize',
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)) }

function getHandles(r) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  return {
    tl: { x: r.x - HANDLE_HALF, y: r.y - HANDLE_HALF },
    t:  { x: cx - HANDLE_HALF,  y: r.y - HANDLE_HALF },
    tr: { x: r.x + r.w - HANDLE_HALF, y: r.y - HANDLE_HALF },
    l:  { x: r.x - HANDLE_HALF, y: cy - HANDLE_HALF },
    r:  { x: r.x + r.w - HANDLE_HALF, y: cy - HANDLE_HALF },
    bl: { x: r.x - HANDLE_HALF, y: r.y + r.h - HANDLE_HALF },
    b:  { x: cx - HANDLE_HALF,  y: r.y + r.h - HANDLE_HALF },
    br: { x: r.x + r.w - HANDLE_HALF, y: r.y + r.h - HANDLE_HALF },
  }
}

function hitTestHandles(mx, my, handles) {
  const pad = HANDLE_SIZE + 2
  for (const [key, h] of Object.entries(handles)) {
    if (mx >= h.x - 2 && mx <= h.x + pad && my >= h.y - 2 && my <= h.y + pad) return key
  }
  return null
}

export default function CropSelector({ imageUrl, onCrop }) {
  const canvasRef = useRef(null)
  const [rect, setRect] = useState(null)
  const [mode, setMode] = useState('idle')
  const [activeHandle, setActiveHandle] = useState(null)
  const [cursor, setCursor] = useState('crosshair')
  const imgRef = useRef(null)
  const startRef = useRef(null)
  const rectRef = useRef(null)

  useEffect(() => { rectRef.current = rect }, [rect])

  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => { imgRef.current = img; draw() }
    img.src = imageUrl
  }, [imageUrl])

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current
    const bounds = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (e.clientY - bounds.top) * (canvas.height / bounds.height),
    }
  }, [])

  const canvasW = () => canvasRef.current?.width || 0
  const canvasH = () => canvasRef.current?.height || 0

  const constrain = useCallback((r) => {
    let { x, y, w, h } = r
    w = clamp(w, MIN_SIZE, canvasW())
    h = clamp(h, MIN_SIZE, canvasH())
    x = clamp(x, 0, canvasW() - w)
    y = clamp(y, 0, canvasH() - h)
    return { x, y, w, h }
  }, [canvasW, canvasH])

  function draw() {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')
    canvas.width = imgRef.current.naturalWidth
    canvas.height = imgRef.current.naturalHeight
    ctx.drawImage(imgRef.current, 0, 0)

    const r = rectRef.current
    if (!r || r.w < MIN_SIZE || r.h < MIN_SIZE) return

    // 暗化遮罩（选区外）
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(0, 0, canvas.width, r.y)
    ctx.fillRect(0, r.y, r.x, r.h)
    ctx.fillRect(r.x + r.w, r.y, canvas.width - r.x - r.w, r.h)
    ctx.fillRect(0, r.y + r.h, canvas.width, canvas.height - r.y - r.h)

    // 选框边框
    ctx.strokeStyle = '#0ea5e9'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.strokeRect(r.x, r.y, r.w, r.h)

    // 三分线
    ctx.strokeStyle = 'rgba(14,165,233,0.4)'
    ctx.lineWidth = 1
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(r.x + r.w * i / 3, r.y); ctx.lineTo(r.x + r.w * i / 3, r.y + r.h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(r.x, r.y + r.h * i / 3); ctx.lineTo(r.x + r.w, r.y + r.h * i / 3)
      ctx.stroke()
    }

    // 8 个控制点
    const handles = getHandles(r)
    for (const h of Object.values(handles)) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE)
      ctx.strokeStyle = '#0ea5e9'
      ctx.lineWidth = 1.5
      ctx.strokeRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE)
    }

    // 尺寸标签 — 字体大小跟随 canvas 缩放，保持与页面文字一致
    const displayW = canvas.getBoundingClientRect().width
    const scale = displayW / canvas.width
    const fontSize = Math.round(14 / scale)
    const label = `${Math.round(r.w)} × ${Math.round(r.h)} px`
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
    const tm = ctx.measureText(label)
    const pad = Math.round(6 / scale)
    const lh = fontSize + pad * 2
    const lw = tm.width + pad * 2
    let lx = r.x + r.w / 2 - lw / 2
    let ly = r.y - lh - 6
    if (ly < 2) ly = r.y + r.h + 6
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.beginPath()
    ctx.roundRect(lx, ly, lw, lh, 4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + lw / 2, ly + lh / 2)
  }

  function onMouseDown(e) {
    const pos = getPos(e)
    const r = rectRef.current

    // 如果已有选区，检测是否点击了控制点
    if (r && r.w >= MIN_SIZE && r.h >= MIN_SIZE) {
      const handles = getHandles(r)
      const hit = hitTestHandles(pos.x, pos.y, handles)
      if (hit) {
        setMode('resizing')
        setActiveHandle(hit)
        startRef.current = { pos, rect: { ...r } }
        return
      }
      // 检测是否在选区内部 → 移动
      if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
        setMode('moving')
        startRef.current = { pos, rect: { ...r } }
        return
      }
    }

    // 画新框
    setMode('drawing')
    setActiveHandle(null)
    startRef.current = { pos, rect: null }
    setRect(null)
    onCrop(null)
  }

  function onMouseMove(e) {
    const pos = getPos(e)
    const s = startRef.current

    if (mode === 'drawing' && s) {
      const r = constrain({
        x: Math.min(s.pos.x, pos.x),
        y: Math.min(s.pos.y, pos.y),
        w: Math.abs(pos.x - s.pos.x),
        h: Math.abs(pos.y - s.pos.y),
      })
      setRect(r)
      onCrop(r)
      draw()
      return
    }

    if (mode === 'moving' && s) {
      const dx = pos.x - s.pos.x
      const dy = pos.y - s.pos.y
      const r = constrain({
        x: s.rect.x + dx,
        y: s.rect.y + dy,
        w: s.rect.w,
        h: s.rect.h,
      })
      setRect(r)
      onCrop(r)
      draw()
      return
    }

    if (mode === 'resizing' && s) {
      const dx = pos.x - s.pos.x
      const dy = pos.y - s.pos.y
      const o = s.rect
      let nr = { ...o }

      if (activeHandle.includes('l')) { nr.x = o.x + dx; nr.w = o.w - dx }
      if (activeHandle.includes('r')) { nr.w = o.w + dx }
      if (activeHandle.includes('t')) { nr.y = o.y + dy; nr.h = o.h - dy }
      if (activeHandle === 'b') { nr.h = o.h + dy }

      // 防止翻转
      if (nr.w < MIN_SIZE) {
        if (activeHandle.includes('l')) nr.x = o.x + o.w - MIN_SIZE
        nr.w = MIN_SIZE
      }
      if (nr.h < MIN_SIZE) {
        if (activeHandle === 't') nr.y = o.y + o.h - MIN_SIZE
        nr.h = MIN_SIZE
      }

      nr = constrain(nr)
      setRect(nr)
      onCrop(nr)
      draw()
      return
    }

    // 空闲时更新光标
    const r = rectRef.current
    if (r && r.w >= MIN_SIZE && r.h >= MIN_SIZE) {
      const handles = getHandles(r)
      const hit = hitTestHandles(pos.x, pos.y, handles)
      if (hit) { setCursor(HANDLE_CURSORS[hit]); return }
      if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
        setCursor('move'); return
      }
    }
    setCursor('crosshair')
  }

  function onMouseUp() {
    if (mode !== 'idle') {
      const r = rectRef.current
      if (r && r.w >= MIN_SIZE && r.h >= MIN_SIZE) onCrop(r)
      else { setRect(null); onCrop(null) }
    }
    setMode('idle')
    setActiveHandle(null)
    startRef.current = null
    draw()
  }

  if (!imageUrl) return null

  return (
    <canvas
      ref={canvasRef}
      style={{ maxWidth: '100%', cursor, display: 'block' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    />
  )
}
