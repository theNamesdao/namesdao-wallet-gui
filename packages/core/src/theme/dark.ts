import { createTheme } from '@mui/material/styles';

import theme from './default';

export default createTheme(
  {
    ...theme,
    palette: {
      ...theme.palette,
      background: {
        ...theme.palette.background,
        default: '#0a0e27', // Deep space blue
        paper: '#151932', // Dark blue panel
      },
      primary: {
        ...theme.palette.primary,
        main: '#00d4ff', // Electric blue
        light: '#33e0ff',
        dark: '#00a8cc',
        contrastText: '#0a0e27',
      },
      secondary: {
        ...theme.palette.secondary,
        main: '#9d4edd', // Royal purple
        contrastText: '#ffffff',
      },
      info: {
        ...theme.palette.info,
        main: '#00d4ff', // Electric blue
      },
      text: {
        primary: '#e0e7ff', // Light blue-white text
        secondary: '#a5b4fc', // Muted blue text
        disabled: '#64748b', // Very muted text
      },
      divider: 'rgba(0, 212, 255, 0.2)', // Blue divider
      mode: 'dark',
    },
  },
  {
    components: {
      ...theme.components,
      MuiButton: {
        styleOverrides: {
          containedPrimary: {
            background: '#00d4ff',
            color: '#0a0e27',
            fontWeight: 600,
            boxShadow: '0 0 15px rgba(0, 212, 255, 0.5)',
            '&:hover': {
              background: '#00a8cc',
              boxShadow: '0 0 25px rgba(0, 212, 255, 0.7)',
            },
          },
          containedSecondary: {
            background: '#9d4edd',
            color: '#ffffff',
            boxShadow: '0 0 15px rgba(157, 78, 221, 0.4)',
            '&:hover': {
              background: '#7c3aed',
              boxShadow: '0 0 25px rgba(157, 78, 221, 0.6)',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: 'rgba(21, 25, 50, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: '8px',
            '&:hover': {
              borderColor: 'rgba(157, 78, 221, 0.5)',
              boxShadow: '0 0 25px rgba(157, 78, 221, 0.2)',
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: 'rgba(21, 25, 50, 0.9)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(0, 212, 255, 0.3)',
            boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: 'rgba(21, 25, 50, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: '#151932',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            boxShadow: '0 0 10px rgba(0, 212, 255, 0.2)',
          },
        },
      },
    },
  },
);
