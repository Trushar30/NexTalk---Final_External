import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { teamService } from '../services/team.service';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { searchLimiter } from '../middleware/rateLimiter.middleware';
import { sendSuccess, sendCreated } from '../utils/apiResponse';
import { AuthRequest } from '../types';

const router = Router();

// ─── Validation ──────────────────────────────────────────
const createTeamSchema = z.object({
  name: z.string().min(1).max(50),
  tag: z.string().min(2).max(10).regex(/^[A-Za-z0-9]+$/, 'Tag must be alphanumeric'),
  description: z.string().max(200).optional(),
  isPublic: z.boolean().optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).optional(),
  bannerUrl: z.string().url().optional(),
  isPublic: z.boolean().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
});

const inviteSchema = z.object({
  userId: z.string().min(1),
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Channel name must be lowercase alphanumeric with hyphens'),
  description: z.string().max(200).optional(),
});

// ─── Routes ──────────────────────────────────────────────

// GET /teams — List user's teams
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const teams = await teamService.listForUser(req.userId!);
    sendSuccess(res, teams);
  } catch (err) { next(err); }
});

// POST /teams — Create team
router.post('/', authenticate, validate(createTeamSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await teamService.create({ ...req.body, createdBy: req.userId! });
    sendCreated(res, team, 'Team created');
  } catch (err) { next(err); }
});

// GET /teams/search?tag= — Search by tag/name
router.get('/search', authenticate, searchLimiter, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tag = (req.query.tag as string) || '';
    const teams = await teamService.searchByTag(tag);
    sendSuccess(res, teams);
  } catch (err) { next(err); }
});

// GET /teams/:id — Team details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await teamService.getById(req.params.id);
    sendSuccess(res, team);
  } catch (err) { next(err); }
});

// PATCH /teams/:id — Update team
router.patch('/:id', authenticate, validate(updateTeamSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await teamService.update(req.params.id, req.userId!, req.body);
    sendSuccess(res, team, 'Team updated');
  } catch (err) { next(err); }
});

// DELETE /teams/:id — Delete team (owner only)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await teamService.delete(req.params.id, req.userId!);
    sendSuccess(res, null, 'Team deleted');
  } catch (err) { next(err); }
});

// POST /teams/:id/join — Join public team
router.post('/:id/join', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await teamService.join(req.params.id, req.userId!);
    sendSuccess(res, null, 'Joined team');
  } catch (err) { next(err); }
});

// DELETE /teams/:id/leave — Leave team (non-owner)
router.delete('/:id/leave', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await teamService.leaveTeam(req.params.id, req.userId!);
    sendSuccess(res, null, 'Left team');
  } catch (err) { next(err); }
});

// POST /teams/:id/invite — Invite user (admin/owner)
router.post('/:id/invite', authenticate, validate(inviteSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await teamService.invite(req.params.id, req.userId!, req.body.userId);
    sendSuccess(res, null, 'User invited');
  } catch (err) { next(err); }
});

// GET /teams/:id/members — Get populated members list
router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const members = await teamService.getMembers(req.params.id);
    sendSuccess(res, members);
  } catch (err) { next(err); }
});

// DELETE /teams/:id/members/:userId — Remove member (admin/owner)
router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await teamService.removeMember(req.params.id, req.userId!, req.params.userId);
    sendSuccess(res, null, 'Member removed');
  } catch (err) { next(err); }
});

// PATCH /teams/:id/members/:userId — Update role (owner)
router.patch('/:id/members/:userId', authenticate, validate(updateRoleSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await teamService.updateMemberRole(req.params.id, req.userId!, req.params.userId, req.body.role);
    sendSuccess(res, null, 'Role updated');
  } catch (err) { next(err); }
});

// GET /teams/:id/channels — Get channels
router.get('/:id/channels', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const channels = await teamService.getChannels(req.params.id);
    sendSuccess(res, channels);
  } catch (err) { next(err); }
});

// POST /teams/:id/channels — Create channel (admin/owner)
router.post('/:id/channels', authenticate, validate(createChannelSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const channel = await teamService.createChannel(req.params.id, req.userId!, req.body);
    sendCreated(res, channel, 'Channel created');
  } catch (err) { next(err); }
});

export default router;
