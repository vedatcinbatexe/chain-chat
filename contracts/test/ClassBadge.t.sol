// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ClassBadge} from "../src/ClassBadge.sol";

contract ClassBadgeTest is Test {
    ClassBadge internal badge;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    string internal constant URI = "ipfs://chainchat-class-badge";

    function setUp() public {
        badge = new ClassBadge(owner, URI);
    }

    function test_constructor_setsMetadata() public view {
        assertEq(badge.name(), "ChainChat Class Badge");
        assertEq(badge.symbol(), "CCB");
        assertEq(badge.owner(), owner);
        assertEq(badge.totalMinted(), 0);
    }

    function test_mint_assignsIncreasingIds() public {
        vm.startPrank(owner);
        assertEq(badge.mint(alice), 1);
        assertEq(badge.mint(bob), 2);
        vm.stopPrank();

        assertEq(badge.ownerOf(1), alice);
        assertEq(badge.ownerOf(2), bob);
        assertEq(badge.balanceOf(alice), 1);
        assertEq(badge.totalMinted(), 2);
        assertEq(badge.tokenURI(1), URI);
    }

    function test_mint_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        badge.mint(alice);
    }

    function test_tokenURI_revertsForUnmintedToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        badge.tokenURI(1);
    }

    /// @dev Transferring the badge away is how group access is revoked (SDD §6.5).
    function test_transfer_movesMembership() public {
        vm.prank(owner);
        uint256 id = badge.mint(alice);

        vm.prank(alice);
        badge.transferFrom(alice, bob, id);

        assertEq(badge.balanceOf(alice), 0);
        assertEq(badge.balanceOf(bob), 1);
    }
}
