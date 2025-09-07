import { RouteDefinition, HttpMethod } from '../interfaces';
import { GatewayRequest } from '../types';

export interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
  score: number;
}

export class RouteMatcher {
  private routes: RouteDefinition[] = [];

  constructor(routes: RouteDefinition[]) {
    this.routes = this.sortRoutesBySpecificity(routes);
  }

  /**
   * Find the best matching route for a request
   */
  findMatch(path: string, method: HttpMethod): RouteMatch | null {
    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }

      const match = this.matchPath(route.path, path);
      if (match) {
        return {
          route,
          params: match.params,
          score: match.score
        };
      }
    }

    return null;
  }

  /**
   * Match a route pattern against a request path
   */
  private matchPath(pattern: string, path: string): { params: Record<string, string>; score: number } | null {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return null;
    }

    const params: Record<string, string> = {};
    let score = 0;

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
        // Parameter match
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
        score += 1; // Lower score for parameter matches
      } else if (patternPart === '*') {
        // Wildcard match
        score += 0.5; // Even lower score for wildcards
      } else if (patternPart === pathPart) {
        // Exact match
        score += 10; // Higher score for exact matches
      } else {
        // No match
        return null;
      }
    }

    return { params, score };
  }

  /**
   * Sort routes by specificity (most specific first)
   */
  private sortRoutesBySpecificity(routes: RouteDefinition[]): RouteDefinition[] {
    return [...routes].sort((a, b) => {
      const aSpecificity = this.calculateSpecificity(a.path);
      const bSpecificity = this.calculateSpecificity(b.path);
      return bSpecificity - aSpecificity;
    });
  }

  /**
   * Calculate route specificity score
   */
  private calculateSpecificity(path: string): number {
    const parts = path.split('/').filter(Boolean);
    let score = 0;

    for (const part of parts) {
      if (part.startsWith(':')) {
        score += 1; // Parameter
      } else if (part === '*') {
        score += 0.5; // Wildcard
      } else {
        score += 10; // Exact match
      }
    }

    return score;
  }

  /**
   * Update routes configuration
   */
  updateRoutes(routes: RouteDefinition[]): void {
    this.routes = this.sortRoutesBySpecificity(routes);
  }
}