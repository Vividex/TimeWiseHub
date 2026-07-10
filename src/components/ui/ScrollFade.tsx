'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Wraps scrollable content: hides the native scrollbar and shows a gradient fade at whichever
 * edge still has more content past it, driven by real scroll position. `fadeFrom` must match the
 * content's own background (a fade blends into the surface behind it, not into nothing) — pass
 * the same from-color classes you'd use on a solid bg, e.g. "from-white dark:from-slate-900".
 */
export default function ScrollFade({
  children,
  wrapperClassName = '',
  className = '',
  style,
  fadeFrom = 'from-white dark:from-slate-900',
  axis = 'y',
  as: Wrapper = 'div',
}: {
  children: ReactNode
  wrapperClassName?: string
  className?: string
  style?: React.CSSProperties
  fadeFrom?: string
  axis?: 'y' | 'x'
  /** Semantic tag for the outer wrapper — use when replacing a landmark element like <aside>/<main>. */
  as?: 'div' | 'aside' | 'main' | 'section' | 'nav'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  const isY = axis === 'y'

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (isY) {
      setAtStart(el.scrollTop <= 2)
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
    } else {
      setAtStart(el.scrollLeft <= 2)
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2)
    }
  }, [isY])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  return (
    <Wrapper className={`relative min-h-0 overflow-hidden ${wrapperClassName}`}>
      <div
        ref={ref}
        onScroll={update}
        style={style}
        className={`no-scrollbar h-full w-full ${isY ? 'overflow-y-auto overflow-x-hidden' : 'overflow-x-auto overflow-y-hidden'} ${className}`}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute transition-opacity duration-150 ${
          isY ? `inset-x-0 top-0 h-8 bg-gradient-to-b ${fadeFrom}` : `inset-y-0 left-0 w-8 bg-gradient-to-r ${fadeFrom}`
        } to-transparent ${atStart ? 'opacity-0' : 'opacity-100'}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute transition-opacity duration-150 ${
          isY ? `inset-x-0 bottom-0 h-8 bg-gradient-to-t ${fadeFrom}` : `inset-y-0 right-0 w-8 bg-gradient-to-l ${fadeFrom}`
        } to-transparent ${atEnd ? 'opacity-0' : 'opacity-100'}`}
      />
    </Wrapper>
  )
}
