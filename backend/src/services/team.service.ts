import { Team, ITeam, TeamChannel, ITeamChannel, Conversation, User } from '../models';
import { AppError } from '../middleware/errorHandler.middleware';

export class TeamService {
  /**
   * Create a new team.
   */
  async create(data: {
    name: string;
    tag: string;
    description?: string;
    createdBy: string;
    isPublic?: boolean;
  }): Promise<ITeam> {
    const team = await Team.create({
      ...data,
      tag: data.tag.toUpperCase(),
      members: [{ userId: data.createdBy, role: 'OWNER', joinedAt: new Date() }],
    });

    // Create default "general" channel
    const channel = await TeamChannel.create({
      teamId: team.id,
      name: 'general',
      description: 'General discussion',
    });

    // Create conversation for the channel
    const conversation = await Conversation.create({
      isGroup: true,
      name: `${data.name} - general`,
      members: [{ userId: data.createdBy, joinedAt: new Date() }],
      teamChannelId: channel.id,
    });

    channel.conversationId = conversation.id;
    await channel.save();

    return team;
  }

  /**
   * Get team by ID (populates members).
   */
  async getById(teamId: string): Promise<ITeam> {
    const team = await Team.findById(teamId)
      .populate('members.userId', 'username displayName avatarUrl currentMood isOnline lastSeenAt');
    if (!team) throw new AppError('Team not found', 404);
    return team;
  }

