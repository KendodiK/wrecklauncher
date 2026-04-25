using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using wreckchat.Models;
using wreckchat.Services.Auth;

namespace wreckchat.Services.Api;

public class ApiService : IApiService
{
    private readonly HttpClient _client;
    private readonly ITokenService _tokenService;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public ApiService(HttpClient client, ITokenService tokenService)
    {
        _client = client;
        _tokenService = tokenService;
    }

    private async Task AddAuthHeader()
    {
        var token = await _tokenService.GetToken();
        token = token.Trim('"');

        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
    }


    public async Task<UserModel> GetUsers(string userId = null)
    {
        await AddAuthHeader();
        var token = await _tokenService.GetToken();

        var response = await _client.GetAsync($"/api/native-users/{userId ?? token.Split('.')[0]}");

        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new Exception("No data found for user");

        var body = await response.Content.ReadAsStringAsync();

        var user = JsonSerializer.Deserialize<UserModel>(body, _jsonOptions);

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
        var json = JsonSerializer.Serialize(new { username, password });

        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        Console.WriteLine($"Login request: {json}");

        var response = await _client.PutAsync("/api/login", content);

        if (!response.IsSuccessStatusCode)
            throw new Exception($"Login failed: {response.StatusCode}");

        var body = await response.Content.ReadAsStringAsync();

        var token = JsonSerializer.Deserialize<string>(body);

        if (token == null)
            throw new InvalidOperationException("Failed to deserialize token response.");

        Console.WriteLine(token);

        await _tokenService.SetToken(token);
        return token;
    }

    public async Task<List<FriendModel>> GetFriends(string userId)
    {
        await AddAuthHeader();

        var response = await _client.GetAsync($"/api/friends/{userId}");

        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new Exception("No friends found for user");

        var body = await response.Content.ReadAsStringAsync();

        List<FriendModel> friends;

        using var doc = JsonDocument.Parse(body);

        if (doc.RootElement.ValueKind == JsonValueKind.Array)
        {
            friends = JsonSerializer.Deserialize<List<FriendModel>>(body, _jsonOptions);
        }
        else
        {
            var single = JsonSerializer.Deserialize<FriendModel>(body, _jsonOptions);

            friends = new List<FriendModel> { single };
        }

        if (friends == null)
            throw new InvalidOperationException("Failed to deserialize friends response.");

        return friends;
    }

    /*public async Task<string> GetGameCount()
    {
        await AddAuthHeader();
        var body =  await _client.GetStringAsync("/api/games/gamecount");

        using var doc = JsonDocument.Parse(body);
        int countedGames = doc.RootElement.GetProperty("countedGames").GetInt32();

        return countedGames.ToString();
    } */
}
