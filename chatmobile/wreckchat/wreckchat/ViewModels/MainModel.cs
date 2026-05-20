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
    private IServiceProvider _serviceProvider;
    private readonly IWebSocketEventHub _hub;
    private readonly WebSocketBackgroundService _ws;
    private string _lastMessage;
    private List<UserModel> friends = new();

    public string? Title { get; }

    public MainModel(
        IStringLocalizer localizer,
        IOptions<AppConfig> appInfo,
        INavigator navigator,
        IApiService apiService,
        ITokenService tokenService,
        IServiceProvider serviceProvider,
        IWebSocketEventHub hub,
        WebSocketBackgroundService ws)
    {
        _navigator = navigator;
        _apiService = apiService;
        _ws = ws;
        _serviceProvider = serviceProvider;
        _hub = hub;

        Title = "Main";
        Title += $" - {localizer["ApplicationName"]}";
        Title += $" - {appInfo?.Value?.Environment}";

        _hub.OnMessageHub += HandleMessage;
    }

    public IState<string> Name => State<string>.Value(this, () => string.Empty);

    public event Action<WsResponse>? OnWsMessage;

    private void HandleMessage(WsResponse msg)
    {
        OnWsMessage?.Invoke(msg);
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
                friend.SetFriendId(friendId.Id);
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

    public async Task<List<UserModel>> GetChattingFriends(string userId)
    {
        try
        {
            List<FriendModel> chattingFriends = await _apiService.GetChattingFriends(userId);
            var chattingFriendModels = new List<UserModel>();

            foreach (var friendId in chattingFriends)
            {
                var friend = await _apiService.GetUsers(friendId.User_id);
                friend.SetFriendId(friendId.Id);
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

    public async Task StartWebSocket()
    {
        var ws = _serviceProvider.GetService<WebSocketBackgroundService>();

        try
        {
            await ws.StartAsync("ws://api.anchorlauncher.hu:8080"); //production: ws://api.anchorlauncher.hu:8080, local: ws://localhost:8080

        }
        catch (Exception ex)
        {
            Console.WriteLine("Error starting WebSocket: " + ex.Message);
            return;
        }
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

    public async Task SendMessage(string friendId, string message)
    {
        try
        {
            var payload = new
            {
                to = friendId,
                text = message
            };

            var json = System.Text.Json.JsonSerializer.Serialize(payload);

            await _ws.Send(json);

            Debug.WriteLine("Message sent: " + json);
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Error sending message: " + ex.Message);
        }
    }
}
