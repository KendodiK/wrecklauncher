using System.Diagnostics;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.System;
using Windows.UI;
using wreckchat.Services.Api;
using wreckchat.ViewModels;
//using static KotlinX.Serialization.Descriptors.PrimitiveKind;

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
            ShowError("No username given");
            Console.WriteLine("No name");
            return;
        }
        else if (string.IsNullOrWhiteSpace(password))
        {
            ShowError("No password given");
            Console.WriteLine("No pw");
            return;
        }

        _model = ((App)Application.Current).Services.GetService<MainModel>()!;
        var token = await _model.CheckData(username, password);
        Console.WriteLine(token);
        if (!token)
        {
            ShowError("Unexpected error while logging in");
            Console.WriteLine("No token");
            return;
        }

        user = await _model.GetUserData();

        LoginView.Visibility = Visibility.Collapsed;
        friends = await _model.GetFriends(user.Id);
        chattingFriends = await _model.GetChattingFriends(user.Id);
        foreach (var chattingFriend in chattingFriends)
        {
            ChatModel c = await FillChats(chattingFriend.GetFriendId());
            chats.Add(c);
        }

        await _model.StartWebSocket();
        _model.OnWsMessage += Model_OnWsMessage;
        BuildFrame();
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

    private void MsgButton_Click(object sender, RoutedEventArgs e)
    {
        CostAlertGrid.Visibility = Visibility.Collapsed;
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

    private async Task<ChatModel> FillChats(int friendId)
    {
        List<ChatMessageModel> messages = await _model.GetChatMessages(friendId, 0);
        ChatModel c;
        Debug.WriteLine("OpenChat");
        if (messages.Count < 1)
        {
            Debug.WriteLine("NoMessages");
            c = new ChatModel(friendId, messages);
        }
        else
        {
            Debug.WriteLine("Got messages");
            c = new ChatModel(friendId, messages, messages[messages.Count - 1].Sender_id, messages[messages.Count - 1].Message);
        }
        return c;
    }

    private async void OpenChat(object sender, RoutedEventArgs e)
    {
        try
        {
            Button s = (Button)sender;
            int friendId = (int)s.Tag;
            List<ChatMessageModel> messages = await _model.GetChatMessages(friendId, 0);
            ChatModel c;
            Debug.WriteLine("OpenChat");
            if (messages.Count < 1)
            {
                Debug.WriteLine("NoMessages");
                c = new ChatModel(friendId, messages);
            }
            else
            {
                Debug.WriteLine("Got messages");
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

    private void Model_OnWsMessage(WsResponse msg)
    {
        Debug.WriteLine($"Received WebSocket message: {msg.Text}");
        DispatcherQueue.TryEnqueue(() =>
        {
            // ERROR
            if (!string.IsNullOrEmpty(msg.Error))
            {
                //incomingMsg = "ERROR: " + msg.Error;
                if (msg.Text != "User offline")
                {
                    ShowError("Hiba az üzenet küldésekor");
                }
                return;
            }

            // WARNING
            if (!string.IsNullOrEmpty(msg.Warning))
            {
                //incomingMsg = "WARNING: " + msg.Warning;
                return;
            }

            if (string.IsNullOrEmpty(msg.From) || string.IsNullOrEmpty(msg.Text))
            {
                //incomingMsg = "Received invalid message.";
                ShowError("Érvénytelen üzenet érkezett");
                return;
            }

            // NORMAL MESSAGE
            HandleIncomingMessage(msg.From!, msg.Text!);
        });
    }

    private void HandleIncomingMessage(string senderUserId, string message)
    {
        var friend = friends?.FirstOrDefault(f => f.Id == senderUserId);

        if (friend != null)
        {
            var chat = chats?.FirstOrDefault(c => c.id == friend.GetFriendId());

            if (chat != null)
            {
                chat.AddMessages(new List<ChatMessageModel>
                    {
                        new ChatMessageModel
                        {
                            Sender_id = friend.Id,
                            Message = message
                        }
                    });

                if (_activeChatName == friend.Name)
                {
                    var incomingMsg = showIncomingMsg(message);
                    MessagesDisp.Children.Add(incomingMsg);
                }
                else
                {
                    string alertMsg = message.Length > 30 ? message.Substring(0, 27) + "..." : message;
                    ShowMessageAllert($"{friend.Name}: {alertMsg}");
                }
            }
        }
    }

    private void ShowError(string error)
    {
        CostAlertGrid.Visibility = Visibility.Visible;
        CostAlertGrid.BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 193, 0, 0));
        AlertText.Text = error;
    }

    private void ShowMessageAllert(string error)
    {
        CostAlertGrid.Visibility = Visibility.Visible;
        CostAlertGrid.BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 5, 205, 90));
        AlertText.Text = error;
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

        var grid = new Grid
        {
            HorizontalAlignment = HorizontalAlignment.Stretch
        };

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
        if (c.lastMessageSenderId == user.Id)
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
