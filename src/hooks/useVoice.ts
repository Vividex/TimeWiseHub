// src/hooks/useVoice.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API types are not in all TS DOM libs — declare minimally here
interface SpeechRecognitionResult { readonly 0: { transcript: string } }
interface SpeechRecognitionResultList { readonly 0: SpeechRecognitionResult }
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList }
interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
interface SpeechRecognitionCtor {
  new(): SpeechRecognitionInstance
}

// Ordered by preference — neural/natural voices first, then decent fallbacks
const PREFERRED_VOICES = [
  // Edge on Windows — best quality
  'Microsoft Natasha Online (Natural) - English (Australia)',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Jenny Online (Natural) - English (United States)',
  'Microsoft Ryan Online (Natural) - English (United Kingdom)',
  'Microsoft Guy Online (Natural) - English (United States)',
  // Chrome network voices — sound natural, require internet
  'Google UK English Female',
  'Google US English',
  'Google UK English Male',
  // Local Windows voices — Australian first
  'Microsoft Catherine - English (Australia)',
  'Microsoft James - English (Australia)',
  'Microsoft Hazel - English (United Kingdom)',
  'Microsoft George - English (United Kingdom)',
  // macOS
  'Samantha',
  'Karen',
  'Daniel',
]

function pickVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  for (const name of PREFERRED_VOICES) {
    const match = voices.find(v => v.name === name)
    if (match) return match
  }
  return voices.find(v => ['en-AU', 'en-US', 'en-GB'].includes(v.lang)) ?? null
}

type VoiceState = 'idle' | 'listening' | 'error'

export function useVoice({
  onTranscript,
  enabled,
}: {
  onTranscript: (text: string) => void
  enabled: boolean
}) {
  const [state, setState] = useState<VoiceState>('idle')
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SR = typeof window !== 'undefined' ? (w.SpeechRecognition ?? w.webkitSpeechRecognition) : undefined
    setSupported(!!SR)
  }, [])

  const startListening = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-AU'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) onTranscript(transcript.trim())
      setState('idle')
    }
    recognition.onerror = () => setState('error')
    recognition.onend = () => setState('idle')

    recognitionRef.current = recognition
    recognition.start()
    setState('listening')
  }, [onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setState('idle')
  }, [])

  function speak(text: string) {
    if (!enabled || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'en-AU'
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  return { state, supported, startListening, stopListening, speak, stopSpeaking }
}
