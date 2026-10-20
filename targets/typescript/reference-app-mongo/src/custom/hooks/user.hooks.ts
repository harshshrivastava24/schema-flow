export interface UserCreateInput {
  email: string;
  name: string;
  role?: 'ADMIN' | 'AUTHOR' | 'USER';
  password?: string;
  [key: string]: unknown;
}

export interface UserUpdateInput {
  email?: string;
  name?: string;
  role?: 'ADMIN' | 'AUTHOR' | 'USER';
  password?: string;
  [key: string]: unknown;
}

export interface UserHooks {
  beforeCreate?: (input: UserCreateInput) => Promise<UserCreateInput> | UserCreateInput;
  afterCreate?: (user: Record<string, unknown>) => Promise<void> | void;
  beforeUpdate?: (id: string, input: UserUpdateInput) => Promise<UserUpdateInput> | UserUpdateInput;
  afterUpdate?: (user: Record<string, unknown>) => Promise<void> | void;
  beforeDelete?: (id: string) => Promise<void> | void;
  afterDelete?: (id: string) => Promise<void> | void;
}

/**
 * Custom hooks slot for User entity.
 * Developers can add custom logic here without losing it on regeneration.
 */
export const userHooks: UserHooks = {
  beforeCreate: async (input) => {
    // Custom pre-creation hook logic (e.g., audit logging, data normalization)
    return input;
  },
  afterCreate: async (_user) => {
    // Custom post-creation hook logic (e.g., welcome email trigger, webhook)
  },
  beforeUpdate: async (_id, input) => {
    return input;
  },
  afterUpdate: async (_user) => {},
  beforeDelete: async (_id) => {},
  afterDelete: async (_id) => {}
};
