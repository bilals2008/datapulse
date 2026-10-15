import { AnomalyFeed } from "@/components/anomaly-feed";
import { ForecastCard } from "@/components/forecast-card";
import { WeeklyRecap } from "@/components/weekly-recap";

type InsightsViewProps = {
  onOpenSettings: () => void;
};

export function InsightsView({ onOpenSettings }: InsightsViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <WeeklyRecap />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AnomalyFeed />
        </div>
        <ForecastCard onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
