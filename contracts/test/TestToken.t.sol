// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TestToken} from "../src/TestToken.sol";

contract TestTokenTest is Test {
    TestToken internal token;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new TestToken(owner, "Test USD", "tUSD");
    }

    function test_constructor_setsMetadata() public view {
        assertEq(token.name(), "Test USD");
        assertEq(token.symbol(), "tUSD");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 0);
        assertEq(token.owner(), owner);
    }

    function test_mint_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1 ether);

        vm.prank(owner);
        token.mint(alice, 250 ether);
        assertEq(token.balanceOf(alice), 250 ether);
        assertEq(token.totalSupply(), 250 ether);
    }

    /// @dev Deposits and withdrawals are ordinary ERC-20 transfers.
    function test_transfer_movesBalance() public {
        vm.prank(owner);
        token.mint(alice, 100 ether);

        vm.prank(alice);
        assertTrue(token.transfer(bob, 40 ether));

        assertEq(token.balanceOf(alice), 60 ether);
        assertEq(token.balanceOf(bob), 40 ether);
    }
}
