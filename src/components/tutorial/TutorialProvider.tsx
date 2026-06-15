'use client'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { TutorialStep, UserRole } from '@/lib/tutorial-steps'
import { getStepsForRole } from '@/lib/tutorial-steps'

type TutorialPhase = 'welcome' | 'tour' | 'tips' | 'done'

type TutorialContextValue = {
  phase: TutorialPhase
  currentStep: TutorialStep | null
  stepIndex: number
  totalSteps: number
  activeTarget: string | null
  advance: () => void
  skip: () => void
}

const TutorialContext = createContext<TutorialContextValue>({
  phase: 'done',
  currentStep: null,
  stepIndex: 0,
  totalSteps: 0,
  activeTarget: null,
  advance: () => {},
  skip: () => {},
})

export function useTutorial() { return useContext(TutorialContext) }

async function writeDismissed() {
  await fetch('/api/tutorial/dismiss', { method: 'POST' })
}

export default function TutorialProvider({
  children,
  initialDismissed,
  role,
}: {
  children: ReactNode
  initialDismissed: boolean
  role: UserRole
}) {
  const steps = getStepsForRole(role)
  const [phase, setPhase] = useState<TutorialPhase>(initialDismissed ? 'done' : 'welcome')
  const [stepIndex, setStepIndex] = useState(0)

  const advance = useCallback(() => {
    if (phase === 'welcome') {
      setPhase('tour')
      setStepIndex(0)
    } else if (phase === 'tour') {
      if (stepIndex < steps.length - 1) {
        setStepIndex(i => i + 1)
      } else {
        setPhase('tips')
      }
    } else if (phase === 'tips') {
      writeDismissed()
      setPhase('done')
    }
  }, [phase, stepIndex, steps.length])

  const skip = useCallback(() => {
    writeDismissed()
    setPhase('done')
  }, [])

  const currentStep = phase === 'tour' ? steps[stepIndex] ?? null : null
  const activeTarget = currentStep?.target ?? null

  return (
    <TutorialContext.Provider value={{ phase, currentStep, stepIndex, totalSteps: steps.length, activeTarget, advance, skip }}>
      {children}
    </TutorialContext.Provider>
  )
}
