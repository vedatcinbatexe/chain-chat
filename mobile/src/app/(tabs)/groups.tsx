import { EmptyState } from '@/components/EmptyState';

export default function GroupsScreen() {
  return (
    <EmptyState
      icon="account-group-outline"
      title="No groups yet"
      description="Groups gated by a ClassBadge NFT arrive in Phase 12."
    />
  );
}
