import type { ManhwaChapter, BookChapter } from '../types';

// SVG generator for crisp vertical webtoon panels
function generateWebtoonSvg(
  title: string,
  bgColor1: string,
  bgColor2: string,
  accentColor: string,
  characterArt: string,
  sfxText?: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgColor1}" />
        <stop offset="100%" stop-color="${bgColor2}" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="15" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${accentColor}" stroke-width="0.5" stroke-opacity="0.15" />
      </pattern>
    </defs>

    <!-- Canvas Background -->
    <rect width="800" height="1200" fill="url(#bg)" />
    <rect width="800" height="1200" fill="url(#grid)" />

    <!-- Dynamic Art Accent Glows -->
    <circle cx="400" cy="500" r="280" fill="${accentColor}" fill-opacity="0.12" filter="url(#glow)" />
    <circle cx="200" cy="800" r="180" fill="${accentColor}" fill-opacity="0.08" filter="url(#glow)" />

    <!-- Stylized Panel Frame -->
    <rect x="40" y="40" width="720" height="1120" fill="none" stroke="${accentColor}" stroke-width="2" stroke-opacity="0.3" rx="16" />

    <!-- Chapter Panel Banner -->
    <rect x="60" y="60" width="680" height="40" fill="${accentColor}" fill-opacity="0.2" rx="8" />
    <text x="80" y="86" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="700" font-size="16" letter-spacing="2">
      ${title.toUpperCase()}
    </text>

    <!-- Character & Central Scene Illustration -->
    <g transform="translate(400, 580)">
      ${characterArt}
    </g>

    <!-- SFX Action Sound Effect text if present -->
    ${
      sfxText
        ? `<text x="400" y="320" fill="${accentColor}" font-family="Impact, sans-serif" font-size="90" font-weight="900" text-anchor="middle" font-style="italic" opacity="0.85" transform="rotate(-10 400 320)" filter="url(#glow)">
            ${sfxText}
          </text>`
        : ''
    }

    <!-- Panel Footer Watermark -->
    <text x="400" y="1135" fill="#ffffff" fill-opacity="0.3" font-family="sans-serif" font-size="12" text-anchor="middle">
      MANHWA SCREEN READER DEMO • SCROLL DOWN
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Character Art SVGs
const heroCultivator = `<g fill="none" stroke="#60a5fa" stroke-width="4">
  <!-- Glowing sword & aura -->
  <path d="M0 -220 L20 100 L0 140 L-20 100 Z" fill="#93c5fd" opacity="0.8" />
  <circle cx="0" cy="-60" r="70" stroke="#3b82f6" stroke-width="6" fill="#1e3a8a" fill-opacity="0.6" />
  <path d="M-50 100 Q0 30 50 100" stroke="#bfdbfe" stroke-width="5" />
  <circle cx="-20" cy="-70" r="8" fill="#60a5fa" />
  <circle cx="20" cy="-70" r="8" fill="#60a5fa" />
</g>`;

const dragonBeast = `<g fill="none" stroke="#f59e0b" stroke-width="5">
  <path d="M-120 -80 Q0 -200 120 -80 Q180 80 0 160 Q-180 80 -120 -80 Z" fill="#78350f" fill-opacity="0.7" />
  <circle cx="-40" cy="-30" r="14" fill="#fbbf24" />
  <circle cx="40" cy="-30" r="14" fill="#fbbf24" />
  <path d="M-60 40 Q0 100 60 40" stroke="#ef4444" stroke-width="8" />
</g>`;

const cyberpunkAssassin = `<g fill="none" stroke="#ec4899" stroke-width="4">
  <rect x="-60" y="-140" width="120" height="240" fill="#831843" rx="20" fill-opacity="0.8" />
  <line x1="-120" y1="-20" x2="120" y2="-20" stroke="#f43f5e" stroke-width="8" />
  <circle cx="0" cy="-80" r="30" fill="#06b6d4" />
</g>`;

