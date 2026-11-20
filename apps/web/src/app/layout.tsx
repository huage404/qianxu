import type { Metadata, Viewport } from 'next';

import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qianxu',
  description: '搜索与书签起始页',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#16171a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 浏览器插件会往 <html> 注入 data-* 属性（如 data-yd-*），导致属性级 hydration 不一致
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
