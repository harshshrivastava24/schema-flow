import mongoose, { Schema, Document, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export interface IUser extends Document<string> {
  _id: string;
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'AUTHOR' | 'USER';
  password?: string;
  createdAt: Date;
}

export const UserRoleEnum = z.enum(['ADMIN', 'AUTHOR', 'USER']);

export const UserCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  role: UserRoleEnum.optional().default('USER'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
});

export const UserUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(1, 'Name cannot be empty').optional(),
  role: UserRoleEnum.optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
});

export type UserCreateInput = z.infer<typeof UserCreateSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

const userSchema = new Schema<IUser>(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: ['ADMIN', 'AUTHOR', 'USER'],
      default: 'USER'
    },
    password: {
      type: String,
      required: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  }
});

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', userSchema);
