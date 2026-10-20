import mongoose, { Schema, Document, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export interface IPost extends Document<string> {
  _id: string;
  id: string;
  title: string;
  slug: string;
  content: string;
  authorId: string;
  published: boolean;
  createdAt: Date;
}

export const PostCreateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  content: z.string().default(''),
  authorId: z.string().min(1, 'Author ID is required'),
  published: z.boolean().optional().default(false)
});

export const PostUpdateSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').optional(),
  slug: z.string().min(1, 'Slug cannot be empty').optional(),
  content: z.string().optional(),
  authorId: z.string().min(1, 'Author ID cannot be empty').optional(),
  published: z.boolean().optional()
});

export type PostCreateInput = z.infer<typeof PostCreateSchema>;
export type PostUpdateInput = z.infer<typeof PostUpdateSchema>;

const postSchema = new Schema<IPost>(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    content: {
      type: String,
      default: ''
    },
    authorId: {
      type: String,
      required: true,
      ref: 'User'
    },
    published: {
      type: Boolean,
      default: false
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

postSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Post: Model<IPost> =
  (mongoose.models.Post as Model<IPost>) || mongoose.model<IPost>('Post', postSchema);