export const SAMPLE_MANHWA_CHAPTERS: ManhwaChapter[] = [
  {
    id: 'manhwa-ch-12',
    seriesTitle: 'The Immortal Sovereign of the Celestial Gate',
    title: 'Chapter 12: The Dragon Gate Breakthrough',
    genre: 'Action Fantasy / Cultivation',
    coverImage: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
    panels: [
      {
        id: 'p1',
        title: 'Panel 1: Gate Entrance',
        imageUrl: generateWebtoonSvg(
          'Panel 1 • The Dragon Citadel',
          '#0f172a',
          '#1e1b4b',
          '#38bdf8',
          heroCultivator,
          'THUNDER!'
        ),
        bubbles: [
          {
            id: 'b1-1',
            box: { ymin: 10, xmin: 15, ymax: 22, xmax: 85 },
            type: 'narration',
            text: 'Deep within the mist-shrouded Dragon Citadel, the grand array seal begins to crack after three thousand years.',
            confidence: 0.98,
            speaker: 'Narrator',
          },
          {
            id: 'b1-2',
            box: { ymin: 30, xmin: 20, ymax: 42, xmax: 80 },
            type: 'speech_bubble',
            text: 'Halt! No outer disciple may enter the Ancient Forbidden Realm without the Sovereign Medallion!',
            confidence: 0.95,
            speaker: 'Guard Elder',
          },
        ],
      },
      {
        id: 'p2',
        title: 'Panel 2: Protagonist Challenge',
        imageUrl: generateWebtoonSvg(
          'Panel 2 • The Unflinching Stance',
          '#1e1b4b',
          '#311b92',
          '#818cf8',
          heroCultivator,
          'SWOOSH!'
        ),
        bubbles: [
          {
            id: 'b2-1',
            box: { ymin: 12, xmin: 15, ymax: 26, xmax: 85 },
            type: 'speech_bubble',
            text: 'Medallion? The sword in my hand is my sovereign seal. Step aside elder, or taste the Nine-Star Qi!',
            confidence: 0.96,
            speaker: 'Xiao Lin',
          },
          {
            id: 'b2-2',
            box: { ymin: 45, xmin: 22, ymax: 58, xmax: 78 },
            type: 'thought_bubble',
            text: 'His spiritual energy... it matches the ancient texts! Could he be the reborn Heavenly Emperor?!',
            confidence: 0.92,
            speaker: 'Guard Elder',
          },
        ],
      },
      {
        id: 'p3',
        title: 'Panel 3: Ancient Beast Awakening',
        imageUrl: generateWebtoonSvg(
          'Panel 3 • Awakening Beast',
          '#451a03',
          '#180802',
          '#f59e0b',
          dragonBeast,
          'ROAAAR!'
        ),
        isActionSequence: true,
        bubbles: [
          {
            id: 'b3-1',
            box: { ymin: 15, xmin: 10, ymax: 28, xmax: 90 },
            type: 'sfx',
            text: 'KRAAA-BOOOM!! THE GROUND TREMBLES UNDERNEATH!',
            confidence: 0.89,
            speaker: 'SFX',
          },
          {
            id: 'b3-2',
            box: { ymin: 65, xmin: 20, ymax: 78, xmax: 80 },
            type: 'speech_bubble',
            text: 'Ignorant mortal! You dare disturb my ten-thousand-year slumber?!',
            confidence: 0.97,
            speaker: 'Flame Dragon',
          },
        ],
      },
      {
        id: 'p4',
        title: 'Panel 4: Ultimate Sword Strike',
        imageUrl: generateWebtoonSvg(
          'Panel 4 • Sovereign Sword Slash',
          '#0f172a',
          '#0284c7',
          '#38bdf8',
          heroCultivator,
          'SLASH!!'
        ),
        isActionSequence: true,
        bubbles: [
          {
            id: 'b4-1',
            box: { ymin: 20, xmin: 15, ymax: 34, xmax: 85 },
            type: 'speech_bubble',
            text: 'First Form of the Celestial Lotus: Divine Realm Severance!',
            confidence: 0.99,
            speaker: 'Xiao Lin',
          },
        ],
      },
      {
        id: 'p5',
        title: 'Panel 5: Aftermath & Resolution',
        imageUrl: generateWebtoonSvg(
          'Panel 5 • The Realm Opens',
          '#064e3b',
          '#022c22',
          '#34d399',
          heroCultivator
        ),
        bubbles: [
          {
            id: 'b5-1',
            box: { ymin: 14, xmin: 18, ymax: 28, xmax: 82 },
            type: 'speech_bubble',
            text: 'The gate... is finally open. My mother\'s lineage pill awaits inside.',
            confidence: 0.96,
            speaker: 'Xiao Lin',
          },
          {
            id: 'b5-2',
            box: { ymin: 50, xmin: 15, ymax: 62, xmax: 85 },
            type: 'narration',
            text: 'To be continued in Chapter 13: Secrets of the Phoenix Medicine Garden...',
            confidence: 0.99,
            speaker: 'Narrator',
          },
        ],
      },
    ],
  },
  {
    id: 'manhwa-cyberpunk',
    seriesTitle: 'Neon Phantom: 2099',
    title: 'Chapter 01: Glitch in the Neural Net',
    genre: 'Cyberpunk / Sci-Fi / Action',
    coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
    panels: [
      {
        id: 'cp1',
        title: 'Panel 1: Sector 9 Alleyway',
        imageUrl: generateWebtoonSvg(
          'Panel 1 • Sector 9',
          '#4c1d95',
          '#0f172a',
          '#ec4899',
          cyberpunkAssassin,
          'BZZZT!'
        ),
        bubbles: [
          {
            id: 'cpb1-1',
            box: { ymin: 15, xmin: 12, ymax: 28, xmax: 88 },
            type: 'speech_bubble',
            text: 'Dispatch, I have eyes on the rogue AI construct. It loaded into a synthetic host frame.',
            confidence: 0.97,
            speaker: 'Agent V',
          },
        ],
      },
      {
        id: 'cp2',
        title: 'Panel 2: Neural Hack Attempt',
        imageUrl: generateWebtoonSvg(
          'Panel 2 • Neural Override',
          '#831843',
          '#1e1b4b',
          '#06b6d4',
          cyberpunkAssassin,
          'ACCESS GRANTED'
        ),
        bubbles: [
          {
            id: 'cpb2-1',
            box: { ymin: 18, xmin: 15, ymax: 32, xmax: 85 },
            type: 'thought_bubble',
            text: 'Initiating deep neural override. If their firewall breaches 90%, my mind wipes completely.',
            confidence: 0.94,
            speaker: 'Agent V',
          },
        ],
      },
    ],
  },
];

