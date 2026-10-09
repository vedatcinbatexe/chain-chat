using ChainChat.Api.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Messaging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ChainChat.Api.Hubs;

/// <summary>Server → app events.</summary>
public interface IChatClient
{
    /// <summary>A new message in one of the user's conversations (also echoed to the sender's other connections).</summary>
    Task MessageReceived(MessageDto message);
}

/// <summary>
/// Real-time messaging (SDD §4.2, §9). Connections are authenticated with the SIWE JWT; each wallet address is
/// a SignalR user, so a message reaches every device of the recipient.
/// </summary>
[Authorize]
public sealed class ChatHub(MessageService messages, ILogger<ChatHub> logger) : Hub<IChatClient>
{
    public const string Path = "/hubs/chat";

    /// <summary>Validates, stores and relays a message. Returns the stored message as the acknowledgement.</summary>
    public async Task<MessageDto> SendMessage(SendMessageCommand request)
    {
        var sender = Context.User!.WalletAddress();
        try
        {
            var (message, created) = await messages.AcceptAsync(sender, request, Context.ConnectionAborted);
            var dto = MessageDto.From(message);

            if (created)
            {
                await Clients.Users(EthAddress.Normalize(request.Recipient), EthAddress.Normalize(sender)).MessageReceived(dto);
                logger.LogInformation("Relayed message {Id} in {Conversation}", message.Id, message.ConversationId);
            }

            return dto;
        }
        catch (MessageRejectedException ex)
        {
            // HubException messages are sent to the caller; anything else is hidden as a generic error.
            throw new HubException(ex.Code);
        }
    }
}

/// <summary>Uses the lowercase wallet address (the JWT subject) as the SignalR user id.</summary>
public sealed class WalletUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => connection.User?.Identity?.Name?.ToLowerInvariant();
}
