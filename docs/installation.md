> [!WARNING]
> This userscript is provided "as is" without any warranties, guarantees, or assurances of reliability or compatibility. By using WebTweak, you acknowledge that you do so at your own risk, and the developers are not liable for any issues, data loss, or other consequences that may arise from its use.


# Installation Guide

This project is available in **two variants**:  
1. **Userscript** 
2. **Browser Extension**

> [!NOTE]
> The userscript is the simplest way to use this project. It runs inside your browser via a userscript manager.
---

## 🔹 Option 1: Installing the Userscript

### 1. Install a Userscript Manager
Depending on your browser, install one of these:

- **Chrome / Edge / Brave** → [Tampermonkey](https://www.tampermonkey.net/)  
- **Firefox** → [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/) or [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)  
- **Safari** → [Tampermonkey for Safari](https://apps.apple.com/app/tampermonkey/id1482490089)  

### 2. Install the Userscript
- Open the userscript file: [`ChatTweak.user.js`](https://github.com/appelmoesgg/ChatTweak/releases/latest/download/ChatTweak.user.js)  
- Your userscript manager will detect it and prompt you to **install**.  
- Click install and you’re done!

### 3. Updating the Userscript
- Automatic updates are not yet implemented. Please check GitHub occasionally for new releases. Update logic is currently being developed.

### 4. Permission to Execute Userscripts (Chrome/Edge)
For users of the **Tampermonkey extension (v5.3+)** in a **Chrome-based browser**, you must explicitly allow userscripts to run.  

Either the `Allow User Scripts` toggle or `Developer Mode` must be enabled.

Without this step, Tampermonkey cannot execute userscripts, and ChatTweak will not load.

To enable it, follow [this](https://www.tampermonkey.net/faq.php#Q209) guide.
 
---

## 🔹 Option 2: Installing the Browser Extension


### 1. Download the Extension
> [!IMPORTANT]
> For Firefox, use the Firefox release, for all other browsers, the Chrome release should work.
- Go to the [Releases page](https://github.com/mixtapejaxson/releases) and download the latest `.zip` file for your browser.  
- Extract it somewhere on your computer.  

### 2. Load the Extension in Your Browser
#### Chrome / Edge / Brave / Opera:
1. Open `chrome://extensions/`  
2. Enable **Developer mode** (top-right toggle).  
3. Click **Load unpacked**.  
4. Select the extracted folder.  

#### Firefox:
1. Open `about:debugging#/runtime/this-firefox`  
2. Click **Load Temporary Add-on**.  
3. Select the `manifest.json` inside the extracted folder.  

### 3. Updating the Extension
- To update, remove the old version folder and repeat the steps above with the new release.  
