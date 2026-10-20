import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, UserCreateSchema, UserUpdateSchema } from '../models/User.js';
import { userHooks } from '../../custom/hooks/user.hooks.js';
import { authenticate } from '../middleware/auth.js';

export const userRouter: Router = Router();

// Middleware: require JWT authentication for User endpoints per IR endpoint policy
userRouter.use(authenticate);

// 1. GET /api/users - List entities
userRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const users = await User.find()
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch users' });
  }
});

// 2. GET /api/users/:id - Get entity by ID
userRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] || '';
  try {
    const user = await User.findOne({ $or: [{ _id: id }, { id }] });
    if (!user) {
      res.status(404).json({ error: `User with id '${id}' not found` });
      return;
    }
    res.status(200).json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch user' });
  }
});

// 3. POST /api/users - Create entity
userRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parseResult = UserCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten()
    });
    return;
  }

  try {
    // Execute developer custom pre-create hook
    const hookPayload = userHooks.beforeCreate
      ? await userHooks.beforeCreate(parseResult.data)
      : parseResult.data;

    let hashedPassword = hookPayload.password;
    if (hashedPassword) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(hashedPassword, salt);
    }

    const user = new User({
      ...hookPayload,
      password: hashedPassword
    });

    await user.save();

    // Execute developer custom post-create hook
    if (userHooks.afterCreate) {
      await userHooks.afterCreate(user.toJSON());
    }

    res.status(201).json(user);
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to create user' });
  }
});

// 4. PATCH /api/users/:id - Update entity
userRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] || '';
  const parseResult = UserUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten()
    });
    return;
  }

  try {
    const existing = await User.findOne({ $or: [{ _id: id }, { id }] });
    if (!existing) {
      res.status(404).json({ error: `User with id '${id}' not found` });
      return;
    }

    // Execute developer custom pre-update hook
    const hookPayload = userHooks.beforeUpdate
      ? await userHooks.beforeUpdate(id, parseResult.data)
      : parseResult.data;

    if (hookPayload.password) {
      const salt = await bcrypt.genSalt(10);
      hookPayload.password = await bcrypt.hash(hookPayload.password, salt);
    }

    Object.assign(existing, hookPayload);
    await existing.save();

    // Execute developer custom post-update hook
    if (userHooks.afterUpdate) {
      await userHooks.afterUpdate(existing.toJSON());
    }

    res.status(200).json(existing);
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ error: 'Email is already taken by another user' });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to update user' });
  }
});

// 5. DELETE /api/users/:id - Delete entity
userRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] || '';
  try {
    const user = await User.findOne({ $or: [{ _id: id }, { id }] });
    if (!user) {
      res.status(404).json({ error: `User with id '${id}' not found` });
      return;
    }

    // Execute developer custom pre-delete hook
    if (userHooks.beforeDelete) {
      await userHooks.beforeDelete(id);
    }

    await User.deleteOne({ _id: user._id });

    // Execute developer custom post-delete hook
    if (userHooks.afterDelete) {
      await userHooks.afterDelete(id);
    }

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
});
