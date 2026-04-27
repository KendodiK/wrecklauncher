using wreckchat.Services.Api;
using wreckchat.Services.Auth;

namespace wreckchat.Models;

public class LoginModel
{
    // Doesnt need to be used, if LoginPage is used, please create a smilar model in Presentation folder and use that instead
    // Current project using MainPage for login, so this is not used, but it can be used for a future LoginPage if needed

    private readonly IApiService _api;
    private readonly ITokenService _tokenService;

    public LoginModel(IApiService apiService, ITokenService tokenService)
    {
        _tokenService = tokenService;
        _api = apiService;
    }

    public async Task<bool> CheckData(string username, string password)
    {
        Console.WriteLine($"Checking data: {username}, {password}");
        if (string.IsNullOrWhiteSpace(username))
        {
            // TODO: Show error
            return false;
        }
        else if (string.IsNullOrWhiteSpace(password))
        {
            // TODO: Show error
            return false;
        }

        var token = await _api.Login(username, password);

        if (token is InvalidOperationException) //do with try catch instead
        {
            // TODO: Show error
            return false;
        }

        await _tokenService.SetToken(token);
        return true;
    }
}
