// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title ChainChat Anchor
/// @notice Append-only log of Merkle roots of message batches (SDD §6.6).
/// @dev Tree format: shared/test-vectors/SPEC.md §6 — double-hashed leaves, sorted-pair nodes,
///      odd node promoted. Compatible with OpenZeppelin MerkleProof.
contract Anchor is Ownable {
    struct Batch {
        bytes32 root;
        uint64 fromMessageId;
        uint64 toMessageId;
        uint64 anchoredAt; // block timestamp
    }

    Batch[] private _batches;

    /// @notice Highest message id anchored so far (0 if nothing is anchored yet).
    uint64 public lastAnchoredMessageId;

    event RootAnchored(uint256 indexed batchId, bytes32 indexed root, uint64 fromMessageId, uint64 toMessageId);

    error EmptyRoot();
    error InvalidRange();
    error OverlappingRange(uint64 lastAnchoredMessageId);
    error UnknownBatch(uint256 batchId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Anchors the Merkle root of messages `fromMessageId`..`toMessageId` (inclusive).
    /// @dev Ranges must be strictly increasing and never overlap, so a batch can never be re-anchored or rewritten.
    /// @return batchId Index of the new batch.
    function anchorRoot(bytes32 root, uint64 fromMessageId, uint64 toMessageId) external onlyOwner returns (uint256 batchId) {
        if (root == bytes32(0)) revert EmptyRoot();
        if (fromMessageId == 0 || fromMessageId > toMessageId) revert InvalidRange();

        if (fromMessageId <= lastAnchoredMessageId) revert OverlappingRange(lastAnchoredMessageId);

        lastAnchoredMessageId = toMessageId;
        batchId = _batches.length;
        // casting to 'uint64' is safe because a uint64 of seconds lasts ~584 billion years
        // forge-lint: disable-next-line(unsafe-typecast)
        _batches.push(Batch({root: root, fromMessageId: fromMessageId, toMessageId: toMessageId, anchoredAt: uint64(block.timestamp)}));

        emit RootAnchored(batchId, root, fromMessageId, toMessageId);
    }

    // slither-disable-next-line timestamp (false positive: compares an array length, not a time)
    function getBatch(uint256 batchId) external view returns (Batch memory) {
        if (batchId >= _batches.length) revert UnknownBatch(batchId);
        return _batches[batchId];
    }

    function batchCount() external view returns (uint256) {
        return _batches.length;
    }

    /// @notice Checks on-chain that a message is part of an anchored batch — anyone can call this from a block explorer.
    /// @param messageHash The message's hash (SPEC.md §3); the leaf is derived here.
    // slither-disable-next-line timestamp (false positive: compares an array length, not a time)
    function verifyMessage(uint256 batchId, bytes32 messageHash, bytes32[] calldata proof) external view returns (bool) {
        if (batchId >= _batches.length) revert UnknownBatch(batchId);
        return MerkleProof.verifyCalldata(proof, _batches[batchId].root, leafHash(messageHash));
    }

    /// @notice leaf = keccak256(keccak256(abi.encode(messageHash))) — SPEC.md §6.1.
    function leafHash(bytes32 messageHash) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(messageHash))));
    }
}
