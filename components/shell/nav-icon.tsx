import {
  BarChart3,
  Database,
  FileText,
  History,
  LayoutDashboard,
  List,
  Lock,
  Plus,
  Settings,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/navigation";

const ICONS: Record<NavIconName, LucideIcon> = {
  board: LayoutDashboard,
  plus: Plus,
  list: List,
  lock: Lock,
  chart: BarChart3,
  history: History,
  star: Star,
  report: FileText,
  database: Database,
  users: Users,
  settings: Settings,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden strokeWidth={2.25} />;
}
