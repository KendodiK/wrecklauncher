using wreckchat.Services.Api;

namespace wreckchat.Presentation;

public partial record MainModel
{
    private INavigator _navigator;
    private IApiService _apiService;
    public string? Title { get; }

    public MainModel(
        IStringLocalizer localizer,
        IOptions<AppConfig> appInfo,
        INavigator navigator,
        IApiService apiService)
    {
        _navigator = navigator;
        _apiService = apiService;
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
}
