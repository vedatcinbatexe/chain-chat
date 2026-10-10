// ChainChat demo bot: signs in as a local demo user (default @bob), verifies and decrypts incoming messages, and
// replies with a signed, hash-chained, encrypted message — an independent client that speaks the same protocol
// as the app. It shows "typing…" before replying, verifies payments on-chain, and in groups also reacts with 👍.
// LOCAL DEMO ONLY (see common.mjs).
// Usage: node scripts/demo/chat-bot.mjs [bob|alice|carol] [group invite link or code]
import { API, chain, conversationIdFor, demoUser, deployment, hashMessage, nacl, resolveUser, signalR, viem } from './common.mjs';

const { bytesToHex, hexToBytes, hexToString, stringToHex, recoverMessageAddress, parseAbi, parseEventLogs, formatUnits } = viem;
const { name, account, encSecret } = demoUser(process.argv[2] ?? 'bob');
const chatToken = deployment.ChatToken.address;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), `[@${name}]`, ...a);

async function signIn() {
  const n = await (await fetch(`${API}/api/v1/auth/nonce`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account.address }) })).json();
  const now = new Date();
  const message = [`${n.domain} wants you to sign in with your Ethereum account:`, account.address, '', n.statement, '', `URI: ${n.uri}`, 'Version: 1', `Chain ID: ${n.chainId}`, `Nonce: ${n.nonce}`, `Issued At: ${now.toISOString()}`, `Expiration Time: ${new Date(now.getTime() + 300000).toISOString()}`].join('\n');
  const r = await fetch(`${API}/api/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature: await account.signMessage({ message }) }) });
  if (!r.ok) throw new Error(`sign-in failed: ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

const token = await signIn();
log('signed in as', account.address);
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Optional: join a group by its invite link/code.
const invite = process.argv[3]?.trim().match(/([A-Za-z0-9]{16,32})\/?$/)?.[1];
if (invite) {
  const r = await fetch(`${API}/api/v1/groups/join`, { method: 'POST', headers: auth, body: JSON.stringify({ inviteCode: invite }) });
  if (!r.ok) throw new Error(`join failed: ${r.status} ${await r.text()}`);
  const group = await r.json();
  log(`joined group "${group.name}" (${group.members.length} members)`);
}

/** The group for a conversation id, or null for a 1:1 chat. Always fresh, so new members get the next message. */
async function groupOf(conversationId) {
  const r = await fetch(`${API}/api/v1/groups/${conversationId}`, { headers: auth });
  return r.ok ? r.json() : null;
}

// Group encryption (SDD §6.5): one random message key, wrapped for every member's on-chain key.
function decryptGroup(ciphertext, senderKey) {
  try {
    const envelope = JSON.parse(hexToString(ciphertext));
    const entry = hexToBytes(envelope.k[account.address.toLowerCase()]);
    const messageKey = nacl.box.open(entry.subarray(24), entry.subarray(0, 24), hexToBytes(senderKey), encSecret);
    const plain = messageKey && nacl.secretbox.open(hexToBytes(envelope.c), hexToBytes(envelope.n), messageKey);
    return plain ? new TextDecoder().decode(plain) : null;
  } catch {
    return null;
  }
}
async function encryptGroup(text, members) {
  const messageKey = nacl.randomBytes(32);
  const nonce = nacl.randomBytes(24);
  const k = {};
  for (const member of members) {
    const registration = await resolveUser(member.address);
    if (!registration.username) continue;
    const wrapNonce = nacl.randomBytes(24);
    k[member.address.toLowerCase()] = bytesToHex(new Uint8Array([...wrapNonce, ...nacl.box(messageKey, wrapNonce, hexToBytes(registration.encryptionKey), encSecret)]));
  }
  return stringToHex(JSON.stringify({ v: 1, n: bytesToHex(nonce), c: bytesToHex(nacl.secretbox(new TextEncoder().encode(text), nonce, messageKey)), k }));
}

const heads = new Map(); // conversationId → { seq, messageHash } of my last message
async function myHead(conversationId) {
  if (heads.has(conversationId)) return heads.get(conversationId);
  const r = await fetch(`${API}/api/v1/conversations/${conversationId}/messages?limit=200`, { headers: { authorization: `Bearer ${token}` } });
  const mine = r.ok ? (await r.json()).filter((m) => m.sender.toLowerCase() === account.address.toLowerCase()) : [];
  const last = mine.sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq))).at(-1);
  const head = last ? { seq: BigInt(last.seq), messageHash: last.messageHash } : { seq: 0n, messageHash: `0x${'00'.repeat(32)}` };
  heads.set(conversationId, head);
  return head;
}

const connection = new signalR.HubConnectionBuilder().withUrl(`${API}/hubs/chat`, { accessTokenFactory: () => token }).withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 2000 }).configureLogging(signalR.LogLevel.Warning).build();

