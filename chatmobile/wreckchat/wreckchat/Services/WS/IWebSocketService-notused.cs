using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.WS;

public interface IWebSocketService
{
    Task ConnectAsync(string uri);
    Task SendMessageAsync(string message);
    Task DisconnectAsync();
    Task StartAsync(Func<string, Task> onMessage);
}
