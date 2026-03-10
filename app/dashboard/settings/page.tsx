"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SettingRowProps {
  label: string
  description: string
  children: React.ReactNode
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="space-y-0.5">
        <span className="text-xs font-medium">{label}</span>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  const [botName, setBotName] = useState("Pandora Bot")
  const [language, setLanguage] = useState("en")
  const [timezone, setTimezone] = useState("utc")
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [slackNotifs, setSlackNotifs] = useState(false)
  const [alertThreshold, setAlertThreshold] = useState("3.0")
  const [weeklyDigest, setWeeklyDigest] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [animatedCharts, setAnimatedCharts] = useState(true)
  const [retentionDays, setRetentionDays] = useState("90")
  const [autoExport, setAutoExport] = useState(false)
  const [exportFormat, setExportFormat] = useState("csv")

  function handleSave() {
    toast.success("Settings saved successfully")
  }

  function handleReset() {
    setBotName("Pandora Bot")
    setLanguage("en")
    setTimezone("utc")
    setTheme("system")
    setEmailNotifs(true)
    setSlackNotifs(false)
    setAlertThreshold("3.0")
    setWeeklyDigest(true)
    setCompactMode(false)
    setAnimatedCharts(true)
    setRetentionDays("90")
    setAutoExport(false)
    setExportFormat("csv")
    toast.info("Settings reset to defaults")
  }

  return (
    <>
      <Header title="Settings" />
      <div className="flex-1 space-y-3 p-4 lg:p-5">

        <div className="grid gap-3 lg:grid-cols-2">
          {/* General */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">General</CardTitle>
              <p className="text-xs text-muted-foreground">Basic application settings</p>
            </CardHeader>
            <CardContent className="space-y-0">
              <SettingRow label="Bot Name" description="Display name for the chatbot">
                <Input
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  className="h-8 w-40 text-xs"
                />
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Language" description="Dashboard display language">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Timezone" description="Used for date displays">
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="est">Eastern</SelectItem>
                    <SelectItem value="pst">Pacific</SelectItem>
                    <SelectItem value="cet">Central EU</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Notifications</CardTitle>
              <p className="text-xs text-muted-foreground">Alert and notification preferences</p>
            </CardHeader>
            <CardContent className="space-y-0">
              <SettingRow label="Email Notifications" description="Receive alerts via email">
                <Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} />
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Slack Notifications" description="Post alerts to Slack channel">
                <Switch checked={slackNotifs} onCheckedChange={setSlackNotifs} />
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Alert Threshold" description="Min satisfaction to trigger alert">
                <Input
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  className="h-8 w-20 text-xs"
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                />
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Weekly Digest" description="Summary email every Monday">
                <Switch checked={weeklyDigest} onCheckedChange={setWeeklyDigest} />
              </SettingRow>
            </CardContent>
          </Card>

          {/* Display */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Display</CardTitle>
              <p className="text-xs text-muted-foreground">Visual and theme settings</p>
            </CardHeader>
            <CardContent className="space-y-0">
              <SettingRow label="Theme" description="Application color scheme">
                <Select value={theme || "system"} onValueChange={setTheme}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Compact Mode" description="Reduce spacing in tables and cards">
                <Switch checked={compactMode} onCheckedChange={setCompactMode} />
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Animated Charts" description="Enable chart animations">
                <Switch checked={animatedCharts} onCheckedChange={setAnimatedCharts} />
              </SettingRow>
            </CardContent>
          </Card>

          {/* Data */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Data</CardTitle>
              <p className="text-xs text-muted-foreground">Data retention and export settings</p>
            </CardHeader>
            <CardContent className="space-y-0">
              <SettingRow label="Retention Period" description="Days to keep conversation data">
                <Select value={retentionDays} onValueChange={setRetentionDays}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Auto Export" description="Automatically export data weekly">
                <Switch checked={autoExport} onCheckedChange={setAutoExport} />
              </SettingRow>
              <Separator className="bg-border/50" />
              <SettingRow label="Export Format" description="Default file format for exports">
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="xlsx">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </>
  )
}
