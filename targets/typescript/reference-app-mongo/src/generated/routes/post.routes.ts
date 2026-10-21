import { Router, type Request, type Response } from 'express';
import { Post, PostCreateSchema, PostUpdateSchema } from '../models/Post.js';
import { postHooks } from '../../custom/hooks/post.hooks.js';

export const postRouter: Router = Router();

// 1. GET /api/posts - List entities
postRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const posts = await Post.find()
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch posts' });
  }
});

// 2. GET /api/posts/:id - Get entity by ID
postRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] || '';
  try {
    const post = await Post.findOne({ $or: [{ _id: id }, { id }] });
    if (!post) {
      res.status(404).json({ error: `Post with id '${id}' not found` });
      return;
    }
    res.status(200).json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch post' });
  }
});

// 3. POST /api/posts - Create entity
postRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parseResult = PostCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten()
    });
    return;
  }

  try {
    const hookPayload = postHooks.beforeCreate
      ? await postHooks.beforeCreate(parseResult.data)
      : parseResult.data;

    const post = new Post(hookPayload);
    await post.save();

    if (postHooks.afterCreate) {
      await postHooks.afterCreate(post.toJSON());
    }

    res.status(201).json(post);
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ error: 'Post with this slug already exists' });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// 4. PATCH /api/posts/:id - Update entity
postRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] || '';
  const parseResult = PostUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten()
    });
    return;
  }

  try {
    const existing = await Post.findOne({ $or: [{ _id: id }, { id }] });
    if (!existing) {
      res.status(404).json({ error: `Post with id '${id}' not found` });
      return;
    }

    const hookPayload = postHooks.beforeUpdate
      ? await postHooks.beforeUpdate(id, parseResult.data)
      : parseResult.data;

    Object.assign(existing, hookPayload);
    await existing.save();

    if (postHooks.afterUpdate) {
      await postHooks.afterUpdate(existing.toJSON());
    }

    res.status(200).json(existing);
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ error: 'Post with this slug already exists' });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to update post' });
  }
});

// 5. DELETE /api/posts/:id - Delete entity
postRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] || '';
  try {
    const post = await Post.findOne({ $or: [{ _id: id }, { id }] });
    if (!post) {
      res.status(404).json({ error: `Post with id '${id}' not found` });
      return;
    }

    if (postHooks.beforeDelete) {
      await postHooks.beforeDelete(id);
    }

    await Post.deleteOne({ _id: post._id });

    if (postHooks.afterDelete) {
      await postHooks.afterDelete(id);
    }

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete post' });
  }
});
