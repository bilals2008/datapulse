import { PartyPopper } from "lucide-react";
import { useState } from "react";

import { PeriodPicker, WrappedDialog } from "@/components/wrapped-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePoll } from "@/hooks/use-poll";
import { api, type WrappedPeriod } from "@/lib/ipc";

/** The Wrapped entry point: one card, wherever it is placed. */
export function WrappedCard() {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<WrappedPeriod>("year");
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = usePoll(
    () => api.wrapped(period, offset),
    60000,
    [period, offset],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Wrapped</CardTitle>
          <CardDescription>
            Any day, week, month or year as one shareable card: total moved,
            busiest day, peak hour and the link that carried it all.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PeriodPicker
            period={period}
            offset={offset}
            label={data?.label ?? ""}
            onChange={(next, nextOffset) => {
              setPeriod(next);
              setOffset(nextOffset);
            }}
          />
          <Button className="w-full" onClick={() => setOpen(true)}>
            <PartyPopper data-icon="inline-start" />
            Open Wrapped
          </Button>
        </CardContent>
      </Card>

      <WrappedDialog
        open={open}
        onOpenChange={setOpen}
        data={data}
        loading={loading}
        error={error}
      />
    </>
  );
}