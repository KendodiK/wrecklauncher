namespace wreckchat.Services.WS;

public interface IWebSocketEventHub
{
    event Action<string> OnMessage;
    void Publish(string message);
}
