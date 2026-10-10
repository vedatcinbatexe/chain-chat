using ChainChat.Core.Messaging;

namespace ChainChat.Core.Tests.Messaging;

public class SlidingWindowLimiterTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

        public override DateTimeOffset GetUtcNow() => Now;
    }

    [Fact]
    public void Allows_up_to_the_limit_then_refuses()
    {
        var limiter = new SlidingWindowLimiter(3, TimeSpan.FromSeconds(10), new Clock());

        Assert.True(limiter.TryAcquire("alice"));
        Assert.True(limiter.TryAcquire("alice"));
        Assert.True(limiter.TryAcquire("alice"));
        Assert.False(limiter.TryAcquire("alice"));
    }

    [Fact]
    public void Each_key_has_its_own_allowance()
    {
        var limiter = new SlidingWindowLimiter(1, TimeSpan.FromSeconds(10), new Clock());

        Assert.True(limiter.TryAcquire("alice"));
        Assert.False(limiter.TryAcquire("alice"));
        Assert.True(limiter.TryAcquire("bob"));
    }

    [Fact]
    public void The_allowance_comes_back_as_old_actions_leave_the_window()
    {
        var clock = new Clock();
        var limiter = new SlidingWindowLimiter(2, TimeSpan.FromSeconds(10), clock);

        Assert.True(limiter.TryAcquire("alice"));
        clock.Now += TimeSpan.FromSeconds(6);
        Assert.True(limiter.TryAcquire("alice"));
        Assert.False(limiter.TryAcquire("alice"));

        clock.Now += TimeSpan.FromSeconds(4); // the first action is now 10 s old
        Assert.True(limiter.TryAcquire("alice"));
        Assert.False(limiter.TryAcquire("alice"));
    }

    [Fact]
    public void A_refused_attempt_is_not_counted()
    {
        var clock = new Clock();
        var limiter = new SlidingWindowLimiter(1, TimeSpan.FromSeconds(10), clock);

        Assert.True(limiter.TryAcquire("alice"));
        for (var i = 0; i < 5; i++) Assert.False(limiter.TryAcquire("alice"));

        clock.Now += TimeSpan.FromSeconds(10);
        Assert.True(limiter.TryAcquire("alice"));
    }
}
