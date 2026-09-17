import { readDemoSession } from "@/lib/session";
import { DemoLogin } from "@/components/app/DemoLogin";
import { AppShell } from "@/components/app/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { authenticated, actorName } = await readDemoSession();

  if (!authenticated) {
    return <DemoLogin />;
  }

  return <AppShell actorName={actorName}>{children}</AppShell>;
}
