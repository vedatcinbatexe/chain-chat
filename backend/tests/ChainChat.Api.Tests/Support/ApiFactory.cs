using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Numerics;
using System.Text.Json;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nethereum.Signer;
using Testcontainers.PostgreSql;

namespace ChainChat.Api.Tests.Support;

/// <summary>A wallet created for one test: it signs in like the app does, with Sign-In with Ethereum.</summary>
public sealed class TestWallet
{
    private readonly EthECKey _key = EthECKey.GenerateKey();

    public string Address => _key.GetPublicAddress();

    public string Sign(string message) => new EthereumMessageSigner().EncodeUTF8AndSign(message, _key);
}

/// <summary>Stands in for the ClassBadge contract: tests decide which badge types exist and who holds them.</summary>
public sealed class FakeBadges : IBadgeReader
{
    public const string Contract = "0x00000000000000000000000000000000000ba0ce";
    public const int Student = 1;
    public const int Assistant = 2;

    private readonly HashSet<(string Address, int TypeId)> _held = [];

    public string? ContractAddress => Contract;

    public void Grant(TestWallet wallet, int typeId)
    {
        lock (_held) _held.Add((EthAddress.Normalize(wallet.Address), typeId));
    }

    public void Revoke(TestWallet wallet, int typeId)
    {
        lock (_held) _held.Remove((EthAddress.Normalize(wallet.Address), typeId));
    }

    public Task<IReadOnlyList<BadgeType>> TypesAsync(string contract, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<BadgeType>>([new BadgeType(Student, "Student"), new BadgeType(Assistant, "Assistant")]);

    public Task<string> TypeNameOfTokenAsync(string contract, BigInteger tokenId, CancellationToken ct) => Task.FromResult("Student");

    public Task<BigInteger> BalanceAsync(string contract, string address, CancellationToken ct)
    {
        lock (_held) return Task.FromResult(new BigInteger(_held.Count(h => h.Address == EthAddress.Normalize(address))));
    }

    public Task<int> BalanceOfTypeAsync(string contract, string address, int typeId, CancellationToken ct)
    {
        lock (_held) return Task.FromResult(_held.Contains((EthAddress.Normalize(address), typeId)) ? 1 : 0);
    }

    public Task<IReadOnlySet<int>> HeldAsync(string contract, string address, IEnumerable<int> typeIds, CancellationToken ct)
    {
        lock (_held) return Task.FromResult<IReadOnlySet<int>>(typeIds.Where(id => _held.Contains((EthAddress.Normalize(address), id))).ToHashSet());
    }

    public async Task<bool> HoldsAllAsync(string contract, string address, IReadOnlyCollection<int> typeIds, CancellationToken ct) =>
        (await HeldAsync(contract, address, typeIds, ct)).Count == typeIds.Distinct().Count();
}

/// <summary>
/// The real API against a real PostgreSQL (started with Testcontainers, so Docker must be running). There is no
/// blockchain in these tests: the indexers and the anchoring job are off, and badges come from <see cref="FakeBadges"/>.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly string _emptyDeployments = Directory.CreateTempSubdirectory("chainchat-tests-").FullName;

    /// <summary>The root admin configured on the server (Admin:Addresses).</summary>
    public TestWallet Root { get; } = new();

    public FakeBadges Badges { get; } = new();

    public Task InitializeAsync() => _postgres.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
        Directory.Delete(_emptyDeployments, recursive: true);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        // UseSetting, because Program reads some of these while it is still registering services.
        builder.UseSetting("ConnectionStrings:Postgres", _postgres.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Auth:JwtSigningKey", "integration-tests-only-jwt-signing-key-not-a-secret");
        builder.UseSetting("Admin:Addresses:0", Root.Address);
        builder.UseSetting("Chain:DeploymentsPath", _emptyDeployments); // no contracts: nothing talks to a chain
        builder.UseSetting("Chain:RpcUrls:0", "http://127.0.0.1:9");
        builder.UseSetting("Chain:MaxRetriesPerEndpoint", "0");
        builder.UseSetting("Indexer:Enabled", "false");
        builder.UseSetting("Anchoring:Enabled", "false");
        builder.UseSetting("GasDrip:Enabled", "false");
        builder.UseSetting("RateLimiting:PermitLimit", "100000");
        builder.UseSetting("RateLimiting:AuthPermitLimit", "100000");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IBadgeReader>();
            services.AddSingleton<IBadgeReader>(Badges);
        });
    }

    /// <summary>A wallet with a username in the users table, as if the indexer had seen its on-chain registration.</summary>
    public async Task<TestWallet> RegisterUserAsync()
    {
        var wallet = new TestWallet();
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();
        db.Users.Add(new User
        {
            Address = EthAddress.Normalize(wallet.Address),
            Username = $"u{Guid.NewGuid():N}"[..16],
            EncryptionPublicKey = "0x" + new string('1', 64),
            RegistrationTxHash = "0x" + Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        return wallet;
    }

    /// <summary>The response of the sign-in call: 200 with a token, or the refusal.</summary>
    public async Task<HttpResponseMessage> TrySignInAsync(TestWallet wallet, bool dashboard = false)
    {
        var client = CreateClient();
        var prefix = dashboard ? "/api/v1/admin/auth" : "/api/v1/auth";

        var nonce = await (await client.PostAsJsonAsync($"{prefix}/nonce", new { address = wallet.Address })).Content.ReadFromJsonAsync<JsonElement>();
        var now = DateTimeOffset.UtcNow;
        var message = string.Join('\n',
            $"{nonce.GetProperty("domain").GetString()} wants you to sign in with your Ethereum account:",
            wallet.Address,
            "",
            nonce.GetProperty("statement").GetString(),
            "",
            $"URI: {nonce.GetProperty("uri").GetString()}",
            "Version: 1",
            $"Chain ID: {nonce.GetProperty("chainId").GetInt64()}",
            $"Nonce: {nonce.GetProperty("nonce").GetString()}",
            $"Issued At: {now:yyyy-MM-ddTHH:mm:ss.fffZ}",
            $"Expiration Time: {now.AddMinutes(5):yyyy-MM-ddTHH:mm:ss.fffZ}");

        return await client.PostAsJsonAsync($"{prefix}/verify", new { message, signature = wallet.Sign(message) });
    }

    /// <summary>An HTTP client signed in as the wallet (through the dashboard login when <paramref name="dashboard"/> is set).</summary>
    public async Task<HttpClient> SignInAsync(TestWallet wallet, bool dashboard = false)
    {
        var response = await TrySignInAsync(wallet, dashboard);
        Assert.True(response.IsSuccessStatusCode, $"Sign-in failed: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        var token = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();

        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    public Task<HttpClient> SignInAsRootAsync() => SignInAsync(Root, dashboard: true);
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}

public static class HttpExtensions
{
    public static Task<JsonElement> JsonAsync(this HttpResponseMessage response) => response.Content.ReadFromJsonAsync<JsonElement>();

    /// <summary>The backend's refusal code, e.g. "BadgeRequired" (the ProblemDetails "detail").</summary>
    public static async Task<string?> CodeAsync(this HttpResponseMessage response) =>
        (await response.JsonAsync()).TryGetProperty("detail", out var detail) ? detail.GetString() : null;
}
