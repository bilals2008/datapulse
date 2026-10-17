/** Friendly name + brand mark for a Windows process. */

export type AppInfo = {
  label: string;
  /** theSVG slug; absent means the label renders as a letter badge. */
  slug?: string;
  /** Mark paints with `currentColor`, so it needs inverting in dark mode. */
  mono?: boolean;
};

const ICON = "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons";

export function logoUrl(slug: string): string {
  return `${ICON}/${slug}/default.svg`;
}

// exe name (lowercase, no extension) -> what a person would call the app.
const APPS: Record<string, AppInfo> = {
  // browsers
  msedge: { label: "Microsoft Edge", slug: "edge" },
  msedgewebview2: { label: "Edge WebView2", slug: "edge" },
  chrome: { label: "Google Chrome", slug: "google-chrome" },
  firefox: { label: "Firefox", slug: "firefox" },
  brave: { label: "Brave", slug: "brave" },
  opera: { label: "Opera", slug: "opera" },
  electron: { label: "Electron", slug: "electron" },

  // editors & agents
  code: { label: "VS Code", slug: "visual-studio-code" },
  "code - insiders": { label: "VS Code Insiders", slug: "visual-studio-code" },
  cursor: { label: "Cursor", slug: "cursor" },
  windsurf: { label: "Windsurf", slug: "windsurf" },
  zed: { label: "Zed", slug: "zed" },
  devenv: { label: "Visual Studio", slug: "visual-studio" },
  idea64: { label: "IntelliJ IDEA", slug: "intellij-idea" },
  webstorm64: { label: "WebStorm", slug: "webstorm" },
  pycharm64: { label: "PyCharm", slug: "pycharm" },
  sublime_text: { label: "Sublime Text", slug: "sublime-text" },
  "notepad++": { label: "Notepad++", slug: "notepadplusplus" },
  opencode: { label: "opencode", slug: "opencode", mono: true },
  codex: { label: "Codex", slug: "codex", mono: true },

  // runtimes & tools
  node: { label: "Node.js", slug: "nodejs" },
  python: { label: "Python", slug: "python" },
  pythonw: { label: "Python", slug: "python" },
  java: { label: "Java" },
  javaw: { label: "Java" },
  git: { label: "Git", slug: "git-for-windows" },
  "git-bash": { label: "Git Bash", slug: "git-for-windows" },
  docker: { label: "Docker Desktop", slug: "docker" },
  "com.docker.backend": { label: "Docker Desktop", slug: "docker" },
  postman: { label: "Postman", slug: "postman" },
  dbeaver: { label: "DBeaver", slug: "dbeaver" },

  // office & mail
  winword: { label: "Microsoft Word", slug: "microsoft-word" },
  excel: { label: "Microsoft Excel", slug: "microsoft-excel" },
  powerpnt: { label: "PowerPoint", slug: "microsoft-powerpoint" },
  onenote: { label: "OneNote", slug: "microsoft-onenote" },
  outlook: { label: "Outlook", slug: "microsoft-outlook" },
  onedrive: { label: "OneDrive", slug: "microsoft-onedrive" },
  msteams: { label: "Microsoft Teams", slug: "microsoft-teams" },

  // chat, sync, media
  slack: { label: "Slack", slug: "slack" },
  discord: { label: "Discord", slug: "discord" },
  zoom: { label: "Zoom", slug: "zoom" },
  telegram: { label: "Telegram", slug: "telegram" },
  whatsapp: { label: "WhatsApp", slug: "whatsapp" },
  signal: { label: "Signal", slug: "signal" },
  steam: { label: "Steam", slug: "steam" },
  steamwebhelper: { label: "Steam", slug: "steam" },
  spotify: { label: "Spotify", slug: "spotify" },
  dropbox: { label: "Dropbox", slug: "dropbox" },
  box: { label: "Box", slug: "box" },
  vlc: { label: "VLC", slug: "vlc-media-player" },
  obs64: { label: "OBS Studio", slug: "obs-studio" },
  obs32: { label: "OBS Studio", slug: "obs-studio" },
  figma: { label: "Figma", slug: "figma" },
  notion: { label: "Notion", slug: "notion" },

  // windows plumbing
  explorer: { label: "File Explorer" },
  searchindexer: { label: "Windows Search" },
  svchost: { label: "Windows Services" },
  runtimebroker: { label: "Runtime Broker" },
  sihost: { label: "Windows Shell" },
  shellexperiencehost: { label: "Windows Shell" },
  dwm: { label: "Desktop Window Manager" },
  wmiprvse: { label: "Windows Management" },
  taskhostw: { label: "Windows Task Host" },
  searchhost: { label: "Windows Search" },
  ctfmon: { label: "Text Input" },
};

export function appInfo(procName: string): AppInfo {
  const bare = procName.replace(/\.exe$/i, "");
  return APPS[bare.toLowerCase()] ?? { label: bare };
}
