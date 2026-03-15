"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDownIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type MultiSelectFilterProps = {
  label: string
  name: string
  options: readonly (string | { value: string; label: string })[]
  selectedValues: string[]
  onSelectedValuesChange?: (values: string[]) => void
}

export function MultiSelectFilter({
  label,
  name,
  options,
  selectedValues,
  onSelectedValuesChange,
}: MultiSelectFilterProps) {
  const [search, setSearch] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [uncontrolledSelected, setUncontrolledSelected] = useState(
    new Set(selectedValues)
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selected = onSelectedValuesChange
    ? new Set(selectedValues)
    : uncontrolledSelected

  const normalizedOptions = useMemo(
    () =>
      options.map((option) =>
        typeof option === "string"
          ? { value: option, label: option }
          : option
      ),
    [options]
  )

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [])

  useEffect(() => {
    const form = containerRef.current?.closest("form")
    if (!form) {
      return
    }

    function handleSubmit() {
      setIsOpen(false)
    }

    form.addEventListener("submit", handleSubmit)

    return () => {
      form.removeEventListener("submit", handleSubmit)
    }
  }, [])

  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return normalizedOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedSearch)
    )
  }, [normalizedOptions, search])

  function toggleValue(value: string) {
    const updateSelected = onSelectedValuesChange
      ? (updater: (current: Set<string>) => Set<string>) => {
          const next = updater(new Set(selectedValues))
          onSelectedValuesChange(Array.from(next))
        }
      : setUncontrolledSelected

    updateSelected((current) => {
      const next = new Set(current)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }

  function clearFilter(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    const form = event.currentTarget.closest("form")
    setSearch("")
    if (onSelectedValuesChange) {
      onSelectedValuesChange([])
    } else {
      setUncontrolledSelected(new Set())
    }
    setIsOpen(false)
    requestAnimationFrame(() => {
      form?.requestSubmit()
    })
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return
    }

    if (filteredOptions.length === 1) {
      event.preventDefault()
      const [onlyOption] = filteredOptions
      if (onSelectedValuesChange) {
        onSelectedValuesChange(Array.from(new Set(selectedValues).add(onlyOption.value)))
      } else {
        setUncontrolledSelected((current) => new Set(current).add(onlyOption.value))
      }
      setSearch("")
      setIsOpen(false)
      return
    }

    if (selected.size > 0) {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setIsOpen(true)
          }}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={`Search ${label.toLowerCase()}`}
          className={search || selected.size > 0 ? "pr-10" : undefined}
        />
        {search || selected.size > 0 ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()} filter`}
            className="absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={clearFilter}
          >
            <XIcon className="size-3" />
          </button>
        ) : null}
      </div>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="truncate">
            {selected.size > 0 ? `${selected.size} selected` : `Choose ${label.toLowerCase()}`}
          </span>
          <ChevronDownIcon className="size-4" />
        </Button>

        {isOpen ? (
          <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-background p-2 shadow-lg">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No matches
              </div>
            ) : null}
            {filteredOptions.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selected.has(option.value)}
                  onCheckedChange={() => toggleValue(option.value)}
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      {Array.from(selected).map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  )
}
