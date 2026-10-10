// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainChat Class Badge (CCB)
/// @notice ERC-721 badges that gate group chats (SDD §6.5). Every badge has a *type* (e.g. "Student",
///         "Instructor"); a group lists the badge types a wallet must hold to join.
/// @dev Badges are transferable on purpose: transferring a badge away revokes group access,
///      which the indexer and clients detect via `balanceOfType` / `holdsAll`.
contract ClassBadge is ERC721, Ownable {
    uint256 public constant MAX_NAME_LENGTH = 32;

    uint256 private _nextTokenId = 1;
    string private _badgeURI;

    /// @dev Badge type ids start at 1: type `id` is `_typeNames[id - 1]`.
    string[] private _typeNames;
    mapping(uint256 tokenId => uint256 typeId) private _typeOf;
    mapping(address owner => mapping(uint256 typeId => uint256 count)) private _typeBalances;

    event BadgeTypeCreated(uint256 indexed typeId, string name);

    error InvalidBadgeName();
    error UnknownBadgeType(uint256 typeId);

    constructor(address initialOwner, string memory badgeURI) ERC721("ChainChat Class Badge", "CCB") Ownable(initialOwner) {
        _badgeURI = badgeURI;
    }

    /// @notice Adds a new kind of badge. Only the admin can do this.
    /// @return typeId The id of the new badge type (1, 2, 3, ...).
    function createBadgeType(string calldata name) external onlyOwner returns (uint256 typeId) {
        uint256 length = bytes(name).length;
        if (length == 0 || length > MAX_NAME_LENGTH) revert InvalidBadgeName();

        _typeNames.push(name);
        typeId = _typeNames.length;
        emit BadgeTypeCreated(typeId, name);
    }

    /// @notice Mints a new badge of `typeId` to `to`. Only the admin (course instructor / demo operator) can mint.
    /// @return tokenId The id of the new badge.
    function mint(address to, uint256 typeId) external onlyOwner returns (uint256 tokenId) {
        _requireType(typeId);
        tokenId = _nextTokenId++;
        _typeOf[tokenId] = typeId;
        _safeMint(to, tokenId);
    }

    /// @notice Total number of badges minted so far.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Number of badge types; valid type ids are 1..badgeTypeCount().
    function badgeTypeCount() external view returns (uint256) {
        return _typeNames.length;
    }

    function badgeTypeName(uint256 typeId) external view returns (string memory) {
        _requireType(typeId);
        return _typeNames[typeId - 1];
    }

    /// @notice The badge type of a minted badge.
    function typeOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _typeOf[tokenId];
    }

    /// @notice How many badges of `typeId` `owner` holds.
    function balanceOfType(address owner, uint256 typeId) public view returns (uint256) {
        return _typeBalances[owner][typeId];
    }

    /// @notice True if `owner` holds at least one badge of every type in `typeIds` (true for an empty list).
    function holdsAll(address owner, uint256[] calldata typeIds) external view returns (bool) {
        for (uint256 i = 0; i < typeIds.length; i++) {
            if (balanceOfType(owner, typeIds[i]) == 0) return false;
        }
        return true;
    }

    /// @notice Every badge shares the same metadata.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _badgeURI;
    }

    /// @dev Keeps the per-type balances in step with every mint and transfer.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        uint256 typeId = _typeOf[tokenId];
        if (from != address(0)) _typeBalances[from][typeId] -= 1;
        if (to != address(0)) _typeBalances[to][typeId] += 1;
    }

    function _requireType(uint256 typeId) private view {
        if (typeId == 0 || typeId > _typeNames.length) revert UnknownBadgeType(typeId);
    }
}
