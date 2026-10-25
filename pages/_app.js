import "../styles/globals.css";
import { Toaster } from "react-hot-toast";

export default function App({ Component, pageProps }) {
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
