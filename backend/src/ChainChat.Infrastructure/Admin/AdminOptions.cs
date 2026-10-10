using System.ComponentModel.DataAnnotations;

namespace ChainChat.Infrastructure.Admin;

/// <summary>Admin dashboard settings (configuration section "Admin").</summary>
public sealed class AdminOptions
{
    public const string SectionName = "Admin";

    /// <summary>Root admins: wallets that can always sign in to the dashboard and cannot be removed from it.</summary>
    public string[] Addresses { get; set; } = [];

    /// <summary>EIP-4361 domain of the dashboard (its host and port); must match the login message exactly.</summary>
    [Required]
    public string Domain { get; set; } = "localhost:5173";

    /// <summary>EIP-4361 URI of the dashboard (its origin).</summary>
    [Required]
    public string Uri { get; set; } = "http://localhost:5173";

    [Required]
    public string Statement { get; set; } = "Sign in to the ChainChat admin dashboard.";

    /// <summary>
    /// Key that funds accounts from the dashboard: sends test ETH and mints CHAT, so it must be the ChatToken owner.
    /// Local default: the public Anvil deployer key. Never a real key in git. Empty disables funding.
    /// </summary>
    public string FunderPrivateKey { get; set; } = "";

    /// <summary>Largest amount of ETH an admin can send in one action.</summary>
    [Range(typeof(decimal), "0.001", "1000")]
    public decimal MaxFundEth { get; set; } = 10m;

    /// <summary>Largest amount of CHAT an admin can mint in one action.</summary>
    [Range(typeof(decimal), "1", "1000000000")]
    public decimal MaxFundChat { get; set; } = 100_000m;
}
