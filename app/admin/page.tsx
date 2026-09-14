import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Next.js 16 removed synchronous cookies() access entirely — it must be awaited.
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const isAdmin = token ? await verifyAdminSessionToken(token) : false;

  if (!isAdmin) {
    redirect("/admin/login");
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <AdminDashboard />
    </main>
  );
}
