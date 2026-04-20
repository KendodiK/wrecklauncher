# WreckChat - Uno Platform Chat App Frontend

A modern chat application frontend built with **Uno Platform** (.NET 10) featuring a dark-themed UI with responsive design.

## 📱 Features

### 1. **Login Page** (`LoginPage.xaml`)
- Username and password input fields
- Remember me checkbox
- Forgot password link
- Social login options (Google, GitHub)
- Sign up link
- Modern dark theme with green accent color

### 2. **Chat Page** (`ChatPage.xaml`)
- List of active conversations
- Search functionality
- Unread message badges
- Last message preview
- Chat header with new message button
- Bottom navigation bar

### 3. **Notifications Page** (`NotificationsPage.xaml`)
- Friend requests
- New messages
- Friend acceptances
- Group updates
- Milestone notifications
- Action buttons for each notification

### 4. **Friends Page** (`FriendsPage.xaml`)
- Friend list with online status
- Search functionality
- Add friend button (top right)
- Message button for each friend
- More options menu
- Friend status indicators (Online/Away/Offline)

### 5. **Profile Page** (`ProfilePage.xaml`)
- User avatar
- User information display
- Profile stats (Friends count, Messages count, Joined date)
- Bio section
- Edit profile button
- Change avatar button
- Settings menu
- Privacy options
- Help & Support link
- Logout button

## 🎨 Design

### Color Scheme
- **Background**: `#0F172A` (Dark slate)
- **Secondary Background**: `#1E293B` (Medium slate)
- **Accent Color**: `#10B981` (Green for active/primary actions)
- **Text Primary**: `#E2E8F0` (Light slate)
- **Text Secondary**: `#94A3B8` (Medium slate)
- **Borders**: `#334155` (Light slate)

### Bottom Navigation Bar
Each page features a 4-tab bottom navigation bar with icons:
- 💬 Messages/Chat
- 🔔 Notifications
- 👥 Friends
- 👤 Profile

The active tab is highlighted in green, while inactive tabs are in gray.

## 🏗️ Project Structure

```
wreckchat/
├── Presentation/
│   ├── LoginPage.xaml & .cs
│   ├── LoginModel.cs
│   ├── ChatPage.xaml & .cs
│   ├── ChatModel.cs
│   ├── NotificationsPage.xaml & .cs
│   ├── NotificationsModel.cs
│   ├── FriendsPage.xaml & .cs
│   ├── FriendsModel.cs
│   ├── ProfilePage.xaml & .cs
│   ├── ProfileModel.cs
│   └── Shell.xaml & .cs
├── App.xaml & .cs
└── Models/
```

## 🛠️ View Models

Each page has a corresponding ViewModel implementing `ObservableObject`:

### LoginModel
- Properties: `Username`
- Commands: `LoginCommand`, `SignUpCommand`

### ChatModel
- Collections: `ObservableCollection<ChatItem>` with Name, LastMessage, Time, UnreadCount
- Commands: Navigation commands to all pages

### NotificationsModel
- Collections: `ObservableCollection<NotificationItem>` with Icon, Title, Message, Time
- Commands: Navigation commands to all pages

### FriendsModel
- Collections: `ObservableCollection<FriendItem>` with Name, Status
- Properties: `SearchQuery`
- Commands: `AddFriendCommand`, `StartChatCommand`, `MoreCommand`, Navigation commands

### ProfileModel
- Properties: `Username`, `UserStatus`, `FriendsCount`, `MessagesCount`, `JoinedMonth`, `Bio`
- Commands: `EditProfileCommand`, `ChangeAvatarCommand`, `SettingsCommand`, `PrivacyCommand`, `HelpCommand`, `LogoutCommand`, Navigation commands

## 🎯 Usage

### Setup
1. Ensure you have Uno Platform SDK installed for .NET 10
2. The ViewModels are registered in `App.xaml` as static resources
3. Each page references its ViewModel via DataContext binding

### Navigation
All navigation commands are defined but need to be implemented with your navigation service. Example:
```csharp
private void HandleNavigateChat()
{
    // TODO: Use INavigator or NavigationService to navigate
}
```

### Extending the App
1. Add new chat items or notifications in the `Initialize` methods
2. Implement the TODO navigation commands
3. Connect to your backend API for real data
4. Add animation and transitions as needed

## 🎪 Icon Usage
The app uses Unicode emoji icons for simplicity:
- 💬 Messages
- 🔔 Notifications
- 👥 Friends
- 👤 Profile
- ➕ Add Friend
- 📝 Edit
- 📷 Camera
- ⚙️ Settings
- 🔒 Privacy
- ❓ Help
- 🚪 Logout

For production, consider replacing with proper icon libraries like:
- **Material Design Icons**
- **Fluent Icons**
- **FontAwesome**

## 📦 Dependencies

- **Uno Platform** 5.x+
- **Uno.Toolkit.UI**
- **Uno.Material**
- **.NET 10**
- **Windows App SDK** (if building for Desktop)

## 🚀 Features to Implement

- [ ] Real-time messaging
- [ ] WebSocket connection for notifications
- [ ] Image sharing
- [ ] Voice/Video calls
- [ ] Group chats
- [ ] User blocking
- [ ] Message reactions
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Message search
- [ ] Dark/Light theme toggle

## 📝 Notes

- The current implementation uses mock data for demonstration
- All commands have TODO placeholders for actual business logic
- The design is responsive and works across all Uno Platform targets (iOS, Android, Web, Desktop)
- The dark theme color scheme is optimized for reduced eye strain

## 🤝 Contributing

Feel free to extend this template with additional features such as:
- Settings page
- User search
- Group management
- Advanced chat features
- Theme customization

---

Built with ❤️ using Uno Platform and .NET 10
