function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function renderInlineMarkdown(value: string) {
  const escaped = escapeHtml(value)

  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*(?!\s)(.+?)(?<!\s)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_(?!\s)(.+?)(?<!\s)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
}

export function renderRichTextToHtml(value: string | null | undefined) {
  const normalized = value?.replace(/\r\n/g, "\n").trim()

  if (!normalized) {
    return ""
  }

  const lines = normalized.split("\n")
  const blocks: string[] = []
  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return
    }

    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br />")}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (listItems.length === 0) {
      return
    }

    blocks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`)
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const listMatch = line.match(/^[-*]\s+(.+)$/)

    if (line.trim().length === 0) {
      flushParagraph()
      flushList()
      continue
    }

    if (listMatch) {
      flushParagraph()
      listItems.push(renderInlineMarkdown(listMatch[1]))
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks.join("")
}

export function hasRichTextContent(value: string | null | undefined) {
  return renderRichTextToHtml(value).length > 0
}

export function getRichTextPlainText(value: string | null | undefined) {
  return value
    ?.replace(/\r\n/g, "\n")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim() ?? ""
}
