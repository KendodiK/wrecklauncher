using System.Collections.ObjectModel;

namespace wreckchat.Presentation;

public class ChatItem
{
    public string Name { get; set; } = string.Empty;
    public string LastMessage { get; set; } = string.Empty;
    public string Time { get; set; } = string.Empty;
    public int UnreadCount { get; set; }
}

public class ChatModel_NotUsed
{
    private ObservableCollection<ChatItem> _chats = new();

    public ObservableCollection<ChatItem> Chats
    {
        get => _chats;
        set => _chats = value;
    }

    public ChatModel_NotUsed()
    {
        InitializeChats();
    }

    private void InitializeChats()
    {
        Chats = new ObservableCollection<ChatItem>
        {
            new ChatItem { Name = "John Doe", LastMessage = "Hey, how are you?", Time = "2:30 PM", UnreadCount = 2 },
            new ChatItem { Name = "Jane Smith", LastMessage = "See you tomorrow!", Time = "1:15 PM", UnreadCount = 0 },
            new ChatItem { Name = "Dev Team", LastMessage = "PR approved ✓", Time = "11:45 AM", UnreadCount = 1 },
            new ChatItem { Name = "Alice Johnson", LastMessage = "Thanks for the help!", Time = "10:20 AM", UnreadCount = 0 },
        };
    }

    public void NavigateToChat()
    {
        // Already on chat page
    }

    public void NavigateToNotifications()
    {
        // TODO: Navigate to notifications
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
