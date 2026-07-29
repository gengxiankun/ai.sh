import { type FC, useMemo } from 'react'

type Props = { icon: string; className?: string; style?: React.CSSProperties }

const fallback =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik00IDdWNGgxNnYzIi8+PHBhdGggZD0iTTkgMjBoNiIvPjxwYXRoIGQ9Ik0xMiA0djE2Ii8+PC9zdmc+'

function decodeSvgInner(dataUri: string): string {
  try {
    const b64 = dataUri.split(',')[1]
    const svg = atob(b64)
    const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]
    return inner ?? ''
  } catch {
    return ''
  }
}

export const SkillIcon: FC<Props> = ({ icon, className, style }) => {
  const inner = useMemo(() => decodeSvgInner(icon || fallback), [icon])
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}
