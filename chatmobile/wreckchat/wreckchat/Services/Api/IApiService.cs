using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.Api;

public interface IApiService
{
    Task<UserModel> GetUsers();
    Task<string> GetOrders();
    Task<string> Login(string username, string password);
    Task<List<UserModel>> GetFriends(string userId);
}
