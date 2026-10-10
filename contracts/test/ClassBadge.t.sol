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

    uint256 internal student;
    uint256 internal instructor;

    event BadgeTypeCreated(uint256 indexed typeId, string name);

    function setUp() public {
        badge = new ClassBadge(owner, URI);
        vm.startPrank(owner);
        student = badge.createBadgeType("Student");
        instructor = badge.createBadgeType("Instructor");
        vm.stopPrank();
    }

    function test_constructor_setsMetadata() public {
        ClassBadge fresh = new ClassBadge(owner, URI);
        assertEq(fresh.name(), "ChainChat Class Badge");
        assertEq(fresh.symbol(), "CCB");
        assertEq(fresh.owner(), owner);
        assertEq(fresh.totalMinted(), 0);
        assertEq(fresh.badgeTypeCount(), 0);
    }

    function test_createBadgeType_assignsIncreasingIds() public {
        assertEq(student, 1);
        assertEq(instructor, 2);
        assertEq(badge.badgeTypeCount(), 2);
        assertEq(badge.badgeTypeName(student), "Student");
        assertEq(badge.badgeTypeName(instructor), "Instructor");

        vm.expectEmit(true, false, false, true);
        emit BadgeTypeCreated(3, "Assistant");
        vm.prank(owner);
        assertEq(badge.createBadgeType("Assistant"), 3);
    }

    function test_createBadgeType_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        badge.createBadgeType("Hacker");
    }

    function test_createBadgeType_rejectsBadNames() public {
        vm.startPrank(owner);
        vm.expectRevert(ClassBadge.InvalidBadgeName.selector);
        badge.createBadgeType("");
        vm.expectRevert(ClassBadge.InvalidBadgeName.selector);
        badge.createBadgeType("this badge name is longer than 32 characters");
        vm.stopPrank();
    }

    function test_badgeTypeName_revertsForUnknownType() public {
        vm.expectRevert(abi.encodeWithSelector(ClassBadge.UnknownBadgeType.selector, 0));
        badge.badgeTypeName(0);
        vm.expectRevert(abi.encodeWithSelector(ClassBadge.UnknownBadgeType.selector, 3));
        badge.badgeTypeName(3);
    }

    function test_mint_assignsIncreasingIdsAndTypes() public {
        vm.startPrank(owner);
        assertEq(badge.mint(alice, student), 1);
        assertEq(badge.mint(bob, instructor), 2);
        vm.stopPrank();

        assertEq(badge.ownerOf(1), alice);
        assertEq(badge.ownerOf(2), bob);
        assertEq(badge.typeOf(1), student);
        assertEq(badge.typeOf(2), instructor);
        assertEq(badge.balanceOf(alice), 1);
        assertEq(badge.balanceOfType(alice, student), 1);
        assertEq(badge.balanceOfType(alice, instructor), 0);
        assertEq(badge.totalMinted(), 2);
        assertEq(badge.tokenURI(1), URI);
    }

    function test_mint_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        badge.mint(alice, student);
    }

    function test_mint_revertsForUnknownType() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ClassBadge.UnknownBadgeType.selector, 9));
        badge.mint(alice, 9);
    }

    function test_tokenURI_and_typeOf_revertForUnmintedToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        badge.tokenURI(1);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        badge.typeOf(1);
    }

    /// @dev A group lists the badge types a wallet must hold (SDD §6.5).
    function test_holdsAll_requiresEveryType() public {
        uint256[] memory both = new uint256[](2);
        both[0] = student;
        both[1] = instructor;
        uint256[] memory none = new uint256[](0);

        assertTrue(badge.holdsAll(alice, none));
        assertFalse(badge.holdsAll(alice, both));

        vm.startPrank(owner);
        badge.mint(alice, student);
        assertFalse(badge.holdsAll(alice, both));
        badge.mint(alice, instructor);
        vm.stopPrank();

        assertTrue(badge.holdsAll(alice, both));
    }

    /// @dev Transferring the badge away is how group access is revoked (SDD §6.5).
    function test_transfer_movesTypeBalance() public {
        vm.startPrank(owner);
        uint256 id = badge.mint(alice, student);
        badge.mint(alice, instructor);
        vm.stopPrank();

        vm.prank(alice);
        badge.transferFrom(alice, bob, id);

        assertEq(badge.balanceOf(alice), 1);
        assertEq(badge.balanceOfType(alice, student), 0);
        assertEq(badge.balanceOfType(alice, instructor), 1);
        assertEq(badge.balanceOfType(bob, student), 1);
        assertEq(badge.typeOf(id), student);
    }
}
