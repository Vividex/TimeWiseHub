import type { Terminology } from '@/lib/workspace-profiles/types'
import { TUTORING_STEPS } from './tutoring'
import { getGenericSteps } from './generic'
import type { TutorialStep } from '../types'

export function getStepsForProfile(profileKey: string, terminology: Terminology): TutorialStep[] {
  return profileKey === 'tutoring' ? TUTORING_STEPS : getGenericSteps(terminology)
}
