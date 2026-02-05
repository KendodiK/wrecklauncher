using System.Text.Json;
using WreckLauncher.Client.Models;

namespace WreckLauncher.Client.Controllers;

/// <summary>
/// Epic Games controller.
///
/// Important: Epic does not offer a simple, stable public "owned games" API like Steam.
/// This controller therefore focuses on what we can do reliably client-side without
/// credentials scraping or backend changes: reading locally installed Epic games
/// from the Epic Launcher manifest files.
/// </summary>
public sealed class EpicGamesController
{
	private static string GetEpicManifestsDir()
	{
		var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
		return Path.Combine(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests");
	}

	private static EpicInstalledGame? TryParseItemJson(string filePath, JsonElement root)
	{
		if (root.ValueKind != JsonValueKind.Object) return null;

		string? appName = root.TryGetProperty("AppName", out var appNameProp) && appNameProp.ValueKind == JsonValueKind.String
			? appNameProp.GetString()
			: null;

		string? displayName = root.TryGetProperty("DisplayName", out var displayNameProp) && displayNameProp.ValueKind == JsonValueKind.String
			? displayNameProp.GetString()
			: null;

		string? installLocation = root.TryGetProperty("InstallLocation", out var installLocationProp) && installLocationProp.ValueKind == JsonValueKind.String
			? installLocationProp.GetString()
			: null;

		string? namespaceId = root.TryGetProperty("Namespace", out var nsProp) && nsProp.ValueKind == JsonValueKind.String
			? nsProp.GetString()
			: null;

		string? catalogItemId = root.TryGetProperty("CatalogItemId", out var catalogProp) && catalogProp.ValueKind == JsonValueKind.String
			? catalogProp.GetString()
			: null;

		string? artifactId = root.TryGetProperty("ArtifactId", out var artifactProp) && artifactProp.ValueKind == JsonValueKind.String
			? artifactProp.GetString()
			: null;

		string? itemId = root.TryGetProperty("ItemId", out var itemIdProp) && itemIdProp.ValueKind == JsonValueKind.String
			? itemIdProp.GetString()
			: null;

		string? appVersion = root.TryGetProperty("AppVersionString", out var verProp) && verProp.ValueKind == JsonValueKind.String
			? verProp.GetString()
			: null;

		long? installSize = null;
		if (root.TryGetProperty("InstallSize", out var sizeProp))
		{
			if (sizeProp.ValueKind == JsonValueKind.Number && sizeProp.TryGetInt64(out var s))
				installSize = s;
		}

		// If the manifest doesn't even identify an app, skip.
		if (string.IsNullOrWhiteSpace(appName) && string.IsNullOrWhiteSpace(displayName)) return null;

		return new EpicInstalledGame(
			ManifestPath: filePath,
			AppName: appName,
			DisplayName: displayName,
			InstallLocation: installLocation,
			Namespace: namespaceId,
			CatalogItemId: catalogItemId,
			ArtifactId: artifactId,
			ItemId: itemId,
			AppVersionString: appVersion,
			InstallSize: installSize,
			Raw: root.Clone()
		);
	}

	public IReadOnlyList<EpicInstalledGame> GetInstalledGames()
	{
		var manifestsDir = GetEpicManifestsDir();
		if (!Directory.Exists(manifestsDir))
			return Array.Empty<EpicInstalledGame>();

		var results = new List<EpicInstalledGame>();
		foreach (var file in Directory.EnumerateFiles(manifestsDir, "*.item", SearchOption.TopDirectoryOnly))
		{
			try
			{
				var text = File.ReadAllText(file);
				if (string.IsNullOrWhiteSpace(text)) continue;

				using var doc = JsonDocument.Parse(text);
				var game = TryParseItemJson(file, doc.RootElement);
				if (game is not null) results.Add(game);
			}
			catch
			{
				// Ignore malformed/locked manifests.
			}
		}

		return results
			.OrderBy(g => g.DisplayName ?? g.AppName ?? string.Empty, StringComparer.OrdinalIgnoreCase)
			.ToList();
	}
}
