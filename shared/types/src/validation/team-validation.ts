import {
  Team,
  Developer,
  TeamMember,
  TeamSettings,
  UserRole,
  Skill,
  SkillLevel,
  DeveloperPreferences
} from '../team';
import { BaseValidator, ValidationError } from './base-validation';

export class TeamValidator extends BaseValidator {
  static validateTeam(team: Team): void {
    this.validateBaseEntity(team);
    this.validateString(team.name, 'name', 1, 100);
    this.validateString(team.description, 'description', 0, 500);
    
    this.validateArray(team.members, 'members', 1, 100);
    team.members.forEach((member, index) => {
      this.validateTeamMember(member, `members[${index}]`);
    });

    this.validateTeamSettings(team.settings);
    
    this.validateArray(team.projectIds, 'projectIds', 0, 50);
    team.projectIds.forEach((projectId, index) => {
      this.validateUUID(projectId, `projectIds[${index}]`);
    });

    if (typeof team.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean', 'INVALID_TYPE');
    }

    // Validate unique user IDs in team
    const userIds = team.members.map(m => m.userId);
    const uniqueUserIds = new Set(userIds);
    if (userIds.length !== uniqueUserIds.size) {
      throw new ValidationError('Team cannot have duplicate members', 'DUPLICATE_MEMBERS');
    }

    // Validate at least one admin or team lead
    const hasLeadership = team.members.some(m => 
      m.role === UserRole.ADMIN || m.role === UserRole.TEAM_LEAD
    );
    if (!hasLeadership) {
      throw new ValidationError(
        'Team must have at least one admin or team lead',
        'NO_LEADERSHIP'
      );
    }
  }

  static validateDeveloper(developer: Developer): void {
    this.validateBaseEntity(developer);
    this.validateEmail(developer.email, 'email');
    this.validateString(developer.name, 'name', 1, 100);
    
    if (developer.avatar) {
      this.validateUrl(developer.avatar, 'avatar');
    }

    this.validateEnum(developer.role, UserRole, 'role');
    
    this.validateArray(developer.skills, 'skills', 0, 20);
    developer.skills.forEach((skill, index) => {
      this.validateSkill(skill, `skills[${index}]`);
    });

    this.validateDeveloperPreferences(developer.preferences);
    
    this.validateArray(developer.teamIds, 'teamIds', 0, 10);
    developer.teamIds.forEach((teamId, index) => {
      this.validateUUID(teamId, `teamIds[${index}]`);
    });

    if (typeof developer.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean', 'INVALID_TYPE');
    }
  }

  static validateTeamMember(member: TeamMember, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateUUID(member.userId, `${prefix}userId`);
    this.validateEnum(member.role, UserRole, `${prefix}role`);
    this.validateDate(member.joinedAt, `${prefix}joinedAt`);
    
    this.validateArray(member.permissions, `${prefix}permissions`, 0, 50);
    member.permissions.forEach((permission, index) => {
      this.validateString(permission, `${prefix}permissions[${index}]`, 1, 50);
    });

    // Validate joinedAt is not in the future
    if (member.joinedAt > new Date()) {
      throw new ValidationError(
        `${prefix}joinedAt cannot be in the future`,
        'FUTURE_DATE'
      );
    }
  }

  static validateTeamSettings(settings: TeamSettings): void {
    this.validateWorkingHours(settings.workingHours, 'workingHours');
    this.validateCodeReviewSettings(settings.codeReviewSettings, 'codeReviewSettings');
    this.validateDeploymentSettings(settings.deploymentSettings, 'deploymentSettings');
    this.validateNotificationChannels(settings.notificationChannels, 'notificationChannels');
  }

  static validateSkill(skill: Skill, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateString(skill.name, `${prefix}name`, 1, 50);
    this.validateEnum(skill.level, SkillLevel, `${prefix}level`);
    this.validateNumber(skill.yearsOfExperience, `${prefix}yearsOfExperience`, 0, 50);
  }

