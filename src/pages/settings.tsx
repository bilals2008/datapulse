import { HardDrive, Trash2 } from "lucide-react";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InfoField } from "@/components/info-field";
import { UpdateCard } from "@/components/update-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePoll } from "@/hooks/use-poll";
import { useSettings } from "@/hooks/use-settings";
import { api } from "@/lib/ipc";

const REFRESH_OPTIONS = [
  { value: "500", label: "0.5 seconds" },
  { value: "1000", label: "1 second" },
  { value: "2000", label: "2 seconds" },
  { value: "5000", label: "5 seconds" },
];

const RESET_DAYS = Array.from({ length: 28 }, (_, index) => String(index + 1));

export function SettingsView() {
  const { settings, update } = useSettings();
  const { data: meta } = usePoll(api.appMeta, 60000);
  const { theme, setTheme } = useTheme();

  const [quotaGb, setQuotaGb] = useState("");
  const [resetDay, setResetDay] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setQuotaGb(settings.quotaGb > 0 ? String(settings.quotaGb) : "");
    setResetDay(String(settings.resetDay));
  }, [settings]);

  const saveCap = async () => {
    const parsed = Number.parseFloat(quotaGb);
    setSaving(true);
    try {
      await update({
        quotaGb: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
        resetDay: Number(resetDay),
      });
      toast.success("Data cap saved");
    } catch {
      toast.error("Could not save the data cap");
    } finally {
      setSaving(false);
    }
  };

  const clearHistory = async () => {
    try {
      await api.clearHistory();
      toast.success("Usage history cleared");
    } catch {
      toast.error("Could not clear usage history");
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how DataPulse looks. System follows your operating system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={theme ?? "system"}
            onValueChange={(value) => {
              if (value) setTheme(value as Theme);
            }}
          >
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            <ToggleGroupItem value="system">System</ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitoring</CardTitle>
          <CardDescription>
            How often live speeds are sampled from the network adapters.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="refresh-interval">Refresh interval</Label>
          <Select
            value={String(settings?.refreshMs ?? 1000)}
            onValueChange={(value) => {
              void update({ refreshMs: Number(value) }).then(() =>
                toast.success("Refresh interval updated"),
              );
            }}
          >
            <SelectTrigger id="refresh-interval" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {REFRESH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <UpdateCard />

      <Card>
        <CardHeader>
          <CardTitle>System tray</CardTitle>
          <CardDescription>
            Keep DataPulse running in the background. Minimizing or closing the
            window hides it to the tray instead of quitting.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="minimize-to-tray">Minimize to tray</Label>
            <p className="text-xs text-muted-foreground">
              Reopen from the tray icon; use its menu to quit.
            </p>
          </div>
          <Switch
            id="minimize-to-tray"
            checked={settings?.minimizeToTray ?? false}
            disabled={!settings}
            onCheckedChange={(checked) => {
              void update({ minimizeToTray: checked }).then(() =>
                toast.success(
                  checked ? "Minimize to tray enabled" : "Minimize to tray disabled",
                ),
              );
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data cap</CardTitle>
          <CardDescription>
            Track your usage against a monthly allowance. Reset day applies to
            your billing cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quota">Allowance (GB)</Label>
              <Input
                id="quota"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                placeholder="e.g. 250"
                value={quotaGb}
                onChange={(event) => setQuotaGb(event.target.value)}
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-day">Reset day</Label>
              <Select value={resetDay} onValueChange={setResetDay}>
                <SelectTrigger id="reset-day" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {RESET_DAYS.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={saveCap} disabled={saving}>
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Set the allowance to 0 or leave it empty to disable the data cap.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>
            Usage samples are stored locally on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="size-4" />
              Local database
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 data-icon="inline-start" />
                  Clear history
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear usage history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every recorded sample. Live
                    monitoring keeps collecting from this point forward.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void clearHistory()}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <code
            data-selectable="true"
            className="text-data bg-muted/50 text-muted-foreground block truncate rounded-md px-3 py-2 text-xs"
            title={meta?.dbPath}
          >
            {meta?.dbPath ?? "—"}
          </code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>DataPulse network monitor</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <InfoField label="Version" value={meta?.version ?? "—"} />
          <InfoField label="Platform" value={meta?.platform ?? "—"} />
        </CardContent>
      </Card>
    </div>
  );
}
