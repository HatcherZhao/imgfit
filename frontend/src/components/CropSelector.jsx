import { useRef, useState, useEffect } from 'react'

export default function CropSelector({ imageUrl, onCrop }) {
  const canvasRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState(null)
  const [rect, setRect] = useState(null)
  const imgRef = useRef(null)

  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      draw(null)
    }
    img.src = imageUrl
  }, [imageUrl])

  function draw(r) {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')
    canvas.width = imgRef.current.naturalWidth
    canvas.height = imgRef.current.naturalHeight
    ctx.drawImage(imgRef.current, 0, 0)
    if (r) {
      ctx.strokeStyle = '#0ea5e9'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.fillStyle = 'rgba(14,165,233,0.15)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }
  }

  function getPos(e) {
    const canvas = canvasRef.current
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height
    return {
      x: (e.clientX - bounds.left) * scaleX,
      y: (e.clientY - bounds.top) * scaleY,
    }
  }

  function onMouseDown(e) {
    const pos = getPos(e)
    setStart(pos)
    setDragging(true)
    setRect(null)
    onCrop(null)
  }

  function onMouseMove(e) {
    if (!dragging || !start) return
    const pos = getPos(e)
    const r = {
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    }
    setRect(r)
    draw(r)
  }

  function onMouseUp() {
    setDragging(false)
    if (rect && rect.w > 4 && rect.h > 4) onCrop(rect)
    else { setRect(null); draw(null) }
  }

  if (!imageUrl) return null

  return (
    <canvas
      ref={canvasRef}
      style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    />
  )
}
