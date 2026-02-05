using System.Net.Http.Headers;
using System.Text.Json;

namespace WreckLauncher.Client.Controllers;

/// <summary>
/// Token controller (C# translation of frontend/my-electron-app/scripts/TokenController.js).
/// Stores token in a file and fetches it from backend when missing.
/// </summary>
public class TokenController
{
    private readonly HttpClient _http;

    private readonly string _username;
    private readonly string _password;
    private readonly string _tokenFile;

    /// <summary>HTTPS base URL for backend (no trailing slash).</summary>
    protected readonly string ServerUrl;

    private string? _token;

    public TokenController(string username, string password, string tokenFile, string serverUrl, HttpClient? httpClient = null)
    {
        _username = username;
        _password = password;
        _tokenFile = tokenFile;
        ServerUrl = NormalizeBaseUrl(serverUrl);

        _http = httpClient ?? CreateDefaultHttpClient(ServerUrl);
    }

    private static HttpClient CreateDefaultHttpClient(string serverUrl)
    {
        var handler = new HttpClientHandler();

        // Dev helper: if you use mkcert for localhost, you may need to trust that CA.
        // In .NET this is usually handled by the OS trust store; if you still have TLS issues,
        // consider adding explicit cert validation only for localhost.
        // (left as default here for safety)

        var http = new HttpClient(handler);
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("wrecklauncher", "1.0"));
        http.Timeout = TimeSpan.FromSeconds(15);
        return http;
    }

    /// <summary>
    /// Normalizes a base URL:
    /// - Defaults to https:// if no scheme
    /// - If http://localhost:3000 is provided, upgrades to https://localhost:3000 (matches server.js default)
    /// - Trims trailing slash
    /// </summary>
    public static string NormalizeBaseUrl(string serverUrl)
    {
        var trimmed = (serverUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed)) return "https://localhost:3000";

        var withScheme = Uri.TryCreate(trimmed, UriKind.Absolute, out _)
            ? trimmed
            : $"https://{trimmed}";

        if (!Uri.TryCreate(withScheme, UriKind.Absolute, out var uri))
        {
            return trimmed;
        }

        // Upgrade common local dev endpoint to HTTPS.
        if (uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) &&
            (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || uri.Host == "127.0.0.1" || uri.Host == "::1") &&
            uri.Port == 3000)
        {
            var https = new UriBuilder(uri) { Scheme = Uri.UriSchemeHttps, Port = uri.Port };
            return https.Uri.ToString().TrimEnd('/');
        }

        return uri.ToString().TrimEnd('/');
    }

    private async Task SaveTokenAsync(string token)
    {
        var dir = Path.GetDirectoryName(_tokenFile);
        if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir);
        await File.WriteAllTextAsync(_tokenFile, token);
    }

    private async Task<string?> GetTokenFromFileAsync()
    {
        try
        {
            if (!File.Exists(_tokenFile)) return null;
            var token = await File.ReadAllTextAsync(_tokenFile);
            token = token.Trim();
            if (token.Length >= 2 && token.StartsWith('"') && token.EndsWith('"'))
            {
                token = token[1..^1];
            }
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Logs in to backend and returns token (format: nativeUserId.token).
    /// </summary>
    public virtual async Task<string?> LoginAsync()
    {
        var url = $"{ServerUrl}/api/login/{Uri.EscapeDataString(_username)}/{Uri.EscapeDataString(_password)}";

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        using var res = await _http.SendAsync(req);

        if (!res.IsSuccessStatusCode) return null;

        var text = await res.Content.ReadAsStringAsync();
        try
        {
            // Your backend returns JSON token (string).
            var token = JsonSerializer.Deserialize<string>(text);
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }
        catch
        {
            return null;
        }
    }

    private async Task<string?> GenerateTokenAsync()
    {
        var fromFile = await GetTokenFromFileAsync();
        if (!string.IsNullOrWhiteSpace(fromFile)) return fromFile;

        var token = await LoginAsync();
        if (string.IsNullOrWhiteSpace(token)) return null;

        await SaveTokenAsync(token);
        return token;
    }

    public async Task<string?> GetTokenAsync()
    {
        if (_token is null)
        {
            _token = await GenerateTokenAsync();
        }
        return _token;
    }
}
