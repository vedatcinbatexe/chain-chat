// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainChat Class Badge (CCB)
/// @notice ERC-721 membership badge that gates group chats (SDD §6.5).
/// @dev Badges are transferable on purpose: transferring a badge away revokes group access,
///      which the indexer and clients detect via `balanceOf`.
contract ClassBadge is ERC721, Ownable {
    uint256 private _nextTokenId = 1;
    string private _badgeURI;

    constructor(address initialOwner, string memory badgeURI) ERC721("ChainChat Class Badge", "CCB") Ownable(initialOwner) {
        _badgeURI = badgeURI;
    }

    /// @notice Mints a new badge to `to`. Only the admin (course instructor / demo operator) can mint.
    /// @return tokenId The id of the new badge.
    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }

    /// @notice Total number of badges minted so far.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Every badge shares the same metadata.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _badgeURI;
    }
}
