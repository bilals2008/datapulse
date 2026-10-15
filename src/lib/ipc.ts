import { invoke } from "@tauri-apps/api/core";

export type InterfaceSnapshot = {
  name: string;
  isWireless: boolean;
  rxRate: number;
  txRate: number;
  rxTotal: number;
  txTotal: number;
};

export type TickPayload = {
  ts: number;
  interfaces: InterfaceSnapshot[];
  rxRate: number;
  txRate: number;
  sessionRx: number;
  sessionTx: number;
};

export type UsageBucket = {
  key: string;
  rx: number;
  tx: number;
};

export type UsageSeries = {
  range: string;
  buckets: UsageBucket[];
  rx: number;
  tx: number;
};

export type InterfaceTotal = {
  name: string;
  isWireless: boolean;
  rx: number;
  tx: number;
};

export type QuotaStatus = {
  enabled: boolean;
  limitBytes: number;
  usedBytes: number;
  projectedBytes: number;
  periodStart: number;
  periodEnd: number;
  daysElapsed: number;
  daysTotal: number;
  resetDay: number;
  avgDaily: number;
  dailyBudget: number;
  forecastBytes: number;
  daysToLimit: number;
  overBudget: boolean;
  burn: ForecastPoint[];
};

export type ForecastPoint = {
  ts: number;
  actual: number;
  projected: number;
  budget: number;
};

export type Anomaly = {
  id: number;
  kind: "spike" | "night";
  ts: number;
  iface: string;
  bytes: number;
  baseline: number;
  ratio: number;
  severity: "low" | "medium" | "high";
  message: string;
};

export type WifiInfo = {
  ssid: string;
  signalPercent: number;
  radioType: string;
  channel: string;
  rxMbps: number;
  txMbps: number;
};

export type AppMeta = {
  version: string;
  dbPath: string;
  platform: string;
};

export type DailyTotal = {
  day: string;
  rx: number;
  tx: number;
};

export type BusiestDay = {
  day: string;
  bytes: number;
};

export type Recap = {
  thisWeek: number;
  lastWeek: number;
  deltaPercent: number;
  avgDaily: number;
  busiestDay: BusiestDay | null;
  busiestHour: number | null;
  topInterface: InterfaceTotal | null;
};

export type AppSettings = {
  refreshMs: number;
  quotaGb: number;
  resetDay: number;
  minimizeToTray: boolean;
  autoCheckUpdates: boolean;
};

export type UsageRange = "today" | "7d" | "30d" | "12m";

export const api = {
  snapshot: () => invoke<TickPayload>("get_snapshot"),
  settings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (config: AppSettings) =>
    invoke<AppSettings>("set_settings", { config }),
  usageSeries: (range: UsageRange) =>
    invoke<UsageSeries>("get_usage_series", { range }),
  interfaceTotals: (days: number) =>
    invoke<InterfaceTotal[]>("get_interface_totals", { days }),
  quotaStatus: () => invoke<QuotaStatus>("get_quota_status"),
  anomalies: (limit = 50) => invoke<Anomaly[]>("get_anomalies", { limit }),
  dismissAnomaly: (id: number) => invoke<void>("dismiss_anomaly", { id }),
  dismissAllAnomalies: () => invoke<void>("dismiss_all_anomalies"),
  dailyActivity: (days: number) =>
    invoke<DailyTotal[]>("get_daily_activity", { days }),
  recap: () => invoke<Recap>("get_recap"),
  wifiInfo: () => invoke<WifiInfo | null>("get_wifi_info"),
  appMeta: () => invoke<AppMeta>("get_app_meta"),
  clearHistory: () => invoke<void>("clear_history"),
  openMainWindow: () => invoke<void>("open_main_window"),
};
