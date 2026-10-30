import type { Metadata } from "next";
import site from "../../content/site.json";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
  robots: { index: false, follow: false },
};

const themeScript = `try{var t=localStorage.getItem("readaholic:theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
