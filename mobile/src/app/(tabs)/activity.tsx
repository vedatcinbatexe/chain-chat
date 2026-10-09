import { EmptyState } from '@/components/EmptyState';

export default function ActivityScreen() {
  return (
    <EmptyState
      icon="history"
      title="No on-chain activity yet"
      description="Every transaction from this wallet, with explorer links, arrives in Phase 14."
    />
  );
}
