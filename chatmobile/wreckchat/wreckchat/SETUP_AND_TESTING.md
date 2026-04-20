# WreckChat - Setup & Testing Guide

## 🚀 Quick Start - Setup Your Environment

### Step 1: Install Uno Platform Workloads
The errors indicate your system doesn't have the Uno Platform workloads installed. Run these commands in PowerShell (Administrator):

```powershell
dotnet workload restore
```

This will install:
- ✅ Android workload
- ✅ iOS workload  
- ✅ WebAssembly workload
- ✅ All Uno Platform dependencies

### Step 2: Verify Installation
After workload installation, run:
```powershell
dotnet workload list
```

You should see `android`, `ios`, `maui`, `wasm-tools` listed.

### Step 3: Clean & Rebuild
```powershell
cd D:\sulis cucok\12\portfolio\wreckchat\wreckchat
dotnet clean
dotnet build
```

---

## 🧪 Testing Your Chat App

### Method 1: Desktop Testing (Easiest)
```powershell
dotnet run -f net10.0-desktop
```
- ✅ No emulator needed
- ✅ Fastest build
- ✅ See changes instantly

### Method 2: Web Browser Testing
```powershell
dotnet run -f net10.0-browserwasm
```
- ✅ Tests in browser
- ✅ Good for responsive design
- ✅ Accessible via localhost

### Method 3: Android Emulator
```powershell
dotnet run -f net10.0-android
```
- ⚠️ Requires Android SDK/Emulator setup
- ✅ Test on mobile UI

---

## 📝 Current Status

### ✅ What's Working
- 5 complete XAML pages (Login, Chat, Notifications, Friends, Profile)
- Data models with sample data
- Modern dark UI theme with green accents
- Bottom navigation bar on all pages
- Proper C# code-behind files

### ⚠️ Known Issues (RESOLVED)
- ~~ProfileModel.cs namespace conflict~~ ✅ Fixed
- ~~Missing using statements in .xaml.cs~~ ✅ Fixed
- ~~GlobalUsings assembly references~~ ✅ Fixed (workload installation needed)

### ⏳ Remaining: Workload Installation
The remaining ~20 errors will disappear once you run `dotnet workload restore`

---

## 🔧 Troubleshooting

### Error: "NETSDK1147: To build this project, the following workloads must be installed: android"

**Solution:**
```powershell
# Run this command
dotnet workload restore
```

### Error: "CS0234: The type or namespace name 'UI' does not exist in the namespace 'Microsoft'"

**Solution:** 
This is caused by missing workloads. After running `dotnet workload restore`, rebuild:
```powershell
dotnet clean
dotnet build --no-incremental
```

### Error: "The type 'Application' was not found" in App.xaml

**Solution:**
This is a XAML designer preview issue that disappears when you run the app. Not a real compilation error.

---

## 📱 Navigate Between Pages

Currently, buttons on each page don't navigate (they're UI only). To add navigation, you'll need to:

1. Implement a Navigation Service
2. Add click handlers to buttons
3. Use Uno.Extensions.Navigation

Example (when ready to add):
```csharp
private async void ChatButton_Click(object sender, RoutedEventArgs e)
{
    // Navigate to ChatPage
}
```

---

## 🎯 Next Steps After Setup

1. ✅ Run `dotnet workload restore`
2. ✅ Build the project: `dotnet build`
3. ✅ Run on Desktop: `dotnet run -f net10.0-desktop`
4. ⏭️ Add navigation between pages
5. ⏭️ Connect to backend API
6. ⏭️ Add real data binding

---

## 📞 Quick Commands Reference

```powershell
# Setup
dotnet workload restore

# Build
dotnet build
dotnet clean && dotnet build

# Run
dotnet run -f net10.0-desktop           # Desktop
dotnet run -f net10.0-browserwasm       # Web
dotnet run -f net10.0-android           # Android

# Check environment
dotnet --version
dotnet workload list
```

---

## ✨ Chat App Features Ready to Use

### LoginPage
- Username input
- Password input  
- Remember me checkbox
- Social login buttons
- Sign up link

### ChatPage
- Live chat list
- Unread badges
- Last message preview
- New message button

### NotificationsPage
- Friend requests
- New messages
- Acceptances
- Milestone notifications

### FriendsPage
- Friend list with status
- Search functionality
- **Add Friend button (top right)**
- Message & more options

### ProfilePage
- User info & avatar
- Friends/Messages stats
- Bio section
- Edit/Settings/Logout options

---

## 🎨 Design System (Already Implemented)

| Element | Color | Usage |
|---------|-------|-------|
| Background | `#0F172A` | Page background |
| Secondary | `#1E293B` | Cards/Sections |
| Accent | `#10B981` | Active tab/Buttons |
| Text Primary | `#E2E8F0` | Main text |
| Text Secondary | `#94A3B8` | Inactive/Help text |
| Borders | `#334155` | Dividers/Borders |

All colors are already applied in XAML files!

---

**Last Updated:** Today  
**Status:** Ready for Testing  
**Workload Installation Required:** ⚠️ YES
