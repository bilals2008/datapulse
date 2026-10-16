import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";

import { DownloadSection } from "@/components/download-section";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Thanks } from "@/components/thanks";

export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const lenis = useLenis();

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash);
      if (lenis) lenis.scrollTo(0, { immediate: true });
      else window.scrollTo(0, 0);
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [lenis]);

  if (hash === "#thanks") {
    return <Thanks />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
