using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace wreckchat.Presentation;

public sealed partial class MainPage : Page
{
    private string _activeChatName = "";
    private Grid _chatRoomView = null!;
    private Grid _chatListView = null!;
    private TextBlock _chatRoomIncoming = null!;

    public MainPage()
    {
        InitializeComponent();
        _chatRoomView = (Grid)FindName("ChatRoomView");
        _chatListView = (Grid)FindName("ChatListView");
        _chatRoomIncoming = (TextBlock)FindName("ChatRoomIncoming");
    }

    private async void Login_Click(object sender, RoutedEventArgs e)
    {
        var username = UsernameInput.Text;
        var password = PasswordInput.Password;

        if (string.IsNullOrWhiteSpace(username))
        {
            return;
        }
        else if (string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        var model = ((App)Application.Current).Services.GetService<MainModel>()!;
        var token = await model.CheckData(username, password);
        if (!token)
        {
            return;
        }

        LoginView.Visibility = Visibility.Collapsed;
        AppView.Visibility = Visibility.Visible;
        BottomNav.Visibility = Visibility.Visible;
        ShowTab("Chats");
    }

    private void ChatsNav_Click(object sender, RoutedEventArgs e) => ShowTab("Chats");

    private void NotificationsNav_Click(object sender, RoutedEventArgs e) => ShowTab("Notifications");

    private void ProfileNav_Click(object sender, RoutedEventArgs e) => ShowTab("Profile");

    private void OpenChat_Alex(object sender, RoutedEventArgs e) => OpenChatRoom("Alex", "Yo bro you there?");

    private void OpenChat_Mia(object sender, RoutedEventArgs e) => OpenChatRoom("Mia", "Sent you the files");

    private void OpenChat_Noah(object sender, RoutedEventArgs e) => OpenChatRoom("Noah", "See you tomorrow");

    private void BackToChats_Click(object sender, RoutedEventArgs e)
    {
        _chatRoomView.Visibility = Visibility.Collapsed;
        _chatListView.Visibility = Visibility.Visible;
        HeaderTitle.Text = "Chats";
    }

    private void OpenChatRoom(string chatName, string message)
    {
        _activeChatName = chatName;
        HeaderTitle.Text = _activeChatName;
        _chatRoomIncoming.Text = message;
        _chatListView.Visibility = Visibility.Collapsed;
        _chatRoomView.Visibility = Visibility.Visible;
    }

    private void ShowTab(string tab)
    {
        ChatsTab.Visibility = tab == "Chats" ? Visibility.Visible : Visibility.Collapsed;
        NotificationsTab.Visibility = tab == "Notifications" ? Visibility.Visible : Visibility.Collapsed;
        ProfileTab.Visibility = tab == "Profile" ? Visibility.Visible : Visibility.Collapsed;

        HeaderTitle.Text = tab;

        if (tab == "Chats")
        {
            _chatRoomView.Visibility = Visibility.Collapsed;
            _chatListView.Visibility = Visibility.Visible;
        }

        ChatsNav.Foreground = tab == "Chats"
            ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240))
            : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
        NotificationsNav.Foreground = tab == "Notifications"
            ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240))
            : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
        ProfileNav.Foreground = tab == "Profile"
            ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240))
            : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
    }
}
