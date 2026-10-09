namespace ChainChat.Core.Crypto;

/// <summary>Conversation ids (SPEC.md §2).</summary>
public static class ConversationId
{
    /// <summary>
    /// 1:1 conversation id: keccak256(abi.encode(address low, address high)), with the addresses sorted numerically
    /// so both participants compute the same id.
    /// </summary>
    public static byte[] ForDirect(string a, string b)
    {
        var first = EthAddress.ToNumber(a);
        var second = EthAddress.ToNumber(b);
        if (first == second) throw new ArgumentException("A direct conversation needs two different addresses");

        var (low, high) = first < second ? (a, b) : (b, a);
        return Keccak.Hash(Abi.Encode(Abi.Address(low), Abi.Address(high)));
    }
}
