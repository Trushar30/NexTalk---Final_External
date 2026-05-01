import argon2 from 'argon2';
import { User, Session, IUser } from '../models';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { hashToken } from '../utils/encryption';
import { AuthTokens } from '../types';
import { AppError } from '../middleware/errorHandler.middleware';
import axios from 'axios';
import { env } from '../config/env';

export class AuthService {
  /**
   * Register a new user.
   */
  async signup(data: {
    username: string;
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ user: IUser; tokens: AuthTokens }> {
    // Check existing
    const existing = await User.findOne({
      $or: [{ email: data.email.toLowerCase() }, { username: data.username.toLowerCase() }],
    });
    if (existing) {
      const field = existing.email === data.email.toLowerCase() ? 'email' : 'username';
      throw new AppError(`This ${field} is already registered`, 409);
    }

    const passwordHash = await argon2.hash(data.password);

    const user = await User.create({
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      passwordHash,
      displayName: data.displayName,
    });

    const tokens = generateTokens(user.id);
    await this.createSession(user.id, tokens.refreshToken);

    return { user, tokens };
  }

  /**
   * Login with email + password.
   */
  async login(email: string, password: string, deviceInfo?: string, ipAddress?: string): Promise<{ user: IUser; tokens: AuthTokens }> {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new AppError('Invalid email or password', 401);

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new AppError('Invalid email or password', 401);

    const tokens = generateTokens(user.id);
    await this.createSession(user.id, tokens.refreshToken, deviceInfo, ipAddress);

    return { user, tokens };
  }

  /**
   * Logout — invalidate refresh token.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await Session.deleteOne({ refreshTokenHash: tokenHash });
  }

  /**
   * Refresh access token using a valid refresh token.
   * Implements token rotation: old refresh token is deleted, new pair is issued.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const session = await Session.findOne({ refreshTokenHash: tokenHash });
    if (!session) throw new AppError('Invalid refresh token', 401);

    // Delete old session (token rotation)
    await Session.deleteOne({ _id: session._id });

    // Issue new tokens
    const tokens = generateTokens(payload.userId);
    await this.createSession(payload.userId, tokens.refreshToken);

    return tokens;
  }

  /**
   * Check username availability.
   */
  async checkUsername(username: string): Promise<boolean> {
    const exists = await User.findOne({ username: username.toLowerCase() });
    return !exists;
  }

  /**
   * Register face embedding (proxy to Python AI service).
   */
  async registerFace(userId: string, imageBuffer: Buffer): Promise<{ success: boolean }> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('image', new Blob([imageBuffer]), 'face.jpg');

    const response = await axios.post(`${env.AI_SERVICE_URL}/face/register`, formData, {
      headers: { 'X-Service-Secret': env.AI_SERVICE_SECRET || '' },
    });

    if (response.data.success && response.data.embedding) {
      // Store embedding as Buffer (using 64-bit floats for precision)
      const embeddingArray = new Float64Array(response.data.embedding);
      const buffer = Buffer.from(embeddingArray.buffer);
      await User.updateOne({ _id: userId }, { faceEmbedding: buffer });
    }

    return { success: response.data.success };
  }

  /**
   * Verify face for login (proxy to Python AI service).
   */
  async verifyFace(email: string, imageBuffer: Buffer): Promise<{ verified: boolean; mood: string | null; tokens?: AuthTokens; user?: any }> {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new AppError('No user found with this email', 404);

    if (!user.faceEmbedding) {
      throw new AppError('No face registered for this user', 400);
    }

    // Convert Buffer back to array of floats (64-bit)
    const embeddingArray = Array.from(new Float64Array(
      user.faceEmbedding.buffer,
      user.faceEmbedding.byteOffset,
      user.faceEmbedding.byteLength / 8
    ));

    const formData = new FormData();
    formData.append('userId', user.id);
    formData.append('image', new Blob([imageBuffer]), 'face.jpg');
    formData.append('storedEmbedding', JSON.stringify(embeddingArray));

    const response = await axios.post(`${env.AI_SERVICE_URL}/face/verify`, formData, {
      headers: { 'X-Service-Secret': env.AI_SERVICE_SECRET || '' },
    });

    if (response.data.verified) {
      // Update mood
      await User.updateOne(
        { _id: user._id },
        { currentMood: response.data.mood || 'NEUTRAL', moodUpdatedAt: new Date() }
      );
      const tokens = generateTokens(user.id);
      await this.createSession(user.id, tokens.refreshToken);
      return { 
        ...response.data, 
        tokens,
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email, 
          displayName: user.displayName, 
          avatarUrl: user.avatarUrl, 
          currentMood: response.data.mood || 'NEUTRAL'
        } 
      };
    }

    return response.data;
  }

  // ─── Internal ────────────────────────────────────────────
  private async createSession(
    userId: string,
    refreshToken: string,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<void> {
    await Session.create({
      userId,
      refreshTokenHash: hashToken(refreshToken),
      deviceInfo,
      ipAddress,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
  }
}

export const authService = new AuthService();
