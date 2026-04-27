namespace wreckchat.Services.WS;

public class WebSocketEventHub : IWebSocketEventHub
{
    public event Action<string>? OnMessage;

    public void Publish(string message)
    {
        OnMessage?.Invoke(message);
    }
}