  /**
   * Update team (admin/owner only).
   */
  async update(
    teamId: string,
    userId: string,
    data: Partial<Pick<ITeam, 'name' | 'description' | 'bannerUrl' | 'isPublic'>>
  ): Promise<ITeam> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new AppError('Only admins can update team settings', 403);
    }

    Object.assign(team, data);
    await team.save();
    return team;
  }

  /**
   * Delete team (owner only) — cascades to channels + conversations.
   */
  async delete(teamId: string, userId: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member || member.role !== 'OWNER') {
      throw new AppError('Only the owner can delete the team', 403);
    }

    // Cascade: delete all channel conversations
    const channels = await TeamChannel.find({ teamId });
    const convIds = channels.map((c) => c.conversationId).filter(Boolean);
    if (convIds.length > 0) {
      await Conversation.deleteMany({ _id: { $in: convIds } });
    }

    await TeamChannel.deleteMany({ teamId });
    await Team.deleteOne({ _id: teamId });
  }

  /**
   * Join a public team.
   */
  async join(teamId: string, userId: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);
    if (!team.isPublic) throw new AppError('This team is not public. You need an invite.', 403);

    const isMember = team.members.some((m) => m.userId.toString() === userId);
    if (isMember) throw new AppError('Already a member', 409);

    team.members.push({ userId: userId as any, role: 'MEMBER', joinedAt: new Date() });
    await team.save();

    // Add to all channel conversations
    const channels = await TeamChannel.find({ teamId }).sort({ createdAt: 1 });
    for (const channel of channels) {
      if (channel.conversationId) {
        await Conversation.updateOne(
          { _id: channel.conversationId },
          { $push: { members: { userId, joinedAt: new Date() } } }
        );
      }
    }
  }

  /**
   * Leave a team (non-owner).
   */
  async leaveTeam(teamId: string, userId: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member) throw new AppError('You are not a member of this team', 404);
    if (member.role === 'OWNER') throw new AppError('Owner cannot leave the team. Transfer ownership or delete it.', 403);

    team.members = team.members.filter((m) => m.userId.toString() !== userId) as any;
    await team.save();

    // Remove from all channel conversations
    const channels = await TeamChannel.find({ teamId });
    for (const channel of channels) {
      if (channel.conversationId) {
        await Conversation.updateOne(
          { _id: channel.conversationId },
          { $pull: { members: { userId } } }
        );
      }
    }
  }

  /**
   * Invite a user to the team (admin/owner).
   */
  async invite(teamId: string, inviterId: string, inviteeId: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const inviter = team.members.find((m) => m.userId.toString() === inviterId);
    if (!inviter || !['OWNER', 'ADMIN'].includes(inviter.role)) {
      throw new AppError('Only admins can invite members', 403);
    }

    const isMember = team.members.some((m) => m.userId.toString() === inviteeId);
    if (isMember) throw new AppError('User is already a member', 409);

    // Verify user exists
    const invitee = await User.findById(inviteeId);
    if (!invitee) throw new AppError('User not found', 404);

    team.members.push({ userId: inviteeId as any, role: 'MEMBER', joinedAt: new Date() });
    await team.save();

    // Add to all channel conversations
    const channels = await TeamChannel.find({ teamId });
    for (const channel of channels) {
      if (channel.conversationId) {
        await Conversation.updateOne(
          { _id: channel.conversationId },
          { $push: { members: { userId: inviteeId, joinedAt: new Date() } } }
        );
      }
    }
  }

  /**
   * Remove a member from the team (admin/owner).
   */
  async removeMember(teamId: string, removerId: string, targetUserId: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const remover = team.members.find((m) => m.userId.toString() === removerId);
    if (!remover || !['OWNER', 'ADMIN'].includes(remover.role)) {
      throw new AppError('Not authorized to remove members', 403);
    }

    const target = team.members.find((m) => m.userId.toString() === targetUserId);
    if (!target) throw new AppError('User is not a member', 404);
    if (target.role === 'OWNER') throw new AppError('Cannot remove the owner', 403);

    team.members = team.members.filter((m) => m.userId.toString() !== targetUserId) as any;
    await team.save();

    // Remove from all channel conversations
    const channels = await TeamChannel.find({ teamId });
    for (const channel of channels) {
      if (channel.conversationId) {
        await Conversation.updateOne(
          { _id: channel.conversationId },
          { $pull: { members: { userId: targetUserId } } }
        );
      }
    }
  }

  /**
   * Update a member's role (owner only).
   */
  async updateMemberRole(teamId: string, updaterId: string, targetUserId: string, role: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const updater = team.members.find((m) => m.userId.toString() === updaterId);
    if (!updater || updater.role !== 'OWNER') {
      throw new AppError('Only the owner can change roles', 403);
    }

    const target = team.members.find((m) => m.userId.toString() === targetUserId);
    if (!target) throw new AppError('User is not a member', 404);
    if (target.userId.toString() === updaterId) throw new AppError('Cannot change your own role', 403);

    target.role = role as any;
    await team.save();
  }

  /**
   * Get team members (populated with user info).
   */
  async getMembers(teamId: string): Promise<ITeam['members']> {
    const team = await Team.findById(teamId)
      .populate('members.userId', 'username displayName avatarUrl currentMood isOnline lastSeenAt');
    if (!team) throw new AppError('Team not found', 404);
    return team.members;
  }

  /**
   * List user's teams.
   */
  async listForUser(userId: string): Promise<ITeam[]> {
    return Team.find({ 'members.userId': userId })
      .select('name tag description bannerUrl isPublic members createdBy createdAt')
      .populate('members.userId', 'username displayName avatarUrl currentMood isOnline')
      .sort({ createdAt: -1 });
  }

  /**
   * Search teams by tag or name (public only).
   */
  async searchByTag(tag: string): Promise<ITeam[]> {
    if (!tag || tag.trim().length === 0) {
      return Team.find({ isPublic: true })
        .select('name tag description bannerUrl members createdAt isPublic')
        .limit(20)
        .sort({ createdAt: -1 });
    }
    return Team.find({
      $or: [
        { tag: { $regex: tag.trim(), $options: 'i' } },
        { name: { $regex: tag.trim(), $options: 'i' } },
      ],
      isPublic: true,
    }).select('name tag description bannerUrl members createdAt isPublic');
  }

  /**
   * Get channels for a team.
   */
  async getChannels(teamId: string): Promise<ITeamChannel[]> {
    return TeamChannel.find({ teamId }).sort({ createdAt: 1 });
  }

  /**
   * Create a channel in a team (admin/owner).
   */
  async createChannel(
    teamId: string,
    userId: string,
    data: { name: string; description?: string }
  ): Promise<ITeamChannel> {
    const team = await Team.findById(teamId);
    if (!team) throw new AppError('Team not found', 404);

    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member) throw new AppError('You are not a member of this team', 403);
    if (!['OWNER', 'ADMIN'].includes(member.role)) {
      throw new AppError('Only admins can create channels', 403);
    }

    // Ensure name is unique within team
    const existing = await TeamChannel.findOne({ teamId, name: data.name.toLowerCase().trim() });
    if (existing) throw new AppError('A channel with this name already exists', 409);

    const channel = await TeamChannel.create({
      teamId,
      name: data.name.toLowerCase().trim(),
      description: data.description,
    });

    // Create a group conversation for it — add all current members
    const memberIds = team.members.map((m) => ({ userId: m.userId, joinedAt: new Date() }));
    const conversation = await Conversation.create({
      isGroup: true,
      name: `${team.name} - ${channel.name}`,
      members: memberIds,
      teamChannelId: channel.id,
    });

    channel.conversationId = conversation.id;
    await channel.save();

    return channel;
  }
}

export const teamService = new TeamService();
