// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainChat Test Token
/// @notice A plain ERC-20 with owner-only minting, deployed once per extra test asset (e.g. tUSD, tBTC) so that
///         wallets can hold, deposit, withdraw and send more than one token. It has no value and no faucet:
///         balances are created by the admin key (the exchange portal, SDD §4.5).
contract TestToken is ERC20, Ownable {
    constructor(address initialOwner, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(initialOwner)
    {}

    /// @notice Mints `amount` to `to`. Only the admin can mint.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
