import { daysUntil } from '@/lib/expenses'
import type { Vehicle } from '@/types/vehicles'

export const SERVICE_DUE_DATE_WINDOW_DAYS = 30
export const SERVICE_DUE_KM_WINDOW = 500
export const REGO_DUE_WINDOW_DAYS = 30

export type VehicleStatus = 'ok' | 'due_soon' | 'overdue'

export function regoStatus(vehicle: Pick<Vehicle, 'rego_expiry_date'>): VehicleStatus {
  if (!vehicle.rego_expiry_date) return 'ok'
  const days = daysUntil(vehicle.rego_expiry_date)
  if (days < 0) return 'overdue'
  if (days <= REGO_DUE_WINDOW_DAYS) return 'due_soon'
  return 'ok'
}

export function serviceStatus(
  vehicle: Pick<Vehicle, 'next_service_due_date' | 'next_service_due_km' | 'current_odometer_km'>,
): VehicleStatus {
  let status: VehicleStatus = 'ok'

  if (vehicle.next_service_due_date) {
    const days = daysUntil(vehicle.next_service_due_date)
    if (days < 0) return 'overdue'
    if (days <= SERVICE_DUE_DATE_WINDOW_DAYS) status = 'due_soon'
  }

  if (vehicle.next_service_due_km != null && vehicle.current_odometer_km != null) {
    const kmRemaining = vehicle.next_service_due_km - vehicle.current_odometer_km
    if (kmRemaining < 0) return 'overdue'
    if (kmRemaining <= SERVICE_DUE_KM_WINDOW) status = 'due_soon'
  }

  return status
}

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  ok: 'OK',
  due_soon: 'Due soon',
  overdue: 'Overdue',
}

export const STATUS_COLOUR: Record<VehicleStatus, string> = {
  ok: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400',
  due_soon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  overdue: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
}
