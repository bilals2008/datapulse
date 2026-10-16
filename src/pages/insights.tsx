import { AnomalyFeed } from "@/components/anomaly-feed";
import { ForecastCard } from "@/components/forecast-card";
import { FreeWindowCard } from "@/components/free-window-card";
import { SpeedCard } from "@/components/speed-card";
import { WeeklyRecap } from "@/components/weekly-recap";

type InsightsViewProps = {
  onOpenSettings: () => void;
};

export function InsightsView({ onOpenSettings }: InsightsViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:grid-rows-[auto_1fr_1fr]">
      <div className="xl:col-span-2">
        <WeeklyRecap />
      </div>
      <AnomalyFeed />
      <ForecastCard onOpenSettings={onOpenSettings} />
      <FreeWindowCard />
      <SpeedCard />
    </div>
  );
}
