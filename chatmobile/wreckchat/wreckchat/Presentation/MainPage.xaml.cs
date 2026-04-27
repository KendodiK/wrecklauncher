using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;
using wreckchat.Services.Api;
using wreckchat.ViewModels;

namespace wreckchat.Presentation;

public sealed partial class MainPage : Page
{
    private string _activeChatName = "";
    private Grid _chatRoomView = null!;
    private Grid _chatListView = null!;
    private TextBlock _chatRoomIncoming = null!;
    private MainModel _model = null!;
    private UserModel user = null!;
    private List<FriendModel> friendsIds = new();
    private List<UserModel> friends = new();
    private List<UserModel> chattingFriends = new();


    public MainPage()
    {
        this.InitializeComponent();
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
            // TODO: Show error
            Console.WriteLine("No name");
            return;
        }
        else if (string.IsNullOrWhiteSpace(password))
        {
            // TODO: Show error
            Console.WriteLine("No pw");
            return;
        }

        _model = ((App)Application.Current).Services.GetService<MainModel>()!;
        var token = await _model.CheckData(username, password);
        Console.WriteLine(token);
        if (!token)
        {
            // TODO: Show error
            Console.WriteLine("No token");
            return;
        }

        user = await _model.GetUserData();
        //todo: barátok lekérdezése

        LoginView.Visibility = Visibility.Collapsed;
        //friends = await _model.GetFriends(user.Id);
        //chattingFriends = await _model.GetChattingFriends(user.Id);

        BuildFrame();
        Console.WriteLine("Starting ws baah");
        await _model.StartWebSocket();
    }

    private void ChatsNav_Click(object sender, RoutedEventArgs e) => ShowTab("Chats");

    private void NotificationsNav_Click(object sender, RoutedEventArgs e) => ShowTab("Notifications");

    private void ProfileNav_Click(object sender, RoutedEventArgs e) => ShowTab("Profile");

    private void OpenChat_Alex(object sender, RoutedEventArgs e) => OpenChatRoom("Alex", "Yo bro you there?");

    private void OpenChat_Mia(object sender, RoutedEventArgs e) => OpenChatRoom("Mia", "Sent you the files");

    private void OpenChat_Noah(object sender, RoutedEventArgs e) => OpenChatRoom("Noah", "See you tomorrow");

    private void BuildFrame()
    {
        AppView.Visibility = Visibility.Visible;
        BottomNav.Visibility = Visibility.Visible;
        ShowTab("Chats");

        ProfileName.Text = user.Name;
        ProfileBio.Text = user.Bio;
    }
    private void BackToChats_Click(object sender, RoutedEventArgs e)
    {
        _chatRoomView.Visibility = Visibility.Collapsed;
        _chatListView.Visibility = Visibility.Visible;
        HeaderTitle.Text = "Chats";
    }

    private void OpenChatRoom(string chatName, string message)
    {
        _activeChatName = chatName;
        HeaderTitle.Text = chatName;
        _chatRoomIncoming.Text = message;
        _chatListView.Visibility = Visibility.Collapsed;
        _chatRoomView.Visibility = Visibility.Visible;
    }

    private async void ShowTab(string tab) //may change to task??
    {
        //todo ide switch:
        //todo ha -> profile, lekérdezni (a még nincs): friends->profile infóval!, gamecount, owned games(count), owned games(list), common count?
        //todo ha -> Notifications, lekérdezni a chat log-ot
        //todo ha -> chats, lekérdezni a jelenleg beszélgető partnereket és az üzeneteket ha rá kattinatanak egy-egyre.


        ChatsTab.Visibility = tab == "Chats" ? Visibility.Visible : Visibility.Collapsed;
        NotificationsTab.Visibility = tab == "Notifications" ? Visibility.Visible : Visibility.Collapsed;
        ProfileTab.Visibility = tab == "Profile" ? Visibility.Visible : Visibility.Collapsed;
        HeaderTitle.Text = tab;

        switch (tab)
        {
            case "Profile":
                break;
            case "Notifications":
                break;
            case "Chats":
                _chatRoomView.Visibility = Visibility.Collapsed;
                _chatListView.Visibility = Visibility.Visible;
                break;
        }

        ChatsNav.Foreground = tab == "Chats" ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240)) : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
        NotificationsNav.Foreground = tab == "Notifications" ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240)) : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
        ProfileNav.Foreground = tab == "Profile" ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240)) : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
    }
}
