import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import { SplashScreen } from "@/components/splash";
import { TinyHud } from "@/components/tiny-hud";
import { TrayPopover } from "@/components/tray-popover";
import { LiveStatsProvider } from "@/hooks/use-live-stats";
import { ThemeProvider } from "@/hooks/use-theme";
import App from "./App";
import "./index.css";

const label = getCurrentWindow().label;
const isPopover = label === "popover";
const isTiny = label === "tiny";
const isSplash = label === "splash";
if (isPopover || isTiny || isSplash) {
  document.documentElement.dataset.window = label;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {isPopover ? (
        <LiveStatsProvider>
          <TrayPopover />
        </LiveStatsProvider>
      ) : isTiny ? (
        <LiveStatsProvider>
          <TinyHud />
        </LiveStatsProvider>
      ) : isSplash ? (
        <SplashScreen />
      ) : (
        <App />
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
