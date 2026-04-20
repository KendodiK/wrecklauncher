# 🎯 How to Run `dotnet workload restore` - Step by Step

## Option 1: Using PowerShell (EASIEST) ⭐

### Step 1: Open PowerShell as Administrator
1. Click the **Windows Start Menu** (or press `Win` key)
2. Type: `PowerShell`
3. Right-click on **"Windows PowerShell"**
4. Click **"Run as administrator"**
5. Click **"Yes"** when prompted

### Step 2: Run the Command
Copy and paste this command into PowerShell:
```powershell
dotnet workload restore
```

Then press **ENTER**

### Step 3: Wait for Installation
You'll see output like:
```
Installing workload: android
Downloading files...
[████████████████████████] 100%
Installing Android workload... Done!

Installing workload: ios
Downloading files...
[████████████████████████] 100%
Installing iOS workload... Done!

Workload installation completed successfully!
```

**Time needed:** 5-15 minutes (depends on internet speed)

---

## Option 2: Using Command Prompt (CMD)

### Step 1: Open Command Prompt as Administrator
1. Click **Windows Start Menu**
2. Type: `cmd`
3. Right-click on **"Command Prompt"**
4. Click **"Run as administrator"**
5. Click **"Yes"** when prompted

### Step 2: Run the Command
```cmd
dotnet workload restore
```

Press **ENTER**

### Step 3: Wait for completion
Same as PowerShell - wait for the success message

---

## Option 3: Using Visual Studio Terminal

### Step 1: Open Visual Studio
1. Launch **Visual Studio** (where your project is open)

### Step 2: Open Terminal
1. Go to menu: **View → Terminal** (or press `` Ctrl+` ``)
2. At the bottom, a terminal window opens

### Step 3: Make Sure Terminal is PowerShell
- Look at the terminal prompt
- If it says `>`, you're in PowerShell ✓
- If it says `C:\>`, you're in CMD ✓
- Either works!

### Step 4: Run the Command
```powershell
dotnet workload restore
```

Press **ENTER**

---

## ✅ What to Expect

### During Installation:
```
Determining workloads to install...
Installing workload: android (version X.X.X)
Downloading and installing files...
████████████░░░░░░░░ 45%

Installing workload: ios (version X.X.X)
Downloading and installing files...
████████████████████ 100%

Installing workload: wasm-tools (version X.X.X)
Installing additional components...
████████████████████ 100%

Workload installation completed successfully!
```

### Success Message:
```
Successfully installed workloads: android, ios, wasm-tools, maui, ...
```

---

## ⏳ What if It's Taking Too Long?

### Normal Wait Times:
- **Checking workloads:** 30 seconds
- **Downloading files:** 2-10 minutes (depends on internet)
- **Installing:** 3-5 minutes
- **Total:** ~5-15 minutes

### If Stuck or Frozen:
1. Wait at least **5 minutes** before giving up
2. If nothing happens after 10 minutes, press `Ctrl+C` to cancel
3. Run the command again: `dotnet workload restore`

---

## 🔍 How to Verify Installation

### After Installation Completes:

Type this command:
```powershell
dotnet workload list
```

Press **ENTER**

### You Should See:
```
Installed Workloads:
android                                             net10.0-android
ios                                                 net10.0-ios
maui                                                net10.0
wasm-tools                                          net10.0-browserwasm

Run `dotnet workload search [query]` to find more workloads
```

✅ **If you see this, installation was successful!**

---

## 🚀 Next: Build Your Project

After workload installation completes, run:

```powershell
cd D:\sulis\ cucok\12\portfolio\wreckchat\wreckchat
dotnet clean
dotnet build
```

Expected result:
```
Build succeeded.
0 errors
0 warnings
```

---

## ❌ Troubleshooting

### Error: "Access Denied"
```
ERROR: Access to path is denied
```
**Fix:** Make sure you ran PowerShell/CMD **as Administrator**
1. Close the window
2. Right-click PowerShell/CMD
3. Select "Run as administrator"
4. Try again

### Error: "dotnet command not found"
```
dotnet: The term 'dotnet' is not recognized
```
**Fix:** .NET 10 SDK isn't installed
1. Download from: https://dotnet.microsoft.com/download/dotnet/10.0
2. Install it
3. Restart PowerShell
4. Try again

### Error: "Network timeout"
```
ERROR: Request timeout
```
**Fix:** Internet connection issue
1. Check your internet
2. Move closer to router
3. Try again in a few minutes

### Installation Seems Stuck
1. Wait at least **10 minutes**
2. Don't close the window
3. If nothing happens after 15 minutes:
   - Press `Ctrl+C` to cancel
   - Run: `dotnet workload restore --verbosity diagnostic`
   - This shows detailed progress

---

## 📋 Quick Command Reference

```powershell
# Check if .NET 10 is installed
dotnet --version

# List installed workloads
dotnet workload list

# Install workloads
dotnet workload restore

# Clean up (if needed)
dotnet workload clean

# Update workloads
dotnet workload update

# Search for specific workload
dotnet workload search android
```

---

## 🎯 Summary

1. **Open PowerShell as Administrator**
2. **Run:** `dotnet workload restore`
3. **Wait:** 5-15 minutes
4. **Verify:** `dotnet workload list`
5. **Build:** `dotnet clean && dotnet build`
6. **Run:** `dotnet run -f net10.0-desktop`

Your chat app will launch! 🎉

---

## 💡 Pro Tips

- ✅ Keep the terminal/PowerShell window open during installation
- ✅ Don't restart your computer during installation
- ✅ Check internet connection before starting
- ✅ Make sure you have ~5GB free disk space
- ✅ Run as Administrator (very important!)

---

**Questions?** Run `dotnet workload help` for more info
