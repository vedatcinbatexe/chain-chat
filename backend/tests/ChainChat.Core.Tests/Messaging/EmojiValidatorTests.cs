using ChainChat.Core.Messaging;

namespace ChainChat.Core.Tests.Messaging;

public class EmojiValidatorTests
{
    [Theory]
    [InlineData("👍")]
    [InlineData("❤️")]
    [InlineData("😂")]
    [InlineData("🔥")]
    [InlineData("👍🏽")] // with a skin tone
    [InlineData("🇹🇷")] // a flag: two regional indicators
    [InlineData("👨‍👩‍👧")] // joined with zero-width joiners
    [InlineData("🏳️‍🌈")]
    public void Accepts_one_emoji(string emoji) => Assert.True(EmojiValidator.IsSingleEmoji(emoji));

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("ok")]
    [InlineData("a")]
    [InlineData("1")]
    [InlineData(" ")]
    [InlineData("👍👍")]
    [InlineData("👍 ")]
    [InlineData("👍!")]
    [InlineData("<b>")]
    [InlineData("😂😂😂😂😂😂😂😂😂")]
    public void Rejects_text_and_more_than_one_emoji(string? text) => Assert.False(EmojiValidator.IsSingleEmoji(text));
}
