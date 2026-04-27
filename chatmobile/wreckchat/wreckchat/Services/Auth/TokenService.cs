using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.Auth;

public class TokenService : ITokenService
{
    private string _token;

    public Task<string> GetToken()
    {
        return Task.FromResult(_token);
    }

    public Task SetToken(string token)
    {
        _token = token;
        return Task.CompletedTask;
    }
}
