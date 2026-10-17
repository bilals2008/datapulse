import {
  HardDrive,
  Info,
  RefreshCw,
  Router,
  SlidersHorizontal,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

import { InfoField } from "@/components/info-field";
import { UpdateCard } from "@/components/update-card";
import { WrappedCard } from "@/components/wrapped-card";
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
  CardFooter,
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
import { cn } from "@/lib/utils";

const REFRESH_OPTIONS = [
  { value: "500", label: "0.5 seconds" },
  { value: "1000", label: "1 second" },
  { value: "2000", label: "2 seconds" },
  { value: "5000", label: "5 seconds" },
];

const RESET_DAYS = Array.from({ length: 28 }, (_, index) => String(index + 1));

type SectionId = "general" | "network" | "data" | "updates" | "storage" | "about";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "network", label: "Network", icon: Router },
  { id: "data", label: "Data cap", icon: Wallet },
  { id: "updates", label: "Updates", icon: RefreshCw },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "about", label: "About", icon: Info },
];

type RowProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
};

function Row({ label, htmlFor, hint, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const { settings, update } = useSettings();
  const { data: meta } = usePoll(api.appMeta, 60000);
  const { data: lan } = usePoll(api.lanInfo, 5000);
  const { data: tiny } = usePoll(api.tinyState, 3000);
  const { theme, setTheme } = useTheme();

  const [section, setSection] = useState<SectionId>("general");
  const [quotaGb, setQuotaGb] = useState("");
  const [resetDay, setResetDay] = useState("1");
  const [ratePerGb, setRatePerGb] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [saving, setSaving] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [tinyVisible, setTinyVisible] = useState(false);
  const [tinyHotkey, setTinyHotkey] = useState<string | null>(null);

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!tiny) return;
    setTinyVisible(tiny.visible);
    // Seeded once: re-seeding on every poll would overwrite what is being typed.
    setTinyHotkey((current) => current ?? tiny.hotkey);
  }, [tiny]);

  useEffect(() => {
    if (!settings) return;
    setQuotaGb(settings.quotaGb > 0 ? String(settings.quotaGb) : "");
    setResetDay(String(settings.resetDay));
    setRatePerGb(settings.ratePerGb > 0 ? String(settings.ratePerGb) : "");
    setCurrency(settings.currency);
  }, [settings]);

  const saveCap = async () => {
    const parsed = Number.parseFloat(quotaGb);
    const rate = Number.parseFloat(ratePerGb);
    setSaving(true);
    try {
      await update({
        quotaGb: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
        resetDay: Number(resetDay),
        ratePerGb: Number.isFinite(rate) && rate > 0 ? rate : 0,
        currency: currency.trim() || "PKR",
      });
      toast.success("Data cap saved");
    } catch {
      toast.error("Could not save the data cap");
    } finally {
      setSaving(false);
    }
  };

  const saveHotkey = async () => {
    const chord = (tinyHotkey ?? "").trim();
    if (!chord) {
      toast.error("Enter a shortcut such as Ctrl+Alt+D");
      return;
    }

    try {
      const saved = await api.setTinyHotkey(chord);
      setTinyHotkey(saved);
      toast.success(`Tiny HUD shortcut set to ${saved}`);
    } catch (error) {
      toast.error(
        typeof error === "string" ? error : "Could not set that shortcut",
      );
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

  const activeSection = SECTIONS.find((item) => item.id === section);

  return (
    <div className="flex h-full gap-6">
      <nav
        aria-label="Settings sections"
        className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border/60 pr-3"
      >
        {SECTIONS.map((item) => {
          const active = item.id === section;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <section
        key={section}
        aria-label={activeSection?.label}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto [&>*]:shrink-0"
      >
        {section === "general" ? (
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>
                How DataPulse looks and runs on this computer.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 px-0">
              <Row label="Theme">
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
              </Row>

              <Row
                label="Refresh interval"
                htmlFor="refresh-interval"
                hint="How often live speeds are sampled."
              >
                <Select
                  value={String(settings?.refreshMs ?? 1000)}
                  onValueChange={(value) => {
                    void update({ refreshMs: Number(value) }).then(() =>
                      toast.success("Refresh interval updated"),
                    );
                  }}
                >
                  <SelectTrigger id="refresh-interval" className="w-36">
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
              </Row>

              <Row
                label="Open on startup"
                htmlFor="launch-on-startup"
                hint="Starts monitoring as soon as you sign in."
              >
                <Switch
                  id="launch-on-startup"
                  checked={autostart}
                  onCheckedChange={(checked) => {
                    void (checked ? enable() : disable())
                      .then(() => {
                        setAutostart(checked);
                        toast.success(
                          checked
                            ? "DataPulse will open on startup"
                            : "Startup launch disabled",
                        );
                      })
                      .catch(() =>
                        toast.error("Could not change the startup setting"),
                      );
                  }}
                />
              </Row>

              <Row
                label="Minimize to tray"
                htmlFor="minimize-to-tray"
                hint="Closing the window hides DataPulse in the tray instead of quitting — use the tray menu to exit."
              >
                <Switch
                  id="minimize-to-tray"
                  checked={settings?.minimizeToTray ?? false}
                  disabled={!settings}
                  onCheckedChange={(checked) => {
                    void update({ minimizeToTray: checked }).then(() =>
                      toast.success(
                        checked
                          ? "Minimize to tray enabled"
                          : "Minimize to tray disabled",
                      ),
                    );
                  }}
                />
              </Row>

              <Row
                label="Tiny HUD"
                htmlFor="tiny-hud"
                hint={`A 208×60 always-on-top widget with live speeds, a level meter per direction and the session total. ${
                  tiny?.hotkey ?? "Ctrl+Alt+D"
                } or the tray menu toggles it too.`}
              >
                <Switch
                  id="tiny-hud"
                  checked={tinyVisible}
                  onCheckedChange={(checked) => {
                    setTinyVisible(checked);
                    void api.setTinyVisible(checked).then(() =>
                      toast.success(
                        checked ? "Tiny HUD shown" : "Tiny HUD hidden",
                      ),
                    );
                  }}
                />
              </Row>

              <Row
                label="Tiny HUD shortcut"
                htmlFor="tiny-hotkey"
                hint="Works in any app. A shortcut another program already owns is refused."
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="tiny-hotkey"
                    value={tinyHotkey ?? ""}
                    placeholder="Ctrl+Alt+D"
                    onChange={(event) => setTinyHotkey(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveHotkey();
                    }}
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveHotkey()}
                  >
                    Save
                  </Button>
                </div>
              </Row>
            </CardContent>
          </Card>
        ) : null}

        {section === "network" ? (
          <Card>
            <CardHeader>
              <CardTitle>Network</CardTitle>
              <CardDescription>
                Line tests and sharing across your local network.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 px-0">
              <Row
                label="Hourly speed test"
                htmlFor="speedtest"
                hint="Downloads a 2 MB test file once an hour — about 48 MB a day. Results are grouped by hour on Insights."
              >
                <Switch
                  id="speedtest"
                  checked={settings?.speedtestEnabled ?? false}
                  disabled={!settings}
                  onCheckedChange={(checked) => {
                    void update({ speedtestEnabled: checked }).then(() =>
                      toast.success(
                        checked
                          ? "Speed test enabled"
                          : "Speed test disabled",
                      ),
                    );
                  }}
                />
              </Row>

              <Row
                label="LAN dashboard"
                htmlFor="lan-dashboard"
                hint="Serves a read-only live view on port 7676. Anyone on the network with the link can open it."
              >
                <Switch
                  id="lan-dashboard"
                  checked={settings?.lanEnabled ?? false}
                  disabled={!settings}
                  onCheckedChange={(checked) => {
                    void update({ lanEnabled: checked }).then(() =>
                      toast.success(
                        checked
                          ? "LAN dashboard enabled"
                          : "LAN dashboard disabled",
                      ),
                    );
                  }}
                />
              </Row>

              {settings?.lanEnabled ? (
                lan?.running ? (
                  <div className="px-4 py-3">
                    <Input
                      readOnly
                      data-selectable="true"
                      value={lan.url}
                      aria-label="LAN dashboard URL"
                      onFocus={(event) => event.currentTarget.select()}
                      className="text-data text-xs"
                    />
                  </div>
                ) : (
                  <p className="px-4 py-3 text-xs text-muted-foreground">
                    Could not listen on port 7676 — another program may be
                    using it.
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {section === "data" ? (
          <Card>
            <CardHeader>
              <CardTitle>Data cap &amp; cost</CardTitle>
              <CardDescription>
                Track usage against a monthly allowance and see what that
                usage costs.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 px-0">
              <Row label="Allowance (GB)" htmlFor="quota">
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
              </Row>

              <Row label="Reset day" htmlFor="reset-day">
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
              </Row>

              <Row label="Price per GB" htmlFor="rate">
                <Input
                  id="rate"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 15"
                  value={ratePerGb}
                  onChange={(event) => setRatePerGb(event.target.value)}
                  className="w-32"
                />
              </Row>

              <Row label="Currency" htmlFor="currency">
                <Input
                  id="currency"
                  maxLength={6}
                  placeholder="PKR"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-24"
                />
              </Row>
            </CardContent>
            <CardFooter className="justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                An empty allowance disables the cap; a price of 0 hides cost
                figures.
              </p>
              <Button size="sm" onClick={saveCap} disabled={saving}>
                Save
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {section === "updates" ? <UpdateCard /> : null}

        {section === "storage" ? (
          <Card>
            <CardHeader>
              <CardTitle>Storage</CardTitle>
              <CardDescription>
                Usage samples are stored locally on this device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <code
                data-selectable="true"
                className="text-data bg-muted/50 text-muted-foreground block truncate rounded-md px-3 py-2 text-xs"
                title={meta?.dbPath}
              >
                {meta?.dbPath ?? "—"}
              </code>
            </CardContent>
            <CardFooter className="justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Deletes every recorded sample on this device.
              </p>
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
            </CardFooter>
          </Card>
        ) : null}

        {section === "about" ? (
          <>
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

            <WrappedCard />
          </>
        ) : null}
      </section>
    </div>
  );
}
