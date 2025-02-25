import type { Theme } from './types';

// Core brand colors
export const BITCOIN_ORANGE = "#F7931A";
export const ARCH_BLACK = "#000000";
export const ARCH_DARK = "#18191E";
export const ARCH_GRAY = "#212431";

// Accent colors
export const BLUE = "#80ECFF";
export const GREEN = "#14F195";
export const RED = "#FF5555";
export const YELLOW = "#FFC107";
export const PURPLE = "#9945FF";

// Text colors
export const TEXT_PRIMARY = "#FFFFFF";
export const TEXT_SECONDARY = "#AAAAAA";

// Syntax highlighting
export const H_ORANGE = BITCOIN_ORANGE;
export const H_BLUE = "#38CCFF";
export const H_GREEN = "#2EF0B1";
export const H_PURPLE = "#B57BEE";
export const H_YELLOW = "#FFD174";

// Borders & States
export const BORDER_COLOR = "#232323";
export const HOVER_BG = "#2B2D39";
export const DISABLED = "#111114";
export const COMMENT = "#666666";

const ARCH_THEME: Theme = {
  isDark: true,
  colors: {
    default: {
      bgPrimary: ARCH_BLACK,
      bgSecondary: ARCH_DARK,
      primary: BITCOIN_ORANGE,
      secondary: BLUE,
      textPrimary: TEXT_PRIMARY,
      textSecondary: TEXT_SECONDARY,
      border: BORDER_COLOR,
    },
    state: {
      disabled: {
        bg: DISABLED,
        color: TEXT_SECONDARY,
      },
      error: {
        color: RED,
      },
      hover: {
        bg: HOVER_BG,
        color: TEXT_SECONDARY,
      },
      info: {
        color: BLUE,
      },
      success: {
        color: GREEN,
      },
      warning: {
        color: YELLOW,
      },
    },
  },
  default: {
    backdrop: {
      backdropFilter: "blur(8px)",
    },
    borderRadius: "12px",
    boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.2)",
  },
  components: {
    editor: {
      default: {
        bg: ARCH_DARK,
        color: TEXT_PRIMARY,
      },
      gutter: {
        bg: ARCH_DARK,
        color: COMMENT,
      },
      wrapper: {
        bg: ARCH_DARK,
      },
    },
    main: {
      default: {
        bg: ARCH_BLACK,
      },
    },
    sidebar: {
      left: {
        default: {
          bg: ARCH_BLACK,
        },
      },
      right: {
        default: {
          bg: ARCH_BLACK,
          otherBg: ARCH_DARK,
        },
      },
    },
  },
  highlight: {
    typeName: { color: H_BLUE, fontStyle: "italic" },
    variableName: { color: TEXT_PRIMARY },
    namespace: { color: H_BLUE },
    macroName: { color: H_GREEN },
    functionCall: { color: H_GREEN },
    functionDef: { color: H_GREEN },
    functionArg: { color: TEXT_PRIMARY },
    definitionKeyword: { color: H_ORANGE },
    moduleKeyword: { color: H_ORANGE },
    modifier: { color: H_ORANGE },
    controlKeyword: { color: H_PURPLE },
    operatorKeyword: { color: H_PURPLE },
    keyword: { color: H_ORANGE },
    self: { color: H_ORANGE },
    bool: { color: H_PURPLE },
    integer: { color: H_PURPLE },
    literal: { color: H_PURPLE },
    string: { color: H_YELLOW },
    character: { color: H_YELLOW },
    operator: { color: H_PURPLE },
    derefOperator: { color: H_PURPLE },
    specialVariable: { color: H_PURPLE },
    lineComment: { color: COMMENT, fontStyle: "italic" },
    blockComment: { color: COMMENT, fontStyle: "italic" },
    meta: { color: H_BLUE },
    invalid: { color: RED },
    constant: { color: TEXT_PRIMARY },
  },
};

export default ARCH_THEME;