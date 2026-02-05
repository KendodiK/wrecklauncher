using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using WreckLauncher.Client.Models;

namespace WreckLauncher.Client.Controllers;

/// <summary>
/// Base controller for managing games.
/// (C# translation of frontend/my-electron-app/scripts/GamesController.js)
/// </summary>
public class GamesController
{
    private readonly HttpClient _http;

    /// <summary>Backend base URL (no trailing slash). Defaults to https://localhost:3000.</summary>
    protected readonly string ServerUrl;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public GamesController()
        : this("https://localhost:3000", httpClient: null)
    {
    }

    public GamesController(string serverUrl, HttpClient? httpClient = null)
    {
        ServerUrl = TokenController.NormalizeBaseUrl(serverUrl);
        _http = httpClient ?? CreateDefaultHttpClient();
    }

    private static HttpClient CreateDefaultHttpClient()
    {
        var http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(20)
        };

        http.DefaultRequestHeaders.Accept.Clear();
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("wrecklauncher", "1.0"));
        return http;
    }

    /// <summary>
    /// Uploads a game to the backend.
    /// Calls POST /api/games/upload/:token (see root api.js).
    /// </summary>
    public async Task<UploadGameResult> UploadGameAsync(string token, UploadGameRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("Token is required", nameof(token));
        if (request is null) throw new ArgumentNullException(nameof(request));

        var url = $"{ServerUrl}/api/games/upload/{Uri.EscapeDataString(token)}";

        var json = JsonSerializer.Serialize(request, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };

        using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
        var text = await res.Content.ReadAsStringAsync(ct);

        UploadGameResponse? response = null;
        JsonElement? rawJson = null;

        if (!string.IsNullOrWhiteSpace(text))
        {
            try
            {
                using var doc = JsonDocument.Parse(text);
                rawJson = doc.RootElement.Clone();
                response = doc.RootElement.Deserialize<UploadGameResponse>(JsonOptions);
            }
            catch
            {
                response = null;
                rawJson = null;
            }
        }

        return new UploadGameResult(
            Ok: res.IsSuccessStatusCode,
            StatusCode: (int)res.StatusCode,
            Response: response,
            RawJson: rawJson,
            RawText: text
        );
    }

    /// <summary>
    /// Convenience helper for one-off calls without keeping a controller instance.
    /// </summary>
    public static Task<UploadGameResult> UploadGameAsync(string serverUrl, string token, UploadGameRequest request, CancellationToken ct = default)
        => new GamesController(serverUrl).UploadGameAsync(token, request, ct);
}
