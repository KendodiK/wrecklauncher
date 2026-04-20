using System.Collections.ObjectModel;

namespace wreckchat.Presentation;

public class FriendItem
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}

public class FriendsModel
{
    private ObservableCollection<FriendItem> _friends = new();
    private string _searchQuery = string.Empty;

    public ObservableCollection<FriendItem> Friends
    {
        get => _friends;
        set => _friends = value;
    }

    public string SearchQuery
    {
        get => _searchQuery;
        set => _searchQuery = value;
    }

    public FriendsModel()
    {
        InitializeFriends();
    }

    private void InitializeFriends()
    {
        Friends = new ObservableCollection<FriendItem>
        {
            new FriendItem { Name = "John Doe", Status = "Online" },
            new FriendItem { Name = "Jane Smith", Status = "Online" },
            new FriendItem { Name = "Alice Johnson", Status = "Away" },
            new FriendItem { Name = "Bob Wilson", Status = "Offline" },
            new FriendItem { Name = "Carol Davis", Status = "Online" },
            new FriendItem { Name = "David Brown", Status = "Offline" },
        };
    }

    public void AddFriend()
    {
        // TODO: Show add friend dialog
    }

    public void NavigateToChat()
    {
        // TODO: Navigate to chat
    }

    public void NavigateToNotifications()
    {
        // TODO: Navigate to notifications
    }

    public void NavigateToFriends()
    {
        // Already on friends page
    }

    public void NavigateToProfile()
    {
        // TODO: Navigate to profile
    }

    public void StartChat()
    {
        // TODO: Start chat with friend
    }

    public void ShowMore()
    {
        // TODO: Show more options
    }
}
