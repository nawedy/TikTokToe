declare module '../utils/analytics' {
  export interface AnalyticsEvent {
    name: string;
    properties?: Record<string, string | number | boolean | null>;
    timestamp?: number;
  }

  export interface AnalyticsUser {
    id: string;
    traits?: Record<string, string | number | boolean | null>;
  }

  export function track(event: AnalyticsEvent): void;
  export function identify(user: AnalyticsUser): void;
  export function page(
    name: string,
    properties?: Record<string, string | number | boolean | null>
  ): void;
  export function reset(): void;
}
