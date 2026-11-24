import { HomeShell } from '@/components/HomeShell';

export default function Home() {
  const icpNumber = process.env.ICP_NUMBER?.trim() || undefined;

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div
        aria-hidden
        className="page-glow pointer-events-none fixed inset-x-0 top-0 h-[520px]"
      />
      <HomeShell icpNumber={icpNumber} />
    </div>
  );
}
