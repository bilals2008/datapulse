import { cn } from "@/lib/utils";

type InfoFieldProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
};

export function InfoField({ label, value, className }: InfoFieldProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-data text-[13px] text-foreground">{value}</span>
    </div>
  );
}
