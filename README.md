
<div align="center">
  <img src="./public/icon.svg" alt="PDF Toolkit Pro Logo" width="120" height="120">
  
  # PDF Toolkit Pro
  
  **The Privacy-First, Offline-Capable PDF Manipulation Suite.**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Tech: React 18](https://img.shields.io/badge/Tech-React_18-61DAFB.svg)](https://reactjs.org/)
  [![Style: Tailwind](https://img.shields.io/badge/Style-Tailwind_CSS-38B2AC.svg)](https://tailwindcss.com/)
  [![PWA: Ready](https://img.shields.io/badge/PWA-Offline_Ready-success.svg)]()

  <p align="center">
    <a href="#-why-this-exists">Why?</a> •
    <a href="#-features">Features</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-getting-started">Getting Started</a>
  </p>
</div>

---

## 🔒 Why this exists?

Most "free" online PDF tools operate on a simple business model: **You are the product.** You upload your sensitive bank statements, contracts, and IDs to a remote server, process them, and hope they delete the files (spoiler: they often don't).

**PDF Toolkit Pro is different.** 

It leverages modern browser capabilities (**WebAssembly**, **Service Workers**, and **Canvas API**) to process files entirely on your device.
*   **Zero Uploads:** Your files never leave your computer.
*   **Zero Wait:** No upload/download bars. Processing is instant.
*   **100% Offline:** Install it as a PWA and use it on an airplane.

---

## ✨ Features

This isn't just a wrapper around a library. It's a full-featured suite with a premium "Lumina" UI.

| Tool | Description | Tech Highlight |
| :--- | :--- | :--- |
| **📦 Compress** | Intelligent file size reduction with visual quality checks. | Custom canvas re-rendering pipeline. |
| **📑 Merge** | Combine unlimited PDFs with drag-and-drop reordering. | `pdf-lib` structural merging. |
| **🔍 OCR** | Extract text from scanned images/PDFs. | `Tesseract.js` (WASM) running locally. |
| **🔄 Convert** | Convert PDF pages to JPG/PNG/WebP/AVIF or Image to PDF. | High-performance bitmap rendering. |
| **✍️ Digital Ink** | Sign documents with saved signatures or freehand drawing. | Coordinate mapping & vector placement. |
| **🛡️ Watermark** | Stamp documents with text, customizable opacity & tiling. | Canvas overlay compositing. |
| **✂️ Smart Split** | Extract specific pages or delete unwanted ranges. | Efficient byte-range extraction. |
| **📉 Image Optimizer** | Compress JPG/PNG/WebP images for the web. | Browser-native encoding API. |
| **🔢 Pagination** | Add customizable page numbers to existing docs. | Dynamic font embedding. |

---

## 🛠 Tech Stack

Built for performance and maintainability.

*   **Core:** React 18, TypeScript, Vite
*   **Styling:** Tailwind CSS (Custom "Lumina" Design System)
*   **PDF Engine:** `pdf-lib` (Structure), `pdf.js` (Rendering)
*   **OCR Engine:** `tesseract.js` (v5 WASM)
*   **Compression:** `fflate` (High-speed ZIP creation)
*   **PWA:** Service Workers for offline caching and installation.


## 🌐 Browser Support

The app relies on modern web APIs (OffscreenCanvas, createImageBitmap, WASM).

| Browser | Status |
| :--- | :--- |
| **Chrome / Edge** | 🟢 **Perfect** (Recommended) |
| **Firefox** | 🟢 **Great** |
| **Safari** | 🟡 **Good** (Large OCR tasks may be slower) |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <sub>Built with ❤️ for privacy enthusiasts everywhere.</sub>
</div>
