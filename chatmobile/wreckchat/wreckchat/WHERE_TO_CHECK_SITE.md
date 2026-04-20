# 🌐 Where to Check Your Chat App Site

## 🎯 After You Run the Commands

When you run:
```powershell
dotnet run -f net10.0-desktop
```

Your chat app will open automatically on your computer! 

---

## 📍 Where It Opens

### **Option 1: Desktop App (Most Common)**
```powershell
dotnet run -f net10.0-desktop
```

**Result:** A **new window opens** on your desktop showing your chat app

- 🪟 Looks like a regular Windows application
- 📱 Shows LoginPage first
- Can click tabs at bottom to navigate
- **Location:** On your desktop/taskbar

---

### **Option 2: Web Browser**
```powershell
dotnet run -f net10.0-browserwasm
```

**Result:** Opens in your **web browser** (usually Chrome, Edge, or Firefox)

- 🌐 URL will be: `http://localhost:5000` or similar
- 📱 Can test responsive design
- Can open developer tools (F12)
- **Location:** In your default web browser

---

### **Option 3: Mobile (Android Emulator)**
```powershell
dotnet run -f net10.0-android
```

**Result:** Opens in **Android Emulator** (if installed)

- 📱 Simulates a phone
- Full mobile experience
- Needs Android SDK setup
- **Location:** Android Emulator window

---

## 🚀 Step-by-Step: How to View It

### **For Desktop (Easiest):**

1. Open PowerShell as Administrator
2. Run:
```powershell
cd "D:\sulis cucok\12\portfolio\wreckchat\wreckchat"
dotnet run -f net10.0-desktop
```

3. **Wait 1-2 minutes**

4. **A window opens** showing your app! 👈

### **What You'll See:**

```
┌─────────────────────────────────────┐
│ WreckChat                    [_][□][X]│
├─────────────────────────────────────┤
│                                      │
│         Welcome Back                 │
│                                      │
│   [Username.......................]  │
│   [Password.......................]  │
│                                      │
│   ☑ Remember me                      │
│   [Forgot password?]                 │
│                                      │
│      [   LOGIN GREEN   ]             │
│                                      │
│   [or continue with Google/GitHub]   │
│                                      │
│   Don't have account? [Sign up]      │
│                                      │
├─────────────────────────────────────┤
│  💬  🔔  👥  👤                      │
│ (click to switch pages)              │
└─────────────────────────────────────┘
```

---

## 🎯 Navigate Your App

Once it opens, click the tabs at the **bottom**:

| Tab | Shows | Features |
|-----|-------|----------|
| **💬** | ChatPage | Messages, unread counts |
| **🔔** | NotificationsPage | Friend requests, alerts |
| **👥** | FriendsPage | Friends list, **Add Friend ➕** |
| **👤** | ProfilePage | User info, settings |

---

## 🌐 Web Version (Browser)

If you want to test in a browser instead:

### Run This:
```powershell
cd "D:\sulis cucok\12\portfolio\wreckchat\wreckchat"
dotnet run -f net10.0-browserwasm
```

### What Happens:
1. PowerShell shows: `Now listening on: http://localhost:5000`
2. Browser opens automatically
3. You see the same chat app in the browser!

### Access URLs:
- **Local:** `http://localhost:5000`
- **localhost:** `http://127.0.0.1:5000`

---

## 📱 Mobile Version (Android)

If you have Android Emulator set up:

### Run This:
```powershell
dotnet run -f net10.0-android
```

### What Happens:
1. Android Emulator opens
2. Your chat app launches on virtual phone
3. Test mobile UI/UX

---

## 🔍 How to Check It's Running

### Desktop Version:
- ✅ Look in taskbar at bottom of screen
- ✅ Look for "wreckchat" window
- ✅ Or Alt+Tab to see all open windows

### Browser Version:
- ✅ Check active browser tab
- ✅ URL bar shows: `localhost:5000`
- ✅ Or check all browser tabs

### Android Version:
- ✅ Look for Android Emulator window
- ✅ App shows in emulator

---

## 📊 What You Can Test

Once running, test these features:

### LoginPage:
- [ ] Type username
- [ ] Type password
- [ ] Click "Remember me" checkbox
- [ ] Click login button
- [ ] Click "Forgot password?"
- [ ] Click social login buttons

### ChatPage:
- [ ] See list of messages
- [ ] See unread counts
- [ ] See last message preview
- [ ] Click "new message" button
- [ ] Click bottom tabs

### NotificationsPage:
- [ ] See notifications list
- [ ] See timestamps
- [ ] See action buttons
- [ ] Click bottom tabs

### FriendsPage:
- [ ] See friends list
- [ ] See **Add Friend button ➕** (top right)
- [ ] See message buttons
- [ ] Use search bar
- [ ] Click bottom tabs

### ProfilePage:
- [ ] See user info
- [ ] See profile stats
- [ ] See buttons (Edit, Settings, Logout)
- [ ] Click bottom tabs

---

## 🛠️ Development Tools

### In Browser Version:

Press **F12** to open Developer Tools:

```
┌─────────────────────────────────────┐
│ Your App                            │
├─────────────────────────────────────┤
│                                     │
│     [App View Here]                 │
│                                     │
├─────────────────────────────────────┤
│ Elements │ Console │ Network │ etc  │ ← F12
└─────────────────────────────────────┘
```

You can:
- Inspect HTML elements
- Check console for errors
- Monitor network requests
- Debug JavaScript (if any)

---

## 🚨 Troubleshooting: App Won't Show

### Issue: "Nothing happens after dotnet run"
```
→ Wait 30-60 seconds
→ App is compiling in background
→ Window will appear
```

### Issue: "Command prompt is stuck"
```
→ This is normal!
→ The app is running
→ PowerShell shows status/logs
→ Don't close it!
→ To close app, press Ctrl+C
```

### Issue: "App window is behind other windows"
```
→ Press Alt+Tab to switch windows
→ Look in taskbar for "wreckchat" window
→ Click it to bring to front
```

### Issue: "Browser doesn't open automatically"
```
→ Manually go to: http://localhost:5000
→ In your browser address bar
```

---

## 📝 Different Run Configurations

| Command | Where | Best For |
|---------|-------|----------|
| `dotnet run -f net10.0-desktop` | Desktop window | **Testing locally** ⭐ |
| `dotnet run -f net10.0-browserwasm` | Web browser | Testing responsive design |
| `dotnet run -f net10.0-android` | Android emulator | Mobile testing |

---

## ✨ Quick Summary

### **To View Your App:**

1. **Open PowerShell as Administrator**
2. **Run:**
   ```powershell
   cd "D:\sulis cucok\12\portfolio\wreckchat\wreckchat"
   dotnet run -f net10.0-desktop
   ```

3. **Wait 1-2 minutes**

4. **App window appears on your desktop!** 👈

5. **Click tabs to navigate** (💬 🔔 👥 👤)

---

## 🎉 You're Done!

Your chat app is now running and ready to use! 🚀

---

**Questions:**
- 📱 Want to test on phone? Use Android emulator
- 🌐 Want to test in browser? Use `net10.0-browserwasm`
- 💻 Want to test on desktop? Use `net10.0-desktop` (recommended)

**Pick one and enjoy!** ✨
