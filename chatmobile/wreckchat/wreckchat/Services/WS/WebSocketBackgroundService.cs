using System.Net.WebSockets;
using System.Text;
using wreckchat.Services.Auth;

namespace wreckchat.Services.WS;

public class WebSocketBackgroundService
{
    private readonly IWebSocketEventHub _hub;
    private readonly ClientWebSocket _ws = new();
    private readonly ITokenService _tokenService;
    private CancellationTokenSource _cts = new();
    private const string HEARTBEAT_VALUE = "pipi";

    public WebSocketBackgroundService(IWebSocketEventHub hub, ITokenService tokenService)
    {
        _hub = hub;
        _tokenService = tokenService;
    }

    public async Task StartAsync(string url)
    {
        Console.WriteLine("Attempt to start ws");
        var token = await _tokenService.GetToken();
        Console.WriteLine("Token: " + token);                
        _ws.Options.SetRequestHeader("Authorization", $"Bearer {token}");
        Console.WriteLine("Ws Options: "+_ws.Options.ToString());
        try
        {
            await _ws.ConnectAsync(new Uri(url), CancellationToken.None);
            Console.WriteLine("Connected OK");
        }
        catch (Exception ex)
        {
            Console.WriteLine("WS ERROR: " + ex.ToString());
        }

        _ = Task.Run(ReceiveLoop);
    }

    private async Task ReceiveLoop()
    {
        var buffer = new byte[4096];

        while (!_cts.IsCancellationRequested &&
               _ws.State == WebSocketState.Open)
        {
            var result = await _ws.ReceiveAsync(buffer, _cts.Token);

            //heartbeat checkt
            if (result.MessageType == WebSocketMessageType.Binary)
            {
                var text = Encoding.UTF8.GetString(buffer, 0, result.Count);

                if (text == HEARTBEAT_VALUE)
                {
                    var bytes = Encoding.UTF8.GetBytes(HEARTBEAT_VALUE);

                    Console.WriteLine("Received heartbeat, sending back...");
                    await _ws.SendAsync(
                        bytes,
                        WebSocketMessageType.Binary,
                        true,
                        _cts.Token);

                    continue;
                }
            }

            //normal text message
            if (result.MessageType == WebSocketMessageType.Text)
            {
                var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                _hub.Publish(msg);
            }
        }
    }

    /*private async Task ReceiveLoop()
    {
        var buffer = new byte[4096];

        while (!_cts.IsCancellationRequested &&
               _ws.State == WebSocketState.Open)
        {
            var result = await _ws.ReceiveAsync(buffer, _cts.Token);

            var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);

            _hub.Publish(msg);
        }
    }*/

    public async Task Send(string message)
    {
        var bytes = Encoding.UTF8.GetBytes(message);

        await _ws.SendAsync(
            bytes,
            WebSocketMessageType.Text,
            true,
            CancellationToken.None);
    }

    public async Task Stop()
    {
        _cts.Cancel();

        if (_ws.State == WebSocketState.Open)
        {
            await _ws.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "bye",
                CancellationToken.None);
        }
    }
}
