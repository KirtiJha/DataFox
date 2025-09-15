import "../styles/globals.css";
import { Toaster } from "react-hot-toast";
import { useEffect } from "react";

export default function App({ Component, pageProps }) {
  // Initialize parquet-wasm on app start
  useEffect(() => {
    const initializeParquet = async () => {
      try {
        // Try to load parquet-wasm dynamically
        if (typeof window !== "undefined") {
          const parquetWasm = await import("parquet-wasm");
          window.parquet = parquetWasm;
          console.log("✅ parquet-wasm loaded successfully");
        }
      } catch (error) {
        console.warn("⚠️ parquet-wasm not available:", error);
        // This is okay - we have fallbacks
      }
    };

    initializeParquet();
  }, []);

  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#1f2937",
            color: "#f3f4f6",
          },
          success: {
            iconTheme: {
              primary: "#10b981",
              secondary: "#f3f4f6",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "#f3f4f6",
            },
          },
        }}
      />
    </>
  );
}
