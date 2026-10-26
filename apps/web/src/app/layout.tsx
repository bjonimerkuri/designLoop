import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'DesignLoop',
  description: 'An agent that turns a design into a React component and checks its own work.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t)}}catch(e){}"
          }}
        />
      </head>
      <body>
        <header className="masthead">
          <Link href="/" className="wordmark">
            DesignLoop
          </Link>
          <p>Design in, component out, checked until it matches.</p>
          <nav className="nav" aria-label="Main">
            <Link href="/">Runs</Link>
            <Link href="/evals">Evals</Link>
            <Link href="/demo">Saved runs</Link>
            <Link href="/status">Status</Link>
          </nav>
          <ThemeToggle />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
