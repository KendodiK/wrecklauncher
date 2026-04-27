using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Services.Auth;

internal sealed class TokenResponse
{
    // Keep the name lowercase to match the JSON, or use JsonPropertyName if needed.
    public string token { get; set; } = default!;
}
