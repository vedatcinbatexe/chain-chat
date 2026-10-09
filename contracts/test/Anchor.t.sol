// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Anchor} from "../src/Anchor.sol";

contract AnchorTest is Test {
    Anchor internal anchor;

    address internal owner = makeAddr("owner");
    address internal mallory = makeAddr("mallory");
    bytes32 internal constant ROOT = keccak256("root-1");

    function setUp() public {
        anchor = new Anchor(owner);
    }

    function test_anchorRoot_storesBatchAndEmits() public {
        vm.expectEmit(true, true, false, true, address(anchor));
        emit Anchor.RootAnchored(0, ROOT, 1, 10);

        vm.prank(owner);
        uint256 batchId = anchor.anchorRoot(ROOT, 1, 10);

        Anchor.Batch memory batch = anchor.getBatch(batchId);
        assertEq(batchId, 0);
        assertEq(batch.root, ROOT);
        assertEq(batch.fromMessageId, 1);
        assertEq(batch.toMessageId, 10);
        assertEq(batch.anchoredAt, block.timestamp);
        assertEq(anchor.batchCount(), 1);
        assertEq(anchor.lastAnchoredMessageId(), 10);
    }

    function test_anchorRoot_acceptsConsecutiveBatches() public {
        vm.startPrank(owner);
        anchor.anchorRoot(ROOT, 1, 10);
        assertEq(anchor.anchorRoot(keccak256("root-2"), 11, 25), 1);
        vm.stopPrank();
        assertEq(anchor.lastAnchoredMessageId(), 25);
    }

    function test_anchorRoot_onlyOwner() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        anchor.anchorRoot(ROOT, 1, 10);
    }

    function test_anchorRoot_rejectsEmptyRoot() public {
        vm.prank(owner);
        vm.expectRevert(Anchor.EmptyRoot.selector);
        anchor.anchorRoot(bytes32(0), 1, 10);
    }

    function test_anchorRoot_rejectsInvalidRange() public {
        vm.startPrank(owner);
        vm.expectRevert(Anchor.InvalidRange.selector);
        anchor.anchorRoot(ROOT, 0, 10); // message ids start at 1
        vm.expectRevert(Anchor.InvalidRange.selector);
        anchor.anchorRoot(ROOT, 10, 9);
        vm.stopPrank();
    }

    /// @dev History can never be rewritten: a range that touches anchored messages is rejected.
    function test_anchorRoot_rejectsOverlappingOrRepeatedRange() public {
        vm.startPrank(owner);
        anchor.anchorRoot(ROOT, 1, 10);

        vm.expectRevert(abi.encodeWithSelector(Anchor.OverlappingRange.selector, 10));
        anchor.anchorRoot(keccak256("rewrite"), 1, 10);

        vm.expectRevert(abi.encodeWithSelector(Anchor.OverlappingRange.selector, 10));
        anchor.anchorRoot(keccak256("overlap"), 10, 20);
        vm.stopPrank();
    }

    function test_getBatch_revertsForUnknownBatch() public {
        vm.expectRevert(abi.encodeWithSelector(Anchor.UnknownBatch.selector, 0));
        anchor.getBatch(0);
    }

    function test_verifyMessage_singleLeafBatch() public {
        bytes32 messageHash = keccak256("message");
        bytes32 leaf = anchor.leafHash(messageHash); // computed first: vm.prank applies to the next call only
        vm.prank(owner);
        uint256 batchId = anchor.anchorRoot(leaf, 1, 1);

        assertTrue(anchor.verifyMessage(batchId, messageHash, new bytes32[](0)));
        assertFalse(anchor.verifyMessage(batchId, keccak256("tampered"), new bytes32[](0)));
    }

    function test_verifyMessage_revertsForUnknownBatch() public {
        vm.expectRevert(abi.encodeWithSelector(Anchor.UnknownBatch.selector, 3));
        anchor.verifyMessage(3, ROOT, new bytes32[](0));
    }

    /// @dev Any strictly increasing sequence of non-empty ranges is accepted.
    function testFuzz_anchorRoot_increasingRanges(uint64 firstLength, uint64 gap, uint64 secondLength) public {
        firstLength = uint64(bound(firstLength, 0, 1e9));
        gap = uint64(bound(gap, 1, 1e9));
        secondLength = uint64(bound(secondLength, 0, 1e9));

        uint64 firstEnd = 1 + firstLength;
        uint64 secondStart = firstEnd + gap;

        vm.startPrank(owner);
        anchor.anchorRoot(ROOT, 1, firstEnd);
        anchor.anchorRoot(keccak256("next"), secondStart, secondStart + secondLength);
        vm.stopPrank();

        assertEq(anchor.lastAnchoredMessageId(), secondStart + secondLength);
    }

    /// @dev Any range starting at or before the last anchored id is rejected.
    function testFuzz_anchorRoot_rejectsAnyOverlap(uint64 lastId, uint64 newFrom) public {
        lastId = uint64(bound(lastId, 1, type(uint64).max - 1));
        newFrom = uint64(bound(newFrom, 1, lastId));

        vm.startPrank(owner);
        anchor.anchorRoot(ROOT, 1, lastId);
        vm.expectRevert(abi.encodeWithSelector(Anchor.OverlappingRange.selector, lastId));
        anchor.anchorRoot(keccak256("overlap"), newFrom, lastId + 1);
        vm.stopPrank();
    }
}
