import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AppThemeProvider from "./theme-provider";

export const metadata: Metadata = {
  title: "GeeLark Automation Dashboard",
  description: "Manage scraping, assets, templates, and posting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body>
        <AppThemeProvider>
          <Navbar />
          {children}
        </AppThemeProvider>
      </body>
    </html>
  );
}
