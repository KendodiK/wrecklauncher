using System;
using System.Collections.Generic;
using System.Text;
using wreckchat.Services.Auth;

namespace wreckchat.Services.Http;

public class AuthHandler : DelegatingHandler
{
    private readonly ITokenService _tokenService;

    public AuthHandler(ITokenService tokenService)
    {
        _tokenService = tokenService;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
        {
            var token = await _tokenService.GetToken();

            if (!string.IsNullOrEmpty(token))
            {
                request.Headers.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            }

            return await base.SendAsync(request, cancellationToken);
        }
    }
