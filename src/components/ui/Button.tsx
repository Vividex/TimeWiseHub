import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'danger-ghost'
type Size = 'default' | 'sm'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30',
  secondary:
    'border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-600',
  danger:
    'bg-gradient-to-b from-red-400 to-red-500 text-white shadow-md shadow-red-500/25 hover:from-red-500 hover:to-red-600 hover:shadow-lg hover:shadow-red-500/30',
  'danger-ghost':
    'border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-500 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-500/10',
}

const SIZE_CLASSES: Record<Size, string> = {
  default: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
}

/**
 * Shared button primitive — gradient fill + tinted shadow + a real active-press
 * state, replacing the flat bg-cyan-500 string that used to be copy-pasted
 * across ~90 files. Renders a plain <button>; pass type="submit" explicitly
 * where a form needs it (default browser behavior otherwise applies).
 */
const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ variant = 'primary', size = 'default', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-150 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export default Button
