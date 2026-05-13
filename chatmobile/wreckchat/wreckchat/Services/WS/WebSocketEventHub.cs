namespace wreckchat.Services.WS;

public class WebSocketEventHub : IWebSocketEventHub
{
    public event Action<WsResponse>? OnMessage;

    public void Publish(WsResponse message)
    {
        OnMessage?.Invoke(message);
    }
}
