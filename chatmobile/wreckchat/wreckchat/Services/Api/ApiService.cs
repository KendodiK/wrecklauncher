using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Newtonsoft.Json;
using Windows.ApplicationModel.UserDataAccounts.SystemAccess;
using Windows.System;
using wreckchat.Models;
using wreckchat.Services.Auth;

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
        token = token.Trim();

        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
    }

    public async Task<UserModel> GetUsers()
    {
        await AddAuthHeader();
        var token = await _tokenService.GetToken();

        var response = await _client.GetAsync($"/api/native-users/{token.Split('.')[0]}");

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new Exception($"No data found for user");
        }

        var body = await response.Content.ReadAsStringAsync();
        var user = JsonConvert.DeserializeObject<UserModel>(body);
        if (user == null)
            throw new InvalidOperationException("Failed to deserialize user response.");
        return user;
    }

    public async Task<string> GetOrders()
    {
        await AddAuthHeader();
        return await _client.GetStringAsync("/api/orders");
    }

    public async Task<string> Login(string username, string password)
    {
        var json = Newtonsoft.Json.JsonConvert.SerializeObject(new { username, password });
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        Console.WriteLine($"Login request: {json}");

        var response = await _client.PutAsync("/api/login", content);

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"Login failed: {response.StatusCode}");
        }

        var body = await response.Content.ReadAsStringAsync();
        Console.WriteLine(body);

        if (body == null)
            throw new InvalidOperationException("Failed to deserialize token response.");

        string token = Convert.ToString(body).Trim('"');
        Console.WriteLine(token);
        await _tokenService.SetToken(token);
        return token;
    }

    public async Task<List<UserModel>> GetFriends(string userId)
    {
        await AddAuthHeader();
        var response = await _client.GetAsync($"/api/friends/{userId}");
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new Exception($"No friends found for user");
        }
        List<UserModel> users;

        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);

        if (doc.RootElement.ValueKind == JsonValueKind.Array)
        {
            users = JsonSerializer.Deserialize<List<UserModel>>(body);
        }
        else
        {
            var single = JsonSerializer.Deserialize<UserModel>(body);
            users = new List<UserModel> { single };
        }
        var friends = JsonConvert.DeserializeObject<List<UserModel>>(body);
        if (friends == null)
            throw new InvalidOperationException("Failed to deserialize friends response.");
        return friends;
    }
}

// Source-generated context to make JsonSerializer.Deserialize trimming-safe (avoids IL2026).
// Ensure your project enables System.Text.Json source generation (requires target framework and package support).
[JsonSerializable(typeof(TokenResponse))]
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true)]
internal partial class MyJsonContext : JsonSerializerContext
{
}
