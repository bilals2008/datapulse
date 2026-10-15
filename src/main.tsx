import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import { TrayPopover } from "@/components/tray-popover";
import { LiveStatsProvider } from "@/hooks/use-live-stats";
import { ThemeProvider } from "@/hooks/use-theme";
import App from "./App";
import "./index.css";

const isPopover = getCurrentWindow().label === "popover";
if (isPopover) {
  document.documentElement.dataset.window = "popover";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {isPopover ? (
        <LiveStatsProvider>
          <TrayPopover />
        </LiveStatsProvider>
      ) : (
        <App />
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
