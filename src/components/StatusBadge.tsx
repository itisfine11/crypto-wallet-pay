import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/payment-data";

const styles: Record<OrderStatus, string> = {
  Pending: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/20",
  Process: "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20",
  Paid: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
  Expired: "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20",
};

export const StatusBadge = ({ status }: { status: OrderStatus }) => (
  <Badge variant="outline" className={cn("font-medium", styles[status])}>
    <span
      className={cn(
        "mr-1.5 h-1.5 w-1.5 rounded-full",
        status === "Pending" && "bg-warning",
        status === "Process" && "bg-primary animate-pulse-glow",
        status === "Paid" && "bg-emerald-400",
        status === "Expired" && "bg-destructive"
      )}
    />
    {status}
  </Badge>
);
