import { AnomalyFeed } from "@/components/anomaly-feed";
import { ForecastCard } from "@/components/forecast-card";

type InsightsViewProps = {
  onOpenSettings: () => void;
};

export function InsightsView({ onOpenSettings }: InsightsViewProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <AnomalyFeed />
      </div>
      <ForecastCard onOpenSettings={onOpenSettings} />
    </div>
  );
}
