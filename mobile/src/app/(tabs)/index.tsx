import { EmptyState } from '@/components/EmptyState';

export default function ChatsScreen() {
  return (
    <EmptyState
      icon="message-lock-outline"
      title="No conversations yet"
      description="End-to-end encrypted 1:1 chats arrive in Phase 10."
    />
  );
}
