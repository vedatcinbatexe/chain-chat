import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { MAX_ATTACHMENT_BYTES, uploadAttachment } from '@/api/attachments';
import { encryptAttachment } from '@/crypto';
import { formatImagePayload, type ImagePayload } from './image';

/** Photos are scaled down so their longer side is at most this many pixels. */
const MAX_PHOTO_SIDE = 1600;

/**
 * Lets the user pick a photo or GIF and turns it into the text of an image message (SDD §6.8): the picture is
 * encrypted on this phone with a fresh key, only the ciphertext is uploaded, and the returned payload — id, key,
 * fingerprint, type and size — is then sent like any other message. Resolves with null if the user cancels.
 *
 * Photos are resized and re-encoded as JPEG, which also drops their metadata (location, camera). GIFs are sent as
 * they are, so they stay animated.
 */
export async function pickImageMessage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Allow photo access in Settings to send pictures.');

  // quality 1 and no editing: the system then hands over GIFs untouched instead of a still frame.
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;

  let uri = asset.uri;
  let mime: ImagePayload['mime'];
  let { width, height } = asset;

  if (asset.mimeType === 'image/gif' || uri.toLowerCase().endsWith('.gif')) {
    mime = 'image/gif';
  } else {
    const longer = Math.max(width, height);
    const resize = longer > MAX_PHOTO_SIDE ? [{ resize: width >= height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE } }] : [];
    const photo = await manipulateAsync(uri, resize, { compress: 0.72, format: SaveFormat.JPEG });
    ({ uri, width, height } = photo);
    mime = 'image/jpeg';
  }

  const bytes = await new File(uri).bytes();
  if (bytes.length === 0) throw new Error('That picture could not be read.');

  const encrypted = encryptAttachment(bytes);
  if (encrypted.blob.length > MAX_ATTACHMENT_BYTES) throw new Error(`That ${mime === 'image/gif' ? 'GIF' : 'picture'} is too large to send (the limit is 8 MB).`);

  const id = await uploadAttachment(encrypted.blob);
  return formatImagePayload({ id, key: encrypted.key, hash: encrypted.hash, mime, width, height, size: encrypted.blob.length });
}
