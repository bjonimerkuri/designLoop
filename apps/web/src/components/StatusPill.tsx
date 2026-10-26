import type { RunStatus } from '@designloop/shared';
import { statusLabel } from '@/lib/format';

export function StatusPill({ status }: { status: RunStatus }) {
  return (
    <span className="pill" data-status={status}>
      {statusLabel[status]}
    </span>
  );
}
