import { useEffect, useState } from "react";
import { ArrowUp, Globe } from "lucide-react";

const socials = [
  {
    href: "https://github.com/bilals2008",
    label: "GitHub",
    icon: "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/default.svg",
    invert: true,
  },
  {
    href: "https://www.linkedin.com/in/muhammad-bilal-hassan-327209414/",
    label: "LinkedIn",
    icon: "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/linkedin/default.svg",
    invert: false,
  },
  {
    href: "https://x.com/MBilal7555",
    label: "X",
    icon: "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/x/default.svg",
    invert: true,
  },
  { href: "https://mbilalhassan.vercel.app/", label: "Portfolio", Icon: Globe },
];

export function Footer() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 520);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <footer className="border-t border-border bg-card/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-5 px-5 py-6 sm:flex-row sm:justify-between">
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            © {new Date().getFullYear()} DataPulse · Built by Muhammad Bilal Hassan
          </p>

          <div className="flex items-center gap-2.5">
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="flex size-10 items-center justify-center rounded-lg border border-border bg-background/40 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground sm:size-9"
              >
                {social.Icon ? (
                  <social.Icon className="size-5" />
                ) : (
                  <img
                    src={social.icon}
                    alt=""
                    className={`size-5${social.invert ? " dark:invert" : ""}`}
                  />
                )}
              </a>
            ))}
          </div>
        </div>
      </footer>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
        className={`fixed bottom-5 left-5 z-50 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-1 hover:bg-primary/90 ${
          showTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
