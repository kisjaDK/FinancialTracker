"use client"

import { InfoIcon } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import { renderRichTextToHtml } from "@/lib/rich-text"

type GuidanceHoverProps = {
  content: string | null | undefined
  label?: string
  className?: string
}

export function GuidanceHover({
  content,
  label = "Guidance",
  className,
}: GuidanceHoverProps) {
  const html = renderRichTextToHtml(content)

  if (!html) {
    return null
  }

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full border transition-colors brand-icon-button",
            className
          )}
          aria-label={label}
        >
          <InfoIcon className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 border-border bg-popover">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-800 dark:text-rose-300">
            {label}
          </div>
          <div
            className="max-w-none text-sm leading-6 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:ml-4 [&_li]:list-disc [&_li]:pl-1 [&_p]:my-2 [&_ul]:my-2"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
