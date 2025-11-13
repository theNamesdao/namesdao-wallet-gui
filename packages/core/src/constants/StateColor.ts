import Color from './Color';

const StateColor = {
  SUCCESS: Color.Green[500],
  WARNING: Color.Orange[500],
  ERROR: Color.Red[500],
} as const;

export default StateColor;
