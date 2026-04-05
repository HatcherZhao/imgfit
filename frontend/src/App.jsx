import { useState, useRef, useCallback } from 'react'
import CropSelector from './components/CropSelector'
import ColorPicker from './components/ColorPicker'

const FIT_MODES = [
  { value: 'contain', label: '等比缩放', desc: '留边透明' },
  { value: 'cover',   label: '等比裁剪', desc: '裁掉多余' },
  { value: 'stretch', label: '拉伸填充', desc: '强制填满' },
]

const BG_MODES = [
  { value: 'false', label: '保留背景' },
  { value: 'auto',  label: '自动检测' },
  { value: 'white', label: '去白底'   },
  { value: 'black', label: '去黑底'   },
  { value: 'pick',  label: '取色去背' },
]

const STEPS = [
  { n: '01', t: '上传模板', d: '原版图片作为尺寸/格式参考' },
  { n: '02', t: '上传素材', d: '新图片，可框选局部区域' },
  { n: '03', t: '配置适配', d: '填充方式 + 背景处理' },
  { n: '04', t: '下载结果', d: '格式与原版完全一致' },
]

function UploadZone({ label, accept, multiple, onChange }) {
  const [drag, setDrag] = useState(false)
  function handleDrop(e) {
    e.preventDefault(); setDrag(false)
    const files = multiple ? Array.from(e.dataTransfer.files) : [e.dataTransfer.files[0]]
    onChange({ target: { files } })
  }
  return (
    <label
      style={{ ...s.zone, ...(drag ? s.zoneDrag : {}) }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <input type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={onChange} />
      <svg style={s.zoneIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={s.zoneLabel}>{label}</div>
      <div style={s.zoneHint}>或将文件拖拽至此</div>
    </label>
  )
}

export default function App() {
  const [templates, setTemplates] = useState([])
  const [newImage, setNewImage] = useState(null)
  const [crop, setCrop] = useState(null)
  const [fitMode, setFitMode] = useState('contain')
  const [removeBg, setRemoveBg] = useState('false')
  const [compress, setCompress] = useState('false')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [processing, setProcessing] = useState(null)
  const [done, setDone] = useState([])
  const [lightbox, setLightbox] = useState(false)
  const previewTimer = useRef(null)

  function reset() {
    setTemplates([]); setNewImage(null); setCrop(null)
    setFitMode('contain'); setRemoveBg('false'); setCompress('false')
    setPreviewUrl(null); setProcessing(null); setDone([])
  }

  function handleTemplates(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const items = files.map(f => ({ file: f, url: URL.createObjectURL(f), name: f.name }))
    setTemplates(items)
    // ICO/ICNS 浏览器无法直接显示，异步替换为 PNG 缩略图
    items.forEach((item, i) => {
      const ext = item.name.split('.').pop().toLowerCase()
      if (ext === 'icns' || ext === 'ico') {
        const fd = new FormData(); fd.append('file', item.file)
        fetch('/thumbnail', { method: 'POST', body: fd })
          .then(r => r.ok ? r.blob() : null)
          .then(blob => {
            if (blob) setTemplates(prev => prev.map((t, j) => j === i ? { ...t, url: URL.createObjectURL(blob) } : t))
          })
      }
    })
  }

  function handleNewImage(e) {
    const f = e.target.files[0]
    if (!f) return
    const img = { file: f, url: URL.createObjectURL(f) }
    setNewImage(img)
    setCrop(null); setPreviewUrl(null)
    triggerPreview(null, fitMode, f, removeBg)
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
      fd.append('preview_w', 220); fd.append('preview_h', 220)
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
    fd.append('compress', compress)
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
      {/* Lightbox */}
      {lightbox && previewUrl && (
        <div style={s.lightboxOverlay} onClick={() => setLightbox(false)}>
          <img src={previewUrl} alt="large preview" style={s.lightboxImg} onClick={e => e.stopPropagation()} />
          <button style={s.lightboxClose} onClick={() => setLightbox(false)}>✕</button>
        </div>
      )}

      {/* Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.brand}>
            <img src="/imgfit-logo.png" alt="ImgFit" style={s.logoImg} />
            <span style={s.logoText}>Img<span style={s.logoTextBlue}>Fit</span></span>
            <span style={s.brandSep} />
            <div>
              <div style={s.brandTitle}>图片规格适配工具</div>
              <div style={s.brandDesc}>上传原版图片作为模板，自动保留其尺寸、格式、透明背景，将新素材一键适配输出 · 支持 PNG / JPG / WebP / ICO / ICNS / SVG</div>
            </div>
          </div>
          <a href="https://github.com/HatcherZhao/imgfit" target="_blank" rel="noopener noreferrer" style={s.githubBtn} title="View on GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          </a>
        </div>
      </header>

      {/* Steps guide */}
      <div style={s.stepsBar}>
        <div style={s.stepsInner}>
          {STEPS.map((step, i) => (
            <div key={step.n} style={s.stepItem}>
              <span style={s.stepNum}>{step.n}</span>
              <div>
                <div style={s.stepTitle}>{step.t}</div>
                <div style={s.stepDesc}>{step.d}</div>
              </div>
              {i < 3 && <span style={s.stepArrow}>→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Workspace */}
      <div style={s.workspace}>
        {/* LEFT PANEL */}
        <div style={s.panel}>
          {/* Template upload */}
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>模板图片</span>
              {(templates.length > 0 || newImage) && (
                <button style={s.resetBtn} onClick={reset}>↺ 重新开始</button>
              )}
              <span style={s.sectionMeta}>PNG · JPG · WebP · GIF · ICO · ICNS · SVG</span>
            </div>
            <UploadZone accept="image/*,.icns,.ico,.svg" multiple onChange={handleTemplates} label="点击上传模板（支持多张）" />
            {templates.length > 0 && (
              <div style={s.thumbGrid}>
                {templates.map((t, i) => (
                  <div key={i} style={s.thumbItem}>
                    <div style={s.thumbBox}>
                      <img src={t.url} alt={t.name} style={s.thumbImg} />
                      {done.includes(t.name) && (
                        <div style={s.thumbCheck}>
                          <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                            <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <span style={s.thumbLabel}>{t.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={s.divider} />

          {/* Source image upload */}
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>素材图片</span>
              <span style={s.sectionMeta}>可框选局部区域</span>
            </div>
            <UploadZone accept="image/*" multiple={false} onChange={handleNewImage} label="点击上传素材" />
            {newImage && (
              <div style={{ marginTop: 10 }}>
                <p style={s.hint}>拖拽选择要使用的区域（可选）</p>
                <CropSelector imageUrl={newImage.url} onCrop={onCrop} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={s.panel}>
          {/* Config */}
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>适配配置</span>
            </div>

            <div style={s.fieldLabel}>填充模式</div>
            <div style={s.fitRow}>
              {FIT_MODES.map(m => (
                <button key={m.value}
                  style={{ ...s.fitBtn, ...(fitMode === m.value ? s.fitBtnOn : {}) }}
                  onClick={() => onFitMode(m.value)}>
                  <span style={s.fitBtnName}>{m.label}</span>
                  <span style={s.fitBtnDesc}>{m.desc}</span>
                </button>
              ))}
            </div>

            <div style={s.fieldLabel}>背景处理</div>
            <div style={s.bgRow}>
              {BG_MODES.map(opt => {
                const isActive = opt.value === 'pick' ? removeBg.startsWith('#') : removeBg === opt.value
                return (
                  <button key={opt.value}
                    style={{ ...s.bgChip, ...(isActive ? s.bgChipOn : {}) }}
                    onClick={() => onRemoveBg(opt.value)}>
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {(removeBg === 'pick' || removeBg.startsWith('#')) && newImage && (
              <div style={{ marginTop: 10 }}>
                <p style={s.hint}>点击图片上的背景区域取色</p>
                <ColorPicker imageUrl={newImage.url} onPick={hex => {
                  setRemoveBg(hex)
                  triggerPreview(crop, fitMode, newImage.file, hex)
                }} />
              </div>
            )}

            <div style={{ ...s.fieldLabel, marginTop: 14 }}>输出优化</div>
            <div style={s.bgRow}>
              <button
                style={{ ...s.bgChip, ...(compress === 'false' ? s.bgChipOn : {}) }}
                onClick={() => setCompress('false')}>
                保持原始
              </button>
              <button
                style={{ ...s.bgChip, ...(compress === 'true' ? s.bgChipOn : {}) }}
                onClick={() => setCompress('true')}>
                压缩文件
              </button>
            </div>
            {compress === 'true' && <p style={{ ...s.hint, marginTop: 4 }}>减小输出文件大小，略微降低画质</p>}
          </div>

          <div style={s.divider} />

          {/* Preview */}
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>实时预览</span>
              {previewing && <span style={s.spinnerLabel}>处理中…</span>}
              {previewUrl && !previewing && <span style={s.clickHint}>点击查看大图</span>}
            </div>
            <div
              style={{ ...s.previewFrame, ...(previewUrl ? s.previewFrameClickable : {}) }}
              onClick={() => previewUrl && setLightbox(true)}
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="preview" style={s.previewImg} />
                  {previewing && <div style={s.previewMask}><span>⟳</span></div>}
                </>
              ) : (
                <div style={s.previewEmpty}>
                  {previewing
                    ? <span style={{ fontSize: 22, color: '#9ca3af' }}>⟳</span>
                    : <span style={s.previewEmptyText}>上传素材后自动预览</span>
                  }
                </div>
              )}
            </div>
          </div>

          <div style={s.divider} />

          {/* Download */}
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>生成下载</span>
            </div>
            {templates.length > 0 && newImage ? (
              <>
                <div style={s.downloadGrid}>
                  {templates.map((t, i) => {
                    const isDone = done.includes(t.name)
                    const isProc = processing === t.name
                    return (
                      <button key={i}
                        style={{ ...s.dlBtn, ...(isDone ? s.dlBtnDone : {}), ...(isProc ? s.dlBtnBusy : {}) }}
                        disabled={!!processing}
                        onClick={() => handleProcess(t)}>
                        {isProc ? '处理中…' : isDone ? `✓ ${t.name}` : `↓ ${t.name}`}
                      </button>
                    )
                  })}
                </div>
                {allDone && (
                  <div style={s.doneBar}>
                    <span>🎉 全部完成</span>
                    <button style={s.doneResetBtn} onClick={reset}>↺ 重新开始</button>
                  </div>
                )}
              </>
            ) : (
              <p style={s.hint}>请先上传模板和素材图片</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const FONT = '"Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", sans-serif'
const MONO = '"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", monospace'
const BLUE = '#4f6ef7'
const BLUE_BG = '#eef1fe'
const BORDER = '#e4e7ec'
const TEXT = '#111827'
const MUTED = '#6b7280'
const FAINT = '#f9fafb'

const s = {
  page: { minHeight: '100vh', background: '#f3f4f6', fontFamily: FONT, color: TEXT },

  // Lightbox
  lightboxOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' },
  lightboxImg: { maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 25px 60px rgba(0,0,0,0.5)' },
  lightboxClose: { position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 18, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { background: '#fff', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 10 },
  headerInner: { maxWidth: 1160, margin: '0 auto', padding: '0 28px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logoImg: { width: 44, height: 44, objectFit: 'contain', borderRadius: 8 },
  logoText: { fontFamily: MONO, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: TEXT },
  logoTextBlue: { color: BLUE, fontStyle: 'italic' },

  // Footer
  footer: { borderTop: `1px solid ${BORDER}`, background: '#fff', padding: '24px 0', display: 'flex', justifyContent: 'center' },
  footerImg: { width: 120, height: 120, objectFit: 'contain' },
  brandSep: { display: 'inline-block', width: 1, height: 16, background: BORDER },
  brandTitle: { fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 },
  brandDesc: { fontSize: 11, color: MUTED, maxWidth: 500 },
  githubBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, color: '#24292f', border: `1px solid ${BORDER}`, background: FAINT, textDecoration: 'none', flexShrink: 0 },
  resetBtn: { padding: '6px 14px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT },

  // Steps bar
  stepsBar: { background: '#fff', borderBottom: `1px solid ${BORDER}` },
  stepsInner: { maxWidth: 1160, margin: '0 auto', padding: '14px 28px', display: 'flex', gap: 0, alignItems: 'center' },
  stepItem: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, position: 'relative' },
  stepNum: { fontSize: 11, fontWeight: 700, color: BLUE, fontFamily: MONO, minWidth: 24 },
  stepTitle: { fontSize: 12, fontWeight: 600, color: TEXT },
  stepDesc: { fontSize: 11, color: MUTED },
  stepArrow: { color: '#d1d5db', fontSize: 14, marginLeft: 'auto', paddingRight: 12 },

  // Workspace
  workspace: { maxWidth: 1160, margin: '0 auto', padding: '16px 28px 48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },

  // Panel
  panel: { background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' },
  section: { padding: '16px 20px' },
  sectionHead: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: TEXT },
  sectionMeta: { fontSize: 11, color: MUTED },
  divider: { height: 1, background: BORDER },

  // Upload zone — compact
  zone: { display: 'block', border: `1.5px dashed ${BORDER}`, borderRadius: 8, padding: '14px 12px', textAlign: 'center', cursor: 'pointer', background: FAINT, transition: 'border-color 0.15s, background 0.15s' },
  zoneDrag: { borderColor: BLUE, background: BLUE_BG },
  zoneIcon: { width: 20, height: 20, color: '#9ca3af', margin: '0 auto 6px', display: 'block' },
  zoneLabel: { fontSize: 12, color: '#374151', fontWeight: 500, marginBottom: 2 },
  zoneHint: { fontSize: 11, color: '#9ca3af' },

  // Thumbs
  thumbGrid: { display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  thumbItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  thumbBox: { width: 52, height: 52, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', background: 'repeating-conic-gradient(#f0f0f0 0% 25%, #fff 0% 50%) 0 0 / 8px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  thumbImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  thumbCheck: { position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  thumbLabel: { fontSize: 10, color: MUTED, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' },

  hint: { fontSize: 12, color: MUTED, margin: '0 0 8px' },
  cropBadge: { display: 'inline-block', marginTop: 5, fontSize: 11, color: BLUE, background: BLUE_BG, padding: '2px 8px', borderRadius: 20, fontWeight: 500 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 },

  // Fit mode
  fitRow: { display: 'flex', gap: 6, marginBottom: 16 },
  fitBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, background: FAINT, cursor: 'pointer', transition: 'all 0.12s', fontFamily: FONT },
  fitBtnOn: { borderColor: BLUE, background: BLUE_BG },
  fitBtnName: { fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 2 },
  fitBtnDesc: { fontSize: 10, color: MUTED },

  // BG chips
  bgRow: { display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 },
  bgChip: { padding: '5px 11px', border: `1.5px solid ${BORDER}`, borderRadius: 20, background: FAINT, cursor: 'pointer', fontSize: 12, color: '#374151', fontWeight: 500, transition: 'all 0.12s', fontFamily: FONT },
  bgChipOn: { borderColor: BLUE, background: BLUE_BG, color: BLUE },

  // Preview
  previewFrame: { position: 'relative', width: 220, height: 220, borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, background: 'repeating-conic-gradient(#f0f0f0 0% 25%, #fff 0% 50%) 0 0 / 14px 14px' },
  previewFrameClickable: { cursor: 'zoom-in' },
  previewImg: { width: 220, height: 220, objectFit: 'contain', display: 'block' },
  previewMask: { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 },
  previewEmpty: { width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewEmptyText: { fontSize: 12, color: '#9ca3af' },
  spinnerLabel: { fontSize: 11, color: '#f59e0b', fontWeight: 500 },
  clickHint: { fontSize: 11, color: MUTED },

  // Download
  downloadGrid: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  dlBtn: { padding: '7px 14px', background: BLUE, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT, transition: 'opacity 0.12s', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dlBtnDone: { background: '#10b981' },
  dlBtnBusy: { opacity: 0.5, cursor: 'not-allowed' },
  doneBar: { marginTop: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#166534' },
  doneResetBtn: { padding: '5px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT },
}
