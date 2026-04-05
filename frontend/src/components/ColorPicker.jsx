import { useRef, useEffect, useState } from 'react'

export default function ColorPicker({ imageUrl, onPick }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      draw(null)
    }
    img.src = imageUrl
  }, [imageUrl])

  function draw(dot) {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')
    canvas.width = imgRef.current.naturalWidth
    canvas.height = imgRef.current.naturalHeight
    ctx.drawImage(imgRef.current, 0, 0)
    if (dot) {
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, 12, 0, Math.PI * 2)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
    }
  }

  function getPos(e) {
    const canvas = canvasRef.current
    const bounds = canvas.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - bounds.left) * canvas.width / bounds.width),
      y: Math.round((e.clientY - bounds.top) * canvas.height / bounds.height),
    }
  }

  function onClick(e) {
    const pos = getPos(e)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('')
    setPicked({ ...pos, hex, rgb: [pixel[0], pixel[1], pixel[2]] })
    draw(pos)
    onPick(hex)
  }

  if (!imageUrl) return null

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }}
        onClick={onClick}
      />
      {picked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: '#475569' }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: picked.hex, border: '1px solid #e2e8f0' }} />
          已选背景色：{picked.hex}（RGB: {picked.rgb.join(', ')}）
        </div>
      )}
    </div>
  )
}
