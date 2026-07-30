// 邀请码表单 — create/edit (admin) / verify (用户)
import { type FC, useState, useEffect } from 'react'
import { BottomSheet } from './BottomSheet'
import { createInvite, verifyInvite, updateInvite } from '../../lib/invite'

const inputClass = 'rounded-md border px-2 py-1.5 text-sm outline-none transition-all focus:ring-1 shrink-0'
const btnClass = 'px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer'
const labelClass = 'text-xs font-medium'

type Props = {
  mode: 'create' | 'verify' | 'edit'
  onClose: () => void
  onVerified?: (token: string) => void
  onSaved?: () => void
  initialDescription?: string
  initialQuota?: number
  initialDays?: number
  editId?: number
  editToken?: string
}

export const InviteForm: FC<Props> = ({ mode, onClose, onVerified, onSaved, initialDescription, initialQuota, initialDays, editId, editToken }) => {
  const [description, setDescription] = useState(initialDescription || '')
  const [quota, setQuota] = useState(initialQuota || 5000)
  const [days, setDays] = useState(initialDays || 7)
  const [token, setToken] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { setDescription(initialDescription || ''); setQuota(initialQuota || 5000); setDays(initialDays || 7) }, [initialDescription, initialQuota, initialDays, mode])

  const isEdit = mode === 'edit'

  const handleSubmit = async () => {
    if (quota <= 0) { setError('词元额度必须大于 0'); return }
    setLoading(true)
    try {
      if (isEdit && editId) {
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString()
        await updateInvite(editId, { description: description || editToken || '', token_quota: quota, expires_at: expiresAt })
        onSaved?.()
        onClose()
      } else {
        const t = await createInvite(description || '邀请码', quota, days)
        const url = `${window.location.origin}${window.location.pathname}?invite=${t}`
        setResult(url)
        setError('')
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const handleVerify = async () => {
    if (!token.trim()) { setError('请输入邀请码'); return }
    setLoading(true)
    try {
      const invite = await verifyInvite(token.trim())
      if (!invite) {
        setError('邀请码无效、已过期或额度已用完')
      } else {
        localStorage.setItem('invite_token', token.trim())
        onVerified?.(token.trim())
        onClose()
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const isCreateMode = mode === 'create' || mode === 'edit'

  const title = mode === 'edit' ? '编辑邀请码' : mode === 'verify' ? '验证邀请码' : '新建邀请码'

  return (
    <BottomSheet title={title} onClose={onClose}>
      {mode === 'verify' ? (
        <div className="flex flex-col gap-2">
          <label className={labelClass} style={{ color: 'var(--ui-text)' }}>邀请码</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
            placeholder="请输入邀请码"
            autoFocus
            className={inputClass}
            style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)', width: '100%' }}
          />
          {error && <div className="text-xs" style={{ color: '#ef4444' }}>{error}</div>}
          <div className="flex gap-1.5 mt-1">
            <button onClick={onClose} className={btnClass} style={{ background: 'var(--ui-action-bg)', color: 'var(--ui-text-secondary)' }}>取消</button>
            <button onClick={handleVerify} disabled={loading} className={`${btnClass} text-white`} style={{ background: 'var(--ui-accent)' }}>{loading ? '验证中...' : '验证'}</button>
          </div>
        </div>
      ) : isCreateMode && result ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border p-3 text-xs break-all cursor-pointer select-all" style={{ background: 'var(--ui-action-bg)', borderColor: 'var(--ui-action-border)', color: 'var(--ui-text)' }} onClick={() => navigator.clipboard?.writeText(result)}>
            <div className="font-medium mb-1" style={{ color: 'var(--ui-accent)' }}>点击复制邀请链接</div>
            {result}
          </div>
          <div className="flex justify-end mt-1">
            <button onClick={onClose} className={`${btnClass} text-white`} style={{ background: 'var(--ui-accent)' }}>Done</button>
          </div>
        </div>
      ) : isCreateMode ? (
        <div className="flex flex-col gap-2">
          <label className={labelClass} style={{ color: 'var(--ui-text)' }}>描述</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="备注信息"
            className={inputClass}
            style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)', width: '60%' }}
          />
          <div className="flex gap-2" style={{ width: '60%' }}>
            <div className="flex-1 flex flex-col gap-2">
              <label className={labelClass} style={{ color: 'var(--ui-text)' }}>词元额度</label>
              <input type="number" value={quota} onChange={(e) => setQuota(Number(e.target.value))} min={1}
                className={`${inputClass} w-full`} style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)' }} />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <label className={labelClass} style={{ color: 'var(--ui-text)' }}>有效天数</label>
              <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} min={1}
                className={`${inputClass} w-full`} style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)' }} />
            </div>
          </div>
          {isEdit && editToken && (
            <div className="text-[10px]" style={{ color: 'var(--ui-text-secondary)' }}>Token: {editToken}</div>
          )}
          {error && <div className="text-xs" style={{ color: '#ef4444' }}>{error}</div>}
          <div className="flex gap-1.5 mt-1">
            <button onClick={onClose} className={btnClass} style={{ background: 'var(--ui-action-bg)', color: 'var(--ui-text-secondary)' }}>
              {isEdit ? '舍弃' : '取消'}
            </button>
            <button onClick={handleSubmit} disabled={loading} className={`${btnClass} text-white`} style={{ background: 'var(--ui-accent)' }}>
              {loading ? (isEdit ? '保存中...' : '创建中...') : (isEdit ? '保存' : '创建')}
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
