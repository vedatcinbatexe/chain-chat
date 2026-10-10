// SDD §14 step 6, scenario 3 — "a sender key compromised after anchoring".
// Mallory controls the database AND has bob's private key. She rewrites bob's first message in a 1:1 conversation
// and re-signs it plus every later bob message, so signatures and hash chain look perfect. Only the on-chain
// Merkle root can catch it: in the app, tap the message → Verify. LOCAL DEMO ONLY (see common.mjs).
//
// Usage: node scripts/demo/stolen-key-attack.mjs attack <peerAddress> ["<fake text>"]
//        node scripts/demo/stolen-key-attack.mjs restore
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conversationIdFor, demoUser, hashMessage, nacl, resolveUser, viem } from './common.mjs';

const { bytesToHex, hexToBytes, getAddress } = viem;
const [mode, peerArg, fakeText = 'Actually, you owe me 1000 CHAT. I never agreed to anything else.'] = process.argv.slice(2);

const BACKUP = join(dirname(fileURLToPath(import.meta.url)), '.stolen-key-backup.json');
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'chainchat-postgres', 'psql', '-U', 'chainchat', '-d', 'chainchat', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: sql }).toString().trim();

if (mode === 'restore') {
  if (!existsSync(BACKUP)) throw new Error('No backup found — nothing to restore.');
  const rows = JSON.parse(readFileSync(BACKUP, 'utf8'));
  // Two passes: move hashes to temporary values first, so the unique index on message_hash is never violated mid-way.
  psql(`BEGIN;\n${rows.map((r) => `UPDATE messages SET message_hash='tmp-${r.id}' WHERE id=${r.id};`).join('\n')}\n${rows
    .map((r) => `UPDATE messages SET ciphertext=decode('${r.ciphertext}','hex'), prev_hash='${r.prev_hash}', message_hash='${r.message_hash}', signature=decode('${r.signature}','hex') WHERE id=${r.id};`)
    .join('\n')}\nCOMMIT;`);
  rmSync(BACKUP);
  console.log(`Restored ${rows.length} original bob message(s).`);
  process.exit(0);
}

if (mode !== 'attack') throw new Error('mode must be "attack" or "restore"');

if (!peerArg) throw new Error('Usage: stolen-key-attack.mjs attack <peerAddress> ["<fake text>"]');

// Bob's stolen keys: his wallet key and his encryption secret.
const { account: bob, encSecret: bobEncSecret } = demoUser('bob');
const peer = getAddress(peerArg);
const conversationId = conversationIdFor(bob.address, peer);

const rows = JSON.parse(psql(`SELECT coalesce(json_agg(r ORDER BY r.seq), '[]') FROM (
  SELECT id, seq, prev_hash, message_hash, encode(ciphertext,'hex') AS ciphertext, encode(signature,'hex') AS signature, client_timestamp::text, anchor_batch_id
  FROM messages WHERE conversation_id='${conversationId}' AND sender='${bob.address.toLowerCase()}') r;`));
if (rows.length === 0) throw new Error('Bob has no messages in this conversation.');
if (!existsSync(BACKUP)) writeFileSync(BACKUP, JSON.stringify(rows, null, 2));

// Encrypt the fake text exactly like bob's app would: to the peer's on-chain key.
const peerUser = await resolveUser(peer);
if (!peerUser.username) throw new Error('That address is not registered on ChainChat.');
const nonce = nacl.randomBytes(24);
const box = nacl.box(new TextEncoder().encode(fakeText), nonce, hexToBytes(peerUser.encryptionKey), bobEncSecret);
const fakeCiphertext = bytesToHex(new Uint8Array([...nonce, ...box]));

const updates = [];
let prevHash = rows[0].prev_hash; // the genesis link (zero) stays the same
for (const [i, row] of rows.entries()) {
  const ciphertext = i === 0 ? fakeCiphertext : `0x${row.ciphertext}`;
  const hash = hashMessage({ conversationId, sender: bob.address, seq: row.seq, prevHash, ciphertext, clientTimestamp: row.client_timestamp });
  const signature = await bob.signMessage({ message: { raw: hash } }); // valid — the key is genuinely bob's
  updates.push({ id: row.id, seq: row.seq, ciphertext, prevHash, hash, signature, old: row.message_hash, anchored: row.anchor_batch_id !== null });
  prevHash = hash;
}

psql(`BEGIN;\n${updates.map((u) => `UPDATE messages SET message_hash='tmp-${u.id}' WHERE id=${u.id};`).join('\n')}\n${updates
  .map((u) => `UPDATE messages SET ciphertext=decode('${u.ciphertext.slice(2)}','hex'), prev_hash='${u.prevHash}', message_hash='${u.hash}', signature=decode('${u.signature.slice(2)}','hex') WHERE id=${u.id};`)
  .join('\n')}\nCOMMIT;`);

console.log(`Mallory rewrote @${peerUser.username}'s conversation with bob (${conversationId.slice(0, 12)}…):`);
console.log(`  fake text in bob's message #1: "${fakeText}"`);
for (const u of updates) {
  console.log(`  db id ${u.id} · seq ${u.seq} · hash ${u.old.slice(0, 12)}… → ${u.hash.slice(0, 12)}… · re-signed with bob's key · ${u.anchored ? 'was anchored' : 'not anchored yet'}`);
}
console.log('The originals are backed up — undo with: node scripts/demo/stolen-key-attack.mjs restore');
