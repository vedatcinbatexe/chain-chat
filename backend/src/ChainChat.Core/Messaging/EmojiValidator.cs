using System.Globalization;
using System.Text;

namespace ChainChat.Core.Messaging;

/// <summary>
/// Decides whether a reaction is one emoji. Reactions are stored in the clear, so the server accepts a single
/// emoji and nothing else — never free text.
/// </summary>
public static class EmojiValidator
{
    /// <summary>Longest emoji accepted, in UTF-16 units (a family or a couple with skin tones fits).</summary>
    public const int MaxLength = 16;

    public static bool IsSingleEmoji(string? text)
    {
        if (string.IsNullOrEmpty(text) || text.Length > MaxLength) return false;
        // One user-perceived character: "👍", "❤️", "🇹🇷" and "👨‍👩‍👧" each count as one, "👍👍" and "ok" do not.
        if (new StringInfo(text).LengthInTextElements != 1) return false;

        var hasPictograph = false;
        foreach (var rune in text.EnumerateRunes())
        {
            switch (Rune.GetUnicodeCategory(rune))
            {
                case UnicodeCategory.OtherSymbol: // pictographs, and the regional indicators flags are made of
                    hasPictograph = true;
                    break;
                case UnicodeCategory.ModifierSymbol: // skin tones
                case UnicodeCategory.NonSpacingMark: // the "show as emoji" selector
                case UnicodeCategory.Format: // the joiner inside combined emoji
                case UnicodeCategory.EnclosingMark:
                    break;
                default:
                    return false; // letters, digits, punctuation, whitespace, …
            }
        }
        return hasPictograph;
    }
}
