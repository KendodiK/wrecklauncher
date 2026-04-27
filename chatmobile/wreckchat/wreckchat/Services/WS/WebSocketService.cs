using System.Net.WebSockets;
using System.Text;
using wreckchat.Services.Auth;

namespace wreckchat.Services.WS;

public class WebSocketService : IWebSocketService
{
    private readonly ITokenService _tokenService;
    private ClientWebSocket _webSocket;
    private const string HEARTBEAT_VALUE = "pipi";

    public WebSocketService(ITokenService tokenService)
    {
        _tokenService = tokenService;
        _webSocket = new ClientWebSocket();
    }

    public async Task ConnectAsync(string uri = null!) //idk its workin or not
    {
        uri = uri ?? "ws://api.anchorlauncher.hu:8080"; //in production: ws://api.anchorlauncher.hu:8080
        var token = await _tokenService.GetToken();
        Console.WriteLine($"Connecting to WebSocket at {uri}...");
        if (string.IsNullOrEmpty(token))
        {
            Console.WriteLine("No token available for WebSocket connection.");
            throw new InvalidOperationException("No token available for WebSocket connection.");
        }
        _webSocket.Options.SetRequestHeader("Authorization", $"Bearer {token}");
        Console.WriteLine("WebSocket connection options set.");
        await _webSocket.ConnectAsync(new Uri(uri), CancellationToken.None);
    }

    public async Task SendMessageAsync(string message)
    {
        if (_webSocket.State != WebSocketState.Open)
            throw new InvalidOperationException("WebSocket is not connected.");
        var bytes = Encoding.UTF8.GetBytes(message);
        await _webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public Task StartAsync(Func<string, Task> onMessage)
    {
        return Task.Run(async () =>
        {
            await StartListening(onMessage);
        });
    }

    public async Task StartListening(Func<string, Task> onMessage)
    {
        var buffer = new byte[4096];
        var ms = new MemoryStream();

        WebSocketReceiveResult result;

        do
        {
            result = await _webSocket.ReceiveAsync(buffer, CancellationToken.None);
            ms.Write(buffer, 0, result.Count);

            if (result.MessageType == WebSocketMessageType.Binary)
            {
                var raw = ms.ToArray();
                var text = Encoding.UTF8.GetString(raw);

                if (text == HEARTBEAT_VALUE)
                {
                    await SendHeartbeatResponse();
                    Console.WriteLine("Received heartbeat, sent response.");
                    continue;
                }
            }
        }
        while (!result.EndOfMessage);
    }

    private async Task SendHeartbeatResponse()
    {
        var bytes = Encoding.UTF8.GetBytes(HEARTBEAT_VALUE);

        await _webSocket.SendAsync(
            bytes,
            WebSocketMessageType.Binary,
            true,
            CancellationToken.None
        );
    }

    public async Task DisconnectAsync()
    {
        if (_webSocket.State == WebSocketState.Open)
            Console.WriteLine("Disconnecting WebSocket...");
        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
    }
}
