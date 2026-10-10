// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChainChat Registry
/// @notice On-chain directory: address ↔ username ↔ X25519 encryption public key (SDD §5.2).
/// @dev Clients resolve encryption keys from this contract, not from the backend, so the server
///      cannot swap a user's key (man-in-the-middle protection, SDD §8.2).
contract Registry {
    struct User {
        string username;
        bytes32 encryptionKey; // X25519 public key
        uint64 registeredAt; // block timestamp
    }

    uint256 public constant MIN_USERNAME_LENGTH = 3;
    uint256 public constant MAX_USERNAME_LENGTH = 20;

    mapping(address user => User) private _users;
    mapping(bytes32 usernameHash => address user) private _ownerOfUsername;

    event UserRegistered(address indexed user, string username, bytes32 encryptionKey);
    event KeyUpdated(address indexed user, bytes32 encryptionKey);

    error AlreadyRegistered();
    error NotRegistered();
    error UsernameTaken();
    error InvalidUsername();
    error InvalidEncryptionKey();

    /// @notice Registers the caller with a unique username and an encryption public key.
    /// @param username 3–20 characters from [a-z0-9_].
    /// @param encryptionKey The caller's X25519 public key (must not be zero).
    function register(string calldata username, bytes32 encryptionKey) external {
        if (isRegistered(msg.sender)) revert AlreadyRegistered();
        if (!isValidUsername(username)) revert InvalidUsername();
        if (encryptionKey == bytes32(0)) revert InvalidEncryptionKey();

        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerOfUsername[usernameHash] != address(0)) revert UsernameTaken();

        _ownerOfUsername[usernameHash] = msg.sender;
        // casting to 'uint64' is safe because a uint64 of seconds lasts ~584 billion years
        // forge-lint: disable-next-line(unsafe-typecast)
        _users[msg.sender] =
            User({username: username, encryptionKey: encryptionKey, registeredAt: uint64(block.timestamp)});

        emit UserRegistered(msg.sender, username, encryptionKey);
    }

    /// @notice Rotates the caller's encryption key. The username and identity stay the same.
    function updateKey(bytes32 encryptionKey) external {
        if (!isRegistered(msg.sender)) revert NotRegistered();
        if (encryptionKey == bytes32(0)) revert InvalidEncryptionKey();

        _users[msg.sender].encryptionKey = encryptionKey;
        emit KeyUpdated(msg.sender, encryptionKey);
    }

    /// @return user The address that owns `username`, or zero if it is not registered.
    /// @return encryptionKey That user's current encryption key.
    function resolveByName(string calldata username) external view returns (address user, bytes32 encryptionKey) {
        user = _ownerOfUsername[keccak256(bytes(username))];
        encryptionKey = _users[user].encryptionKey;
    }

    /// @notice Returns the registration of `user`; all fields are empty if not registered.
    function resolveByAddress(address user) external view returns (User memory) {
        return _users[user];
    }

    // slither-disable-next-line timestamp (false positive: compares a string length, not a time)
    function isRegistered(address user) public view returns (bool) {
        return bytes(_users[user].username).length != 0;
    }

    /// @notice Usernames are 3–20 characters of lowercase letters, digits and underscores.
    /// @dev Lowercase-only means "Alice" and "alice" can never be two different users.
    function isValidUsername(string calldata username) public pure returns (bool) {
        bytes calldata b = bytes(username);
        if (b.length < MIN_USERNAME_LENGTH || b.length > MAX_USERNAME_LENGTH) return false;

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isLower = c >= 0x61 && c <= 0x7a; // a-z
            bool isDigit = c >= 0x30 && c <= 0x39; // 0-9
            if (!isLower && !isDigit && c != 0x5f) return false; // _
        }
        return true;
    }
}
