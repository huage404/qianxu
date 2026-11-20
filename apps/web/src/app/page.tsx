import { HomeShell } from '@/components/HomeShell';

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div
        aria-hidden
        className="page-glow pointer-events-none fixed inset-x-0 top-0 h-[520px]"
      />
      <HomeShell />
    </div>
  );
}
