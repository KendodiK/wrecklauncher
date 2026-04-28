using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.Api;

public interface IApiService
{
    Task<UserModel> GetUsers(string userId = null);
    Task<string> GetOrders();
    Task<string> Login(string username, string password);
    Task<List<FriendModel>> GetFriends(string userId);
    Task<List<FriendModel>> GetChattingFriends(string chatId);
    Task<List<ChatMessageModel>> GetChatMessages(int friendId, int offset);
}
