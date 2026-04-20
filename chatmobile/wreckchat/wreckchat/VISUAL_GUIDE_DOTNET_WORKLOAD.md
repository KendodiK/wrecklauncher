# 🖼️ Visual Guide: Running `dotnet workload restore`

## METHOD 1: PowerShell Terminal ⭐ (Most Common)

### STEP 1: Open PowerShell as Administrator
```
1. Press Windows Key (⊞)

2. Type: PowerShell
   [Search box shows: PowerShell]

3. Right-click on "Windows PowerShell"

4. Click "Run as administrator"

5. Click "Yes" on the popup
```

### STEP 2: You'll See This Screen
```
┌─────────────────────────────────────────────────┐
│ Windows PowerShell                         [_][□][X] │
├─────────────────────────────────────────────────┤
│                                                   │
│ Windows PowerShell                               │
│ Copyright (C) Microsoft Corporation.             │
│ All rights reserved.                             │
│                                                   │
│ PS C:\Users\YourName>                           │
│                                                   │
└─────────────────────────────────────────────────┘
```

### STEP 3: Type This Command
```
PS C:\Users\YourName> dotnet workload restore
```

Then press **ENTER** ↵

### STEP 4: Installation Starts
```
┌─────────────────────────────────────────────────┐
│ Windows PowerShell                         [_][□][X] │
├─────────────────────────────────────────────────┤
│                                                   │
│ PS C:\Users\YourName> dotnet workload restore   │
│ Determining workloads to install...             │
│                                                   │
│ Installing workload: android                    │
│ Downloading files... [████░░░░░░░░░░░░] 25%    │
│                                                   │
│ [WAITING... DO NOT CLOSE THIS WINDOW]           │
│                                                   │
└─────────────────────────────────────────────────┘
```

### STEP 5: Wait (5-15 minutes)
```
Installing workload: ios
Downloading files... [██████░░░░░░░░░░░░] 45%

Installing workload: wasm-tools
Downloading files... [████████░░░░░░░░░░] 60%

Installing workload: maui
Downloading files... [██████████░░░░░░░░] 75%
```

### STEP 6: Success! ✅
```
┌─────────────────────────────────────────────────┐
│ Windows PowerShell                         [_][□][X] │
├─────────────────────────────────────────────────┤
│                                                   │
│ Workload installation completed successfully!   │
│                                                   │
│ Installed workloads:                            │
│   - android                                     │
│   - ios                                         │
│   - wasm-tools                                  │
│   - maui                                        │
│   - And more...                                 │
│                                                   │
│ PS C:\Users\YourName>                           │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## METHOD 2: Visual Studio Built-in Terminal

### STEP 1: Open Visual Studio
```
[Visual Studio Window]
├─ File
├─ Edit  
├─ View ← Click here
├─ Project
└─ Tools
```

### STEP 2: Click View → Terminal
```
[Visual Studio View Menu]
├─ Solution Explorer
├─ Team Explorer
├─ Output
├─ Terminal ← Click here (Ctrl+`)
├─ Git Changes
└─ Other Windows
```

### STEP 3: Terminal Opens at Bottom
```
┌────────────────────────────────────────────┐
│ VS CODE / PROJECT CODE                     │
├────────────────────────────────────────────┤
│ [Terminal]  [Debug Console]  [Output]     │
├────────────────────────────────────────────┤
│ PS D:\sulis cucok\12\portfolio\wreckchat> │
│                                            │
└────────────────────────────────────────────┘
```

### STEP 4: Copy & Paste the Command
```
PS D:\sulis cucok\12\portfolio\wreckchat> dotnet workload restore
```

Press **ENTER** ↵

### STEP 5: Same Installation Process
```
Determining workloads to install...
Installing workload: android
[████████████░░░░░░░░░░░░░] 50%
```

Wait for completion...

---

## METHOD 3: Command Prompt (CMD)

### STEP 1: Open Command Prompt as Administrator
```
1. Press Windows Key (⊞) + R

2. Type: cmd

3. Press Enter
   [Command Prompt opens]

4. You should see: C:\Users\YourName>
   (If not admin, right-click and "Run as administrator")
```

### STEP 2: Navigate to Project (Optional)
```
C:\Users\YourName> cd D:\sulis\ cucok\12\portfolio\wreckchat\wreckchat
D:\sulis cucok\12\portfolio\wreckchat\wreckchat>
```

### STEP 3: Run the Command
```
D:\sulis cucok\12\portfolio\wreckchat\wreckchat> dotnet workload restore
```

Press **ENTER** ↵

---

## ✅ Verify Installation

After installation completes, run:
```
dotnet workload list
```

Expected output:
```
Installed Workloads:
android          net10.0-android
ios              net10.0-ios  
wasm-tools       net10.0-browserwasm
maui             net10.0
```

✅ You're all set!

---

## 🚀 Next: Build and Run

### Build:
```
dotnet clean
dotnet build
```

Expected: `Build succeeded. 0 errors`

### Run:
```
dotnet run -f net10.0-desktop
```

Your chat app launches! 🎉

---

## ❌ Common Issues

### "Access Denied"
→ Right-click PowerShell/CMD → "Run as administrator"

### "dotnet: The term 'dotnet' is not recognized"
→ .NET SDK not installed → Download from dotnet.microsoft.com

### "Request timeout"
→ Internet issue → Check connection and try again

### Installation Stuck?
→ Wait 10+ minutes before canceling with Ctrl+C

---

## 💡 Key Points

✅ **Run as Administrator** (very important!)  
✅ **Keep the window open** during installation  
✅ **Don't close or restart** computer  
✅ **Need ~5GB free space**  
✅ **5-15 minutes total time**  

You got this! 🚀
