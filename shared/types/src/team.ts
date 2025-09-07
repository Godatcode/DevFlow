import { BaseEntity, UUID } from './common';

export enum UserRole {
  ADMIN = 'admin',
  TEAM_LEAD = 'team_lead',
  DEVELOPER = 'developer',
  VIEWER = 'viewer'
}

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export interface Skill {
  name: string;
  level: SkillLevel;
  yearsOfExperience: number;
}

export interface DeveloperPreferences {
  timezone: string;
  workingHours: {
    start: string;
    end: string;
  };
  notificationSettings: {
    email: boolean;
    slack: boolean;
    inApp: boolean;
  };
  preferredLanguages: string[];
}

export interface Developer extends BaseEntity {
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  skills: Skill[];
  preferences: DeveloperPreferences;
  teamIds: UUID[];
  isActive: boolean;
}

export interface TeamMember {
  userId: UUID;
  role: UserRole;
  joinedAt: Date;
  permissions: string[];
}

export interface TeamSettings {
  workingHours: {
    start: string;
    end: string;
    timezone: string;
  };
  codeReviewSettings: {
    requiredApprovals: number;
    requireOwnerReview: boolean;
    dismissStaleReviews: boolean;
  };
  deploymentSettings: {
    autoDeployBranches: string[];
    requireApprovalForProduction: boolean;
  };
  notificationChannels: {
    slack?: string;
    teams?: string;
    discord?: string;
  };
}

export interface Team extends BaseEntity {
  name: string;
  description: string;
  members: TeamMember[];
  settings: TeamSettings;
  projectIds: UUID[];
  isActive: boolean;
}