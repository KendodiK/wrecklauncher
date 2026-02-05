using System.Text.Json;

namespace WreckLauncher.Client.Models;

public sealed record SteamOwnedGame(int AppId, int? PlaytimeForever = null);

public sealed record SteamGameDetails(
    int AppId,
    string? Name,
    string? BannerImg,
    JsonElement? Genres,
    long? PriceFinal,
    string? CcUsed,
    string Lang,
    JsonElement Raw
);
