import { Icon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Icon;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Analyze',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { href: '/keywords', label: 'Keyword Explorer', icon: 'keyword' },
      { href: '/hashtags', label: 'Hashtag Explorer', icon: 'hashtag' },
      { href: '/discovery', label: 'Content Discovery', icon: 'content' },
      { href: '/trending', label: 'Trending', icon: 'trending' },
      { href: '/competitors', label: 'Competitors', icon: 'competitors' },
    ],
  },
  {
    section: 'Organize',
    items: [
      { href: '/reports', label: 'Reports', icon: 'reports' },
      { href: '/history', label: 'History', icon: 'history' },
      { href: '/collections', label: 'Collections', icon: 'collections' },
      { href: '/alerts', label: 'Alerts', icon: 'alerts' },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/users', label: 'Users', icon: 'users' },
      { href: '/profile', label: 'Profile', icon: 'profile' },
      { href: '/help', label: 'Help', icon: 'help' },
    ],
  },
];
