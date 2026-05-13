using System.Net.WebSockets;
using System.Text;
using wreckchat.Services.Auth;
using System.Diagnostics;

namespace wreckchat.Services.WS;

public class WebSocketBackgroundService
{
    private readonly IWebSocketEventHub _hub;
    private ClientWebSocket? _ws;
    private readonly ITokenService _tokenService;
    private CancellationTokenSource _cts = new();

    private const string HEARTBEAT_VALUE = "pipi";
    private DateTime _lastHeartbeat = DateTime.UtcNow;

    public WebSocketBackgroundService(IWebSocketEventHub hub, ITokenService tokenService)
    {
        _hub = hub;
        _tokenService = tokenService;
    }

    public async Task StartAsync(string url)
    {
        _cts = new CancellationTokenSource();

        _ = Task.Run(() => RunAsync(url));
    }

    private async Task RunAsync(string url)
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                await ConnectAsync(url);
                await ReceiveLoop();
            }
            catch (Exception ex)
            {
                Debug.WriteLine("WS ERROR: " + ex.Message);
            }

            Debug.WriteLine("Reconnecting in 3s...");
            await Task.Delay(3000);
        }
    }

    private async Task ConnectAsync(string url)
    {
        _ws?.Dispose();
        _ws = new ClientWebSocket();

        var token = await _tokenService.GetToken();
        _ws.Options.SetRequestHeader("Authorization", $"Bearer {token}");

        await _ws.ConnectAsync(new Uri(url), _cts.Token);

        Debug.WriteLine("WS CONNECTED");
    }

    private async Task ReceiveLoop()
    {
        var buffer = new byte[4096];

        while (_ws!.State == WebSocketState.Open &&
               !_cts.IsCancellationRequested)
        {
            var result = await _ws.ReceiveAsync(buffer, _cts.Token);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                Debug.WriteLine("Server closed connection");
                break;
            }

            //heartbeat timeout check
            if ((DateTime.UtcNow - _lastHeartbeat).TotalSeconds > 30)
            {
                Debug.WriteLine("Heartbeat timeout → reconnect");
                break;
            }

            //heartbeat
            if (result.MessageType == WebSocketMessageType.Binary)
            {
                var text = Encoding.UTF8.GetString(buffer, 0, result.Count);

                if (text == HEARTBEAT_VALUE)
                {
                    _lastHeartbeat = DateTime.UtcNow;

                    var bytes = Encoding.UTF8.GetBytes(HEARTBEAT_VALUE);

                    Debug.WriteLine("heartbeat recived sending response...");
                    await _ws.SendAsync(bytes,
                        WebSocketMessageType.Binary,
                        true,
                        _cts.Token);

                    continue;
                }
            }

            //normál message
            if (result.MessageType == WebSocketMessageType.Text)
            {
                var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                _hub.Publish(msg);
            }
        }
    }

    public async Task Send(string message)
    {
        if (_ws?.State != WebSocketState.Open)
            return;

        var bytes = Encoding.UTF8.GetBytes(message);

        await _ws.SendAsync(bytes,
            WebSocketMessageType.Text,
            true,
            _cts.Token);
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
