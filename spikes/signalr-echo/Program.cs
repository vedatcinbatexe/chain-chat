using Microsoft.AspNetCore.SignalR;

// Phase 1.2 spike: a minimal SignalR hub so the phone can test a real-time connection over Wi-Fi.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();

var app = builder.Build();
app.MapHub<EchoHub>("/hubs/echo");
app.MapGet("/", () => "SignalR echo hub for the Expo Go spike: /hubs/echo");

// 0.0.0.0 so phones on the same Wi-Fi can connect, not only localhost.
app.Run("http://0.0.0.0:5090");

public sealed class EchoHub : Hub
{
    public string Echo(string message) => message;
}
