import { useState, useRef, useCallback } from 'react'
import CropSelector from './components/CropSelector'
import ColorPicker from './components/ColorPicker'

const FIT_MODES = [
  { value: 'contain', label: '等比缩放', desc: '保持比例，留边透明' },
  { value: 'cover',   label: '等比裁剪', desc: '保持比例，裁掉多余' },
  { value: 'stretch', label: '拉伸填充', desc: '强制填满，可能变形' },
]

const BG_MODES = [
  { value: 'false', label: '不去背景', icon: '🚫' },
  { value: 'auto',  label: '自动检测', icon: '🔍' },
  { value: 'white', label: '去白底',   icon: '⬜' },
  { value: 'black', label: '去黑底',   icon: '⬛' },
  { value: 'pick',  label: '点击取色', icon: '🎨' },
]

function UploadZone({ label, accept, multiple, onChange }) {
  const [drag, setDrag] = useState(false)
  function handleDrop(e) {
    e.preventDefault(); setDrag(false)
    const files = multiple ? Array.from(e.dataTransfer.files) : [e.dataTransfer.files[0]]
    onChange({ target: { files } })
  }
  return (
    <label style={{ ...s.zone, ...(drag ? s.zoneDrag : {}), display: 'block' }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)} onDrop={handleDrop}>
      <input type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={onChange} />
      <div style={s.zoneIcon}>📁</div>
      <div style={s.zoneLabel}>{label}</div>
      <div style={s.zoneHint}>点击或拖拽上传</div>
    </label>
  )
}

