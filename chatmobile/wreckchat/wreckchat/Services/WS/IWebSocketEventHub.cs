namespace wreckchat.Services.WS;

public interface IWebSocketEventHub
{
    event Action<WsResponse> OnMessage;
    void Publish(WsResponse message);
}
