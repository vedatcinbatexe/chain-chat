// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    bytes32 internal constant KEY_A = keccak256("alice-x25519");
    bytes32 internal constant KEY_B = keccak256("bob-x25519");

    function setUp() public {
        registry = new Registry();
    }

    function test_register_storesUserAndEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit Registry.UserRegistered(alice, "alice", KEY_A);

        vm.prank(alice);
        registry.register("alice", KEY_A);

        Registry.User memory user = registry.resolveByAddress(alice);
        assertEq(user.username, "alice");
        assertEq(user.encryptionKey, KEY_A);
        assertEq(user.registeredAt, block.timestamp);
        assertTrue(registry.isRegistered(alice));

        (address owner, bytes32 key) = registry.resolveByName("alice");
        assertEq(owner, alice);
        assertEq(key, KEY_A);
    }

    function test_register_revertsWhenAlreadyRegistered() public {
        vm.startPrank(alice);
        registry.register("alice", KEY_A);
        vm.expectRevert(Registry.AlreadyRegistered.selector);
        registry.register("alice2", KEY_A);
        vm.stopPrank();
    }

    function test_register_revertsWhenUsernameTaken() public {
        vm.prank(alice);
        registry.register("alice", KEY_A);

        vm.prank(bob);
        vm.expectRevert(Registry.UsernameTaken.selector);
        registry.register("alice", KEY_B);
    }

    function test_register_revertsOnZeroKey() public {
        vm.prank(alice);
        vm.expectRevert(Registry.InvalidEncryptionKey.selector);
        registry.register("alice", bytes32(0));
    }

    function test_register_revertsOnInvalidUsername() public {
        string[6] memory invalid = ["ab", "abcdefghijklmnopqrstu", "Alice", "al ice", "al-ice", unicode"alicé"];
        for (uint256 i = 0; i < invalid.length; i++) {
            vm.prank(alice);
            vm.expectRevert(Registry.InvalidUsername.selector);
            registry.register(invalid[i], KEY_A);
        }
    }

    function test_isValidUsername_acceptsAllowedCharacters() public view {
        assertTrue(registry.isValidUsername("abc"));
        assertTrue(registry.isValidUsername("vedat_cinbat_2026"));
        assertTrue(registry.isValidUsername("a1234567890123456789")); // 20 chars
    }

    function test_updateKey_rotatesKeyAndEmitsEvent() public {
        vm.startPrank(alice);
        registry.register("alice", KEY_A);

        vm.expectEmit(true, false, false, true, address(registry));
        emit Registry.KeyUpdated(alice, KEY_B);
        registry.updateKey(KEY_B);
        vm.stopPrank();

        assertEq(registry.resolveByAddress(alice).encryptionKey, KEY_B);
        assertEq(registry.resolveByAddress(alice).username, "alice");
    }

    function test_updateKey_revertsWhenNotRegistered() public {
        vm.prank(alice);
        vm.expectRevert(Registry.NotRegistered.selector);
        registry.updateKey(KEY_A);
    }

    function test_updateKey_revertsOnZeroKey() public {
        vm.startPrank(alice);
        registry.register("alice", KEY_A);
        vm.expectRevert(Registry.InvalidEncryptionKey.selector);
        registry.updateKey(bytes32(0));
        vm.stopPrank();
    }

    function test_resolve_returnsEmptyForUnknownUser() public view {
        (address owner, bytes32 key) = registry.resolveByName("nobody");
        assertEq(owner, address(0));
        assertEq(key, bytes32(0));
        assertFalse(registry.isRegistered(bob));
        assertEq(registry.resolveByAddress(bob).registeredAt, 0);
    }

    /// @dev Any valid username can be registered and resolved back.
    function testFuzz_register_roundTrip(uint256 length, bytes32 seed, bytes32 key) public {
        vm.assume(key != bytes32(0));
        string memory username = _validUsername(length, seed);
        assertTrue(registry.isValidUsername(username));

        vm.prank(alice);
        registry.register(username, key);

        (address owner, bytes32 resolvedKey) = registry.resolveByName(username);
        assertEq(owner, alice);
        assertEq(resolvedKey, key);
    }

    /// @dev Builds a valid username of 3–20 characters from [a-z0-9_] out of fuzzer input.
    function _validUsername(uint256 length, bytes32 seed) internal pure returns (string memory) {
        bytes memory charset = "abcdefghijklmnopqrstuvwxyz0123456789_";
        bytes memory name = new bytes(bound(length, 3, 20));
        for (uint256 i = 0; i < name.length; i++) {
            name[i] = charset[uint8(seed[i]) % charset.length];
        }
        return string(name);
    }

    /// @dev Random strings of the wrong length are always rejected.
    function testFuzz_isValidUsername_rejectsWrongLength(bytes calldata raw) public view {
        vm.assume(raw.length < 3 || raw.length > 20);
        assertFalse(registry.isValidUsername(string(raw)));
    }
}
