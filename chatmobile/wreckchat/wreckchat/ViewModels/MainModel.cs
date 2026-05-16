using System.Diagnostics;
using Microsoft.UI.Dispatching;
using wreckchat.Models;
using wreckchat.Services.Api;
using wreckchat.Services.Auth;
using wreckchat.Services.WS;

namespace wreckchat.ViewModels;

public partial class MainModel : BaseViewModel
{
    private INavigator _navigator;
    private IApiService _apiService;
    private ITokenService _tokenService;
    private IServiceProvider _serviceProvider;
    private readonly IWebSocketEventHub _hub;
    // private IWebSocketService _ws;
    private readonly DispatcherQueue _dispatcher;
    private string _lastMessage;
    private List<UserModel> friends = new();

    public string? Title { get; }

    public MainModel(
        IStringLocalizer localizer,
        IOptions<AppConfig> appInfo,
        INavigator navigator,
        IApiService apiService,
        ITokenService tokenService,
        // IWebSocketService webSocketService,
        IServiceProvider serviceProvider,
        IWebSocketEventHub hub)
    {
        _navigator = navigator;
        _apiService = apiService;
        _tokenService = tokenService;
        //_ws = webSocketService;
        _serviceProvider = serviceProvider;
        _hub = hub;
        _dispatcher = DispatcherQueue.GetForCurrentThread();

        Title = "Main";
        Title += $" - {localizer["ApplicationName"]}";
        Title += $" - {appInfo?.Value?.Environment}";

        _hub.OnMessage += HandleMessage;
    }

    public IState<string> Name => State<string>.Value(this, () => string.Empty);

    private void HandleMessage(string msg)
    {
        _dispatcher.TryEnqueue(() =>
        {
            LastMessage = msg;
        });
    }

    public async Task GoToSecond()
    {
        var name = await Name;
        await _navigator.NavigateViewModelAsync<SecondModel>(this, data: new Entity(name!));
    }

    public async Task<bool> CheckData(string username, string password)
    {
        try
        {
            var token = await _apiService.Login(username, password);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public async Task<UserModel> GetUserData(string userId = null)
    {
        try
        {
            UserModel userData = await _apiService.GetUsers(userId);
            return userData;
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Error fetching user data: " + ex.Message);
            throw;
        }
    }

    public async Task<List<UserModel>> GetFriends(string userId)
    {
        try
        {
            List<FriendModel> friendsIds = await _apiService.GetFriends(userId);
            foreach (var friendId in friendsIds)
            {
                var friend = await _apiService.GetUsers(friendId.User_id);
                friends.Add(friend);
            }
            return friends;
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Error fetching friends: " + ex.Message);
            throw;
        }
    }

    /* public async Task<string> GetGameCount()
    {
        try
        {
            string gameCount = await _apiService.GetGameCount();
            return gameCount;
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Error fetching game count: " + ex.Message);
            throw;
        }
    } */

    public async Task<List<UserModel>> GetChattingFriends(string userId)
    {
        try
        {
            List<string> chattingFriends = await _apiService.GetChattingFriends(userId);
            var chattingFriendModels = new List<UserModel>();

            foreach (var friendId in chattingFriends)
            {
                var friend = await _apiService.GetUsers(friendId);
                chattingFriendModels.Add(friend);
            }

            return chattingFriendModels;
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Error fetching chatting friends: " + ex.Message);
            throw;
        }
    }

    public string LastMessage
    {
        get => _lastMessage;
        set
        {
            _lastMessage = value;
            //OnPropertyChanged();
        }
    }

    /* public async Task InitSocket()
    {
        await _ws.ConnectAsync(null);

        _ = _ws.StartAsync(async (msg) =>
        {
            Debug.WriteLine("WS MSG: " + msg);

            _dispatcher.TryEnqueue(() =>
            {
                LastMessage = msg;
            });

            await Task.CompletedTask;
        });
    } */

    public async Task StartWebSocket()
    {
        var ws = _serviceProvider.GetRequiredService<WebSocketBackgroundService>();

        try
        {
            await ws.StartAsync("ws://api.anchorlauncher.hu:8080");

        }
        catch (Exception ex)
        {
            Console.WriteLine("Error starting WebSocket: " + ex.Message);
            return;
        }
    }
<<<<<<< Updated upstream
=======

    public async Task SendChatMessageAsync(string recipientUserId, string text)
    {
        if (string.IsNullOrWhiteSpace(recipientUserId))
        {
            throw new InvalidOperationException("No chat recipient is selected.");
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var ws = _serviceProvider.GetRequiredService<WebSocketBackgroundService>();
        await ws.SendMessageAsync(recipientUserId, text);
    }

    public async Task<List<ChatMessageModel>> GetChatMessages(int friendId, int offset)
    {
        try
        {
            List<ChatMessageModel> messages = await _apiService.GetChatMessages(friendId, offset);
            return messages;
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Error fetching chat messages: " + ex.Message);
            throw;
        }
    }
>>>>>>> Stashed changes
}
