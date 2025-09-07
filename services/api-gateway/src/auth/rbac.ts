import { UUID } from '@devflow/shared-types';
import { JWTPayload } from './jwt-auth';

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  id: UUID;
  name: string;
  permissions: Permission[];
  description?: string;
}

export interface AuthorizationContext {
  user: JWTPayload;
  resource: string;
  action: string;
  resourceId?: UUID;
  teamId?: UUID;
  metadata?: Record<string, any>;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions?: Permission[];
}

export class RBACAuthorizer {
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<UUID, string[]> = new Map();

  constructor() {
    this.initializeDefaultRoles();
  }

  /**
   * Check if a user is authorized to perform an action on a resource
   */
  authorize(context: AuthorizationContext): AuthorizationResult {
    const { user, resource, action } = context;

    // Super admin bypass
    if (user.roles.includes('super-admin')) {
      return { allowed: true };
    }

    // Check direct permissions in JWT
    const hasDirectPermission = user.permissions.some(permission => {
      const [permResource, permAction] = permission.split(':');
      return (permResource === resource || permResource === '*') && 
             (permAction === action || permAction === '*');
    });

    if (hasDirectPermission) {
      return { allowed: true };
    }

    // Check role-based permissions
    const userRoles = user.roles;
    const requiredPermissions: Permission[] = [];

    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);
      if (!role) continue;

