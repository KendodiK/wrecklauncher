using System.Text.Json;
using WreckLauncher.Client.Controllers;

var epic = new EpicGamesController();
var games = epic.GetInstalledGames();

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
};

Console.OutputEncoding = System.Text.Encoding.UTF8;
Console.Write(JsonSerializer.Serialize(games, options));
