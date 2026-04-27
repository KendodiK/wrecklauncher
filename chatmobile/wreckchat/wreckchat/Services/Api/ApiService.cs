using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using wreckchat.Models;
using wreckchat.Services.Auth;
using System.Diagnostics;

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
        token = token.Trim('"'); // fontos fix

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

        //Debug.WriteLine($"Login request: {json}");

        var response = await _client.PutAsync("/api/login", content);

        if (!response.IsSuccessStatusCode)
            throw new Exception($"Login failed: {response.StatusCode}");

        var body = await response.Content.ReadAsStringAsync();

        // ha "string" jön vissza JSON-ként → korrekt deserialize
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
        {
            Console.WriteLine("No friends found for user: " + userId);
            throw new Exception("No friends found for user");
        }

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

    public async Task<List<FriendModel>> GetChattingFriends(string chatId)
    {
        await AddAuthHeader();
        var response = await _client.GetAsync($"/api/friends/chatting/{chatId}");
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            Console.WriteLine("No chatting friends found for chat: " + chatId);
            throw new Exception("No chatting friends found for chat");
        }

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
            throw new InvalidOperationException("Failed to deserialize chatting friends response.");
        return friends;
    }

    public async Task<List<ChatMessageModel>> GetChatMessages(int friendId, int offset)
    {
        await AddAuthHeader();
        var response = await _client.GetAsync($"/api/messages/{friendId}/list/{offset}");
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            Console.WriteLine("No chat messages found for friend: " + friendId);
            throw new Exception("No chat messages found for friend");
        }

        var body = await response.Content.ReadAsStringAsync();

        List<ChatMessageModel> messages;

        using var doc = JsonDocument.Parse(body);

        if (doc.RootElement.ValueKind == JsonValueKind.Array)
        {
            messages = JsonSerializer.Deserialize<List<ChatMessageModel>>(body, _jsonOptions);
        }
        else
        {
            var single = JsonSerializer.Deserialize<ChatMessageModel>(body, _jsonOptions);

            messages = new List<ChatMessageModel> { single };
        }

        if (messages == null)
            throw new InvalidOperationException("Failed to deserialize chat messages response.");
        return messages;
    }
}