// Live events the bot does not act on (registered so SignalR does not warn about them).
for (const event of ['PaymentUpdated', 'TypingChanged', 'PresenceChanged', 'ReactionChanged', 'ConversationUpdated']) connection.on(event, () => {});

connection.on('MessageReceived', async (m) => {
  if (m.sender.toLowerCase() === account.address.toLowerCase()) return;
  const peer = await resolveUser(m.sender);
  const group = await groupOf(m.conversationId);

  const recomputed = hashMessage(m);
  const signer = await recoverMessageAddress({ message: { raw: recomputed }, signature: m.signature });
  const signatureOk = recomputed === m.messageHash.toLowerCase() && signer.toLowerCase() === m.sender.toLowerCase();

  let text;
  if (group) {
    text = decryptGroup(m.ciphertext, peer.encryptionKey);
  } else {
    const bytes = hexToBytes(m.ciphertext);
    const opened = nacl.box.open(bytes.subarray(24), bytes.subarray(0, 24), hexToBytes(peer.encryptionKey), encSecret);
    text = opened ? new TextDecoder().decode(opened) : null;
  }
  log(`← ${group ? `[${group.name}] ` : ''}@${peer.username} seq ${m.seq} | signature ${signatureOk ? 'VALID' : 'INVALID'} | decrypted: ${JSON.stringify(text)}`);
  if (!signatureOk || text === null) return;
  // Never answer another bot, or two bots in one group would talk forever.
  if (group && text.startsWith('🤖')) return;

  // A payment message: verify the transfer on-chain ourselves before thanking anyone.
  let replyText = `🤖 @${name} got your message: "${text}"`;
  let payment = null;
  try { payment = JSON.parse(text); } catch {}
  if (payment?.$chainchat === 'payment') {
    log(`  payment claim: ${formatUnits(BigInt(payment.amount), 18)} CHAT, tx ${payment.txHash.slice(0, 12)}… — checking the receipt on-chain`);
    const receipt = await chain.waitForTransactionReceipt({ hash: payment.txHash });
    const received = parseEventLogs({ abi: parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']), eventName: 'Transfer', logs: receipt.logs })
      .filter((l) => l.address.toLowerCase() === chatToken.toLowerCase() && l.args.from.toLowerCase() === m.sender.toLowerCase() && l.args.to.toLowerCase() === account.address.toLowerCase())
      .reduce((sum, l) => sum + l.args.value, 0n);
    log(`  on-chain: ${receipt.status}, received ${formatUnits(received, 18)} CHAT in block ${receipt.blockNumber}`);
    replyText = received > 0n
      ? `🤖 Thanks @${peer.username}! I verified ${formatUnits(received, 18)} CHAT on-chain (block ${receipt.blockNumber}).${payment.note ? ` Your note: "${payment.note}"` : ''}`
      : `🤖 Hmm — that transaction did not send me any CHAT. Nice try.`;
  }

  // Group extras: react to the message and show "typing…" for a moment.
  const conversationId = group ? m.conversationId : conversationIdFor(account.address, m.sender);
  if (group) {
    await connection.invoke('React', m.id, '👍').catch((error) => log('reaction failed:', error.message));
    replyText = `🤖 @${name} here — @${peer.username} said: "${text}"`;
  }
  // Show "typing…" for a while (re-sent every 2 s, the apps drop it after 6 s without an update).
  log('  typing…');
  for (let i = 0; i < 3; i++) {
    await connection.invoke('Typing', conversationId, true).catch(() => {});
    await sleep(2000);
  }

  // Reply: encrypt to the sender's on-chain key (or to every group member), link to my previous message, sign.
  const head = await myHead(conversationId);
  let ciphertext;
  if (group) {
    ciphertext = await encryptGroup(replyText, group.members);
  } else {
    const nonce = nacl.randomBytes(24);
    const box = nacl.box(new TextEncoder().encode(replyText), nonce, hexToBytes(peer.encryptionKey), encSecret);
    ciphertext = bytesToHex(new Uint8Array([...nonce, ...box]));
  }
  const reply = { conversationId, sender: account.address, seq: (head.seq + 1n).toString(), prevHash: head.messageHash, ciphertext, clientTimestamp: Date.now().toString() };
  const hash = hashMessage(reply);
  const signature = await account.signMessage({ message: { raw: hash } });

  try {
    const stored = await connection.invoke('SendMessage', { conversationId, recipient: group ? null : m.sender, seq: reply.seq, prevHash: reply.prevHash, ciphertext, clientTimestamp: reply.clientTimestamp, signature });
    heads.set(conversationId, { seq: head.seq + 1n, messageHash: hash });
    await connection.invoke('Typing', conversationId, false).catch(() => {});
    log(`→ replied seq ${stored.seq} (stored as message #${stored.id})`);
  } catch (error) {
    log('reply rejected:', error.message);
    heads.delete(conversationId);
  }
});

await connection.start();
log('connected to /hubs/chat — waiting for messages');