export default function App() {
  const [templates, setTemplates] = useState([])
  const [newImage, setNewImage] = useState(null)
  const [crop, setCrop] = useState(null)
  const [fitMode, setFitMode] = useState('contain')
  const [removeBg, setRemoveBg] = useState('false')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [processing, setProcessing] = useState(null)
  const [done, setDone] = useState([]) // completed filenames
  const previewTimer = useRef(null)

  function reset() {
    setTemplates([]); setNewImage(null); setCrop(null)
    setFitMode('contain'); setRemoveBg('false')
    setPreviewUrl(null); setProcessing(null); setDone([])
  }

  function handleTemplates(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setTemplates(files.map(f => ({ file: f, url: URL.createObjectURL(f), name: f.name })))
  }

  function handleNewImage(e) {
    const f = e.target.files[0]
    if (!f) return
    setNewImage({ file: f, url: URL.createObjectURL(f) })
    setCrop(null); setPreviewUrl(null)
  }

  const triggerPreview = useCallback((cropVal, modeVal, imgFile, bgVal) => {
    if (!imgFile) return
    clearTimeout(previewTimer.current)
    setPreviewing(true)
    previewTimer.current = setTimeout(async () => {
      const fd = new FormData()
      fd.append('new_image', imgFile)
      fd.append('fit_mode', modeVal)
      if (cropVal) { fd.append('crop_x', cropVal.x); fd.append('crop_y', cropVal.y); fd.append('crop_w', cropVal.w); fd.append('crop_h', cropVal.h) }
      fd.append('preview_w', 280); fd.append('preview_h', 280)
      fd.append('remove_bg', bgVal)
      const res = await fetch('/preview', { method: 'POST', body: fd })
      if (res.ok) setPreviewUrl(URL.createObjectURL(await res.blob()))
      setPreviewing(false)
    }, 300)
  }, [])

  function onCrop(c) { setCrop(c); triggerPreview(c, fitMode, newImage?.file, removeBg) }
  function onFitMode(v) { setFitMode(v); triggerPreview(crop, v, newImage?.file, removeBg) }
  function onRemoveBg(v) { setRemoveBg(v); if (v !== 'pick') triggerPreview(crop, fitMode, newImage?.file, v) }

  async function handleProcess(tmpl) {
    if (!newImage) return
    setProcessing(tmpl.name)
    const fd = new FormData()
    fd.append('template', tmpl.file); fd.append('new_image', newImage.file)
    fd.append('fit_mode', fitMode)
    if (crop) { fd.append('crop_x', crop.x); fd.append('crop_y', crop.y); fd.append('crop_w', crop.w); fd.append('crop_h', crop.h) }
    fd.append('remove_bg', removeBg)
    const res = await fetch('/process', { method: 'POST', body: fd })
    if (res.ok) {
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cd = res.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename\*=UTF-8''(.+)/)
      a.download = m ? decodeURIComponent(m[1]) : tmpl.name
      a.click()
      setDone(d => [...d, tmpl.name])
    }
    setProcessing(null)
  }

  const allDone = templates.length > 0 && done.length === templates.length

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.headerLeft}>
            <div style={s.logo}>
              <span style={s.logoIcon}>⚡</span>
              <span style={s.logoText}>ImgFit</span>
            </div>
            <div style={s.headerDivider} />
            <div>
              <div style={s.tagline}>图片规格适配工具</div>
              <div style={s.taglineSub}>保留原版尺寸 · 格式 · 透明背景，一键替换图片内容</div>
            </div>
          </div>
          {(templates.length > 0 || newImage) && (
            <button style={s.resetBtn} onClick={reset}>↺ 开始新作业</button>
          )}
        </div>
      </header>

      {/* 使用说明 */}
      <div style={s.guide}>
        {[
          { n: '1', t: '上传模板', d: '原版图片作为尺寸/格式参考' },
          { n: '2', t: '上传素材', d: '新图片，可框选局部区域' },
          { n: '3', t: '配置适配', d: '填充方式 + 去背景选项' },
          { n: '4', t: '下载结果', d: '格式与原版完全一致' },
        ].map((item, i) => (
          <div key={item.n} style={s.guideItem}>
            <div style={s.guideNum}>{item.n}</div>
            <div>
              <div style={s.guideTitle}>{item.t}</div>
              <div style={s.guideDesc}>{item.d}</div>
            </div>
            {i < 3 && <div style={s.guideArrow}>→</div>}
          </div>
        ))}
      </div>

      <div style={s.main}>
        {/* Step 1 */}
        <section style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.badge}>步骤 1</span>
            <h2 style={s.h2}>上传原版图片（模板）</h2>
          </div>
          <p style={s.cardDesc}>支持 PNG · JPG · WebP · GIF · ICO · ICNS · SVG，可多选</p>
          <UploadZone accept="image/*,.icns,.ico,.svg" multiple onChange={handleTemplates}
            label="点击或拖拽上传模板图片（支持多张）" />
          {templates.length > 0 && (
            <div style={s.thumbRow}>
              {templates.map((t, i) => (
                <div key={i} style={s.thumb}>
                  <div style={s.thumbImgWrap}>
                    <img src={t.url} alt={t.name} style={s.thumbImg} />
                    {done.includes(t.name) && <div style={s.thumbDone}>✓</div>}
                  </div>
                  <span style={s.thumbName}>{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Step 2 */}
        <section style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.badge}>步骤 2</span>
            <h2 style={s.h2}>上传新图片（素材）</h2>
          </div>
          <p style={s.cardDesc}>上传后可拖拽框选局部区域；不框选则使用整张图</p>
          <UploadZone accept="image/*" multiple={false} onChange={handleNewImage} label="点击或拖拽上传素材图片" />
          {newImage && (
            <div style={{ marginTop: 12 }}>
              <p style={s.cropHint}>🖱 在图片上拖拽选择要使用的区域（可选）</p>
              <CropSelector imageUrl={newImage.url} onCrop={onCrop} />
              {crop && <p style={s.cropInfo}>已选区域：{Math.round(crop.w)} × {Math.round(crop.h)} px</p>}
            </div>
          )}
        </section>

        {/* Step 3 */}
        {newImage && (
          <section style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.badge}>步骤 3</span>
              <h2 style={s.h2}>配置适配方式</h2>
            </div>

            <div style={s.sectionLabel}>填充方式</div>
            <div style={s.modeRow}>
              {FIT_MODES.map(m => (
                <label key={m.value} style={{ ...s.modeCard, ...(fitMode === m.value ? s.modeCardActive : {}) }}>
                  <input type="radio" name="fit" value={m.value} checked={fitMode === m.value}
                    onChange={() => onFitMode(m.value)} style={{ display: 'none' }} />
                  <div style={s.modeName}>{m.label}</div>
                  <div style={s.modeDesc}>{m.desc}</div>
                </label>
              ))}
            </div>

            <div style={s.sectionLabel}>去除背景色</div>
            <div style={s.bgModeRow}>
              {BG_MODES.map(opt => {
                const isActive = opt.value === 'pick' ? removeBg.startsWith('#') : removeBg === opt.value
                return (
                  <button key={opt.value}
                    style={{ ...s.bgBtn, ...(isActive ? s.bgBtnActive : {}) }}
                    onClick={() => onRemoveBg(opt.value)}>
                    <span style={s.bgBtnIcon}>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>

            {(removeBg === 'pick' || removeBg.startsWith('#')) && newImage && (
              <div style={{ marginTop: 10 }}>
                <p style={s.cropHint}>🎨 点击素材图上的背景区域取色</p>
                <ColorPicker imageUrl={newImage.url} onPick={hex => {
                  setRemoveBg(hex)
                  triggerPreview(crop, fitMode, newImage.file, hex)
                }} />
              </div>
            )}

            <div style={s.previewWrap}>
              <div style={s.previewHeader}>
                <span style={s.previewLabel}>实时预览（280×280）</span>
                {previewing && <span style={s.previewLoading}>⏳ 生成中...</span>}
              </div>
              <div style={s.previewImgWrap}>
                {previewUrl
                  ? <img src={previewUrl} alt="preview" style={s.previewImg} />
                  : <div style={s.previewPlaceholder}>{previewing ? '⏳' : '上传素材后自动预览'}</div>
                }
                {previewing && previewUrl && <div style={s.previewOverlay}>⏳</div>}
              </div>
            </div>
          </section>
        )}

        {/* Step 4 */}
        {templates.length > 0 && newImage && (
          <section style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.badge}>步骤 4</span>
              <h2 style={s.h2}>生成并下载</h2>
            </div>
            <p style={s.cardDesc}>点击对应按钮下载，格式与原版完全一致</p>
            <div style={s.btnRow}>
              {templates.map((t, i) => {
                const isDone = done.includes(t.name)
                const isProc = processing === t.name
                return (
                  <button key={i}
                    style={{ ...s.btn, ...(isDone ? s.btnDone : {}), ...(isProc ? s.btnLoading : {}) }}
                    disabled={!!processing}
                    onClick={() => handleProcess(t)}>
                    {isProc ? '⏳ 处理中...' : isDone ? `✓ ${t.name}` : `⬇ ${t.name}`}
                  </button>
                )
              })}
            </div>
            {allDone && (
              <div style={s.allDoneBar}>
                <span>🎉 全部完成！</span>
                <button style={s.newJobBtn} onClick={reset}>↺ 开始新作业</button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f0f2f5' },

  // Header
  header: { background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)', padding: '20px 0' },
  headerInner: { maxWidth: 900, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: 28, lineHeight: 1 },
  logoText: { fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' },
  headerDivider: { width: 1, height: 36, background: 'rgba(255,255,255,0.2)' },
  tagline: { fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 },
  taglineSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  resetBtn: { padding: '7px 16px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },

  // Guide
  guide: { maxWidth: 900, margin: '0 auto', padding: '16px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  guideItem: { flex: '1 1 160px', display: 'flex', gap: 10, alignItems: 'center', background: '#fff', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative' },
  guideNum: { width: 26, height: 26, borderRadius: '50%', background: '#1e40af', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  guideTitle: { fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 1 },
  guideDesc: { fontSize: 11, color: '#64748b', lineHeight: 1.4 },
  guideArrow: { position: 'absolute', right: -12, color: '#94a3b8', fontSize: 14, zIndex: 1 },

  // Main
  main: { maxWidth: 900, margin: '0 auto', padding: '16px 24px 40px' },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  badge: { background: '#eff6ff', color: '#1e40af', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, border: '1px solid #bfdbfe' },
  h2: { fontSize: 15, fontWeight: 600, color: '#1e293b' },
  cardDesc: { fontSize: 12, color: '#94a3b8', marginBottom: 14 },
  sectionLabel: { fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' },

  // Upload
  zone: { border: '2px dashed #cbd5e1', borderRadius: 10, padding: '24px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#f8fafc' },
  zoneDrag: { borderColor: '#1e40af', background: '#eff6ff' },
  zoneIcon: { fontSize: 26, marginBottom: 6 },
  zoneLabel: { fontSize: 13, color: '#475569', fontWeight: 500, marginBottom: 3 },
  zoneHint: { fontSize: 11, color: '#94a3b8' },

  // Thumbs
  thumbRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  thumb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  thumbImgWrap: { width: 68, height: 68, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 0 0 / 12px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  thumbImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  thumbDone: { position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.75)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 },
  thumbName: { fontSize: 10, color: '#64748b', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' },

  // Crop
  cropHint: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  cropInfo: { fontSize: 12, color: '#1e40af', marginTop: 6, fontWeight: 500 },

  // Fit mode
  modeRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  modeCard: { flex: '1 1 130px', border: '2px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s', background: '#f8fafc' },
  modeCardActive: { borderColor: '#1e40af', background: '#eff6ff' },
  modeName: { fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 3 },
  modeDesc: { fontSize: 11, color: '#64748b' },

  // BG mode
  bgModeRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  bgBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '2px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#475569', transition: 'all 0.15s', fontWeight: 500 },
  bgBtnActive: { borderColor: '#1e40af', background: '#eff6ff', color: '#1e40af' },
  bgBtnIcon: { fontSize: 15 },

  // Preview
  previewWrap: { marginTop: 16 },
  previewHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  previewLabel: { fontSize: 12, color: '#94a3b8' },
  previewLoading: { fontSize: 12, color: '#f59e0b', fontWeight: 500 },
  previewImgWrap: { position: 'relative', width: 280, height: 280 },
  previewImg: { width: 280, height: 280, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 0 0 / 16px 16px', display: 'block' },
  previewPlaceholder: { width: 280, height: 280, border: '1px dashed #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', background: '#f8fafc' },
  previewOverlay: { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, borderRadius: 8 },

  // Download
  btnRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  btn: { padding: '8px 18px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
  btnDone: { background: '#10b981' },
  btnLoading: { opacity: 0.6, cursor: 'not-allowed' },
  allDoneBar: { marginTop: 16, padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, color: '#166534' },
  newJobBtn: { padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
}
