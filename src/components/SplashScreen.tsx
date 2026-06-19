'use client'

import { useEffect, useState } from 'react'

const SPIN_MS = 1600
const HOLD_MS = 1000
const FADE_MS = 400

export default function SplashScreen({
  minDurationMs = 1500,
  onDone,
}: {
  minDurationMs?: number
  onDone?: () => void
}) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeStart = Math.max(minDurationMs, SPIN_MS + HOLD_MS)
    const t = setTimeout(() => setFading(true), fadeStart)

    return () => clearTimeout(t)
  }, [minDurationMs])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      onTransitionEnd={(e) => {
        if (fading && e.propertyName === 'opacity') onDone?.()
      }}
      style={{ background: '#020617', transitionDuration: `${FADE_MS}ms` }}
    >
      <style>{`
        @keyframes tw-coin-spin {
          from { transform: rotateY(-1080deg); }
          to { transform: rotateY(0deg); }
        }
        .tw-coin { animation: tw-coin-spin 1.6s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .tw-coin { animation: none; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {/* TW coin with soft glow behind it */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 460,
              height: 460,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(56,189,248,0.85) 0%, rgba(37,99,235,0.55) 42%, rgba(2,6,23,0) 72%)',
              filter: 'blur(18px)',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
          <div style={{ perspective: '1400px', position: 'relative', zIndex: 1 }}>
            <div
              className="tw-coin"
              style={{ position: 'relative', width: 285, height: 285, transformStyle: 'preserve-3d' }}
            >
              <img
                src="/logo.png"
                alt="TimeWiseHub"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: '50%',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(0deg)',
                  filter: 'brightness(0) invert(1) drop-shadow(0 0 16px rgba(56,189,248,1)) drop-shadow(0 0 4px white)',
                }}
              />
              <img
                src="/logo.png"
                alt="TimeWiseHub"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: '50%',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  filter: 'brightness(0) invert(1) drop-shadow(0 0 16px rgba(56,189,248,1)) drop-shadow(0 0 4px white)',
                }}
              />
            </div>
          </div>
        </div>
        {/* powered by vividex */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#94a3b8' }}>
            powered by
          </span>
          <div style={{ width: 300, height: 44, overflow: 'hidden' }}>
            <img
              src="/vividex.png"
              alt="vividex"
              style={{ display: 'block', width: 300, marginTop: -46, mixBlendMode: 'screen' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
