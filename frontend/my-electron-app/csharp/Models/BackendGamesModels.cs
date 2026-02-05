using System.Text.Json;
using System.Text.Json.Serialization;

namespace WreckLauncher.Client.Models;

public sealed record UploadGameRequest(
    [property: JsonPropertyName("app_id")] string AppId,
    [property: JsonPropertyName("platform_name")] string PlatformName,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("banner_img")] string BannerImg,
    [property: JsonPropertyName("description")] string? Description = null,
    [property: JsonPropertyName("minimum_requirements")] string? MinimumRequirements = null,
    [property: JsonPropertyName("cost")] decimal? Cost = null,
    [property: JsonPropertyName("genre_names")] IReadOnlyList<string>? GenreNames = null
);

public sealed record UploadGameResponse(
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("gameId")] int? GameId,
    [property: JsonPropertyName("error")] string? Error
);

public sealed record UploadGameResult(
    bool Ok,
    int StatusCode,
    UploadGameResponse? Response,
    JsonElement? RawJson,
    string? RawText
);
