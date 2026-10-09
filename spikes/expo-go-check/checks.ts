import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import * as signalR from '@microsoft/signalr';
import { createPublicClient, encodeAbiParameters, http, keccak256, verifyMessage, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

/** The Mac running Metro — Expo tells the app where it was loaded from. Fallback: the Mac's Wi-Fi IP. */
export const HOST = Constants.expoConfig?.hostUri?.split(':')[0] ?? '192.168.1.14';

export type CheckResult = { name: string; ok: boolean; detail: string; ms: number };
type Check = { name: string; run: () => Promise<string> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Values copied from shared/test-vectors/vectors (Phase 3). The phone must reproduce them exactly. */
const VECTOR = {
  // message-hash.json — "first message (seq 1, prevHash = zero)"
  conversationId: '0xbb28eaf196e36888b583595e63b9d101d47ab75a86946c03c23d13072638c85c' as Hex,
  sender: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex,
  ciphertext: '0x636970686572746578743a616c6963652d3e626f62202331' as Hex,
  clientTimestamp: 1767225601000n,
  messageHash: '0x54526e4ac715e2b12fe22b485e311357cffe41f17e185cf83d2ac1e11106990d' as Hex,
  // signatures.json — "valid signature by alice" (Anvil's public dev key #0)
  aliceKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex,
  signature:
    '0x6adc6c41f256dc48b43b8787c19e9f178edd46eb72ae848ced97c4cc94e26f4938008ad69c7c2c81dc06a9bb70e04c022ca4204f962105406a14a4ebe7130c4e1c' as Hex,
};

const CHECKS: Check[] = [
  {
    name: '1. Secure randomness (polyfill)',
    run: async () => {
      const a = crypto.getRandomValues(new Uint8Array(32));
      const b = crypto.getRandomValues(new Uint8Array(32));
      assert(a.some((x) => x !== 0), 'all zero bytes');
      assert(a.join() !== b.join(), 'two calls returned the same bytes');
      return 'crypto.getRandomValues works';
    },
  },
  {
    name: '2. viem: new wallet + sign + verify',
    run: async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const signature = await account.signMessage({ message: 'hello chainchat' });
      const valid = await verifyMessage({ address: account.address, message: 'hello chainchat', signature });
      assert(valid, 'signature did not verify');
      return `wallet ${account.address.slice(0, 10)}…`;
    },
  },
  {
    name: '3. Phase 3 vectors reproduced on phone',
    run: async () => {
      const encoded = encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint64' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint64' }],
        [VECTOR.conversationId, VECTOR.sender, 1n, `0x${'00'.repeat(32)}`, keccak256(VECTOR.ciphertext), VECTOR.clientTimestamp],
      );
      assert(keccak256(encoded) === VECTOR.messageHash, 'messageHash differs from vector');

      const signature = await privateKeyToAccount(VECTOR.aliceKey).signMessage({ message: { raw: VECTOR.messageHash } });
      assert(signature === VECTOR.signature, 'signature differs from vector');
      return 'messageHash + EIP-191 signature match byte for byte';
    },
  },
  {
    name: '4. viem → Anvil on the Mac',
    run: async () => {
      const client = createPublicClient({ chain: foundry, transport: http(`http://${HOST}:8545`) });
      const [chainId, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
      assert(chainId === 31337, `unexpected chain id ${chainId}`);
      return `chain ${chainId}, block ${block}`;
    },
  },
  {
    name: '5. tweetnacl: X25519 + encrypt/decrypt',
    run: async () => {
      const alice = nacl.box.keyPair();
      const bob = nacl.box.keyPair();
      const nonce = nacl.randomBytes(nacl.box.nonceLength);
      const plaintext = new TextEncoder().encode('Hi Bob, ready for the midterm?');

      const box = nacl.box(plaintext, nonce, bob.publicKey, alice.secretKey);
      const opened = nacl.box.open(box, nonce, alice.publicKey, bob.secretKey);
      assert(opened && new TextDecoder().decode(opened) === 'Hi Bob, ready for the midterm?', 'decryption failed');

      box[0] ^= 1; // flip one bit
      assert(nacl.box.open(box, nonce, alice.publicKey, bob.secretKey) === null, 'tampered box was accepted');
      return 'round trip ok, tampering detected';
    },
  },
  {
    name: '6. expo-secure-store (Keychain)',
    run: async () => {
      const key = 'spike_private_key';
      const value = generatePrivateKey();
      await SecureStore.setItemAsync(key, value);
      const loaded = await SecureStore.getItemAsync(key);
      await SecureStore.deleteItemAsync(key);
      assert(loaded === value, 'loaded value differs');
      assert((await SecureStore.getItemAsync(key)) === null, 'value still present after delete');
      return 'save / load / delete ok';
    },
  },
  {
    name: '7. SignalR → hub on the Mac',
    run: async () => {
      const connection = new signalR.HubConnectionBuilder().withUrl(`http://${HOST}:5090/hubs/echo`).build();
      await connection.start();
      try {
        const reply = await connection.invoke<string>('Echo', 'ping');
        assert(reply === 'ping', `unexpected reply ${reply}`);
        return `connected via ${connection.connectionId ? 'negotiated transport' : 'unknown'}, echo ok`;
      } finally {
        await connection.stop();
      }
    },
  },
  {
    name: '8. ChainChat API on the Mac',
    run: async () => {
      const response = await fetch(`http://${HOST}:5080/api/v1/system/info`);
      assert(response.ok, `HTTP ${response.status}`);
      const info = (await response.json()) as { contracts: Record<string, string> };
      return `${Object.keys(info.contracts).length} contracts: ${Object.keys(info.contracts).join(', ')}`;
    },
  },
];

/** Runs every check; results are also logged with a [SPIKE] prefix so they appear in the Metro terminal. */
export async function runAllChecks(onResult: (result: CheckResult) => void): Promise<void> {
  console.log(`[SPIKE] starting checks, host = ${HOST}`);
  for (const check of CHECKS) {
    const started = Date.now();
    let result: CheckResult;
    try {
      result = { name: check.name, ok: true, detail: await check.run(), ms: Date.now() - started };
    } catch (error) {
      result = { name: check.name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
    }
    console.log(`[SPIKE] ${result.ok ? 'PASS' : 'FAIL'} ${result.name} — ${result.detail} (${result.ms} ms)`);
    onResult(result);
  }
  console.log('[SPIKE] done');
}
