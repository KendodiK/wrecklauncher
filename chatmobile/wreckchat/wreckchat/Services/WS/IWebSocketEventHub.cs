namespace wreckchat.Services.WS;

public interface IWebSocketEventHub
{
    event Action<WsResponse> OnMessageHub;
    void Publish(WsResponse message);
}
