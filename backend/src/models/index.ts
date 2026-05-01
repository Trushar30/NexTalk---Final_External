import mongoose, { Schema, Document } from 'mongoose';

// ─── Enums ───────────────────────────────────────────────
export const MoodType = ['HAPPY', 'CALM', 'FOCUSED', 'STRESSED', 'EXCITED', 'NEUTRAL', 'ANGRY', 'SAD'] as const;
export const PrivacyLevel = ['PUBLIC', 'FRIENDS', 'PRIVATE'] as const;
export const ConnectionStatus = ['PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED'] as const;
export const MessageType = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'SYSTEM'] as const;
export const TeamRole = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const;
export const NotificationType = [
  'MESSAGE', 'REQUEST_RECEIVED', 'REQUEST_ACCEPTED', 'REACTION', 'MENTION',
  'TEAM_INVITE', 'SCREENSHOT_TAKEN', 'TOXIC_FLAGGED', 'SYSTEM',
] as const;

// ─── User ────────────────────────────────────────────────
export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  faceEmbedding?: Buffer;
  publicKey?: string;
  currentMood: (typeof MoodType)[number];
  moodUpdatedAt?: Date;
  isOnline: boolean;
  lastSeenAt?: Date;
  privacyLevel: (typeof PrivacyLevel)[number];
  fcmToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    bio: { type: String, maxlength: 500 },
    faceEmbedding: { type: Buffer },
    publicKey: { type: String },
    currentMood: { type: String, enum: MoodType, default: 'NEUTRAL' },
    moodUpdatedAt: { type: Date },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date },
    privacyLevel: { type: String, enum: PrivacyLevel, default: 'FRIENDS' },
    fcmToken: { type: String },
  },
  { timestamps: true }
);

UserSchema.index({ username: 'text', displayName: 'text' });

export const User = mongoose.model<IUser>('User', UserSchema);

// ─── Session ─────────────────────────────────────────────
export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  refreshTokenHash: string;
  deviceInfo?: string;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    deviceInfo: { type: String },
    ipAddress: { type: String },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const Session = mongoose.model<ISession>('Session', SessionSchema);

// ─── Connection (Friend Request) ────────────────────────
export interface IConnection extends Document {
  requesterId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  status: (typeof ConnectionStatus)[number];
  createdAt: Date;
  updatedAt: Date;
}

const ConnectionSchema = new Schema<IConnection>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ConnectionStatus, default: 'PENDING' },
  },
  { timestamps: true }
);

ConnectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
ConnectionSchema.index({ recipientId: 1, status: 1 });

export const Connection = mongoose.model<IConnection>('Connection', ConnectionSchema);

// ─── Conversation ────────────────────────────────────────
export interface IConversationMember {
  userId: mongoose.Types.ObjectId;
  joinedAt: Date;
  lastReadAt?: Date;
}

export interface IConversation extends Document {
  isGroup: boolean;
  name?: string;
  members: IConversationMember[];
  teamChannelId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    isGroup: { type: Boolean, default: false },
    name: { type: String, trim: true },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        joinedAt: { type: Date, default: Date.now },
        lastReadAt: { type: Date },
      },
    ],
    teamChannelId: { type: Schema.Types.ObjectId, ref: 'TeamChannel' },
  },
  { timestamps: true }
);

ConversationSchema.index({ 'members.userId': 1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);

// ─── Message ─────────────────────────────────────────────
export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content?: string;
  encryptedContent?: string;
  contentKey?: string;
  type: (typeof MessageType)[number];
  isOneTime: boolean;
  oneTimeViewedAt?: Date;
  oneTimeViewedBy?: mongoose.Types.ObjectId;
  mediaUrl?: string;
  mediaThumbnail?: string;
  isToxic: boolean;
  toxicScore?: number;
  toxicCategories: string[];
  reactions: IMessageReaction[];
  readBy: IReadReceipt[];
  isDeleted: boolean;
  deletedAt?: Date;
  editedAt?: Date;
  createdAt: Date;
}

export interface IMessageReaction {
  userId: mongoose.Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

export interface IReadReceipt {
  userId: mongoose.Types.ObjectId;
  readAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String },
    encryptedContent: { type: String },
    contentKey: { type: String },
    type: { type: String, enum: MessageType, default: 'TEXT' },
    isOneTime: { type: Boolean, default: false },
    oneTimeViewedAt: { type: Date },
    oneTimeViewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    mediaUrl: { type: String },
    mediaThumbnail: { type: String },
    isToxic: { type: Boolean, default: false },
    toxicScore: { type: Number },
    toxicCategories: [{ type: String }],
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        emoji: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    readBy: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        readAt: { type: Date, default: Date.now },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);

// ─── Team ────────────────────────────────────────────────
export interface ITeamMember {
  userId: mongoose.Types.ObjectId;
  role: (typeof TeamRole)[number];
  joinedAt: Date;
}

export interface ITeam extends Document {
  name: string;
  tag: string;
  description?: string;
  bannerUrl?: string;
  isPublic: boolean;
  createdBy: mongoose.Types.ObjectId;
  members: ITeamMember[];
  createdAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    tag: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String },
    bannerUrl: { type: String },
    isPublic: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: TeamRole, default: 'MEMBER' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

TeamSchema.index({ tag: 'text', name: 'text' });

export const Team = mongoose.model<ITeam>('Team', TeamSchema);

// ─── Team Channel ────────────────────────────────────────
export interface ITeamChannel extends Document {
  teamId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  conversationId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const TeamChannelSchema = new Schema<ITeamChannel>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  },
  { timestamps: true }
);

export const TeamChannel = mongoose.model<ITeamChannel>('TeamChannel', TeamChannelSchema);

// ─── Notification ────────────────────────────────────────
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: (typeof NotificationType)[number];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NotificationType, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

// ─── Screenshot Log ──────────────────────────────────────
export interface IScreenshotLog extends Document {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  detectedAt: Date;
}

const ScreenshotLogSchema = new Schema<IScreenshotLog>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  detectedAt: { type: Date, default: Date.now },
});

export const ScreenshotLog = mongoose.model<IScreenshotLog>('ScreenshotLog', ScreenshotLogSchema);
