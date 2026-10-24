# DropBridge for Windows (builds on GitHub)

1. Create a new GitHub repository and upload the CONTENTS of this folder
   (if .github doesn't upload: Add file > Create new file > `.github/workflows/build.yml`, paste the file from this zip).
2. Actions tab > "Build Windows app" runs by itself (about 5 min).
3. Releases > "DropBridge for Windows (latest build)":
   - DropBridge-Setup.exe     installs it (Start menu shortcut)
   - DropBridge-Portable.exe  runs without installing
4. First run: Windows SmartScreen says "protected your PC" > More info > Run anyway (the app is unsigned).
   Windows Firewall asks about network access > tick Private networks and Allow. Without this the phone can't connect.

Closing the window keeps DropBridge running in the system tray. Right-click the tray icon to quit or start with Windows.

Run from source instead: npm install, then npm start.
