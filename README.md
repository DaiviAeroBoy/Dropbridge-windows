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

## Share anywhere (online sessions via Filebin)
Switch on "Share anywhere (online)" in the sidebar. DropBridge creates one session = one Filebin bin and shows its QR/link.
Scan it with the DropBridge Android app from any network. A normal camera just opens the files on filebin.net.
Files are kept on filebin.net for about 7 days and anyone with the link can see them. Switching it off deletes the bin.
Needs internet on both devices. Text/links are stored as small .txt files in the bin.

Every push to GitHub builds both .exe files automatically and refreshes the Release.
