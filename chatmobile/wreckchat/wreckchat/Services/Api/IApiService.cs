using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.Api;

public interface IApiService
{
    Task<string> GetUsers();
    Task<string> GetOrders();
    Task<string> Login(string username, string password);
}
