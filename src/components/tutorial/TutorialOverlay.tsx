'use client'
import { useEffect, useRef, useState } from 'react'
import { useTutorial } from './TutorialProvider'

export default function TutorialOverlay() {
  const { phase, currentStep, stepIndex, totalSteps, advance, skip } = useTutorial()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (phase !== 'tour' || !currentStep) { setTargetRect(null); return }

    function measure() {
      const el = document.querySelector(`[data-tutorial="${currentStep!.target}"]`)
      if (el) setTargetRect(el.getBoundingClientRect())
    }

    measure()
    intervalRef.current = setInterval(measure, 200)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phase, currentStep])

  if (phase !== 'tour' || !currentStep) return null

  const CARD_WIDTH = 280

  let cardLeft = targetRect ? targetRect.right + 16 : 0
  let cardTop = targetRect ? targetRect.top : 0
  if (typeof window !== 'undefined' && targetRect && cardLeft + CARD_WIDTH > window.innerWidth - 16) {
    cardLeft = targetRect.left - CARD_WIDTH - 16
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 pointer-events-none" />

      <button onClick={skip}
        className="fixed top-4 right-4 z-[70] rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 backdrop-blur-sm">
        Skip tour
      </button>

      {targetRect && (
        <div
          className="fixed z-[70] pointer-events-none"
          style={{ left: targetRect.right + 4, top: targetRect.top + targetRect.height / 2 - 10 }}
        >
          <style>{`
            @keyframes bounce-x { 0%,100%{transform:translateX(0)} 50%{transform:translateX(6px)} }
            .tutorial-arrow { animation: bounce-x 0.8s ease-in-out infinite; }
          `}</style>
          <div className="tutorial-arrow text-cyan-400 text-lg leading-none">›</div>
        </div>
      )}

      {targetRect && (
        <div
          className="fixed z-[70] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5"
          style={{
            left: cardLeft,
            top: typeof window !== 'undefined' ? Math.max(8, Math.min(cardTop, window.innerHeight - 220)) : cardTop,
            width: CARD_WIDTH,
          }}
        >
          <p className="text-xs font-medium text-cyan-500 mb-1">{stepIndex + 1} of {totalSteps}</p>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">{currentStep.heading}</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">{currentStep.body}</p>
          <button onClick={advance}
            className="w-full rounded-xl bg-cyan-500 py-2 text-sm font-semibold text-white hover:bg-cyan-600">
            {stepIndex < totalSteps - 1 ? 'Next →' : 'Done'}
          </button>
        </div>
      )}

      {targetRect && (
        <style>{`
          [data-tutorial="${currentStep.target}"] {
            position: relative;
            z-index: 60 !important;
            box-shadow: 0 0 0 3px rgb(34 211 238), 0 0 0 6px rgba(34,211,238,0.2) !important;
            border-radius: 12px;
          }
        `}</style>
      )}
    </>
  )
}
