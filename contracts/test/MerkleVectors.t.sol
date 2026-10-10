// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Anchor} from "../src/Anchor.sol";

/// @notice Checks the shared Phase 3 Merkle vectors (shared/test-vectors/vectors/merkle.json) on-chain,
///         so Solidity agrees with the TypeScript reference and the C# backend (SPEC.md §6).
contract MerkleVectorsTest is Test {
    string internal constant VECTORS = "../shared/test-vectors/vectors/merkle.json";

    Anchor internal anchor;
    string internal json;

    function setUp() public {
        anchor = new Anchor(address(this));
        json = vm.readFile(VECTORS);
    }

    /// @dev Every leaf, root and proof in every tree case matches, both via OpenZeppelin and via Anchor.verifyMessage.
    function test_everyVectorProofVerifies() public {
        uint256 cases;
        uint64 nextMessageId = 1;

        for (uint256 i = 0; vm.keyExistsJson(json, _path(".cases", i, "")); i++) {
            bytes32[] memory messageHashes = vm.parseJsonBytes32Array(json, _path(".cases", i, ".input.messageHashes"));
            bytes32[] memory leaves = vm.parseJsonBytes32Array(json, _path(".cases", i, ".expected.leaves"));
            bytes32 root = vm.parseJsonBytes32(json, _path(".cases", i, ".expected.root"));

            uint64 lastMessageId = nextMessageId + uint64(leaves.length) - 1;
            uint256 batchId = anchor.anchorRoot(root, nextMessageId, lastMessageId);
            nextMessageId = lastMessageId + 1;

            for (uint256 j = 0; j < leaves.length; j++) {
                string memory proofPath =
                    string.concat(_path(".cases", i, ".expected.proofs"), "[", vm.toString(j), "]");
                bytes32[] memory proof = vm.parseJsonBytes32Array(json, proofPath);

                assertEq(anchor.leafHash(messageHashes[j]), leaves[j], "leaf hash differs from vector");
                assertTrue(MerkleProof.verify(proof, root, leaves[j]), "OpenZeppelin rejected a vector proof");
                assertTrue(anchor.verifyMessage(batchId, messageHashes[j], proof), "Anchor rejected a vector proof");
            }
            cases++;
        }

        assertEq(cases, 8, "unexpected number of tree cases in merkle.json");
    }

    /// @dev Every must-fail case in the vectors is rejected.
    function test_everyNegativeVectorIsRejected() public view {
        uint256 cases;

        for (uint256 i = 0; vm.keyExistsJson(json, _path(".negative", i, "")); i++) {
            bytes32 leaf = vm.parseJsonBytes32(json, _path(".negative", i, ".leaf"));
            bytes32[] memory proof = vm.parseJsonBytes32Array(json, _path(".negative", i, ".proof"));
            bytes32 root = vm.parseJsonBytes32(json, _path(".negative", i, ".root"));

            assertFalse(MerkleProof.verify(proof, root, leaf), vm.parseJsonString(json, _path(".negative", i, ".name")));
            cases++;
        }

        assertEq(cases, 4, "unexpected number of negative cases in merkle.json");
    }

    function _path(string memory array, uint256 index, string memory suffix) internal pure returns (string memory) {
        return string.concat(array, "[", vm.toString(index), "]", suffix);
    }
}
