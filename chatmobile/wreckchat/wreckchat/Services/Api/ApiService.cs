using System;
using System.Collections.Generic;
using System.Text;
using System.Net.Http.Json;
using wreckchat.Services.Auth;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace wreckchat.Services.Api;

public class ApiService : IApiService
{
    private readonly HttpClient _client;
    private readonly ITokenService _tokenService;

    public ApiService(HttpClient client, ITokenService tokenService)
    {
        _client = client;
        _tokenService = tokenService;
    }

    private async Task AddAuthHeader()
    {
        var token = await _tokenService.GetToken();

        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
    }

    public async Task<string> GetUsers()
    {
        await AddAuthHeader();
        return await _client.GetStringAsync("/api/users");
    }

    public async Task<string> GetOrders()
    {
        await AddAuthHeader();
        return await _client.GetStringAsync("/api/orders");
    }

    public async Task<string> Login(string username, string password)
    {
        var json = JsonSerializer.Serialize(new { username, password });
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _client.PutAsync("/api/login", content);

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"Login failed: {response.StatusCode}");
        }

        var body = await response.Content.ReadAsStringAsync();

        if (body == null)
            throw new InvalidOperationException("Failed to deserialize token response.");

        await _tokenService.SetToken(body);
        return body;
    }
}

// Source-generated context to make JsonSerializer.Deserialize trimming-safe (avoids IL2026).
// Ensure your project enables System.Text.Json source generation (requires target framework and package support).
[JsonSerializable(typeof(TokenResponse))]
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true)]
internal partial class MyJsonContext : JsonSerializerContext
{
}
