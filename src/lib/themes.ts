export type Theme =
  | "light"
  | "ayu-light"
  | "dark"
  | "volt"
  | "ayu-dark";

export type ResolvedTheme = "light" | "dark";

export type ThemeOption = {
  id: Theme;
  label: string;
  description: string;
};

export const DEFAULT_THEME: Theme = "light";

/** Order here is the order shown in Settings → Appearance. */
export const THEME_GROUPS: { label: string; themes: ThemeOption[] }[] = [
  {
    label: "Light",
    themes: [
      { id: "light", label: "Light", description: "Warm sand and sage" },
      {
        id: "ayu-light",
        label: "Ayu Light",
        description: "Clean day variant, orange accent",
      },
    ],
  },
  {
    label: "Dark",
    themes: [
      { id: "dark", label: "Dark", description: "Warm sand, dimmed" },
      {
        id: "volt",
        label: "Volt",
        description: "Neon yellow-green on deep dark",
      },
      {
        id: "ayu-dark",
        label: "Ayu Dark",
        description: "Deep blue-black, gold accent",
      },
    ],
  },
];

export const THEME_IDS: string[] = THEME_GROUPS.flatMap((group) =>
  group.themes.map((theme) => theme.id),
);

export const THEME_SCHEME: Record<Theme, ResolvedTheme> = {
  light: "light",
  "ayu-light": "light",
  dark: "dark",
  volt: "dark",
  "ayu-dark": "dark",
};