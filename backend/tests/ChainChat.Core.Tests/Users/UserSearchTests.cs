using ChainChat.Core.Users;

namespace ChainChat.Core.Tests.Users;

public class UserSearchTests
{
    [Theory]
    [InlineData("ved", "ved", "ved%")]
    [InlineData("  @Vedat ", "vedat", "vedat%")]
    [InlineData("ved_", "ved_", "ved\\_%")]
    public void Username_prefix_is_normalized_and_escaped(string input, string prefix, string pattern) =>
        Assert.Equal(new UserSearchQuery.ByUsernamePrefix(prefix, pattern), UserSearch.Parse(input));

    [Fact]
    public void Address_is_an_exact_lowercase_match() =>
        Assert.Equal(
            new UserSearchQuery.ByAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"),
            UserSearch.Parse("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ved%")]
    [InlineData("ved at")]
    [InlineData("vedat-cinbat")]
    [InlineData("0x12-34")]
    [InlineData("abcdefghijklmnopqrstu")] // 21 characters: longer than any username
    public void Input_that_cannot_match_a_user_is_rejected(string? input) => Assert.Null(UserSearch.Parse(input));
}
