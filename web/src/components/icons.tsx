import { SVGProps } from 'react';

// Lightweight inline icon set (stroke-based, inherits currentColor).
type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const Icon = {
  dashboard: (p: P) => (<svg {...base(p)}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>),
  keyword: (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>),
  hashtag: (p: P) => (<svg {...base(p)}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>),
  content: (p: P) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/></svg>),
  trending: (p: P) => (<svg {...base(p)}><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>),
  competitors: (p: P) => (<svg {...base(p)}><path d="M16 4h2a2 2 0 0 1 2 2v14l-4-3-4 3-4-3-4 3V6a2 2 0 0 1 2-2h2"/><path d="M9 4h6"/></svg>),
  reports: (p: P) => (<svg {...base(p)}><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M8 13h8M8 17h5"/></svg>),
  history: (p: P) => (<svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/></svg>),
  collections: (p: P) => (<svg {...base(p)}><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>),
  alerts: (p: P) => (<svg {...base(p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>),
  settings: (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.6 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1z"/></svg>),
  users: (p: P) => (<svg {...base(p)}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M21 20a5.5 5.5 0 0 0-4-5.3"/></svg>),
  bell: (p: P) => (<svg {...base(p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>),
  search: (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>),
  sun: (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>),
  moon: (p: P) => (<svg {...base(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8"/></svg>),
  logout: (p: P) => (<svg {...base(p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>),
  menu: (p: P) => (<svg {...base(p)}><path d="M3 6h18M3 12h18M3 18h18"/></svg>),
  heart: (p: P) => (<svg {...base(p)}><path d="M12 21s-7-4.6-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.4-9.5 9-9.5 9z"/></svg>),
  comment: (p: P) => (<svg {...base(p)}><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12z"/></svg>),
  share: (p: P) => (<svg {...base(p)}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>),
  external: (p: P) => (<svg {...base(p)}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>),
  plus: (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14"/></svg>),
  trash: (p: P) => (<svg {...base(p)}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>),
  check: (p: P) => (<svg {...base(p)}><path d="M20 6 9 17l-5-5"/></svg>),
  download: (p: P) => (<svg {...base(p)}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>),
  help: (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/></svg>),
  profile: (p: P) => (<svg {...base(p)}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>),
  spark: (p: P) => (<svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>),
  database: (p: P) => (<svg {...base(p)}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>),
};