export const SAMPLE_BOOK_CHAPTERS: BookChapter[] = [
  {
    id: 'book-ch-1',
    bookTitle: 'The Astral Citadel',
    author: 'Eleni Vance',
    genre: 'Epic High Fantasy',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80',
    pages: [
      {
        pageNumber: 1,
        chapterTitle: 'Chapter I: The Whispering Towers',
        paragraphs: [
          'The wind across the Obsidian Crags carried the sharp scent of ozone and crushed pine needles. High above the valley, the spires of the Astral Citadel gleamed under the pale light of the twin moons, silver and indigo.',
          'Kaelen pulled his heavy wool cloak tighter around his shoulders as he leaned over the parapet. In his right hand, he held the brass astrolabe handed down through seven generations of stargazers. Its gears hummed with a faint, rhythmic resonance, pulsing in step with his own heartbeat.',
          '"You should be inside before the frost settling," said a low voice behind him.',
          'Kaelen did not turn around. He recognized the steady cadence of Master Thorne’s footsteps before the old archivist even cleared the stairs. "The alignment is happening tonight, Master. The northern star has already shifted three degrees off its winter axis."',
          'Thorne paused, resting both hands on his carved ash wood staff. "Then the prophecies were not merely poetry. The seal is weakening."',
        ],
      },
      {
        pageNumber: 2,
        chapterTitle: 'Chapter I: The Whispering Towers',
        paragraphs: [
          'For centuries, the Citadel had stood as a silent sentinel over the mortal kingdoms. Built upon the bones of an ancient star-fall, its stones absorbed the residual magic of the cosmos.',
          '"If the seal fails," Kaelen murmured, looking down into the abyssal valley, "the shadows below will no longer be bound by dawn."',
          'Thorne nodded slowly, his eyes reflecting the luminescent azure of the astrolabe. "Which is why you must descend into the lower vaults tonight. The Codex of First Light must be recovered before the council convenes at sunrise."',
          '"The lower vaults?" Kaelen swallowed hard. "No scholar has trodden those corridors since the Purge of the Eclipse."',
          '"Then you shall be the first in three hundred years," Thorne said, placing a heavy key forged of star-iron into Kaelen’s trembling palm.',
        ],
      },
    ],
  },
  {
    id: 'book-ch-2',
    bookTitle: 'The Cybernetic Horizon',
    author: 'Kaito Tanaka',
    genre: 'Sci-Fi / Cyberpunk Novel',
    coverImage: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&q=80',
    pages: [
      {
        pageNumber: 1,
        chapterTitle: 'Chapter 01: Neon Memory',
        paragraphs: [
          'The raindrops hit the obsidian glass of Apartment 404 with a rhythmic click-clack that sounded like ancient code compiling.',
          'Ren rubbed his temple where the neural interface port sat flush against his skin. The blue LED indicator flickered three times—a warning signal from his memory cache.',
          '"System update required," a smooth synthetic voice echoed inside his auditory cortex.',
          '"Suppress update," Ren muttered aloud to the empty room. He couldn\'t afford a reboot now. Not when the data fragment from Sector 7 was still deciphering.',
        ],
      },
    ],
  },
];
