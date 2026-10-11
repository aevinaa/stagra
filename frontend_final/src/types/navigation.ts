export type NavRoute = '/dashboard' | '/analytics' | '/prediction' | '/models';

export interface NavItemConfig {
  id: string;
  label: string;
  path: NavRoute;
  description: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    description: 'Real-time telemetry and current sensor readings',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    description: 'Historical trends, time-series distributions, and environmental correlations',
  },
  {
    id: 'prediction',
    label: 'Prediction',
    path: '/prediction',
    description: 'Machine learning inference and air-quality forecasting',
  },
  {
    id: 'models',
    label: 'Model Comparison',
    path: '/models',
    description: 'Evaluative metrics, accuracy benchmarks, and model performance',
  },
];
