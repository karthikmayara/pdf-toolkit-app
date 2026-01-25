
# 🛠️ PDF Toolkit Pro

**Professional, Privacy-First PDF Manipulation Suite.**

> *Process documents directly in your browser. No uploads, no waiting, 100% private.*

## 📖 What is this?

**PDF Toolkit Pro** is a Progressive Web Application (PWA) that provides a comprehensive set of tools to manage and modify PDF documents. Unlike mostly online PDF editors, this application runs entirely on the **client-side** (in your browser). 

It uses powerful WebAssembly and JavaScript libraries to manipulate files locally on your device's processor, ensuring your data never leaves your computer.

## 🎯 Why we created it?

We built this toolkit to solve three major problems with existing online PDF tools:

1.  **Privacy & Security:** Most free tools require you to upload your sensitive contracts, bank statements, or ID documents to a remote server. We believe your data should stay yours.
2.  **Reliability:** You shouldn't need a fast internet connection just to rotate a page or merge two small files.
3.  **Speed:** Waiting for uploads and downloads is unnecessary. Local processing is instant.

## ✨ Features

*   **📦 Compress PDF:** Smart reduction of file size with visual quality check.
*   **📑 Merge PDFs:** Combine multiple documents into a single file with drag-and-drop reordering.
*   **✂️ Split PDF:** Extract specific pages or remove unwanted ones.
*   **🔄 Convert:** Turn PDFs into Images (JPG, PNG, WebP) or create PDFs from images.
*   **✍️ Sign PDF:** Professional signing desk with multi-signature support, date stamping, and ink simulation.
*   **🔍 OCR (Image to Text):** Extract text from scanned images using AI (Tesseract.js).
*   **🛡️ Watermark:** Add custom text stamps/overlays to protect your documents.
*   **📉 Image Optimizer:** Compress images (JPG, PNG, AVIF) locally with side-by-side comparison.
*   **🔢 Page Numbers:** Add customizable pagination to existing PDFs.
*   **↻ Rotate:** Fix orientation issues for specific pages or the entire document.

## 🔒 Privacy Promise

*   **Zero Knowledge:** We do not track what you upload. We do not see your files.
*   **Local Processing:** All "uploads" are actually just loading the file into your browser's memory.
*   **Offline First:** Once loaded, you can disconnect the internet and the app works perfectly.

## 🌐 Browser Support

| Browser | Status | Notes |
| :--- | :--- | :--- |
| **Chrome / Edge** | ✅ Excellent | Recommended for fastest performance (V8 engine). |
| **Firefox** | ✅ Good | Works well. |
| **Safari (macOS/iOS)** | ⚠️ Good | Large files (>50MB) may crash due to stricter memory limits on iOS. |

## 🚀 How to Use

### For Users
1.  Open the website in Chrome, Edge, or Safari.
2.  Click the **"Install App"** button in the header (or via the browser menu).
3.  Launch it like a native app from your desktop or home screen.

### Troubleshooting
*   **"PDF Library loading..." forever:** Refresh the page. This usually happens if the CDN connection was interrupted during initial load.
*   **App Crash on Large File:** If compressing a 100MB+ file on a mobile device, the browser may run out of memory. Try splitting the PDF into smaller chunks first using the Split tool.
*   **Update Notification stuck:** Hard refresh (Ctrl+F5 or Cmd+Shift+R) to clear the Service Worker cache.

## 🛠️ Tech Stack

*   **Frontend:** React 18
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS
*   **PDF Engine:** `pdf-lib` & `pdf.js`
*   **OCR Engine:** `tesseract.js`
*   **Compression:** `jszip`

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
