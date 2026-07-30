// 对话历史列表 — 渲染终端输出的所有行
import { type FC, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Line } from '../types'
import { StepBadge } from './StepBadge'
import { ActionButton } from './ActionButton'
import domtoimage from 'dom-to-image-more'
import qrcode from 'qrcode-generator'
import md5 from 'blueimp-md5'
import { Share2, Download, X } from 'lucide-react'

const GITHUB_URL = 'https://github.com/gengxiankun/ai.sh'

type Props = {
  history: Line[]
  isAdmin: boolean
  userEmail?: string
  onActionClick: (action: Line['actions'] extends (infer T)[] | undefined ? T : never) => void
}

export const History: FC<Props> = ({ history, isAdmin, userEmail, onActionClick }) => {
  const visibleLines = history.filter(
    (h) => h.input !== '' || h.output || h.status || h.steps?.length,
  )

  const [shareImage, setShareImage] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const contentRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const handleShare = async (idx: number, userQuestion: string) => {
    const el = contentRefs.current.get(idx)
    if (!el) return
    setShareLoading(true)
    try {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:760px;background:#0d1117;color:#c9d1d9;font-family:system-ui;padding:24px;'

      const header = document.createElement('div')
      header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #30363d'
      if (userEmail) {
        const av = document.createElement('img')
        av.src = 'https://www.gravatar.com/avatar/' + md5(userEmail.trim().toLowerCase()) + '?s=48&d=identicon'
        av.style.cssText = 'width:24px;height:24px;border-radius:50%;flex-shrink:0'
        header.appendChild(av)
      }
      const ht = document.createElement('span')
      ht.style.cssText = 'color:#58a6ff;font-size:16px;font-weight:bold'
      ht.textContent = userQuestion || 'AI 对话'
      header.appendChild(ht)
      wrapper.appendChild(header)

      const clone = el.cloneNode(true) as HTMLElement
      clone.style.cssText = 'font-size:14px;line-height:1.6;padding:0'
      wrapper.appendChild(clone)

      const footer = document.createElement('div')
      footer.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #30363d;display:flex;align-items:flex-start;justify-content:space-between'
      const fl = document.createElement('div')
      fl.style.cssText = 'color:#8b949e;font-size:12px;line-height:1.6'
      fl.innerHTML = GITHUB_URL + '<br/>Powered by ai.sh · DeepSeek'
      footer.appendChild(fl)
      const qrCanvas = createQRCanvas(GITHUB_URL, 72)
      const qi = document.createElement('img')
      qi.src = qrCanvas.toDataURL('image/png')
      qi.style.cssText = 'width:72px;height:72px;flex-shrink:0'
      const qrWrap = document.createElement('div')
      qrWrap.style.cssText = 'text-align:center'
      qrWrap.appendChild(qi)
      const qrLabel = document.createElement('div')
      qrLabel.style.cssText = 'color:#8b949e;font-size:10px;margin-top:4px'
      qrLabel.textContent = '长按识别二维码'
      qrWrap.appendChild(qrLabel)
      footer.appendChild(qrWrap)
      wrapper.appendChild(footer)

      document.body.appendChild(wrapper)
      const dataUrl = await domtoimage.toPng(wrapper, { scale: 2 })
      document.body.removeChild(wrapper)
      setShareImage(dataUrl)
    } catch (e) {
      console.error('[Share] failed:', e)
    }
    setShareLoading(false)
  }

  const downloadImage = () => {
    if (!shareImage) return
    const a = document.createElement('a')
    a.href = shareImage
    a.download = 'ai-share.png'
    a.click()
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-5">
      <div className="max-w-4xl mx-auto">
        {visibleLines.map((line, i) => (
          <div key={i} className="mb-3" style={{ animation: 'fade-in 0.2s ease-out' }}>
            <div ref={(el) => { if (el) contentRefs.current.set(i, el) }}>
            {line.input !== '' && (
              <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--ui-accent)' }}>{line.input}</div>
            )}
            {line.file && (
              <div className="mb-1.5"><span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>{line.file.name}</span></div>
            )}
            {line.steps && line.steps.length > 0 && (
              <div className="flex flex-col gap-1 mt-1.5">
                {line.steps.map((step, j) => (<StepBadge key={j} step={step} />))}
              </div>
            )}
            {line.output && (
              <div className="text-sm mt-1.5 leading-relaxed prose prose-sm max-w-none dark:prose-invert" style={{ color: 'var(--ui-text-secondary)' }}>
                <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]} rehypePlugins={[rehypeHighlight]}>{line.output}</ReactMarkdown>
              </div>
            )}
            </div>
            {line.image && (
              <div className="mt-3 p-3 rounded-lg border inline-block" style={{ background: 'var(--ui-image-bg)', borderColor: 'var(--ui-border)' }}>
                <img src={line.image} alt="" className="w-44 h-44 rounded-md" />
              </div>
            )}
            {line.actions && (
              <div className="mt-2 flex flex-col gap-1.5">
                {line.actions.map((action, j) => (<ActionButton key={j} action={action} isAdmin={isAdmin} onClick={onActionClick} />))}
              </div>
            )}
            {(line.status || line.input || line.output) && (
              <div className="flex items-center gap-3 mt-1.5">
                {line.status === 'loading' && (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="var(--ui-suggestion)" strokeWidth="3" strokeDasharray="30 70" strokeLinecap="round" />
                  </svg>
                )}
                {line.status === 'done' && (
                  <>
                    <button type="button" className="transition-colors cursor-pointer" style={{ color: 'var(--ui-suggestion)' }}
                      onClick={() => { navigator.clipboard.writeText(line.output || line.input).then() }} title="Copy">
                      <svg className="w-3 h-3 hover:opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button type="button" className="transition-colors cursor-pointer" style={{ color: 'var(--ui-suggestion)' }}
                      onClick={() => handleShare(i, visibleLines[i - 1]?.input || '')} title="Share">
                      <Share2 className="w-3 h-3 hover:opacity-80" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {shareImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShareImage(null)}>
          <div className="rounded-xl overflow-hidden shadow-2xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--ui-input-bg)', borderColor: 'var(--ui-input-border)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ui-input-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--ui-text)' }}>Share Image</span>
              <button onClick={() => setShareImage(null)} className="hover:opacity-70" style={{ color: 'var(--ui-text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col items-center gap-3">
              <img src={shareImage} alt="" className="rounded-lg border max-h-[60vh] object-contain" style={{ borderColor: 'var(--ui-input-border)' }} />
              <button onClick={downloadImage}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer hover:opacity-90"
                style={{ background: 'var(--ui-accent)' }}>
                <Download className="w-4 h-4" /> 下载图片
              </button>
            </div>
          </div>
        </div>
      )}

      {shareLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--ui-accent)' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  )
}

function createQRCanvas(url: string, size: number): HTMLCanvasElement {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  const count = qr.getModuleCount()
  const cell = size / count
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      ctx.fillStyle = qr.isDark(r, c) ? '#8b949e' : '#0d1117'
      ctx.fillRect(c * cell, r * cell, cell, cell)
    }
  }

  // 中心 GitHub 图标 (SVG path)
  const ghSize = size * 0.33
  const ghx = (size - ghSize) / 2, ghy = (size - ghSize) / 2
  const scale = ghSize / 24
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(ghx - 2, ghy - 2, ghSize + 4, ghSize + 4)
  ctx.fillStyle = '#8b949e'
  ctx.save()
  ctx.translate(ghx, ghy)
  ctx.scale(scale, scale)
  const gh = new Path2D('M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z')
  ctx.fill(gh)
  ctx.restore()

  return canvas
}
