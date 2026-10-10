using System.Net;
using System.Net.Http.Json;
using ChainChat.Api.Tests.Support;

namespace ChainChat.Api.Tests;

/// <summary>Who gets into the admin API, and what admins can do there (SDD §4.4).</summary>
[Collection(ApiCollection.Name)]
public class AdminApiTests(ApiFactory api)
{
    [Fact]
    public async Task Admin_routes_need_an_admin_wallet()
    {
        var user = await api.RegisterUserAsync();

        // No token at all.
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().GetAsync("/api/v1/admin/overview")).StatusCode);

        // A normal user cannot log in to the dashboard…
        var dashboardLogin = await api.TrySignInAsync(user, dashboard: true);
        Assert.Equal(HttpStatusCode.Forbidden, dashboardLogin.StatusCode);
        Assert.Equal("NotAnAdmin", await dashboardLogin.CodeAsync());

        // …and the token from the app's own login does not open admin routes either.
        var asUser = await api.SignInAsync(user);
        Assert.Equal(HttpStatusCode.Forbidden, (await asUser.GetAsync("/api/v1/admin/overview")).StatusCode);

        var asRoot = await api.SignInAsRootAsync();
        var overview = await asRoot.GetAsync("/api/v1/admin/overview");
        Assert.Equal(HttpStatusCode.OK, overview.StatusCode);
        Assert.True((await overview.JsonAsync()).GetProperty("users").GetInt32() >= 1);
    }

    [Fact]
    public async Task Root_admins_add_and_remove_admins_and_removal_is_immediate()
    {
        var asRoot = await api.SignInAsRootAsync();
        var newAdmin = await api.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await asRoot.PostAsJsonAsync("/api/v1/admin/admins", new { address = newAdmin.Address, note = "test" })).StatusCode);
        var asNewAdmin = await api.SignInAsync(newAdmin, dashboard: true);
        Assert.Equal(HttpStatusCode.OK, (await asNewAdmin.GetAsync("/api/v1/admin/users")).StatusCode);

        // Only root admins manage admins.
        var other = await api.RegisterUserAsync();
        var refused = await asNewAdmin.PostAsJsonAsync("/api/v1/admin/admins", new { address = other.Address });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("OnlyRootAdmins", await refused.CodeAsync());

        // Root admins come from the configuration and cannot be removed.
        var removeRoot = await asRoot.DeleteAsync($"/api/v1/admin/admins/{api.Root.Address}");
        Assert.Equal(HttpStatusCode.Conflict, removeRoot.StatusCode);

        // Removing an admin ends their access at once, even with a token that is still valid.
        Assert.Equal(HttpStatusCode.NoContent, (await asRoot.DeleteAsync($"/api/v1/admin/admins/{newAdmin.Address}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await asNewAdmin.GetAsync("/api/v1/admin/users")).StatusCode);
    }

    [Fact]
    public async Task A_banned_wallet_cannot_sign_in_or_create_groups_until_unbanned()
    {
        var asRoot = await api.SignInAsRootAsync();
        var user = await api.RegisterUserAsync();
        var asUser = await api.SignInAsync(user); // signed in before the ban

        Assert.Equal(HttpStatusCode.NoContent, (await asRoot.PostAsJsonAsync($"/api/v1/admin/users/{user.Address}/ban", new { reason = "spam" })).StatusCode);

        var login = await api.TrySignInAsync(user);
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.Equal("Banned", await login.CodeAsync());

        // The token from before the ban does not help either.
        var create = await asUser.PostAsJsonAsync("/api/v1/groups", new { name = "Banned group" });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal("Banned", await create.CodeAsync());

        var detail = await (await asRoot.GetAsync($"/api/v1/admin/users/{user.Address}")).JsonAsync();
        Assert.Equal("spam", detail.GetProperty("ban").GetProperty("reason").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await asRoot.DeleteAsync($"/api/v1/admin/users/{user.Address}/ban")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.TrySignInAsync(user)).StatusCode);

        // Both actions are in the audit log.
        var audit = (await (await asRoot.GetAsync("/api/v1/admin/audit?pageSize=100")).JsonAsync()).GetProperty("items").EnumerateArray()
            .Where(e => e.GetProperty("target").GetString() == user.Address.ToLowerInvariant())
            .Select(e => e.GetProperty("action").GetString())
            .ToList();
        Assert.Contains("BanUser", audit);
        Assert.Contains("UnbanUser", audit);
    }

    [Fact]
    public async Task Admins_cannot_be_banned()
    {
        var asRoot = await api.SignInAsRootAsync();
        var response = await asRoot.PostAsJsonAsync($"/api/v1/admin/users/{api.Root.Address}/ban", new { reason = "oops" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("CannotBanAnAdmin", await response.CodeAsync());
    }

    [Fact]
    public async Task Runtime_settings_are_validated_and_apply_immediately()
    {
        var asRoot = await api.SignInAsRootAsync();
        var asUser = await api.SignInAsync(await api.RegisterUserAsync());

        Assert.Equal(HttpStatusCode.BadRequest, (await asRoot.PutAsJsonAsync("/api/v1/admin/system/settings", new { groupMaxMembers = 500 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await asRoot.PutAsJsonAsync("/api/v1/admin/system/settings", new { noSuchSetting = true })).StatusCode);

        try
        {
            Assert.Equal(HttpStatusCode.OK, (await asRoot.PutAsJsonAsync("/api/v1/admin/system/settings", new { groupCreationEnabled = false })).StatusCode);
            var refused = await asUser.PostAsJsonAsync("/api/v1/groups", new { name = "Not now" });
            Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
            Assert.Equal("GroupCreationDisabled", await refused.CodeAsync());

            Assert.Equal(HttpStatusCode.OK, (await asRoot.PutAsJsonAsync("/api/v1/admin/system/settings", new { groupCreationEnabled = true, groupMaxMembers = 2 })).StatusCode);
            var group = await (await asUser.PostAsJsonAsync("/api/v1/groups", new { name = "Small group" })).JsonAsync();
            Assert.Equal(2, group.GetProperty("maxMembers").GetInt32());

            var invite = group.GetProperty("inviteCode").GetString();
            var second = await api.SignInAsync(await api.RegisterUserAsync());
            var third = await api.SignInAsync(await api.RegisterUserAsync());
            Assert.Equal(HttpStatusCode.OK, (await second.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = invite })).StatusCode);
            var full = await third.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = invite });
            Assert.Equal(HttpStatusCode.Conflict, full.StatusCode);
            Assert.Equal("GroupFull", await full.CodeAsync());
        }
        finally
        {
            await asRoot.PutAsJsonAsync("/api/v1/admin/system/settings", new { groupCreationEnabled = true, groupMaxMembers = 20 });
        }
    }

    [Fact]
    public async Task Admins_remove_group_members_and_replace_invite_links()
    {
        var asRoot = await api.SignInAsRootAsync();
        var creator = await api.SignInAsync(await api.RegisterUserAsync());
        var memberWallet = await api.RegisterUserAsync();
        var member = await api.SignInAsync(memberWallet);

        var group = await (await creator.PostAsJsonAsync("/api/v1/groups", new { name = "Moderated" })).JsonAsync();
        var id = group.GetProperty("conversationId").GetString();
        var invite = group.GetProperty("inviteCode").GetString();
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = invite })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await asRoot.DeleteAsync($"/api/v1/admin/groups/{id}/members/{memberWallet.Address}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync($"/api/v1/groups/{id}")).StatusCode); // members only

        var rotated = await (await asRoot.PostAsync($"/api/v1/admin/groups/{id}/rotate-invite", null)).JsonAsync();
        var newInvite = rotated.GetProperty("inviteCode").GetString();
        Assert.NotEqual(invite, newInvite);

        var oldLink = await member.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = invite });
        Assert.Equal(HttpStatusCode.NotFound, oldLink.StatusCode);
        Assert.Equal("InviteNotFound", await oldLink.CodeAsync());
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync("/api/v1/groups/join", new { inviteCode = newInvite })).StatusCode);
    }

    [Fact]
    public async Task Announcements_are_validated_stored_and_admin_only()
    {
        var asRoot = await api.SignInAsRootAsync();
        var asUser = await api.SignInAsync(await api.RegisterUserAsync());

        Assert.Equal(HttpStatusCode.Forbidden, (await asUser.PostAsJsonAsync("/api/v1/admin/announcements", new { title = "Hi", body = "From a user" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await asRoot.PostAsJsonAsync("/api/v1/admin/announcements", new { title = "", body = "No title" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await asRoot.PostAsJsonAsync("/api/v1/admin/announcements", new { title = "Too long", body = new string('x', 501) })).StatusCode);

        var title = $"Maintenance {Guid.NewGuid():N}";
        Assert.Equal(HttpStatusCode.OK, (await asRoot.PostAsJsonAsync("/api/v1/admin/announcements", new { title, body = "Tonight at 22:00." })).StatusCode);

        var sent = (await (await asRoot.GetAsync("/api/v1/admin/announcements")).JsonAsync()).GetProperty("items").EnumerateArray();
        Assert.Contains(sent, a => a.GetProperty("title").GetString() == title);
    }

    [Fact]
    public async Task Funding_is_refused_when_no_funder_key_is_configured()
    {
        var asRoot = await api.SignInAsRootAsync();
        var user = await api.RegisterUserAsync();

        var response = await asRoot.PostAsJsonAsync("/api/v1/admin/funding", new { address = user.Address, asset = "CHAT", amount = 10 });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("FundingDisabled", await response.CodeAsync());
    }

    [Fact]
    public async Task System_page_never_returns_secrets()
    {
        var asRoot = await api.SignInAsRootAsync();
        var body = await (await asRoot.GetAsync("/api/v1/admin/system")).Content.ReadAsStringAsync();

        Assert.DoesNotContain("integration-tests-only-jwt-signing-key", body);
        Assert.DoesNotContain("Password=", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("privateKey", body, StringComparison.OrdinalIgnoreCase);
    }
}
