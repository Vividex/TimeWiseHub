export type AustralianState = 'ACT' | 'NSW' | 'NT' | 'QLD' | 'SA' | 'TAS' | 'VIC' | 'WA'

export const AU_STATES: { value: AustralianState; label: string }[] = [
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NSW', label: 'New South Wales' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'WA', label: 'Western Australia' },
]

export type PublicHoliday = {
  date: string
  name: string
  state: AustralianState
}

function ymd(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const date = new Date(Date.UTC(year, month - 1, 1))
  const offset = (weekday - date.getUTCDay() + 7) % 7
  date.setUTCDate(1 + offset + (nth - 1) * 7)
  return date.toISOString().slice(0, 10)
}

function firstWeekdayOnOrAfter(year: number, month: number, day: number, weekday: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  const offset = (weekday - date.getUTCDay() + 7) % 7
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function lastWeekday(year: number, month: number, weekday: number) {
  const date = new Date(Date.UTC(year, month, 0))
  const offset = (date.getUTCDay() - weekday + 7) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function observedFixedDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  if (weekday === 6) return ymd(year, month, day + 2)
  if (weekday === 0) return ymd(year, month, day + 1)
  return ymd(year, month, day)
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function push(holidays: PublicHoliday[], state: AustralianState, date: string, name: string) {
  holidays.push({ state, date, name })
}

export function getAustralianPublicHolidays(year: number, state: AustralianState): PublicHoliday[] {
  const holidays: PublicHoliday[] = []
  const easter = easterSunday(year)

  push(holidays, state, observedFixedDate(year, 1, 1), "New Year's Day")
  push(holidays, state, observedFixedDate(year, 1, 26), 'Australia Day')
  push(holidays, state, addDays(easter, -2).toISOString().slice(0, 10), 'Good Friday')
  push(holidays, state, addDays(easter, 1).toISOString().slice(0, 10), 'Easter Monday')
  push(holidays, state, observedFixedDate(year, 4, 25), 'Anzac Day')
  push(holidays, state, observedFixedDate(year, 12, 25), 'Christmas Day')
  push(holidays, state, observedFixedDate(year, 12, 26), 'Boxing Day')

  if (['ACT', 'NSW', 'NT', 'QLD', 'SA', 'VIC'].includes(state)) {
    push(holidays, state, addDays(easter, -1).toISOString().slice(0, 10), 'Easter Saturday')
  }
  if (['ACT', 'NSW', 'NT', 'QLD', 'SA', 'VIC', 'WA'].includes(state)) {
    push(holidays, state, easter.toISOString().slice(0, 10), 'Easter Sunday')
  }

  switch (state) {
    case 'ACT':
      push(holidays, state, nthWeekday(year, 3, 1, 2), 'Canberra Day')
      push(holidays, state, firstWeekdayOnOrAfter(year, 5, 27, 1), 'Reconciliation Day')
      push(holidays, state, nthWeekday(year, 6, 1, 2), "King's Birthday")
      push(holidays, state, nthWeekday(year, 10, 1, 1), 'Labour Day')
      break
    case 'NSW':
      push(holidays, state, nthWeekday(year, 6, 1, 2), "King's Birthday")
      push(holidays, state, nthWeekday(year, 10, 1, 1), 'Labour Day')
      break
    case 'NT':
      push(holidays, state, nthWeekday(year, 5, 1, 1), 'May Day')
      push(holidays, state, nthWeekday(year, 6, 1, 2), "King's Birthday")
      push(holidays, state, nthWeekday(year, 8, 1, 1), 'Picnic Day')
      break
    case 'QLD':
      push(holidays, state, nthWeekday(year, 5, 1, 1), 'Labour Day')
      push(holidays, state, nthWeekday(year, 10, 1, 1), "King's Birthday")
      break
    case 'SA':
      push(holidays, state, nthWeekday(year, 3, 1, 2), 'Adelaide Cup Day')
      push(holidays, state, nthWeekday(year, 6, 1, 2), "King's Birthday")
      push(holidays, state, nthWeekday(year, 10, 1, 1), 'Labour Day')
      break
    case 'TAS':
      push(holidays, state, nthWeekday(year, 3, 1, 2), 'Eight Hours Day')
      push(holidays, state, nthWeekday(year, 6, 1, 2), "King's Birthday")
      break
    case 'VIC':
      push(holidays, state, nthWeekday(year, 3, 1, 2), 'Labour Day')
      push(holidays, state, nthWeekday(year, 6, 1, 2), "King's Birthday")
      push(holidays, state, lastWeekday(year, 9, 5), 'Friday before AFL Grand Final')
      push(holidays, state, nthWeekday(year, 11, 2, 1), 'Melbourne Cup')
      break
    case 'WA':
      push(holidays, state, nthWeekday(year, 3, 1, 1), 'Labour Day')
      push(holidays, state, nthWeekday(year, 6, 1, 1), 'Western Australia Day')
      push(holidays, state, lastWeekday(year, 9, 1), "King's Birthday")
      break
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date))
}
