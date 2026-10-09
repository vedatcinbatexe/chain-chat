// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainChat Token (CHAT)
/// @notice Test-only ERC-20 used for in-chat payments (SDD §6.4). It has no real value.
/// @dev Anyone can claim a fixed amount from the faucet once per cooldown period.
contract ChatToken is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 100 ether; // 100 CHAT (18 decimals)
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address account => uint256 timestamp) public lastFaucetClaim;

    event FaucetClaimed(address indexed account, uint256 amount);

    error FaucetCooldown(uint256 availableAt);

    constructor(address initialOwner, uint256 initialSupply) ERC20("ChainChat Token", "CHAT") Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }

    /// @notice Mints FAUCET_AMOUNT to the caller, at most once per FAUCET_COOLDOWN.
    // slither-disable-next-line timestamp (intended: 1-day cooldown, seconds of validator drift are irrelevant)
    function faucet() external {
        uint256 last = lastFaucetClaim[msg.sender];
        // Validators can shift block.timestamp by seconds only; irrelevant for a 1-day cooldown on a test token.
        // forge-lint: disable-next-line(block-timestamp)
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(last + FAUCET_COOLDOWN);
        }

        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Lets the operator fund demo wallets (used by the seed script).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
