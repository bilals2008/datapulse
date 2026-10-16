import { PartyPopper } from "lucide-react";
import { useState } from "react";

import { WrappedDialog } from "@/components/wrapped-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** The Wrapped entry point: one card, wherever it is placed. */
export function WrappedCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Wrapped</CardTitle>
          <CardDescription>
            Your year as one shareable card: total moved, busiest day, peak hour
            and the link that carried it all.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => setOpen(true)}>
            <PartyPopper data-icon="inline-start" />
            Open Wrapped
          </Button>
        </CardContent>
      </Card>

      <WrappedDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
