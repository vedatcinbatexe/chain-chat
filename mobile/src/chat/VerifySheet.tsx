import { useMutation, useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Icon, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { getMessageProof, requestAnchorRun } from '@/api/anchoring';
import { useSystemInfo } from '@/api/system';
import { contractVerifiesMessage, isIncludedInRoot, readOnChainBatch } from '@/chain/anchor';
import { CopyableValue, shorten } from '@/components/CopyableValue';
import type { VerifiedMessage } from './verify';

type CheckState = 'ok' | 'fail' | 'waiting' | 'loading';

/**
 * Proves a message three ways, all on this phone (SDD §6.6, §14 step 6):
 * ① the sender's signature, ② the sender's hash chain, ③ inclusion in a Merkle root read from the Anchor contract.
 */
export function VerifySheet({ message, peerUsername, onDismiss }: { message: VerifiedMessage | null; peerUsername: string; onDismiss: () => void }) {
  const theme = useTheme();
  const system = useSystemInfo();
  const messageId = message?.dto.id;

  const proof = useQuery({
    queryKey: ['proof', messageId],
    enabled: messageId !== undefined,
    queryFn: () => getMessageProof(messageId!),
    // While the sheet is open, poll until the message is anchored.
    refetchInterval: (query) => (query.state.data?.status === 'Anchored' ? false : 3_000),
  });

  const anchored = proof.data?.status === 'Anchored' ? proof.data : null;
  const onChain = useQuery({
    queryKey: ['anchor-check', messageId, anchored?.batch?.chainBatchId],
    enabled: !!anchored?.batch && !!system.data && !!message?.recomputedHash,
    queryFn: async () => {
      const batchId = anchored!.batch!.chainBatchId;
      const batch = await readOnChainBatch(system.data!, batchId);
      // Both checks use the hash recomputed on this phone and the root read from the chain — not the server's values.
      const included = isIncludedInRoot(message!.recomputedHash!, anchored!.proof!, batch.root);
      const contractAgrees = await contractVerifiesMessage(system.data!, batchId, message!.recomputedHash!, anchored!.proof!);
      return { batch, included, contractAgrees };
    },
  });

  const anchorNow = useMutation({ mutationFn: requestAnchorRun });

  if (!message) return null;
  const sender = message.mine ? 'your' : `@${peerUsername}'s`;

  const anchorState: CheckState = proof.isPending || (anchored && onChain.isPending)
    ? 'loading'
    : !anchored
      ? 'waiting'
      : onChain.data?.included && onChain.data.contractAgrees
        ? 'ok'
        : 'fail';

  return (
    <Portal>
      <Modal visible onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="titleLarge" style={styles.title}>
            Verify message
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={3}>
            “{message.text ?? 'Could not decrypt'}”
          </Text>
          <Divider />

          <Check
            state={message.signatureValid ? 'ok' : 'fail'}
            title={message.signatureValid ? `Signed by ${sender} wallet` : 'Signature invalid'}
            detail={
              message.signatureValid
                ? 'The hash was recomputed on this phone and the signature recovers the sender’s address.'
                : 'Not signed by this wallet, or changed in transit.'
            }
          />
          <Check
            state={message.chainIntact ? 'ok' : 'fail'}
            title={message.chainIntact ? 'Hash chain intact' : 'Message missing before this one'}
            detail={`Message #${message.dto.seq} in ${sender} chain${message.chainIntact ? ' links to the previous one.' : ' does not link to the previous one.'}`}
          />
          <Check
            state={anchorState}
            title={
              anchorState === 'loading'
                ? anchored ? 'Reading the root from the Anchor contract…' : 'Requesting the Merkle proof…'
                : anchorState === 'waiting'
                  ? 'Not anchored on-chain yet'
                  : anchorState === 'ok'
                    ? 'Anchored on-chain'
                    : 'Does not match the on-chain record'
            }
            detail={
              anchorState === 'waiting'
                ? `New messages are anchored every ${proof.data?.anchorIntervalSeconds ?? '…'} s. This screen updates automatically.`
                : anchorState === 'ok' && anchored?.batch
                  ? `Included in batch #${anchored.batch.chainBatchId}, block ${anchored.batch.blockNumber}. The Anchor contract itself confirms it.`
                  : anchorState === 'fail'
                    ? onChain.isError
                      ? 'Could not read the Anchor contract.'
                      : `This message was changed after it was anchored in block ${anchored?.batch?.blockNumber}.`
                    : undefined
            }
          />

          {anchorState === 'waiting' && (
            <Button mode="outlined" icon="anchor" onPress={() => anchorNow.mutate()} loading={anchorNow.isPending} disabled={anchorNow.isPending || anchorNow.isSuccess}>
              {anchorNow.isSuccess ? 'Anchoring requested…' : 'Anchor now'}
            </Button>
          )}

          {anchored?.batch && onChain.data && (
            <View style={styles.details}>
              <CopyableValue label="On-chain Merkle root (read from the contract)" value={onChain.data.batch.root} />
              <CopyableValue label="Anchor transaction" value={anchored.batch.txHash} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Leaf {anchored.leafIndex! + 1} of messages #{anchored.batch.fromMessageId}–#{anchored.batch.toMessageId} · proof of{' '}
                {anchored.proof!.length} hash{anchored.proof!.length === 1 ? '' : 'es'} · message hash {shorten(message.recomputedHash ?? '')}
              </Text>
            </View>
          )}

          <Button mode="contained" onPress={onDismiss}>
            Close
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

function Check({ state, title, detail }: { state: CheckState; title: string; detail?: string }) {
  const theme = useTheme();
  const icon = { ok: 'check-decagram', fail: 'close-octagon', waiting: 'clock-outline' } as const;
  const color = state === 'ok' ? theme.colors.secondary : state === 'fail' ? theme.colors.error : theme.colors.onSurfaceVariant;

  return (
    <View style={styles.check}>
      {state === 'loading' ? <ActivityIndicator size={24} /> : <Icon source={icon[state]} size={24} color={color} />}
      <View style={styles.checkText}>
        <Text variant="titleSmall" style={{ color: state === 'fail' ? theme.colors.error : undefined }}>
          {title}
        </Text>
        {detail && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {detail}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: 20, maxHeight: '85%' },
  content: { padding: 20, gap: 14 },
  title: { fontWeight: '700' },
  check: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkText: { flex: 1, gap: 2 },
  details: { gap: 6 },
});
