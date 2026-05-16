using System.Diagnostics;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using wreckchat.Services.Auth;

namespace wreckchat.Services.WS;

public class WebSocketBackgroundService
{
    private readonly IWebSocketEventHub _hub;
    private ClientWebSocket? _ws;
    private readonly ITokenService _tokenService;
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _cts;
    private Task? _receiveTask;
    private const string HEARTBEAT_VALUE = "pipi";
    private DateTime _lastHeartbeat = DateTime.UtcNow;

    public WebSocketBackgroundService(IWebSocketEventHub hub, ITokenService tokenService)
    {
        _hub = hub;
        _tokenService = tokenService;
    }

    public Task ConnectAsync(string url) => StartAsync(url);

    public async Task StartAsync(string url)
    {
<<<<<<< Updated upstream
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
=======
        Debug.WriteLine("----------Attempt to start ws-----------");

        await Stop();

        var token = (await _tokenService.GetToken())?.Trim('"');
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("No token available for WebSocket connection.");
>>>>>>> Stashed changes
        }

        _cts = new CancellationTokenSource();
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Authorization", $"Bearer {token}");

        Debug.WriteLine("Connecting to websocket: " + url);

        await _ws.ConnectAsync(new Uri(url), CancellationToken.None);
        Debug.WriteLine("Connected OK");

        _receiveTask = ReceiveLoopAsync(_ws, _cts.Token);
    }

    private async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        using var messageBuffer = new MemoryStream();

        try
        {
            while (!cancellationToken.IsCancellationRequested &&
                   ws.State == WebSocketState.Open)
            {
                messageBuffer.SetLength(0);

                WebSocketReceiveResult result;

                do
                {
                    result = await ws.ReceiveAsync(buffer, cancellationToken);

<<<<<<< Updated upstream
                    Console.WriteLine("Received heartbeat, sending back...");
                    await _ws.SendAsync(
                        bytes,
                        WebSocketMessageType.Binary,
                        true,
                        _cts.Token);
=======
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Debug.WriteLine("WebSocket close frame received.");
                        return;
                    }

                    messageBuffer.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                var payload = Encoding.UTF8.GetString(messageBuffer.ToArray());

                if (result.MessageType == WebSocketMessageType.Binary)
                {
                    if (payload == HEARTBEAT_VALUE)
                    {
                        var heartbeatBytes = Encoding.UTF8.GetBytes(HEARTBEAT_VALUE);

                        Debug.WriteLine("Received heartbeat, sending back...");
                        await ws.SendAsync(
                            heartbeatBytes,
                            WebSocketMessageType.Binary,
                            true,
                            cancellationToken);
                    }
>>>>>>> Stashed changes

                    continue;
                }

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    _hub.Publish(payload);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            Debug.WriteLine("WS receive error: " + ex);
        }
    }

    public Task Send(string message) => SendMessageAsync(message);

    public Task SendMessageAsync(string message) => SendPayloadAsync(message);

    public Task SendMessageAsync(string to, string text)
        => SendPayloadAsync(JsonSerializer.Serialize(new { to, text }));

    private async Task SendPayloadAsync(string payload)
    {
        var ws = _ws;
        if (ws is null || ws.State != WebSocketState.Open)
        {
            throw new InvalidOperationException("WebSocket is not connected.");
        }

        var bytes = Encoding.UTF8.GetBytes(payload);

        await ws.SendAsync(
            bytes,
            WebSocketMessageType.Text,
            true,
            _cts.Token);
    }

    public Task DisconnectAsync() => Stop();

    public async Task Stop()
    {
        var receiveTask = _receiveTask;
        var cancellationTokenSource = _cts;
        var ws = _ws;

        _receiveTask = null;
        _cts = null;
        _ws = null;

        cancellationTokenSource?.Cancel();

        if (ws is not null)
        {
            try
            {
                if (ws.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    await ws.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "bye",
                        CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("WebSocket close error: " + ex);
            }
            finally
            {
                ws.Dispose();
            }
        }

        if (receiveTask is not null)
        {
            try
            {
                await receiveTask;
            }
            catch (OperationCanceledException)
            {
            }
            catch (Exception ex)
            {
                Debug.WriteLine("WebSocket receive task error: " + ex);
            }
        }

        cancellationTokenSource?.Dispose();
    }
}
