type CsvRow = Record<string, string>

function detectDelimiter(line: string) {
  const commaCount = (line.match(/,/g) ?? []).length
  const semicolonCount = (line.match(/;/g) ?? []).length

  return semicolonCount > commaCount ? ";" : ","
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

export function parseCsv(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
  if (!normalized) {
    return []
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/^\uFEFF/, ""))
    .filter((line) => line.trim().length > 0)
  if (lines.length < 2) {
    return []
  }

  let headerIndex = 0
  let delimiter = detectDelimiter(lines[headerIndex])
  let headers = parseCsvLine(lines[headerIndex], delimiter)

  while (
    headerIndex < lines.length - 1 &&
    headers.filter((header) => header.trim().length > 0).length <= 1
  ) {
    headerIndex += 1
    delimiter = detectDelimiter(lines[headerIndex])
    headers = parseCsvLine(lines[headerIndex], delimiter)
  }

  const normalizedHeaders = headers.map((header) =>
    header.trim().replace(/\s+/g, " ")
  )

  return lines.slice(headerIndex + 1).map<CsvRow>((line) => {
    const cells = parseCsvLine(line, delimiter)
    return normalizedHeaders.reduce<CsvRow>((record, header, index) => {
      record[header] = (cells[index] ?? "").trim()
      return record
    }, {})
  })
}
