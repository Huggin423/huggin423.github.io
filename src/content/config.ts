import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    coverImage: z.string().optional(),
    tags: z.array(z.string()),
    category: z.enum([
      'Paper Notes',
      'Tech Talk',
      'Fun Products',
      'Hobbies'
    ]),
  }),
});

export const collections = {
  'blog': blogCollection,
};
