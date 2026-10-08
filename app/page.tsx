import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/roles";

export default async function HomePage() {
  const employee = await getCurrentEmployee();
  redirect(employee ? homeForRole(employee.role) : "/login");
}
