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

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  update: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let delay = 250;

    const load = async () => {
      try {
        const value = await api.settings();
        if (active) setSettings(value);
      } catch {
        // Retried until it answers: giving up would leave every control gated on
        // `settings` disabled for the rest of the session.
        if (active) {
          timer = window.setTimeout(load, delay);
          delay = Math.min(delay * 2, 5000);
        }
      }
    };

    void load();

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    // Never built on defaults: that would write the other preferences back as
    // zeros/false over whatever the device actually has.
    const base = settings ?? (await api.settings());
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