      for (const permission of role.permissions) {
        if (this.matchesPermission(permission, resource, action, context)) {
          return { allowed: true };
        }
        
        if (permission.resource === resource) {
          requiredPermissions.push(permission);
        }
      }
    }

    // Check team-based permissions
    if (context.teamId && user.teamId === context.teamId) {
      const teamPermissions = this.getTeamPermissions(user.teamId);
      for (const permission of teamPermissions) {
        if (this.matchesPermission(permission, resource, action, context)) {
          return { allowed: true };
        }
      }
    }

    return {
      allowed: false,
      reason: `Insufficient permissions for ${action} on ${resource}`,
      requiredPermissions
    };
  }

  /**
   * Add a role to the system
   */
  addRole(role: Role): void {
    this.roles.set(role.name, role);
  }

  /**
   * Remove a role from the system
   */
  removeRole(roleName: string): void {
    this.roles.delete(roleName);
  }

  /**
   * Get a role by name
   */
  getRole(roleName: string): Role | undefined {
    return this.roles.get(roleName);
  }

  /**
   * Get all roles
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * Assign roles to a user
   */
  assignUserRoles(userId: UUID, roles: string[]): void {
    this.userRoles.set(userId, roles);
  }

  /**
   * Get user roles
   */
  getUserRoles(userId: UUID): string[] {
    return this.userRoles.get(userId) || [];
  }

  /**
   * Check if user has a specific role
   */
  hasRole(userId: UUID, roleName: string): boolean {
    const userRoles = this.getUserRoles(userId);
    return userRoles.includes(roleName);
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(userId: UUID, roleNames: string[]): boolean {
    const userRoles = this.getUserRoles(userId);
    return roleNames.some(role => userRoles.includes(role));
  }

  /**
   * Check if user has all of the specified roles
   */
  hasAllRoles(userId: UUID, roleNames: string[]): boolean {
    const userRoles = this.getUserRoles(userId);
    return roleNames.every(role => userRoles.includes(role));
  }

  /**
   * Get effective permissions for a user
   */
  getUserPermissions(user: JWTPayload): Permission[] {
    const permissions: Permission[] = [];

    // Add direct permissions
    user.permissions.forEach(perm => {
      const [resource, action] = perm.split(':');
      permissions.push({ resource, action });
    });

    // Add role-based permissions
    user.roles.forEach(roleName => {
      const role = this.roles.get(roleName);
      if (role) {
        permissions.push(...role.permissions);
      }
    });

    // Add team permissions if applicable
    if (user.teamId) {
      const teamPermissions = this.getTeamPermissions(user.teamId);
      permissions.push(...teamPermissions);
    }

    return permissions;
  }

  /**
   * Check if a permission matches the required resource and action
   */
  private matchesPermission(
    permission: Permission, 
    resource: string, 
    action: string, 
    context: AuthorizationContext
  ): boolean {
    // Check resource match
    const resourceMatch = permission.resource === resource || 
                         permission.resource === '*' ||
                         this.matchesResourcePattern(permission.resource, resource);

    if (!resourceMatch) {
      return false;
    }

    // Check action match
    const actionMatch = permission.action === action || 
                       permission.action === '*' ||
                       this.matchesActionPattern(permission.action, action);

    if (!actionMatch) {
      return false;
    }

    // Check conditions if present
    if (permission.conditions) {
      return this.evaluateConditions(permission.conditions, context);
    }

    return true;
  }

  /**
   * Check if resource pattern matches
   */
  private matchesResourcePattern(pattern: string, resource: string): boolean {
    // Support wildcards like "workflows:*" matching "workflows:123"
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return resource.startsWith(prefix);
    }

    return pattern === resource;
  }

  /**
   * Check if action pattern matches
   */
  private matchesActionPattern(pattern: string, action: string): boolean {
    // Support action hierarchies like "read" matching "read:own"
    if (pattern.includes(':')) {
      return pattern === action;
    }

    return action.startsWith(pattern);
  }

  /**
   * Evaluate permission conditions
   */
  private evaluateConditions(conditions: Record<string, any>, context: AuthorizationContext): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      switch (key) {
        case 'owner':
          if (value === true && context.user.sub !== context.resourceId) {
            return false;
          }
          break;
        case 'team':
          if (value === true && context.user.teamId !== context.teamId) {
            return false;
          }
          break;
        case 'role':
          if (Array.isArray(value)) {
            if (!value.some(role => context.user.roles.includes(role))) {
              return false;
            }
          } else if (!context.user.roles.includes(value)) {
            return false;
          }
          break;
        default:
          // Custom condition evaluation can be added here
          break;
      }
    }

    return true;
  }

  /**
   * Get team-specific permissions
   */
  private getTeamPermissions(teamId: UUID): Permission[] {
    // In a real implementation, this would fetch from a database
    // For now, return basic team permissions
    return [
      { resource: 'team:projects', action: 'read' },
      { resource: 'team:workflows', action: 'read' },
      { resource: 'team:members', action: 'read' }
    ];
  }

  /**
   * Initialize default system roles
   */
  private initializeDefaultRoles(): void {
    // Super Admin - full access
    this.addRole({
      id: 'super-admin-role',
      name: 'super-admin',
      description: 'Full system access',
      permissions: [
        { resource: '*', action: '*' }
      ]
    });

    // Team Admin - team management
    this.addRole({
      id: 'team-admin-role',
      name: 'team-admin',
      description: 'Team administration access',
      permissions: [
        { resource: 'team', action: '*', conditions: { team: true } },
        { resource: 'projects', action: '*', conditions: { team: true } },
        { resource: 'workflows', action: '*', conditions: { team: true } },
        { resource: 'users', action: 'read', conditions: { team: true } },
        { resource: 'analytics', action: 'read', conditions: { team: true } }
      ]
    });

    // Developer - development access
    this.addRole({
      id: 'developer-role',
      name: 'developer',
      description: 'Development access',
      permissions: [
        { resource: 'projects', action: 'read', conditions: { team: true } },
        { resource: 'projects', action: 'write', conditions: { owner: true } },
        { resource: 'workflows', action: 'read', conditions: { team: true } },
        { resource: 'workflows', action: 'write', conditions: { owner: true } },
        { resource: 'code', action: '*', conditions: { team: true } },
        { resource: 'analytics', action: 'read', conditions: { team: true } }
      ]
    });

    // Viewer - read-only access
    this.addRole({
      id: 'viewer-role',
      name: 'viewer',
      description: 'Read-only access',
      permissions: [
        { resource: 'projects', action: 'read', conditions: { team: true } },
        { resource: 'workflows', action: 'read', conditions: { team: true } },
        { resource: 'analytics', action: 'read', conditions: { team: true } }
      ]
    });

    // Guest - minimal access
    this.addRole({
      id: 'guest-role',
      name: 'guest',
      description: 'Minimal access for external users',
      permissions: [
        { resource: 'public', action: 'read' }
      ]
    });
  }
}