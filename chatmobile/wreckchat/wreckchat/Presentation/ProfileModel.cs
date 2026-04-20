namespace wreckchat.Presentation;

public class ProfileModel
{
    private string _username = "John Doe";
    private string _userStatus = "Online";
    private int _friendsCount = 156;
    private int _messagesCount = 2340;
    private string _joinedMonth = "Jan '24";
    private string _bio = "Software developer, coffee enthusiast, and gaming lover. Always up for a chat! 🚀";

    public string Username
    {
        get => _username;
        set => _username = value;
    }

    public string UserStatus
    {
        get => _userStatus;
        set => _userStatus = value;
    }

    public int FriendsCount
    {
        get => _friendsCount;
        set => _friendsCount = value;
    }

    public int MessagesCount
    {
        get => _messagesCount;
        set => _messagesCount = value;
    }

    public string JoinedMonth
    {
        get => _joinedMonth;
        set => _joinedMonth = value;
    }

    public string Bio
    {
        get => _bio;
        set => _bio = value;
    }

    public void EditProfile()
    {
        // TODO: Show edit profile dialog
    }

    public void ChangeAvatar()
    {
        // TODO: Show file picker for avatar
    }

    public void Settings()
    {
        // TODO: Navigate to settings
    }

    public void Privacy()
    {
        // TODO: Navigate to privacy settings
    }

    public void Help()
    {
        // TODO: Navigate to help
    }

    public void Logout()
    {
        // TODO: Navigate to login page
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
        // TODO: Navigate to friends
    }

    public void NavigateToProfile()
    {
        // Already on profile page
    }
}
