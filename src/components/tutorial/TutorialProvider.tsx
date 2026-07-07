'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { getStepsForProfile } from '@/lib/tutorial/steps'
import type { TutorialStep, TutorialContext as StepContext } from '@/lib/tutorial/types'
import type { Terminology } from '@/lib/workspace-profiles/types'

type Phase = 'welcome' | 'steps' | 'complete' | 'done'

type TutorialContextValue = {
  phase: Phase
  currentStep: TutorialStep | null
  stepIndex: number
  totalSteps: number
  context: StepContext
  start: () => void
  advanceStep: (ctx?: StepContext) => void
  skipStep: () => void
  skipTutorial: () => void
}

const TutorialContext = createContext<TutorialContextValue>({
  phase: 'done', currentStep: null, stepIndex: 0, totalSteps: 0, context: {},
  start: () => {}, advanceStep: () => {}, skipStep: () => {}, skipTutorial: () => {},
})

export function useTutorial() { return useContext(TutorialContext) }

type InitialState = {
  dismissed: boolean
  startedAt: string | null
  stepIndex: number
  context: StepContext
}

export default function TutorialProvider({
  children, initialState, profileKey, terminology,
}: {
  children: ReactNode
  initialState: InitialState
  profileKey: string
  terminology: Terminology
}) {
  const steps = getStepsForProfile(profileKey, terminology)
  const initialPhase: Phase = initialState.dismissed
    ? 'done'
    : initialState.startedAt
      ? (initialState.stepIndex >= steps.length ? 'complete' : 'steps')
      : 'welcome'

  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [stepIndex, setStepIndex] = useState(initialState.stepIndex)
  const [context, setContext] = useState<StepContext>(initialState.context)

  const start = useCallback(() => {
    fetch('/api/tutorial/start', { method: 'POST' })
    setStepIndex(0)
    setContext({})
    setPhase('steps')
  }, [])

  const advanceStep = useCallback((ctxUpdate?: StepContext) => {
    setStepIndex(i => {
      const next = i + 1
      const mergedContext = ctxUpdate ? { ...context, ...ctxUpdate } : context
      if (ctxUpdate) setContext(mergedContext)
      fetch('/api/tutorial/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex: next, context: ctxUpdate }),
      })
      if (next >= steps.length) setPhase('complete')
      return next
    })
  }, [context, steps.length])

  const skipStep = useCallback(() => { advanceStep() }, [advanceStep])

  const skipTutorial = useCallback(() => {
    fetch('/api/tutorial/dismiss', { method: 'POST' })
    setPhase('done')
  }, [])

  const currentStep = phase === 'steps' ? steps[stepIndex] ?? null : null

  const checkingRef = useRef(false)
  useEffect(() => {
    if (phase !== 'steps' || !currentStep) return

    async function check() {
      if (checkingRef.current) return
      checkingRef.current = true
      try {
        const res = await fetch(`/api/tutorial/check?stepId=${currentStep!.id}`)
        if (res.ok) {
          const data = await res.json() as { done: boolean; context?: StepContext }
          if (data.done) advanceStep(data.context)
        }
      } finally {
        checkingRef.current = false
      }
    }

    const interval = setInterval(check, 5000)
    function onVisible() { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [phase, currentStep, advanceStep])

  return (
    <TutorialContext.Provider value={{
      phase, currentStep, stepIndex, totalSteps: steps.length, context,
      start, advanceStep, skipStep, skipTutorial,
    }}>
      {children}
    </TutorialContext.Provider>
  )
}
