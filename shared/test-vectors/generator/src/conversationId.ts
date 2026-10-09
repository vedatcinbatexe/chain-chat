import { encodeAbiParameters, getAddress, hexToBigInt, keccak256, type Address, type Hex } from "viem";

/**
 * Conversation id for a 1:1 chat (SPEC.md §2).
 *
 * Both participants can compute it locally without asking the server:
 * the two addresses are sorted numerically so the result does not depend on who starts the chat.
 *
 *   conversationId = keccak256(abi.encode(address low, address high))
 */
export function directConversationId(a: Address, b: Address): Hex {
  const first = getAddress(a);
  const second = getAddress(b);
  if (first === second) {
    throw new Error("A direct conversation needs two different addresses");
  }

  const [low, high] = hexToBigInt(first) < hexToBigInt(second) ? [first, second] : [second, first];
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }], [low, high]));
}
