using System.Diagnostics;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;
using wreckchat.Services.Api;
using wreckchat.ViewModels;
using static KotlinX.Serialization.Descriptors.PrimitiveKind;

namespace wreckchat.Presentation;

public sealed partial class MainPage : Page
{
    private string _activeChatName = "";
    private Grid _chatRoomView = null!;
    private Grid _chatListView = null!;
    //private TextBlock _chatRoomIncoming = null!;
    private MainModel _model = null!;
    private UserModel user = null!;
    private List<UserModel> friends = new();
    private List<UserModel> chattingFriends = new();
    private List<ChatModel> chats = new();

    public MainPage()
    {
        this.InitializeComponent();
        _chatRoomView = (Grid)FindName("ChatRoomView");
        _chatListView = (Grid)FindName("ChatListView");
        //_chatRoomIncoming = (TextBlock)FindName("ChatRoomIncoming");
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
        friends = await _model.GetFriends(user.Id);
        chattingFriends = await _model.GetChattingFriends(user.Id);

        BuildFrame();
        Console.WriteLine("Starting ws baah");
        await _model.StartWebSocket();
    }

    private void ChatsNav_Click(object sender, RoutedEventArgs e) => ShowTab("Chats");

    private void NotificationsNav_Click(object sender, RoutedEventArgs e) => ShowTab("Notifications");

    private void ProfileNav_Click(object sender, RoutedEventArgs e) => ShowTab("Profile");

    private void BuildFrame()
    {
        AppView.Visibility = Visibility.Visible;
        BottomNav.Visibility = Visibility.Visible;
        ShowTab("Chats");

        ProfileName.Text = user.Name;
        ProfileBio.Text = user.Bio;
    }

    private async void SendMessageButton_Click(object sender, RoutedEventArgs e)
    {
        Button s = (Button)sender;
        int friendId = int.Parse(s.Tag.ToString().Split('_')[0]);
        string friendUserId = s.Tag.ToString().Split('_')[1];
        string message = MessageInput.Text;
        if (!string.IsNullOrWhiteSpace(message))
        {
            Debug.WriteLine($"Sending message to -> friendId: {friendId}, friendUserId: {friendUserId}, message: {message}");
            _model.SendMessage(friendUserId, message);
            MessageInput.Text = "";
            var chat = chats.Where(c => c.id == friendId).FirstOrDefault();
            if (chat != null)
            {
                chat.AddMessages(new List<ChatMessageModel> { new ChatMessageModel { Sender_id = user.Id, Message = message } });
                var outgoingMsg = showOutgoingMsg(message);
                MessagesDisp.Children.Add(outgoingMsg);
            }
        }
    }

    private void BackToChats_Click(object sender, RoutedEventArgs e)
    {
        _chatRoomView.Visibility = Visibility.Collapsed;
        _chatListView.Visibility = Visibility.Visible;
        HeaderTitle.Text = "Chats";
    }

    private void OpenChatRoom(ChatModel chat)
    {
        Debug.WriteLine($"OpenChatRoom called with chat id: {chat.id}");
        string chatName = friends.Where(f => f.GetFriendId() == chat.id).First().Name;
        string friendUserId = friends.Where(f => f.GetFriendId() == chat.id).First().Id;

        _activeChatName = chatName;
        HeaderTitle.Text = chatName;

        _chatListView.Visibility = Visibility.Collapsed;
        ProfileTab.Visibility = Visibility.Collapsed;
        if (chat.messages.Count > 0)
        { 
            BuildMessagesDisp(chat.messages);
        }
        SendMessageButton.Tag = chat.id + "_" + friendUserId;
        _chatRoomView.Visibility = Visibility.Visible;
    }

    private async void OpenChat(object sender, RoutedEventArgs e)
    {
        try
        {
            Button s = (Button)sender;
            int friendId = (int)s.Tag;
            List<ChatMessageModel> messages = await _model.GetChatMessages(friendId, 0);
            ChatModel c;
            if (messages.Count == 0)
            {
                c = new ChatModel(friendId, messages);
            }
            else
            {
                c = new ChatModel(friendId, messages, messages[messages.Count - 1].Sender_id, messages[messages.Count - 1].Message);
            }
            chats.Add(c);
            OpenChatRoom(c);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"OpenChat error: {ex.Message}");
            Debug.WriteLine($"Stack trace: {ex.StackTrace}");
        }
    }

    private async void ShowTab(string tab) //may change to task??
    {
        //todo ide switch:
        //todo ha -> Notifications, lekérdezni a chat log-ot


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
                        break;
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
                        break;
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

        var profileButton = new Button
        {
            Content = "Profile", //szerintem emögött nincsen semmi
            Margin = new Thickness(8, 0, 0, 0),
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x10, 0x1A, 0x33)),
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x2A, 0x3F, 0x66))
        };
        Grid.SetColumn(profileButton, 1);

        var msgButton = new Button
        {
            Content = "⌲", 
            Margin = new Thickness(8, 0, 0, 0),
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x10, 0x1A, 0x33)),
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x2A, 0x3F, 0x66)),
            Tag = friend.GetFriendId(), //its needed to identify which chat to open when clicked.
        };
        Grid.SetColumn(msgButton, 2);

        msgButton.Click += OpenChat;

        grid.Children.Add(stackPanel);
        grid.Children.Add(profileButton);
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

    public void BuildMessagesDisp(List<ChatMessageModel> messages)
    {
        MessagesDisp.Children.Clear();
        foreach (var message in messages)
        {
            if (message.Sender_id == user.Id)
            {
                MessagesDisp.Children.Add(showOutgoingMsg(message.Message));
            }
            else
            {
                MessagesDisp.Children.Add(showIncomingMsg(message.Message));
            }
        }
    }

    public Border showIncomingMsg(string message)
    {
        var incomingBorder = new Border
        {
            HorizontalAlignment = HorizontalAlignment.Left,
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x1E, 0x29, 0x3B)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x33, 0x41, 0x55)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10)
        };

        var incomingText = new TextBlock
        {
            Text = message,
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0))
        };
        
        incomingBorder.Child = incomingText;

        return incomingBorder;
    }

    public Border showOutgoingMsg(string message)
    {
        var outgoingBorder = new Border
        {
            HorizontalAlignment = HorizontalAlignment.Right,
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 0x0B, 0x5E, 0x46)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0x10, 0xB9, 0x81)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10)
        };

        var outgoingText = new TextBlock
        {
            Text = message,
            Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 0xE2, 0xE8, 0xF0))
        };

        outgoingBorder.Child = outgoingText;
        return outgoingBorder;
    }
}
