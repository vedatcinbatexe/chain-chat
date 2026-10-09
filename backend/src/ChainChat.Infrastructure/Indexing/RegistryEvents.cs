using Nethereum.ABI.FunctionEncoding.Attributes;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>Registry.UserRegistered(address indexed user, string username, bytes32 encryptionKey)</summary>
[Event("UserRegistered")]
public sealed class UserRegisteredEvent : IEventDTO
{
    [Parameter("address", "user", 1, true)]
    public string User { get; set; } = "";

    [Parameter("string", "username", 2, false)]
    public string Username { get; set; } = "";

    [Parameter("bytes32", "encryptionKey", 3, false)]
    public byte[] EncryptionKey { get; set; } = [];
}

/// <summary>Registry.KeyUpdated(address indexed user, bytes32 encryptionKey)</summary>
[Event("KeyUpdated")]
public sealed class KeyUpdatedEvent : IEventDTO
{
    [Parameter("address", "user", 1, true)]
    public string User { get; set; } = "";

    [Parameter("bytes32", "encryptionKey", 2, false)]
    public byte[] EncryptionKey { get; set; } = [];
}
