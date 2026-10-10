// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";
import {ChatToken} from "../src/ChatToken.sol";
import {ClassBadge} from "../src/ClassBadge.sol";
import {Anchor} from "../src/Anchor.sol";
import {TestToken} from "../src/TestToken.sol";

/// @notice Deploys the ChainChat contracts and writes shared/deployments/{NETWORK}.json.
/// @dev Environment:
///      DEPLOYER_PRIVATE_KEY  (required) key of the admin / owner account
///      NETWORK               deployment file name, default "anvil"
///      BADGE_URI             ClassBadge metadata URI
///      CHAT_INITIAL_SUPPLY   ChatToken supply minted to the deployer (wei)
///      FORCE_DEPLOY          "true" to redeploy even if the existing deployment is live
///      An existing deployment is kept: only contracts that are missing (the extra test tokens) or outdated
///      (a ClassBadge without badge types) are deployed.
contract Deploy is Script {
    string internal constant DEPLOYMENTS_DIR = "../shared/deployments/";

    // Positions in the arrays below; the names are the keys in the deployment file.
    uint256 internal constant REGISTRY = 0;
    uint256 internal constant CHAT_TOKEN = 1;
    uint256 internal constant CLASS_BADGE = 2;
    uint256 internal constant ANCHOR = 3;
    uint256 internal constant TEST_USD = 4;
    uint256 internal constant TEST_BTC = 5;
    uint256 internal constant COUNT = 6;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        string memory network = vm.envOr("NETWORK", string("anvil"));
        string memory path = string.concat(DEPLOYMENTS_DIR, network, ".json");

        address[COUNT] memory addrs;
        uint256[COUNT] memory blocks;

        if (vm.envOr("FORCE_DEPLOY", false) || !_isLive(path)) {
            // A fresh deployment of everything.
            vm.startBroadcast(deployerKey);
            addrs[REGISTRY] = address(new Registry());
            addrs[CHAT_TOKEN] =
                address(new ChatToken(deployer, vm.envOr("CHAT_INITIAL_SUPPLY", uint256(1_000_000 ether))));
            addrs[CLASS_BADGE] = address(_deployBadge(deployer));
            addrs[ANCHOR] = address(new Anchor(deployer));
            addrs[TEST_USD] = address(new TestToken(deployer, "Test USD", "tUSD"));
            addrs[TEST_BTC] = address(new TestToken(deployer, "Test Bitcoin", "tBTC"));
            vm.stopBroadcast();
            for (uint256 i = 0; i < COUNT; i++) {
                blocks[i] = block.number;
            }
            _write(path, network, addrs, blocks);
            console.log("Deployed all contracts to chain %s by %s, written to %s", block.chainid, deployer, path);
            return;
        }

        // An existing deployment: keep it, and only add or replace what is missing or outdated, so users,
        // balances and messages stay.
        string memory json = vm.readFile(path);
        bool changed = false;
        for (uint256 i = 0; i < COUNT; i++) {
            string memory key = string.concat(".contracts.", _name(i));
            if (vm.keyExistsJson(json, key)) {
                addrs[i] = vm.parseJsonAddress(json, string.concat(key, ".address"));
                blocks[i] = vm.parseJsonUint(json, string.concat(key, ".deployBlock"));
            }
        }

        vm.startBroadcast(deployerKey);
        if (!_badgeHasTypes(addrs[CLASS_BADGE])) {
            addrs[CLASS_BADGE] = address(_deployBadge(deployer));
            blocks[CLASS_BADGE] = block.number;
            changed = true;
            console.log("ClassBadge upgraded (badge types): %s", addrs[CLASS_BADGE]);
        }
        if (addrs[TEST_USD].code.length == 0) {
            addrs[TEST_USD] = address(new TestToken(deployer, "Test USD", "tUSD"));
            blocks[TEST_USD] = block.number;
            changed = true;
            console.log("TestUSD (tUSD) added: %s", addrs[TEST_USD]);
        }
        if (addrs[TEST_BTC].code.length == 0) {
            addrs[TEST_BTC] = address(new TestToken(deployer, "Test Bitcoin", "tBTC"));
            blocks[TEST_BTC] = block.number;
            changed = true;
            console.log("TestBTC (tBTC) added: %s", addrs[TEST_BTC]);
        }
        vm.stopBroadcast();

        if (changed) {
            _write(path, network, addrs, blocks);
            console.log("Deployment file updated: %s", path);
        } else {
            console.log(
                "Contracts in %s are already deployed on this chain - skipping (set FORCE_DEPLOY=true to redeploy)",
                path
            );
        }
    }

    function _name(uint256 index) internal pure returns (string memory) {
        if (index == REGISTRY) return "Registry";
        if (index == CHAT_TOKEN) return "ChatToken";
        if (index == CLASS_BADGE) return "ClassBadge";
        if (index == ANCHOR) return "Anchor";
        if (index == TEST_USD) return "TestUSD";
        return "TestBTC";
    }

    /// @dev Writes shared/deployments/{NETWORK}.json with every contract's address and deploy block.
    function _write(
        string memory path,
        string memory network,
        address[COUNT] memory addrs,
        uint256[COUNT] memory blocks
    ) internal {
        string memory contracts = "contracts";
        string memory contractsJson;
        for (uint256 i = 0; i < COUNT; i++) {
            contractsJson = vm.serializeString(contracts, _name(i), _entry(_name(i), addrs[i], blocks[i]));
        }

        string memory root = "deployment";
        vm.serializeString(root, "network", network);
        vm.serializeUint(root, "chainId", block.chainid);
        vm.writeJson(vm.serializeString(root, "contracts", contractsJson), path);
    }

    /// @dev Deploys ClassBadge with the default badge types. Must be called while broadcasting as the deployer.
    function _deployBadge(address deployer) internal returns (ClassBadge badge) {
        badge = new ClassBadge(deployer, vm.envOr("BADGE_URI", string("ipfs://chainchat-class-badge")));
        badge.createBadgeType("Student");
        badge.createBadgeType("Assistant");
        badge.createBadgeType("Instructor");
    }

    /// @dev True if the deployed ClassBadge supports badge types (it answers badgeTypeCount()).
    function _badgeHasTypes(address badge) internal view returns (bool) {
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
