using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.Auth;

public interface ITokenService
{
    Task<string> GetToken();
    Task SetToken(string token);
}
