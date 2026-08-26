// Catalog of every reference page. Drives the index, nav, and (later) the
// placeholder routes. Header nav shows only status 'built'; the home index
// shows built pages as cards and planned ones dimmed, so the roadmap is
// visible without a wiki of dead links.

export type TabStatus = 'built' | 'placeholder' | 'skipped';

export interface Tab {
  slug: string;
  label: string;
  icon: string;            // emoji for nav/index chips (game art comes later)
  section: string;
  status: TabStatus;
  summary: string;
  willContain?: string[];
}

export const TABS: Tab[] = [
  // ── Economy ───────────────────────────────────────────────────────
  {
    slug: 'goods', icon: '📦', label: 'Goods', section: 'Economy',
    status: 'built',
    summary: 'Every good — base price, category, who makes it, who wants it',
  },
  {
    slug: 'buildings', icon: '🏭', label: 'Buildings', section: 'Economy',
    status: 'built',
    summary: 'All buildings with their production methods, inputs, outputs, and jobs',
    willContain: [
      'Building × production-method matrix with per-level goods and employment',
      'Construction cost, unlock tech, building group rules',
    ],
  },
  {
    slug: 'production-methods', icon: '⚙️', label: 'Production Methods', section: 'Economy',
    status: 'built',
    summary: 'Compare PM options per building: net goods, jobs, base-price profit',
  },
  {
    slug: 'pop-types', icon: '👷', label: 'Pop Types', section: 'Economy',
    status: 'built',
    summary: 'Wages, qualifications, dependents, political strength per profession',
  },
  {
    slug: 'pop-needs', icon: '🛒', label: 'Pop Needs', section: 'Economy',
    status: 'built',
    summary: 'Buy packages and needs — which goods compete to satisfy each',
  },
  {
    slug: 'companies', icon: '🏢', label: 'Companies', section: 'Economy',
    status: 'placeholder',
    summary: 'Company types, formation requirements, prosperity bonuses, charters',
  },

  // ── Politics ──────────────────────────────────────────────────────
  {
    slug: 'laws', icon: '⚖️', label: 'Laws', section: 'Politics',
    status: 'placeholder',
    summary: 'All law groups — effects, requirements, interest-group stances',
  },
  {
    slug: 'interest-groups', icon: '🗳️', label: 'Interest Groups', section: 'Politics',
    status: 'placeholder',
    summary: 'The eight IGs — traits, ideologies, pop attraction',
  },
  {
    slug: 'ideologies', icon: '💭', label: 'Ideologies', section: 'Politics',
    status: 'placeholder',
    summary: 'Leader and IG ideologies × law-stance matrix',
  },
  {
    slug: 'institutions', icon: '🏛️', label: 'Institutions', section: 'Politics',
    status: 'placeholder',
    summary: 'Institution levels, effects, and the laws that gate them',
  },
  {
    slug: 'decrees', icon: '📜', label: 'Decrees', section: 'Politics',
    status: 'placeholder',
    summary: 'State decrees — costs, effects, requirements',
  },
  {
    slug: 'character-traits', icon: '🎭', label: 'Character Traits', section: 'Politics',
    status: 'placeholder',
    summary: 'Commander, politician, and agitator traits with effects',
  },

  // ── Technology ────────────────────────────────────────────────────
  {
    slug: 'technology', icon: '🔬', label: 'Technology', section: 'Technology',
    status: 'placeholder',
    summary: 'Production, military, and society trees — prereqs and everything each tech unlocks',
  },

  // ── Military ──────────────────────────────────────────────────────
  {
    slug: 'units', icon: '🎖️', label: 'Units', section: 'Military',
    status: 'placeholder',
    summary: 'Combat unit types — stats, goods upkeep, unlock techs',
  },
  {
    slug: 'mobilization', icon: '🎒', label: 'Mobilization', section: 'Military',
    status: 'placeholder',
    summary: 'Mobilization options and what they cost and add',
  },
  {
    slug: 'ships', icon: '🚢', label: 'Ships', section: 'Military',
    status: 'placeholder',
    summary: 'Ship types and modifications',
  },

  // ── Diplomacy ─────────────────────────────────────────────────────
  {
    slug: 'diplomatic-plays', icon: '🎲', label: 'Diplomatic Plays', section: 'Diplomacy',
    status: 'placeholder',
    summary: 'Plays and war goals — maneuver costs, infamy, escalation',
  },
  {
    slug: 'treaties', icon: '🤝', label: 'Treaties', section: 'Diplomacy',
    status: 'placeholder',
    summary: 'Every treaty article — requirements, effects, wargoal potential',
  },
  {
    slug: 'subjects', icon: '👑', label: 'Subjects', section: 'Diplomacy',
    status: 'placeholder',
    summary: 'Subject types and the liberty-desire machinery',
  },
  {
    slug: 'power-blocs', icon: '🌐', label: 'Power Blocs', section: 'Diplomacy',
    status: 'placeholder',
    summary: 'Identities and principles with per-tier effects',
  },

  // ── World ─────────────────────────────────────────────────────────
  {
    slug: 'countries', icon: '🗺️', label: 'Countries', section: 'World',
    status: 'placeholder',
    summary: 'Every 1836 country — tier, capital, cultures, starting setup',
  },
  {
    slug: 'states', icon: '⛰️', label: 'States', section: 'World',
    status: 'placeholder',
    summary: 'State regions — arable land, resources, traits, homelands',
  },
  {
    slug: 'cultures', icon: '🌍', label: 'Cultures & Religions', section: 'World',
    status: 'placeholder',
    summary: 'Culture and religion catalog with traits and obsessions',
  },

  // ── Journal & Events ──────────────────────────────────────────────
  {
    slug: 'journal-entries', icon: '📖', label: 'Journal Entries', section: 'Journal & Events',
    status: 'placeholder',
    summary: 'Journal entries — goals, timers, rewards',
  },
  {
    slug: 'decisions', icon: '❗', label: 'Decisions', section: 'Journal & Events',
    status: 'placeholder',
    summary: 'All decisions with requirements and effects',
  },
  {
    slug: 'events', icon: '✉️', label: 'Events', section: 'Journal & Events',
    status: 'placeholder',
    summary: 'Event browser — triggers, options, outcomes',
  },

  // ── Concepts ──────────────────────────────────────────────────────
  {
    slug: 'concepts', icon: '💡', label: 'Concepts', section: 'Concepts',
    status: 'placeholder',
    summary: 'The in-game encyclopedia, auto-linked',
  },
  {
    slug: 'defines', icon: '🔢', label: 'Defines', section: 'Concepts',
    status: 'placeholder',
    summary: 'The constants under the hood, curated',
  },

  // ── Tools ─────────────────────────────────────────────────────────
  {
    slug: 'profit-calculator', icon: '🧮', label: 'Profit Calculator', section: 'Tools',
    status: 'placeholder',
    summary: 'Pick a building and PMs, set prices, see throughput and profit',
  },
  {
    slug: 'patch-notes', icon: '🛠', label: 'Patch Notes', section: 'Tools',
    status: 'placeholder',
    summary: 'What each patch changed in the data we track',
  },
];

export const SECTIONS = [
  'Economy',
  'Politics',
  'Technology',
  'Military',
  'Diplomacy',
  'World',
  'Journal & Events',
  'Concepts',
  'Tools',
] as const;
