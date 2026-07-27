// 底部上拉框 — 从底部滑出，默认 40% 高度，可拖拽上拉
import { type FC, type ReactNode, useState, useRef, useEffect, useCallback } from 'react'

type Props = {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

const MIN_HEIGHT = 40 // vh
const MAX_HEIGHT = 90 // vh
const SNAP_CLOSE = 25 // vh — 低于此阈值关闭

export const BottomSheet: FC<Props> = ({ title, subtitle, onClose, children }) => {
  const [height, setHeight] = useState(MIN_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(MIN_HEIGHT)
  const sheetRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(onClose, 200)
  }, [onClose])

  const onDragStart = useCallback(
    (clientY: number) => {
      setIsDragging(true)
      startYRef.current = clientY
      startHeightRef.current = height
    },
    [height],
  )

  const onDragMove = useCallback(
    (clientY: number) => {
      if (!isDragging) return
      const dy = startYRef.current - clientY
      const vh = window.innerHeight / 100
      const newH = Math.min(MAX_HEIGHT, Math.max(0, startHeightRef.current + dy / vh))
      setHeight(newH)
    },
    [isDragging],
  )

  const onDragEnd = useCallback(() => {
    setIsDragging(false)
    setHeight((prev) => {
      if (prev < SNAP_CLOSE) {
        handleClose()
        return MIN_HEIGHT
      }
      return prev < MIN_HEIGHT ? MIN_HEIGHT : prev
    })
  }, [handleClose])

  // 全局 touch/mouse 事件
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => onDragMove(e.touches[0].clientY)
    const onTouchEnd = () => onDragEnd()
    const onMouseMove = (e: MouseEvent) => onDragMove(e.clientY)
    const onMouseUp = () => onDragEnd()

    if (isDragging) {
      window.addEventListener('touchmove', onTouchMove, { passive: true })
      window.addEventListener('touchend', onTouchEnd)
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }
    return () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, onDragMove, onDragEnd])

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: isClosing ? 'transparent' : 'rgba(0,0,0,0.25)', backdropFilter: isClosing ? 'none' : 'blur(4px)', transition: 'background 0.2s, backdrop-filter 0.2s' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 rounded-t-2xl shadow-2xl ${isClosing ? 'translate-y-full' : ''}`}
        style={{
          height: `${height}vh`,
          background: 'var(--ui-input-bg)',
          border: '1px solid var(--ui-input-border)',
          borderBottom: 'none',
          transition: isDragging ? 'none' : 'height 0.25s ease-out, transform 0.2s ease-out',
        }}
      >
        {/* 拖拽把手 */}
        <div
          className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => onDragStart(e.clientY)}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: 'var(--ui-input-border)' }}
          />
        </div>

        {/* 标题栏 */}
        <div
          className="px-4 py-2 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--ui-input-border)' }}
        >
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ui-text)' }}>
              {title}
            </h3>
            {subtitle && (
              <p
                className="text-[11px] mt-0.5"
                style={{ color: 'var(--ui-suggestion)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-5 h-5 rounded-md flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity"
            style={{
              background: 'var(--ui-action-bg)',
              color: 'var(--ui-text-secondary)',
            }}
          >
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        <div
          className="p-4 flex flex-col"
          style={{ height: 'calc(100% - 52px)' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
