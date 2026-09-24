'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useLang from '@/lib/useLang';
import { stringsFor } from '@/lib/i18n';

export const OOW_TABS = [
  { href: '/metronome', key: 'metronomeTab' },
];

export default function OutOfWorkTabs() {
  const pathname = usePathname();
  const t = stringsFor(useLang()).metronome;

  return (
    <div className="tab-bar-wrap">
      <nav className="tab-bar" aria-label={t.tabsLabel}>
        {OOW_TABS.map((tab) => {
          const active = (pathname || '').replace(/\/$/, '') === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              {t[tab.key]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
