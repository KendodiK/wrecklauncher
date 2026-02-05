using WreckLauncher.Client.Controllers;
using WreckLauncher.Client.Models;

var builder = WebApplication.CreateBuilder(args);

// Keep it simple: controller constructors accept HttpClient overrides already.
builder.Services.AddSingleton<SteamGamesController>();
builder.Services.AddSingleton<GamesController>(sp =>
{
    var backendUrl = Environment.GetEnvironmentVariable("WRECK_BACKEND_URL") ?? "http://localhost:3000";
    return new GamesController(backendUrl);
});
builder.Services.AddSingleton<UserController>(sp =>
{
    // Configuration via environment variables passed from Electron.
    var username = Environment.GetEnvironmentVariable("WRECK_USERNAME") ?? "";
    var password = Environment.GetEnvironmentVariable("WRECK_PASSWORD") ?? "";
    var tokenFile = Environment.GetEnvironmentVariable("WRECK_TOKEN_FILE") ?? "token.txt";
    var backendUrl = Environment.GetEnvironmentVariable("WRECK_BACKEND_URL") ?? "http://localhost:3000";

    return new UserController(username, password, tokenFile, backendUrl);
});

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { ok = true }));

// Auth token (stored on disk; fetched from backend if missing)
// GET /user/token
app.MapGet("/user/token", async (UserController user) =>
{
    try
    {
        var token = await user.GetTokenAsync();
        return string.IsNullOrWhiteSpace(token) ? Results.Unauthorized() : Results.Ok(token);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status500InternalServerError);
    }
});

// Steam store appdetails (unofficial). Example:
// GET /steam/appdetails/45740?cc=de
app.MapGet("/steam/appdetails/{appId:int}", async (int appId, string? cc, SteamGamesController steam, CancellationToken ct) =>
{
    try
    {
        var details = await steam.GetGameDetailsAsync(appId, cc: string.IsNullOrWhiteSpace(cc) ? null : cc, ct: ct);
        return details is null ? Results.NotFound() : Results.Ok(details);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
});

static IReadOnlyList<string> ExtractSteamGenreNames(SteamGameDetails details)
{
    try
    {
        if (details.Genres is not { } genres) return Array.Empty<string>();
        if (genres.ValueKind != System.Text.Json.JsonValueKind.Array) return Array.Empty<string>();

        var list = new List<string>();
        foreach (var g in genres.EnumerateArray())
        {
            if (g.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
            if (g.TryGetProperty("description", out var d) && d.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                var name = d.GetString();
                if (!string.IsNullOrWhiteSpace(name)) list.Add(name);
            }
        }
        return list;
    }
    catch
    {
        return Array.Empty<string>();
    }
}

// Steam store appdetails + upload to backend in one call.
// POST /steam/appdetails/{appId}/upload?cc=de
app.MapPost("/steam/appdetails/{appId:int}/upload", async (
    int appId,
    string? cc,
    SteamGamesController steam,
    UserController user,
    GamesController games,
    CancellationToken ct) =>
{
    try
    {
        var details = await steam.GetGameDetailsAsync(appId, cc: string.IsNullOrWhiteSpace(cc) ? null : cc, ct: ct);
        if (details is null) return Results.NotFound(new { error = "Steam appdetails not found" });

        var token = await user.GetTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) return Results.Unauthorized();

        decimal? cost = null;
        if (details.PriceFinal is { } cents)
        {
            // Steam returns prices in cents.
            cost = cents / 100m;
        }

        var uploadReq = new UploadGameRequest(
            AppId: details.AppId.ToString(),
            PlatformName: "steam",
            Name: details.Name ?? $"steam:{details.AppId}",
            BannerImg: details.BannerImg ?? "",
            Description: null,
            MinimumRequirements: null,
            Cost: cost,
            GenreNames: ExtractSteamGenreNames(details)
        );

        if (string.IsNullOrWhiteSpace(uploadReq.BannerImg))
            return Results.BadRequest(new { error = "Missing banner image from Steam details" });

        var upload = await games.UploadGameAsync(token, uploadReq, ct);
        return Results.Ok(new { details, upload });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
});

// Owned games via Steam Web API using your backend-provided key.
// GET /steam/owned-games/{platformUsername}
app.MapGet("/steam/owned-games/{platformUsername}", async (string platformUsername, UserController user, CancellationToken ct) =>
{
    try
    {
        // UserController currently doesn't take a CancellationToken; keep call simple.
        var games = await user.GetOwnedGamesFromSteamAsync(platformUsername);
        return Results.Ok(games);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
});


// Platform user id via your backend
// GET /platform/userid/{platformName}/{platformUsername}
app.MapGet("/platform/userid/{platformName}/{platformUsername}", async (string platformName, string platformUsername, UserController user) =>
{
    try
    {
        var id = await user.GetPlatformUserIdAsync(platformName, platformUsername);
        return id is null ? Results.NotFound() : Results.Ok(new { platformUserID = id });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
});

app.Run();
