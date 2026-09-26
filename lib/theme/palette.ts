export const staticColors = {
  accent: '#7D70DF',
  accentStrong: '#6659C4',
  success: '#61A568',
  danger: '#C94F4F',
  warning: '#BC9C4D',
  chartBlue: '#5B83C8',
};

export type ThemeColor = {
  background: string;
  backgroundDeep: string;
  onyx: string;
  card: string;
  elevated: string;
  input: string;
  chip: string;
  chipIcon: string;
  border: string;
  borderSoft: string;
  foreground: string;
  muted: string;
  mutedSoft: string;
  disabled: string;
  dot: string;
  accentSoft: string;
} & typeof staticColors;

export const colors: ThemeColor = {
  background: '#09090B',
  backgroundDeep: '#050508',
  onyx: '#000003',
  card: '#141416',
  elevated: '#222225',
  input: '#17171A',
  chip: '#222225',
  chipIcon: '#35353A',
  border: '#222226',
  borderSoft: '#35353A',
  foreground: '#FAFAFA',
  muted: '#A0A0A6',
  mutedSoft: '#6E6F74',
  disabled: '#525257',
  dot: '#35353A',
  accentSoft: '#E6E2FA',
  ...staticColors,
};