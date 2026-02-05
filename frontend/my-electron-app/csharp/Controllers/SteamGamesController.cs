using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using WreckLauncher.Client.Models;

namespace WreckLauncher.Client.Controllers;

/// <summary>
/// Steam games controller (C# translation of frontend/my-electron-app/scripts/SteamGamesController.js).
/// Uses Steam's unofficial store appdetails endpoint.
/// </summary>
public sealed class SteamGamesController : GamesController
{
    private readonly HttpClient _http;

    public SteamGamesController(HttpClient? httpClient = null)
    {
        _http = httpClient ?? CreateDefaultHttpClient();
    }

    private static HttpClient CreateDefaultHttpClient()
    {
        var handler = new SocketsHttpHandler
        {
            AutomaticDecompression = DecompressionMethods.None,
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
            MaxConnectionsPerServer = 2
        };

        var http = new HttpClient(handler);
        http.Timeout = TimeSpan.FromSeconds(12);

        http.DefaultRequestHeaders.Accept.Clear();
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/html"));
        http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.9");
        http.DefaultRequestHeaders.ConnectionClose = false;
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        // Headers that make it look more like a browser request.
        http.DefaultRequestHeaders.Referrer = new Uri("https://store.steampowered.com/");
        http.DefaultRequestHeaders.TryAddWithoutValidation("Origin", "https://store.steampowered.com");
        http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Encoding", "identity");

        return http;
    }

    private static TimeSpan Backoff(int attempt, int multiplier = 1)
    {
        // attempt starts at 1
        var baseMs = 700 * attempt * multiplier;
        var jitter = Random.Shared.Next(0, 300);
        var ms = Math.Min(20_000, baseMs + jitter);
        return TimeSpan.FromMilliseconds(ms);
    }

    private async Task<(HttpStatusCode Status, string Body)> GetTextAsync(string url, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        return (res.StatusCode, body);
    }

    public async Task<SteamGameDetails?> GetGameDetailsAsync(int appId, string? cc = "de", string lang = "en", CancellationToken ct = default)
    {
        if (appId <= 0) throw new ArgumentOutOfRangeException(nameof(appId));

        var requestedCc = string.IsNullOrWhiteSpace(cc) ? null : cc.Trim();
        const string fallbackCc = "us";

        async Task<SteamGameDetails?> TryFetchAsync(string? ccToUse)
        {
            var url = "https://store.steampowered.com/api/appdetails?" +
                      $"appids={Uri.EscapeDataString(appId.ToString())}" +
                      (ccToUse is null ? "" : $"&cc={Uri.EscapeDataString(ccToUse)}") +
                      $"&l={Uri.EscapeDataString(lang)}";

            const int retries = 5;
            for (var attempt = 1; attempt <= retries; attempt++)
            {
                var (status, body) = await GetTextAsync(url, ct);

                if (status is HttpStatusCode.TooManyRequests or HttpStatusCode.Forbidden)
                {
                    await Task.Delay(Backoff(attempt, status == HttpStatusCode.Forbidden ? 3 : 1), ct);
                    continue;
                }

                if ((int)status < 200 || (int)status >= 300)
                {
                    return null;
                }

                var trimmed = (body ?? string.Empty).Trim();
                if (trimmed is "" or "null")
                {
                    await Task.Delay(Backoff(attempt), ct);
                    continue;
                }

                JsonDocument doc;
                try
                {
                    doc = JsonDocument.Parse(trimmed);
                }
                catch
                {
                    await Task.Delay(Backoff(attempt), ct);
                    continue;
                }

                using (doc)
                {
                    if (!doc.RootElement.TryGetProperty(appId.ToString(), out var appNode) ||
                        appNode.ValueKind != JsonValueKind.Object)
                        return null;

                    if (!appNode.TryGetProperty("success", out var successProp) ||
                        successProp.ValueKind != JsonValueKind.True)
                        return null;

                    if (!appNode.TryGetProperty("data", out var data) ||
                        data.ValueKind != JsonValueKind.Object)
                        return null;

                    var raw = data.Clone();

                    string? name = raw.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;

                    string? banner = null;
                    if (raw.TryGetProperty("header_image", out var h) && h.ValueKind == JsonValueKind.String) banner = h.GetString();
                    else if (raw.TryGetProperty("capsule_image", out var c) && c.ValueKind == JsonValueKind.String) banner = c.GetString();

                    JsonElement? genres = null;
                    if (raw.TryGetProperty("genres", out var g) && g.ValueKind == JsonValueKind.Array)
                        genres = g.Clone();

                    long? priceFinal = null;
                    if (raw.TryGetProperty("price_overview", out var po) && po.ValueKind == JsonValueKind.Object &&
                        po.TryGetProperty("final", out var f) && f.TryGetInt64(out var fin))
                    {
                        priceFinal = fin;
                    }

                    return new SteamGameDetails(
                        AppId: appId,
                        Name: name,
                        BannerImg: banner,
                        Genres: genres,
                        PriceFinal: priceFinal,
                        CcUsed: ccToUse,
                        Lang: lang,
                        Raw: raw
                    );
                }
            }

            return null;
        }

        // 1) requested cc (if given) else auto
        var result = await TryFetchAsync(requestedCc);
        if (result is not null) return result;

        // 2) auto region if we forced a cc
        if (requestedCc is not null)
        {
            result = await TryFetchAsync(null);
            if (result is not null) return result;
        }

        // 3) fallback region
        if (requestedCc is null || !requestedCc.Equals(fallbackCc, StringComparison.OrdinalIgnoreCase))
        {
            result = await TryFetchAsync(fallbackCc);
            if (result is not null) return result;
        }

        return null;
    }
}
