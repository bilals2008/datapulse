import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, type AppSettings } from "@/lib/ipc";

type SettingsContextValue = {
  settings: AppSettings | null;
  update: (patch: Partial<AppSettings>) => Promise<void>;
};

const DEFAULT_SETTINGS: AppSettings = {
  refreshMs: 1000,
  quotaGb: 0,
  resetDay: 1,
  minimizeToTray: false,
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  update: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let active = true;
    api
      .settings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    const base = settings ?? DEFAULT_SETTINGS;
    const next = await api.saveSettings({ ...base, ...patch });
    setSettings(next);
  };

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
