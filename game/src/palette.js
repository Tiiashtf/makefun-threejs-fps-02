// Ember Yard's look plan, in one place. Dusk in an industrial yard: warm dark
// ground and sky, ember orange for the attackers and everything that matters,
// steel blue for the defending Wardens, bone-white ink. The same names are the
// CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191512',
  surface: '#2b251f',
  hairline: '#40382d',
  ink: '#f2ead8',
  muted: '#a89a80',
  accent: '#ff7a1a',
  ally: '#ff7a1a',
  foe: '#5b8dd9',
};

export function shade(name) {
  return PALETTE[name];
}
