'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-theme');
    setTheme(stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      return;
    } finally {
      setTheme(next);
    }
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label="Toggle dark mode" aria-pressed={theme === 'dark'}>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
