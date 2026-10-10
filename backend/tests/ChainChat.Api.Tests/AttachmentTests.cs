using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using ChainChat.Api.Endpoints;
using ChainChat.Api.Tests.Support;

namespace ChainChat.Api.Tests;

/// <summary>Encrypted attachment storage for voice messages (SDD §6.8): the server stores and returns bytes as they are.</summary>
[Collection(ApiCollection.Name)]
public class AttachmentTests(ApiFactory api)
{
    private static ByteArrayContent Bytes(byte[] bytes)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return content;
    }

    [Fact]
    public async Task An_uploaded_attachment_comes_back_byte_for_byte()
    {
        var uploader = await api.SignInAsync(await api.RegisterUserAsync());
        var other = await api.SignInAsync(await api.RegisterUserAsync());
        var ciphertext = RandomNumberGenerator.GetBytes(50_000);

        var upload = await uploader.PostAsync("/api/v1/attachments", Bytes(ciphertext));
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var body = await upload.JsonAsync();
        var id = body.GetProperty("id").GetString()!;
        Assert.Equal(32, id.Length);
        Assert.Equal(ciphertext.Length, body.GetProperty("size").GetInt32());

        // The recipient fetches it by the id from the (encrypted) chat message.
        var download = await other.GetAsync($"/api/v1/attachments/{id}");
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal(ciphertext, await download.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Attachments_need_a_signed_in_wallet()
    {
        var anonymous = api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/v1/attachments", Bytes([1, 2, 3]))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/v1/attachments/{new string('a', 32)}")).StatusCode);
    }

    [Fact]
    public async Task Empty_oversized_and_unknown_attachments_are_refused()
    {
        var client = await api.SignInAsync(await api.RegisterUserAsync());

        var empty = await client.PostAsync("/api/v1/attachments", Bytes([]));
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
        Assert.Equal("AttachmentEmpty", await empty.CodeAsync());

        var tooLarge = await client.PostAsync("/api/v1/attachments", Bytes(new byte[AttachmentEndpoints.MaxBytes + 1]));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, tooLarge.StatusCode);
        Assert.Equal("AttachmentTooLarge", await tooLarge.CodeAsync());

        var unknown = await client.GetAsync($"/api/v1/attachments/{new string('0', 32)}");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("AttachmentNotFound", await unknown.CodeAsync());
    }

    [Fact]
    public async Task A_banned_wallet_cannot_upload()
    {
        var asRoot = await api.SignInAsRootAsync();
        var wallet = await api.RegisterUserAsync();
        var client = await api.SignInAsync(wallet);
        await asRoot.PostAsync($"/api/v1/admin/users/{wallet.Address}/ban", System.Net.Http.Json.JsonContent.Create(new { reason = "test" }));

        var upload = await client.PostAsync("/api/v1/attachments", Bytes([1, 2, 3]));
        Assert.Equal(HttpStatusCode.Forbidden, upload.StatusCode);
        Assert.Equal("Banned", await upload.CodeAsync());
    }
}
