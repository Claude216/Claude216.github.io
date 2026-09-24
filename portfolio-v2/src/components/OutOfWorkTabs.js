'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const OOW_TABS = [
  { href: '/metronome', label: 'Metronome' },
];

export default function OutOfWorkTabs() {
  const pathname = usePathname();

  return (
    <div className="tab-bar-wrap">
      <nav className="tab-bar" aria-label="Out Of Work pages">
        {OOW_TABS.map((tab) => {
          const active = (pathname || '').replace(/\/$/, '') === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
