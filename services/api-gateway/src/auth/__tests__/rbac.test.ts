import { describe, it, expect, beforeEach } from 'vitest';
import { RBACAuthorizer, AuthorizationContext, Role } from '../rbac';
import { JWTPayload } from '../jwt-auth';

describe('RBACAuthorizer', () => {
  let rbac: RBACAuthorizer;
  let mockUser: JWTPayload;

  beforeEach(() => {
    rbac = new RBACAuthorizer();
    
    mockUser = {
      sub: 'user-123',
      email: 'test@example.com',
      teamId: 'team-456',
      roles: ['developer'],
      permissions: ['projects:read'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'devflow.ai',
      aud: 'api.devflow.ai'
    };
  });

  describe('authorize', () => {
    it('should allow super-admin to access everything', () => {
      const superAdminUser = { ...mockUser, roles: ['super-admin'] };
      const context: AuthorizationContext = {
        user: superAdminUser,
        resource: 'any-resource',
        action: 'any-action'
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(true);
    });

    it('should allow access with direct permissions', () => {
      const userWithPermissions = { ...mockUser, permissions: ['projects:read', 'workflows:write'] };
      const context: AuthorizationContext = {
        user: userWithPermissions,
        resource: 'projects',
        action: 'read'
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(true);
    });

    it('should allow access with wildcard permissions', () => {
      const userWithWildcard = { ...mockUser, permissions: ['projects:*'] };
      const context: AuthorizationContext = {
        user: userWithWildcard,
        resource: 'projects',
        action: 'write'
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(true);
    });

    it('should allow access with role-based permissions', () => {
      const context: AuthorizationContext = {
        user: mockUser, // has 'developer' role
        resource: 'projects',
        action: 'read',
        teamId: mockUser.teamId
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(true);
    });

    it('should deny access without proper permissions', () => {
      const context: AuthorizationContext = {
        user: mockUser,
        resource: 'admin-panel',
        action: 'write'
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it('should respect team-based permissions', () => {
      const context: AuthorizationContext = {
        user: mockUser,
        resource: 'projects',
        action: 'read',
        teamId: mockUser.teamId // Same team
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(true);
    });

    it('should deny access to different team resources', () => {
      const context: AuthorizationContext = {
        user: mockUser,
        resource: 'projects',
        action: 'write',
        teamId: 'different-team-id'
      };

      const result = rbac.authorize(context);

      expect(result.allowed).toBe(false);
    });
  });

  describe('role management', () => {
    it('should add and retrieve roles', () => {
      const customRole: Role = {
        id: 'custom-role-id',
        name: 'custom-role',
        description: 'A custom role for testing',
        permissions: [
          { resource: 'custom-resource', action: 'read' }
        ]
      };

      rbac.addRole(customRole);
      const retrieved = rbac.getRole('custom-role');

      expect(retrieved).toEqual(customRole);
    });

    it('should remove roles', () => {
      const customRole: Role = {
        id: 'custom-role-id',
        name: 'custom-role',
        permissions: []
      };

      rbac.addRole(customRole);
      rbac.removeRole('custom-role');
      
      const retrieved = rbac.getRole('custom-role');
      expect(retrieved).toBeUndefined();
    });

    it('should get all roles', () => {
      const roles = rbac.getAllRoles();
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some(role => role.name === 'super-admin')).toBe(true);
      expect(roles.some(role => role.name === 'developer')).toBe(true);
    });
  });

  describe('user role management', () => {
    it('should assign and retrieve user roles', () => {
      const userId = 'user-123';
      const roles = ['developer', 'viewer'];

      rbac.assignUserRoles(userId, roles);
      const userRoles = rbac.getUserRoles(userId);

      expect(userRoles).toEqual(roles);
    });

    it('should check if user has specific role', () => {
      const userId = 'user-123';
      rbac.assignUserRoles(userId, ['developer', 'viewer']);

      expect(rbac.hasRole(userId, 'developer')).toBe(true);
      expect(rbac.hasRole(userId, 'admin')).toBe(false);
    });

    it('should check if user has any of specified roles', () => {
      const userId = 'user-123';
      rbac.assignUserRoles(userId, ['developer']);

      expect(rbac.hasAnyRole(userId, ['developer', 'admin'])).toBe(true);
      expect(rbac.hasAnyRole(userId, ['admin', 'super-admin'])).toBe(false);
    });

    it('should check if user has all specified roles', () => {
      const userId = 'user-123';
      rbac.assignUserRoles(userId, ['developer', 'viewer']);

      expect(rbac.hasAllRoles(userId, ['developer', 'viewer'])).toBe(true);
      expect(rbac.hasAllRoles(userId, ['developer', 'admin'])).toBe(false);
    });
  });

  describe('permission evaluation', () => {
    it('should get effective permissions for user', () => {
      const user = {
        ...mockUser,
        roles: ['developer'],
        permissions: ['custom:read']
      };

      const permissions = rbac.getUserPermissions(user);

      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions.some(p => p.resource === 'custom' && p.action === 'read')).toBe(true);
      expect(permissions.some(p => p.resource === 'projects')).toBe(true);
    });

    it('should handle permission conditions', () => {
      // Add a role with conditional permissions
      const conditionalRole: Role = {
        id: 'conditional-role',
        name: 'conditional-role',
        permissions: [
          { 
            resource: 'projects', 
            action: 'write', 
            conditions: { owner: true } 
          }
        ]
      };

      rbac.addRole(conditionalRole);

      const user = { ...mockUser, roles: ['conditional-role'] };
      
      // Should allow when user is owner
      const ownerContext: AuthorizationContext = {
        user,
        resource: 'projects',
        action: 'write',
        resourceId: user.sub // User is owner
      };

      const ownerResult = rbac.authorize(ownerContext);
      expect(ownerResult.allowed).toBe(true);

      // Should deny when user is not owner
      const nonOwnerContext: AuthorizationContext = {
        user,
        resource: 'projects',
        action: 'write',
        resourceId: 'different-user-id'
      };

      const nonOwnerResult = rbac.authorize(nonOwnerContext);
      expect(nonOwnerResult.allowed).toBe(false);
    });

    it('should handle team conditions', () => {
      const teamRole: Role = {
        id: 'team-role',
        name: 'team-role',
        permissions: [
          { 
            resource: 'team-projects', 
            action: 'read', 
            conditions: { team: true } 
          }
        ]
      };

      rbac.addRole(teamRole);

      const user = { ...mockUser, roles: ['team-role'] };
      
      // Should allow when accessing team resource
      const teamContext: AuthorizationContext = {
        user,
        resource: 'team-projects',
        action: 'read',
        teamId: user.teamId
      };

      const teamResult = rbac.authorize(teamContext);
      expect(teamResult.allowed).toBe(true);

      // Should deny when accessing different team resource
      const differentTeamContext: AuthorizationContext = {
        user,
        resource: 'team-projects',
        action: 'read',
        teamId: 'different-team-id'
      };

      const differentTeamResult = rbac.authorize(differentTeamContext);
      expect(differentTeamResult.allowed).toBe(false);
    });

    it('should handle role conditions', () => {
      const roleConditionRole: Role = {
        id: 'role-condition-role',
        name: 'role-condition-role',
        permissions: [
          { 
            resource: 'admin-functions', 
            action: 'execute', 
            conditions: { role: ['admin', 'super-admin'] } 
          }
        ]
      };

      rbac.addRole(roleConditionRole);

      // User with admin role should be allowed
      const adminUser = { ...mockUser, roles: ['role-condition-role', 'admin'] };
      const adminContext: AuthorizationContext = {
        user: adminUser,
        resource: 'admin-functions',
        action: 'execute'
      };

      const adminResult = rbac.authorize(adminContext);
      expect(adminResult.allowed).toBe(true);

      // User without admin role should be denied
      const regularUser = { ...mockUser, roles: ['role-condition-role', 'developer'] };
      const regularContext: AuthorizationContext = {
        user: regularUser,
        resource: 'admin-functions',
        action: 'execute'
      };

      const regularResult = rbac.authorize(regularContext);
      expect(regularResult.allowed).toBe(false);
    });
  });

  describe('default roles', () => {
    it('should have default system roles', () => {
      const roles = rbac.getAllRoles();
      const roleNames = roles.map(role => role.name);

      expect(roleNames).toContain('super-admin');
      expect(roleNames).toContain('team-admin');
      expect(roleNames).toContain('developer');
      expect(roleNames).toContain('viewer');
      expect(roleNames).toContain('guest');
    });

    it('should have proper permissions for developer role', () => {
      const developerRole = rbac.getRole('developer');
      
      expect(developerRole).toBeTruthy();
      expect(developerRole!.permissions.length).toBeGreaterThan(0);
      expect(developerRole!.permissions.some(p => p.resource === 'projects')).toBe(true);
      expect(developerRole!.permissions.some(p => p.resource === 'workflows')).toBe(true);
    });

    it('should have proper permissions for viewer role', () => {
      const viewerRole = rbac.getRole('viewer');
      
      expect(viewerRole).toBeTruthy();
      expect(viewerRole!.permissions.every(p => p.action === 'read')).toBe(true);
    });
  });
});