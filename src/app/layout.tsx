import type { Metadata } from "next";
import site from "../../content/site.json";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";
import { fontFaceCss } from "@/lib/fontFaces";
import "./globals.css";

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
  robots: { index: false, follow: false },
};

const themeScript = `try{var t=localStorage.getItem("readaholic:theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

const fontFaces = fontFaceCss(process.env.NEXT_PUBLIC_BASE_PATH || "");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Phông chỉ được tải khi người đọc chọn dùng */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,700;1,7..72,400&family=Roboto+Slab:wght@400;700&display=swap"
        />
        {fontFaces && <style dangerouslySetInnerHTML={{ __html: fontFaces }} />}
      </head>
      <body>
        <AuthProvider>
          <Header title={site.title} />
          <main className="container">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
