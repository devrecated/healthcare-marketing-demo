export function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function isoFromUtc(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return isoFromUtc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function monthMatrix(year: number, month: number) {
  const startDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: { date: string; inMonth: boolean }[] = []
  for (let index = 0; index < startDow; index += 1) {
    const date = new Date(Date.UTC(year, month, 1 - (startDow - index)))
    cells.push({
      date: isoFromUtc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      inMonth: false,
    })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: isoFromUtc(year, month, day), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: addDays(cells[cells.length - 1].date, 1), inMonth: false })
  }
  const weeks: { date: string; inMonth: boolean }[][] = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }
  return weeks
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month, 1)))
}
