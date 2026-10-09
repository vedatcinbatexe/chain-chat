// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ChatToken} from "../src/ChatToken.sol";

contract ChatTokenTest is Test {
    ChatToken internal token;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    uint256 internal constant INITIAL_SUPPLY = 1_000_000 ether;

    function setUp() public {
        vm.warp(1_767_225_600); // 2026-01-01, so "last claim = 0" is never confused with a real claim
        token = new ChatToken(owner, INITIAL_SUPPLY);
    }

    function test_constructor_setsMetadataAndSupply() public view {
        assertEq(token.name(), "ChainChat Token");
        assertEq(token.symbol(), "CHAT");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY);
        assertEq(token.owner(), owner);
    }

    function test_faucet_mintsAndEmits() public {
        vm.expectEmit(true, false, false, true, address(token));
        emit ChatToken.FaucetClaimed(alice, token.FAUCET_AMOUNT());

        vm.prank(alice);
        token.faucet();

        assertEq(token.balanceOf(alice), token.FAUCET_AMOUNT());
        assertEq(token.lastFaucetClaim(alice), block.timestamp);
    }

    function test_faucet_revertsDuringCooldown() public {
        vm.startPrank(alice);
        token.faucet();

        uint256 availableAt = vm.getBlockTimestamp() + token.FAUCET_COOLDOWN();
        vm.warp(availableAt - 1);
        vm.expectRevert(abi.encodeWithSelector(ChatToken.FaucetCooldown.selector, availableAt));
        token.faucet();
        vm.stopPrank();
    }

    function test_faucet_allowsClaimAfterCooldown() public {
        vm.startPrank(alice);
        token.faucet();
        vm.warp(block.timestamp + token.FAUCET_COOLDOWN());
        token.faucet();
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 2 * token.FAUCET_AMOUNT());
    }

    function test_mint_onlyOwner() public {
        vm.prank(owner);
        token.mint(alice, 5 ether);
        assertEq(token.balanceOf(alice), 5 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 5 ether);
    }

    function test_transfer_movesTokens() public {
        vm.prank(owner);
        assertTrue(token.transfer(alice, 42 ether));
        assertEq(token.balanceOf(alice), 42 ether);
    }

    /// @dev Claims succeed exactly when at least FAUCET_COOLDOWN has passed since the last claim.
    function testFuzz_faucet_cooldownBoundary(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 3 days);
        // Read constants up front: vm.prank applies to the next external call only.
        uint256 cooldown = token.FAUCET_COOLDOWN();
        uint256 amount = token.FAUCET_AMOUNT();

        vm.prank(alice);
        token.faucet();
        vm.warp(block.timestamp + elapsed);

        if (elapsed < cooldown) {
            vm.expectRevert();
            vm.prank(alice);
            token.faucet();
        } else {
            vm.prank(alice);
            token.faucet();
            assertEq(token.balanceOf(alice), 2 * amount);
        }
    }
}
