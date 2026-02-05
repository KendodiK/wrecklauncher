using WreckLauncher.Client.Controllers;

var builder = WebApplication.CreateBuilder(args);

// Keep it simple: controller constructors accept HttpClient overrides already.
builder.Services.AddSingleton<SteamGamesController>();
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
