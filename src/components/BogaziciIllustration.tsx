import React from 'react';

/**
 * Subtle, non-distracting artistic line-art illustration of Boğaziçi University South Campus (Güney Kampüs):
 * Albert Long Hall clock tower, Hamlin Hall silhouettes, cypress trees on the Bebek ridge,
 * Rumeli Hisarı towers, and gentle Bosphorus waves with gliding seagulls.
 */
export const BogaziciIllustration: React.FC = () => {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none opacity-40"
      aria-hidden="true"
    >
      {/* Soft atmospheric sun/moon glow over the Bosphorus */}
      <div className="absolute right-[14%] top-[12%] h-64 w-64 rounded-full bg-amber-200/30 blur-3xl animate-float-slow" />
      <div className="absolute left-[10%] bottom-[15%] h-72 w-72 rounded-full bg-sky-200/25 blur-3xl" />

      <svg
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full object-cover"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Distant Anatolian hills across the Bosphorus */}
        <path
          d="M0 690 Q 320 630, 680 675 T 1440 650 L 1440 900 L 0 900 Z"
          fill="#e9e3d5"
          fillOpacity="0.45"
        />

        {/* Gliding Seagulls (Martılar) */}
        <g className="animate-gull-glide" stroke="#5b6b79" strokeWidth="1.2" strokeLinecap="round" opacity="0.55">
          <path d="M980 240 Q 990 232, 1000 240 Q 1010 232, 1020 240" />
          <path d="M1035 220 Q 1042 214, 1050 220 Q 1058 214, 1065 220" />
          <path d="M940 265 Q 946 260, 952 265 Q 958 260, 964 265" />
        </g>

        {/* Left Ridge: Güney Kampüs Manzara & Albert Long Hall / Theodorus Hall Silhouettes */}
        <g stroke="#4a5a67" strokeWidth="1.2" opacity="0.42">
          {/* Hill slope from Ortaköy / Bebek */}
          <path
            d="M0 640 C 180 615, 360 635, 580 685 L 580 820 L 0 820 Z"
            fill="#dfd8c8"
            fillOpacity="0.35"
            stroke="none"
          />
          <path d="M0 640 C 180 615, 360 635, 580 685" />

          {/* Albert Long Hall (Saatli Bina) iconic facade */}
          <g transform="translate(110, 485)">
            {/* Main body */}
            <rect x="0" y="55" width="130" height="85" fill="#f7f4ee" fillOpacity="0.6" />
            {/* Central clock tower */}
            <rect x="47" y="15" width="36" height="125" fill="#f7f4ee" fillOpacity="0.8" />
            {/* Pitched roof of tower */}
            <polygon points="44,15 65,-8 86,15" fill="#e5dec9" />
            {/* Clock face */}
            <circle cx="65" cy="34" r="7.5" />
            <path d="M65 34 L65 29 M65 34 L69 34" />
            {/* Arched collegiate windows */}
            <path d="M14 82 V68 A6 6 0 0 1 26 68 V82 Z" />
            <path d="M32 82 V68 A6 6 0 0 1 44 68 V82 Z" />
            <path d="M86 82 V68 A6 6 0 0 1 98 68 V82 Z" />
            <path d="M104 82 V68 A6 6 0 0 1 116 68 V82 Z" />
            {/* Entrance steps */}
            <line x1="52" y1="140" x2="78" y2="140" />
            <line x1="55" y1="136" x2="75" y2="136" />
          </g>

          {/* Hamlin Hall (1. Erkek Yurdu) silhouette on the cliff */}
          <g transform="translate(290, 515)">
            <rect x="0" y="35" width="110" height="90" fill="#f7f4ee" fillOpacity="0.55" />
            <polygon points="-4,35 20,12 45,35" fill="#e5dec9" />
            <polygon points="65,35 90,12 114,35" fill="#e5dec9" />
            <rect x="14" y="50" width="10" height="16" />
            <rect x="34" y="50" width="10" height="16" />
            <rect x="66" y="50" width="10" height="16" />
            <rect x="86" y="50" width="10" height="16" />
            <rect x="14" y="76" width="10" height="16" />
            <rect x="34" y="76" width="10" height="16" />
            <rect x="66" y="76" width="10" height="16" />
            <rect x="86" y="76" width="10" height="16" />
          </g>

          {/* Cypress & Stone Pine trees along the Manzara stone wall */}
          <path d="M75 630 C70 595, 75 565, 80 545 C85 565, 90 595, 85 630 Z" fill="#cfd6c8" fillOpacity="0.5" />
          <path d="M260 635 C255 605, 260 580, 264 565 C268 580, 273 605, 268 635 Z" fill="#cfd6c8" fillOpacity="0.5" />
          <path d="M430 655 C426 625, 430 600, 434 585 C438 600, 442 625, 438 655 Z" fill="#cfd6c8" fillOpacity="0.5" />

          {/* Iconic Güney Manzara low stone wall (Taş Duvar) */}
          <path d="M30 648 L 520 678" strokeWidth="2" />
          <path d="M30 654 L 520 684" strokeWidth="1" strokeDasharray="8 6" />
        </g>

        {/* Right Ridge: Rumeli Hisarı Towers & Bosphorus Bridge in distance */}
        <g stroke="#4a5a67" strokeWidth="1.1" opacity="0.32">
          {/* Distant Bosphorus Suspension Bridge */}
          <path d="M780 670 L 780 575 M 1180 665 L 1180 575" strokeWidth="1.4" />
          <path d="M690 655 Q 780 580, 780 575 Q 980 655, 1180 575 Q 1180 580, 1290 650" />
          <line x1="680" y1="648" x2="1300" y2="645" strokeWidth="1.2" />

          {/* Rumeli Hisarı cylindrical tower on the hill */}
          <g transform="translate(1275, 520)">
            <rect x="0" y="25" width="38" height="105" fill="#f7f4ee" fillOpacity="0.5" />
            <path d="M-3 25 H5 V18 H13 V25 H25 V18 H33 V25 H41" />
            <polygon points="0,18 19,-6 38,18" fill="#e5dec9" fillOpacity="0.6" />
          </g>
        </g>

        {/* Gentle Animated Bosphorus Waves */}
        <g className="animate-wave-drift" stroke="#4a6b82" strokeWidth="1.1" strokeLinecap="round" opacity="0.35">
          <path d="M80 735 Q 160 727, 240 735 T 400 735 T 560 735 T 720 735 T 880 735 T 1040 735 T 1200 735 T 1360 735" />
          <path d="M180 765 Q 260 757, 340 765 T 500 765 T 660 765 T 820 765 T 980 765 T 1140 765 T 1300 765" />
          <path d="M40 798 Q 140 790, 240 798 T 440 798 T 640 798 T 840 798 T 1040 798 T 1240 798" />
          <path d="M260 830 Q 360 822, 460 830 T 660 830 T 860 830 T 1060 830 T 1260 830" />
        </g>
      </svg>
    </div>
  );
};