  static validateDeveloperPreferences(preferences: DeveloperPreferences): void {
    this.validateString(preferences.timezone, 'preferences.timezone', 1, 50);
    
    // Validate timezone format (basic check)
    if (!preferences.timezone.includes('/')) {
      throw new ValidationError(
        'preferences.timezone must be in format "Region/City"',
        'INVALID_TIMEZONE'
      );
    }

    this.validateWorkingHours(preferences.workingHours, 'preferences.workingHours');
    this.validateNotificationSettings(preferences.notificationSettings, 'preferences.notificationSettings');
    
    this.validateArray(preferences.preferredLanguages, 'preferences.preferredLanguages', 0, 20);
    preferences.preferredLanguages.forEach((lang, index) => {
      this.validateString(lang, `preferences.preferredLanguages[${index}]`, 1, 30);
    });
  }

  private static validateWorkingHours(
    workingHours: { start: string; end: string; timezone?: string },
    fieldPrefix: string
  ): void {
    this.validateTimeFormat(workingHours.start, `${fieldPrefix}.start`);
    this.validateTimeFormat(workingHours.end, `${fieldPrefix}.end`);
    
    if (workingHours.timezone) {
      this.validateString(workingHours.timezone, `${fieldPrefix}.timezone`, 1, 50);
    }

    // Validate time range
    const startTime = this.parseTime(workingHours.start);
    const endTime = this.parseTime(workingHours.end);
    
    if (startTime >= endTime) {
      throw new ValidationError(
        `${fieldPrefix}.end must be after ${fieldPrefix}.start`,
        'INVALID_TIME_RANGE'
      );
    }
  }

  private static validateCodeReviewSettings(
    settings: {
      requiredApprovals: number;
      requireOwnerReview: boolean;
      dismissStaleReviews: boolean;
    },
    fieldPrefix: string
  ): void {
    this.validateNumber(settings.requiredApprovals, `${fieldPrefix}.requiredApprovals`, 0, 10);
    
    if (typeof settings.requireOwnerReview !== 'boolean') {
      throw new ValidationError(
        `${fieldPrefix}.requireOwnerReview must be a boolean`,
        'INVALID_TYPE'
      );
    }
    
    if (typeof settings.dismissStaleReviews !== 'boolean') {
      throw new ValidationError(
        `${fieldPrefix}.dismissStaleReviews must be a boolean`,
        'INVALID_TYPE'
      );
    }
  }

  private static validateDeploymentSettings(
    settings: {
      autoDeployBranches: string[];
      requireApprovalForProduction: boolean;
    },
    fieldPrefix: string
  ): void {
    this.validateArray(settings.autoDeployBranches, `${fieldPrefix}.autoDeployBranches`, 0, 10);
    settings.autoDeployBranches.forEach((branch, index) => {
      this.validateString(branch, `${fieldPrefix}.autoDeployBranches[${index}]`, 1, 100);
    });
    
    if (typeof settings.requireApprovalForProduction !== 'boolean') {
      throw new ValidationError(
        `${fieldPrefix}.requireApprovalForProduction must be a boolean`,
        'INVALID_TYPE'
      );
    }
  }

  private static validateNotificationChannels(
    channels: {
      slack?: string;
      teams?: string;
      discord?: string;
    },
    fieldPrefix: string
  ): void {
    if (channels.slack) {
      this.validateString(channels.slack, `${fieldPrefix}.slack`, 1, 100);
    }
    if (channels.teams) {
      this.validateString(channels.teams, `${fieldPrefix}.teams`, 1, 100);
    }
    if (channels.discord) {
      this.validateString(channels.discord, `${fieldPrefix}.discord`, 1, 100);
    }
  }

  private static validateNotificationSettings(
    settings: {
      email: boolean;
      slack: boolean;
      inApp: boolean;
    },
    fieldPrefix: string
  ): void {
    if (typeof settings.email !== 'boolean') {
      throw new ValidationError(`${fieldPrefix}.email must be a boolean`, 'INVALID_TYPE');
    }
    if (typeof settings.slack !== 'boolean') {
      throw new ValidationError(`${fieldPrefix}.slack must be a boolean`, 'INVALID_TYPE');
    }
    if (typeof settings.inApp !== 'boolean') {
      throw new ValidationError(`${fieldPrefix}.inApp must be a boolean`, 'INVALID_TYPE');
    }
  }

  private static validateTimeFormat(time: string, fieldName: string): void {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      throw new ValidationError(
        `${fieldName} must be in HH:MM format`,
        'INVALID_TIME_FORMAT'
      );
    }
  }

  private static parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}