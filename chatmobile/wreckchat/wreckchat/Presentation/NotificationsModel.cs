using System.Collections.ObjectModel;

namespace wreckchat.Presentation;

public class NotificationItem
{
    public string Icon { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Time { get; set; } = string.Empty;
}

public class NotificationsModel
{
    private ObservableCollection<NotificationItem> _notifications = new();

    public ObservableCollection<NotificationItem> Notifications
    {
        get => _notifications;
        set => _notifications = value;
    }

    public NotificationsModel()
    {
        InitializeNotifications();
    }

    private void InitializeNotifications()
    {
        Notifications = new ObservableCollection<NotificationItem>
        {
            new NotificationItem { Icon = "👋", Title = "Friend Request", Message = "John Doe sent you a friend request", Time = "5 mins ago" },
            new NotificationItem { Icon = "💬", Title = "New Message", Message = "Jane Smith: See you tomorrow!", Time = "15 mins ago" },
            new NotificationItem { Icon = "✅", Title = "Friend Accepted", Message = "Alice Johnson accepted your friend request", Time = "1 hour ago" },
            new NotificationItem { Icon = "📢", Title = "Group Update", Message = "You were added to Dev Team", Time = "3 hours ago" },
            new NotificationItem { Icon = "🎉", Title = "Milestone", Message = "You have 50 friends now!", Time = "Yesterday" },
        };
    }

    public void NavigateToChat()
    {
        // TODO: Navigate to chat
    }

    public void NavigateToNotifications()
    {
        // Already on notifications page
    }

    public void NavigateToFriends()
    {
        // TODO: Navigate to friends
    }

    public void NavigateToProfile()
    {
        // TODO: Navigate to profile
    }
}
