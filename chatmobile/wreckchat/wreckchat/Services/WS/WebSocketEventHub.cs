namespace wreckchat.Services.WS;
using System.Diagnostics;

public class WebSocketEventHub : IWebSocketEventHub
{
    public event Action<WsResponse>? OnMessageHub;

    public void Publish(WsResponse message)
    {
        Debug.WriteLine("Msg published");
        OnMessageHub?.Invoke(message);
    }
}
