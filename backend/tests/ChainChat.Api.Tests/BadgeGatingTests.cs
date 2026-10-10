using System.Net;
using System.Net.Http.Json;
using ChainChat.Api.Tests.Support;

namespace ChainChat.Api.Tests;

/// <summary>NFT-gated groups: a wallet must hold every required badge to create or join one (SDD §6.5).</summary>
[Collection(ApiCollection.Name)]
public class BadgeGatingTests(ApiFactory api)
{
    private static readonly int[] StudentAndAssistant = [FakeBadges.Student, FakeBadges.Assistant];

    [Fact]
    public async Task The_creator_must_hold_every_required_badge()
    {
        var wallet = await api.RegisterUserAsync();
        var creator = await api.SignInAsync(wallet);

        var none = await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Staff", requiredBadgeTypes = StudentAndAssistant });
        Assert.Equal(HttpStatusCode.Forbidden, none.StatusCode);
        Assert.Equal("BadgeRequired", await none.CodeAsync());

        api.Badges.Grant(wallet, FakeBadges.Student);
        var one = await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Staff", requiredBadgeTypes = StudentAndAssistant });
        Assert.Equal("BadgeRequired", await one.CodeAsync());

        api.Badges.Grant(wallet, FakeBadges.Assistant);
        var created = await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Staff", requiredBadgeTypes = StudentAndAssistant });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);

        var group = await created.JsonAsync();
        Assert.Equal(["Student", "Assistant"], group.GetProperty("requiredBadges").EnumerateArray().Select(b => b.GetProperty("name").GetString()));
        Assert.NotNull(group.GetProperty("requiredBadgeContract").GetString());
    }

    [Fact]
    public async Task Unknown_badge_types_and_too_many_badges_are_rejected()
    {
        var wallet = await api.RegisterUserAsync();
        var creator = await api.SignInAsync(wallet);

        var unknown = await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Ghost", requiredBadgeTypes = new[] { 99 } });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal("UnknownBadgeType", await unknown.CodeAsync());

        var tooMany = await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Greedy", requiredBadgeTypes = new[] { 1, 2, 3, 4, 5, 6 } });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        Assert.Equal("TooManyBadges", await tooMany.CodeAsync());
    }

    [Fact]
    public async Task Joining_needs_every_badge_and_the_preview_says_which_are_missing()
    {
        var creatorWallet = await api.RegisterUserAsync();
        api.Badges.Grant(creatorWallet, FakeBadges.Student);
        api.Badges.Grant(creatorWallet, FakeBadges.Assistant);
        var creator = await api.SignInAsync(creatorWallet);
        var group = await (await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Course staff", requiredBadgeTypes = StudentAndAssistant })).JsonAsync();
        var invite = group.GetProperty("inviteCode").GetString();

        var joinerWallet = await api.RegisterUserAsync();
        var joiner = await api.SignInAsync(joinerWallet);
        api.Badges.Grant(joinerWallet, FakeBadges.Student);

        var preview = await (await joiner.GetAsync($"/api/v1/groups/invites/{invite}")).JsonAsync();
        var held = preview.GetProperty("requiredBadges").EnumerateArray().ToDictionary(b => b.GetProperty("name").GetString()!, b => b.GetProperty("held").GetBoolean());
        Assert.True(held["Student"]);
        Assert.False(held["Assistant"]);

        var refused = await joiner.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = invite });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("BadgeRequired", await refused.CodeAsync());

        api.Badges.Grant(joinerWallet, FakeBadges.Assistant);
        var joined = await joiner.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = invite });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        Assert.Equal(2, (await joined.JsonAsync()).GetProperty("members").GetArrayLength());
    }

    [Fact]
    public async Task A_group_without_required_badges_is_open_to_any_registered_wallet()
    {
        var creator = await api.SignInAsync(await api.RegisterUserAsync());
        var group = await (await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Open group" })).JsonAsync();
        Assert.Equal(0, group.GetProperty("requiredBadges").GetArrayLength());

        var joiner = await api.SignInAsync(await api.RegisterUserAsync());
        Assert.Equal(HttpStatusCode.OK, (await joiner.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = group.GetProperty("inviteCode").GetString() })).StatusCode);

        // A wallet that never registered a username cannot join any group.
        var unregistered = await api.SignInAsync(new TestWallet());
        var refused = await unregistered.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = group.GetProperty("inviteCode").GetString() });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("NotRegistered", await refused.CodeAsync());
    }
}
