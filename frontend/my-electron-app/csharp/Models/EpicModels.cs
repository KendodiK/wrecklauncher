using System.Text.Json;

namespace WreckLauncher.Client.Models;

public sealed record EpicInstalledGame(
    string ManifestPath,
    string? AppName,
    string? DisplayName,
    string? InstallLocation,
    string? Namespace,
    string? CatalogItemId,
    string? ArtifactId,
    string? ItemId,
    string? AppVersionString,
    long? InstallSize,
    JsonElement Raw
);
