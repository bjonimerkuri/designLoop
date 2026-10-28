import { Suspense } from 'react';
import { DemoReplay } from '@/components/DemoReplay';

export default function DemoViewPage() {
  return (
    <Suspense fallback={<p className="muted">Loading saved run.</p>}>
      <DemoReplay />
    </Suspense>
  );
}
