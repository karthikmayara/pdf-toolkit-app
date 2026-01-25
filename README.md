
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

*   **📦 Compress PDF:** Smart reduction of file size while maintaining readability.
*   **📑 Merge PDFs:** Combine multiple documents into a single file with drag-and-drop reordering.
*   **✂️ Split PDF:** Extract specific pages or remove unwanted ones.
*   **🔄 Convert:** Turn PDFs into Images (JPG, PNG, WebP) or create PDFs from images.
*   **✍️ Sign:** Draw, type, or upload signatures and place them securely on documents.
*   **🔍 OCR (Image to Text):** Extract text from scanned images using AI (Tesseract.js).
*   **🛡️ Watermark:** Add custom text stamps to protect your documents.
*   **📉 Image Optimizer:** Compress images (JPG, PNG, AVIF) locally.
*   **🔢 Page Numbers:** Add customizable pagination to existing PDFs.
*   **↻ Rotate:** Fix orientation issues for specific pages or the entire document.

## 🌐 Does it need Internet?

**No.** (Mostly)

*   **First Run:** You need internet to load the application for the first time.
*   **Subsequent Runs:** The app installs itself as a **Service Worker**. You can open it, use every tool, and save files completely offline, even in "Airplane Mode".
*   *Note:* The OCR tool may need to download language data packs once upon first use.

## 🚀 How to Use

### For Users
1.  Open the website in Chrome, Edge, or Safari.
2.  Click the **"Install App"** button in the header (or via the browser menu).
3.  Launch it like a native app from your desktop or home screen.

### For Developers (Running Locally)

This project is built with **React**, **Vite**, and **TypeScript**.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/pdf-toolkit-pro.git
    cd pdf-toolkit-pro
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run Development Server**
    ```bash
    npm run dev
    ```

4.  **Build for Production**
    ```bash
    npm run build
    ```

## 🛠️ Tech Stack

*   **Frontend:** React 18
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS
*   **PDF Engine:** `pdf-lib` & `pdf.js`
*   **OCR Engine:** `tesseract.js`
*   **Compression:** `jszip`

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
