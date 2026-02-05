using System.Text.Json;
using WreckLauncher.Client.Models;

namespace WreckLauncher.Client.Controllers;

/// <summary>
/// User controller (C# translation of frontend/my-electron-app/scripts/UserController.js).
/// </summary>
public sealed class UserController : TokenController
{
    private readonly HttpClient _http;

    public UserController(string username, string password, string tokenFile, string serverUrl, HttpClient? httpClient = null)
        : base(username, password, tokenFile, serverUrl, httpClient)
    {
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
    }

    private static string HttpErrorMessage(int status, JsonElement? json, string text)
    {
        if (json is { } j)
        {
            if (j.ValueKind == JsonValueKind.Object)
            {
                if (j.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                    return err.GetString() ?? $"HTTP {status}";
                if (j.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.String)
                    return msg.GetString() ?? $"HTTP {status}";
            }
        }

        var snippet = (text ?? string.Empty).Trim();
        if (snippet.Length > 300) snippet = snippet[..300];
        return string.IsNullOrWhiteSpace(snippet) ? $"HTTP {status}" : snippet;
    }

    private async Task<(HttpResponseMessage Response, JsonElement? Json, string Text)> FetchJsonAsync(string url)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        var res = await _http.SendAsync(req);
        var text = await res.Content.ReadAsStringAsync();

        JsonElement? json = null;
        if (!string.IsNullOrWhiteSpace(text))
        {
            try
            {
                using var doc = JsonDocument.Parse(text);
                json = doc.RootElement.Clone();
            }
            catch
            {
                json = null;
            }
        }

        return (res, json, text);
    }

    public async Task<string?> GetPlatformUserIdAsync(string platformName, string platformUsername)
    {
        var token = await GetTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Missing auth token");

        var url = $"{ServerUrl}/api/platform/UserID/{Uri.EscapeDataString(platformName)}/{Uri.EscapeDataString(platformUsername)}/{Uri.EscapeDataString(token)}";
        var (res, json, text) = await FetchJsonAsync(url);

        if (!res.IsSuccessStatusCode)
            throw new Exception(HttpErrorMessage((int)res.StatusCode, json, text));

        if (json is null) throw new Exception("Invalid JSON response from server");

        if (json.Value.ValueKind == JsonValueKind.Object && json.Value.TryGetProperty("platformUserID", out var idProp))
        {
            return idProp.ToString();
        }

        return null;
    }

    private async Task<string> GetSteamApiKeyAsync()
    {
        var token = await GetTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Missing auth token");

        var url = $"{ServerUrl}/api/steam/key/{Uri.EscapeDataString(token)}";
        var (res, json, text) = await FetchJsonAsync(url);

        if (!res.IsSuccessStatusCode)
            throw new Exception(HttpErrorMessage((int)res.StatusCode, json, text));

        if (json is null) throw new Exception("Invalid JSON response from server");

        if (json.Value.ValueKind == JsonValueKind.Object && json.Value.TryGetProperty("steamApiKey", out var keyProp))
        {
            var key = keyProp.GetString();
            if (!string.IsNullOrWhiteSpace(key)) return key;
        }

        throw new Exception("steamApiKey missing in server response");
    }

    public async Task<IReadOnlyList<SteamOwnedGame>> GetOwnedGamesFromSteamAsync(string platformUsername)
    {
        var steamId = await GetPlatformUserIdAsync("steam", platformUsername);
        if (string.IsNullOrWhiteSpace(steamId)) throw new Exception("Steam ID not found for the given username");

        var key = await GetSteamApiKeyAsync();
        var url = $"https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={Uri.EscapeDataString(key)}&steamid={Uri.EscapeDataString(steamId)}&format=json";

        var (res, json, text) = await FetchJsonAsync(url);
        if (!res.IsSuccessStatusCode)
            throw new Exception(HttpErrorMessage((int)res.StatusCode, json, text));

        if (json is null) throw new Exception("Invalid JSON response from Steam");

        // json.response.games = [{ appid, playtime_forever, ... }]
        var games = new List<SteamOwnedGame>();

        if (json.Value.ValueKind == JsonValueKind.Object &&
            json.Value.TryGetProperty("response", out var responseObj) &&
            responseObj.ValueKind == JsonValueKind.Object &&
            responseObj.TryGetProperty("games", out var gamesArr) &&
            gamesArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var g in gamesArr.EnumerateArray())
            {
                if (g.ValueKind != JsonValueKind.Object) continue;
                if (!g.TryGetProperty("appid", out var appIdProp)) continue;

                if (!appIdProp.TryGetInt32(out var appId)) continue;

                int? playtime = null;
                if (g.TryGetProperty("playtime_forever", out var pt) && pt.TryGetInt32(out var p))
                    playtime = p;

                games.Add(new SteamOwnedGame(appId, playtime));
            }
        }

        return games;
    }
}
