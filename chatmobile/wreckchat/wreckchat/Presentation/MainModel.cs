using System.Diagnostics;
using wreckchat.Services.Api;
using wreckchat.Services.WS;
using wreckchat.Models;

namespace wreckchat.Presentation;

public partial record MainModel
{
    private INavigator _navigator;
    private IApiService _apiService;
    private IWebSocketService _ws;
    public string? Title { get; }

    public MainModel(
        IStringLocalizer localizer,
        IOptions<AppConfig> appInfo,
        INavigator navigator,
        IApiService apiService,
        IWebSocketService webSocketService)
    {
        _navigator = navigator;
        _apiService = apiService;
        _ws = webSocketService;
        Title = "Main";
        Title += $" - {localizer["ApplicationName"]}";
        Title += $" - {appInfo?.Value?.Environment}";
    }

    public IState<string> Name => State<string>.Value(this, () => string.Empty);

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

    public async Task<List<FriendModel>> GetFriends(string userId)
    {
        try
        {
            List<FriendModel> friends = await _apiService.GetFriends(userId);
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

    public async Task InitSocket()
    {
        await _ws.ConnectAsync(null);

        _ws.StartAsync(async (msg) =>
        {
            Debug.WriteLine("WS MSG: " + msg);

            // UI update esetén:
            // await Dispatcher.RunAsync(...)
        });
    }
}
