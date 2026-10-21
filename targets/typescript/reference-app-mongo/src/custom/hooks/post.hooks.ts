export interface PostCreateInput {
  title: string;
  slug: string;
  content: string;
  authorId: string;
  published?: boolean;
  [key: string]: unknown;
}

export interface PostUpdateInput {
  title?: string;
  slug?: string;
  content?: string;
  published?: boolean;
  [key: string]: unknown;
}

export interface PostHooks {
  beforeCreate?: (input: PostCreateInput) => Promise<PostCreateInput> | PostCreateInput;
  afterCreate?: (post: Record<string, unknown>) => Promise<void> | void;
  beforeUpdate?: (id: string, input: PostUpdateInput) => Promise<PostUpdateInput> | PostUpdateInput;
  afterUpdate?: (post: Record<string, unknown>) => Promise<void> | void;
  beforeDelete?: (id: string) => Promise<void> | void;
  afterDelete?: (id: string) => Promise<void> | void;
}

/**
 * Custom hooks slot for Post entity.
 */
export const postHooks: PostHooks = {
  beforeCreate: async (input) => {
    return input;
  },
  afterCreate: async (_post) => {},
  beforeUpdate: async (_id, input) => {
    return input;
  },
  afterUpdate: async (_post) => {},
  beforeDelete: async (_id) => {},
  afterDelete: async (_id) => {}
};
