"use client";

import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { SocketProvider } from "@/providers/SocketProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <title>Threadr - Random Video Chat with Strangers</title>
        <meta name="description" content="Connect with random strangers worldwide through video chat on Threadr" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
