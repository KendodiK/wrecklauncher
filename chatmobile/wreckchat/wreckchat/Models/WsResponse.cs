using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Models;

public class WsResponse
{
    public string? From { get; set; }

    public string? Text { get; set; }

    public string? Error { get; set; }

    public string? Warning { get; set; }
}
