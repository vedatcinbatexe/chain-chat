// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";
import {ChatToken} from "../src/ChatToken.sol";
import {ClassBadge} from "../src/ClassBadge.sol";
import {Anchor} from "../src/Anchor.sol";

/// @notice Deploys the four ChainChat contracts and writes shared/deployments/{NETWORK}.json.
/// @dev Environment:
///      DEPLOYER_PRIVATE_KEY  (required) key of the admin / owner account
///      NETWORK               deployment file name, default "anvil"
///      BADGE_URI             ClassBadge metadata URI
///      CHAT_INITIAL_SUPPLY   ChatToken supply minted to the deployer (wei)
///      FORCE_DEPLOY          "true" to redeploy even if the existing deployment is live
///      An existing deployment whose ClassBadge predates badge types gets only that contract replaced.
contract Deploy is Script {
    string internal constant DEPLOYMENTS_DIR = "../shared/deployments/";

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        string memory network = vm.envOr("NETWORK", string("anvil"));
        string memory path = string.concat(DEPLOYMENTS_DIR, network, ".json");

        if (!vm.envOr("FORCE_DEPLOY", false) && _isLive(path)) {
            if (_badgeHasTypes(path)) {
                console.log(
                    "Contracts in %s are already deployed on this chain - skipping (set FORCE_DEPLOY=true to redeploy)",
                    path
                );
            } else {
                // An older ClassBadge without badge types: replace only that contract, so users and messages stay.
                _redeployBadge(deployerKey, path);
            }
            return;
        }

        address deployer = vm.addr(deployerKey);
        uint256 deployBlock = block.number;

        vm.startBroadcast(deployerKey);
        Registry registry = new Registry();
        ChatToken token = new ChatToken(deployer, vm.envOr("CHAT_INITIAL_SUPPLY", uint256(1_000_000 ether)));
        ClassBadge badge = _deployBadge(deployer);
        Anchor anchor = new Anchor(deployer);
        vm.stopBroadcast();

        string memory contracts = "contracts";
        vm.serializeString(contracts, "Registry", _entry("Registry", address(registry), deployBlock));
        vm.serializeString(contracts, "ChatToken", _entry("ChatToken", address(token), deployBlock));
        vm.serializeString(contracts, "ClassBadge", _entry("ClassBadge", address(badge), deployBlock));
        string memory contractsJson =
            vm.serializeString(contracts, "Anchor", _entry("Anchor", address(anchor), deployBlock));

        string memory root = "deployment";
        vm.serializeString(root, "network", network);
        vm.serializeUint(root, "chainId", block.chainid);
        vm.writeJson(vm.serializeString(root, "contracts", contractsJson), path);

        console.log("Deployed to chain %s by %s, written to %s", block.chainid, deployer, path);
        console.log("  Registry   %s", address(registry));
        console.log("  ChatToken  %s", address(token));
        console.log("  ClassBadge %s", address(badge));
        console.log("  Anchor     %s", address(anchor));
    }

    /// @dev Deploys ClassBadge with the default badge types. Must be called while broadcasting as the deployer.
    function _deployBadge(address deployer) internal returns (ClassBadge badge) {
        badge = new ClassBadge(deployer, vm.envOr("BADGE_URI", string("ipfs://chainchat-class-badge")));
        badge.createBadgeType("Student");
        badge.createBadgeType("Assistant");
        badge.createBadgeType("Instructor");
    }

    /// @dev Deploys a new ClassBadge and replaces only its entry in the deployment file.
    function _redeployBadge(uint256 deployerKey, string memory path) internal {
        uint256 deployBlock = block.number;
        vm.startBroadcast(deployerKey);
        ClassBadge badge = _deployBadge(vm.addr(deployerKey));
        vm.stopBroadcast();

        vm.writeJson(_entry("ClassBadgeUpgrade", address(badge), deployBlock), path, ".contracts.ClassBadge");
        console.log("ClassBadge upgraded (badge types): %s, written to %s", address(badge), path);
    }

    /// @dev True if the deployed ClassBadge supports badge types (it answers badgeTypeCount()).
    function _badgeHasTypes(string memory path) internal view returns (bool) {
        address badge = vm.parseJsonAddress(vm.readFile(path), ".contracts.ClassBadge.address");
        (bool ok, bytes memory data) = badge.staticcall(abi.encodeWithSignature("badgeTypeCount()"));
        return ok && data.length == 32;
    }

    /// @dev One contract entry: { "address": ..., "deployBlock": ... }. deployBlock is at or before the real block.
    function _entry(string memory key, address addr, uint256 deployBlock) internal returns (string memory) {
        vm.serializeAddress(key, "address", addr);
        return vm.serializeUint(key, "deployBlock", deployBlock);
    }

    /// @dev True if the deployment file exists, is for this chain, and its Registry has code.
    function _isLive(string memory path) internal view returns (bool) {
        if (!vm.exists(path)) return false;

        string memory json = vm.readFile(path);
        if (vm.parseJsonUint(json, ".chainId") != block.chainid) return false;

        return vm.parseJsonAddress(json, ".contracts.Registry.address").code.length > 0;
    }
}
