using System.Diagnostics;
using Microsoft.UI.Text;
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
    private StackPanel _chatMessagesPanel = null!;
    private TextBox _messageInput = null!;
    private Button _sendMessageButton = null!;
    private UserModel? _activeFriend;
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
        _chatMessagesPanel = (StackPanel)FindName("ChatMessagesPanel");
        _messageInput = (TextBox)FindName("MessageInput");
        _sendMessageButton = (Button)FindName("SendMessageButton");
        _sendMessageButton.IsEnabled = false;
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
        _activeFriend = null;
        _sendMessageButton.IsEnabled = false;
    }

    private void OpenChatRoom(string chatName, string message)
    {
        ChatsTab.Visibility = Visibility.Visible;

        var chatName = friends.Where(f => f.GetFriendId() == chat.id).Select(f => f.Name).FirstOrDefault() ?? "Chat";
        _activeChatName = chatName;
        HeaderTitle.Text = chatName;
        _chatRoomIncoming.Text = string.IsNullOrWhiteSpace(chat.lastMessage) ? "No messages yet." : chat.lastMessage;

        _chatListView.Visibility = Visibility.Collapsed;
        _chatRoomView.Visibility = Visibility.Visible;
        _sendMessageButton.IsEnabled = true;
    }

    private async void OpenChat(object sender, RoutedEventArgs e)
    {
        Button s = (Button)sender;
        int friendId = (int)s.Tag;
        ShowTab("Chats");
        _activeFriend = friends.FirstOrDefault(friend => friend.GetFriendId() == friendId);
        List<ChatMessageModel> messages = await _model.GetChatMessages(friendId, 0);
        var lastMessage = messages.LastOrDefault();
        ChatModel c = new ChatModel(
            friendId,
            messages,
            lastMessage?.Sender_id ?? string.Empty,
            lastMessage?.Message ?? string.Empty);
        chats.Add(c);
        OpenChatRoom(c);
        RenderChatMessages(messages);
        _messageInput.Text = string.Empty;
    }

    private async void SendMessage_Click(object sender, RoutedEventArgs e)
    {
        var message = _messageInput.Text?.Trim();
        if (string.IsNullOrWhiteSpace(message) || _activeFriend is null)
        {
            return;
        }

        try
        {
            await _model.SendChatMessageAsync(_activeFriend.Id, message);
            AppendChatMessage(message, isOutgoing: true);
            _messageInput.Text = string.Empty;
        }
        catch (Exception ex)
        {
            Console.WriteLine("Error sending message: " + ex.Message);
        }
    }

    private void RenderChatMessages(List<ChatMessageModel> messages)
    {
        _chatMessagesPanel.Children.Clear();

        if (messages.Count == 0)
        {
            _chatMessagesPanel.Children.Add(CreateChatBubble("No messages yet.", isOutgoing: false));
            return;
        }

        foreach (var message in messages)
        {
            var isOutgoing = user is not null && message.Sender_id == user.Id;
            AppendChatMessage(message.Message, isOutgoing);
        }
    }

    private void AppendChatMessage(string message, bool isOutgoing)
    {
        _chatMessagesPanel.Children.Add(CreateChatBubble(message, isOutgoing));
    }

    private Border CreateChatBubble(string message, bool isOutgoing)
    {
        byte backgroundRed = isOutgoing ? (byte)0x0B : (byte)0x1E;
        byte backgroundGreen = isOutgoing ? (byte)0x5E : (byte)0x29;
        byte backgroundBlue = isOutgoing ? (byte)0x46 : (byte)0x3B;
        byte borderRed = isOutgoing ? (byte)0x10 : (byte)0x33;
        byte borderGreen = isOutgoing ? (byte)0xB9 : (byte)0x41;
        byte borderBlue = isOutgoing ? (byte)0x81 : (byte)0x55;

        var bubble = new Border
        {
            HorizontalAlignment = isOutgoing ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, backgroundRed, backgroundGreen, backgroundBlue)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, borderRed, borderGreen, borderBlue)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10),
            MaxWidth = 360,
            Margin = new Thickness(0, 0, 0, 8)
        };

        bubble.Child = new TextBlock
        {
            Text = message,
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0)),
            TextWrapping = TextWrapping.Wrap
        };

        return bubble;
    }

    private void ShowTab(string tab)
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
                foreach (var friend in friends)
                {
                    if(friend.shownInFriendsList)
                    {
                        continue;
                    }
                    var uiElement = CreateFriendUIElement(friend);
                    FriendsList.Children.Add(uiElement);
                    friend.ChangeShownInFriendsList();
                }

                break;
            case "Notifications":
                break;
            case "Chats":
                _chatRoomView.Visibility = Visibility.Collapsed;
                _chatListView.Visibility = Visibility.Visible;

                foreach (var chattingFriend in chattingFriends)
                {
                    if(chattingFriend.shownInChatList)
                    {
                        continue;
                    }
                    var chatButton = CreateChatButton(chattingFriend);
                    ChatsList.Children.Add(chatButton);
                    chattingFriend.ChangeShownInChatList();
                }

                break;
        }

        ChatsNav.Foreground = tab == "Chats" ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240)) : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
        NotificationsNav.Foreground = tab == "Notifications" ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240)) : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
        ProfileNav.Foreground = tab == "Profile" ? new SolidColorBrush(Color.FromArgb(255, 226, 232, 240)) : new SolidColorBrush(Color.FromArgb(255, 148, 163, 184));
    }

    public UIElement CreateFriendUIElement(UserModel friend)
    {
        var border = new Border
        {
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x0B, 0x15, 0x2A)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x2A, 0x3F, 0x66)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10)
        };

        var grid = new Grid();

        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var stackPanel = new StackPanel();

        var nameText = new TextBlock
        {
            Text = friend.Name,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0))
        };

        var statusText = new TextBlock
        {
            Text = "Offline", //offline - online logika needed
            FontSize = 12,
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0x94, 0xA3, 0xB8))
        };

        stackPanel.Children.Add(nameText);
        stackPanel.Children.Add(statusText);

        var msgButton = new Button
        {
            Content = "Chat",
            Margin = new Thickness(8, 0, 0, 0),
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x10, 0x1A, 0x33)),
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x2A, 0x3F, 0x66)),
            Tag = friend.GetFriendId(), //its needed to identify which chat to open when clicked.
        };
        Grid.SetColumn(msgButton, 1);

        msgButton.Click += OpenChat;

        grid.Children.Add(stackPanel);
        grid.Children.Add(msgButton);

        border.Child = grid;

        return border;
    }

    public UIElement CreateChatButton(UserModel chattingFriend)
    {
        ChatModel c = chats.Where(chat => chat.id == chattingFriend.GetFriendId()).FirstOrDefault() ?? new ChatModel(chattingFriend.GetFriendId(), new List<ChatMessageModel>(), "", "");
        var button = new Button
        {
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x1E, 0x29, 0x3B)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x33, 0x41, 0x55)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(12),
            Tag = chattingFriend.GetFriendId(), //its needed to identify which chat to open when clicked.
        };

        // Click esemény
        button.Click += OpenChat;

        var grid = new Grid();

        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        // Avatar (kör)
        var avatarBorder = new Border
        {
            Width = 38,
            Height = 38,
            CornerRadius = new CornerRadius(19),
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x33, 0x41, 0x55)),
            VerticalAlignment = VerticalAlignment.Center
        };

        var avatarText = new TextBlock
        {
            Text = chattingFriend.Name.Substring(0, 1),
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0)),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            FontWeight = FontWeights.SemiBold
        };

        avatarBorder.Child = avatarText;

        // Szöveges rész
        var stackPanel = new StackPanel
        {
            Margin = new Thickness(12, 0, 0, 0)
        };
        Grid.SetColumn(stackPanel, 1);

        string nameOfLastSender = friends.Where(f => f.Id == c.lastMessageSenderId).Select(f => f.Name).FirstOrDefault() ?? "";     
        if (nameOfLastSender == "" && c.lastMessageSenderId == user.Id)
        {
            nameOfLastSender = user.Name;
        }

        var nameText = new TextBlock
        {
            Text = nameOfLastSender,
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0)),
            FontWeight = FontWeights.SemiBold
        };

        var messageText = new TextBlock
        {
            Text = c.lastMessage.Length > 10 ? c.lastMessage.Substring(0, 10) + "..." : c.lastMessage, //last msg preview
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0x94, 0xA3, 0xB8)),
            FontSize = 12
        };

        stackPanel.Children.Add(nameText);
        stackPanel.Children.Add(messageText);

        grid.Children.Add(avatarBorder);
        grid.Children.Add(stackPanel);

        button.Content = grid;

        return button;
    }
}
