import { ScanEye } from "lucide-react";
import { cn } from "@/lib/cn";
import { imageUri } from "@/lib/format";
import type { Detection } from "@/lib/types";

export function DetectionThumb({ d, className }: { d: Detection; className?: string }) {
  const uri = imageUri(d.imageUrl);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface2", className ?? "h-11 w-14")}>
      {uri ? <img src={uri} alt="" className="h-full w-full object-cover" /> : <ScanEye className="h-5 w-5 text-subtle" />}
    </span>
  );
}

export function TypeBadgeClass(type?: string) {
  const t = (type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun" || t === "violence") return "danger" as const;
  if (t === "stranger") return "warn" as const;
  return "info" as const;
}
