import { concat, encodeAbiParameters, keccak256, numberToHex, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { directConversationId } from "./conversationId.js";
import { checkChainLink } from "./hashChain.js";
import { ciphertextHash, encodeMessage, messageHash, UINT64_MAX, ZERO_HASH, type MessageHeader } from "./messageHash.js";
import { leafHash, merkleProof, merkleRoot, verifyProof } from "./merkle.js";
import { SECP256K1_N, signingDigest, signMessageHash, splitSignature, verifyMessageSignature } from "./signature.js";

/**
 * Anvil's default, publicly known development keys (accounts #0–#2).
 * They exist in every Foundry install and must never hold real funds.
 */
const ANVIL_KEYS = {
  alice: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  bob: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  carol: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const satisfies Record<string, Hex>;

type Name = keyof typeof ANVIL_KEYS;

const address = (name: Name): Address => privateKeyToAccount(ANVIL_KEYS[name]).address;

/** Fixed timestamp so the vectors never change: 2026-01-01T00:00:00.000Z. */
const BASE_TIMESTAMP = 1767225600000n;

/** Opaque stand-in for real XSalsa20-Poly1305 output — the spec treats ciphertext as raw bytes. */
const fakeCiphertext = (label: string): Hex => toHex(`ciphertext:${label}`);

const groupConversationId = keccak256(toHex("chainchat:test-vectors:group"));

/** JSON form of a header: uint64 values as decimal strings, so no language loses precision. */
function headerToJson(header: MessageHeader) {
  return {
    conversationId: header.conversationId,
    sender: header.sender,
    seq: header.seq.toString(),
    prevHash: header.prevHash,
    ciphertext: header.ciphertext,
    clientTimestamp: header.clientTimestamp.toString(),
  };
}

function messageHashCase(name: string, header: MessageHeader) {
  return {
    name,
    input: headerToJson(header),
    expected: {
      ciphertextHash: ciphertextHash(header.ciphertext),
      encoded: encodeMessage(header),
      messageHash: messageHash(header),
    },
  };
}

function buildConversationIdVectors() {
  const pairs: [string, Name, Name][] = [
    ["alice and bob", "alice", "bob"],
    ["bob and alice (same id as above)", "bob", "alice"],
    ["alice and carol", "alice", "carol"],
    ["carol and bob", "carol", "bob"],
  ];

  return {
    description: "1:1 conversation ids: keccak256(abi.encode(lowerAddress, higherAddress)). See SPEC.md §2.",
    cases: pairs.map(([name, a, b]) => ({
      name,
      input: { a: address(a), b: address(b) },
      expected: { conversationId: directConversationId(address(a), address(b)) },
    })),
  };
}

/** Alice's first three messages to Bob, correctly chained. Reused by several vector files. */
function aliceChain(): { header: MessageHeader; hash: Hex }[] {
  const conversationId = directConversationId(address("alice"), address("bob"));
  const chain: { header: MessageHeader; hash: Hex }[] = [];
  let prevHash = ZERO_HASH;

  for (let seq = 1n; seq <= 3n; seq++) {
    const header: MessageHeader = {
      conversationId,
      sender: address("alice"),
      seq,
      prevHash,
      ciphertext: fakeCiphertext(`alice->bob #${seq}`),
      clientTimestamp: BASE_TIMESTAMP + seq * 1000n,
    };
    const hash = messageHash(header);
    chain.push({ header, hash });
    prevHash = hash;
  }

  return chain;
}

function buildMessageHashVectors() {
  const chain = aliceChain();
  const first = chain[0]!.header;

  return {
    description:
      "messageHash = keccak256(abi.encode(bytes32 conversationId, address sender, uint64 seq, bytes32 prevHash, bytes32 keccak256(ciphertext), uint64 clientTimestamp)). See SPEC.md §3.",
    cases: [
      messageHashCase("first message (seq 1, prevHash = zero)", first),
      messageHashCase("second message, chained to the first", chain[1]!.header),
      messageHashCase("third message, chained to the second", chain[2]!.header),
      messageHashCase("same content and seq, different conversation (group)", { ...first, conversationId: groupConversationId }),
      messageHashCase("same content and seq, different sender", {
        ...first,
        sender: address("carol"),
        conversationId: directConversationId(address("carol"), address("bob")),
      }),
      messageHashCase("one-byte ciphertext", { ...first, ciphertext: "0x00" }),
      messageHashCase("maximum uint64 seq and timestamp", {
        ...first,
        seq: UINT64_MAX,
        prevHash: chain[2]!.hash,
        clientTimestamp: UINT64_MAX,
      }),
    ],
  };
}

function buildHashChainVectors() {
  const [m1, m2, m3] = aliceChain() as [{ header: MessageHeader; hash: Hex }, { header: MessageHeader; hash: Hex }, { header: MessageHeader; hash: Hex }];
  const link = (m: { header: MessageHeader; hash: Hex }) => ({ seq: m.header.seq, messageHash: m.hash });
  const next = (seq: bigint, prevHash: Hex) => ({ seq, prevHash });

  const cases = [
    { name: "valid genesis: seq 1 with zero prevHash", previous: null, next: next(1n, ZERO_HASH) },
    { name: "valid link: message 1 -> 2", previous: link(m1), next: next(2n, m1.hash) },
    { name: "valid link: message 2 -> 3", previous: link(m2), next: next(3n, m2.hash) },
    { name: "invalid genesis: first message has seq 2", previous: null, next: next(2n, m1.hash) },
    { name: "invalid genesis: seq 1 with non-zero prevHash", previous: null, next: next(1n, m1.hash) },
    { name: "seq gap: message 2 was deleted (1 -> 3)", previous: link(m1), next: next(3n, m2.hash) },
    { name: "broken link: prevHash points to the wrong message", previous: link(m2), next: next(3n, m1.hash) },
    { name: "replay: message 2 delivered again after 3", previous: link(m3), next: next(2n, m1.hash) },
  ];

  return {
    description:
      "Per-sender hash chain checks. previous = the sender's last accepted message (null if none); next = the incoming message. See SPEC.md §4.",
    cases: cases.map((c) => ({
      name: c.name,
      input: {
        previous: c.previous && { seq: c.previous.seq.toString(), messageHash: c.previous.messageHash },
        next: { seq: c.next.seq.toString(), prevHash: c.next.prevHash },
      },
      expected: checkChainLink(c.previous, c.next),
    })),
  };
}

/** Turns a valid low-s signature into its malleable high-s twin: s' = n - s, v' flipped. */
function malleate(signature: Hex): Hex {
  const { r, s, v } = splitSignature(signature);
  const highS = SECP256K1_N - BigInt(s);
  return concat([r, numberToHex(highS, { size: 32 }), numberToHex(v === 27 ? 28 : 27, { size: 1 })]);
}

async function buildSignatureVectors() {
  const chain = aliceChain();
  const hash1 = chain[0]!.hash;
  const hash2 = chain[1]!.hash;

  const valid = await Promise.all(
    (["alice", "bob", "carol"] as const).map(async (name, i) => {
      const hash = chain[i]!.hash;
      const signature = await signMessageHash(ANVIL_KEYS[name], hash);
      return {
        name: `valid signature by ${name}`,
        input: { privateKey: ANVIL_KEYS[name], sender: address(name), messageHash: hash },
        expected: {
          digest: signingDigest(hash),
          signature,
          ...splitSignature(signature),
          check: await verifyMessageSignature(address(name), hash, signature),
        },
      };
    }),
  );

  const aliceSig = await signMessageHash(ANVIL_KEYS.alice, hash1);
  const bobSig = await signMessageHash(ANVIL_KEYS.bob, hash1);

  const invalidInputs: { name: string; sender: Address; messageHash: Hex; signature: Hex }[] = [
    { name: "high-s (malleated) signature", sender: address("alice"), messageHash: hash1, signature: malleate(aliceSig) },
    { name: "signed by bob, claimed by alice", sender: address("alice"), messageHash: hash1, signature: bobSig },
    { name: "signature over a different messageHash", sender: address("alice"), messageHash: hash2, signature: aliceSig },
    { name: "invalid v value (29)", sender: address("alice"), messageHash: hash1, signature: concat([aliceSig.slice(0, -2) as Hex, "0x1d"]) },
    { name: "truncated signature (64 bytes)", sender: address("alice"), messageHash: hash1, signature: aliceSig.slice(0, -2) as Hex },
  ];

  const invalid = await Promise.all(
    invalidInputs.map(async (c) => ({
      name: c.name,
      input: { sender: c.sender, messageHash: c.messageHash, signature: c.signature },
      expected: { check: await verifyMessageSignature(c.sender, c.messageHash, c.signature) },
    })),
  );

  return {
    description:
      "EIP-191 signatures over messageHash: digest = keccak256(\"\\x19Ethereum Signed Message:\\n32\" ‖ messageHash), signature = r ‖ s ‖ v (65 bytes, v ∈ {27, 28}, low-s only). Keys are Anvil's public development keys. See SPEC.md §5.",
    valid,
    invalid,
  };
}

/** Deterministic message hashes for tree tests: keccak256(abi.encode(uint256 i)). */
export function merkleTestMessageHash(i: number): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }], [BigInt(i)]));
}

