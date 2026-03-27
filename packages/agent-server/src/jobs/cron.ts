/**
 * Cron expression parser — shared by Scheduler (skills) and JobManager (jobs).
 *
 * 5-field format: minute hour day-of-month month day-of-week
 * Supports: *, *\/N (step), N-M (range), N,M,O (list)
 */

function parseField(spec: string, min: number, max: number): number[] {
  const values: number[] = []
  for (const part of spec.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.push(i)
    } else if (part.startsWith('*/')) {
      const step = Number.parseInt(part.slice(2))
      for (let i = min; i <= max; i += step) values.push(i)
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      for (let i = a; i <= b; i++) values.push(i)
    } else {
      values.push(Number.parseInt(part))
    }
  }
  return values.sort((a, b) => a - b)
}

/**
 * Parse a 5-field cron expression and return the next Date it fires.
 * Returns null if the expression is invalid or no match within 366 days.
 */
export function getNextCronTime(cron: string, after: Date = new Date()): Date | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minSpec, hourSpec, domSpec, monSpec, dowSpec] = parts

  const minutes = parseField(minSpec, 0, 59)
  const hours = parseField(hourSpec, 0, 23)
  const doms = parseField(domSpec, 1, 31)
  const months = parseField(monSpec, 1, 12)
  const dows = parseField(dowSpec, 0, 6) // 0 = Sunday

  // Search forward from `after` for up to 366 days
  const candidate = new Date(after.getTime() + 60_000) // start 1 minute after
  candidate.setSeconds(0, 0)

  for (let i = 0; i < 366 * 24 * 60; i++) {
    const m = candidate.getMinutes()
    const h = candidate.getHours()
    const dom = candidate.getDate()
    const mon = candidate.getMonth() + 1
    const dow = candidate.getDay()

    if (
      minutes.includes(m) &&
      hours.includes(h) &&
      doms.includes(dom) &&
      months.includes(mon) &&
      dows.includes(dow)
    ) {
      return candidate
    }

    candidate.setMinutes(candidate.getMinutes() + 1)
  }

  return null
}

/**
 * Validate a cron expression. Returns true if it can produce a future run.
 */
export function isValidCron(cron: string): boolean {
  return getNextCronTime(cron) !== null
}
