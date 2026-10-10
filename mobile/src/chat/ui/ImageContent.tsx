import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadAttachmentFile } from '../attachmentFile';
import { imageExtension, type ImagePayload } from '../image';

/** The picture's longer side inside a bubble. */
const MAX_SIDE = 230;

/**
 * A photo or GIF inside a chat bubble. The encrypted file is downloaded when the bubble appears, checked against
 * the fingerprint in the signed message and decrypted on this phone; a picture that was changed on the server is
 * not shown. Tap to see it full screen.
 */
export function ImageContent({ image, color, onLongPress }: { image: ImagePayload; color: string; onLongPress?: () => void }) {
  const insets = useSafeAreaInsets();
  const [fullScreen, setFullScreen] = useState(false);
  const file = useQuery({
    queryKey: ['attachment', image.id],
    queryFn: () => loadAttachmentFile(image, imageExtension(image.mime), 'picture'),
    staleTime: Infinity,
    retry: 1,
  });

  const scale = Math.min(MAX_SIDE / image.width, MAX_SIDE / image.height);
  const size = { width: Math.max(90, Math.round(image.width * scale)), height: Math.max(90, Math.round(image.height * scale)) };
  const uri = file.data?.state === 'ready' ? file.data.uri : null;

  return (
    <View style={styles.container}>
      {uri ? (
        <Pressable onPress={() => setFullScreen(true)} onLongPress={onLongPress} delayLongPress={300} accessibilityLabel={image.mime === 'image/gif' ? 'GIF, tap to enlarge' : 'Photo, tap to enlarge'}>
          <Image source={{ uri }} style={[styles.image, size]} contentFit="cover" />
        </Pressable>
      ) : (
        <View style={[styles.image, styles.placeholder, size]}>
          {file.isPending ? (
            <ActivityIndicator color={color} />
          ) : (
            <>
              <Icon source={file.data?.state === 'failed' && file.data.tampered ? 'alert-octagon' : 'image-off-outline'} size={28} color={color} />
              <Text variant="labelSmall" style={[styles.failure, { color }]}>
                {file.data?.state === 'failed' ? file.data.reason : 'The picture could not be downloaded.'}
              </Text>
            </>
          )}
        </View>
      )}
      <View style={styles.row}>
        <Icon source={uri ? 'check-decagram' : 'lock-outline'} size={13} color={color} />
        <Text variant="labelSmall" style={[styles.note, { color }]}>
          {uri ? `${image.mime === 'image/gif' ? 'GIF' : 'Photo'} · matches the signed message` : file.isPending ? 'Downloading and decrypting…' : 'Not shown'}
        </Text>
      </View>

      <Modal visible={fullScreen} transparent animationType="none" onRequestClose={() => setFullScreen(false)} statusBarTranslucent>
        <Pressable style={styles.viewer} onPress={() => setFullScreen(false)} accessibilityLabel="Close picture">
          {uri && <Image source={{ uri }} style={styles.viewerImage} contentFit="contain" />}
          <IconButton icon="close" iconColor="white" size={26} style={[styles.close, { top: insets.top + 4 }]} onPress={() => setFullScreen(false)} accessibilityLabel="Close" />
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  image: { borderRadius: 12, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, backgroundColor: 'rgba(127,127,127,0.18)' },
  failure: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { flexShrink: 1, opacity: 0.85 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  close: { position: 'absolute', right: 8 },
});
