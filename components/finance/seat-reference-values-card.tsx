"use client"

import { useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { SeatReferenceValueType } from "@prisma/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type SeatReferenceValue = {
  id: string
  type: SeatReferenceValueType
  value: string
}

type SeatReferenceValuesCardProps = {
  activeYear: number
  title: string
  description: string
  type: SeatReferenceValueType
  values: SeatReferenceValue[]
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

export function SeatReferenceValuesCard({
  activeYear,
  title,
  description,
  type,
  values,
}: SeatReferenceValuesCardProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function saveValue() {
    setIsSaving(true)

    try {
      await fetchJson("/api/seat-reference-values", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          year: activeYear,
          type,
          value: draftValue,
        }),
      })
      toast.success(editingId ? `${title} updated` : `${title} created`)
      setEditingId(null)
      setDraftValue("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteValue(id: string) {
    setDeletingId(id)

    try {
      await fetchJson("/api/seat-reference-values", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          id,
        }),
      })
      toast.success(`${title} deleted`)
      if (editingId === id) {
        setEditingId(null)
        setDraftValue("")
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setDeletingId(null)
    }
  }

  async function downloadCsv() {
    try {
      const response = await fetch(
        `/api/admin/seat-reference-values/${type.toLowerCase()}?year=${activeYear}`
      )
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || "Export failed")
      }

      const blob = new Blob([await response.text()], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${type.toLowerCase()}-values-${activeYear}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed")
    }
  }

  async function importFile(file: File) {
    const formData = new FormData()
    formData.append("year", String(activeYear))
    formData.append("file", file)

    try {
      const body = await fetchJson(`/api/admin/seat-reference-values/${type.toLowerCase()}`, {
        method: "POST",
        body: formData,
      })
      toast.success(
        `${body.importedCount} ${title.toLowerCase()} row${body.importedCount === 1 ? "" : "s"} imported`
      )
      if (fileRef.current) {
        fileRef.current.value = ""
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="brand-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                {isOpen ? "Hide" : "Open"}
                <ChevronDown
                  className={cn("ml-2 size-4 transition-transform", isOpen && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void downloadCsv()}>
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
            </div>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void importFile(file)
                }
              }}
            />
            <div className="flex gap-2">
              <Input
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                placeholder={`Add ${title.toLowerCase()}`}
              />
              <Button
                disabled={isSaving || draftValue.trim().length === 0}
                onClick={() => void saveValue()}
              >
                {editingId ? "Save" : "Add"}
              </Button>
              {editingId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingId(null)
                    setDraftValue("")
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {values.map((value) => (
                  <TableRow key={value.id}>
                    <TableCell>{value.value}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(value.id)
                            setDraftValue(value.value)
                            setIsOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === value.id}
                          onClick={() => void deleteValue(value.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {values.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No values yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