function buildMerkleVectors() {
  const sizes = [1, 2, 3, 4, 5, 7, 8, 100];

  const cases = sizes.map((n) => {
    const messageHashes = Array.from({ length: n }, (_, i) => merkleTestMessageHash(i));
    const leaves = messageHashes.map(leafHash);
    return {
      name: n === 1 ? "1 leaf" : `${n} leaves`,
      input: { messageHashes },
      expected: {
        leaves,
        root: merkleRoot(leaves),
        proofs: leaves.map((_, i) => merkleProof(leaves, i)),
      },
    };
  });

  const four = Array.from({ length: 4 }, (_, i) => leafHash(merkleTestMessageHash(i)));
  const fourRoot = merkleRoot(four);
  const proof0 = merkleProof(four, 0);

  const negative = [
    { name: "proof for leaf 0 used with leaf 1", leaf: four[1]!, proof: proof0, root: fourRoot },
    { name: "valid proof against a different root", leaf: four[0]!, proof: proof0, root: merkleTestMessageHash(999) },
    { name: "messageHash used as leaf without double hashing", leaf: merkleTestMessageHash(0), proof: proof0, root: fourRoot },
    { name: "proof with the last sibling removed", leaf: four[0]!, proof: proof0.slice(0, -1), root: fourRoot },
  ].map((c) => ({ ...c, expected: { valid: verifyProof(c.leaf, c.proof, c.root) } }));

  return {
    description:
      "Merkle trees: leaf = keccak256(keccak256(abi.encode(bytes32 messageHash))), node = keccak256(sorted(a, b)), odd node promoted unchanged. Test message hashes are keccak256(abi.encode(uint256 i)) for i = 0..n-1. See SPEC.md §6.",
    cases,
    negative,
  };
}

/** Every vector file, keyed by file name. */
export async function buildAllVectors(): Promise<Record<string, unknown>> {
  return {
    "conversation-id.json": buildConversationIdVectors(),
    "message-hash.json": buildMessageHashVectors(),
    "hash-chain.json": buildHashChainVectors(),
    "signatures.json": await buildSignatureVectors(),
    "merkle.json": buildMerkleVectors(),
  };
}

/** Stable JSON text used for every vector file. */
export function toJsonText(data: unknown): string {
  return `${JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`;
}
