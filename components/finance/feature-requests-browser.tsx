"use client"

import { useEffect, useMemo, useState } from "react"
import { Flag, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { FinancePageIntro } from "@/components/finance/page-intro"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"

type FeatureRequestItem = {
  id: string
  title: string
  userStory: string
  problemContext: string
  createdByName: string
  createdByEmail: string
  createdAt: string
  updatedAt: string
  votesCount: number
  hasVoted: boolean
  isHidden: boolean
  deletionRequestedAt: string | null
  canEdit: boolean
  canRequestDeletion: boolean
  canHide: boolean
  canDelete: boolean
}

type FeatureRequestBrowserProps = {
  featureRequests: FeatureRequestItem[]
}

type FeatureRequestFormState = {
  title: string
  userStoryActor: string
  userStoryCapability: string
  userStoryBenefit: string
  problemContext: string
}

const EMPTY_FORM: FeatureRequestFormState = {
  title: "",
  userStoryActor: "",
  userStoryCapability: "",
  userStoryBenefit: "",
  problemContext: "",
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

function sortFeatureRequests(items: FeatureRequestItem[]) {
  return [...items].sort((left, right) => {
    if (left.votesCount !== right.votesCount) {
      return right.votesCount - left.votesCount
    }

    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
  })
}

function formatDate(value: string | null) {
  if (!value) {
    return null
  }

  return new Date(value).toLocaleString()
}

function buildUserStory(form: FeatureRequestFormState) {
  return [
    `As a ${form.userStoryActor.trim()}`,
    `I want ${form.userStoryCapability.trim()}`,
    `So that ${form.userStoryBenefit.trim()}`,
  ].join("\n")
}

function parseUserStory(userStory: string) {
  const lines = userStory
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const actorLine = lines.find((line) => /^as a\s+/i.test(line)) ?? ""
  const capabilityLine = lines.find((line) => /^i want\s+/i.test(line)) ?? ""
  const benefitLine = lines.find((line) => /^so that\s+/i.test(line)) ?? ""

  return {
    userStoryActor: actorLine.replace(/^as a\s+/i, "").trim(),
    userStoryCapability: capabilityLine.replace(/^i want\s+/i, "").trim(),
    userStoryBenefit: benefitLine.replace(/^so that\s+/i, "").trim(),
  }
}

export function FeatureRequestsBrowser({
  featureRequests: initialFeatureRequests,
}: FeatureRequestBrowserProps) {
  const [featureRequests, setFeatureRequests] = useState(() =>
    sortFeatureRequests(initialFeatureRequests)
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFeatureRequests[0]?.id ?? null
  )
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FeatureRequestFormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null)
  const [busyVoteId, setBusyVoteId] = useState<string | null>(null)

  useEffect(() => {
    setFeatureRequests(sortFeatureRequests(initialFeatureRequests))
  }, [initialFeatureRequests])

  useEffect(() => {
    if (featureRequests.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null)
      }
      return
    }

    if (!selectedId || !featureRequests.some((request) => request.id === selectedId)) {
      setSelectedId(featureRequests[0].id)
    }
  }, [featureRequests, selectedId])

  const selectedRequest = useMemo(
    () => featureRequests.find((request) => request.id === selectedId) ?? null,
    [featureRequests, selectedId]
  )
  const userStoryPreview = useMemo(() => buildUserStory(form), [form])

  function updateRequest(nextRequest: FeatureRequestItem) {
    setFeatureRequests((current) =>
      sortFeatureRequests(
        current.some((request) => request.id === nextRequest.id)
          ? current.map((request) =>
              request.id === nextRequest.id ? nextRequest : request
            )
          : [nextRequest, ...current]
      )
    )
  }

  function openCreateDialog() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setIsEditorOpen(true)
  }

  function openEditDialog(request: FeatureRequestItem) {
    setEditingId(request.id)
    setForm({
      title: request.title,
      ...parseUserStory(request.userStory),
      problemContext: request.problemContext,
    })
    setIsEditorOpen(true)
  }

  async function saveFeatureRequest() {
    setIsSaving(true)

    try {
      if (editingId) {
        const body = await fetchJson(`/api/feature-requests/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "edit",
            title: form.title,
            userStory: buildUserStory(form),
            problemContext: form.problemContext,
          }),
        })

        updateRequest(body.featureRequest as FeatureRequestItem)
        toast.success("Feature request updated")
      } else {
        const body = await fetchJson("/api/feature-requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title,
            userStory: buildUserStory(form),
            problemContext: form.problemContext,
          }),
        })

        updateRequest(body.featureRequest as FeatureRequestItem)
        setSelectedId((body.featureRequest as FeatureRequestItem).id)
        toast.success("Feature request created")
      }

      setIsEditorOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleVote(request: FeatureRequestItem) {
    setBusyVoteId(request.id)

    try {
      const body = await fetchJson(`/api/feature-requests/${request.id}/vote`, {
        method: "POST",
      })

      updateRequest(body.featureRequest as FeatureRequestItem)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vote failed")
    } finally {
      setBusyVoteId(null)
    }
  }

  async function requestDeletion(request: FeatureRequestItem) {
    try {
      const body = await fetchJson(`/api/feature-requests/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "requestDeletion",
        }),
      })

      updateRequest(body.featureRequest as FeatureRequestItem)
      toast.success("Deletion request submitted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete request failed")
    }
  }

  async function toggleVisibility(request: FeatureRequestItem) {
    try {
      const body = await fetchJson(`/api/feature-requests/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "visibility",
          isHidden: !request.isHidden,
        }),
      })

      updateRequest(body.featureRequest as FeatureRequestItem)
      toast.success(request.isHidden ? "Feature request unhidden" : "Feature request hidden")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Visibility update failed")
    }
  }

  async function deleteFeatureRequest(requestId: string) {
    try {
      await fetchJson(`/api/feature-requests/${requestId}`, {
        method: "DELETE",
      })

      setFeatureRequests((current) =>
        current.filter((request) => request.id !== requestId)
      )
      toast.success("Feature request deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      <FinancePageIntro
        title="Feature Requests"
        subtitle="Collect, vote on, and review improvements for budgeting, staffing, forecasts, actuals, and other financial tracker workflows."
      />

      <Card className="brand-card">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Backlog overview</CardTitle>
            <CardDescription>
              Vote once per tracker improvement. Click any row to inspect the full request below.
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            New feature request
          </Button>
        </CardHeader>
        <CardContent>
          {featureRequests.length === 0 ? (
            <Empty className="border-border/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Lightbulb className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No feature requests yet</EmptyTitle>
                <EmptyDescription>
                  Start the backlog with an improvement idea for budgeting, forecasting,
                  actuals, staffing, or tracker reporting.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={openCreateDialog}>Create the first request</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Created by</TableHead>
                    <TableHead className="w-28 text-right">Votes</TableHead>
                    <TableHead className="w-36 text-right">Your vote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureRequests.map((request) => {
                    const isSelected = request.id === selectedId

                    return (
                      <TableRow
                        key={request.id}
                        data-state={isSelected ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedId(request.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{request.title}</span>
                            {request.isHidden ? (
                              <Badge variant="secondary">Hidden</Badge>
                            ) : null}
                            {request.deletionRequestedAt ? (
                              <Badge variant="outline">Deletion requested</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{request.createdByName}</span>
                            <span className="text-xs text-muted-foreground">
                              {request.createdByEmail}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {request.votesCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <Toggle
                            pressed={request.hasVoted}
                            variant="outline"
                            size="sm"
                            aria-label={
                              request.hasVoted
                                ? `Remove vote from ${request.title}`
                                : `Vote for ${request.title}`
                            }
                            disabled={busyVoteId === request.id}
                            onPressedChange={() => {
                              void toggleVote(request)
                            }}
                            onClick={(event) => {
                              event.stopPropagation()
                            }}
                          >
                            <Flag className="size-4" />
                            {request.hasVoted ? "Voted" : "Vote"}
                          </Toggle>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRequest ? (
        <Card className="brand-card">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{selectedRequest.title}</CardTitle>
                  {selectedRequest.isHidden ? (
                    <Badge variant="secondary">Hidden from users</Badge>
                  ) : null}
                  {selectedRequest.deletionRequestedAt ? (
                    <Badge variant="outline">Deletion requested</Badge>
                  ) : null}
                </div>
                <CardDescription>
                  Submitted by {selectedRequest.createdByName} ({selectedRequest.createdByEmail})
                </CardDescription>
                <div className="text-xs text-muted-foreground">
                  <span>Created {formatDate(selectedRequest.createdAt)}</span>
                  <span className="mx-2">•</span>
                  <span>Updated {formatDate(selectedRequest.updatedAt)}</span>
                  {selectedRequest.deletionRequestedAt ? (
                    <>
                      <span className="mx-2">•</span>
                      <span>
                        Deletion requested {formatDate(selectedRequest.deletionRequestedAt)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedRequest.canEdit ? (
                  <Button
                    variant="outline"
                    onClick={() => openEditDialog(selectedRequest)}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                ) : null}
                {selectedRequest.canRequestDeletion ? (
                  <Button
                    variant="outline"
                    disabled={Boolean(selectedRequest.deletionRequestedAt)}
                    onClick={() => {
                      void requestDeletion(selectedRequest)
                    }}
                  >
                    Request deletion
                  </Button>
                ) : null}
                {selectedRequest.canHide ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      void toggleVisibility(selectedRequest)
                    }}
                  >
                    {selectedRequest.isHidden ? "Unhide" : "Hide"}
                  </Button>
                ) : null}
                {selectedRequest.canDelete ? (
                  <Button
                    variant="destructive"
                    onClick={() => setIsDeletingId(selectedRequest.id)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  User Story
                </h2>
                <div className="rounded-2xl border border-border/70 bg-background/50 p-4 text-sm leading-6 whitespace-pre-wrap">
                  {selectedRequest.userStory}
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Problem / Context
                </h2>
                <div className="rounded-2xl border border-border/70 bg-background/50 p-4 text-sm leading-6 whitespace-pre-wrap">
                  {selectedRequest.problemContext}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
                <div className="text-sm font-medium text-muted-foreground">
                  Current support
                </div>
                <div className="mt-2 text-4xl font-semibold tracking-tight">
                  {selectedRequest.votesCount}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Each user can add or remove one vote for this feature request.
                </p>
                <Button
                  className="mt-4 w-full"
                  variant={selectedRequest.hasVoted ? "outline" : "default"}
                  disabled={busyVoteId === selectedRequest.id}
                  onClick={() => {
                    void toggleVote(selectedRequest)
                  }}
                >
                  <Flag className="size-4" />
                  {selectedRequest.hasVoted ? "Remove my vote" : "Add my vote"}
                </Button>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/50 p-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Request template</p>
                <p className="mt-3">
                  Include a short title, a user story in the format
                  {" "}
                  <span className="font-medium">
                    As a / I want / So that
                  </span>
                  , and context covering the current limitation, user pain point,
                  and business impact for the financial tracker.
                </p>
              </div>
            </section>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit feature request" : "New feature request"}
            </DialogTitle>
            <DialogDescription>
              Capture the capability, a structured user story, and why the request
              matters. Votes always start at zero.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <label htmlFor="feature-request-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="feature-request-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Let users export tracker and forecast data to CSV"
              />
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="space-y-1">
                <label htmlFor="feature-request-user-story-actor" className="text-sm font-medium">
                  User Story
                </label>
                <p className="text-sm text-muted-foreground">
                  Fill in the three blanks and the full user story is generated automatically.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feature-request-user-story-actor"
                  className="text-sm font-medium text-muted-foreground"
                >
                  As a
                </label>
                <Input
                  id="feature-request-user-story-actor"
                  value={form.userStoryActor}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      userStoryActor: event.target.value,
                    }))
                  }
                  placeholder="finance manager reviewing budget changes"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feature-request-user-story-capability"
                  className="text-sm font-medium text-muted-foreground"
                >
                  I want
                </label>
                <Input
                  id="feature-request-user-story-capability"
                  value={form.userStoryCapability}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      userStoryCapability: event.target.value,
                    }))
                  }
                  placeholder="to export filtered tracker results and forecast totals to CSV"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feature-request-user-story-benefit"
                  className="text-sm font-medium text-muted-foreground"
                >
                  So that
                </label>
                <Input
                  id="feature-request-user-story-benefit"
                  value={form.userStoryBenefit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      userStoryBenefit: event.target.value,
                    }))
                  }
                  placeholder="I can share finance-ready reporting without rebuilding it manually in Excel"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Generated user story</div>
                <div className="rounded-xl border border-border/70 bg-background p-4 text-sm leading-6 whitespace-pre-wrap">
                  {userStoryPreview}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="feature-request-context" className="text-sm font-medium">
                Problem / Context
              </label>
              <Textarea
                id="feature-request-context"
                value={form.problemContext}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    problemContext: event.target.value,
                  }))
                }
                className="min-h-40"
                placeholder={
                  "Users currently need to copy tracker data manually into spreadsheets when they want to share filtered budget, staffing, or forecast views. That is slow, error-prone, and makes recurring finance reporting harder to standardize."
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isSaving} onClick={() => void saveFeatureRequest()}>
              {editingId ? "Save changes" : "Create request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeletingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsDeletingId(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete feature request?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the request and all recorded votes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                if (!isDeletingId) {
                  return
                }

                void deleteFeatureRequest(isDeletingId)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
