# 🦊 DataFox

<div align="center">

![DataFox Logo](public/assets/icons/datafox-icon.svg)

**A modern, beautiful, and intuitive FTP client for the modern developer**

[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron-47848f.svg)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38b2ac.svg)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*Experience file transfer like never before with DataFox - where modern design meets powerful functionality*

[Download](#-installation--setup) • [Features](#-features) • [Screenshots](#-screenshots) • [Documentation](#-usage-guide)

</div>

---

## 🌟 Why DataFox?

DataFox transforms the file transfer experience with a **contemporary interface**, **smart features**, and **rock-solid reliability**. Built for developers, designers, and system administrators who demand both power and elegance.

### 🆚 DataFox vs. Traditional FTP Clients

| Feature | DataFox | Traditional Clients |
|---------|---------|-------------------|
| **Modern UI** | ✅ Contemporary design with dark/light themes | ❌ Outdated interfaces |
| **Multi-Protocol** | ✅ FTP, FTPS, SFTP, S3 | ⚠️ Limited protocol support |
| **Smart Bookmarks** | ✅ Intelligent connection management | ❌ Basic bookmark systems |
| **Real-time Updates** | ✅ Live connection status & transfers | ❌ Static interfaces |
| **Developer Experience** | ✅ Built with modern web technologies | ❌ Legacy codebases |

---

## ✨ Features

### 🔌 **Universal Protocol Support**
- **FTP** - Traditional File Transfer Protocol
- **FTPS** - FTP with SSL/TLS encryption  
- **SFTP** - SSH File Transfer Protocol
- **S3** - Amazon S3 compatible storage

### 🎨 **Beautiful Modern Interface**
- **Sleek Design** - Contemporary UI with smooth animations
- **Dark/Light Themes** - Adaptive interface that respects your preferences
- **Smart Sidebar** - Collapsible navigation with quick actions
- **Rich Icons** - Intuitive Heroicons throughout the interface
- **Responsive Layout** - Perfect on any screen size

### 📁 **Intelligent File Management**
- **Drag & Drop** - Intuitive file uploads and organization
- **Smart Navigation** - Breadcrumb paths and quick directory access
- **File Operations** - Create, rename, delete, and manage permissions
- **Advanced Sorting** - Sort by name, size, date, or type
- **File Preview** - Quick preview for supported file types
- **Batch Operations** - Handle multiple files efficiently

### 🔖 **Smart Bookmark System**
- **Visual Bookmarks** - Save connections with custom names and descriptions
- **Quick Connect** - One-click access to frequently used servers
- **Smart Detection** - Automatically suggests saving new connections
- **Bookmark Management** - Organize, edit, and delete saved connections
- **Import/Export** - Share bookmarks across devices

### 🚀 **Advanced Features**
- **Transfer Queue** - Monitor uploads/downloads with progress tracking
- **Background Transfers** - Non-blocking file operations
- **Connection Monitoring** - Real-time status updates and auto-reconnection
- **Error Recovery** - Intelligent error handling with retry mechanisms
- **Keyboard Shortcuts** - Power user shortcuts for everything
- **Secure Storage** - Encrypted credential storage

### 🛡️ **Security & Privacy**
- **Context Isolation** - Secure Electron architecture
- **Encrypted Storage** - System keychain integration
- **No Remote Code** - Eliminates security vulnerabilities
- **Secure IPC** - Safe communication between processes

---

## 🖼️ Screenshots

<div align="center">

### 🌙 Dark Theme
![DataFox Dark Theme](docs/screenshots/dark-theme.png)

### ☀️ Light Theme  
![DataFox Light Theme](docs/screenshots/light-theme.png)

### 📱 Responsive Design
![DataFox Mobile](docs/screenshots/responsive.png)

</div>

---

## 🛠️ Tech Stack

<div align="center">

| Frontend | Backend | Desktop | Styling | Animation |
|----------|---------|---------|---------|-----------|
| React 18 | Electron 27 | Electron | Tailwind CSS 3 | Framer Motion |
| Next.js 14 | Node.js | Native APIs | Custom Components | Smooth Transitions |

</div>

### 📚 Key Libraries
- **FTP Libraries**: `basic-ftp`, `ssh2-sftp-client`
- **S3 Support**: `@aws-sdk/client-s3`
- **State Management**: React Hooks + Context
- **Notifications**: React Hot Toast
- **Icons**: Heroicons
- **Build Tools**: Electron Builder

---

## 📦 Installation & Setup

### 🔽 Download Release (Recommended)

**[📥 Download Latest Release](https://github.com/yourusername/datafox/releases/latest)**

Available for:
- 🍎 **macOS** (Intel & Apple Silicon)
- 🪟 **Windows** (x64)
- 🐧 **Linux** (AppImage, deb, rpm)

### 🔧 Development Setup

#### Prerequisites
- **Node.js** 18 or higher
- **npm** or **yarn**

#### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/datafox.git
cd datafox

# Install dependencies
npm install

# Start development server
npm run dev
```

#### Build from Source

```bash
# Build for production
npm run build:electron

# Package for distribution
npm run dist
```

---

## 🎯 Usage Guide

### 🚀 First Connection

1. **Launch DataFox**
2. **Click "New Connection"** or press `Cmd+N` (Mac) / `Ctrl+N` (Windows/Linux)
3. **Configure connection**:
   ```
   Protocol: FTP/FTPS/SFTP/S3
   Host: your-server.com
   Port: 21 (FTP), 22 (SFTP), 443 (S3)
   Username: your-username
   Password: your-password
   ```
4. **Save as bookmark** for quick future access
5. **Connect and explore!**

### 📁 File Operations

| Action | Method | Shortcut |
|--------|--------|----------|
| **Upload Files** | Click upload button or drag & drop | `Cmd+U` |
| **Download Files** | Right-click → Download | `Cmd+D` |
| **Create Folder** | Click folder button | `Cmd+Shift+N` |
| **Delete Items** | Select → Delete | `Delete` |
| **Refresh View** | Click refresh button | `F5` |
| **Navigate Up** | Click up arrow | `Backspace` |

### 🔖 Bookmark Management

- **Quick Save**: Check "Save as bookmark" when connecting
- **Manage All**: Click bookmark icon in sidebar
- **Quick Connect**: Click any bookmark in the list
- **Smart Suggestions**: DataFox suggests saving frequent connections

### ⌨️ Keyboard Shortcuts

#### Connection Management
- `Cmd+N` / `Ctrl+N` - New Connection
- `Cmd+B` / `Ctrl+B` - Manage Bookmarks
- `Cmd+D` / `Ctrl+D` - Disconnect

#### File Operations
- `Cmd+U` / `Ctrl+U` - Upload Files
- `Cmd+Shift+N` / `Ctrl+Shift+N` - Create Folder
- `F5` - Refresh Directory
- `Backspace` - Navigate Up
- `Delete` - Delete Selected
- `Cmd+A` / `Ctrl+A` - Select All

#### Interface
- `Cmd+,` / `Ctrl+,` - Preferences
- `Cmd+Shift+I` / `Ctrl+Shift+I` - Developer Tools
- `Cmd+Q` / `Ctrl+Q` - Quit Application

---

## 🏗️ Architecture

### 📁 Project Structure
```
datafox/
├── 🎯 src/main/              # Electron main process
│   ├── main.js               # Application entry point
│   ├── managers/             # Protocol managers
│   │   ├── ftpManager.js     # FTP/SFTP handling
│   │   └── s3Manager.js      # S3 connections
│   └── preload.js            # Secure IPC bridge
├── 🖼️ components/            # React components
│   ├── FTPClient.js          # Main application
│   ├── FileExplorer.js       # File browser
│   ├── ConnectionModal.js    # Connection dialog
│   ├── BookmarkModal.js      # Bookmark management
│   └── StatusBar.js          # Status display
├── 🎨 styles/                # Styling
│   └── globals.css           # Tailwind configuration
├── 🦊 assets/                # Brand assets
│   ├── icons/                # App icons
│   └── screenshots/          # Documentation images
└── 📋 docs/                  # Documentation
```

### 🔒 Security Architecture

DataFox implements **defense-in-depth** security:

1. **Context Isolation** - Renderer process isolation
2. **Preload Scripts** - Secure IPC communication
3. **No Remote Module** - Eliminates RCE vulnerabilities
4. **Encrypted Storage** - System keychain integration
5. **Input Validation** - Comprehensive data sanitization

---

## 🔧 Configuration

### 🌍 Environment Variables
```bash
NODE_ENV=development          # Development mode
ELECTRON_IS_DEV=true         # Override dev detection
DEBUG=datafox:*              # Enable debug logging
```

### ⚙️ Build Configuration
```json
{
  "build": {
    "appId": "com.datafox.client",
    "productName": "DataFox",
    "icon": "public/assets/icons/datafox-icon",
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] }
      ]
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": ["AppImage", "deb", "rpm"]
    }
  }
}
```

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### 🐛 Bug Reports
1. Check [existing issues](../../issues)
2. Create detailed bug report with:
   - Steps to reproduce
   - Expected vs actual behavior
   - System information
   - Screenshots if applicable

### 💡 Feature Requests
1. Check [discussions](../../discussions)
2. Describe the feature and use case
3. Consider implementation approach

### 🔧 Development
1. **Fork** the repository
2. **Create** feature branch (`git checkout -b feature/amazing-feature`)
3. **Implement** your changes with tests
4. **Commit** with clear messages (`git commit -m 'Add amazing feature'`)
5. **Push** to branch (`git push origin feature/amazing-feature`)
6. **Open** Pull Request

### 📝 Code Style
- Use **Prettier** for formatting
- Follow **React** best practices
- Write **meaningful** commit messages
- Add **JSDoc** comments for functions

---

## 🛣️ Roadmap

### 🔜 Coming Soon
- [ ] **Cloud Integrations** - Google Drive, Dropbox, OneDrive
- [ ] **Sync Functionality** - Bidirectional folder synchronization
- [ ] **Advanced Search** - Find files across connections
- [ ] **Plugins System** - Extensible architecture
- [ ] **Team Features** - Shared bookmarks and connections

### 🎯 Future Vision
- [ ] **Mobile App** - iOS/Android companion
- [ ] **Web Interface** - Browser-based client
- [ ] **API Integration** - REST API for automation
- [ ] **Enterprise Features** - SSO, audit logs, compliance

---

## 📊 Performance

DataFox is optimized for speed and efficiency:

- **🚀 Fast Startup** - < 2 seconds cold start
- **💾 Low Memory** - < 100MB typical usage
- **⚡ Efficient Transfers** - Multi-threaded operations
- **🔄 Smart Caching** - Intelligent directory caching
- **📱 Responsive UI** - 60fps animations

---

## 🌐 Compatibility

### Operating Systems
- **macOS** 10.14+ (Intel & Apple Silicon)
- **Windows** 10/11 (x64)
- **Linux** - Ubuntu 18.04+, CentOS 7+, Arch, Fedora

### Protocols
- **FTP** - RFC 959 compliant
- **FTPS** - Explicit/Implicit SSL/TLS
- **SFTP** - SSH File Transfer Protocol
- **S3** - Amazon S3 API compatible

---

## 🆘 Support & Help

### 📖 Documentation
- **[User Guide](docs/user-guide.md)** - Comprehensive usage documentation
- **[Developer Docs](docs/developer.md)** - Technical implementation details
- **[FAQ](docs/faq.md)** - Frequently asked questions

### 💬 Community
- **[GitHub Issues](../../issues)** - Bug reports and feature requests
- **[Discussions](../../discussions)** - Questions and community chat
- **[Discord Server](https://discord.gg/datafox)** - Real-time community support

### 🐛 Troubleshooting
1. Check the **[FAQ](docs/faq.md)** for common issues
2. Enable **debug mode** for detailed logging
3. Search **[existing issues](../../issues)** for solutions
4. Create **new issue** with detailed information

---

## 📄 License

DataFox is open source software licensed under the **[MIT License](LICENSE)**.

```
MIT License - feel free to use in personal and commercial projects
```

---

## 🙏 Acknowledgments

### 🎨 Design Inspiration
- **Cyberduck** - The gold standard of FTP clients
- **Finder/Explorer** - Native file manager interfaces
- **VS Code** - Modern application design patterns

### 🛠️ Technology Partners
- **[Electron](https://electronjs.org/)** - Cross-platform desktop framework
- **[React](https://reactjs.org/)** - Component-based UI library
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Heroicons](https://heroicons.com/)** - Beautiful SVG icons

### 👥 Contributors
Special thanks to all the amazing contributors who make DataFox possible!

<a href="https://github.com/yourusername/datafox/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yourusername/datafox" />
</a>

---

<div align="center">

**Made with ❤️ and ☕ by the DataFox Team**

[![GitHub stars](https://img.shields.io/github/stars/yourusername/datafox?style=social)](https://github.com/yourusername/datafox/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/yourusername/datafox?style=social)](https://github.com/yourusername/datafox/network/members)
[![Follow on GitHub](https://img.shields.io/github/followers/yourusername?style=social)](https://github.com/yourusername)

*Transform your file transfer experience with DataFox* 🦊

</div>
