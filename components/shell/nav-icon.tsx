import {
  BarChart3,
  Bot,
  Clapperboard,
  Database,
  FileText,
  History,
  LayoutDashboard,
  List,
  Lock,
  Plus,
  QrCode,
  SearchCheck,
  Settings,
  Star,
  Users,
  Wrench,
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
  wrench: Wrench,
  search: SearchCheck,
  assistant: Bot,
  qr: QrCode,
  demo: Clapperboard,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden strokeWidth={2.25} />;
}
