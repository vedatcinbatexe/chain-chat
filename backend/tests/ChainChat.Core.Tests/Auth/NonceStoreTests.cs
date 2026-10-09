using ChainChat.Core.Auth;

namespace ChainChat.Core.Tests.Auth;

public class NonceStoreTests
{
    private const string Alice = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    private const string Bob = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    private readonly ManualTimeProvider _time = new(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
    private readonly NonceStore _store;

    public NonceStoreTests() => _store = new NonceStore(TimeSpan.FromMinutes(5), _time);

    [Fact]
    public void Issued_nonce_is_long_alphanumeric_and_unique()
    {
        var (first, expiresAt) = _store.Issue(Alice);
        var (second, _) = _store.Issue(Alice);

        Assert.Matches("^[a-zA-Z0-9]{16}$", first);
        Assert.NotEqual(first, second);
        Assert.Equal(_time.GetUtcNow().AddMinutes(5), expiresAt);
    }

    [Fact]
    public void Nonce_can_be_used_exactly_once()
    {
        var (nonce, _) = _store.Issue(Alice);

        Assert.True(_store.TryConsume(nonce, Alice));
        Assert.False(_store.TryConsume(nonce, Alice)); // replay
    }

    [Fact]
    public void Address_comparison_ignores_case()
    {
        var (nonce, _) = _store.Issue(Alice.ToLowerInvariant());
        Assert.True(_store.TryConsume(nonce, Alice));
    }

    [Fact]
    public void Nonce_issued_for_another_address_is_rejected()
    {
        var (nonce, _) = _store.Issue(Alice);
        Assert.False(_store.TryConsume(nonce, Bob));
    }

    [Fact]
    public void Expired_nonce_is_rejected()
    {
        var (nonce, _) = _store.Issue(Alice);
        _time.Advance(TimeSpan.FromMinutes(5));
        Assert.False(_store.TryConsume(nonce, Alice));
    }

    [Fact]
    public void Unknown_nonce_is_rejected() => Assert.False(_store.TryConsume("neverIssued123456", Alice));

    private sealed class ManualTimeProvider(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }
}
